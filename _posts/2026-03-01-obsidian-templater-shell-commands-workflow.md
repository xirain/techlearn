---
title: Obsidian 自动化工作流：Templater 模板 + Shell Commands 一键发布
description: 从零配置 Obsidian 自动化写作流程，包括 Templater 动态模板（自动命名、固定前缀、日期）、Shell Commands 一键运行脚本、Commander 右键菜单集成，以及图片管理的最佳实践
date: 2026-03-01
categories: [工具]
tags: [Obsidian, Templater, Shell Commands, Commander, 自动化, 模板, 微信公众号]
---

# Obsidian 自动化工作流：Templater 模板 + Shell Commands 一键发布

## 一、背景

写微信公众号文章时，每篇文章都有固定的结构：标题、正文、推荐区、合集链接、AI 助手提示。手动复制粘贴既繁琐又容易遗漏。写完后还要手动切到终端执行发布脚本，效率很低。

本文记录如何用 Obsidian 的三个插件组合，打造一个**从新建文章到一键发布**的完整工作流：

- **Templater**：动态模板，自动弹窗输入标题、自动命名文件
- **Shell Commands**：在 Obsidian 内直接运行发布脚本
- **Commander**：把命令添加到右键菜单

## 二、Templater 模板配置

### 2.1 安装 Templater

1. 打开 Obsidian → **设置** → **第三方插件**
2. 关闭「安全模式」
3. 点击「浏览」→ 搜索 **Templater** → 安装 → 启用

### 2.2 配置模板文件夹

**设置** → **Templater** → **Template folder location** → 填入 `templates`

在库根目录创建 `templates` 文件夹，所有模板文件放在里面。

### 2.3 编写动态模板

以微信公众号文章模板为例，创建 `templates/围巾.md`：

```markdown
<%*
const title = '分享钩针图解，' + await tp.system.prompt('请输入文章标题');
await tp.file.rename(tp.date.now('YYYY-MM-DD') + ' ' + title);
-%>
# <% title %>

> 描述文字（替换为你的介绍）

# **推荐前面的**

（推荐内容区域...）

# **推荐一下自制图解合集**

[全部自制高清图解](链接)
[#自制高清钩针图解，围巾披肩](链接)

# **公众号有AI助手了**

> 后台跟AI小助手对话了，也许回复会有惊喜╰(*°▽°*)╯
```

**关键语法解释：**

| 语法 | 作用 |
|------|------|
| `<%* ... -%>` | 执行 JavaScript 代码块，`-%>` 末尾的 `-` 表示不输出空行 |
| `tp.system.prompt('提示文字')` | 弹窗让用户输入内容 |
| `tp.file.rename(新文件名)` | 自动重命名当前文件 |
| `tp.date.now('YYYY-MM-DD')` | 插入当前日期 |
| `<% title %>` | 输出变量值到文档中 |

### 2.4 模板的设计要点

**自动命名文件**：通过 `tp.file.rename()` 解决新建文件默认叫「未命名」的问题。本例生成的文件名格式为 `2026-03-01 分享钩针图解，简单好看的三角围巾.md`。

**固定前缀**：在 `title` 变量前拼接固定文本 `'分享钩针图解，'`，确保每篇文章标题统一格式。

**固定尾部内容**：推荐区、合集链接、AI 助手提示等每篇文章都一样的内容直接写死在模板里，无需重复编辑。

### 2.5 使用模板

`Ctrl+P` → 输入 `Templater: Create new note from template` → 选择「围巾」→ 弹窗输入标题 → 文件自动创建并命名。

### 2.6 常用 Templater 变量速查

| 变量 | 效果 |
|------|------|
| `tp.date.now("YYYY-MM-DD")` | 当前日期，如 `2026-03-01` |
| `tp.date.now("YYYY-MM-DD HH:mm")` | 带时间，如 `2026-03-01 18:10` |
| `tp.file.title` | 当前文件名（不含扩展名） |
| `tp.file.rename(新名称)` | 重命名文件 |
| `tp.system.prompt("提示")` | 弹窗输入 |
| `tp.system.suggester(显示列表, 值列表)` | 下拉选择 |

## 三、图片管理配置

粘贴图片到 Obsidian 时，默认使用 Wiki 链接格式（`![[image.png]]`），且图片保存位置不固定。以下配置让图片管理更规范。

