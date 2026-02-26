---
title: Clash 到底是什么？—— 规则代理的工作原理与核心概念全解析
description: 深入浅出讲解 Clash 代理工具的工作原理，涵盖代理协议、规则分流、DNS 处理、TUN 模式等核心概念，让非专业人员也能理解它究竟在做什么
date: 2026-02-26
categories: [网络基础]
tags: [clash, 代理, 网络, 规则分流, socks5, 科普]
---

上一篇文章我们聊了 [VPN 的原理](/posts/vpn-explained/)，知道了它是一条"加密隧道"。今天要聊的 Clash，很多人天天在用，但可能从没搞清楚它到底是什么、和 VPN 有什么区别、那些配置文件里的东西都代表什么含义。这篇文章帮你从零开始搞懂。

------

## 一、Clash 是什么？一句话定义

**Clash 是一个基于规则的网络代理工具。** 它的核心能力是：根据你设定的规则，把不同的网络流量发往不同的出口。

```
传统上网（无代理）：
所有流量 ──────────────────────> 互联网

用 Clash：
Google 流量   ═══加密══> 代理服务器 A ──> Google
GitHub 流量   ═══加密══> 代理服务器 B ──> GitHub
百度流量      ──────直连──────────────> 百度（不走代理）
广告流量      ✕ 直接拦截（不放行）
```

**这就是"规则分流"—— Clash 最核心的价值。** 不像 VPN 那样所有流量都走隧道，Clash 可以让你精细控制每一条网络请求的去向。

------

## 二、Clash vs VPN：它们不是同一种东西

很多人把 Clash 当 VPN 用，虽然效果看起来相似，但它们的设计目标完全不同：

| 对比项 | VPN | Clash |
|--------|-----|-------|
| **设计目的** | 安全接入远程网络 | 灵活代理与分流 |
| **流量处理** | 所有流量走隧道 | 按规则决定走不走代理 |
| **工作层级** | 系统级（操作系统层面接管） | 应用级（或通过 TUN 模式做到系统级） |
| **典型场景** | 企业远程办公 | 精细化网络管理 |
| **协议** | IPSec、WireGuard、OpenVPN | SOCKS5、HTTP、Shadowsocks、Trojan、VLESS |
| **配置复杂度** | 通常简单（点击连接） | 配置灵活但需要理解规则 |

一个直观的比喻：

```
VPN = 高速公路收费站
      所有车（流量）都必须从这个站过，无一例外

Clash = 智能导航系统
        去市区走快速路，去郊区走国道，去隔壁小区直接走小路
        每条路线都是精心规划的
```

------

## 三、Clash 的架构：从入口到出口

### 3.1 整体工作流程

当你在电脑上启动 Clash 并配置好后，你的每一个网络请求都会经过这样的处理流程：

```
    你的浏览器/应用
         │
         ▼
  ┌──────────────┐
  │  Clash 入站   │  ← 流量入口（监听本地端口）
  │  (Inbound)    │     比如 127.0.0.1:7890
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │  DNS 解析     │  ← 查询域名对应的 IP
  │              │     （Clash 有自己的 DNS 模块）
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │  规则匹配     │  ← 核心！根据规则决定这条流量怎么走
  │  (Rules)      │
  └──────┬───────┘
         │
    ┌────┼────┐
    ▼    ▼    ▼
  代理A  代理B  直连     ← 出口（不同的路径）
    │    │    │
    ▼    ▼    ▼
  目标服务器（Google、GitHub、百度...）
```

### 3.2 入站（Inbound）：流量怎么进来

Clash 启动后，会在你的本机开放几个端口，等着接收流量：

```
┌────────────────────────────────────────────┐
│  Clash 监听的入站端口                       │
│                                            │
│  HTTP 代理    → 127.0.0.1:7890             │
│  SOCKS5 代理  → 127.0.0.1:7891             │
│  混合代理     → 127.0.0.1:7890（HTTP+SOCKS）│
│  TUN 模式     → 虚拟网卡（接管全部流量）     │
│  透明代理     → 路由器级别转发              │
│                                            │
└────────────────────────────────────────────┘
```

你的浏览器或应用要使用 Clash，需要把自己的流量"送"到这些端口。方式有几种：

