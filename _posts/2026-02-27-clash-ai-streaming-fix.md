---
title: Clash 代理导致 AI 编程工具「卡死」—— 流式传输干扰的原理与解决方案
description: 深入分析 Clash/mihomo 代理如何干扰 OpenCode、Claude Code 等 AI 编程工具的 SSE 流式传输，导致 "Preparing write..." 无限卡住，以及四种层层递进的解决方案
date: 2026-02-27
categories: [环境配置]
tags: [clash, 代理, opencode, 流式传输, sse, 网络, ai编程工具]
---

用 OpenCode / Claude Code 写代码，突然界面卡在 "Preparing write..." 不动了。等了一分钟，还是没反应。按 Escape 中断，AI 重试一次，又卡住了。死循环。

关掉 Clash？一切正常。

这不是偶发 bug，而是一个涉及 **代理架构 × 流式传输 × 超时机制** 三方博弈的系统性问题。这篇文章带你从底层搞清楚它是怎么发生的，以及怎么彻底解决。

------

## 一、现象：不只是「卡住」那么简单

### 1.1 典型症状

你让 AI 写一个比较长的文件（比如一篇文档、一段几百行的代码），它开始「思考」，然后界面显示：

```
Thinking: 好的，让我写入这个文件。
~ Preparing write...
```

然后就永远停在这里。大约 60 秒后，你看到：

```
Tool execution aborted
Thinking: 好的，让我重新写入。
~ Preparing write...
Tool execution aborted
```

**死循环。** 每次间隔越来越长（2 秒 → 4 秒 → 8 秒 → 16 秒 → 30 秒），但结果一样。

### 1.2 关键线索

- **短文件没问题**，长文件才卡
- **关掉 Clash 就好了**
- 不限于某个模型（Claude Sonnet、Opus 都会触发）
- 不限于某个工具（write、edit 都可能）

这些线索指向一个方向：**问题出在代理层对长时间流式连接的干扰**。

------

## 二、原理：三层因素的叠加效应

要理解这个问题，需要先搞清楚三个独立的机制，然后看它们如何叠加。

### 2.1 第一层：AI 工具调用的流式传输机制

当 OpenCode 让 Claude 执行 `write` 工具写入一个文件时，**整个文件内容都是作为工具调用的参数**通过 API 流式返回的。

```
┌─────────────┐     SSE 流式响应      ┌──────────────┐
│  Claude API  │ ──────────────────> │   OpenCode    │
│  (服务端)    │  text/event-stream  │   (客户端)    │
└─────────────┘                      └──────────────┘

流式数据（每个 chunk 是 JSON 的一小段）：
  event: content_block_delta
  data: {"type":"input_json_delta","partial_json":"...文件内容片段..."}
  
  event: content_block_delta  
  data: {"type":"input_json_delta","partial_json":"...下一段..."}
  
  ... 持续几十秒 ...
```

**关键点**：写一个 5000 字的文件，模型可能需要 30-60 秒持续输出 token。在这期间，这条 HTTP 连接必须**保持活跃**，SSE 流不能中断。

### 2.2 第二层：OpenCode 的 60 秒空闲超时

OpenCode 在 `processor.ts` 中设置了一个保护机制：

```typescript
// 如果 60 秒内没有收到任何流式数据，就判定为超时
class StreamIdleTimeoutError extends Error {
  timeoutMs = 60000  // 60 秒
}
```

这个超时本身是合理的——防止连接僵死。问题是，当超时触发后：

1. 错误被标记为 `isRetryable: true`（可重试）
2. OpenCode 自动重试，但**没有最大重试次数限制**
3. 重试使用指数退避：2s → 4s → 8s → 16s → 30s → ...
4. 每次重试，模型都尝试同样的操作 → 又超时 → 又重试

