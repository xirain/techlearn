---
title: WSL 2 环境优化与存储迁移指南
description: 将 WSL 2 从 C 盘迁移至其他磁盘，解决跨平台开发中的网络代理与性能问题
date: 2026-02-09
categories: [环境配置]
tags: [wsl, windows, linux, 环境配置]
---

# WSL 2 环境优化与存储迁移指南

本指南记录了如何将 WSL 2 从 C 盘迁移至其他磁盘，并解决跨平台开发中的网络代理与性能问题。

------

## 一、 查看与管理状态

在进行任何重大变更前，需确认 WSL 的运行状态：

- **查看分发版列表及版本：**

  `wsl -l -v`

- **彻底关闭 WSL：**

  `wsl --shutdown`

------

## 二、 存储搬家：将 WSL 迁移至 D 盘

为了释放 C 盘空间并保持高性能，建议将分发版迁移至非系统盘。

1. **导出备份：**

   将现有的分发版打包（例如 Ubuntu）：

   `wsl --export <DistroName> D:\wsl_backup.tar`

2. **注销原分发版：**

   **注意：** 这将删除 C 盘上的旧数据。

   `wsl --unregister <DistroName>`

3. **导入至新位置：**

   将系统安装到 D 盘指定文件夹：

   `wsl --import <NewName> D:\WSL_Data D:\wsl_backup.tar`

------

## 三、 用户与权限修复

通过 `import` 导入的系统默认以 `root` 登录，需手动恢复普通用户身份。

1. **修改 `/etc/wsl.conf`：**

   在 WSL 终端中执行 `sudo nano /etc/wsl.conf`，添加以下内容：

   ```ini
   [user]
   default=<YourUserName>

   [boot]
   systemd=true
   ```

2. **重启生效：**

   在 PowerShell 中执行 `wsl --shutdown` 后重新进入。

------

## 四、 网络与代理优化（Windows 11 镜像模式）

解决 WSL 2 在 NAT 模式下无法识别宿主机 `localhost` 代理的问题。

1. **创建全局配置文件：**

   在 Windows 用户目录下（`C:\Users\<User>\`）创建 `.wslconfig` 文件。

2. **配置镜像网络：**

   写入以下内容以开启 **Mirrored** 模式：

   ```ini
   [wsl2]
   # 开启镜像网络模式，使 WSL 与 Windows 共享 IP 和代理
   networkingMode=mirrored
   dnsTunneling=true
   firewall=true
   autoProxy=true
   ```

3. **验证：**

   重启后使用 `curl -I https://www.google.com` 检查连通性。

------

## 五、 性能最佳实践

- **文件存储：** 始终将项目代码放在 Linux 内部路径（如 `~/projects`），避免放在 `/mnt/c/` 或 `/mnt/d/` 下，以获得最佳 IO 性能。
- **内存控制：** 若 `vmmem` 占用过高，可在 `.wslconfig` 中添加 `memory=4GB` 等参数限制最大内存。