- **手动设置代理**：在浏览器/系统设置里指定代理为 `127.0.0.1:7890`
- **设为系统代理**：Clash 自动修改系统代理设置，大部分应用自动走代理
- **TUN 模式**：Clash 创建一块虚拟网卡，在系统层面接管所有流量（效果最接近 VPN）

### 3.3 出站（Outbound）：流量往哪去

流量进入 Clash 后，根据规则匹配结果，会被分配到不同的"出站"：

```
出站类型：

DIRECT（直连）
  └── 直接访问目标，不经过任何代理
      适用于国内网站、局域网

REJECT（拒绝）
  └── 直接丢弃请求，什么都不做
      适用于广告域名、追踪器

Proxy（代理节点）
  └── 通过加密协议发送到远端代理服务器
      适用于需要代理的网站

Proxy Group（代理组）
  └── 一组代理节点的集合，支持负载均衡、自动选择等策略
      适用于有多个节点需要智能选择的场景
```

------

## 四、规则系统：Clash 的灵魂

### 4.1 规则是什么？

规则就是一组"如果...就..."的条件判断：

```yaml
# 规则的基本格式：
# 类型, 匹配值, 动作

# 如果域名是 google.com，就走代理
DOMAIN-SUFFIX,google.com,Proxy

# 如果域名是 baidu.com，就直连
DOMAIN-SUFFIX,baidu.com,DIRECT

# 如果访问的 IP 属于中国，就直连
GEOIP,CN,DIRECT

# 如果域名包含 "ad" 关键词，就拦截
DOMAIN-KEYWORD,ad,REJECT

# 所有其他流量，走代理（兜底规则）
MATCH,Proxy
```

### 4.2 规则匹配的过程

Clash 会**从上到下逐条检查**规则，找到第一条匹配的就执行，不再往下看：

```
一个请求：访问 www.google.com

规则 1: DOMAIN-SUFFIX,baidu.com,DIRECT     ← 不匹配，跳过
规则 2: DOMAIN-SUFFIX,google.com,Proxy      ← 匹配！走 Proxy
规则 3: GEOIP,CN,DIRECT                     ← 不会执行到这里
规则 4: MATCH,Proxy                          ← 不会执行到这里

结论：www.google.com → 走代理
```

这就像你去邮局寄信时，工作人员按照清单逐条检查目的地，找到匹配项就决定怎么发送。

### 4.3 常见规则类型详解

```
规则类型                  作用                              示例

DOMAIN                    精确匹配域名                      DOMAIN,www.google.com,Proxy
DOMAIN-SUFFIX             匹配域名后缀                      DOMAIN-SUFFIX,google.com,Proxy
                          （google.com 及其所有子域名）

DOMAIN-KEYWORD            域名包含关键词即匹配              DOMAIN-KEYWORD,google,Proxy
                          （任何包含 "google" 的域名）

IP-CIDR                   匹配目标 IP 地址段                IP-CIDR,8.8.8.0/24,Proxy
                          （8.8.8.x 这一段 IP）

GEOIP                     按 IP 归属国家匹配                GEOIP,CN,DIRECT
                          （利用 IP 地理数据库判断国家）

PROCESS-NAME              按发起请求的进程名匹配            PROCESS-NAME,Telegram.exe,Proxy
                          （Telegram 的流量走代理）

RULE-SET                  引用外部规则集                    RULE-SET,gfw-list,Proxy
                          （别人整理好的规则列表）

MATCH                     兜底规则，匹配一切                MATCH,Proxy
                          （前面都没匹配到就走这个）
```

### 4.4 规则集（Rule Provider）：站在巨人的肩膀上

自己写规则太累了。社区已经整理好了大量规则集，你可以直接引用：

```yaml
rule-providers:
  # 引用远程规则集
  gfw-list:
    type: http
    url: "https://example.com/rules/gfw.yaml"
    interval: 86400  # 每天自动更新一次

  china-direct:
    type: http
    url: "https://example.com/rules/china.yaml"
    interval: 86400

rules:
  - RULE-SET,gfw-list,Proxy        # 被墙的网站走代理
  - RULE-SET,china-direct,DIRECT   # 国内网站直连
  - MATCH,Proxy                    # 其他走代理
```

