---
title: Clash 代理导致 AI 编程工具「卡死」—— 流式传输干扰的原理与解决方案
description: 深入分析 Clash/mihomo 代理如何干扰 OpenCode、Claude Code 等 AI 编程工具的 SSE 流式传输，导致 "Preparing write..." 无限卡住。包含社区最新发现的 JSON 行缓冲根因分析，以及五种层层递进的解决方案
date: 2026-02-27
categories: [环境配置]
tags: [clash, 代理, opencode, 流式传输, sse, 网络, ai编程工具]
---

用 OpenCode / Claude Code 写代码，突然界面卡在 "Preparing write..." 不动了。等了一分钟，还是没反应。按 Escape 中断，AI 重试一次，又卡住了。死循环。

关掉 Clash？一切正常。

这不是偶发 bug，而是一个涉及 **JSON 序列化 × 代理行缓冲 × 超时机制** 三方博弈的系统性问题。这篇文章带你从底层搞清楚它是怎么发生的，以及怎么彻底解决。

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
- **普通聊天不卡**，只有工具调用卡

这些线索指向一个方向：**问题出在代理层对工具调用参数的缓冲干扰**。

------

## 二、根因分析：JSON 转义 × 代理行缓冲 × 空闲超时

要理解这个问题，需要先搞清楚三个独立的机制，然后看它们如何叠加。感谢 [OpenCode Issue #11112](https://github.com/anomalyco/opencode/issues/11112#issuecomment-3971055959) 中 yinzhou-jc 的精彩分析，揭示了最精确的根因。

### 2.1 第一层：JSON 转义消灭了所有换行符（核心根因）

当 OpenCode 让 Claude 执行 `write` 工具写入文件时，**整个文件内容被塞进一个 JSON 字符串参数**中。这个过程中，所有真实换行符 `\n` 被转义成了 JSON 中的 `\\n`：

```json
// 原始文件内容（有真实换行）：
// # 标题
// 第一段内容
// 第二段内容

// JSON 序列化后（一个巨大的单行！）：
{"content": "# 标题\\n第一段内容\\n第二段内容\\n...", "filePath": "/tmp/article.md"}
```

几千行代码被压缩成**一个没有真实换行的巨大文本行**。

这个 JSON 通过 SSE 流式返回给 OpenCode：

```
┌─────────────┐     SSE 流式响应      ┌──────────────┐
│  Claude API  │ ──────────────────> │   OpenCode    │
│  (服务端)    │  text/event-stream  │   (客户端)    │
└─────────────┘                      └──────────────┘

每个 SSE data 行里的 partial_json 是 JSON 字符串的一小段：
  data: {"type":"input_json_delta","partial_json":"# 标题\\n第一段"}
  data: {"type":"input_json_delta","partial_json":"内容\\n第二段内容"}
  ... 注意：这些 \\n 是转义后的字面文本，不是真实换行 ...
```

**关键点**：写一个长文件时，SSE 数据流中的 partial JSON 片段**几乎没有真实的换行符**——所有换行都被 JSON 转义吃掉了。

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

### 2.3 第三层：代理的「行缓冲」机制（真正的触发器）

**这是问题的真正触发器。**

许多网络中间层——HTTP 代理、WAF、Nginx、API 网关、CDN——都实现了**数据包缓冲**（packet buffering）。为了优化传输效率，它们通常不会逐字节转发数据，而是采用**行缓冲**（line buffering）策略：

```
缓冲刷新（flush）触发条件：
  1. 检测到真实换行符 \n        → 立即 flush ✓
  2. 缓冲区达到大小限制（通常 16KB）→ 强制 flush ✓
  3. 连接关闭                     → flush 并关闭 ✓
```

现在问题来了——对比正常聊天和 write 工具调用：

```
正常聊天文本（有真实换行）：
  "这是第一行\n这是第二行\n"
  → 代理检测到 \n → 立即 flush → 客户端实时收到 ✓

write 工具的 JSON 参数（无真实换行）：
  "{\"content\": \"# 标题\\n第一段\\n第二段\\n...\"}"
  → 没有真实 \n，全是转义的 \\n
  → 代理一直等 flush 条件
  → 直到 16KB 或 JSON 字符串完成才 flush
  → 客户端长时间收不到任何数据 ✗
```

**这就是为什么开了 Clash 就卡死：** Clash 到远程代理服务器之间的连接，以及远程代理到 API 之间的中间层，都可能实施行缓冲。没有真实换行符，数据就被「扣」在缓冲区里不放。

**这也完美解释了所有关键现象：**

| 现象 | 解释 |
|------|------|
| 关掉 Clash 就好了 | 没有代理缓冲层，数据直达 |
| 短文件没问题 | 数据量小，很快凑够 16KB 或完成 |
| 长文件才卡死 | 巨大的无换行 JSON，代理一直等 flush |
| 普通聊天不卡 | 聊天文本有真实换行，代理正常 flush |

完整干扰路径：

```
Claude API 服务器
     │ 输出 JSON 转义后的无换行巨行
     ▼
CDN / API 网关 ← 可能缓冲
     │
     ▼
远程代理服务器（机场节点）← 可能缓冲
     │ 加密隧道（SS/VMess/Trojan）
     ▼
Clash / mihomo 本地代理 ← 可能缓冲
     │
     ▼
OpenCode → 60 秒没数据 → StreamIdleTimeoutError → 无限重试
```

### 2.4 叠加效应：三层机制如何形成死循环

```
短文件（< 2000 字符）：
  JSON 总量小 → 很快达到 16KB flush 阈值或传输完成
  → 即使代理有缓冲也没问题 ✓

长文件（> 5000 字符）：
  1. JSON 转义 → 消灭所有真实换行
  2. 代理行缓冲 → 扣住数据不 flush
  3. 客户端 60 秒没收到数据 → StreamIdleTimeoutError
  4. isRetryable: true → 自动重试
  5. 模型重新生成同样的大 JSON → 又被缓冲 → 又超时
  → 无限死循环 ✗
```

**这就是为什么关掉 Clash 就好了**——去掉了代理缓冲层，SSE 的 HTTP chunk 直接到达客户端，不会因为缺少换行符而被扣留。

------

## 三、解决方案：五种方案，层层递进

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

原因：TUN 模式工作在**网络层（L3）**，直接虚拟一个网卡，操作系统的 TCP 栈直接处理连接。而 HTTP 系统代理工作在**应用层（L7）**，Clash 需要解析 HTTP 协议、管理 CONNECT 隧道，多了一层处理和缓冲。

```
HTTP 系统代理模式：
  App → HTTP CONNECT → Clash 应用层处理(可能缓冲) → 加密隧道 → 远程

TUN 模式：
  App → 操作系统 TCP 栈 → Clash TUN 网卡(透传) → 加密隧道 → 远程
        （数据包级别转发，不解析应用层协议）
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

### 方案五：从根源解决——XML 流式输出方案（社区前沿）

以上四种方案都是在**绕过**代理缓冲问题。而 [yinzhou-jc 在 Issue #11112 中提出的方案](https://github.com/anomalyco/opencode/issues/11112#issuecomment-3971055959)则从根源解决——**让大文件内容不再通过 JSON 参数传输**。

**核心思路**：既然问题是 JSON 转义消灭了换行符导致代理无法 flush，那就让 AI **不要把文件内容放在 JSON 参数里**，而是作为普通文本（带真实换行）输出到聊天流中。

**改造步骤：**

1. **重构 write 工具 Schema**：从参数中移除 `content` 字段，只保留 `filePath`
2. **XML 标签流式输出**：AI 在调用 write 工具之前，先把文件内容用 XML 标签包裹输出到聊天窗口：
   ```xml
   <opencode_write path="/tmp/article.md">
   # 标题
   
   第一段内容，有真实换行...
   
   第二段内容...
   </opencode_write>
   ```
   因为这是普通文本，有真实换行，代理会**立即逐行 flush**
3. **引擎拦截**：write 工具执行时，从当前消息的文本部分提取 `<opencode_write>` 块的内容，写入文件
4. **防止 LLM 自我补偿**：返回明确的成功消息，防止 AI 以为文件是空的而用 bash 重写

**为什么这个方案从根源解决了问题？**

```
原来（JSON 参数，无换行）：
  {"content": "# 标题\\n第一段\\n..."} → 代理缓冲 → 卡死 ✗

改造后（XML 文本，有换行）：
  <opencode_write path="...">
  # 标题                        → 代理逐行 flush ✓
  第一段内容                     → 代理逐行 flush ✓
  ...
  </opencode_write>             → 代理逐行 flush ✓
```

> **注意**：这个方案需要修改 OpenCode 源码，属于上游改造级别的方案。普通用户建议优先使用方案一到四。

------

## 四、不同场景的选择建议

| 场景 | 推荐方案 | 原因 |
|------|----------|------|
| 能直连 API（不需要代理翻墙） | 方案一 / 四 | 最简单，直连最稳 |
| 必须走代理，节点质量好 | 方案二 + 三 | TUN + 优化参数 |
| 必须走代理，节点质量一般 | 方案一（改用国内 API Proxy） | 换一个不需要翻墙的 API 中继 |
| 公司网络，不能改 Clash | 方案四 | 环境变量绕过 |
| 有能力改 OpenCode 源码 | 方案五 | 从根源消除问题 |

------

## 五、深入理解：为什么 OpenCode 没有更好地处理这个问题？

这其实是 OpenCode 的一个 Bug，已经有多个 issue 在跟踪：

| Issue | 描述 | 状态 |
|-------|------|------|
| [#11112](https://github.com/anomalyco/opencode/issues/11112) | "Preparing write..." 永远卡住 | Open (👍 10) |
| [#12234](https://github.com/anomalyco/opencode/issues/12234) | StreamIdleTimeoutError 无限重试循环 | Open |
| [#11079](https://github.com/anomalyco/opencode/issues/11079) | Write 工具持续被中断 | Open (👍 5) |
| [#4061](https://github.com/anomalyco/opencode/issues/4061) | 文件写入后会话挂起 | Open |

问题出在两个层面：

**1. 协议设计层面**：write 工具把大量内容塞进 JSON 参数，JSON 转义消灭了换行符，天然不适合通过有行缓冲的代理传输。这是 AI 工具框架的通病——不只是 OpenCode，任何把大文件内容放在 tool_use JSON 参数里的工具都有同样问题。

**2. 错误处理层面**：`StreamIdleTimeoutError` 被标记为 `isRetryable: true` 且没有最大重试次数限制。理想情况下应该：

1. 设置最大重试次数（比如 3 次）
2. 超过次数后给出有意义的错误信息（「流超时，请检查网络环境」）
3. 不要让模型每次都尝试同样注定失败的操作

在 OpenCode 上游修复之前，本文的方案一到四是普通用户能做的最好的缓解措施。

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
| **根因** | JSON 转义消灭换行符 → 代理行缓冲无法 flush → 数据被扣留 → 60 秒空闲超时 → 无限重试 |
| **触发条件** | 写长文件时，工具参数的 JSON 序列化产生无换行巨行 |
| **最简方案** | AI API 域名走 DIRECT 直连 |
| **最稳方案** | TUN 模式 + Keep-Alive 优化 + 低延迟节点 |
| **根治方案** | 社区提出的 XML 流式输出改造（需改 OpenCode 源码） |
| **等待修复** | OpenCode [#12234](https://github.com/anomalyco/opencode/issues/12234) 限制最大重试次数 |

代理和 AI 工具是现代开发者的两个必备工具。搞清楚它们之间的冲突机制，才能让它们和平共处。

------

> **致谢**：本文的核心根因分析（JSON 行缓冲机制）来自 [yinzhou-jc 在 OpenCode Issue #11112 中的评论](https://github.com/anomalyco/opencode/issues/11112#issuecomment-3971055959)，他不仅找到了根因，还提出了从协议层面根治的 XML 流式输出方案。