### 3.1 设置图片保存路径

**设置** → **文件与链接**：

1. **附件默认存放路径** → 选「当前文件所在文件夹下的子文件夹中」
2. 下方输入框填 `assets`

粘贴图片后自动保存到当前 `.md` 文件同级的 `assets/` 文件夹。

### 3.2 使用标准 Markdown 图片格式

**设置** → **文件与链接** → 关闭「使用 Wiki 链接」

关闭前（Wiki 格式）：
```
![[Pasted image 20260301181059.png]]
```

关闭后（标准 Markdown 格式）：
```markdown
![](assets/Pasted image 20260301181059.png)
```

标准 Markdown 格式兼容性更好，方便在其他工具中使用。

### 3.3 设置内部链接类型

**设置** → **文件与链接** → **内部链接类型** → 选「基于当前笔记的相对路径」

这样图片路径是相对路径，移动文件夹时不会丢失引用。

## 四、Shell Commands 一键运行脚本

### 4.1 安装 Shell Commands

**设置** → **第三方插件** → 浏览 → 搜索 **Shell commands** → 安装 → 启用

### 4.2 添加命令

**设置** → **Shell Commands** → 点 **+** 添加新命令，填入：

```bash
cd "{{folder_path:absolute}}" && npx -y bun D:/code/wxgzh/baoyu-post-to-wechat/scripts/wechat-article.ts --markdown {{file_name}} --theme spring --localtemp
```

**变量说明：**

| 变量 | 含义 | 示例值 |
|------|------|--------|
| `{{folder_path:absolute}}` | 当前文件所在目录的绝对路径 | `D:\code\wxgzh\围巾` |
| `{{file_name}}` | 当前文件名（含扩展名） | `2026-03-01 分享钩针图解，三角围巾.md` |

通过 `cd` 命令切换到文件所在目录，确保脚本能正确找到相对路径的资源文件（如 `assets/` 中的图片）。

### 4.3 绑定快捷键

**设置** → **快捷键** → 搜索刚才创建的 Shell Command 名称 → 绑定快捷键（如 `Ctrl+Shift+W`）

写完文章后按 `Ctrl+Shift+W` 即可一键发布。

### 4.4 Shell Commands 常用变量

| 变量 | 含义 |
|------|------|
| `{{file_path:absolute}}` | 文件绝对路径 |
| `{{file_path:relative}}` | 文件相对路径 |
| `{{file_name}}` | 文件名（含扩展名） |
| `{{title}}` | 文件名（不含扩展名） |
| `{{folder_path:absolute}}` | 所在文件夹绝对路径 |
| `{{date:YYYY-MM-DD}}` | 当前日期 |

## 五、Commander 右键菜单集成

快捷键虽然方便，但有时更习惯右键操作。Commander 插件可以把命令添加到文件右键菜单。

### 5.1 安装 Commander

**设置** → **第三方插件** → 浏览 → 搜索 **Commander** → 安装 → 启用

### 5.2 添加到右键菜单

**设置** → **Commander** → **File Menu**（文件菜单）→ 点 **+** → 搜索刚才创建的 Shell Command 名称 → 添加

现在右键任意文件就能看到发布命令了。

## 六、完整工作流

配置完成后，写一篇公众号文章的流程变成：

1. `Ctrl+P` → `Templater: Create new note from template` → 选「围巾」
2. 弹窗输入标题，如「简单好看的三角围巾」
3. 文件自动创建为 `2026-03-01 分享钩针图解，简单好看的三角围巾.md`
4. 标题、推荐区、合集链接等固定内容已就位，直接写正文
5. 粘贴图片自动保存到 `assets/`，使用标准 Markdown 格式
6. 写完后 `Ctrl+Shift+W` 或右键 → 一键发布到微信公众号

从新建到发布，全程不离开 Obsidian。

## 七、总结

| 插件 | 用途 | 解决的问题 |
|------|------|-----------|
| Templater | 动态模板 | 自动命名、固定前缀、统一文章结构 |
| Shell Commands | 运行外部脚本 | 不切终端，一键发布 |
| Commander | 右键菜单 | 右键即可执行命令 |

三个插件各司其职，组合起来实现了从模板创建到一键发布的完整自动化流程。核心思路是**把重复操作固化到模板和脚本中**，让写作回归写作本身。