这就像导航软件里的"常用路线"——社区维护着各种路线方案，你选一个适合自己的就行，不用自己一条条路去规划。

------

## 五、代理协议：流量怎么加密传输

当 Clash 决定某条流量要走代理时，它需要通过特定的**代理协议**把数据发送到远端服务器。不同的协议就像不同的"运输方式"。

### 5.1 协议对比一览

```
诞生时间   协议名         设计理念

2013      Shadowsocks    轻量加密，像正常流量
2017      V2Ray/VMess    模块化设计，可伪装成 HTTPS
2019      Trojan         直接伪装成 HTTPS 流量
2020      VLESS          VMess 的简化版，更轻量
2021      Hysteria       基于 QUIC，追求极致速度
```

### 5.2 各协议通俗解释

**SOCKS5 / HTTP —— 最基础的代理协议**

```
你 ────请求────> 代理服务器 ────请求────> 目标网站
       ↑
    没有加密，只是单纯的转发
```

- 就像找了个朋友帮你去买东西，但你俩对话是公开的
- 通常只用于本机与 Clash 之间的通信（`127.0.0.1`），不走公网

**Shadowsocks（SS）—— 加密的信封**

```
你 ═══加密═══> SS 服务器 ────解密后转发────> 目标网站
```

- 数据用对称加密算法（如 AES-256-GCM）加密
- 流量特征被设计得**像随机数据**，难以被识别
- 轻量、快速，配置简单
- 类比：把信装进一个**不透明的信封**，外人看不到内容

**VMess（V2Ray）—— 变装大师**

```
你 ═══加密+伪装══> V2Ray 服务器 ────解密后转发────> 目标网站
         ↑
    可以伪装成 HTTP、WebSocket、gRPC 等协议
```

- 支持多种**传输层伪装**（WebSocket、gRPC、HTTP/2）
- 可以套上 TLS，使流量看起来和正常 HTTPS 网站一模一样
- 类比：不仅把信装进信封，还把信封**伪装成一个普通的快递包裹**

**Trojan —— 卧底特工**

```
你 ═══TLS 加密══> Trojan 服务器 ────解密后转发────> 目标网站
         ↑
    流量和正常访问 HTTPS 网站完全一样
```

- 设计理念是**直接伪装成 HTTPS 流量**
- 服务器同时是一个真正的 HTTPS 网站（比如一个博客）
- 只有携带正确密码的流量才会被识别为代理请求，其他流量正常展示网页
- 类比：代理服务器是一家**正常营业的咖啡店**，只有说出暗号的人才能进入密室

**Hysteria —— 速度狂人**

```
你 ═══QUIC 加密══> Hysteria 服务器 ────转发────> 目标网站
         ↑
    基于 UDP 的 QUIC 协议，速度极快
```

- 基于 QUIC 协议（HTTP/3 使用的底层协议）
- 特别擅长在**高丢包、高延迟**的网络环境下保持高速
- 类比：别人开车走公路，它**开直升机**——不受路面拥堵影响

------

## 六、代理组：智能选择最佳线路

当你有多个代理节点时，Clash 的**代理组**功能可以帮你智能管理它们。

### 6.1 代理组策略类型

```yaml
proxy-groups:
  # 手动选择：你自己选用哪个节点
  - name: "手动选择"
    type: select
    proxies: [香港节点, 日本节点, 美国节点]

  # 自动测速：自动选延迟最低的节点
  - name: "自动选择"
    type: url-test
    proxies: [香港节点, 日本节点, 美国节点]
    url: "http://www.gstatic.com/generate_204"
    interval: 300  # 每 5 分钟测一次速

  # 故障转移：主节点挂了自动切到备用
  - name: "故障转移"
    type: fallback
    proxies: [主节点, 备用节点1, 备用节点2]
    url: "http://www.gstatic.com/generate_204"
    interval: 300

  # 负载均衡：多个节点均匀分配流量
  - name: "负载均衡"
    type: load-balance
    proxies: [节点1, 节点2, 节点3]
    strategy: round-robin
```

### 6.2 用一个图来理解

