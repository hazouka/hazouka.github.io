# RE-blog

Reverse Engineering notes and writeups by hazouka. Live at https://hazouka.github.io

## Project Structure

```
├── _config.yml            # Jekyll config (GitHub Pages deployment)
├── Gemfile                # Ruby deps for Jekyll
├── _layouts/              # Jekyll HTML templates (used by both Jekyll & local server)
│   ├── default.html       # Base layout (header, footer, hljs init, <title> tag)
│   ├── home.html          # Homepage (hero + post grid)
│   ├── page.html          # Generic page layout
│   └── post.html          # Blog post layout (tags, date, prev/next nav)
├── _pages/
│   └── about.md           # About page
├── _posts/                # Published posts (Markdown with YAML front matter)
├── draft-posts/           # LOCAL ONLY - draft posts (gitignored, never pushed)
├── assets/
│   ├── css/style.css      # Main stylesheet (Dracula dark theme)
│   └── images/            # Post images
├── index.md               # Homepage entry point (title, tab_title, excerpt)
├── local/                 # Local dev server + admin panel
│   ├── server.js          # Express server (main entry for local dev)
│   ├── admin.html         # Admin panel (markdown editor + post management)
│   └── package.json       # Node.js dependencies
└── _archive/              # Old SPA version (not actively used)
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
- Blog homepage with post listings (reads from `_layouts/home.html` and `index.md`)
- Individual post pages with syntax highlighting (reads from `_layouts/post.html`)
- About page
- Admin panel at /admin (markdown editor, image paste, save/push to git, draft mode)
- Sync button on homepage to pull latest from GitHub

### Jekyll (GitHub Pages deployment)

```bash
bundle install
bundle exec jekyll serve
```

## Draft System

Drafts live in `draft-posts/` locally and are **never pushed to GitHub**.

- **Creating a post**: New posts default to draft mode (Draft: ON in admin panel). Saved to `draft-posts/`.
- **Publishing a draft**: Toggle Draft OFF and save. The post moves from `draft-posts/` → `_posts/` and gets committed + pushed.
- **Un-publishing**: Toggle Draft ON and save. The post moves from `_posts/` → `draft-posts/` and the deletion is committed + pushed (removed from live site).
- Draft posts show a yellow "DRAFT" badge on the local homepage.
- `draft-posts/` is in `.gitignore` so it stays local only.

## Post Format

Posts are Markdown files with YAML front matter:

```yaml
---
title: "Post Title"
date: 2026-06-13 12:00:00 +0000
tags: [reverse, cpp, windows]
published: false   # omit or set to true to publish
---

# Content here
```

Supported code block languages: c, cpp, asm (x86asm), python, rust, javascript, go, csharp, bash, powershell.

## Homepage Config

`index.md` controls the homepage:

```yaml
---
layout: home
title: "hazoukabe blog"    # Hero title displayed on the page
tab_title: "RE-blog"       # Browser tab title
excerpt: ""                 # Hero subtitle (leave empty to hide)
---
```

## How the Local Server Works

`local/server.js` is an Express server that:
- Reads from `_layouts/` files (home.html, post.html, default.html) so layout changes are reflected locally
- Renders Markdown posts to HTML with syntax highlighting via highlight.js
- Converts hljs CSS classes to Rouge-compatible classes for theme consistency
- Serves the admin panel with a full markdown editor, live preview (server-side rendering via `/api/admin/render`), and word count
- Supports image paste from clipboard (saves to `assets/images/`)
- Saves drafts to `draft-posts/`, published posts to `_posts/`
- Auto-commits + pushes to git (skips push for drafts, auto-removes from `_posts/` when draftifying)
- Supports pulling latest from GitHub via the Sync button on the homepage

## Theme

Dracula-inspired dark theme. Fonts: EB Garamond (body), Outfit (UI), JetBrains Mono (code).
