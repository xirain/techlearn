# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 语言要求

默认使用中文进行交流和编写文档。

## 项目概述

基于 Jekyll 的技术文档站点，部署于 GitHub Pages：https://xirain.github.io/techlearn/。包含 AI 学习笔记和部署文档。

## 常用命令

```bash
# 安装依赖
bundle install

# 本地开发服务器
bundle exec jekyll serve

# 生产环境构建
bundle exec jekyll build

# 使用 GitHub Pages baseurl 构建
bundle exec jekyll build --baseurl "/techlearn"
```

## 架构说明

- **主题**: jekyll-theme-chirpy (~7.0)
  - 内置 TOC (目录) 功能，通过 tocbot 实现
  - TOC 启用条件：`site.toc` 和 `page.toc` 均为 true，且文章包含 h2/h3 标题
- **部署**: GitHub Actions 工作流 (.github/workflows/jekyll.yml)，推送到 main 分支时自动部署
- **内容**: 带 YAML front matter 的 Markdown 文件
  - `_posts/*.md` - 博客文章（按日期命名：YYYY-MM-DD-title.md）
  - `_tabs/*.md` - 导航标签页

## 添加新文档

1. 在 `docs/` 目录下创建 markdown 文件
2. 添加 YAML front matter：
   ```yaml
   ---
   layout: post
   title: 文档标题
   subtitle: 简要描述
   categories: 分类名称
   tags: [标签1, 标签2]
   author: xirain
   date: YYYY-MM-DD
   permalink: /docs/文档路径
   ---
   ```
3. 在 `index.md` 文档索引中添加链接
4. 如需在导航栏显示，添加到 `_config.yml` 的 `header_pages` 中

## 内容说明

所有文档均为本地 AI 操作的总结，不建议直接应用于生产环境。
