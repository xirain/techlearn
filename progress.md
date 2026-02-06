# Astro 主题迁移进度

> 从 Jekyll + Chirpy 迁移到 Astro，参考 [liruifengv.com](https://github.com/liruifengv/liruifengv.com) 主题设计

## 当前状态

**分支**: `feature/astro-theme`  
**最新提交**: `50341b5` - feat: 迁移至 Astro 框架，参考 liruifengv.com 主题设计

## 已完成 ✅

### 1. 项目结构迁移
- [x] 创建 `feature/astro-theme` 分支
- [x] 删除 Jekyll 文件 (`_config.yml`, `Gemfile`, `_posts/`, `_tabs/`, `index.html`)
- [x] 初始化 Astro 5.0 项目结构

### 2. 配置文件
- [x] `package.json` - Astro 5.0 + MDX + Tailwind + Sitemap
- [x] `astro.config.mjs` - GitHub Pages 配置 (`base: "/techlearn"`)
- [x] `tailwind.config.js` - 有机设计系统 + Typography 插件
- [x] `tsconfig.json` - 路径别名 (`@components`, `@layouts`, `@styles`)

### 3. 设计系统
- [x] `src/styles/global.css` - CSS 变量定义
  - 暖色调配色（奶油色背景、森林绿、赤陶色）
  - 深色/浅色主题支持
  - 动画效果（fade-in, slide-up）
- [x] `public/toggle-theme.js` - 主题持久化（防闪烁）

### 4. 布局组件
- [x] `src/layouts/BaseLayout.astro` - 基础布局（SEO meta, 字体加载）
- [x] `src/layouts/PostListLayout.astro` - 文章列表页布局
- [x] `src/layouts/PostDetailLayout.astro` - 文章详情页布局

### 5. UI 组件
- [x] `src/components/Nav.astro` - 导航栏（响应式 + 移动端菜单）
- [x] `src/components/Footer.astro` - 页脚
- [x] `src/components/ThemeToggle.astro` - 主题切换按钮
- [x] `src/components/PostList.astro` - 文章卡片列表
- [x] `src/components/Tag.astro` - 标签组件

### 6. 页面
- [x] `src/pages/index.astro` - 首页（Hero + 最新文章）
- [x] `src/pages/posts/index.astro` - 文章列表
- [x] `src/pages/posts/[...slug].astro` - 文章详情（动态路由）
- [x] `src/pages/tags/index.astro` - 标签列表
- [x] `src/pages/tags/[tag].astro` - 按标签筛选文章

### 7. 内容迁移
- [x] `src/content/config.ts` - Content Collections schema
- [x] 迁移 `openclaw-deployment.md` (1154 行)
- [x] 迁移 `deepseek-mhc-paper.md`
- [x] Frontmatter 格式转换 (`date` → `pubDatetime`)

### 8. 部署配置
- [x] `.github/workflows/astro.yml` - GitHub Actions 工作流
- [x] `.gitignore` - 更新忽略规则

### 9. Bug 修复
- [x] 修复 `tailwind.config.js` ESM 兼容性 (`require` → `import`)
- [x] 修复 `BASE_URL` 路径拼接问题（缺少 `/`）

### 10. 新增页面
- [x] `src/pages/about.astro` - 关于页面，导航栏已添加"关于"入口
- [x] `src/pages/404.astro` - 404 错误页面
- [x] `src/pages/rss.xml.ts` - RSS 订阅（`@astrojs/rss`）
- [x] `src/pages/search.astro` + `src/pages/search.json.ts` - 全文搜索（Fuse.js）

### 11. 新增组件
- [x] `src/components/TOC.astro` - 文章目录组件（h2/h3 层级）
- [x] `src/components/CopyCodeButton.astro` - 代码块复制按钮
- [x] `src/components/Giscus.astro` - Giscus 评论系统（需配置 repo-id）
- [x] `src/components/SeriesNav.astro` - 文章系列/专栏导航

### 12. 功能增强
- [x] 文章阅读时间估算 (`src/utils/readingTime.ts`，支持中文字数统计)
- [x] OG Image 自动生成 (`src/pages/og/[slug].png.ts`，satori + sharp)
- [x] 性能优化（Astro prefetch hover 策略、DNS 预解析、`content-visibility`）
- [x] 导航栏搜索图标入口
- [x] RSS `<link>` 标签自动注入
- [x] Content schema 新增 `series` / `seriesOrder` 字段

## 待完成 🚧

（暂无）

## 配置提醒

- **Giscus 评论**：需在 [giscus.app](https://giscus.app) 获取 `data-repo-id` 和 `data-category-id`，填入 `src/components/Giscus.astro`
- **文章系列**：在文章 frontmatter 中添加 `series: "系列名"` 和 `seriesOrder: 1` 即可自动关联

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Astro 5.0 |
| 样式 | Tailwind CSS 3.4 + Typography |
| 内容 | MDX + Content Collections |
| 部署 | GitHub Pages + Actions |
| 字体 | Inter + JetBrains Mono |
| 搜索 | Fuse.js（客户端模糊搜索） |
| OG 图 | satori + sharp |
| 评论 | Giscus |
| RSS | @astrojs/rss |

## 本地开发

```bash
# 安装依赖
npm install

# 开发服务器
npm run dev
# 访问 http://localhost:4321/techlearn/

# 生产构建
npm run build

# 预览构建
npm run preview
```

## 目录结构

```
techlearn/
├── src/
│   ├── components/          # UI 组件
│   │   ├── Nav.astro
│   │   ├── Footer.astro
│   │   ├── ThemeToggle.astro
│   │   ├── PostList.astro
│   │   ├── Tag.astro
│   │   ├── TOC.astro
│   │   ├── CopyCodeButton.astro
│   │   ├── Giscus.astro
│   │   └── SeriesNav.astro
│   ├── layouts/             # 页面布局
│   ├── pages/               # 路由页面
│   │   ├── about.astro
│   │   ├── 404.astro
│   │   ├── search.astro
│   │   ├── rss.xml.ts
│   │   ├── search.json.ts
│   │   └── og/[slug].png.ts
│   ├── content/             # Markdown 内容
│   │   └── posts/
│   ├── utils/               # 工具函数
│   │   └── readingTime.ts
│   ├── styles/              # 全局样式
│   └── config.ts            # 站点配置
├── public/                  # 静态资源
├── astro.config.mjs         # Astro 配置
├── tailwind.config.js       # Tailwind 配置
└── package.json
```

## 参考资源

- [liruifengv.com 源码](https://github.com/liruifengv/liruifengv.com)
- [Astro 文档](https://docs.astro.build)
- [Tailwind CSS 文档](https://tailwindcss.com/docs)