```
                   ┌── 香港节点 1 (延迟 50ms)  ✓ 自动选中
自动选择组 ────────┼── 香港节点 2 (延迟 80ms)
(url-test)         ├── 日本节点   (延迟 120ms)
                   └── 美国节点   (延迟 200ms)

                   ┌── 主节点     (正常)  ✓ 使用中
故障转移组 ────────┼── 备用节点 1 (待命)
(fallback)         └── 备用节点 2 (待命)
                        ↑
                   主节点挂了才会切换到这里
```

------

## 七、DNS 处理：容易被忽略的关键环节

DNS（域名解析）是网络请求的第一步——把 `www.google.com` 翻译成 IP 地址。Clash 对 DNS 有特殊的处理方式，这也是很多人配置出问题的地方。

### 7.1 为什么 Clash 要自己处理 DNS？

```
没有 Clash 时的 DNS：
你的电脑 ──"google.com 的 IP 是多少？"──> 运营商 DNS
                                           │
                                     运营商知道你要访问 Google
                                     （隐私泄露！）
```

如果 DNS 请求不经过 Clash，即使你的代理通道是加密的，运营商照样能通过 DNS 请求知道你访问了哪些网站。这就是所谓的 **DNS 泄露**。

### 7.2 Clash 的 DNS 处理方式

```yaml
dns:
  enable: true
  listen: 0.0.0.0:53
  nameserver:
    - https://dns.alidns.com/dns-query  # 国内 DNS（DoH 加密）
    - https://doh.pub/dns-query
  fallback:
    - https://dns.google/dns-query      # 国外 DNS（DoH 加密）
    - https://cloudflare-dns.com/dns-query
  fallback-filter:
    geoip: true
    geoip-code: CN
```

这段配置的含义是：

```
                    Clash DNS 模块
                         │
           ┌─────────────┼─────────────┐
           ▼                           ▼
     nameserver                   fallback
   （国内 DNS 服务器）           （国外 DNS 服务器）
   阿里 DNS、腾讯 DNS          Google DNS、Cloudflare
           │                           │
           ▼                           ▼
      解析出的 IP                  解析出的 IP
      是中国 IP？                  作为备用结果
           │
     ┌─────┴─────┐
     是           否
     │            │
     ▼            ▼
  使用国内结果   使用 fallback 结果
  （更快）      （更准确）
```

**简单来说：** 国内网站用国内 DNS 解析（快），国外网站用国外 DNS 解析（准），两全其美。

### 7.3 fake-ip 模式：巧妙的设计

Clash 有一种叫 `fake-ip` 的 DNS 模式，非常巧妙：

```
传统模式：
1. 浏览器问 Clash："google.com 的 IP 是？"
2. Clash 去问 DNS 服务器，等待回答
3. Clash 告诉浏览器："是 142.250.xxx.xxx"
4. 浏览器连接 142.250.xxx.xxx
5. Clash 根据 IP 匹配规则，决定走不走代理
   （但此时只有 IP，域名信息可能丢失，规则匹配变难）

fake-ip 模式：
1. 浏览器问 Clash："google.com 的 IP 是？"
2. Clash 立刻返回一个假 IP："198.18.0.10"
   （从一个保留地址段里分配的）
3. Clash 内部记住：198.18.0.10 = google.com
4. 浏览器连接 198.18.0.10
5. Clash 拦截到请求，查表得知是 google.com
6. 用域名（而非 IP）去匹配规则 → 匹配更精确
7. 走代理时，把域名 google.com 发给代理服务器
   由代理服务器在远端进行真正的 DNS 解析
```

**好处：**

- 速度快（不需要等真实 DNS 解析）
- 规则匹配更准确（始终保留域名信息）
- 彻底避免 DNS 泄露（本地根本没有进行真实解析）

------

## 八、TUN 模式：让 Clash 接管一切

默认情况下，Clash 作为一个"代理"工作——应用程序需要主动把流量发给 Clash 才行。但有些程序不支持设置代理（比如某些游戏、命令行工具），这时候就需要 **TUN 模式**。

### 8.1 系统代理 vs TUN 模式

