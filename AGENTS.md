# AGENTS.md - Agentic Coding Guidelines

This file provides guidance for AI agents operating in this repository.

## Project Overview

**Tech Learning Notes** - A Jekyll-based technical documentation site deployed to GitHub Pages.
- **URL**: https://xirain.github.io/techlearn/
- **Theme**: jekyll-theme-chirpy (~7.0)
- **Language**: Chinese (zh-CN)
- **Timezone**: Asia/Shanghai

---

## Build / Lint / Test Commands

### Installation
```bash
# Install Ruby dependencies
bundle install
```

### Development
```bash
# Start local dev server (http://localhost:4000/techlearn/)
bundle exec jekyll serve

# With live reload
bundle exec jekyll serve --livereload
```

### Production Build
```bash
# Build for production
bundle exec jekyll build

# Build with GitHub Pages baseurl
bundle exec jekyll build --baseurl "/techlearn"
```

### Testing
```bash
# Run HTML Proofer to validate links and HTML
bundle exec htmlproofer ./_site --allow-hash-href --check-img-http --empty-alt-ignore --disable-external

# Alternative: run after build
bundle exec jekyll build && bundle exec htmlproofer ./_site
```

### CI/CD
- GitHub Actions workflow: `.github/workflows/jekyll.yml`
- Trigger: Push to `main` branch
- Ruby version: 3.3

---

## Code Style Guidelines

### Markdown Files

#### Front Matter (Required)
Every post must include YAML front matter:

```yaml
---
title: 文章标题
description: 简短描述（SEO 用）
date: YYYY-MM-DD
categories: [分类名]
tags: [标签1, 标签2]
---
```

**Fields**:
- `title` (required): Article title
- `description` (optional but recommended): Meta description for SEO
- `date` (required): Publication date in YYYY-MM-DD format
- `categories` (optional): Array, e.g., `[编程语言]`
- `tags` (optional): Array, e.g., `[c++, modern-c++]`
- `author` (optional, defaults to config): Author name
- `toc` (optional): Override TOC setting (default: true)
- `permalink` (optional): Custom URL path

#### File Naming
- Posts: `_posts/YYYY-MM-DD-title.md` (e.g., `2026-02-26-modern-cpp-guide.md`)
- Tabs: `_tabs/*.md`

#### Content Style
- Use Chinese headings (##, ###)
- Code blocks with language hint: ` ```cpp `, ` ```python `
- Use full-width punctuation in Chinese text
- Keep lines reasonably sized (not too long)

### Directory Structure

```
techlearn/
├── _posts/           # Blog posts (date-prefixed markdown)
├── _tabs/            # Navigation tab pages
├── _config.yml       # Jekyll configuration
├── _includes/        # Theme includes
├── assets/           # CSS, JS, images
├── .github/workflows/# CI/CD pipelines
└── index.html        # Home page
```

### Naming Conventions

- **Files**: kebab-case (lowercase with hyphens)
- **Categories**: Chinese, single word or simple phrase
- **Tags**: English or Chinese, lowercase
- **Permalinks**: Use `/posts/:title/` pattern for posts

### Prohibited Changes

1. **Never** modify `_config.yml` without understanding implications
2. **Never** delete or modify `.github/workflows/jekyll.yml`
3. **Never** commit sensitive data (API keys, credentials)
4. **Avoid** changing theme version without testing
5. **Avoid** modifying Gemfile without necessity

### Theme-Specific Guidelines

- **TOC**: Enabled by default (`toc: true` in front matter to override)
- **Code highlighting**: Rouge (configured in `_config.yml`)
- **Archives**: Categories and tags auto-generated
- **Pagination**: 10 posts per page

---

## Working with This Project

### Adding a New Post
1. Create file in `_posts/YYYY-MM-DD-title.md`
2. Add required front matter
3. Write content in Markdown
4. Test locally with `bundle exec jekyll serve`

### Adding a New Tab Page
1. Create file in `_tabs/filename.md`
2. Add front matter with `layout: page`
3. Configure in `_config.yml` under `header_pages` if needed

### Common Issues

- **Build failures**: Check Ruby version (3.3 required)
- **Broken links**: Run `htmlproofer` after build
- **Missing images**: Place in `assets/` directory
- **TOC not showing**: Ensure file has h2/h3 headings

---

## Useful Commands Summary

| Task | Command |
|------|---------|
| Install deps | `bundle install` |
| Dev server | `bundle exec jekyll serve` |
| Production build | `bundle exec jekyll build --baseurl "/techlearn"` |
| Test links | `bundle exec htmlproofer ./_site` |
| Clean cache | `bundle exec jekyll clean` |

---

*Generated for agentic coding agents. Last updated: 2026-03-02*
