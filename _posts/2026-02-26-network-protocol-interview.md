---
title: 计算机网络面试题 —— 从输入 URL 到页面显示的全链路深度问答
description: 覆盖 OSI/TCP 分层、HTTP/HTTPS、TLS、DNS、Cookie/Session/Token、CDN、负载均衡、WebSocket、网络安全等高频面试题，补全协议层与应用层知识
date: 2026-02-26
categories: [编程语言]
tags: [计算机网络, http, https, dns, tls, 面试, tcp, 网络安全, cdn, 负载均衡]
---

[上一篇](/techlearn/posts/network-ipc-interview/) 讲了 TCP/UDP、Socket 编程、IO 模型和 IPC 的面试题——偏底层编程。但面试中网络部分还有半壁江山是**协议体系和应用层**：HTTP 各版本区别？HTTPS 怎么加密的？DNS 怎么解析的？"输入 URL 到页面显示"这道万年必考题怎么答到满分？

这篇补齐这些内容。

------

## 第一部分：网络分层模型

### Q1：OSI 七层和 TCP/IP 四层？

**记忆点：面试记 TCP/IP 四层就够了——应用层、传输层、网络层、网络接口层。OSI 是理论模型，TCP/IP 是实际使用的。**

```
OSI 七层                TCP/IP 四层         协议举例              作用
───────────────────────────────────────────────────────────────────
应用层                  ┐
表示层                  ├ 应用层            HTTP, HTTPS, FTP,     和用户打交道
会话层                  ┘                   DNS, SMTP, SSH

传输层                  传输层              TCP, UDP              端到端可靠传输

网络层                  网络层              IP, ICMP, ARP         寻址和路由

数据链路层              ┐
物理层                  ┘ 网络接口层        Ethernet, WiFi        物理传输

每层只和相邻层打交道：
  发送时从上到下逐层加头部（封装）
  接收时从下到上逐层去头部（解封装）

  应用层数据
    ↓ 加 TCP 头 → TCP 段（Segment）
    ↓ 加 IP 头  → IP 包（Packet）
    ↓ 加帧头帧尾 → 以太网帧（Frame）
    ↓ 变成电信号/光信号 → 物理传输
```

### Q2："输入 URL 到页面显示"的全过程？

**记忆点：DNS 解析 → TCP 连接 → TLS 握手（HTTPS）→ 发 HTTP 请求 → 服务端处理 → 返回响应 → 浏览器渲染。这道题的精髓不是背流程而是每一步你能深入到什么程度。**

```
完整流程：

1. URL 解析
   浏览器解析 https://www.example.com/page
   ├── 协议：https
   ├── 域名：www.example.com
   ├── 路径：/page
   └── 端口：443（HTTPS 默认）

2. DNS 解析（域名 → IP 地址）
   ├── 浏览器 DNS 缓存
   ├── 操作系统 DNS 缓存
   ├── hosts 文件
   ├── 本地 DNS 服务器（递归查询）
   │   ├── 根域名服务器 → .com 域名服务器 → example.com 权威服务器
   │   └── 返回 IP: 93.184.216.34
   └── 缓存结果（TTL）

3. TCP 三次握手
   SYN → SYN+ACK → ACK（详见上一篇 Q2）

4. TLS 握手（HTTPS 才有）
   ├── Client Hello（支持的加密套件、随机数）
   ├── Server Hello（选定的加密套件、证书、随机数）
   ├── 客户端验证证书（证书链 → 根 CA）
   ├── 密钥交换（生成会话密钥）
   └── 开始加密通信

5. 发送 HTTP 请求
   GET /page HTTP/1.1
   Host: www.example.com
   ...

6. 服务端处理
   ├── 负载均衡器（Nginx/LB）分发请求
   ├── Web 服务器处理逻辑
   ├── 查数据库 / 缓存
   └── 生成 HTML 响应

7. 返回 HTTP 响应
   HTTP/1.1 200 OK
   Content-Type: text/html
   ...
   <html>...</html>

8. 浏览器渲染
   ├── 解析 HTML → DOM 树
   ├── 解析 CSS → CSSOM 树
   ├── DOM + CSSOM → Render Tree
   ├── Layout（计算位置和大小）
   ├── Paint（绘制像素）
   └── 遇到 JS/CSS/图片 → 额外发请求加载

9. TCP 四次挥手（连接关闭）
   或 Keep-Alive 保持连接（HTTP/1.1 默认）
```

------

## 第二部分：HTTP 协议

### Q3：HTTP 常见状态码？

**记忆点：2xx 成功，3xx 重定向，4xx 客户端错误，5xx 服务端错误。**