```
系统代理模式：
┌──────────────────────────────┐
│  操作系统                     │
│                              │
│  浏览器 ─── 走代理 ───┐      │
│  微信   ─── 走代理 ───┤      │    只有"听话"的程序
│  Telegram ─ 不走代理 ─┤      │    才会走系统代理
│  SSH    ─── 不走代理 ─┘      │
│                    ▼         │
│              Clash (7890)    │
└──────────────────────────────┘

TUN 模式：
┌──────────────────────────────┐
│  操作系统                     │
│                              │
│  浏览器 ──┐                  │
│  微信   ──┤                  │    所有流量都必须
│  Telegram ┤                  │    经过虚拟网卡
│  SSH    ──┤                  │
│  游戏   ──┘                  │
│           ▼                  │
│     虚拟网卡 (TUN)            │
│           ▼                  │
│     Clash 内核处理            │
└──────────────────────────────┘
```

### 8.2 TUN 的工作原理

```
┌─────────────────────────────────────────────┐
│ 1. Clash 创建一块虚拟网卡（如 utun0）         │
│ 2. 修改系统路由表，让所有流量走这块虚拟网卡     │
│ 3. 操作系统把所有流量交给虚拟网卡               │
│ 4. Clash 从虚拟网卡读取流量                    │
│ 5. 按规则分流（和之前一样）                    │
│ 6. 代理流量 → 加密发往代理服务器               │
│    直连流量 → 从真实网卡直接发出               │
└─────────────────────────────────────────────┘
```

TUN 模式让 Clash 的行为**非常接近 VPN**——在系统层面接管所有网络流量。区别在于 Clash 依然会按规则分流，而不是把所有流量一股脑送到远端。

------

## 九、Clash 配置文件结构一览

一个完整的 Clash 配置文件就像一份"交通管理方案"：

```yaml
# ===== 基础设置 =====
port: 7890              # HTTP 代理端口
socks-port: 7891        # SOCKS5 代理端口
allow-lan: true         # 是否允许局域网设备连接
mode: rule              # 工作模式：rule(规则) / global(全局代理) / direct(全直连)
log-level: info         # 日志级别

# ===== DNS 设置 =====
dns:
  enable: true
  enhanced-mode: fake-ip
  nameserver:
    - https://dns.alidns.com/dns-query
  fallback:
    - https://dns.google/dns-query

# ===== 代理节点 =====
proxies:
  - name: "香港节点"
    type: trojan
    server: hk.example.com
    port: 443
    password: your-password

  - name: "日本节点"
    type: ss
    server: jp.example.com
    port: 8388
    cipher: aes-256-gcm
    password: your-password

# ===== 代理组 =====
proxy-groups:
  - name: "自动选择"
    type: url-test
    proxies: [香港节点, 日本节点]
    url: "http://www.gstatic.com/generate_204"
    interval: 300

  - name: "手动选择"
    type: select
    proxies: [自动选择, 香港节点, 日本节点, DIRECT]

# ===== 规则 =====
rules:
  - DOMAIN-SUFFIX,google.com,手动选择
  - DOMAIN-SUFFIX,github.com,手动选择
  - DOMAIN-SUFFIX,baidu.com,DIRECT
  - DOMAIN-SUFFIX,bilibili.com,DIRECT
  - GEOIP,CN,DIRECT
  - MATCH,手动选择    # 兜底：其他全走代理
```

**结构关系图：**

```
配置文件
├── 基础设置（端口、模式）
├── DNS 设置（域名解析方式）
├── proxies（代理节点列表）
│   ├── 香港节点
│   ├── 日本节点
│   └── ...
├── proxy-groups（代理组）
│   ├── 自动选择 ── 引用 → 香港节点, 日本节点
│   └── 手动选择 ── 引用 → 自动选择, 各节点, DIRECT
└── rules（规则列表）
    ├── google.com → 手动选择
    ├── baidu.com → DIRECT
    └── 兜底 → 手动选择
```

------

## 十、Clash 的各种客户端

Clash 本身是一个内核（后台程序），不同平台有不同的图形界面客户端：

