---
title: WSL 2 终端美化指南 - Zsh + Oh My Zsh 配置
description: 在 WSL 2 环境下配置 Zsh、Oh My Zsh 及常用插件，打造高效终端体验
date: 2026-02-10
categories: [环境配置]
tags: [wsl, zsh, oh-my-zsh, 终端美化, 环境配置]
---

本指南记录了在 **Windows 11 + WSL 2** 环境下，配置 **Zsh** 和 **Oh My Zsh** 的完整流程，包含核心插件的安装与配置。

---

## 一、Trae 远程连接配置

> Trae 基于 VS Code 架构，可通过 WSL 扩展直接连接 Linux 环境。

1. **安装扩展**：在 Trae 的扩展市场搜索并安装 **WSL** (Microsoft 官方)。
2. **建立连接**：点击 Trae 左下角的绿色图标 `><`，选择 **Connect to WSL using Distro...**，然后选择你的分发版名称。

---

## 二、安装 Zsh + Oh My Zsh

### 1. 安装 Zsh

```bash
# 更新包管理器并安装 Zsh
sudo apt update && sudo apt install zsh -y
```

### 2. 安装 Oh My Zsh

```bash
# 一键安装脚本
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
```

安装完成后，Oh My Zsh 会自动将 Zsh 设置为默认 Shell。

---

## 三、用户与 Shell 配置

编辑 `/etc/wsl.conf` 以固定默认登录用户和开启 systemd：

```bash
sudo nano /etc/wsl.conf
```

添加以下内容：

```ini
[user]
default=<你的用户名>

[boot]
systemd=true
```

保存后，在 PowerShell 中执行 `wsl --shutdown` 重启 WSL 使配置生效。

---

## 四、核心插件安装

### 1. zsh-autosuggestions（命令自动建议）

类似 Fish Shell 的自动建议功能，根据历史记录智能提示命令。

**安装：**

```bash
git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions
```

**可选配置（添加到 `~/.zshrc`）：**

```bash
# 自定义建议样式
ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=#ff00ff,bg=cyan,bold,underline"

# 建议策略：优先历史记录，其次补全
ZSH_AUTOSUGGEST_STRATEGY=(history completion)
```

---

### 2. zsh-syntax-highlighting（语法高亮）

实时高亮命令行语法，快速识别语法错误。

**安装：**

```bash
git clone https://github.com/zsh-users/zsh-syntax-highlighting.git ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting
```

---

### 3. autojump（目录快速跳转）

根据访问频率智能跳转目录，告别繁琐的 `cd` 路径输入。

**安装：**

```bash
git clone git://github.com/wting/autojump.git ~/autojump
cd ~/autojump
./install.py
```

**配置：**

安装完成后，按照提示将以下内容添加到 `~/.zshrc`：

```bash
[[ -s ~/.autojump/etc/profile.d/autojump.sh ]] && source ~/.autojump/etc/profile.d/autojump.sh
```

**使用示例：**

```bash
# 第一次访问目录
cd ~/projects/my-awesome-project

# 之后可以直接跳转
j awesome    # 跳转到包含 "awesome" 的最常访问目录
```

---

## 五、激活插件配置

编辑 `~/.zshrc` 文件：

```bash
nano ~/.zshrc
```

找到 `plugins=(git)` 这一行，修改为：

```bash
plugins=(
    git
    zsh-autosuggestions
    zsh-syntax-highlighting
    autojump
)
```

使配置生效：

```bash
source ~/.zshrc
```

---

## 六、效果预览

配置完成后，你的终端将具备以下能力：

| 功能 | 说明 |
|------|------|
| **命令自动建议** | 输入时自动显示历史命令建议，按 `→` 接受 |
| **语法高亮** | 正确命令显示绿色，错误命令显示红色 |
| **目录快速跳转** | 使用 `j <关键词>` 快速切换目录 |
| **Git 状态显示** | 命令提示符显示当前分支和状态 |

---

## 常见问题

### Q1：安装后终端显示乱码？

**解决方案**：安装 Nerd Font 字体（如 FiraCode Nerd Font），并在终端设置中选择该字体。

### Q2：插件没有生效？

**检查步骤**：
1. 确认插件已正确克隆到 `~/.oh-my-zsh/custom/plugins/` 目录
2. 确认 `~/.zshrc` 中的 plugins 列表包含插件名
3. 执行 `source ~/.zshrc` 重新加载配置

### Q3：autojump 不工作？

**解决方案**：autojump 需要"学习"你的访问习惯。首次安装后需要先用 `cd` 访问几次目录，之后才能用 `j` 跳转。

---

## 参考链接

- [Oh My Zsh 官方文档](https://ohmyz.sh/)
- [zsh-autosuggestions GitHub](https://github.com/zsh-users/zsh-autosuggestions)
- [zsh-syntax-highlighting GitHub](https://github.com/zsh-users/zsh-syntax-highlighting)
- [autojump GitHub](https://github.com/wting/autojump)

---

**文档维护者：** xirain  
**最后更新：** 2026-02-10