```
1xx 信息性
  100 Continue          客户端继续发送请求体

2xx 成功
  200 OK               请求成功
  201 Created           创建成功（POST）
  204 No Content        成功但没有返回内容（DELETE）

3xx 重定向
  301 Moved Permanently  永久重定向（搜索引擎更新 URL）
  302 Found              临时重定向（搜索引擎保留原 URL）
  304 Not Modified       资源未修改（缓存可用）

4xx 客户端错误
  400 Bad Request        请求格式错误
  401 Unauthorized       未认证（需要登录）
  403 Forbidden          无权限（已认证但被拒绝）
  404 Not Found          资源不存在
  405 Method Not Allowed 方法不支持
  429 Too Many Requests  请求过多（限流）

5xx 服务端错误
  500 Internal Server Error  服务器内部错误
  502 Bad Gateway            网关/代理收到无效响应
  503 Service Unavailable    服务不可用（过载/维护）
  504 Gateway Timeout        网关/代理超时

面试高频追问：
  301 vs 302？
  → 301 永久，浏览器会缓存，下次直接访问新地址
  → 302 临时，浏览器每次都先访问旧地址

  401 vs 403？
  → 401 你没登录（告诉你去登录）
  → 403 你登录了但没权限（登录了也没用）
```

### Q4：HTTP 各版本的区别？

**记忆点：HTTP/1.0 短连接；HTTP/1.1 长连接+管线化；HTTP/2 多路复用+头部压缩+服务端推送；HTTP/3 基于 QUIC（UDP），解决队头阻塞。**

```
HTTP/1.0（1996）
  ├── 每个请求一个 TCP 连接（短连接）
  ├── 请求完毕关闭连接
  └── 问题：每次请求都要 TCP 握手，慢

HTTP/1.1（1997，至今仍广泛使用）
  ├── 默认 Keep-Alive（长连接，复用 TCP 连接）
  ├── 管线化（Pipelining）：可以连续发多个请求不用等响应
  │   但响应必须按序返回 → 队头阻塞（Head-of-Line Blocking）
  ├── 增加 Host 头部（支持虚拟主机）
  ├── 支持 chunked 分块传输
  └── 问题：队头阻塞、头部冗余（每次都发完整头部）

HTTP/2（2015）
  ├── 二进制分帧（不再是文本协议）
  ├── 多路复用（Multiplexing）：
  │   一个 TCP 连接上可以同时传输多个请求/响应
  │   彻底解决 HTTP 层的队头阻塞
  ├── 头部压缩（HPACK）：只发送变化的头部
  ├── 服务端推送（Server Push）
  ├── 流优先级
  └── 问题：TCP 层仍有队头阻塞（一个包丢了，后面的都等）

HTTP/3（2022）
  ├── 基于 QUIC 协议（运行在 UDP 上）
  ├── 解决 TCP 层队头阻塞：
  │   每个流独立，一个流丢包不影响其他流
  ├── 0-RTT 连接建立（之前连过的服务器）
  ├── 连接迁移（切换网络不断连，靠连接 ID 不靠四元组）
  └── 内置 TLS 1.3（加密是强制的）
```

```
队头阻塞问题的演进：

HTTP/1.1 的队头阻塞（HTTP 层）：
  请求1 ──>          <── 响应1（慢！后面都等着）
  请求2 ──>          <── 响应2（被阻塞）
  请求3 ──>          <── 响应3（被阻塞）

HTTP/2 解决了 HTTP 层，但 TCP 层还在：
  TCP 包1 [请求1数据]  ← 丢了！
  TCP 包2 [请求2数据]  ← 虽然收到了但等包1重传
  TCP 包3 [请求3数据]  ← 同上

HTTP/3 (QUIC) 彻底解决：
  QUIC 流1 [请求1] ← 丢了，只影响流1
  QUIC 流2 [请求2] ← 正常处理
  QUIC 流3 [请求3] ← 正常处理
```

### Q5：HTTP 请求方法有哪些？GET 和 POST 的区别？

**记忆点：GET 获取资源，参数在 URL 中，幂等可缓存；POST 提交数据，参数在 Body 中，非幂等不缓存。核心区别是语义不同。**

```
方法      语义          幂等   安全   缓存
GET       获取资源      ✅     ✅     ✅
POST      提交/创建     ❌     ❌     ❌
PUT       替换/更新     ✅     ❌     ❌
PATCH     部分更新      ❌     ❌     ❌
DELETE    删除          ✅     ❌     ❌
HEAD      同 GET 但不返回 body  ✅  ✅  ✅
OPTIONS   查询支持的方法（CORS 预检）

幂等：同一请求执行多次效果一样（GET 读 10 次 = 读 1 次）
安全：不修改服务器状态（GET 只读不写）

GET vs POST 面试标准回答：
  ├── 语义：GET 是获取，POST 是提交
  ├── 参数：GET 在 URL 查询字符串，POST 在请求体
  ├── 长度：GET 有 URL 长度限制（浏览器/服务器限制，非协议限制）
  ├── 缓存：GET 可缓存，POST 不缓存
  ├── 幂等：GET 幂等，POST 不幂等
  ├── 安全性：都不安全（HTTP 明文），HTTPS 下都加密
  └── 本质：都是 TCP 连接上发数据，区别主要是语义约定

面试追问：POST 能用 URL 传参吗？GET 能用 Body 传数据吗？
  → 技术上都可以（HTTP 规范没有禁止）
  → 但不符合语义约定，很多中间件/框架不支持
```

