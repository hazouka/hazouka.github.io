import base64
import hmac
import http.server
import json
import os
import re
import socketserver
import time
import urllib.parse

PORT = int(os.environ.get("PORT", "8000"))
POSTS_FILE = "posts.json"
UPLOADS_DIR = "uploads"
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")


class BlogRequestHandler(http.server.SimpleHTTPRequestHandler):
    def _send_json(self, status_code, payload, extra_headers=None):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def _is_admin_configured(self):
        return bool(ADMIN_PASSWORD)

    def _read_basic_auth_credentials(self):
        auth_header = self.headers.get("Authorization", "")
        if not auth_header.startswith("Basic "):
            return None, None

        encoded = auth_header[6:].strip()
        try:
            decoded = base64.b64decode(encoded).decode("utf-8")
        except Exception:
            return None, None

        username, separator, password = decoded.partition(":")
        if not separator:
            return None, None
        return username, password

    def _is_admin_authenticated(self):
        username, password = self._read_basic_auth_credentials()
        if username is None or password is None:
            return False

        user_match = hmac.compare_digest(username, ADMIN_USERNAME)
        password_match = hmac.compare_digest(password, ADMIN_PASSWORD)
        return user_match and password_match

    def _require_admin(self):
        if not self._is_admin_configured():
            self._send_json(
                503,
                {"error": "Admin credentials are not configured on server."},
            )
            return False

        if not self._is_admin_authenticated():
            self._send_json(
                401,
                {"error": "Unauthorized"},
                {"WWW-Authenticate": 'Basic realm="Blog Admin"'},
            )
            return False

        return True

    def _load_posts(self):
        if not os.path.exists(POSTS_FILE):
            return []
        try:
            with open(POSTS_FILE, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                return loaded if isinstance(loaded, list) else []
        except Exception:
            return []

    def _save_posts(self, posts):
        with open(POSTS_FILE, "w", encoding="utf-8") as f:
            json.dump(posts, f, indent=4)

    def _parse_uploaded_image(self):
        content_type = self.headers.get("Content-Type", "")
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length)

        boundary_match = re.search(r"boundary=([^;]+)", content_type)
        if not boundary_match:
            raise ValueError("Missing multipart boundary")

        boundary = boundary_match.group(1).strip().strip('"').encode("utf-8")
        delimiter = b"--" + boundary

        for part in body.split(delimiter):
            if b"Content-Disposition" not in part or b'name="image"' not in part:
                continue

            part = part.strip()
            if not part or part == b"--":
                continue

            header_blob, separator, file_blob = part.partition(b"\r\n\r\n")
            if not separator:
                continue

            filename_match = re.search(br'filename="([^"]*)"', header_blob)
            filename = (
                filename_match.group(1).decode("utf-8", errors="ignore")
                if filename_match
                else "image.png"
            )
            file_bytes = file_blob.rstrip(b"\r\n-")

            if not file_bytes:
                raise ValueError("Empty image upload")

            return filename, file_bytes

        raise ValueError("Missing image file")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/posts":
            self._send_json(200, self._load_posts())
            return

        if self.path == "/api/admin/verify":
            if not self._require_admin():
                return
            self._send_json(200, {"admin": True, "username": ADMIN_USERNAME})
            return

        # fallback to static files
        return super().do_GET()

    def do_DELETE(self):
        if self.path.startswith("/api/posts/"):
            if not self._require_admin():
                return

            post_id = urllib.parse.unquote(self.path.replace("/api/posts/", "", 1))
            if not post_id:
                self._send_json(400, {"error": "Missing post id"})
                return

            posts = self._load_posts()
            initial_count = len(posts)
            posts = [p for p in posts if str(p.get("id", "")) != post_id]
            self._save_posts(posts)

            self._send_json(
                200,
                {
                    "success": True,
                    "deleted": len(posts) != initial_count,
                },
            )
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if self.path == "/api/upload-image":
            if not self._require_admin():
                return

            try:
                filename, file_bytes = self._parse_uploaded_image()
            except ValueError as exc:
                self._send_json(400, {"error": str(exc)})
                return

            safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", os.path.basename(filename or "image.png"))
            if "." not in safe_name:
                safe_name += ".png"

            os.makedirs(UPLOADS_DIR, exist_ok=True)
            stored_name = f"{int(time.time() * 1000)}_{safe_name}"
            stored_path = os.path.join(UPLOADS_DIR, stored_name)

            with open(stored_path, "wb") as f:
                f.write(file_bytes)

            self._send_json(201, {"success": True, "url": f"{UPLOADS_DIR}/{stored_name}"})
            return

        if self.path == "/api/posts":
            if not self._require_admin():
                return

            content_length = int(self.headers.get("Content-Length", "0"))
            post_data = self.rfile.read(content_length).decode("utf-8")

            try:
                new_post = json.loads(post_data)
            except json.JSONDecodeError:
                self._send_json(400, {"error": "Invalid JSON"})
                return

            posts = self._load_posts()
            if new_post.get("id"):
                updated = False
                for index, post in enumerate(posts):
                    if post.get("id") == new_post["id"]:
                        posts[index] = new_post
                        updated = True
                        break
                if not updated:
                    posts.insert(0, new_post)
            else:
                new_post["id"] = str(int(time.time() * 1000))
                posts.insert(0, new_post)

            self._save_posts(posts)
            self._send_json(201, {"success": True})
            return

        self.send_response(404)
        self.end_headers()


class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with ThreadingTCPServer(("", PORT), BlogRequestHandler) as httpd:
        print(f"Serving at http://localhost:{PORT}")
        if not ADMIN_PASSWORD:
            print("Warning: ADMIN_PASSWORD is not set. Write APIs are disabled until you configure it.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