这就是 [OpenCode Issue #12234](https://github.com/anomalyco/opencode/issues/12234) 描述的**无限重试循环**（Doom Loop）。

### 2.3 第三层：Clash 代理的干扰点

**这是关键。** 正常情况下，Claude API 的流式响应是持续的——模型一边生成 token，一边通过 SSE 推送，不会 60 秒没数据。那为什么开了 Clash 就会超时？

Clash 代理在数据链路中引入了**多个潜在的干扰点**：

```
Claude API 服务器
     │
     │ HTTPS (TLS 1.3)
     ▼
远程代理服务器（你的机场节点）
     │
     │ 加密隧道（SS/VMess/Trojan/...）
     ▼
Clash / mihomo 本地代理
     │
     │ HTTP CONNECT 隧道 / TUN
     ▼
OpenCode（你的 AI 编程工具）
```

每一跳都可能引入问题：

#### 干扰点 1：代理服务器的连接超时

你的机场节点（远程代理服务器）可能有自己的**空闲连接超时**。如果模型在「思考」阶段暂停了一段时间（思考链较长时会出现短暂的输出停顿），代理服务器可能判定连接空闲，直接断开。

#### 干扰点 2：Clash 的 TCP Keep-Alive 行为

mihomo 有 TCP Keep-Alive 相关配置：

```yaml
keep-alive-interval: 15  # TCP Keep-Alive 探测间隔（秒）
keep-alive-idle: 15      # TCP 空闲多久后开始探测
disable-keep-alive: false # 是否禁用 Keep-Alive
```

默认值 15 秒看起来合理，但问题在于：**Keep-Alive 是 TCP 层的机制，SSE 是应用层的。** TCP 层认为连接还活着（因为 Keep-Alive 探测正常），但应用层的数据可能因为中间环节（代理服务器、加密隧道）的缓冲而延迟到达。

#### 干扰点 3：HTTP 代理模式下的缓冲

当 Clash 以 **系统代理** 模式运行时（HTTP/SOCKS 代理），它需要：

1. 接收 OpenCode 的 HTTPS 请求
2. 建立 HTTP CONNECT 隧道到远程代理
3. 在远程代理和本地之间**中继数据**

这个中继过程中，数据可能被**缓冲**。特别是当远程代理到 Clash 之间的连接不稳定时，数据可能「一批一批」到达而不是逐字节转发。如果某一批数据的到达间隔超过 60 秒，OpenCode 就会超时。

#### 干扰点 4：DNS + SNI 嗅探的额外延迟

Clash 的 DNS 处理和 SNI（Server Name Indication）嗅探会在连接建立阶段引入额外延迟。虽然这主要影响初始连接而非流式数据，但在某些配置下（如 fake-ip 模式 + DNS 回落），可能导致连接建立后的首个数据包延迟。

### 2.4 叠加效应：为什么长文件才出问题

现在把三层因素叠在一起：

```
短文件（< 2000 字符）：
  模型输出时间 ~5 秒 → 远低于 60 秒超时 → 即使代理有轻微延迟也没问题 ✓

长文件（> 5000 字符）：
  模型输出时间 ~30-60 秒 
  + 代理链路引入的间歇性延迟/缓冲
  + 模型思考链中偶尔的输出停顿
  → 很容易出现某 60 秒窗口内没有数据到达 OpenCode
  → 触发 StreamIdleTimeoutError
  → 进入无限重试循环 ✗
```

**这就是为什么关掉 Clash 就好了**——去掉了代理链路中的所有干扰因素，数据直连到达，不会有额外的缓冲和延迟。

------

## 三、解决方案：四种方案，层层递进

从最简单到最彻底，根据你的需求选择。

### 方案一：让 AI API 流量绕过 Clash（推荐）

最直接的方案：在 Clash 的规则中，让 AI 相关的 API 域名走直连（DIRECT），不经过代理。

**在 mihomo 配置中添加规则：**

```yaml
rules:
  # AI API 直连（放在规则列表的前面，优先匹配）
  - DOMAIN-SUFFIX,anthropic.com,DIRECT
  - DOMAIN-SUFFIX,openai.com,DIRECT
  - DOMAIN-SUFFIX,api.githubcopilot.com,DIRECT
  - DOMAIN-SUFFIX,googleapis.com,DIRECT
  - DOMAIN-SUFFIX,openrouter.ai,DIRECT
  - DOMAIN-SUFFIX,x.ai,DIRECT
  
  # 你的其他规则...
  - MATCH,你的代理组
```

**优点**：零成本，立即生效，不影响其他代理流量
**缺点**：如果你的网络环境本身就需要代理才能访问这些 API（比如在中国大陆），这条路走不通

> **注意**：如果你通过 API Proxy（如 OpenRouter）转发请求，只需要让该 proxy 域名直连即可。

### 方案二：使用 TUN 模式替代系统代理

如果你必须走代理，**TUN 模式比 HTTP 系统代理更不容易出问题**。

原因：TUN 模式工作在**网络层（L3）**，直接虚拟一个网卡，操作系统的 TCP 栈直接处理连接。而 HTTP 系统代理工作在**应用层（L7）**，Clash 需要解析 HTTP 协议、管理 CONNECT 隧道，多了一层处理。

TUN 模式下，流式数据的传输路径更短、缓冲更少：

```
HTTP 系统代理模式：
  App → HTTP CONNECT → Clash 应用层处理 → 加密隧道 → 远程

TUN 模式：
  App → 操作系统 TCP 栈 → Clash TUN 网卡 → 加密隧道 → 远程
        （TCP Keep-Alive 由 OS 直接管理）
```

**mihomo TUN 配置：**

```yaml
tun:
  enable: true
  stack: mixed        # 推荐 mixed 或 gvisor
  dns-hijack:
    - any:53
  auto-route: true
  auto-detect-interface: true
```

**优点**：所有流量都走代理但减少了应用层缓冲
**缺点**：TUN 模式需要管理员权限，配置稍复杂

### 方案三：优化 Clash 的 TCP Keep-Alive 和连接参数

如果方案一和二都不适用，可以调整 mihomo 的连接参数来减少超时概率：

```yaml
# TCP 连接保活（减少空闲断连）
keep-alive-interval: 5     # 默认 15，改为 5 秒探测一次
keep-alive-idle: 5         # 默认 15，空闲 5 秒就开始探测
disable-keep-alive: false  # 确保没有禁用

# TCP 并发连接（提高首次连接成功率）
tcp-concurrent: true

# 统一延迟测试（选出真正低延迟的节点）
unified-delay: true
```

**同时，选择低延迟、稳定的代理节点**也很重要。高延迟或不稳定的节点更容易导致流式传输中断。

### 方案四：设置环境变量直连

如果你不想改 Clash 配置，可以在启动 OpenCode 之前设置环境变量，让它绕过代理：

**Linux / macOS：**

```bash
# 临时关闭代理（只影响当前终端）
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy

# 或者设置 NO_PROXY 排除 AI API
export NO_PROXY="api.anthropic.com,api.openai.com,*.anthropic.com,*.openai.com"

# 然后启动 OpenCode
opencode
```

**Windows PowerShell：**

```powershell
# 临时关闭代理
$env:HTTP_PROXY = ""
$env:HTTPS_PROXY = ""

# 或者设置 NO_PROXY
$env:NO_PROXY = "api.anthropic.com,api.openai.com,*.anthropic.com,*.openai.com"

opencode
```

**优点**：不用改 Clash 配置，即开即用
**缺点**：每次开新终端都要设置（可以加到 `.bashrc` / `$PROFILE` 中）

------

## 四、不同场景的选择建议

| 场景 | 推荐方案 | 原因 |
|------|----------|------|
| 能直连 API（不需要代理翻墙） | 方案一 / 四 | 最简单，直连最稳 |
| 必须走代理，节点质量好 | 方案二 + 三 | TUN + 优化参数 |
| 必须走代理，节点质量一般 | 方案一（改用国内 API Proxy） | 换一个不需要翻墙的 API 中继 |
| 公司网络，不能改 Clash | 方案四 | 环境变量绕过 |

------

## 五、深入理解：为什么 OpenCode 没有更好地处理这个问题？

这其实是 OpenCode 的一个 Bug，已经有多个 issue 在跟踪：

| Issue | 描述 | 状态 |
|-------|------|------|
| [#11112](https://github.com/anomalyco/opencode/issues/11112) | "Preparing write..." 永远卡住 | Open (👍 10) |
| [#12234](https://github.com/anomalyco/opencode/issues/12234) | StreamIdleTimeoutError 无限重试循环 | Open |
| [#11079](https://github.com/anomalyco/opencode/issues/11079) | Write 工具持续被中断 | Open (👍 5) |
| [#4061](https://github.com/anomalyco/opencode/issues/4061) | 文件写入后会话挂起 | Open |

核心问题是 `StreamIdleTimeoutError` 被标记为 `isRetryable: true` 且**没有最大重试次数限制**。理想情况下应该：

1. 设置最大重试次数（比如 3 次）
2. 超过次数后给出有意义的错误信息（「流超时，请检查网络环境」）
3. 不要让模型每次都尝试同样注定失败的操作

在 OpenCode 上游修复之前，本文的方案一到四是你能做的最好的缓解措施。

------

## 六、排查清单

如果你遇到了 "Preparing write..." 卡住的问题，按这个顺序排查：

```
1. 关掉 Clash → 问题消失？
   ├─ 是 → Clash 导致的，用本文的方案解决
   └─ 否 → 继续排查

2. 检查网络质量
   └─ ping api.anthropic.com 延迟多少？丢包吗？

3. 换一个代理节点
   └─ 选低延迟、稳定的节点

4. 只写短文件试试
   └─ 短文件 OK？→ 确认是长内容流式超时问题

5. 查看 OpenCode 日志
   └─ 搜索 StreamIdleTimeoutError 确认
```

------

## 总结

| 要点 | 说明 |
|------|------|
| **根因** | Clash 代理链路引入的缓冲/延迟 + OpenCode 的 60 秒空闲超时 + 无限重试 Bug |
| **触发条件** | 写长文件时，模型需要持续 30-60 秒输出流式数据 |
| **最简方案** | AI API 域名走 DIRECT 直连 |
| **最稳方案** | TUN 模式 + Keep-Alive 优化 + 低延迟节点 |
| **等待修复** | OpenCode [#12234](https://github.com/anomalyco/opencode/issues/12234) 限制最大重试次数 |

代理和 AI 工具是现代开发者的两个必备工具。搞清楚它们之间的冲突机制，才能让它们和平共处。