### Q6：HTTP 缓存机制？

**记忆点：强缓存看 Cache-Control/Expires（不发请求），协商缓存看 ETag/Last-Modified（发请求问服务器），304 表示缓存仍然有效。**

```
缓存流程：

浏览器要请求一个资源
  │
  ├── 检查强缓存
  │   ├── Cache-Control: max-age=3600  → 3600 秒内直接用缓存
  │   └── Expires: Wed, 26 Feb 2026 12:00:00 GMT → 过期时间
  │
  │   命中 → 直接用缓存（200 from cache），不发请求
  │   未命中 ↓
  │
  ├── 发请求（协商缓存）
  │   请求头带上：
  │   ├── If-None-Match: "abc123"      （对应 ETag）
  │   └── If-Modified-Since: Wed, ...  （对应 Last-Modified）
  │
  │   服务器检查：
  │   ├── 资源没变 → 304 Not Modified（用缓存）
  │   └── 资源变了 → 200 + 新资源
  │
  └── 没有缓存 → 正常请求 200

Cache-Control 常见值：
  max-age=3600    → 缓存 3600 秒
  no-cache        → 不要强缓存，每次都协商（容易被误解！）
  no-store        → 完全不缓存（连协商都不做）
  public          → 中间代理也可以缓存
  private         → 只有浏览器可以缓存

ETag vs Last-Modified：
  ETag 更精确（基于内容哈希，秒内修改也能检测）
  Last-Modified 粒度是秒（同一秒内修改检测不到）
  ETag 优先级高于 Last-Modified
```

------

## 第三部分：HTTPS 与安全

### Q7：HTTPS 和 HTTP 的区别？

**记忆点：HTTPS = HTTP + TLS/SSL。HTTP 明文传输，HTTPS 加密传输。HTTPS 要证书，默认端口 443（HTTP 是 80）。**

```
HTTP                           HTTPS
明文传输                        加密传输（TLS/SSL）
端口 80                         端口 443
无需证书                        需要 CA 证书
速度快                          握手多一步，稍慢（但差距越来越小）
不安全（中间人可窃听/篡改）      安全（加密+完整性+身份认证）
```

### Q8：HTTPS 的 TLS 握手过程？

**记忆点：TLS 握手目的是协商加密算法和生成会话密钥。用非对称加密交换密钥，之后用对称加密通信。证书验证服务器身份。**

```
TLS 1.2 握手（4 次）：

客户端                              服务端

  │── Client Hello ──────────────>│
  │   支持的加密套件列表            │
  │   客户端随机数 (Client Random)  │
  │                                │
  │<── Server Hello ──────────────│
  │   选定的加密套件                │
  │   服务端随机数 (Server Random)  │
  │   服务端证书 (包含公钥)         │
  │   Server Hello Done            │
  │                                │
  │── 验证证书 ──                  │
  │── Client Key Exchange ──────>│
  │   预主密钥（用服务端公钥加密）   │
  │── Change Cipher Spec ──────>│
  │── Finished ─────────────────>│
  │                                │
  │<── Change Cipher Spec ────────│
  │<── Finished ──────────────────│
  │                                │
  │   开始加密通信                  │

密钥生成过程：
  Client Random + Server Random + Pre-Master Secret
  → 通过 PRF 函数生成 Master Secret
  → 推导出会话密钥（对称加密用）

为什么用混合加密？
  非对称加密（RSA/ECDHE）：安全但慢，只用来交换密钥
  对称加密（AES）：快，用于后续所有数据传输
  → 用非对称加密交换对称密钥，之后全用对称加密

TLS 1.3 优化：
  握手减少到 1-RTT（只需 1 个往返）
  支持 0-RTT（重连时直接发数据，但有重放风险）
  废弃了 RSA 密钥交换（只保留 ECDHE，前向安全）
  废弃了不安全的加密套件
```

### Q9：证书是怎么验证的？什么是证书链？

**记忆点：服务端证书由 CA 签发。浏览器内置根 CA 公钥，通过证书链（服务器证书→中间 CA→根 CA）逐级验证签名。如果签名匹配说明证书可信。**

