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
- [自定义 LLM 配置（Docker）](#自定义-llm-配置docker)
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

> ⚠️ **重要更新（v2026.2.2）**：OpenClaw 现已官方支持飞书/Lark！推荐使用官方插件替代第三方桥接方案。

### 方式一：官方插件（推荐）

自 v2026.2.2 起，OpenClaw 官方支持飞书通道，使用 WebSocket 长连接接收消息，无需公网 URL。

#### 1. 安装飞书插件

```bash
# 安装官方飞书插件
podman exec openclaw node /app/dist/index.js plugins install @openclaw/feishu

# 或从本地 git 仓库安装
podman exec openclaw node /app/dist/index.js plugins install ./extensions/feishu
```

#### 2. 在飞书开放平台创建应用

访问：https://open.feishu.cn/app（国际版 Lark 用户访问 https://open.larksuite.com/app）

##### 创建企业自建应用
1. 点击"创建企业自建应用"
2. 填写应用名称和描述
3. 选择应用图标

##### 获取应用凭证
在「凭证与基础信息」页面，复制：
- **App ID**（格式：`cli_xxx`）
- **App Secret**

❗ **重要**：妥善保管 App Secret，不要泄露。

##### 配置权限（批量导入）
在「权限管理」页面，点击「批量导入」，粘贴以下 JSON：

```json
{
  "scopes": {
    "tenant": [
      "aily:file:read",
      "aily:file:write",
      "application:application.app_message_stats.overview:readonly",
      "application:application:self_manage",
      "application:bot.menu:write",
      "contact:user.employee_id:readonly",
      "corehr:file:download",
      "event:ip_list",
      "im:chat.access_event.bot_p2p_chat:read",
      "im:chat.members:bot_access",
      "im:message",
      "im:message.group_at_msg:readonly",
      "im:message.p2p_msg:readonly",
      "im:message:readonly",
      "im:message:send_as_bot",
      "im:resource"
    ],
    "user": ["aily:file:read", "aily:file:write", "im:chat.access_event.bot_p2p_chat:read"]
  }
}
```

##### 启用机器人能力
在「应用能力」>「机器人」中：
1. 启用机器人能力
2. 设置机器人名称

##### 配置事件订阅（关键！）
在「事件订阅」页面：
1. 订阅方式：选择 **「使用长连接接收事件」**（WebSocket）
2. 添加事件：`im.message.receive_v1`

⚠️ 配置事件订阅前，请确保 Gateway 已运行。

##### 发布应用
1. 在「版本管理与发布」创建版本
2. 提交审核并发布
3. 等待管理员审批（企业自建应用通常自动审批）

#### 3. 配置 OpenClaw

##### 方式 A：使用向导（推荐）
```bash
podman exec -it openclaw node /app/dist/index.js channels add
# 选择 Feishu，输入 App ID 和 App Secret
```

##### 方式 B：配置文件
编辑 `~/openclaw-state/openclaw.json`：

```json5
{
  channels: {
    feishu: {
      enabled: true,
      dmPolicy: "pairing",  // pairing | allowlist | open | disabled
      accounts: {
        main: {
          appId: "cli_xxx",
          appSecret: "xxx",
          botName: "我的 AI 助手"
        }
      }
    }
  }
}
```

##### 方式 C：环境变量
```bash
# 在容器启动时添加
-e "FEISHU_APP_ID=cli_xxx" \
-e "FEISHU_APP_SECRET=xxx"
```

##### 国际版 Lark 配置
如果使用国际版 Lark，需要设置 domain：

```json5
{
  channels: {
    feishu: {
      domain: "lark",  // 或完整域名
      accounts: {
        main: {
          appId: "cli_xxx",
          appSecret: "xxx"
        }
      }
    }
  }
}
```

#### 4. 启动并测试

```bash
# 重启 Gateway 应用配置
podman restart openclaw

# 查看状态
podman exec openclaw node /app/dist/index.js gateway status

# 查看日志
podman logs -f openclaw
```

#### 5. 配对用户

默认情况下，未知用户发消息会收到配对码。批准配对：

```bash
# 查看待配对列表
podman exec openclaw node /app/dist/index.js pairing list feishu

# 批准配对
podman exec openclaw node /app/dist/index.js pairing approve feishu <CODE>
```

#### 6. 群聊配置

##### 允许所有群聊，需要 @提及（默认）
```json5
{
  channels: {
    feishu: {
      groupPolicy: "open"
      // 默认 requireMention: true
    }
  }
}
```

##### 允许所有群聊，无需 @提及
```json5
{
  channels: {
    feishu: {
      groups: {
        "oc_xxx": { requireMention: false }
      }
    }
  }
}
```

##### 仅允许特定用户
```json5
{
  channels: {
    feishu: {
      groupPolicy: "allowlist",
      groupAllowFrom: ["ou_xxx", "ou_yyy"]
    }
  }
}
```

#### 官方插件配置参考

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `channels.feishu.enabled` | 启用/禁用通道 | `true` |
| `channels.feishu.domain` | API 域名（`feishu` 或 `lark`） | `feishu` |
| `channels.feishu.accounts.<id>.appId` | App ID | - |
| `channels.feishu.accounts.<id>.appSecret` | App Secret | - |
| `channels.feishu.dmPolicy` | 私聊策略 | `pairing` |
| `channels.feishu.allowFrom` | 私聊白名单（open_id 列表） | - |
| `channels.feishu.groupPolicy` | 群聊策略（`open`/`allowlist`/`disabled`） | `open` |
| `channels.feishu.groupAllowFrom` | 群聊白名单 | - |
| `channels.feishu.groups.<chat_id>.requireMention` | 是否需要 @提及 | `true` |
| `channels.feishu.textChunkLimit` | 消息分块大小 | `2000` |
| `channels.feishu.mediaMaxMb` | 媒体文件大小限制 | `30` |

---

### 方式二：第三方桥接（旧方案）

> ⚠️ **注意**：此方案已不推荐，建议迁移到官方插件。保留此内容供参考。

<details>
<summary>点击展开旧方案</summary>

#### 1. 克隆飞书桥接项目
```bash
cd ~
git clone https://github.com/AlexAnys/feishu-openclaw.git
cd feishu-openclaw
npm install
```

#### 2. 在飞书开放平台创建应用
访问：https://open.feishu.cn/app

##### 创建企业自建应用
1. 点击"创建企业自建应用"
2. 选择"机器人"能力
3. 填写应用名称和描述

##### 配置权限（必须！）
在"权限管理"页面启用：
- ✅ `im:message` - 获取与发送消息
- ✅ `im:message.group_at_msg` - 获取群聊@消息
- ✅ `im:message.p2p_msg` - 获取单聊消息
- ✅ `im:message:send_as_bot` - 以应用身份发消息

##### 配置事件订阅（关键！）
在"事件订阅"页面：
1. 订阅方式：选择 **"长连接"**（不是 Webhook）
2. 添加事件：`im.message.receive_v1`
3. 确认状态显示"已连接"

#### 3. 保存应用凭证
```bash
# 创建凭证目录
mkdir -p ~/.clawdbot/secrets

# 保存 App Secret
echo "<YOUR_FEISHU_APP_SECRET>" > ~/.clawdbot/secrets/feishu_app_secret
chmod 600 ~/.clawdbot/secrets/feishu_app_secret
```

#### 4. 启动飞书桥接服务

##### 一次性启动（测试用）
```bash
cd ~/feishu-openclaw
FEISHU_APP_ID=<YOUR_APP_ID> \
CLAWDBOT_CONFIG_PATH=~/openclaw-state/openclaw.json \
node bridge.mjs
```

##### 后台运行（推荐）
```bash
cd ~/feishu-openclaw
nohup env FEISHU_APP_ID=<YOUR_APP_ID> \
CLAWDBOT_CONFIG_PATH=~/openclaw-state/openclaw.json \
node bridge.mjs > /tmp/feishu-bridge.log 2>&1 &
```

##### 查看日志
```bash
tail -f /tmp/feishu-bridge.log
```

#### 5. 设置开机自启动（可选）
```bash
cd ~/feishu-openclaw
node setup-service.mjs
launchctl load ~/Library/LaunchAgents/com.clawdbot.feishu-bridge.plist
```

</details>

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

### 问题4：飞书机器人无响应

**症状：**
在飞书中发消息给机器人，没有收到回复。

**解决方案（官方插件）：**
1. 确保应用已发布并审批通过
2. 确保事件订阅包含 `im.message.receive_v1`
3. 确保使用「长连接」接收事件
4. 确保应用权限完整
5. 检查 Gateway 是否运行：`podman exec openclaw node /app/dist/index.js gateway status`
6. 查看日志：`podman logs -f openclaw`

**解决方案（旧版桥接）：**
检查桥接服务是否运行：`ps aux | grep bridge.mjs`

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

### 飞书通道管理（官方插件）

#### 查看飞书通道状态
```bash
podman exec openclaw node /app/dist/index.js channels status
```

#### 管理飞书配对
```bash
# 查看待配对列表
podman exec openclaw node /app/dist/index.js pairing list feishu

# 批准配对
podman exec openclaw node /app/dist/index.js pairing approve feishu <CODE>
```

### 飞书桥接服务管理（旧方案）

> ⚠️ 仅适用于使用第三方桥接的旧部署。

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

> ⚠️ 以下脚本使用官方飞书插件。如果使用旧版第三方桥接，请参考[飞书机器人配置](#飞书机器人配置)中的「方式二」。

### 启动脚本（start-openclaw.sh）
```bash
#!/bin/bash

# 环境变量
export RDSEC_API_KEY="<YOUR_RDSEC_API_KEY>"
export DISCORD_BOT_TOKEN="<YOUR_DISCORD_BOT_TOKEN>"
export FEISHU_APP_ID="<YOUR_FEISHU_APP_ID>"
export FEISHU_APP_SECRET="<YOUR_FEISHU_APP_SECRET>"

# 启动 OpenClaw（包含官方飞书支持）
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
  -e "FEISHU_APP_ID=${FEISHU_APP_ID}" \
  -e "FEISHU_APP_SECRET=${FEISHU_APP_SECRET}" \
  --entrypoint node \
  ghcr.io/openclaw/openclaw:main \
  /app/dist/index.js gateway --bind lan --port 18789 --allow-unconfigured

echo "等待容器启动..."
sleep 8

echo "所有服务已启动！"
echo ""
echo "Control UI: http://localhost:19789/?token=<GATEWAY_TOKEN>"
echo ""
echo "查看日志："
echo "  OpenClaw: podman logs -f openclaw"
echo ""
echo "配置飞书（如果尚未配置）："
echo "  podman exec -it openclaw node /app/dist/index.js channels add"
```

### 停止脚本（stop-openclaw.sh）
```bash
#!/bin/bash

echo "停止 OpenClaw 容器..."
podman stop openclaw
podman rm -f openclaw

echo "所有服务已停止！"
```

---

## 自定义 LLM 配置（Docker）

OpenClaw 支持配置自定义 LLM 提供商，包括使用自定义 API 端点和 token。以下是 Docker 部署中的详细配置方法。

### 1. 环境变量方式

最简单的方式是通过环境变量传递 API 密钥：

```bash
podman run -d \
  --name openclaw \
  -p 19789:18789 \
  -v ~/openclaw-state:/home/node/.openclaw:Z \
  -e "OPENAI_API_KEY=sk-your-api-key" \
  -e "ANTHROPIC_API_KEY=sk-ant-your-key" \
  -e "GEMINI_API_KEY=your-gemini-key" \
  --entrypoint node \
  ghcr.io/openclaw/openclaw:main \
  /app/dist/index.js gateway --bind lan --port 18789 --allow-unconfigured
```

#### 支持的环境变量

| 提供商 | 环境变量 |
|--------|----------|
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google Gemini | `GEMINI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Z.AI (GLM) | `ZAI_API_KEY` |
| Groq | `GROQ_API_KEY` |
| xAI | `XAI_API_KEY` |
| MiniMax | `MINIMAX_API_KEY` |
| Moonshot | `MOONSHOT_API_KEY` |
| OpenCode Zen | `OPENCODE_API_KEY` |

### 2. 配置文件方式（推荐）

对于更复杂的配置，建议使用配置文件 `~/openclaw-state/openclaw.json`：

#### 基本 LLM 配置

```json5
{
  // 环境变量（优先级低于系统环境变量）
  env: {
    OPENAI_API_KEY: "sk-your-api-key",
    ANTHROPIC_API_KEY: "sk-ant-your-key",
  },

  // 代理配置
  agents: {
    defaults: {
      // 主模型
      model: {
        primary: "openai/gpt-5.2",
        // 备选模型（主模型失败时使用）
        fallbacks: ["anthropic/claude-sonnet-4-5", "google/gemini-3-pro"]
      },
      workspace: "~/.openclaw/workspace"
    }
  }
}
```

#### 自定义 API 端点配置

如果需要使用自定义 API 端点（如 Azure OpenAI、本地 Ollama 或第三方代理），使用 `models.providers` 配置：

```json5
{
  agents: {
    defaults: {
      model: { primary: "custom-provider/your-model" }
    }
  },
  
  models: {
    mode: "merge", // 与内置提供商合并
    providers: {
      // 自定义 OpenAI 兼容端点
      "custom-provider": {
        baseUrl: "https://your-api-endpoint.com/v1",
        apiKey: "your-api-key",
        api: "openai-completions", // 或 "anthropic-messages"
        models: [
          {
            id: "your-model",
            name: "Your Custom Model",
            reasoning: false,
            contextWindow: 128000,
            maxTokens: 4096
          }
        ]
      }
    }
  }
}
```

### 3. 常见自定义配置示例

#### 使用本地 Ollama

```json5
{
  agents: {
    defaults: {
      model: { primary: "ollama/llama3.3" }
    }
  },
  
  models: {
    providers: {
      ollama: {
        baseUrl: "http://host.docker.internal:11434/v1",
        apiKey: "ollama-local",
        api: "openai-completions"
      }
    }
  }
}
```

Docker 运行命令（需要添加网络访问）：

```bash
podman run -d \
  --name openclaw \
  -p 19789:18789 \
  --add-host=host.docker.internal:host-gateway \
  -v ~/openclaw-state:/home/node/.openclaw:Z \
  --entrypoint node \
  ghcr.io/openclaw/openclaw:main \
  /app/dist/index.js gateway --bind lan --port 18789 --allow-unconfigured
```

#### 使用 OpenRouter（多模型代理）

```json5
{
  env: {
    OPENROUTER_API_KEY: "sk-or-v1-your-key"
  },
  
  agents: {
    defaults: {
      model: { primary: "openrouter/anthropic/claude-sonnet-4-5" }
    }
  }
}
```

#### 使用 Azure OpenAI

```json5
{
  models: {
    providers: {
      "azure-openai": {
        baseUrl: "https://your-resource.openai.azure.com/openai/deployments/your-deployment",
        apiKey: "your-azure-api-key",
        api: "openai-completions",
        models: [
          {
            id: "gpt-4",
            name: "Azure GPT-4",
            contextWindow: 128000,
            maxTokens: 4096
          }
        ]
      }
    }
  },
  
  agents: {
    defaults: {
      model: { primary: "azure-openai/gpt-4" }
    }
  }
}
```

#### 使用国产大模型（MiniMax）

```json5
{
  env: {
    MINIMAX_API_KEY: "your-minimax-key"
  },
  
  agents: {
    defaults: {
      model: { primary: "minimax/MiniMax-M2.1" }
    }
  },
  
  models: {
    providers: {
      minimax: {
        baseUrl: "https://api.minimax.io/anthropic",
        api: "anthropic-messages"
      }
    }
  }
}
```

#### 使用 Moonshot AI（Kimi）

```json5
{
  env: {
    MOONSHOT_API_KEY: "sk-your-moonshot-key"
  },
  
  agents: {
    defaults: {
      model: { primary: "moonshot/kimi-k2.5" }
    }
  },
  
  models: {
    providers: {
      moonshot: {
        baseUrl: "https://api.moonshot.ai/v1",
        apiKey: "${MOONSHOT_API_KEY}",
        api: "openai-completions",
        models: [
          { id: "kimi-k2.5", name: "Kimi K2.5" }
        ]
      }
    }
  }
}
```

### 4. 环境变量替换

配置文件支持环境变量替换，使用 `${VAR_NAME}` 语法：

```json5
{
  models: {
    providers: {
      "custom-provider": {
        baseUrl: "${CUSTOM_API_BASE}/v1",
        apiKey: "${CUSTOM_API_KEY}"
      }
    }
  }
}
```

Docker 运行命令：

```bash
podman run -d \
  --name openclaw \
  -p 19789:18789 \
  -v ~/openclaw-state:/home/node/.openclaw:Z \
  -e "CUSTOM_API_BASE=https://your-api.com" \
  -e "CUSTOM_API_KEY=your-key" \
  --entrypoint node \
  ghcr.io/openclaw/openclaw:main \
  /app/dist/index.js gateway --bind lan --port 18789 --allow-unconfigured
```

### 5. 使用 .env 文件

OpenClaw 也支持从 `.env` 文件加载环境变量：

```bash
# 创建 .env 文件
cat > ~/openclaw-state/.env << 'EOF'
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-key
CUSTOM_API_BASE=https://your-api.com
EOF
```

### 6. 运行时修改模型配置

通过 CLI 命令修改模型配置：

```bash
# 设置主模型
podman exec openclaw node /app/dist/index.js models set openai/gpt-5.2

# 查看当前模型配置
podman exec openclaw node /app/dist/index.js models status

# 列出可用模型
podman exec openclaw node /app/dist/index.js models list
```

### 7. 验证 LLM 配置

检查配置是否正确：

```bash
# 查看完整配置
podman exec openclaw cat /home/node/.openclaw/openclaw.json

# 检查模型状态
podman exec openclaw node /app/dist/index.js models status

# 运行诊断
podman exec openclaw node /app/dist/index.js doctor
```

---

## 系统架构

> 📝 v2026.2.2 起，飞书已内置支持，无需独立桥接服务。

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
│             OpenClaw Gateway (容器)                      │
│  ┌──────────────┐  ┌──────────────┐                     │
│  │ Discord Bot  │  │  Feishu Bot  │  ← 官方插件 (v2026.2.2+)
│  │  (内置)      │  │   (内置)     │                     │
│  └──────────────┘  └──────────────┘                     │
│                                                         │
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

### 飞书机器人（官方插件，v2026.2.2+）
- [ ] 插件已安装：`podman exec openclaw node /app/dist/index.js plugins list`
- [ ] 通道已启用：`podman exec openclaw node /app/dist/index.js channels status`
- [ ] 飞书应用已发布：飞书开放平台显示"已上线"
- [ ] 事件订阅配置：飞书开放平台显示「长连接」已连接
- [ ] 消息可响应：在飞书中向机器人发送消息

### 飞书机器人（旧版桥接）
- [ ] 桥接服务运行：`ps aux | grep bridge.mjs`
- [ ] WebSocket 已连接：查看日志 `[ws] ws client ready`
- [ ] 事件订阅配置：飞书开放平台显示"已连接"
- [ ] 消息可响应：在飞书中向机器人发送消息

---

## 参考链接

- [OpenClaw 官方文档](https://docs.openclaw.ai/)
- [OpenClaw 飞书通道文档](https://docs.openclaw.ai/channels/feishu)
- [OpenClaw 模型配置文档](https://docs.openclaw.ai/concepts/model-providers)
- [OpenClaw Gateway 配置文档](https://docs.openclaw.ai/gateway/configuration)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [OpenClaw v2026.2.2 Release Notes](https://github.com/openclaw/openclaw/releases/tag/v2026.2.2)
- [飞书-OpenClaw 桥接项目（旧）](https://github.com/AlexAnys/feishu-openclaw)
- [Discord Developer Portal](https://discord.com/developers/applications)
- [飞书开放平台](https://open.feishu.cn/)

---

## 更新日志

### 2026-02-05
- **重大更新**：飞书机器人配置改用官方插件（v2026.2.2+），保留旧版桥接方案作为参考
- 更新系统架构图，反映飞书已内置支持
- 更新快速启动脚本，简化飞书配置
- 更新验证清单和参考链接
- 新增「自定义 LLM 配置」章节
- 添加多种 LLM 提供商配置示例（Ollama、OpenRouter、Azure、MiniMax、Moonshot）
- 添加环境变量替换和 .env 文件支持说明
- 添加运行时模型配置修改方法

### 2026-02-03
- 初始版本
- 完成 OpenClaw + Discord + 飞书的完整部署
- 解决 DNS 配置问题
- 优化响应速度

---

**文档维护者：** Emily Wang
**最后更新：** 2026-02-05
