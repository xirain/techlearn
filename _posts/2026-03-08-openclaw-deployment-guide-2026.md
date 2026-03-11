---
title: OpenClaw 部署与多平台对接完全指南（2026）
description: OpenClaw 部署最佳实践：Docker/云服务器部署，飞书/微信/QQ 官方对接方式，以及必备 Skills 推荐
date: 2026-03-08
categories: [AI工具]
tags: [openclaw, ai-agent, docker, feishu, wechat, qq, chatbot]
---

# OpenClaw 部署与多平台对接完全指南（2026）

> 2026 年最强开源 AI Agent 框架 OpenClaw 部署与多渠道对接完整指南

## 什么是 OpenClaw？

OpenClaw 是奥地利开发者 Peter Steinberger 主导开发的开源 AI Agent 项目，曾用名 Clawdbot、Moltbot，2026 年 GitHub 星标数已突破 **22 万**，成为全球增速最快的开源 AI 项目之一。

### 核心特性

| 特性 | 说明 |
|------|------|
| 本地运行 | 数据完全本地化，隐私安全 |
| 多渠道支持 | 飞书、企业微信、钉钉、QQ、Telegram、Discord 等 |
| 模型兼容 | Claude、GPT、Gemini、Ollama 本地模型 |
| Skills 生态 | 3000+ 技能插件，可无限扩展 |

---

## 一、部署方式选择

### 三种部署方式对比

| 部署方式 | 优势 | 劣势 | 适用场景 |
|----------|------|------|----------|
| 本地部署 | 运行速度快、数据私有化、无服务器费用 | 需要备用主机、存在权限风险 | 有闲置电脑、对数据隐私要求高 |
| Docker 部署 | 环境隔离、易于迁移、配置简单 | 需要 Docker 基础知识 | 开发测试、快速部署 |
| 云端部署 | 7×24 小时运行、配置灵活、无本地设备占用 | 需支付服务器费用 | 生产环境、团队协作 |

### 推荐：Docker 部署

对于大多数用户，**Docker 部署**是最佳选择——环境隔离、配置简单、迁移灵活。

#### 快速启动命令

```bash
# 创建数据目录
mkdir -p ~/openclaw-state

# 启动容器
docker run -d \
  --name openclaw \
  -p 19789:18789 \
  -v ~/openclaw-state:/root/.openclaw \
  -e NODE_OPTIONS="--max-old-space-size=4096" \
  ghcr.io/openclaw/openclaw:latest \
  node /app/dist/index.js gateway --bind lan --port 18789 --allow-unconfigured
```

#### 持久化配置

```bash
docker run -d \
  --name openclaw \
  -p 19789:18789 \
  -v ~/openclaw-state:/root/.openclaw \
  -e "OPENAI_API_KEY=sk-your-key" \
  -e "ANTHROPIC_API_KEY=sk-ant-your-key" \
  --add-host=host.docker.internal:host-gateway \
  ghcr.io/openclaw/openclaw:latest \
  node /app/dist/index.js gateway --bind lan --port 18789 --allow-unconfigured
```

---

## 二、飞书对接（官方插件）

### 方式一：官方插件（推荐）

自 v2026.2.2 起，OpenClaw 官方支持飞书通道，使用 WebSocket 长连接接收消息，无需公网 URL。

#### 1. 安装飞书插件

```bash
docker exec openclaw node /app/dist/index.js plugins install @openclaw/feishu
```

#### 2. 创建飞书应用

访问 https://open.feishu.cn/app：

1. 创建企业自建应用
2. 获取 **App ID** 和 **App Secret**
3. 配置权限（批量导入 JSON）

```json
{
  "scopes": {
    "tenant": [
      "im:message",
      "im:message:send_as_bot",
      "im:resource",
      "aily:file:read",
      "aily:file:write"
    ]
  }
}
```

#### 3. 配置事件订阅

在飞书开放平台「事件订阅」页面：
- 订阅方式：选择 **「使用长连接接收事件」**
- 添加事件：`im.message.receive_v1`

#### 4. 配置 OpenClaw

```bash
# 方式 A：交互式向导
docker exec -it openclaw node /app/dist/index.js channels add
# 选择 Feishu，输入 App ID 和 App Secret

# 方式 B：直接编辑配置文件
vim ~/openclaw-state/openclaw.json
```

```json5
{
  channels: {
    feishu: {
      enabled: true,
      dmPolicy: "pairing",
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

#### 5. 群聊配置

```json5
{
  channels: {
    feishu: {
      groupPolicy: "open",
      groups: {
        "oc_xxx": { requireMention: false }
      }
    }
  }
}
```

---

## 三、微信对接

### 企业微信接入

#### 1. 创建企业微信应用

1. 登录企业微信管理后台
2. 创建自建应用
3. 记录 **AgentId**、**Secret**、**CorpId**

#### 2. 配置回调

- URL: `https://你的服务器/webhook/wecom`
- Token 和 EncodingAESKey：自动生成

#### 3. OpenClaw 配置

```bash
openclaw config wecom \
  --corp-id YOUR_CORP_ID \
  --agent-id YOUR_AGENT_ID \
  --secret YOUR_SECRET \
  --token YOUR_TOKEN \
  --aes-key YOUR_AES_KEY
```

### 微信公众号接入

> 微信公众号需要已认证的服务号或订阅号。

#### 1. 获取凭证

登录微信公众平台 https://mp.weixin.qq.com/，获取：
- AppID
- AppSecret

#### 2. 配置 OpenClaw