```
证书链验证过程：

  根 CA（浏览器内置，绝对信任）
    │ 用根 CA 私钥签名
    ▼
  中间 CA 证书
    │ 用中间 CA 私钥签名
    ▼
  服务器证书（example.com）
    │ 包含服务器公钥

  验证步骤：
  1. 取出服务器证书 → 查看签发者（中间 CA）
  2. 取出中间 CA 证书 → 用中间 CA 公钥验证服务器证书的签名
  3. 取出根 CA 证书（内置）→ 用根 CA 公钥验证中间 CA 的签名
  4. 如果链条完整且签名都正确 → 证书可信

  为什么需要中间 CA？
  → 根 CA 的私钥极其重要，不能频繁使用
  → 中间 CA 作为"代理"签发日常证书
  → 中间 CA 被泄露可以吊销，根 CA 不受影响

面试追问：中间人攻击？
  → 攻击者伪造证书 → 但没有 CA 的私钥，无法生成合法签名
  → 浏览器验证签名失败 → 显示"不安全"警告
  → 除非攻击者控制了 CA（几乎不可能）或用户忽略警告
```

### Q10：对称加密和非对称加密？

**记忆点：对称加密一把密钥加解密（AES，快）；非对称加密公钥加密私钥解密（RSA/ECC，慢）。HTTPS 用非对称交换密钥，然后用对称加密通信。**

```
对称加密（Symmetric）：
  加密和解密用同一把密钥
  ├── AES（Advanced Encryption Standard）—— 主流
  ├── DES（已淘汰）
  └── 速度快（比非对称快 100-1000 倍）
  问题：密钥怎么安全地传给对方？

非对称加密（Asymmetric）：
  公钥加密 → 私钥解密（或私钥签名 → 公钥验证）
  ├── RSA（老牌，密钥长 2048/4096 位）
  ├── ECC / ECDHE（椭圆曲线，密钥短但同样安全）
  └── 速度慢，不适合加密大量数据
  优点：公钥可以公开传输

混合加密（HTTPS 的做法）：
  1. 非对称加密交换"对称密钥"（慢，但只做一次）
  2. 之后用对称密钥加密所有数据（快）

面试追问：什么是前向安全（Forward Secrecy）？
  → 即使服务端私钥泄露，过去的通信也无法解密
  → RSA 密钥交换没有前向安全（私钥泄露可以解密所有历史通信）
  → ECDHE 每次会话生成临时密钥对，私钥泄露也无法推导出历史会话密钥
  → TLS 1.3 强制要求前向安全（只保留 ECDHE）
```

------

## 第四部分：DNS

### Q11：DNS 解析过程？递归查询 vs 迭代查询？

**记忆点：客户端问本地 DNS 服务器是递归查询（帮你查到底）；本地 DNS 服务器问根/顶级/权威服务器是迭代查询（给你下一步的地址，你自己去问）。**

```
DNS 解析 www.example.com 的完整过程：

  ① 浏览器缓存 → ② OS 缓存 → ③ hosts 文件 → ④ 本地 DNS 服务器

  ④ 如果本地 DNS 也没缓存：
  ┌────────────────────────────────────────────┐
  │ 本地 DNS                                    │
  │   ├──> 根 DNS 服务器：                       │
  │   │    ".com 的 NS 是 192.5.6.30"           │
  │   │                                         │
  │   ├──> .com 顶级域 DNS：                     │
  │   │    "example.com 的 NS 是 ns1.example.com"│
  │   │                                         │
  │   ├──> example.com 权威 DNS：                 │
  │   │    "www.example.com = 93.184.216.34"    │
  │   │                                         │
  │   └── 缓存结果（根据 TTL）                    │
  │       返回给客户端                            │
  └────────────────────────────────────────────┘

  递归查询：客户端 → 本地 DNS
    "帮我查到底，给我最终结果"

  迭代查询：本地 DNS → 根 → 顶级 → 权威
    "我不知道，但你可以去问 xxx"

DNS 记录类型：
  A     域名 → IPv4 地址
  AAAA  域名 → IPv6 地址
  CNAME 域名 → 另一个域名（别名）
  MX    邮件服务器
  NS    域名服务器
  TXT   文本信息（SPF、域名验证等）
```

### Q12：DNS 用 TCP 还是 UDP？

**记忆点：DNS 默认用 UDP 端口 53（快，一个请求一个响应），响应超过 512 字节或者区域传送用 TCP。**

```
DNS 用 UDP 的原因：
  ├── DNS 查询通常很小（< 512 字节）
  ├── UDP 无连接，一个请求一个响应，够快
  ├── 不需要 TCP 的可靠性（查询失败重发就行）
  └── DNS 服务器要处理大量查询，TCP 握手开销太大

什么时候用 TCP？
  ├── 响应超过 512 字节（设置 TC 标志，客户端用 TCP 重试）
  ├── 区域传送（Zone Transfer）：主从 DNS 同步数据
  └── DNS over TLS (DoT) / DNS over HTTPS (DoH)：加密 DNS
```

------

## 第五部分：Cookie、Session 和 Token

### Q13：Cookie 和 Session 的区别？

**记忆点：Cookie 在客户端（浏览器存储），Session 在服务端（服务器存储）。Cookie 通过 HTTP 头传输，Session ID 通常存在 Cookie 里。**

