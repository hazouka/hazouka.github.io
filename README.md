# GitHub Pages Blog (No Python Server)

This build is static and works on GitHub Pages:

- readers can open your blog publicly
- admin editing is available only after setting a GitHub token on a secret page

## 1) Publish On GitHub Pages

1. Push this project to GitHub.
2. In repository settings, enable Pages from your branch (usually `main`, root folder).
3. Wait for deployment and open your Pages URL.

Pages URL is public for readers. Your source repo can still be private if your GitHub plan supports private-source Pages.

## 2) Secret Admin Page

Use this URL:

`/vault-9k3p-admin.html`

On that page, enter:

- GitHub fine-grained token
- owner
- repo
- branch
- posts path (default `posts.json`)
- uploads directory (default `uploads`)

Then click `Save And Open Blog`.

## 3) Token Permissions

Use a fine-grained token limited to your blog repository with:

- `Contents: Read and write`

Token is stored in your browser localStorage only.

## 4) Shareable Post Links

Opening a post updates URL to:

`https://your-domain/?post=<post-id>`

Use `Copy Link` to share that exact post.