```
平台        客户端名称              特点

Windows    Clash Verge Rev         功能丰富，支持 TUN
           Clash for Windows*      经典但已停更

macOS      ClashX Pro*             轻量，支持增强模式
           Clash Verge Rev         跨平台一致体验

Linux      Clash Verge Rev         原生 Linux 支持
           命令行直接运行内核       极客最爱

Android    ClashMeta for Android   Material Design 界面

iOS        Stash                   App Store 付费应用
           Shadowrocket            支持 Clash 配置导入

路由器      OpenClash (OpenWrt)     在路由器层面代理全家设备
           ShellCrash              轻量级路由器方案
```

> 注：标 * 的客户端原作者已停止维护，但社区有活跃的分支版本继续开发。

------

## 十一、Clash 内核的演变

```
2018 ──── Clash（原版）
           │   Go 语言编写，奠定了基本架构
           │
2020 ──── Clash Premium（闭源增强版）
           │   增加 TUN、Script 等高级功能
           │
2022 ──── Clash.Meta（社区分支）
           │   开源，支持更多新协议（VLESS、Hysteria 等）
           │   后改名为 mihomo
           │
2023 ──── 原版 Clash 及 Premium 停更
           │
2024 ──── mihomo 成为事实上的主流内核
           继续活跃开发中
```

目前绝大多数 Clash 客户端底层都已切换到 **mihomo** 内核，它在原版基础上增加了大量新特性：

- 支持更多协议（VLESS、Hysteria2、TUIC 等）
- 更强大的规则系统（逻辑规则、子规则等）
- 更好的 TUN 模式实现
- 进程级别的流量匹配

------

## 十二、安全注意事项

使用 Clash 时，有几点安全事项值得注意：

### 12.1 配置文件安全

```
⚠️ 你的 Clash 配置文件里包含：
├── 代理服务器地址
├── 密码/UUID
└── 这些都是敏感信息！

做到：
✓ 不要把配置文件发给别人
✓ 不要上传到公开的代码仓库
✓ 定期更换订阅链接
✗ 不要使用来路不明的配置文件（可能包含恶意规则）
```

### 12.2 订阅链接安全

很多人通过"订阅链接"获取节点信息。这些链接本质上是一个 URL，返回你的全部节点配置。**订阅链接 = 你的全部代理节点**，泄露了就等于把你的代理账号给了别人。

### 12.3 DNS 泄露防范

```
确保 Clash 的 DNS 功能已开启：
dns:
  enable: true        ← 必须是 true

如果设为 false，DNS 请求会走系统默认的 DNS，
可能导致你访问什么网站被运营商看到。
```

------

## 十三、总结

```
┌──────────────────────────────────────────────────────────┐
│                    Clash 全景图                           │
│                                                          │
│   你的设备                                                │
│   ┌──────┐                                               │
│   │ 所有  │──── 流量 ────>  Clash                         │
│   │ 应用  │            ┌──────────────────┐              │
│   └──────┘            │ 1. DNS 解析       │              │
│                       │ 2. 规则匹配       │              │
│                       │ 3. 分流决策       │              │
│                       └──┬────┬────┬─────┘              │
│                          │    │    │                      │
│                  ┌───────┘    │    └───────┐              │
│                  ▼            ▼            ▼              │
│              代理服务器    DIRECT 直连   REJECT 拦截      │
│              (加密传输)   (国内网站)    (广告/追踪)       │
│                  │            │                           │
│                  ▼            ▼                           │
│              目标网站      目标网站                        │
│                                                          │
│   核心价值：规则分流 —— 该走代理的走代理，该直连的直连     │
└──────────────────────────────────────────────────────────┘
```

**一句话总结：Clash 是一个智能交通管制系统，它根据你设定的规则，为每一条网络请求选择最合适的路径——该走代理的加密走代理，该直连的快速直连，该拦截的直接丢弃。**

和上一篇 VPN 文章对照看，你会发现：VPN 是一条"全包式高速公路"，而 Clash 是一个"精细化的智能导航系统"。它们解决的问题有重叠，但设计哲学完全不同。理解了这一点，你就能在合适的场景选择合适的工具。

------

> 本文为科普性质的技术入门文章，旨在帮助非技术背景的读者理解 Clash 代理工具的工作原理。如需了解 WSL 环境下的具体代理配置方法，可参阅本站的 [WSL 2 网络深入解析](/posts/wsl-networking-vpn-guide/) 一文。