```
Cookie：
  ├── 存储位置：浏览器（客户端）
  ├── 大小限制：每个 Cookie 4KB，每个域名上限约 50 个
  ├── 生命周期：可以设置过期时间（会话 Cookie / 持久 Cookie）
  ├── 传输方式：每次请求自动携带（Set-Cookie / Cookie 头）
  └── 安全性：
      ├── HttpOnly：JS 无法访问（防 XSS 窃取）
      ├── Secure：仅 HTTPS 传输
      ├── SameSite：限制跨站发送（防 CSRF）
      │   ├── Strict：完全不发跨站 Cookie
      │   ├── Lax：导航跳转发（默认值）
      │   └── None：都发（需配合 Secure）
      └── Domain / Path：限制作用范围

Session：
  ├── 存储位置：服务端（内存/Redis/数据库）
  ├── 大小限制：取决于服务端存储
  ├── 识别方式：通过 Session ID（存在 Cookie 或 URL 中）
  ├── 安全性：数据在服务端，相对安全
  └── 问题：
      ├── 服务端要存储状态 → 占内存
      ├── 分布式环境下 Session 共享困难
      └── 需要 Session 黏性（Sticky Session）或集中存储（Redis）

流程：
  客户端                              服务端
  首次请求 ──────────────────────>  创建 Session
                                     生成 SessionID: abc123
           <── Set-Cookie: SID=abc123 ──

  后续请求 ── Cookie: SID=abc123 ──>  查找 Session[abc123]
                                     读取用户状态
```

### Q14：Token（JWT）和 Session 的区别？

**记忆点：Session 是有状态的（服务端存数据），Token 是无状态的（数据存在 Token 里，服务端只验签不存储）。Token 天然支持分布式，但无法主动废止。**

```
Session 方案：
  客户端带 SessionID → 服务端查找 → 返回用户信息
  服务端有状态（必须存储 Session 数据）

Token (JWT) 方案：
  服务端生成 Token（包含用户信息 + 签名）→ 发给客户端
  客户端带 Token → 服务端验证签名 → 直接从 Token 中读取用户信息
  服务端无状态（不需要存储）

JWT 结构：
  Header.Payload.Signature

  Header:  {"alg": "HS256", "typ": "JWT"}
  Payload: {"sub": "user123", "name": "Alice", "exp": 1735689600}
  Signature: HMAC-SHA256(base64(Header) + "." + base64(Payload), secret)

对比：
              Session                 JWT Token
存储位置      服务端                  客户端（localStorage/Cookie）
服务端状态    有状态                  无状态
分布式        需要共享（Redis）        天然支持（每台机器都能验签）
注销          删除 Session 即可        无法主动作废（除非黑名单）
大小          SessionID 很小          Token 较大（包含用户信息）
安全性        泄露 SID 会被冒用       泄露 Token 也会被冒用

选择：
  ├── 单体应用 / 需要主动注销 → Session
  ├── 分布式 / 微服务 / 移动端 → JWT
  └── 实际中常混合使用
```

------

## 第六部分：WebSocket

### Q15：WebSocket 和 HTTP 的区别？

**记忆点：HTTP 是请求-响应模式（客户端主动），WebSocket 是全双工（双方都能主动推送）。WebSocket 通过 HTTP Upgrade 握手建立，之后升级为独立协议。**

```
HTTP：
  客户端 ── 请求 ──> 服务端
  客户端 <── 响应 ── 服务端
  每次都是客户端主动，服务端不能主动推送

WebSocket：
  客户端 <══ 双向实时通信 ══> 服务端
  建立连接后，双方都可以随时发消息
  适合：聊天、实时数据、游戏、股票行情

握手过程（HTTP Upgrade）：
  客户端：
  GET /chat HTTP/1.1
  Upgrade: websocket
  Connection: Upgrade
  Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==

  服务端：
  HTTP/1.1 101 Switching Protocols
  Upgrade: websocket
  Connection: Upgrade
  Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=

  之后不再是 HTTP，变成 WebSocket 帧协议

轮询 vs 长轮询 vs SSE vs WebSocket：
              轮询         长轮询        SSE           WebSocket
方向          单向         单向          单向(服务端→)  双向
实时性        差(间隔)     中            好             最好
连接          每次新建     保持到有数据  保持           保持
开销          最大         中            小             最小
协议          HTTP         HTTP          HTTP           WS
适合          简单场景     通知          数据流推送     实时交互
```

------

## 第七部分：CDN 和负载均衡

### Q16：CDN 是什么？工作原理？

**记忆点：CDN（内容分发网络）把静态资源缓存到全球各地的边缘节点，用户就近获取。靠 DNS 解析或 Anycast 把用户导向最近的节点。**

