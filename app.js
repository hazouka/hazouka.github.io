        document.addEventListener("alpine:init", () => {
            const POSTS_KEY = "re-blog-posts-v1";
            const LEGACY_POSTS_KEY = "re-blog-posts";
            const DRAFT_KEY = "re-blog-draft-v1";
            const GITHUB_SETTINGS_KEY = "re-blog-github-settings-v1";
            const DELETED_IDS_KEY = "re-blog-deleted-ids-v1";

            Alpine.data("blogApp", () => ({
                posts: [],
                view: "home",
                editor: { id: null, title: "", content: "", tagsText: "", published: true, isDirty: false },
                reading: { id: null, title: "", content: "", date: "" },
                topicQuery: "",
                selectedTag: "",
                focusMode: false,
                saveMessage: "",
                saveMessageType: "ok",
                _saveTimer: null,
                _msgTimer: null,
                _previewTimer: null,
                _previewContent: "",
                previewHtml: "",
                imageAssets: {},
                imageGithubPaths: {},
                pendingImageUploads: {},
                selectedImageToken: "",
                selectedImageWidth: 100,
                lightboxOpen: false,
                lightboxSrc: "",
                showFormatGuide: false,
                readingActiveSection: 0,
                _readingScrollTimer: null,
                syncErrorMessage: "",
                githubToken: "",
                githubOwner: "",
                githubRepo: "",
                githubBranch: "main",
                githubPostsPath: "posts.json",
                githubUploadsDir: "uploads",
                confirmModal: {
                    show: false,
                    title: "",
                    message: "",
                    actionLabel: "",
                    _resolve: null,
                },

                emptyPreviewContent: `# Preview\n\nStart writing on the left.\n\n[[image:posts/example-post/images/example_post_image.png|alt=|width=70]]\n\n\`\`\`c\nHANDLE hProc = OpenProcess(\n    PROCESS_ALL_ACCESS, FALSE, pid);\n\`\`\`\n\n\`\`\`asm\nmov  rax, [rbp - 0x18]\nxor  eax, eax\nret\n\`\`\`\n\nInline: \`NTSTATUS\`, \`0xDEADBEEF\`\n`,

                get allTags() {
                    const tagSet = new Set();
                    const visible = this.isAdmin
                        ? this.posts
                        : this.posts.filter(p => p.published !== false);
                    visible.forEach(p => (p.tags || []).forEach(t => tagSet.add(t)));
                    return [...tagSet].sort();
                },

                get filteredPosts() {
                    let q = this.topicQuery.toLowerCase().trim();
                    let result = this.isAdmin
                        ? this.posts
                        : this.posts.filter(p => p.published !== false);
                    if (this.selectedTag) {
                        result = result.filter(p => (p.tags || []).includes(this.selectedTag));
                    }
                    if (q) {
                        result = result.filter(
                            (p) =>
                                (p.title || "").toLowerCase().includes(q) ||
                                (p.content || "").toLowerCase().includes(q) ||
                                (p.tags || []).some(t => t.toLowerCase().includes(q)),
                        );
                    }
                    return result;
                },

                get wordCount() {
                    return this.countWords(this.editor.content);
                },
                get readingTime() {
                    return Math.max(1, Math.round(this.wordCount / 200));
                },
                get isAdmin() {
                    return !!this.githubToken;
                },

                get tocItems() {
                    return this._toc(this.editor.content);
                },
                get readingToc() {
                    return this._toc(this.reading.content || "");
                },

                get relatedPosts() {
                    if (!this.reading || !this.reading.tags || !this.reading.tags.length) return [];
                    const currentTags = this.reading.tags;
                    const scored = this.posts
                        .filter(p => p.id !== this.reading.id && p.published !== false)
                        .map(p => {
                            const shared = (p.tags || []).filter(t => currentTags.includes(t)).length;
                            return { post: p, score: shared };
                        })
                        .filter(p => p.score > 0)
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 4);
                    return scored.map(s => s.post);
                },

                updateReadingProgress() {
                    if (this.view !== "reading") return;
                    clearTimeout(this._readingScrollTimer);
                    this._readingScrollTimer = setTimeout(() => {
                        const el = this.$refs.readingView;
                        if (!el) return;
                        const total = el.scrollHeight - el.clientHeight;
                        if (total <= 0) return;
                        const toc = this.readingToc;
                        if (!toc.length) return;
                        for (let i = toc.length - 1; i >= 0; i--) {
                            const h = el.querySelector("#" + toc[i].id);
                            if (h && el.scrollTop >= h.offsetTop - el.offsetTop - 200) {
                                this.readingActiveSection = i;
                                break;
                            }
                        }
                    }, 100);
                },

                closeLightbox() {
                    this.lightboxOpen = false;
                    this.lightboxSrc = "";
                },

                initMermaid() {
                    if (typeof mermaid === "undefined") return;
                    const els = document.querySelectorAll(".mermaid");
                    if (!els.length) return;
                    mermaid.run({ nodes: els }).catch(() => {});
                },

                expandDetailsSyntax(content) {
                    return (content || "").replace(
                        /^:::\s*details\s+(.+)$\n([\s\S]*?)\n^:::\s*$/gm,
                        "<details><summary>$1</summary>\n\n$2\n\n</details>"
                    );
                },

                _toc(content) {
                    const items = [];
                    const seen = {};
                    const re = /^(#{1,4})\s+(.+)$/gm;
                    let m;
                    while ((m = re.exec(content)) !== null) {
                        const text = m[2]
                            .replace(/\[(.*?)\]\(.*?\)/g, "$1")
                            .replace(/[*_`~]/g, "")
                            .trim();
                        const base = this.slugify(text) || "section";
                        seen[base] = (seen[base] || 0) + 1;
                        const id = `h-${base}${seen[base] > 1 ? "-" + seen[base] : ""}`;
                        items.push({ level: m[1].length, text, id });
                    }
                    return items;
                },

                async init() {
                    marked.setOptions({ breaks: true, gfm: true });
                    this.loadImageAssets();
                    this.loadImageGithubPaths();
                    this.restoreGithubSettings();
                    const cached = this.readLocalPosts();
                    this.posts = this.sortPosts(cached);
                    this.restoreDraft();
                    this.openPostFromUrl();
                    this.cleanupOrphanedAssets();
                    this._previewContent = this.editor.content;
                    this.previewHtml = this.renderMarkdown(this.editor.content || this.emptyPreviewContent);
                    this.validateGithubSession().finally(() => this.refreshPosts());
                },

                showConfirmModal(title, message, actionLabel = "Delete") {
                    return new Promise((resolve) => {
                        this.confirmModal = {
                            show: true,
                            title: title,
                            message: message,
                            actionLabel: actionLabel,
                            _resolve: resolve,
                        };
                    });
                },

                resolveConfirmModal(result) {
                    const resolveFn = this.confirmModal._resolve;
                    this.confirmModal = {
                        ...this.confirmModal,
                        show: false,
                        _resolve: null,
                    };
                    if (resolveFn) resolveFn(result);
                },

                inferGithubDefaults() {
                    const host = window.location.hostname || "";
                    const pathParts = window.location.pathname
                        .split("/")
                        .filter(Boolean);

                    if (host.endsWith(".github.io")) {
                        const owner = host.split(".")[0] || "";
                        const repo = pathParts[0] || `${owner}.github.io`;
                        return { owner, repo };
                    }

                    return {
                        owner: pathParts[0] || "",
                        repo: pathParts[1] || "",
                    };
                },

                restoreGithubSettings() {
                    const defaults = this.inferGithubDefaults();
                    let parsed = {};
                    try {
                        parsed =
                            JSON.parse(localStorage.getItem(GITHUB_SETTINGS_KEY) || "{}") ||
                            {};
                    } catch (e) {
                        parsed = {};
                    }

                    this.githubToken = parsed.token || "";
                    this.githubOwner = parsed.owner || defaults.owner || "";
                    this.githubRepo = parsed.repo || defaults.repo || "";
                    this.githubBranch = parsed.branch || "main";
                    this.githubPostsPath = String(
                        parsed.postsPath || "posts.json",
                    ).replace(/^\/+/, "");
                    this.githubUploadsDir = this.normalizeUploadsDir(
                        parsed.uploadsDir || "uploads",
                    );
                },

                saveGithubSettings() {
                    this.githubOwner = this.githubOwner.trim();
                    this.githubRepo = this.githubRepo.trim();
                    this.githubBranch = this.githubBranch.trim() || "main";
                    this.githubPostsPath =
                        String(this.githubPostsPath || "posts.json").replace(
                            /^\/+/,
                            "",
                        ) || "posts.json";
                    this.githubUploadsDir = this.normalizeUploadsDir(
                        this.githubUploadsDir || "uploads",
                    );
                    const payload = {
                        token: this.githubToken,
                        owner: this.githubOwner,
                        repo: this.githubRepo,
                        branch: this.githubBranch,
                        postsPath: this.githubPostsPath,
                        uploadsDir: this.githubUploadsDir,
                    };
                    localStorage.setItem(GITHUB_SETTINGS_KEY, JSON.stringify(payload));
                },

                normalizeUploadsDir(value) {
                    const cleaned = String(value || "uploads").replace(
                        /^\/+|\/+$/g,
                        "",
                    );
                    return cleaned || "uploads";
                },

                openAdminPage() {
                    window.location.href = "vault-9k3p-admin.html";
                },

                clearAdminSession() {
                    this.githubToken = "";
                    this.saveGithubSettings();
                    if (this.view === "editor") this.goHome({ skipDirtyCheck: true });
                },

                logoutAdmin() {
                    this.clearAdminSession();
                    this.showMsg("Admin session cleared", "ok");
                },

                requireAdminConfig() {
                    if (!this.isAdmin) {
                        this.syncErrorMessage =
                            "Admin login required. Open /vault-9k3p-admin.html first.";
                        this.showMsg("Open /vault-9k3p-admin.html first", "error");
                        return false;
                    }
                    if (!this.githubOwner || !this.githubRepo) {
                        this.syncErrorMessage =
                            "Missing GitHub owner/repo in admin settings.";
                        this.showMsg(
                            "Missing GitHub owner/repo in admin settings",
                            "error",
                        );
                        return false;
                    }
                    if (!this.githubPostsPath) {
                        this.syncErrorMessage =
                            "Missing posts JSON path in admin settings.";
                        this.showMsg(
                            "Missing posts JSON path in admin settings",
                            "error",
                        );
                        return false;
                    }
                    this.syncErrorMessage = "";
                    return true;
                },

                githubApiPath(path) {
                    const cleaned = String(path || "").replace(/^\/+/, "");
                    return cleaned.split("/").map(encodeURIComponent).join("/");
                },

                async githubRequest(path, options = {}) {
                    const method = options.method || "GET";
                    const headers = {
                        Accept: "application/vnd.github+json",
                        Authorization: `Bearer ${this.githubToken}`,
                        "X-GitHub-Api-Version": "2022-11-28",
                        ...(options.headers || {}),
                    };
                    const response = await fetch(`https://api.github.com${path}`, {
                        method,
                        headers,
                        body: options.body,
                    });
                    return response;
                },

                async readGithubErrorMessage(response) {
                    try {
                        const payload = await response.json();
                        return payload?.message ? String(payload.message) : "";
                    } catch (e) {
                        return "";
                    }
                },

                async validateGithubSession() {
                    if (!this.isAdmin) {
                        this.syncErrorMessage =
                            "Admin login required. Open /vault-9k3p-admin.html first.";
                        return;
                    }
                    if (!this.githubOwner || !this.githubRepo) {
                        this.syncErrorMessage =
                            "Missing GitHub owner/repo in admin settings.";
                        return;
                    }

                    try {
                        const repoRes = await this.githubRequest(
                            `/repos/${encodeURIComponent(this.githubOwner)}/${encodeURIComponent(this.githubRepo)}`,
                        );
                        if (repoRes.status === 401 || repoRes.status === 403) {
                            this.syncErrorMessage =
                                "GitHub token rejected. Re-login on secret admin page.";
                            this.clearAdminSession();
                            this.showMsg(
                                "GitHub token rejected. Re-login on secret admin page.",
                                "error",
                            );
                            return;
                        }
                        if (!repoRes.ok) {
                            const reason = await this.readGithubErrorMessage(repoRes);
                            this.syncErrorMessage =
                                reason || `GitHub repo check failed (${repoRes.status})`;
                            return;
                        }

                        const repoPayload = await repoRes.json();
                        const defaultBranch = repoPayload?.default_branch || "main";
                        if (!this.githubBranch) {
                            this.githubBranch = defaultBranch;
                            this.saveGithubSettings();
                        }

                        const branchRes = await this.githubRequest(
                            `/repos/${encodeURIComponent(this.githubOwner)}/${encodeURIComponent(this.githubRepo)}/branches/${encodeURIComponent(this.githubBranch)}`,
                        );
                        if (branchRes.status === 404) {
                            this.githubBranch = defaultBranch;
                            this.saveGithubSettings();
                            this.showMsg(
                                `Branch not found. Switched to ${defaultBranch}.`,
                                "ok",
                            );
                        } else if (
                            !branchRes.ok &&
                            branchRes.status !== 403 &&
                            branchRes.status !== 401
                        ) {
                            const reason = await this.readGithubErrorMessage(branchRes);
                            this.syncErrorMessage =
                                reason || `Branch check failed (${branchRes.status})`;
                            return;
                        }

                        this.syncErrorMessage = "";
                    } catch (e) {
                        this.syncErrorMessage = "GitHub settings check failed";
                    }
                },

                toBase64Utf8(value) {
                    return btoa(unescape(encodeURIComponent(value)));
                },

                async getFileSha(path) {
                    const encodedPath = this.githubApiPath(path);
                    const res = await this.githubRequest(
                        `/repos/${encodeURIComponent(this.githubOwner)}/${encodeURIComponent(this.githubRepo)}/contents/${encodedPath}?ref=${encodeURIComponent(this.githubBranch)}&t=${Date.now()}`,
                        { cache: "no-store" },
                    );
                    if (res.status === 404) return "";
                    if (!res.ok) throw new Error(`SHA fetch failed (${res.status})`);
                    const payload = await res.json();
                    return payload.sha || "";
                },

                async pushFileToGithub(path, contentText, commitMessage) {
                    if (!this.requireAdminConfig()) return false;
                    const encodedPath = this.githubApiPath(path);
                    const encodedContent = this.toBase64Utf8(contentText);

                    let retryRes;
                    for (let attempt = 0; attempt < 3; attempt++) {
                        const sha = await this.getFileSha(path);
                        const body = {
                            message: commitMessage,
                            content: encodedContent,
                            branch: this.githubBranch,
                        };
                        if (sha) body.sha = sha;
                        const res = await this.githubRequest(
                            `/repos/${encodeURIComponent(this.githubOwner)}/${encodeURIComponent(this.githubRepo)}/contents/${encodedPath}`,
                            {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(body),
                            },
                        );
                        if (res.status !== 409 && res.status !== 422) {
                            retryRes = res;
                            break;
                        }
                        retryRes = res;
                        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
                    }

                    if (retryRes.status === 401) {
                        this.syncErrorMessage =
                            "GitHub token rejected. Re-login on secret admin page.";
                        this.clearAdminSession();
                        this.showMsg(
                            "GitHub token rejected. Re-login on secret admin page.",
                            "error",
                        );
                        return false;
                    }
                    if (retryRes.status === 403) {
                        const reason = await this.readGithubErrorMessage(retryRes);
                        if (/bad credentials|expired/i.test(reason)) {
                            this.syncErrorMessage =
                                "GitHub token rejected. Re-login on secret admin page.";
                            this.clearAdminSession();
                            this.showMsg(
                                "GitHub token rejected. Re-login on secret admin page.",
                                "error",
                            );
                            return false;
                        }
                        this.syncErrorMessage = reason
                            ? `GitHub denied write: ${reason}`
                            : "GitHub denied write (403). Check token permissions.";
                        this.showMsg(
                            reason
                                ? `GitHub denied write: ${reason}`
                                : "GitHub denied write (403). Check token permissions.",
                            "error",
                        );
                        return false;
                    }
                    if (!retryRes.ok) {
                        const reason = await this.readGithubErrorMessage(retryRes);
                        this.syncErrorMessage = reason
                            ? `GitHub save failed: ${reason}`
                            : `GitHub save failed (${retryRes.status})`;
                        this.showMsg(this.syncErrorMessage, "error");
                        return false;
                    }
                    this.syncErrorMessage = "";
                    return true;
                },

                async pushBase64FileToGithub(path, base64Content, commitMessage) {
                    if (!this.requireAdminConfig()) return false;
                    const encodedPath = this.githubApiPath(path);

                    let retryRes;
                    for (let attempt = 0; attempt < 3; attempt++) {
                        const sha = await this.getFileSha(path);
                        const body = {
                            message: commitMessage,
                            content: base64Content,
                            branch: this.githubBranch,
                        };
                        if (sha) body.sha = sha;
                        const res = await this.githubRequest(
                            `/repos/${encodeURIComponent(this.githubOwner)}/${encodeURIComponent(this.githubRepo)}/contents/${encodedPath}`,
                            {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(body),
                            },
                        );
                        if (res.status !== 409 && res.status !== 422) {
                            retryRes = res;
                            break;
                        }
                        retryRes = res;
                        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
                    }

                    if (retryRes.status === 401) {
                        this.syncErrorMessage =
                            "GitHub token rejected. Re-login on secret admin page.";
                        this.clearAdminSession();
                        this.showMsg(
                            "GitHub token rejected. Re-login on secret admin page.",
                            "error",
                        );
                        return false;
                    }
                    if (retryRes.status === 403) {
                        const reason = await this.readGithubErrorMessage(retryRes);
                        if (/bad credentials|expired/i.test(reason)) {
                            this.syncErrorMessage =
                                "GitHub token rejected. Re-login on secret admin page.";
                            this.clearAdminSession();
                            this.showMsg(
                                "GitHub token rejected. Re-login on secret admin page.",
                                "error",
                            );
                            return false;
                        }
                        this.syncErrorMessage = reason
                            ? `GitHub denied upload: ${reason}`
                            : "GitHub denied upload (403). Check token permissions.";
                        this.showMsg(
                            reason
                                ? `GitHub denied upload: ${reason}`
                                : "GitHub denied upload (403). Check token permissions.",
                            "error",
                        );
                        return false;
                    }
                    if (!retryRes.ok) {
                        const reason = await this.readGithubErrorMessage(retryRes);
                        this.syncErrorMessage = reason
                            ? `GitHub upload failed: ${reason}`
                            : `GitHub upload failed (${retryRes.status})`;
                        this.showMsg(this.syncErrorMessage, "error");
                        return false;
                    }
                    this.syncErrorMessage = "";
                    return true;
                },

                async atomicGithubCommit(files, message) {
                    if (!this.requireAdminConfig()) return false;
                    const owner = encodeURIComponent(this.githubOwner);
                    const repo = encodeURIComponent(this.githubRepo);
                    const branch = encodeURIComponent(this.githubBranch);

                    try {
                        const [treeItems, refInfo] = await Promise.all([
                            Promise.all(
                                files.map(async (f) => {
                                    const blobRes = await this.githubRequest(
                                        `/repos/${owner}/${repo}/git/blobs`,
                                        {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({
                                                content: f.content,
                                                encoding: f.encoding || "utf-8",
                                            }),
                                        },
                                    );
                                    if (!blobRes.ok)
                                        throw new Error(
                                            `Blob failed for ${f.path} (${blobRes.status})`,
                                        );
                                    const blobData = await blobRes.json();
                                    return {
                                        path: f.path,
                                        mode: "100644",
                                        type: "blob",
                                        sha: blobData.sha,
                                    };
                                }),
                            ),
                            (async () => {
                                const refRes = await this.githubRequest(
                                    `/repos/${owner}/${repo}/git/ref/heads/${branch}`,
                                );
                                if (!refRes.ok)
                                    throw new Error(`Ref fetch failed (${refRes.status})`);
                                const refData = await refRes.json();
                                const commitSha = refData.object.sha;
                                const commitRes = await this.githubRequest(
                                    `/repos/${owner}/${repo}/git/commits/${commitSha}`,
                                );
                                if (!commitRes.ok)
                                    throw new Error(
                                        `Commit fetch failed (${commitRes.status})`,
                                    );
                                const commitData = await commitRes.json();
                                return { commitSha, treeSha: commitData.tree.sha };
                            })(),
                        ]);

                        const treeRes = await this.githubRequest(
                            `/repos/${owner}/${repo}/git/trees`,
                            {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    base_tree: refInfo.treeSha,
                                    tree: treeItems,
                                }),
                            },
                        );
                        if (!treeRes.ok)
                            throw new Error(`Tree creation failed (${treeRes.status})`);
                        const treeData = await treeRes.json();

                        const newCommitRes = await this.githubRequest(
                            `/repos/${owner}/${repo}/git/commits`,
                            {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    message,
                                    tree: treeData.sha,
                                    parents: [refInfo.commitSha],
                                }),
                            },
                        );
                        if (!newCommitRes.ok)
                            throw new Error(
                                `Commit creation failed (${newCommitRes.status})`,
                            );
                        const newCommitData = await newCommitRes.json();

                        const updateRes = await this.githubRequest(
                            `/repos/${owner}/${repo}/git/refs/heads/${branch}`,
                            {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ sha: newCommitData.sha }),
                            },
                        );
                        if (!updateRes.ok)
                            throw new Error(`Ref update failed (${updateRes.status})`);

                        this.syncErrorMessage = "";
                        return true;
                    } catch (e) {
                        this.syncErrorMessage = e.message || "Atomic commit failed";
                        this.showMsg(this.syncErrorMessage, "error");
                        return false;
                    }
                },

                get imageAssetsKey() {
                    return "re-blog-image-assets-v1";
                },

                loadImageAssets() {
                    try {
                        const raw = localStorage.getItem(this.imageAssetsKey) || "{}";
                        const parsed = JSON.parse(raw);
                        this.imageAssets =
                            parsed && typeof parsed === "object" ? parsed : {};
                    } catch (e) {
                        this.imageAssets = {};
                    }
                },

                saveImageAssets() {
                    localStorage.setItem(
                        this.imageAssetsKey,
                        JSON.stringify(this.imageAssets),
                    );
                },

                get imageGithubPathsKey() {
                    return "re-blog-image-github-paths-v1";
                },

                loadImageGithubPaths() {
                    try {
                        const raw =
                            localStorage.getItem(this.imageGithubPathsKey) || "{}";
                        const parsed = JSON.parse(raw);
                        this.imageGithubPaths =
                            parsed && typeof parsed === "object" ? parsed : {};
                    } catch (e) {
                        this.imageGithubPaths = {};
                    }
                },

                saveImageGithubPaths() {
                    localStorage.setItem(
                        this.imageGithubPathsKey,
                        JSON.stringify(this.imageGithubPaths),
                    );
                },

                cleanupOrphanedAssets() {
                    for (const [id, ghPath] of Object.entries(
                        this.imageGithubPaths || {},
                    )) {
                        if (this.imageAssets[id]) {
                            let url = "";
                            try {
                                url = new URL(ghPath, window.location.href).href;
                            } catch (e) {
                                continue;
                            }

                            fetch(url, { method: "HEAD", cache: "no-store" })
                                .then((res) => {
                                    if (res.ok) {
                                        delete this.imageAssets[id];
                                        this.saveImageAssets();
                                    }
                                })
                                .catch(() => { });
                        }
                    }
                },

                getAssetIdFromPath(path) {
                    for (const [id, ghPath] of Object.entries(
                        this.imageGithubPaths || {},
                    )) {
                        if (ghPath === path) return id;
                    }
                    return null;
                },

                substituteGithubPaths(content) {
                    return (content || "").replace(
                        /asset:([a-z0-9_]+)/g,
                        (match, assetId) => {
                            return this.imageGithubPaths[assetId]
                                ? this.imageGithubPaths[assetId]
                                : match;
                        },
                    );
                },

                normalizeLang(lang) {
                    const l = (lang || "").toLowerCase();
                    if (l === "asm" || l === "assembly") return "x86asm";
                    if (l === "ps1") return "powershell";
                    return l;
                },

                slugify(text) {
                    return (text || "")
                        .toLowerCase()
                        .replace(/[^\w\s-]/g, "")
                        .trim()
                        .replace(/\s+/g, "-")
                        .replace(/-+/g, "-");
                },

                createImageToken(source, alt, width = 100) {
                    const safeAlt = String(alt || "").replace(/[|\]]/g, "-");
                    const safeWidth = Math.max(25, Math.min(100, Number(width) || 100));
                    return `[[image:${source}|alt=${safeAlt}|width=${safeWidth}]]`;
                },

                parseImageToken(token) {
                    const match =
                        /^\[\[image:(.+?)\|alt=(.*?)\|width=(\d{1,3})\]\]$/.exec(
                            (token || "").trim(),
                        );
                    if (!match) return null;
                    return {
                        source: match[1],
                        alt: match[2] || "",
                        width: Math.max(25, Math.min(100, Number(match[3]) || 100)),
                        token: match[0],
                    };
                },

                resolveImageSource(source) {
                    if (!source) return "";
                    if (source.startsWith("asset:")) {
                        const assetId = source.slice("asset:".length);
                        if (this.imageAssets[assetId]) return this.imageAssets[assetId];
                        const ghPath = this.imageGithubPaths[assetId];
                        if (ghPath) return this.resolveImageSource(ghPath);
                        return "";
                    }
                    if (
                        source.startsWith("http://") ||
                        source.startsWith("https://") ||
                        source.startsWith("data:")
                    ) {
                        return source;
                    }
                    try {
                        return new URL(source, window.location.href).href;
                    } catch (e) {
                        return source;
                    }
                },

                renderHexDump(hexStr, startOffset = 0) {
                    const bytes = hexStr.replace(/\s+/g, "");
                    if (!/^[0-9a-fA-F]+$/.test(bytes) || bytes.length % 2 !== 0) {
                        return `<div class="hex-error">Invalid hex data</div>`;
                    }
                    let html = `<table class="hex-dump"><thead><tr><th class="hex-offset-hdr">Offset</th>`;
                    for (let i = 0; i < 16; i++) {
                        html += `<th class="hex-col-hdr">${i.toString(16).toUpperCase().padStart(2, "0")}</th>`;
                    }
                    html += `<th class="hex-ascii-hdr">ASCII</th></tr></thead><tbody>`;
                    let offset = startOffset;
                    for (let i = 0; i < bytes.length; i += 32) {
                        const rowBytes = bytes.slice(i, i + 32);
                        html += `<tr><td class="hex-offset">${offset.toString(16).toUpperCase().padStart(8, "0")}</td>`;
                        let ascii = "";
                        for (let j = 0; j < 32; j += 2) {
                            if (j < rowBytes.length) {
                                const byte = rowBytes.slice(j, j + 2);
                                html += `<td class="hex-byte">${byte.toUpperCase()}</td>`;
                                const charCode = parseInt(byte, 16);
                                ascii += (charCode >= 0x20 && charCode <= 0x7e) ? String.fromCharCode(charCode) : ".";
                            } else {
                                html += `<td class="hex-byte hex-empty"></td>`;
                            }
                        }
                        html += `<td class="hex-ascii"><span class="hex-ascii-inner">${ascii}</span></td></tr>`;
                        offset += 16;
                    }
                    html += "</tbody></table>";
                    return html;
                },

                expandHexTokens(content) {
                    return (content || "").replace(
                        /\[\[hex:(?:offset=0x([0-9a-fA-F]+)\|)?([0-9a-fA-F\s]+)\]\]/g,
                        (match, offsetStr, hexData) => {
                            const offset = offsetStr ? parseInt(offsetStr, 16) : 0;
                            return this.renderHexDump(hexData, offset);
                        }
                    );
                },

                expandImageTokens(content) {
                    return (content || "").replace(
                        /\[\[image:.+?\|alt=.*?\|width=\d{1,3}\]\]/g,
                        (token) => {
                            const parsed = this.parseImageToken(token);
                            if (!parsed) return token;
                            const src = this.resolveImageSource(parsed.source);
                            if (!src) return `<p class="image-missing">Missing image</p>`;

                            let fallbackAssetId = "";
                            if (!parsed.source.startsWith("asset:")) {
                                const id = this.getAssetIdFromPath(parsed.source);
                                if (id) fallbackAssetId = id;
                            } else {
                                fallbackAssetId = parsed.source.slice(6);
                            }

                            const escapedAlt = parsed.alt.replace(/"/g, "&quot;");
                            const caption = escapedAlt
                                ? `<figcaption>${escapedAlt}</figcaption>`
                                : "";

                            let onerrorHtml = "";
                            if (fallbackAssetId) {
                                onerrorHtml = ` onerror="if(!this.dataset.triedFallback) { this.dataset.triedFallback=true; const d = JSON.parse(localStorage.getItem('${this.imageAssetsKey}')||'{}'); if(d['${fallbackAssetId}']) this.src = d['${fallbackAssetId}']; }"`;
                            }

                            return `<figure class="md-image-wrap" data-image-token="${encodeURIComponent(parsed.token)}"><img src="${src}" alt="${escapedAlt}" style="width:${parsed.width}%"${onerrorHtml}>${caption}</figure>`;
                        },
                    );
                },

                renderMarkdown(t) {
                    let raw = t || "";
                    raw = this.expandDetailsSyntax(raw);
                    raw = this.expandHexTokens(raw);
                    raw = this.expandImageTokens(raw);
                    const html = marked.parse(raw);
                    const temp = document.createElement("div");
                    temp.innerHTML = html;

                    const seen = {};
                    temp.querySelectorAll("h1,h2,h3,h4").forEach((h) => {
                        const base = this.slugify(h.textContent) || "section";
                        seen[base] = (seen[base] || 0) + 1;
                        h.id = `h-${base}${seen[base] > 1 ? "-" + seen[base] : ""}`;
                    });

                    temp.querySelectorAll("blockquote").forEach((bq) => {
                        const p = bq.querySelector("p");
                        if (!p) return;
                        const m = p.textContent.match(/^\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\s*/i);
                        if (!m) return;
                        const type = m[1].toLowerCase();
                        p.textContent = p.textContent.replace(/^\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\s*/i, "");
                        const div = document.createElement("div");
                        div.className = `callout callout-${type}`;
                        div.setAttribute("data-type", m[1]);
                        while (bq.firstChild) div.appendChild(bq.firstChild);
                        if (!p.textContent.trim() && !p.children.length) p.remove();
                        bq.replaceWith(div);
                    });

                    temp.querySelectorAll("pre code").forEach((codeEl) => {
                        const preEl = codeEl.parentNode;
                        const match = (codeEl.className || "").match(/language-([\w-]+)/);
                        const lang = this.normalizeLang(match ? match[1] : "");
                        if (lang) preEl.dataset.lang = lang;

                        const code = codeEl.textContent || "";

                        if (lang === "mermaid" && this.view === "reading") {
                            const mermaidDiv = document.createElement("div");
                            mermaidDiv.className = "mermaid";
                            mermaidDiv.textContent = code;
                            preEl.replaceWith(mermaidDiv);
                            return;
                        }

                        const btn = document.createElement("button");
                        btn.className = "copy-code-btn";
                        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                        preEl.appendChild(btn);

                        codeEl.dataset.code = code;
                        try {
                            if (lang && hljs.getLanguage(lang)) {
                                codeEl.innerHTML = hljs.highlight(code, {
                                    language: lang,
                                }).value;
                                codeEl.classList.add("hljs");
                            } else {
                                codeEl.innerHTML = hljs.highlightAuto(code).value;
                                codeEl.classList.add("hljs");
                            }
                        } catch (e) {
                            codeEl.textContent = code;
                            codeEl.classList.add("hljs");
                        }

                        const lines = codeEl.innerHTML.split("\n");
                        if (lines.length > 1) {
                            const last = lines[lines.length - 1];
                            if (last.trim() === "") lines.pop();
                            codeEl.innerHTML = lines.join("\n");
                        }
                    });

                    return temp.innerHTML;
                },

                readLocalPosts() {
                    try {
                        const raw =
                            localStorage.getItem(POSTS_KEY) ??
                            localStorage.getItem(LEGACY_POSTS_KEY) ??
                            "[]";
                        const parsed = JSON.parse(raw);
                        return Array.isArray(parsed) ? parsed : [];
                    } catch (e) {
                        return [];
                    }
                },

                writeLocalPosts(posts) {
                    localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
                },

                sortPosts(posts) {
                    return [...posts].sort((a, b) => {
                        const ai = Number(a.id || 0);
                        const bi = Number(b.id || 0);
                        if (!Number.isNaN(ai) && !Number.isNaN(bi) && ai !== bi)
                            return bi - ai;
                        return String(b.date || "").localeCompare(String(a.date || ""));
                    });
                },

                mergePosts(localPosts, serverPosts) {
                    const deleted = this.readDeletedIds();
                    const map = new Map();
                    (serverPosts || []).forEach((p) => {
                        if (!deleted.has(String(p.id))) map.set(String(p.id), p);
                    });
                    (localPosts || []).forEach((p) => {
                        if (!deleted.has(String(p.id))) map.set(String(p.id), p);
                    });
                    return this.sortPosts(Array.from(map.values()));
                },

                readDeletedIds() {
                    try {
                        const raw = localStorage.getItem(DELETED_IDS_KEY);
                        if (!raw) return new Set();
                        const parsed = JSON.parse(raw);
                        return new Set(Array.isArray(parsed) ? parsed : []);
                    } catch (e) {
                        return new Set();
                    }
                },

                addDeletedId(id) {
                    const ids = this.readDeletedIds();
                    ids.add(String(id));
                    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify([...ids]));
                },

                removeDeletedId(id) {
                    const ids = this.readDeletedIds();
                    ids.delete(String(id));
                    if (ids.size === 0) {
                        localStorage.removeItem(DELETED_IDS_KEY);
                    } else {
                        localStorage.setItem(DELETED_IDS_KEY, JSON.stringify([...ids]));
                    }
                },

                async syncPostToServer(post) {
                    try {
                        if (!this.isAdmin) {
                            this.syncErrorMessage =
                                "Admin login required. Open /vault-9k3p-admin.html first.";
                            return false;
                        }
                        const postsForStorage = this.posts.map((p) => ({
                            ...p,
                            content: this.substituteGithubPaths(p.content),
                        }));
                        const content = JSON.stringify(postsForStorage, null, 4);
                        const message =
                            post && post.id
                                ? "Update post " + post.id
                                : "Update blog posts";
                        return await this.pushFileToGithub(
                            this.githubPostsPath,
                            content,
                            message,
                        );
                    } catch (e) {
                        this.syncErrorMessage = "Failed to sync posts to GitHub";
                        this.showMsg("Failed to sync posts to GitHub", "error");
                        return false;
                    }
                },

                async deleteFileFromGithub(filePath) {
                    if (!this.isAdmin) return;
                    const encodedPath = this.githubApiPath(filePath);
                    const getRes = await this.githubRequest(
                        "/repos/" +
                        encodeURIComponent(this.githubOwner) +
                        "/" +
                        encodeURIComponent(this.githubRepo) +
                        "/contents/" +
                        encodedPath +
                        "?ref=" +
                        encodeURIComponent(this.githubBranch),
                    );
                    if (!getRes.ok) return;
                    const fileData = await getRes.json();
                    if (!fileData || !fileData.sha) return;
                    await this.githubRequest(
                        "/repos/" +
                        encodeURIComponent(this.githubOwner) +
                        "/" +
                        encodeURIComponent(this.githubRepo) +
                        "/contents/" +
                        encodedPath,
                        {
                            method: "DELETE",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                message: "Delete image " + filePath.split("/").pop(),
                                sha: fileData.sha,
                                branch: this.githubBranch,
                            }),
                        },
                    );
                },

                async deletePostFromServer(id, post = null) {
                    try {
                        if (!this.isAdmin) {
                            this.syncErrorMessage =
                                "Admin login required. Open /vault-9k3p-admin.html first.";
                            return false;
                        }
                        const postsForStorage = this.posts.map((p) => ({
                            ...p,
                            content: this.substituteGithubPaths(p.content),
                        }));
                        const postsContent = JSON.stringify(postsForStorage, null, 4);
                        const jsonOk = await this.pushFileToGithub(
                            this.githubPostsPath,
                            postsContent,
                            "Delete post " + id,
                        );

                        // Delete all images referenced in the post content
                        if (post && post.content) {
                            const refs = [...post.content.matchAll(/\[\[image:(.+?)\|alt=/g)];
                            const paths = refs.map((m) => m[1]).filter((p) => !p.startsWith("asset:"));
                            for (const path of paths) {
                                await this.deleteFileFromGithub(path).catch(() => { });
                            }
                        }

                        // Delete post's image directories (both old ID-based and new slug-based)
                        this.deletePostFolderFromGithub("posts/" + id + "/images").catch(() => { });
                        if (post) {
                            const slug = this.slugify(post.title);
                            if (slug) {
                                this.deletePostFolderFromGithub("posts/" + slug + "/images").catch(() => { });
                            }
                        }

                        return jsonOk;
                    } catch (e) {
                        this.syncErrorMessage = "Failed to sync delete to GitHub";
                        this.showMsg("Failed to sync delete to GitHub", "error");
                        return false;
                    }
                },

                async deletePostFolderFromGithub(folderPath) {
                    const encodedPath = this.githubApiPath(folderPath);
                    const res = await this.githubRequest(
                        "/repos/" +
                        encodeURIComponent(this.githubOwner) +
                        "/" +
                        encodeURIComponent(this.githubRepo) +
                        "/contents/" +
                        encodedPath +
                        "?ref=" +
                        encodeURIComponent(this.githubBranch),
                    );
                    if (!res.ok) return;
                    const files = await res.json();
                    if (!Array.isArray(files)) return;
                    for (const file of files) {
                        if (file.type === "file" && file.sha) {
                            await this.githubRequest(
                                "/repos/" +
                                encodeURIComponent(this.githubOwner) +
                                "/" +
                                encodeURIComponent(this.githubRepo) +
                                "/contents/" +
                                this.githubApiPath(file.path),
                                {
                                    method: "DELETE",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        message: "Delete image " + file.name,
                                        sha: file.sha,
                                        branch: this.githubBranch,
                                    }),
                                },
                            );
                        }
                    }
                },

                async uploadImageToServer(file, slug) {
                    if (!this.isAdmin) throw new Error("Admin session missing");
                    const dataUrl = await this.readFileAsDataUrl(file);
                    const parts = String(dataUrl || "").split(",", 2);
                    const base64Content = parts.length === 2 ? parts[1] : "";
                    if (!base64Content) throw new Error("Image read failed");

                    const originalName = file.name || "image.png";
                    const safeName = originalName.replace(/[^A-Za-z0-9._-]/g, "_");
                    const s = slug || this.slugify(this.editor.title) || "post-" + Date.now();
                    const storedPath =
                        "posts/" + s + "/images/" + s + "_" + safeName;
                    const ok = await this.pushBase64FileToGithub(
                        storedPath,
                        base64Content,
                        "Upload image " + safeName,
                    );
                    if (!ok) throw new Error("GitHub upload failed");
                    return { url: storedPath };
                },

                readFileAsDataUrl(file) {
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = () =>
                            reject(reader.error || new Error("Failed to read image"));
                        reader.readAsDataURL(file);
                    });
                },

                insertAtCursor(snippet) {
                    const ta = this.$refs.editorTextarea;
                    if (!ta) return;
                    const s = ta.selectionStart ?? 0;
                    const e = ta.selectionEnd ?? s;
                    const value = this.editor.content || "";
                    this.editor.content = value.slice(0, s) + snippet + value.slice(e);
                    this.markDirty();
                    this.queueDraftSave();
                    this.queuePreviewRender();
                    this.$nextTick(() => {
                        const pos = s + snippet.length;
                        ta.focus();
                        ta.setSelectionRange(pos, pos);
                    });
                },

                clearSelectedImageToken() {
                    this.selectedImageToken = "";
                    this.selectedImageWidth = 100;
                },

                handlePreviewClick(event) {
                    const copyBtn = event.target.closest(".copy-code-btn");
                    if (copyBtn) {
                        const codeEl = copyBtn.parentNode.querySelector("code");
                        if (codeEl) {
                            const textToCopy = codeEl.dataset.code || codeEl.textContent;

                            const performCopy = () => {
                                return new Promise((resolve, reject) => {
                                    const ta = document.createElement("textarea");
                                    ta.value = textToCopy;
                                    ta.style.position = "fixed";
                                    ta.style.left = "-9999px";
                                    ta.style.top = "-9999px";
                                    document.body.appendChild(ta);
                                    ta.focus();
                                    ta.select();
                                    let success = false;
                                    try {
                                        success = document.execCommand("copy");
                                    } catch (e) { }
                                    document.body.removeChild(ta);

                                    if (success) {
                                        resolve();
                                    } else if (navigator.clipboard) {
                                        navigator.clipboard.writeText(textToCopy).then(resolve).catch(reject);
                                    } else {
                                        reject();
                                    }
                                });
                            };

                            performCopy().then(() => {
                                const orig = copyBtn.innerHTML;
                                copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                                copyBtn.classList.add("copy-done");
                                setTimeout(() => {
                                    copyBtn.innerHTML = orig;
                                    copyBtn.classList.remove("copy-done");
                                }, 1400);
                                this.showCopyToast("Copied!");
                            }).catch(() => {
                                alert("Failed to copy code. Your browser might be blocking the clipboard.");
                            });
                        }
                        return;
                    }

                    const img = event.target.closest(".md-image-wrap img");
                    if (img) {
                        const src = img.getAttribute("src") || "";
                        if (src && !src.startsWith("data:")) {
                            this.lightboxSrc = src;
                            this.lightboxOpen = true;
                        }
                        return;
                    }

                    const figure = event.target.closest("[data-image-token]");
                    if (!figure) {
                        if (this.view === "editor") this.clearSelectedImageToken();
                        return;
                    }
                    const token = decodeURIComponent(figure.dataset.imageToken || "");
                    const parsed = this.parseImageToken(token);
                    if (!parsed) return;
                    this.selectedImageToken = token;
                    this.selectedImageWidth = parsed.width;
                },

                updateSelectedImageWidth(widthValue) {
                    if (!this.selectedImageToken) return;
                    const parsed = this.parseImageToken(this.selectedImageToken);
                    if (!parsed) return;
                    const nextToken = this.createImageToken(
                        parsed.source,
                        parsed.alt,
                        widthValue,
                    );
                    if (nextToken === this.selectedImageToken) return;
                    this.editor.content = this.editor.content.replace(
                        this.selectedImageToken,
                        nextToken,
                    );
                    this.selectedImageToken = nextToken;
                    this.selectedImageWidth = Math.max(
                        25,
                        Math.min(100, Number(widthValue) || 100),
                    );
                    this.markDirty();
                    this.queueDraftSave();
                    this.queuePreviewRender();
                },

                compressImage(file, maxWidth = 1920, quality = 0.8) {
                    return new Promise((resolve) => {
                        if (
                            !file.type ||
                            file.type === "image/svg+xml" ||
                            file.type === "image/gif"
                        ) {
                            resolve(file);
                            return;
                        }

                        const img = new Image();
                        img.onload = () => {
                            let w = img.naturalWidth,
                                h = img.naturalHeight;

                            if (w > maxWidth) {
                                h = Math.round(h * (maxWidth / w));
                                w = maxWidth;
                            }

                            const canvas = document.createElement("canvas");
                            canvas.width = w;
                            canvas.height = h;
                            const ctx = canvas.getContext("2d");
                            ctx.drawImage(img, 0, 0, w, h);

                            const tryFormat = (fmt, q) => {
                                canvas.toBlob(
                                    (blob) => {
                                        if (!blob || blob.size >= file.size) {
                                            if (fmt === "image/webp") {
                                                tryFormat("image/jpeg", q);
                                                return;
                                            }
                                            resolve(file);
                                            return;
                                        }
                                        const ext = blob.type === "image/webp" ? ".webp" : ".jpg";
                                        const name =
                                            (file.name || "image").replace(/\.[^.]+$/, "") + ext;
                                        resolve(new File([blob], name, { type: blob.type }));
                                    },
                                    fmt,
                                    q,
                                );
                            };
                            tryFormat("image/webp", quality);

                            URL.revokeObjectURL(img.src);
                        };
                        img.onerror = () => {
                            URL.revokeObjectURL(img.src);
                            resolve(file);
                        };
                        img.src = URL.createObjectURL(file);
                    });
                },

                async insertImageMarkdown(file) {
                    if (!file || !file.type || !file.type.startsWith("image/")) return;

                    const alt = file.name ? file.name.replace(/\.[^.]+$/, "") : "";

                    const compressed = await this.compressImage(file);

                    const assetId = "img_" + Date.now();
                    const dataUrl = await this.readFileAsDataUrl(compressed);
                    this.imageAssets[assetId] = dataUrl;
                    this.saveImageAssets();

                    this.pendingImageUploads[assetId] = compressed;

                    const token = this.createImageToken("asset:" + assetId, alt, 100);
                    this.insertAtCursor("\n" + token + "\n");

                    const savedKB =
                        file.size > compressed.size
                            ? ` (${Math.round(file.size / 1024)}KB â†’ ${Math.round(compressed.size / 1024)}KB)`
                            : "";
                    this.showMsg(
                        "Image added" + savedKB + " â€” will upload on Save",
                        "ok",
                    );
                },

                async handleImageUpload(event) {
                    const file = event.target.files && event.target.files[0];
                    if (!file) return;
                    await this.insertImageMarkdown(file);
                    event.target.value = "";
                },

                async handleEditorPaste(event) {
                    if (this.view !== "editor") return;
                    if (event.defaultPrevented) return;
                    const items = Array.from(event.clipboardData?.items || []);
                    const imageItem = items.find(
                        (item) => item.type && item.type.startsWith("image/"),
                    );
                    const fromItem = imageItem ? imageItem.getAsFile() : null;
                    const fromFiles = Array.from(event.clipboardData?.files || []).find(
                        (file) => file?.type?.startsWith("image/"),
                    );
                    const file = fromItem || fromFiles;
                    if (!file) return;

                    event.preventDefault();
                    event.stopPropagation?.();
                    await this.insertImageMarkdown(file);
                },

                loadDraft() {
                    try {
                        const raw = localStorage.getItem(DRAFT_KEY);
                        if (!raw) return null;
                        const d = JSON.parse(raw);
                        if (!d || typeof d !== "object") return null;
                        return d;
                    } catch (e) {
                        return null;
                    }
                },

                saveDraft() {
                    if (this.view !== "editor") return;
                    const draft = {
                        id: this.editor.id || null,
                        title: this.editor.title || "",
                        content: this.editor.content || "",
                        tagsText: this.editor.tagsText || "",
                        published: this.editor.published,
                        selectedImageToken: this.selectedImageToken || "",
                        updatedAt: new Date().toISOString(),
                    };
                    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
                },

                restoreDraft() {
                    if (!this.isAdmin) return;
                    const d = this.loadDraft();
                    if (!d) return;
                    if (!d.title.trim() && !d.content.trim()) return;
                    this.editor = {
                        id: d.id || null,
                        title: d.title || "",
                        content: d.content || "",
                        tagsText: d.tagsText || "",
                        published: d.published !== false,
                        isDirty: true,
                    };
                    this.selectedImageToken = d.selectedImageToken || "";
                },

                clearDraft() {
                    localStorage.removeItem(DRAFT_KEY);
                    this.clearSelectedImageToken();
                },

                async fetchPostsViaApi() {
                    const owner = this.githubOwner;
                    const repo = this.githubRepo;
                    const branch = this.githubBranch || "main";
                    if (!owner || !repo) return null;

                    const encodedPath = this.githubApiPath(this.githubPostsPath);
                    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

                    const headers = {
                        Accept: "application/vnd.github.raw+json",
                        "X-GitHub-Api-Version": "2022-11-28",
                    };
                    if (this.githubToken) {
                        headers.Authorization = `Bearer ${this.githubToken}`;
                    }

                    const res = await fetch(url, { headers, cache: "no-store" });
                    if (!res.ok) return null;

                    const posts = await res.json();
                    return Array.isArray(posts) ? posts : null;
                },

                loadLocalPosts() {
                    this.posts = this.sortPosts(this.readLocalPosts());
                },

                syncReadingView() {
                    if (this.view === "reading" && this.reading?.id) {
                        const fresh = this.posts.find(p => String(p.id) === String(this.reading.id));
                        if (fresh) this.reading = { ...fresh };
                    }
                },

                async refreshPosts() {
                    try {
                        const apiPosts = await this.fetchPostsViaApi();
                        if (apiPosts) {
                            this.posts = this.sortPosts(apiPosts);
                            this.writeLocalPosts(this.posts);
                            this.syncReadingView();
                            return;
                        }
                    } catch (e) {}
                    try {
                        const postsUrl = new URL(this.githubPostsPath, window.location.href);
                        postsUrl.searchParams.set("t", String(Date.now()));
                        const res = await fetch(postsUrl.toString(), { cache: "no-store" });
                        if (!res.ok) return;
                        const remotePosts = await res.json();
                        if (Array.isArray(remotePosts)) {
                            const merged = this.mergePosts(this.posts, remotePosts);
                            this.posts = merged;
                            this.writeLocalPosts(merged);
                            this.syncReadingView();
                        }
                    } catch (e) {}
                },

                savePosts() {
                    this.writeLocalPosts(this.posts);
                },

                stripImageTokens(c) {
                    return (c || "").replace(
                        /\[\[image:.+?\|alt=(.*?)\|width=\d{1,3}\]\]/g,
                        " $1 ",
                    );
                },

                countWords(c) {
                    return this.stripImageTokens(c).trim().split(/\s+/).filter(Boolean)
                        .length;
                },

                getExcerpt(c) {
                    return this.stripImageTokens(c)
                        .replace(/[#*_`>~\[\]!|]/g, "")
                        .replace(/\n+/g, " ")
                        .trim()
                        .slice(0, 160);
                },

                buildPostUrl(postId) {
                    const post = postId
                        ? this.posts.find((p) => String(p.id) === String(postId))
                        : null;
                    const slug = post && post.title ? this.slugify(post.title) : "";
                    const base = window.location.origin + window.location.pathname;
                    return slug ? base + slug : base;
                },

                updatePostUrl(postId) {
                    const url = this.buildPostUrl(postId || "");
                    window.history.replaceState({}, "", url);
                },

                openPostFromUrl() {
                    const url = new URL(window.location.href);
                    let postIdOrSlug = url.searchParams.get("post");
                    if (!postIdOrSlug) {
                        const path = url.pathname.replace(/\/+$/, "");
                        const parts = path.split("/").filter(Boolean);
                        if (parts.length > 1) {
                            postIdOrSlug = parts[parts.length - 1];
                        }
                    }
                    if (!postIdOrSlug) return;

                    let post = this.posts.find(
                        (p) => String(p.id) === String(postIdOrSlug),
                    );
                    if (!post) {
                        post = this.posts.find(
                            (p) => this.slugify(p.title) === postIdOrSlug,
                        );
                    }
                    if (!post) return;

                    this.reading = { ...post };
                    this.view = "reading";
                    this.focusMode = false;
                },

                async copyReadingLink() {
                    if (!this.reading?.id) return;
                    const url = this.buildPostUrl(this.reading.id);
                    try {
                        await navigator.clipboard.writeText(url);
                        this.showCopyToast("Link copied!");
                    } catch (e) {
                        window.prompt("Copy this link:", url);
                    }
                },

                showCopyToast(msg = "Copied!") {
                    const existing = document.getElementById("copy-toast");
                    if (existing) existing.remove();
                    const toast = document.createElement("div");
                    toast.id = "copy-toast";
                    toast.textContent = msg;
                    document.body.appendChild(toast);
                    requestAnimationFrame(() => {
                        toast.classList.add("copy-toast-show");
                    });
                    setTimeout(() => {
                        toast.classList.add("copy-toast-hide");
                        setTimeout(() => toast.remove(), 400);
                    }, 1800);
                },

                goHome(options = {}) {
                    const skipDirtyCheck = !!options.skipDirtyCheck;
                    if (
                        !skipDirtyCheck &&
                        this.view === "editor" &&
                        this.editor.isDirty
                    ) {
                        this.showConfirmModal(
                            "Unsaved Changes",
                            "You have unsaved changes. Leave anyway?",
                            "Leave",
                        ).then((ok) => {
                            if (ok) {
                                this.view = "home";
                                this.focusMode = false;
                                this.updatePostUrl("");
                            }
                        });
                        return;
                    }
                    this.view = "home";
                    this.focusMode = false;
                    this.updatePostUrl("");
                },

                openNewEditor() {
                    if (!this.isAdmin) {
                        this.showMsg("Admin login required", "error");
                        return;
                    }
                    const d = this.loadDraft();
                    if (d && !d.id && (d.title.trim() || d.content.trim())) {
                        this.editor = {
                            id: null,
                            title: d.title,
                            content: d.content,
                            tagsText: d.tagsText || "",
                            published: d.published !== false,
                            isDirty: true,
                        };
                        this.selectedImageToken = d.selectedImageToken || "";
                    } else {
                        this.editor = {
                            id: null,
                            title: "",
                            content: "",
                            tagsText: "",
                            published: true,
                            isDirty: false,
                        };
                        this.clearSelectedImageToken();
                    }
                    this.view = "editor";
                    this.updatePostUrl("");
                    this._previewContent = this.editor.content;
                    this.previewHtml = this.renderMarkdown(this.editor.content || this.emptyPreviewContent);
                    this.$nextTick(() => this.$refs.editorTextarea?.focus());
                },

                openEditor(post) {
                    if (!this.isAdmin) {
                        this.showMsg("Admin login required", "error");
                        return;
                    }
                    const d = this.loadDraft();
                    if (
                        d &&
                        String(d.id) === String(post.id) &&
                        (d.title !== post.title || d.content !== post.content)
                    ) {
                        this.editor = {
                            id: post.id,
                            title: d.title,
                            content: d.content,
                            tagsText: d.tagsText || "",
                            published: d.published !== false,
                            isDirty: true,
                        };
                        this.selectedImageToken = d.selectedImageToken || "";
                    } else {
                        this.editor = {
                            id: post.id,
                            title: post.title,
                            content: post.content,
                            tagsText: (post.tags || []).join(", "),
                            published: post.published !== false,
                            isDirty: false,
                        };
                        this.clearSelectedImageToken();
                    }
                    this.view = "editor";
                    this.updatePostUrl("");
                    this._previewContent = this.editor.content;
                    this.previewHtml = this.renderMarkdown(this.editor.content || this.emptyPreviewContent);
                    this.$nextTick(() => this.$refs.editorTextarea?.focus());
                },

                openReading(post) {
                    this.readingActiveSection = 0;
                    this.reading = { ...post };
                    this.view = "reading";
                    this.focusMode = false;
                    this.updatePostUrl(post.id);
                    this.$nextTick(() => this.initMermaid());
                },

                markDirty() {
                    this.editor.isDirty = true;
                },

                async savePost(options = {}) {
                    if (!this.isAdmin) {
                        if (!options.silent)
                            this.showMsg("Admin login required", "error");
                        return;
                    }
                    const silent = !!options.silent;
                    if (!this.editor.title.trim() && !this.editor.content.trim()) {
                        if (!silent) this.showMsg("Nothing to save.", "error");
                        return;
                    }

                    if (!this.editor.id) {
                        this.editor.id = Date.now().toString();
                    }

                    const pendingEntries = Object.entries(this.pendingImageUploads);
                    const imageFiles = [];

                    if (pendingEntries.length > 0) {
                        if (!silent)
                            this.showMsg(
                                `Preparing ${pendingEntries.length} image(s)...`,
                                "ok",
                            );
                        const slug = this.slugify(this.editor.title) || "post-" + this.editor.id;
                        for (const [assetId, file] of pendingEntries) {
                            try {
                                const dataUrl = await this.readFileAsDataUrl(file);
                                const base64 = String(dataUrl || "").split(",")[1] || "";
                                if (!base64) continue;
                                const safeName = (file.name || "image.png").replace(
                                    /[^A-Za-z0-9._-]/g,
                                    "_",
                                );
                                const storedPath =
                                    "posts/" +
                                    slug +
                                    "/images/" +
                                    slug +
                                    "_" +
                                    safeName;
                                imageFiles.push({
                                    path: storedPath,
                                    content: base64,
                                    encoding: "base64",
                                    assetId,
                                });
                                this.imageGithubPaths[assetId] = storedPath;
                            } catch (e) {
                                console.warn("Failed to read image for", assetId, e);
                            }
                        }
                        this.saveImageGithubPaths();
                    }

                    const now = new Date().toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                    });
                    let savedPost;
                    const tags = this.editor.tagsText
                        ? this.editor.tagsText.split(",").map(t => t.trim()).filter(Boolean)
                        : [];

                    if (this.editor.id) {
                        const i = this.posts.findIndex((p) => p.id === this.editor.id);
                        if (i !== -1) {
                            this.posts[i] = {
                                ...this.posts[i],
                                title: this.editor.title,
                                content: this.editor.content,
                                tags,
                                published: this.editor.published,
                            };
                            savedPost = this.posts[i];
                        } else {
                            savedPost = {
                                id: this.editor.id,
                                title: this.editor.title || "Untitled",
                                content: this.editor.content,
                                tags,
                                published: this.editor.published,
                                date: now,
                            };
                            this.posts.unshift(savedPost);
                        }
                    } else {
                        const p = {
                            id: this.editor.id,
                            title: this.editor.title || "Untitled",
                            content: this.editor.content,
                            tags,
                            published: this.editor.published,
                            date: now,
                        };
                        this.posts.unshift(p);
                        savedPost = p;
                    }

                    this.editor.isDirty = false;
                    this.savePosts();
                    this.clearDraft();

                    if (!silent) this.showMsg("Pushing to GitHub...", "ok");

                    let synced = false;
                    if (imageFiles.length > 0) {
                        const postsForStorage = this.posts.map((p) => ({
                            ...p,
                            content: this.substituteGithubPaths(p.content),
                        }));
                        const postsContent = JSON.stringify(postsForStorage, null, 4);

                        const allFiles = [
                            ...imageFiles.map((f) => ({
                                path: f.path,
                                content: f.content,
                                encoding: "base64",
                            })),
                            {
                                path: this.githubPostsPath,
                                content: postsContent,
                                encoding: "utf-8",
                            },
                        ];
                        synced = await this.atomicGithubCommit(
                            allFiles,
                            "Update post " + this.editor.id,
                        );

                        if (synced) {
                            for (const f of imageFiles) {
                                delete this.pendingImageUploads[f.assetId];
                            }
                        }
                    } else {
                        synced = savedPost
                            ? await this.syncPostToServer(savedPost)
                            : false;
                    }

                    if (!silent) {
                        if (synced) {
                            this.showMsg("Saved to GitHub âœ“", "ok");
                        } else if (this.syncErrorMessage) {
                            this.showMsg(
                                this.syncErrorMessage + " (saved locally)",
                                "error",
                            );
                        } else {
                            this.showMsg("Saved locally", "ok");
                        }
                    }
                },

                async deletePost(id) {
                    if (!this.isAdmin) {
                        this.showMsg("Admin login required", "error");
                        return;
                    }
                    if (!id) return;
                    const ok = await this.showConfirmModal(
                        "Delete Entry",
                        "Are you sure you want to delete this entry? This action cannot be undone.",
                        "Delete",
                    );
                    if (!ok) return;

                    const post = this.posts.find((p) => p.id === id);
                    this.addDeletedId(id);
                    this.posts = this.posts.filter((p) => p.id !== id);
                    this.savePosts();
                    if (this.editor.id === id) this.clearDraft();
                    const synced = await this.deletePostFromServer(id, post);
                    if (synced) {
                        this.removeDeletedId(id);
                        this.showMsg("Deleted from GitHub ✓", "ok");
                    } else {
                        this.showMsg("Deleted locally.", "ok");
                    }
                    this.goHome({ skipDirtyCheck: true });
                },

                downloadMarkdown() {
                    const b = new Blob([this.editor.content], {
                        type: "text/markdown",
                    });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(b);
                    a.download =
                        (this.editor.title || "entry")
                            .replace(/\s+/g, "-")
                            .toLowerCase() + ".md";
                    a.click();
                },

                queueDraftSave() {
                    clearTimeout(this._saveTimer);
                    this._saveTimer = setTimeout(() => {
                        this.saveDraft();
                    }, 1200);
                },

                queuePreviewRender() {
                    clearTimeout(this._previewTimer);
                    this._previewTimer = setTimeout(() => {
                        if (this.editor.content !== this._previewContent) {
                            this._previewContent = this.editor.content;
                            this.previewHtml = this.renderMarkdown(this.editor.content || this.emptyPreviewContent);
                        }
                    }, 250);
                },

                showMsg(msg, type = "ok") {
                    clearTimeout(this._msgTimer);
                    this.saveMessage = msg;
                    this.saveMessageType = type;
                    this._msgTimer = setTimeout(() => {
                        this.saveMessage = "";
                    }, 2200);
                },

                jumpEditorHeading(id) {
                    this.$refs.previewPane
                        ?.querySelector("#" + id)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                },
                jumpReadingHeading(id) {
                    this.$refs.readingBody
                        ?.querySelector("#" + id)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                },

                handleShortcut(e) {
                    const key = (e.key || "").toLowerCase();
                    if (e.ctrlKey && key === "s") {
                        e.preventDefault();
                        if (this.view === "editor") this.savePost();
                    }
                    if (e.ctrlKey && e.shiftKey && key === "p") {
                        e.preventDefault();
                        if (this.view === "editor") this.focusMode = !this.focusMode;
                    }
                    if (e.key === "Escape") {
                        if (this.lightboxOpen) this.closeLightbox();
                        else if (this.focusMode) this.focusMode = false;
                    }
                },

                _wrap(before, after = "") {
                    const ta = this.$refs.editorTextarea;
                    if (!ta) return;
                    const s = ta.selectionStart,
                        e = ta.selectionEnd;
                    const sel = this.editor.content.slice(s, e);
                    this.editor.content =
                        this.editor.content.slice(0, s) +
                        before +
                        (sel || "text") +
                        after +
                        this.editor.content.slice(e);
                    this.$nextTick(() => {
                        ta.focus();
                        ta.setSelectionRange(
                            s + before.length,
                            s + before.length + (sel || "text").length,
                        );
                    });
                    this.markDirty();
                    this.queueDraftSave();
                    this.queuePreviewRender();
                },

                insertStrikethrough() {
                    this._wrap("~~", "~~");
                },
                insertHorizontalRule() {
                    const ta = this.$refs.editorTextarea;
                    if (!ta) return;
                    const s = ta.selectionStart;
                    this.editor.content =
                        this.editor.content.slice(0, s) +
                        "\n---\n" +
                        this.editor.content.slice(s);
                    this.markDirty();
                    this.queueDraftSave();
                    this.queuePreviewRender();
                },
                insertNumberedList() {
                    this._wrap("\n1. ", "");
                },
                insertTaskList() {
                    this._wrap("\n- [ ] ", "");
                },
                insertCallout() {
                    const ta = this.$refs.editorTextarea;
                    if (!ta) return;
                    const s = ta.selectionStart;
                    this.editor.content =
                        this.editor.content.slice(0, s) +
                        "\n> [!NOTE]\n> Important insight here.\n" +
                        this.editor.content.slice(s);
                    this.markDirty();
                    this.queueDraftSave();
                    this.queuePreviewRender();
                },
                insertDetails() {
                    const ta = this.$refs.editorTextarea;
                    if (!ta) return;
                    const s = ta.selectionStart;
                    this.editor.content =
                        this.editor.content.slice(0, s) +
                        "\n:::details Section Title\ncontent here\n:::\n" +
                        this.editor.content.slice(s);
                    this.markDirty();
                    this.queueDraftSave();
                    this.queuePreviewRender();
                },
                insertHexDump() {
                    const ta = this.$refs.editorTextarea;
                    if (!ta) return;
                    const s = ta.selectionStart;
                    this.editor.content =
                        this.editor.content.slice(0, s) +
                        "[[hex:4D5A9000]]\n" +
                        this.editor.content.slice(s);
                    this.markDirty();
                    this.queueDraftSave();
                    this.queuePreviewRender();
                },
                insertMermaid() {
                    const ta = this.$refs.editorTextarea;
                    if (!ta) return;
                    const s = ta.selectionStart;
                    this.editor.content =
                        this.editor.content.slice(0, s) +
                        "\n```mermaid\ngraph TD;\n    A-->B;\n```\n" +
                        this.editor.content.slice(s);
                    this.markDirty();
                    this.queueDraftSave();
                    this.queuePreviewRender();
                },
                insertBold() {
                    this._wrap("**", "**");
                },
                insertItalic() {
                    this._wrap("_", "_");
                },
                insertInlineCode() {
                    this._wrap("`", "`");
                },
                insertHeading(n) {
                    this._wrap("\n" + "#".repeat(n) + " ", "");
                },

                insertCodeBlock(lang = "c") {
                    const ta = this.$refs.editorTextarea;
                    if (!ta) return;
                    const s = ta.selectionStart;
                    const sn = `\n\`\`\`${lang}\n// code\n\`\`\`\n`;
                    this.editor.content =
                        this.editor.content.slice(0, s) +
                        sn +
                        this.editor.content.slice(s);
                    this.$nextTick(() => ta.focus());
                    this.markDirty();
                    this.queueDraftSave();
                    this.queuePreviewRender();
                },

                insertQuote() {
                    this._wrap("\n> ", "");
                },
                insertList() {
                    this._wrap("\n- ", "");
                },

                insertLink() {
                    const ta = this.$refs.editorTextarea;
                    if (!ta) return;
                    const s = ta.selectionStart,
                        e = ta.selectionEnd;
                    const sel = this.editor.content.slice(s, e) || "link text";
                    this.editor.content =
                        this.editor.content.slice(0, s) +
                        `[${sel}](url)` +
                        this.editor.content.slice(e);
                    this.markDirty();
                    this.queueDraftSave();
                    this.queuePreviewRender();
                },

                insertTable() {
                    const ta = this.$refs.editorTextarea;
                    if (!ta) return;
                    const s = ta.selectionStart;
                    this.editor.content =
                        this.editor.content.slice(0, s) +
                        "\n| Column | Column |\n|--------|--------|\n| Value  | Value  |\n" +
                        this.editor.content.slice(s);
                    this.markDirty();
                    this.queueDraftSave();
                    this.queuePreviewRender();
                },
            }));
        });

