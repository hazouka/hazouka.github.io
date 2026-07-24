# RE-blog

Reverse Engineering notes and writeups by hazouka. Live at https://hazouka.github.io

## Project Structure

```
├── _config.yml            # Jekyll config (GitHub Pages deployment)
├── Gemfile                # Ruby deps for Jekyll
├── _layouts/              # Jekyll HTML templates
│   ├── default.html       # Base layout (header, footer, hljs init)
│   ├── home.html          # Homepage (post grid)
│   ├── page.html          # Generic page layout
│   └── post.html          # Blog post layout
├── _pages/
│   └── about.md           # About page
├── _posts/                # Blog posts (Markdown with YAML front matter)
│   ├── 2026-04-18-crackmesone-ctf-flrscrnsvrscr.md
│   └── 2026-06-13-reverse-engineering-integrity-checks.md
├── assets/
│   ├── css/style.css      # Main stylesheet (Dracula dark theme)
│   └── images/            # Post images
├── index.md               # Homepage entry point
├── local/                 # Local dev server + admin panel
│   ├── server.js          # Express server (main entry for local dev)
│   ├── admin.html         # Admin panel (markdown editor + post management)
│   └── package.json       # Node.js dependencies
├── _archive/              # Old SPA version (single-page app, not actively used)
│   ├── index.html         # Alpine.js SPA blog
│   ├── app.js             # SPA logic (localStorage + GitHub sync)
│   ├── admin.html         # SPA admin config page
│   ├── style.css          # SPA stylesheet
│   └── posts.json         # Sample post data
├── serve.js               # Legacy simple server (deprecated, use local/server.js)
└── test_re.js             # Test file
```

## How to Run Locally

### Full-featured local server (recommended)

```bash
cd local
npm install
node server.js
```

Then open http://localhost:4000

This gives you:
- Blog homepage with post listings
- Individual post pages with syntax highlighting
- About page
- Admin panel at /admin (markdown editor, image paste, save/push to git, draft mode)

### Jekyll (GitHub Pages deployment)

```bash
bundle install
bundle exec jekyll serve
```

## Post Format

Posts live in `_posts/` as Markdown files with YAML front matter:

```yaml
---
title: "Post Title"
date: 2026-06-13 12:00:00 +0000
tags: [reverse, cpp, windows]
published: false   # omit or set to true to publish
---

# Content here

```c
int main() { return 0; }
```

Supported code block languages: c, cpp, asm (x86asm), python, rust, javascript, go, csharp, bash, powershell.

## Local Server Details

`local/server.js` is an Express server that:
- Renders Markdown posts to HTML with syntax highlighting via highlight.js
- Converts hljs CSS classes to Rouge-compatible classes for theme consistency
- Serves the admin panel with a full markdown editor, live preview, and word count
- Supports image paste from clipboard (saves to `assets/images/`)
- Can save posts and auto-commit+push to git (skips push for drafts)
- Supports pulling latest from GitHub via the admin panel

## Theme

Dracula-inspired dark theme. Fonts: EB Garamond (body), Outfit (UI), JetBrains Mono (code).