```
没有 CDN：
  北京用户 ──────────── 美国服务器（延迟高）
  上海用户 ──────────── 美国服务器（延迟高）

有 CDN：
  北京用户 ── 北京边缘节点（缓存了资源，延迟低）
  上海用户 ── 上海边缘节点（缓存了资源，延迟低）
                  ↑
              源站（美国）：CDN 节点没有的资源回源获取

工作原理：
  1. 用户请求 cdn.example.com/image.png
  2. DNS 将域名解析到 CDN 的智能 DNS
  3. CDN DNS 根据用户 IP 返回最近的边缘节点 IP
  4. 用户请求边缘节点
     ├── 缓存命中 → 直接返回（快）
     └── 缓存未命中 → 回源获取 → 缓存 → 返回

CDN 适合缓存的内容：
  ├── 静态资源：图片、JS、CSS、字体、视频
  ├── HTML 页面（如果不频繁变化）
  └── API 响应（特定情况下）

不适合：
  ├── 实时动态数据
  ├── 个性化内容（每个用户不同的页面）
  └── 需要认证的接口
```

### Q17：负载均衡的算法？

**记忆点：常见算法——轮询、加权轮询、IP 哈希、最少连接数、一致性哈希。四层负载均衡看 IP+端口（快），七层看 HTTP 内容（灵活）。**

```
负载均衡算法：

① 轮询（Round Robin）
   请求依次分发给每台服务器
   简单但不考虑服务器负载差异

② 加权轮询（Weighted Round Robin）
   性能好的服务器分配更多请求
   服务器 A (权重3): ▓▓▓
   服务器 B (权重1): ▓

③ 最少连接（Least Connections）
   请求发给当前连接数最少的服务器
   适合长连接场景

④ IP 哈希（IP Hash）
   hash(客户端 IP) % 服务器数 → 同一 IP 始终到同一服务器
   适合有状态的 Session 场景

⑤ 一致性哈希（Consistent Hash）
   服务器增减时只影响相邻节点的流量
   适合缓存场景（Redis 集群等）

四层 vs 七层负载均衡：
  四层（L4）：基于 IP + 端口转发
    ├── 工作在传输层
    ├── 速度快、性能高
    ├── 无法根据 HTTP 内容做决策
    └── 代表：LVS、F5、AWS NLB

  七层（L7）：基于 HTTP 内容转发
    ├── 工作在应用层
    ├── 可以根据 URL、Header、Cookie 做路由
    ├── 可以做 SSL 终止、压缩、缓存
    └── 代表：Nginx、HAProxy、AWS ALB
```

------

## 第八部分：网络安全

### Q18：常见的 Web 攻击方式？

**记忆点：XSS（注入脚本）、CSRF（伪造请求）、SQL 注入（拼接 SQL）、中间人攻击（窃听/篡改）。**

```
① XSS（跨站脚本攻击）
  原理：把恶意脚本注入到网页中，在受害者浏览器执行
  类型：
  ├── 存储型：恶意脚本存入数据库（评论区注入）
  ├── 反射型：恶意脚本在 URL 中，点击后执行
  └── DOM 型：纯前端漏洞
  防御：
  ├── 输出编码（HTML 实体转义）
  ├── CSP（Content Security Policy）
  ├── HttpOnly Cookie（JS 无法读取）
  └── 输入验证和过滤

② CSRF（跨站请求伪造）
  原理：利用用户已登录的 Cookie，在第三方网站发起请求
  例子：
    用户登录了银行 → 访问恶意网站
    恶意网站偷偷发请求：POST bank.com/transfer?to=hacker&amount=10000
    浏览器自动带上银行的 Cookie → 转账成功
  防御：
  ├── CSRF Token（表单中带随机令牌，服务端验证）
  ├── SameSite Cookie（限制跨站携带 Cookie）
  ├── 验证 Referer / Origin 头
  └── 关键操作要二次验证

③ SQL 注入
  原理：拼接 SQL 时插入恶意语句
  例子：
    输入用户名: admin' OR '1'='1
    拼接后: SELECT * FROM users WHERE name='admin' OR '1'='1'
    → 返回所有用户！
  防御：
  ├── 参数化查询 / 预编译语句（PreparedStatement）
  ├── ORM（不手写 SQL）
  ├── 输入验证
  └── 最小权限（数据库用户只给必要权限）

④ 中间人攻击（MITM）
  原理：攻击者在通信双方之间，窃听/篡改数据
  防御：HTTPS（加密 + 证书验证）
```

### Q19：跨域问题是什么？CORS 怎么解决？

**记忆点：浏览器的同源策略限制跨域请求（协议+域名+端口必须完全一样）。CORS 通过服务端设置 Access-Control-Allow-Origin 响应头来允许跨域。**

