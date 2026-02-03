---
title: OpenClaw 部署文档
description: OpenClaw + Discord + 飞书机器人的完整部署流程
date: 2026-02-03
categories: [部署]
tags: [openclaw, discord, feishu, podman, chatbot]
---

# OpenClaw 部署文档

> 记录 OpenClaw + Discord + 飞书机器人的完整部署流程

## 目录
- [环境准备](#环境准备)
- [OpenClaw Gateway 部署](#openclaw-gateway-部署)
- [Discord Bot 配置](#discord-bot-配置)
- [飞书机器人配置](#飞书机器人配置)
- [常见问题解决](#常见问题解决)
- [管理命令](#管理命令)

---

## 环境准备

### 必需软件
- Podman（容器运行环境）
- Node.js >= 18
- Git

### 环境变量
```bash
# AI API 密钥
export RDSEC_API_KEY="<YOUR_RDSEC_API_KEY>"

# Discord Bot Token
export DISCORD_BOT_TOKEN="<YOUR_DISCORD_BOT_TOKEN>"
```

---

## OpenClaw Gateway 部署

### 1. 创建数据目录
```bash
mkdir -p ~/openclaw-state
```

### 2. 启动容器

#### 完整启动命令
```bash
podman run -d \
  --name openclaw \
  -p 19789:18789 \
  --dns 8.8.8.8 \
  --dns <YOUR_INTERNAL_DNS_1> \
  --dns <YOUR_INTERNAL_DNS_2> \
  -v ~/openclaw-state:/home/node/.openclaw:Z \
  -e "RDSEC_API_KEY=<YOUR_RDSEC_API_KEY>" \
  -e "DISCORD_BOT_TOKEN=<YOUR_DISCORD_BOT_TOKEN>" \
  --entrypoint node \
  ghcr.io/openclaw/openclaw:main \
  /app/dist/index.js gateway --bind lan --port 18789 --allow-unconfigured
```

#### DNS 配置说明
- `8.8.8.8` - Google DNS，用于解析外部域名（Discord）
- `<YOUR_INTERNAL_DNS_1>, <YOUR_INTERNAL_DNS_2>` - 公司内部 DNS，用于解析内部域名（AI API）

### 3. 生成 Dashboard 访问 URL
```bash
podman exec openclaw node /app/dist/index.js dashboard --no-open
```

输出示例：
```
Dashboard URL: http://127.0.0.1:18789/?token=<GATEWAY_TOKEN>
```

实际访问地址（注意端口映射）：
```
http://localhost:19789/?token=<GATEWAY_TOKEN>
```

### 4. 设置 Gateway 端口（重要！）
```bash
podman exec openclaw node /app/dist/index.js config set gateway.port 19789
```

### 5. 批准设备配对

查看待配对设备：
```bash
podman exec openclaw cat /home/node/.openclaw/devices/pending.json
```

批准所有设备：
```bash
podman exec openclaw node -e "
const fs = require('fs');
const pending = JSON.parse(fs.readFileSync('/home/node/.openclaw/devices/pending.json', 'utf8'));
const paired = JSON.parse(fs.readFileSync('/home/node/.openclaw/devices/paired.json', 'utf8'));
for (const [id, device] of Object.entries(pending)) {
  paired[device.deviceId] = {
    deviceId: device.deviceId,
    publicKey: device.publicKey,
    roles: device.roles,
    scopes: device.scopes,
    approvedAt: Date.now()
  };
}
fs.writeFileSync('/home/node/.openclaw/devices/paired.json', JSON.stringify(paired, null, 2));
fs.writeFileSync('/home/node/.openclaw/devices/pending.json', JSON.stringify({}, null, 2));
console.log('已批准设备:', Object.keys(paired).length, '个');
"
```

然后重启容器应用配对：
```bash
podman restart openclaw
```

---

## Discord Bot 配置

### 1. 在 Discord Developer Portal 创建应用
访问：https://discord.com/developers/applications

### 2. 启用必要权限

在 **Bot** 页面启用 **Privileged Gateway Intents**：
- ✅ Presence Intent
- ✅ Server Members Intent
- ✅ **Message Content Intent**（必须！）

### 3. 获取 Bot Token
在 **Bot** 页面点击 "Reset Token" 获取 token。

### 4. 邀请 Bot 到服务器
使用此 URL（替换 CLIENT_ID）：
```
https://discord.com/api/oauth2/authorize?client_id=<YOUR_CLIENT_ID>&permissions=274877991936&scope=bot
```

### 5. 测试
在 Discord 中 @机器人名称 发送消息测试。

---

## 飞书机器人配置

### 1. 克隆飞书桥接项目
```bash
cd ~
git clone https://github.com/AlexAnys/feishu-openclaw.git
cd feishu-openclaw
npm install
```

### 2. 在飞书开放平台创建应用
访问：https://open.feishu.cn/app

#### 创建企业自建应用
1. 点击"创建企业自建应用"
2. 选择"机器人"能力
3. 填写应用名称和描述

#### 配置权限（必须！）
在"权限管理"页面启用：
- ✅ `im:message` - 获取与发送消息
- ✅ `im:message.group_at_msg` - 获取群聊@消息
- ✅ `im:message.p2p_msg` - 获取单聊消息
- ✅ `im:message:send_as_bot` - 以应用身份发消息

#### 配置事件订阅（关键！）
在"事件订阅"页面：
1. 订阅方式：选择 **"长连接"**（不是 Webhook）
2. 添加事件：`im.message.receive_v1`
3. 确认状态显示"已连接"

### 3. 保存应用凭证
```bash
# 创建凭证目录
mkdir -p ~/.clawdbot/secrets

# 保存 App Secret
echo "<YOUR_FEISHU_APP_SECRET>" > ~/.clawdbot/secrets/feishu_app_secret
chmod 600 ~/.clawdbot/secrets/feishu_app_secret
```

### 4. 启动飞书桥接服务

#### 一次性启动（测试用）
```bash
cd ~/feishu-openclaw
FEISHU_APP_ID=<YOUR_APP_ID> \
CLAWDBOT_CONFIG_PATH=~/openclaw-state/openclaw.json \
node bridge.mjs
```

#### 后台运行（推荐）
```bash
cd ~/feishu-openclaw
nohup env FEISHU_APP_ID=<YOUR_APP_ID> \
CLAWDBOT_CONFIG_PATH=~/openclaw-state/openclaw.json \
node bridge.mjs > /tmp/feishu-bridge.log 2>&1 &
```

#### 查看日志
```bash
tail -f /tmp/feishu-bridge.log
```

### 5. 设置开机自启动（可选）
```bash
cd ~/feishu-openclaw
node setup-service.mjs
launchctl load ~/Library/LaunchAgents/com.clawdbot.feishu-bridge.plist
```

---

## 常见问题解决

### 问题1：Discord 无法连接

**症状：**
```
[discord] [default] channel exited: Failed to resolve Discord application id
```

**解决方案：**
配置 DNS 为 Google DNS (8.8.8.8)：
```bash
podman rm -f openclaw
# 在启动命令中添加 --dns 8.8.8.8
```

### 问题2：AI API 无法访问

**症状：**
```
Could not resolve host: <YOUR_INTERNAL_AI_API_DOMAIN>
```

**解决方案：**
添加公司内部 DNS：
```bash
--dns <YOUR_INTERNAL_DNS_1> --dns <YOUR_INTERNAL_DNS_2>
```

### 问题3：Discord Gateway 频繁断开重连

**症状：**
```
[discord] gateway error: Error: Client network socket disconnected
[discord] gateway: Reconnecting with backoff
```

**说明：**
这是正常现象（由于网络环境限制），bot 仍可正常响应消息。

**解决方案（如果影响使用）：**
禁用 Discord，只使用飞书：
```bash
podman exec openclaw node /app/dist/index.js config set plugins.entries.discord.enabled false
podman restart openclaw
```

### 问题4：飞书桥接 "connect refused"

**症状：**
```
Error: connect ECONNREFUSED 127.0.0.1:18789
```

**原因：**
配置文件中的端口配置不正确。

**解决方案：**
设置正确的 gateway 端口：
```bash
podman exec openclaw node /app/dist/index.js config set gateway.port 19789
```

### 问题5：Control UI "pairing required"

**解决方案：**
参考 [批准设备配对](#5-批准设备配对) 部分。

### 问题6：Discord 响应很慢（40-60秒）

**原因：**
DNS 解析问题导致 AI API 访问慢。

**解决方案：**
使用混合 DNS 配置（参考 [DNS 配置说明](#dns-配置说明)）。

---

## 管理命令

### OpenClaw 容器管理

#### 查看容器状态
```bash
podman ps --filter name=openclaw
```

#### 查看日志
```bash
# 实时日志
podman logs -f openclaw

# 最近日志
podman logs --tail 50 openclaw
```

#### 重启容器
```bash
podman restart openclaw
```

#### 停止容器
```bash
podman stop openclaw
```

#### 删除容器
```bash
podman rm -f openclaw
```

#### 进入容器
```bash
podman exec -it openclaw /bin/sh
```

### OpenClaw 配置管理

#### 查看配置
```bash
# 查看完整配置
podman exec openclaw cat /home/node/.openclaw/openclaw.json

# 查看特定配置项
podman exec openclaw node /app/dist/index.js config get agents.defaults.model
```

#### 修改配置
```bash
# 设置配置项
podman exec openclaw node /app/dist/index.js config set <key> <value>

# 示例：禁用 Discord
podman exec openclaw node /app/dist/index.js config set plugins.entries.discord.enabled false
```

#### 查看 Channels 状态
```bash
podman exec openclaw node /app/dist/index.js channels status
```

### 飞书桥接服务管理

#### 查看进程
```bash
ps aux | grep "node bridge.mjs" | grep -v grep
```

#### 停止服务
```bash
pkill -f "node bridge.mjs"
```

#### 查看日志（如果使用 nohup）
```bash
tail -f /tmp/feishu-bridge.log
```

### 设备配对管理

#### 查看已配对设备
```bash
podman exec openclaw cat /home/node/.openclaw/devices/paired.json
```

#### 查看待配对设备
```bash
podman exec openclaw cat /home/node/.openclaw/devices/pending.json
```

#### 清空待配对列表
```bash
podman exec openclaw bash -c 'echo "{}" > /home/node/.openclaw/devices/pending.json'
```

---

## 快速启动脚本

### 启动脚本（start-openclaw.sh）
```bash
#!/bin/bash

# 环境变量
export RDSEC_API_KEY="<YOUR_RDSEC_API_KEY>"
export DISCORD_BOT_TOKEN="<YOUR_DISCORD_BOT_TOKEN>"
export FEISHU_APP_ID="<YOUR_FEISHU_APP_ID>"

# 启动 OpenClaw
echo "启动 OpenClaw Gateway..."
podman run -d \
  --name openclaw \
  -p 19789:18789 \
  --dns 8.8.8.8 \
  --dns <YOUR_INTERNAL_DNS_1> \
  --dns <YOUR_INTERNAL_DNS_2> \
  -v ~/openclaw-state:/home/node/.openclaw:Z \
  -e "RDSEC_API_KEY=${RDSEC_API_KEY}" \
  -e "DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}" \
  --entrypoint node \
  ghcr.io/openclaw/openclaw:main \
  /app/dist/index.js gateway --bind lan --port 18789 --allow-unconfigured

echo "等待容器启动..."
sleep 8

# 启动飞书桥接
echo "启动飞书桥接服务..."
cd ~/feishu-openclaw
nohup env FEISHU_APP_ID=${FEISHU_APP_ID} \
CLAWDBOT_CONFIG_PATH=~/openclaw-state/openclaw.json \
node bridge.mjs > /tmp/feishu-bridge.log 2>&1 &

echo "所有服务已启动！"
echo ""
echo "Control UI: http://localhost:19789/?token=<GATEWAY_TOKEN>"
echo ""
echo "查看日志："
echo "  OpenClaw: podman logs -f openclaw"
echo "  飞书桥接: tail -f /tmp/feishu-bridge.log"
```

### 停止脚本（stop-openclaw.sh）
```bash
#!/bin/bash

echo "停止飞书桥接服务..."
pkill -f "node bridge.mjs"

echo "停止 OpenClaw 容器..."
podman stop openclaw
podman rm -f openclaw

echo "所有服务已停止！"
```

---

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                     用户界面层                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ Discord  │  │   飞书   │  │   Control UI (Web)   │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
           │              │                    │
           │              │                    │
           ▼              ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│                     桥接层                               │
│  ┌──────────────┐  ┌─────────────────────────────────┐  │
│  │ Discord Bot  │  │  飞书桥接服务 (Node.js)          │  │
│  │  (内置)      │  │  ~/feishu-openclaw/bridge.mjs   │  │
│  └──────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
           │                          │
           └──────────┬───────────────┘
                      ▼
┌─────────────────────────────────────────────────────────┐
│             OpenClaw Gateway (容器)                      │
│  端口映射: 19789:18789                                   │
│  数据卷: ~/openclaw-state:/home/node/.openclaw          │
│  DNS: 8.8.8.8, <YOUR_INTERNAL_DNS_1>, <YOUR_INTERNAL_DNS_2>  │
└─────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                   AI 服务层                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Internal AI Endpoint API                       │   │
│  │  - Gemini 3 Pro                                 │   │
│  │  - Claude 4.5 Sonnet/Opus                       │   │
│  │  - GPT-5.2                                      │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 配置文件示例

### OpenClaw 配置文件
位置：`~/openclaw-state/openclaw.json`

关键配置项：
```json
{
  "gateway": {
    "auth": {
      "token": "<GATEWAY_TOKEN>"
    },
    "port": 19789
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "<YOUR_AI_PROVIDER>/gemini-3-pro"
      }
    }
  },
  "plugins": {
    "entries": {
      "discord": {
        "enabled": true
      }
    }
  }
}
```

---

## 验证清单

部署完成后，请检查以下各项：

### OpenClaw Gateway
- [ ] 容器运行中：`podman ps --filter name=openclaw`
- [ ] 端口可访问：`curl -I http://localhost:19789`
- [ ] Control UI 可打开：访问 dashboard URL

### Discord Bot
- [ ] Bot 已登录：查看日志 `[discord] logged in to discord`
- [ ] 消息可响应：在 Discord 中 @机器人测试
- [ ] Gateway 权限已启用：Discord Developer Portal

### 飞书机器人
- [ ] 桥接服务运行：`ps aux | grep bridge.mjs`
- [ ] WebSocket 已连接：查看日志 `[ws] ws client ready`
- [ ] 事件订阅配置：飞书开放平台显示"已连接"
- [ ] 消息可响应：在飞书中向机器人发送消息

---

## 参考链接

- [OpenClaw 官方文档](https://docs.openclaw.ai/)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [飞书-OpenClaw 桥接项目](https://github.com/AlexAnys/feishu-openclaw)
- [Discord Developer Portal](https://discord.com/developers/applications)
- [飞书开放平台](https://open.feishu.cn/)

---

## 更新日志

### 2026-02-03
- 初始版本
- 完成 OpenClaw + Discord + 飞书的完整部署
- 解决 DNS 配置问题
- 优化响应速度

---

**文档维护者：** Emily Wang
**最后更新：** 2026-02-03
