const LOCAL_POSTS_KEY = 'reverse_blog_posts_v1';
const LOCAL_DRAFT_KEY = 'reverse_blog_draft_v1';

document.addEventListener('alpine:init', () => {
    marked.setOptions({
        gfm: true,
        breaks: true
    });

    Alpine.data('blogApp', () => ({
        posts: [],
        emptyPreviewContent: '## Start writing\nYour live preview appears here while you type.',
        saveMessage: '',
        saveMessageType: 'success',
        saveMessageTimer: null,
        draftTimer: null,
        topicQuery: '',
        focusMode: false,
        tocItems: [],
        keyHandler: null,

        editor: {
            title: '',
            content: '',
            id: null
        },

        async init() {
            this.restoreDraft();
            await this.fetchPosts();
            if (!this.editor.title && !this.editor.content && this.posts.length > 0) {
                this.selectPost(this.posts[0]);
            }

            this.keyHandler = (event) => {
                const key = event.key.toLowerCase();
                const ctrlOrCmd = event.ctrlKey || event.metaKey;

                if (ctrlOrCmd && key === 's') {
                    event.preventDefault();
                    this.savePost();
                }

                if (ctrlOrCmd && event.shiftKey && key === 'n') {
                    event.preventDefault();
                    this.createNewPost();
                }

                if (ctrlOrCmd && event.shiftKey && key === 'p') {
                    event.preventDefault();
                    this.focusMode = !this.focusMode;
                }
            };

            window.addEventListener('keydown', this.keyHandler);
        },

        get filteredPosts() {
            const q = this.topicQuery.trim().toLowerCase();
            if (!q) return this.posts;
            return this.posts.filter((post) => {
                const title = (post.title || '').toLowerCase();
                const content = (post.content || '').toLowerCase();
                return title.includes(q) || content.includes(q);
            });
        },

        get wordCount() {
            return (this.editor.content.trim().match(/\S+/g) || []).length;
        },

        get readingTime() {
            return Math.max(1, Math.ceil(this.wordCount / 200));
        },

        setSaveMessage(message, type = 'success') {
            this.saveMessage = message;
            this.saveMessageType = type;
            if (this.saveMessageTimer) {
                clearTimeout(this.saveMessageTimer);
            }
            this.saveMessageTimer = setTimeout(() => {
                this.saveMessage = '';
            }, 3500);
        },

        readLocalPosts() {
            try {
                const raw = localStorage.getItem(LOCAL_POSTS_KEY);
                if (!raw) return [];
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch (err) {
                console.error('Failed to read local posts', err);
                return [];
            }
        },

        writeLocalPosts(posts) {
            try {
                localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(posts));
            } catch (err) {
                console.error('Failed to write local posts', err);
            }
        },

        saveDraft() {
            try {
                const draft = {
                    title: this.editor.title || '',
                    content: this.editor.content || '',
                    id: this.editor.id || null,
                    updatedAt: new Date().toISOString()
                };
                localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(draft));
            } catch (err) {
                console.error('Failed to save draft', err);
            }
        },

        queueDraftSave() {
            if (this.draftTimer) {
                clearTimeout(this.draftTimer);
            }
            this.draftTimer = setTimeout(() => this.saveDraft(), 250);
        },

        restoreDraft() {
            try {
                const raw = localStorage.getItem(LOCAL_DRAFT_KEY);
                if (!raw) return;
                const draft = JSON.parse(raw);
                if (!draft || typeof draft !== 'object') return;
                if (!this.editor.title && !this.editor.content) {
                    this.editor.title = draft.title || '';
                    this.editor.content = draft.content || '';
                    this.editor.id = draft.id || null;
                }
            } catch (err) {
                console.error('Failed to restore draft', err);
            }
        },

        clearDraft() {
            localStorage.removeItem(LOCAL_DRAFT_KEY);
        },

        async fetchPosts() {
            const localPosts = this.readLocalPosts();
            if (localPosts.length) {
                this.posts = localPosts;
            }

            try {
                const res = await fetch('/api/posts', { cache: 'no-store' });
                if (!res.ok) throw new Error(`API error: ${res.status}`);
                const serverPosts = await res.json();
                if (Array.isArray(serverPosts)) {
                    this.posts = serverPosts;
                    this.writeLocalPosts(serverPosts);
                }
            } catch (err) {
                console.info('Server API unavailable, using browser storage', err);
                if (!localPosts.length) {
                    this.posts = [];
                }
            } finally {
                // no-op, fetch flow intentionally always resolves to local/server data
            }
        },

        focusEditor() {
            this.$nextTick(() => {
                if (this.$refs.editorTextarea) {
                    this.$refs.editorTextarea.focus();
                }
            });
        },

        createNewPost() {
            this.editor = {
                title: '',
                content: '',
                id: null
            };
            this.tocItems = [];
            this.queueDraftSave();
            this.focusEditor();
        },

        selectPost(post) {
            if (!post) return;
            this.editor = {
                title: post.title || '',
                content: post.content || '',
                id: post.id || null
            };
            this.focusEditor();
        },

        async deletePost(postId) {
            if (!postId) return;
            const post = this.posts.find((p) => p.id === postId);
            if (!post) return;

            const shouldDelete = window.confirm(`Delete "${post.title}"?`);
            if (!shouldDelete) return;

            this.posts = this.posts.filter((p) => p.id !== postId);
            this.writeLocalPosts(this.posts);

            if (this.editor.id === postId) {
                if (this.posts.length > 0) {
                    this.selectPost(this.posts[0]);
                } else {
                    this.createNewPost();
                    this.clearDraft();
                }
            }

            try {
                const res = await fetch(`/api/posts/${encodeURIComponent(postId)}`, {
                    method: 'DELETE'
                });
                if (!res.ok) throw new Error(`Delete sync failed: ${res.status}`);
            } catch (err) {
                console.info('Server delete sync skipped', err);
            }

            this.setSaveMessage('Topic deleted.', 'success');
        },

        duplicatePost() {
            if (!this.editor.id) return;
            const now = new Date();
            const duplicate = {
                id: String(Date.now()),
                title: `${this.editor.title.trim() || 'Untitled'} (Copy)`,
                content: this.editor.content || '',
                date: now.toISOString().split('T')[0]
            };
            this.upsertPostInMemory(duplicate);
            this.selectPost(duplicate);
            this.setSaveMessage('Duplicate created.', 'success');
        },

        downloadMarkdown() {
            const title = (this.editor.title || 'topic').trim() || 'topic';
            const body = this.editor.content || '';
            const markdown = `# ${title}\n\n${body}`;
            const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'topic'}.md`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            this.setSaveMessage('Markdown exported.', 'success');
        },

        upsertPostInMemory(post) {
            const idx = this.posts.findIndex((p) => p.id === post.id);
            if (idx >= 0) {
                this.posts.splice(idx, 1, post);
            } else {
                this.posts.unshift(post);
            }
            this.writeLocalPosts(this.posts);
        },

        async syncPostToServer(post) {
            try {
                const res = await fetch('/api/posts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(post)
                });
                if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
                return true;
            } catch (err) {
                console.info('Server sync skipped, local save completed', err);
                return false;
            }
        },

        async savePost() {
            if (!this.editor.title.trim() || !this.editor.content.trim()) {
                this.setSaveMessage('Title and content are required before saving.', 'error');
                return;
            }

            const existing = this.editor.id ? this.posts.find((p) => p.id === this.editor.id) : null;
            const postToSave = existing ? { ...existing } : {};

            postToSave.id = this.editor.id || String(Date.now());
            postToSave.title = this.editor.title.trim();
            postToSave.content = this.editor.content;
            postToSave.date = existing?.date || new Date().toISOString().split('T')[0];
            delete postToSave.comments;

            this.editor.id = postToSave.id;
            this.upsertPostInMemory(postToSave);
            this.clearDraft();

            const synced = await this.syncPostToServer(postToSave);
            this.setSaveMessage(
                synced ? 'Saved locally and synced to server.' : 'Saved locally in this browser.',
                'success'
            );
        },

        insertAroundSelection(prefix, suffix, placeholder) {
            const textarea = this.$refs.editorTextarea;
            if (!textarea) return;

            const value = this.editor.content || '';
            const start = textarea.selectionStart ?? value.length;
            const end = textarea.selectionEnd ?? value.length;
            const hasSelection = end > start;
            const selected = hasSelection ? value.slice(start, end) : placeholder;

            this.editor.content =
                value.slice(0, start) +
                prefix +
                selected +
                suffix +
                value.slice(end);

            const caretStart = start + prefix.length;
            const caretEnd = caretStart + selected.length;

            this.$nextTick(() => {
                textarea.focus();
                textarea.setSelectionRange(caretStart, caretEnd);
            });

            this.queueDraftSave();
        },

        insertSnippet(snippet) {
            const textarea = this.$refs.editorTextarea;
            if (!textarea) return;

            const value = this.editor.content || '';
            const start = textarea.selectionStart ?? value.length;
            const end = textarea.selectionEnd ?? value.length;

            this.editor.content = value.slice(0, start) + snippet + value.slice(end);

            this.$nextTick(() => {
                const pos = start + snippet.length;
                textarea.focus();
                textarea.setSelectionRange(pos, pos);
            });

            this.queueDraftSave();
        },

        insertHeading() {
            this.insertSnippet('\n## New Section\n');
        },

        insertBold() {
            this.insertAroundSelection('**', '**', 'bold text');
        },

        insertItalic() {
            this.insertAroundSelection('*', '*', 'italic text');
        },

        insertInlineCode() {
            this.insertAroundSelection('`', '`', 'test');
        },

        insertCodeBlock() {
            this.insertSnippet('\n```python\n# reverse engineering notes\n```\n');
        },

        insertQuote() {
            this.insertSnippet('\n> Key takeaway from this analysis.\n');
        },

        insertList(prefix) {
            const safePrefix = prefix || '- ';
            this.insertSnippet(`\n${safePrefix}First point\n${safePrefix}Second point\n`);
        },

        insertLink() {
            this.insertAroundSelection('[', '](https://example.com)', 'reference');
        },

        insertCallout() {
            this.insertSnippet('\n> [!NOTE]\n> Important reverse engineering insight.\n');
        },

        slugifyHeading(value) {
            return (value || '')
                .toLowerCase()
                .replace(/[^a-z0-9\s-]/g, '')
                .trim()
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-');
        },

        jumpToHeading(id) {
            if (!id || !this.$refs.previewPane) return;
            const target = this.$refs.previewPane.querySelector(`#${id}`);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },

        renderMarkdown(content) {
            if (!content) return '';

            const parsed = marked.parse(content);
            const temp = document.createElement('div');
            temp.innerHTML = parsed;

            const headingCount = {};
            const newToc = [];
            temp.querySelectorAll('h1, h2, h3').forEach((heading) => {
                const text = heading.textContent.trim();
                const level = parseInt(heading.tagName[1], 10);
                const base = this.slugifyHeading(text) || `section-${level}`;
                headingCount[base] = (headingCount[base] || 0) + 1;
                const uniqueId = headingCount[base] > 1 ? `${base}-${headingCount[base]}` : base;
                heading.id = uniqueId;
                newToc.push({ id: uniqueId, text, level });
            });
            this.tocItems = newToc;

            temp.querySelectorAll('pre code').forEach((codeBlock) => {
                hljs.highlightElement(codeBlock);
            });

            return temp.innerHTML;
        }
    }));
});