```
同源策略（Same-Origin Policy）：
  http://example.com:80/path
  协议   域名           端口

  以下跨域：
  ├── http vs https（协议不同）
  ├── a.com vs b.com（域名不同）
  ├── a.com vs sub.a.com（子域名也不同）
  └── :80 vs :8080（端口不同）

CORS（跨域资源共享）：
  简单请求（GET/POST + 常见 Content-Type）：
    浏览器直接发请求，带 Origin 头
    服务端返回 Access-Control-Allow-Origin: https://frontend.com
    浏览器检查：Origin 匹配 → 允许；不匹配 → 拦截

  预检请求（复杂请求先发 OPTIONS）：
    浏览器先发 OPTIONS 请求：
      Access-Control-Request-Method: PUT
      Access-Control-Request-Headers: X-Custom-Header

    服务端返回：
      Access-Control-Allow-Origin: https://frontend.com
      Access-Control-Allow-Methods: PUT, POST, GET
      Access-Control-Allow-Headers: X-Custom-Header
      Access-Control-Max-Age: 86400

    预检通过后才发实际请求

其他跨域方案：
  ├── 代理转发（前端请求自己的后端，后端代理到目标）
  ├── JSONP（只支持 GET，利用 script 标签不受同源限制）
  ├── postMessage（iframe 间通信）
  └── WebSocket（不受同源策略限制）
```

------

## 第九部分：其他高频题

### Q20：TCP 长连接和短连接？Keep-Alive？

**记忆点：短连接每次请求建立新 TCP 连接用完就关；长连接复用 TCP 连接发送多个请求。HTTP/1.1 默认 Keep-Alive 长连接。**

```
短连接：
  请求1：三次握手 → 发数据 → 四次挥手
  请求2：三次握手 → 发数据 → 四次挥手
  请求3：三次握手 → 发数据 → 四次挥手
  → 开销大！

长连接（Keep-Alive）：
  三次握手 → 请求1 → 请求2 → 请求3 → ... → 四次挥手
  → 一次握手，多次请求

HTTP/1.0：默认短连接（要显式加 Connection: Keep-Alive）
HTTP/1.1：默认长连接（要关闭加 Connection: Close）

TCP 层 Keep-Alive vs HTTP 层 Keep-Alive：
  TCP Keep-Alive：探测连接是否存活（默认 2 小时发一次）
  HTTP Keep-Alive：复用 TCP 连接发送多个 HTTP 请求
  两者不是一回事！
```

### Q21：正向代理和反向代理？

**记忆点：正向代理代理客户端（客户端知道代理存在，比如翻墙）；反向代理代理服务端（客户端不知道代理存在，比如 Nginx）。**

```
正向代理（Forward Proxy）：
  客户端 → 代理 → 服务端
  客户端知道代理的存在（主动配置代理）
  服务端不知道真正的客户端是谁

  用途：
  ├── 科学上网
  ├── 缓存加速
  ├── 访问控制（公司限制上网）
  └── 隐藏客户端 IP

反向代理（Reverse Proxy）：
  客户端 → 代理（Nginx） → 服务端 A / 服务端 B / ...
  客户端不知道代理的存在（以为直接访问服务端）
  服务端知道请求来自代理

  用途：
  ├── 负载均衡
  ├── SSL 终止（代理处理 HTTPS，后端用 HTTP）
  ├── 缓存静态资源
  ├── 安全（隐藏真实服务器 IP）
  └── 压缩、限流、防攻击
```

### Q22：什么是 RESTful API？

**记忆点：REST 是一种 API 设计风格——用 URL 表示资源，用 HTTP 方法表示操作（GET 读、POST 创建、PUT 更新、DELETE 删除），用状态码表示结果，无状态。**

```
RESTful API 设计原则：

  URL 表示资源（名词，不用动词）：
  ✅ GET /users/123        获取用户 123
  ✅ POST /users            创建用户
  ✅ PUT /users/123         更新用户 123
  ✅ DELETE /users/123      删除用户 123
  ❌ GET /getUser?id=123    动词在 URL 里
  ❌ POST /deleteUser       用 POST 删除

  状态码表示结果：
  200 OK / 201 Created / 204 No Content
  400 Bad Request / 404 Not Found
  500 Internal Server Error

  无状态：
  每个请求包含所有信息（Token/认证信息）
  服务端不存储客户端状态

  版本控制：
  /api/v1/users
  /api/v2/users
```

### Q23：TCP 和 UDP 的应用层协议分别有哪些？

**记忆点：TCP 承载需要可靠传输的协议（HTTP、HTTPS、FTP、SMTP、SSH、MySQL）；UDP 承载需要低延迟的协议（DNS、DHCP、QUIC、RTP、游戏、直播）。**