```json5
{
  channels: {
    wechat: {
      enabled: true,
      accounts: {
        main: {
          appId: "wx_xxx",
          appSecret: "xxx"
        }
      }
    }
  }
}
```

---

## 四、QQ 对接

### 1. 创建 QQ 机器人

1. 访问 QQ 开放平台 https://q.qq.com/
2. 完成开发者实名认证
3. 创建机器人，获取 **AppID** 和 **AppSecret**

### 2. 配置 IP 白名单

在开发管理页面，将服务器公网 IP 添加到白名单。

### 3. 配置沙箱环境（测试用）

1. 进入「开发」→「沙箱配置」
2. 添加测试成员（你的 QQ 号）
3. 扫码确认

### 4. OpenClaw 配置

```bash
# 安装 QQ 插件
docker exec openclaw node /app/dist/index.js plugins install @openclaw/qq

# 配置
openclaw config qq \
  --app-id YOUR_APP_ID \
  --app-secret YOUR_APP_SECRET
```

或编辑配置文件：

```json5
{
  channels: {
    qq: {
      enabled: true,
      accounts: {
        main: {
          appId: "YOUR_APP_ID",
          appSecret: "YOUR_APP_SECRET"
        }
      }
    }
  }
}
```

---

## 五、常用 Skills 推荐

OpenClaw 的核心能力来源于 **Skills（技能插件）**。没有 Skills，OpenClaw 只是一个聊天机器人。

### 安装基础命令

```bash
# 安装 ClawHub CLI（只需一次）
npm i -g clawhub

# 搜索 Skill
clawhub search "日历"

# 安装 Skill
clawhub install <skill-slug>

# 更新所有已安装的 Skill
clawhub update --all
```

### Top 10 必备 Skills

#### 1. 安全类
| Skill | 作用 |
|-------|------|
| `skill-vetter` | 扫描技能代码，检查权限申请，识别潜在恶意行为 |

#### 2. 联网搜索类
| Skill | 作用 |
|-------|------|
| `tavily-search` | 实时查询新闻、论文、数据 |
| `serpapi` | Google 搜索集成 |

#### 3. 浏览器自动化类
| Skill | 作用 |
|-------|------|
| `browser` | 自动打开网页、点击、填表、截图 |
| `playwright` | 浏览器自动化控制 |

#### 4. 代码执行类
| Skill | 作用 |
|-------|------|
| `code-interpreter` | Python 执行环境，数据分析、处理 Excel |
| `exec` | 终端命令执行 |

#### 5. 文件管理类
| Skill | 作用 |
|-------|------|
| `file-manager` | 本地文件读写、批量整理、PDF 解析 |

#### 6. 办公类
| Skill | 作用 |
|-------|------|
| `gmail` | 邮件管理 |
| `google-calendar` | 日程管理 |
| `slack` | Slack 集成 |

#### 7. 开发类
| Skill | 作用 |
|-------|------|
| `github-assistant` | GitHub 操作 |
| `git-master` | Git 版本控制 |

### 安装顺序建议

正确的安装顺序是：

1. **安全优先** → 先装 `skill-vetter`
2. **联网能力** → 安装搜索类 Skill
3. **执行能力** → 安装浏览器、代码执行
4. **自动化** → 定时任务、Hook

---

## 六、常见问题解决

### 问题 1：飞书机器人无响应

**解决方案：**
1. 确保应用已发布并审批通过
2. 确保事件订阅包含 `im.message.receive_v1`
3. 确保使用「长连接」接收事件
4. 检查 Gateway 状态：`docker exec openclaw node /app/dist/index.js gateway status`

### 问题 2：QQ 机器人无法连接

**解决方案：**
1. 检查 IP 白名单是否包含服务器公网 IP
2. 确保沙箱环境已配置测试成员
3. 查看日志：`docker logs -f openclaw`

### 问题 3：AI API 无法访问

**解决方案：**
如果使用 Docker，添加 DNS 配置：

```bash
docker run -d \
  --name openclaw \
  --dns 8.8.8.8 \
  --dns <YOUR_INTERNAL_DNS> \
  ...
```

---

## 七、推荐服务器配置

### 阿里云轻量应用服务器

| 配置项 | 推荐值 |
|--------|--------|
| 地域 | 华东（杭州）/ 华南（深圳） |
| 规格 | 2核 4GB（推荐）或 2核 2GB（入门） |
| 操作系统 | Ubuntu 22.04 LTS |
| 带宽 | 5Mbps |
| 存储 | 40GB SSD |

### 腾讯云 Lighthouse

| 配置项 | 推荐值 |
|--------|--------|
| 地域 | 香港 / 首尔 |
| 规格 | 4核 4GB |
| 带宽 | 5Mbps |
| 存储 | 60GB SSD |

---

## 八、总结

OpenClaw 作为 2026 年最强大的开源 AI Agent 框架，通过 Docker 部署可以快速搭建本地 AI 助手。官方插件支持飞书、企业微信、QQ 等主流国内平台，让 AI 真正融入日常工作。

**关键要点：**
- ✅ 使用 Docker 部署，简单高效
- ✅ 飞书使用官方插件，无需独立桥接
- ✅ 先安装 Skills，OpenClaw 才能发挥真正能力
- ✅ 按「安全 → 联网 → 执行 → 自动化」顺序安装 Skills

---

## 参考链接

- [OpenClaw 官方文档](https://docs.openclaw.ai/)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [ClawHub 技能市场](https://clabhub.com/)
- [飞书开放平台](https://open.feishu.cn/)
- [QQ 开放平台](https://q.qq.com/)
