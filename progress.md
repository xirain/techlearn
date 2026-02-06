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

## 待完成 🚧

### 高优先级
- [ ] 添加 About 页面 (`src/pages/about.astro`)
- [ ] 添加 404 页面 (`src/pages/404.astro`)
- [ ] RSS 订阅 (`src/pages/rss.xml.ts`)

### 中优先级
- [ ] 文章目录 (TOC) 组件
- [ ] 代码块复制按钮
- [ ] 文章阅读时间估算
- [ ] 搜索功能

### 低优先级
- [ ] Giscus 评论系统
- [ ] 文章系列/专栏功能
- [ ] OG Image 自动生成
- [ ] 性能优化（图片懒加载、预加载）

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Astro 5.0 |
| 样式 | Tailwind CSS 3.4 + Typography |
| 内容 | MDX + Content Collections |
| 部署 | GitHub Pages + Actions |
| 字体 | Inter + JetBrains Mono |

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
│   ├── components/     # UI 组件
│   ├── layouts/        # 页面布局
│   ├── pages/          # 路由页面
│   ├── content/        # Markdown 内容
│   │   └── posts/      # 文章
│   ├── styles/         # 全局样式
│   └── config.ts       # 站点配置
├── public/             # 静态资源
├── astro.config.mjs    # Astro 配置
├── tailwind.config.js  # Tailwind 配置
└── package.json
```

## 参考资源

- [liruifengv.com 源码](https://github.com/liruifengv/liruifengv.com)
- [Astro 文档](https://docs.astro.build)
- [Tailwind CSS 文档](https://tailwindcss.com/docs)