```
基于 TCP 的协议：
  HTTP/HTTPS (80/443)  → Web
  FTP (21)             → 文件传输
  SMTP (25)            → 发邮件
  POP3 (110)           → 收邮件
  IMAP (143)           → 收邮件（同步）
  SSH (22)             → 远程登录
  Telnet (23)          → 远程登录（明文，已淘汰）
  MySQL (3306)         → 数据库
  Redis (6379)         → 缓存

基于 UDP 的协议：
  DNS (53)             → 域名解析
  DHCP (67/68)         → IP 分配
  SNMP (161)           → 网络管理
  NTP (123)            → 时间同步
  TFTP (69)            → 简单文件传输
  RTP                  → 实时音视频
  QUIC                 → HTTP/3 的传输层

既有 TCP 又有 UDP：
  DNS                  → 查询用 UDP，区域传送用 TCP
```

### Q24：ARP 协议是什么？

**记忆点：ARP 把 IP 地址解析为 MAC 地址。在局域网内广播"谁的 IP 是 x.x.x.x？"，拥有该 IP 的主机回复自己的 MAC 地址。结果缓存在 ARP 表中。**

```
ARP 工作过程：

  主机 A 要发数据给 192.168.1.100
  但以太网帧需要 MAC 地址

  1. 查 ARP 缓存 → 没有
  2. 广播 ARP 请求：
     "谁的 IP 是 192.168.1.100？请告诉 192.168.1.1"
  3. 192.168.1.100 收到后单播回复：
     "我是 192.168.1.100，我的 MAC 是 AA:BB:CC:DD:EE:FF"
  4. 主机 A 缓存到 ARP 表

  查看 ARP 表：
  Linux:   arp -a 或 ip neigh
  Windows: arp -a

  ARP 欺骗/毒化：
  攻击者伪造 ARP 回复 → 让受害者把数据发给攻击者
  → 中间人攻击的一种手段
  防御：静态 ARP 表、DAI（动态 ARP 检测）
```

### Q25：ping 和 traceroute 的原理？

**记忆点：ping 用 ICMP Echo 报文测试连通性和延迟；traceroute 通过逐步增大 TTL 来发现每一跳的路由器。**

```
ping 原理：
  发送 ICMP Echo Request → 目标回复 ICMP Echo Reply
  测量往返时间（RTT）
  TTL 每经过一个路由器减 1，减到 0 丢弃

traceroute 原理：
  发送 TTL=1 的包 → 第一个路由器丢弃，返回 ICMP Time Exceeded
  发送 TTL=2 的包 → 第二个路由器丢弃，返回 ICMP Time Exceeded
  发送 TTL=3 的包 → ...
  发送 TTL=n 的包 → 到达目标，返回 ICMP Echo Reply

  这样就知道了到目标经过的每一个路由器
  Linux: traceroute（用 UDP），tracepath
  Windows: tracert（用 ICMP）
```

------

## 速查表

```
分层模型      应用层(HTTP) → 传输层(TCP) → 网络层(IP) → 网络接口层
URL全流程     DNS → TCP → TLS → HTTP → 服务端 → 响应 → 渲染
HTTP版本      1.0短连接 → 1.1长连接 → 2多路复用 → 3(QUIC/UDP)
队头阻塞      HTTP层(H2解决) → TCP层(H3解决)
状态码        2xx成功 3xx重定向 4xx客户端错 5xx服务端错
缓存          强缓存(Cache-Control) → 协商缓存(ETag/304)
HTTPS         非对称交换密钥 + 对称加密通信 + 证书验证身份
TLS握手       ClientHello → ServerHello+证书 → 密钥交换 → 加密通信
DNS           浏览器→OS→hosts→本地DNS→根→顶级→权威
Cookie        客户端存储，自动携带，HttpOnly/Secure/SameSite
Session       服务端存储，通过SessionID识别
JWT           无状态Token，服务端验签不存储
WebSocket     全双工，HTTP Upgrade握手后升级协议
CDN           边缘节点缓存，DNS就近解析
负载均衡      轮询/加权/最少连接/IP哈希/一致性哈希
XSS           注入脚本 → 输出转义+CSP+HttpOnly
CSRF          伪造请求 → Token+SameSite+Referer验证
SQL注入       拼接SQL → 参数化查询
CORS          服务端设置 Access-Control-Allow-Origin
正向代理      代理客户端（翻墙）
反向代理      代理服务端（Nginx）
```

------

> 网络知识的面试不是背协议，而是理解"为什么这样设计"。每个协议都在解决前一个的问题——HTTP/2 解决 HTTP/1.1 的队头阻塞，HTTP/3 解决 TCP 的队头阻塞，HTTPS 解决 HTTP 的安全问题。理解了演进脉络，细节自然记住了。

> 本系列相关文章：
> - [网络编程与 IPC 面试题](/techlearn/posts/network-ipc-interview/) —— Socket/epoll/IPC 底层编程
> - [C++ 网络库实战](/techlearn/posts/cpp-network-libraries/) —— 实际开发用的网络库
> - [进程间通信实战](/techlearn/posts/ipc-step-by-step/) —— IPC 动手写代码
> - [数据结构与算法面试题](/techlearn/posts/ds-algo-interview/) —— 算法
