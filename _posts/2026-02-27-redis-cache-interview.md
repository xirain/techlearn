---
title: Redis 与缓存架构面试题 —— 从底层数据结构到分布式缓存的深度问答
description: 覆盖Redis五大数据结构底层实现(SDS/ziplist/skiplist/dict)、持久化(RDB/AOF)、过期淘汰(LRU/LFU)、缓存穿透/击穿/雪崩、分布式锁(RedLock)、Cluster/哨兵/主从复制、缓存一致性模式，25 道高频题附架构图
date: 2026-02-27
categories: [数据库]
tags: [redis, 面试, 缓存, 分布式锁, 数据结构, 持久化, 缓存穿透, 缓存雪崩, cluster, 高可用]
---

Redis 是后端面试的**超高频考点**——几乎所有后端岗位都会问 Redis 相关问题。能讲清楚 Redis 底层数据结构、缓存异常场景和分布式锁的人，展示的是对**存储层和系统架构**的深度理解。

这篇文章从**底层实现 → 持久化 → 缓存模式 → 高可用 → 分布式**五条线展开，每道题都带**底层结构图**，帮你从"会用 Redis"升级到"理解 Redis"。

> 📌 关联阅读：[数据库面试题](/techlearn/posts/database-interview) · [系统设计面试题](/techlearn/posts/system-design-interview) · [高性能优化面试题](/techlearn/posts/high-performance-interview)

------

## 第一部分：底层数据结构

### Q1：Redis 的 String 底层是怎么实现的？和 C 的 char* 有什么区别？

**记忆点**：Redis 的 String 用 **SDS（Simple Dynamic String）**，不是 C 字符串

```
C 字符串：
┌─┬─┬─┬─┬──┐
│H│e│l│l│\0│    ← 以 \0 结尾，获取长度需要 O(n) 遍历
└─┴─┴─┴─┴──┘

SDS 结构：
┌──────┬──────┬──────┬─┬─┬─┬─┬──┐
│ len  │ free │ flags│H│e│l│l│\0│
│  4   │  6   │      │ │ │ │ │  │
└──────┴──────┴──────┴─┴─┴─┴─┴──┘
  ↑ O(1)获取长度   ↑ 预分配空间，减少扩容
```

**SDS vs C 字符串**：

| 维度 | C 字符串 | SDS |
|------|---------|-----|
| 获取长度 | O(n) 遍历 | O(1) 直接读 len |
| 缓冲区溢出 | 手动管理，容易溢出 | 自动扩容，安全 |
| 修改时内存分配 | 每次 | 空间预分配 + 惰性释放 |
| 二进制安全 | 否（\0 截断） | 是（用 len 判断结束） |
| 兼容 C 函数 | 是 | 是（末尾保留 \0） |

**空间预分配策略**：
- 修改后 len < 1MB：分配 2 × len 的空间
- 修改后 len ≥ 1MB：多分配 1MB
- 减少连续增长时的内存分配次数

**面试加分**：Redis 的 String 底层有 3 种编码——int（纯数字）、embstr（≤44 字节，SDS 和 redisObject 一次分配）、raw（>44 字节，两次分配）。

---

### Q2：Redis 的 Hash 底层什么时候用 ziplist，什么时候用 hashtable？

**记忆点**：**小 Hash 用 ziplist 省内存，大 Hash 转 hashtable 提性能**

```
ziplist（压缩列表）：
┌────────┬────────┬───────┬───────┬───────┬───────┬────┐
│zlbytes │zltail  │zllen  │entry1 │entry2 │entry3 │end │
│总字节数│尾偏移  │节点数 │field1 │value1 │field2 │0xFF│
└────────┴────────┴───────┴───────┴───────┴───────┴────┘
  ↑ 连续内存，缓存友好！但查找 O(n)

hashtable（字典）：
┌─────────┐
│ dict    │
│ ht[0]──→ ┌───┐
│         │ │[0]│→ entry(field1,val1) → NULL
│         │ │[1]│→ NULL
│ ht[1]  │ │[2]│→ entry(field2,val2) → entry(field3,val3)
│(rehash)│ │[3]│→ NULL
└─────────┘ └───┘
  ↑ 链式哈希，O(1) 查找
```

**转换条件**（任一满足就转 hashtable）：

| 参数 | 默认值 | 含义 |
|------|-------|------|
| `hash-max-ziplist-entries` | 128 | field 数量超过 128 |
| `hash-max-ziplist-value` | 64 | 任何 value 长度超过 64 字节 |

> Redis 7.0 后 ziplist 被 **listpack** 替代，解决了 ziplist 的级联更新问题。

---

### Q3：Redis 的 ZSet（有序集合）底层为什么用跳表而不是红黑树？

**记忆点**：跳表 = **实现简单 + 范围查询快 + 并发友好**

```
ZSet 底层结构（score + member）：

当元素少（<128个，每个<64B）→ ziplist
当元素多 → dict + skiplist 双结构

dict：member → score  的 O(1) 查找
skiplist：按 score 排序，支持范围查询

┌──────────────┐         ┌───────────────────────────┐
│    dict      │         │       skiplist             │
│ "alice"→90   │         │ Level 3: → 60 ──────→ NIL │
│ "bob"  →60   │         │ Level 2: → 60 → 85 ──→ NIL│
│ "carol"→85   │         │ Level 1: → 60 → 85 → 90→NIL│
└──────────────┘         └───────────────────────────┘
   ↑ O(1)按名查分             ↑ O(logN)范围查询
```

**跳表 vs 红黑树 for Redis**：

| 维度 | 跳表 | 红黑树 |
|------|------|--------|
| 实现复杂度 | 简单（~300行） | 复杂（旋转+着色） |
| 范围查询 ZRANGEBYSCORE | O(logN)+O(M)，天然链表 | O(logN)+中序遍历，较复杂 |
| 内存占用 | 每节点平均 1.33 个指针 | 每节点 3 个指针+颜色 |
| 并发修改 | 局部锁/CAS 即可 | 旋转可能影响祖先 |

**面试加分**：Redis 作者 antirez 说选跳表的原因——"跳表实现起来更简单，调试也容易，而且支持 ZRANGEBYSCORE 这样的范围操作非常自然。"

---

### Q4：Redis 的 dict（字典）怎么做 rehash？为什么要渐进式？

**记忆点**：渐进式 rehash = **每次操作迁移一点，避免一次性阻塞**

```
渐进式 rehash 过程：

初始状态：
  ht[0]: [■][■][■][■]    ← 4 个桶，已满
  ht[1]: (空)
  rehashidx: -1（未在 rehash）

开始 rehash：
  ht[0]: [■][■][■][■]    ← 旧表
  ht[1]: [_][_][_][_][_][_][_][_]  ← 新表（2倍大小）
  rehashidx: 0（从第 0 个桶开始迁移）

每次增删改查时，顺便迁移 ht[0][rehashidx] → ht[1]：
  ht[0]: [_][■][■][■]    ← 第0桶已迁移
  ht[1]: [_][■][_][_][_][_][_][_]
  rehashidx: 1

  ...逐步迁移...

完成：
  ht[0]: [_][_][_][_]    ← 全部迁移完，释放
  ht[1]: [■][_][■][■][_][■][_][■]  ← 新表
  rehashidx: -1
  ht[0] = ht[1], ht[1] = NULL
```

**rehash 期间的操作规则**：
- **查找**：先查 ht[0]，没找到再查 ht[1]
- **新增**：只往 ht[1] 写（保证 ht[0] 只减不增）
- **删除/修改**：两个表都要操作

**为什么不一次性 rehash？** 如果有百万级 key，一次迁移可能阻塞几秒，对于单线程的 Redis 来说是致命的。

---

## 第二部分：持久化

### Q5：RDB 和 AOF 的区别？各自的优缺点？

**记忆点**：RDB = **快照**（数据紧凑），AOF = **日志**（不丢数据）

```
RDB（定时快照）：
  时间线：──────[快照1]──────[快照2]──────[崩溃]
                                          ↑
                              丢失最后一次快照后的数据

AOF（追加日志）：
  时间线：──[cmd1][cmd2][cmd3]...[cmdN][崩溃]
                                       ↑
                             最多丢 1 秒数据（everysec）
```

| 维度 | RDB | AOF |
|------|-----|-----|
| 持久化方式 | 定时全量快照 | 追加每条写命令 |
| 文件大小 | 紧凑（二进制） | 较大（文本命令） |
| 恢复速度 | 快（直接加载） | 慢（重放命令） |
| 数据安全 | 可能丢几分钟数据 | 最多丢 1 秒（everysec） |
| fork 开销 | 大（生成快照） | 小（只 rewrite 时 fork） |
| IO 开销 | 低（定时一次） | 高（持续写文件） |

**AOF 的三种刷盘策略**：

| 策略 | 行为 | 数据安全 | 性能 |
|------|------|---------|------|
| `always` | 每条命令都 fsync | 不丢数据 | 最慢 |
| `everysec` | 每秒 fsync | 最多丢 1 秒 | **推荐** |
| `no` | 交给 OS 决定 | 可能丢很多 | 最快 |

**面试加分**：Redis 4.0 引入**混合持久化**——AOF rewrite 时先写 RDB 格式（快），后续追加 AOF 命令。兼顾恢复速度和数据安全。

---

### Q6：BGSAVE 用的 fork + COW 机制是什么？有什么风险？

**记忆点**：fork 出子进程做快照，COW 避免复制全部内存

```
BGSAVE 流程：

1. 主进程 fork() → 子进程（COW 共享内存页）

   主进程              子进程
   ┌──────────┐       ┌──────────┐
   │ 页表 ─────┼──┐┌──┼── 页表   │
   └──────────┘  ││  └──────────┘
                 ↓↓
            ┌──────────┐
            │ 物理页面   │  ← 共享，只读标记
            └──────────┘

2. 子进程遍历数据，生成 RDB 文件
3. 主进程继续处理客户端请求
4. 主进程写入某页 → 触发 COW → 只复制该页

风险：
  如果主进程写入密集 → 大量页被 COW 复制
  → 内存可能翻倍！
  → 建议预留 maxmemory 的 50% 给 COW
```

**实战配置**：

```bash
# 关闭透明大页（避免 COW 复制 2MB 大页而非 4KB 小页）
echo never > /sys/kernel/mm/transparent_hugepage/enabled

# 允许 overcommit（否则 fork 可能因内存不足失败）
sysctl vm.overcommit_memory=1
```

---

## 第三部分：过期与淘汰

### Q7：Redis 的过期 key 是怎么删除的？

**记忆点**：**定期删除 + 惰性删除**双保险

```
惰性删除（被动）：
  GET key → 发现已过期 → 删除 → 返回 nil
  ✅ 无 CPU 浪费
  ❌ 过期 key 不被访问就永远不删，内存泄漏

定期删除（主动）：
  每 100ms 执行一次：
  1. 随机取 20 个设了过期时间的 key
  2. 删除其中已过期的
  3. 如果过期比例 > 25%，重复步骤 1
  4. 限制每次执行时间 ≤ 25ms（避免阻塞）
  ✅ 主动清理
  ❌ 仍可能有漏网之鱼

两者结合 = 尽量及时清理 + 不阻塞主线程
```

---

### Q8：内存不够时，Redis 的淘汰策略有哪些？怎么选？

**记忆点**：**8 种策略，分为 3 类——不淘汰 / 全部 key / 只看有过期时间的**

| 策略 | 作用范围 | 行为 |
|------|---------|------|
| `noeviction` | - | 不淘汰，写入报错（默认） |
| `allkeys-lru` | 所有 key | LRU 最近最少使用 ✅推荐 |
| `allkeys-lfu` | 所有 key | LFU 最不经常使用（Redis 4.0+） |
| `allkeys-random` | 所有 key | 随机淘汰 |
| `volatile-lru` | 有过期时间 | LRU |
| `volatile-lfu` | 有过期时间 | LFU |
| `volatile-random` | 有过期时间 | 随机 |
| `volatile-ttl` | 有过期时间 | 淘汰 TTL 最短的 |

**LRU vs LFU**：

```
LRU（最近最少使用）：
  按最后访问时间淘汰
  问题：偶尔被访问一次的冷数据会"续命"

LFU（最不经常使用）：
  按访问频率淘汰，频率低的先淘汰
  更精确，但实现更复杂

Redis 的近似 LRU：
  不是精确 LRU（太贵），而是随机采样 5 个 key，淘汰其中最久没用的
  maxmemory-samples 参数控制采样数（越大越精确，但越慢）
```

**选择建议**：

| 场景 | 推荐策略 |
|------|---------|
| 缓存（所有数据都可丢） | `allkeys-lru` 或 `allkeys-lfu` |
| 部分数据必须保留 | `volatile-lru`（只淘汰设了过期的） |
| 所有 key 等概率访问 | `allkeys-random` |

---

## 第四部分：缓存异常场景

### Q9：什么是缓存穿透？怎么解决？

**记忆点**：穿透 = **查不存在的数据，每次都打到数据库**

```
正常流程：
  请求 → Redis（命中）→ 返回         ← 大部分请求在这里挡住

缓存穿透：
  请求 key="不存在的ID" → Redis（未命中）→ DB（也没有）→ 返回空
  攻击者大量请求不存在的 key → 全部打到 DB → DB 崩溃！
```

**解决方案**：

| 方案 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| 缓存空值 | 不存在也缓存 `key → null`，短 TTL | 简单 | 浪费内存 |
| 布隆过滤器 | 请求前先问布隆"这个 key 存在吗？" | 内存小、效果好 | 有误判、不能删除 |
| 参数校验 | 接口层校验 ID 格式合法性 | 简单有效 | 只能挡基础攻击 |

```
布隆过滤器方案：
  请求 → 布隆过滤器 → "不存在" → 直接返回（不查 DB）
                    → "可能存在" → Redis → DB
```

---

### Q10：什么是缓存击穿？怎么解决？

**记忆点**：击穿 = **热点 key 过期瞬间，大量请求打到 DB**

```
正常：    热点key → Redis（命中）→ 返回
                    ↓ key 过期
击穿瞬间：1000 个并发请求同时发现 key 过期
          → 1000 个请求同时查 DB → DB 被打崩

时间线：
  ─────[key有效]─────[key过期]─────[key重建]─────
                      ↑ 这个窗口期所有请求都穿透到DB
```

**解决方案**：

| 方案 | 原理 | 实现 |
|------|------|------|
| 互斥锁 | 只让 1 个请求去查 DB 重建缓存 | `SETNX lock_key 1 EX 10` |
| 逻辑过期 | key 永不过期，value 里存过期时间 | 发现逻辑过期后异步重建 |
| 热点预加载 | 预判热点 key，提前续期 | 定时任务刷新 |

```
互斥锁方案伪代码：
  value = redis.get(key)
  if value == null:
      if redis.setnx(lock_key, 1, ex=10):   # 获取锁
          value = db.query(key)               # 查 DB
          redis.set(key, value, ex=300)       # 重建缓存
          redis.del(lock_key)                 # 释放锁
      else:
          sleep(50ms)                         # 没拿到锁，等一下
          return redis.get(key)               # 重试获取
```

---

### Q11：什么是缓存雪崩？怎么解决？

**记忆点**：雪崩 = **大量 key 同时过期 或 Redis 宕机，全部打到 DB**

```
雪崩场景1：大批 key 同一时间过期
  ──[key1,key2,...key10000 同时过期]──
                 ↓
    10000 个请求同时穿透到 DB → 崩溃

雪崩场景2：Redis 节点宕机
  ──[Redis 挂了]──
      ↓
    所有请求直接打 DB → 崩溃
```

**解决方案**：

| 场景 | 方案 | 实现 |
|------|------|------|
| 同时过期 | TTL 加随机值 | `ttl = base_ttl + random(0, 300)` |
| 同时过期 | 分级缓存 | L1 本地缓存 + L2 Redis |
| Redis 宕机 | 高可用部署 | 哨兵/Cluster |
| Redis 宕机 | 熔断降级 | 直接返回默认值/限流 |
| Redis 宕机 | 本地缓存兜底 | Caffeine/Guava Cache |

**三大缓存异常速记**：

```
穿透：查不存在的 → 布隆过滤器 / 缓存空值
击穿：热点key过期 → 互斥锁 / 逻辑过期
雪崩：大批同时过期 → TTL加随机 / 熔断降级
```

---

## 第五部分：缓存一致性

### Q12：如何保证缓存和数据库的一致性？

**记忆点**：**先更新 DB，再删除缓存（Cache-Aside 模式）**

```
四种策略对比：

1. 先更新DB，再更新缓存  ❌
   线程A更新DB→          线程A更新缓存(新值)
   线程B更新DB→线程B更新缓存(新值)
   → 可能 A 的缓存覆盖了 B 的（竞争条件）

2. 先删缓存，再更新DB    ❌
   线程A删缓存→          线程A更新DB
   线程B读缓存(miss)→线程B读DB(旧值)→线程B写缓存(旧值)
   → 缓存中是脏数据！

3. 先更新DB，再删缓存    ✅ 推荐（Cache-Aside）
   线程A更新DB → 线程A删缓存
   → 下次读取时从DB重新加载
   → 仍有极小概率不一致（读写并发），但概率极低

4. 延迟双删              ✅ 增强版
   删缓存 → 更新DB → sleep(500ms) → 再删缓存
   → 第二次删除覆盖并发读写产生的脏数据
```

**Cache-Aside 模式（最推荐）**：

```
读取：
  1. 读 Redis → 命中 → 返回
  2. 未命中 → 读 DB → 写入 Redis → 返回

写入：
  1. 更新 DB
  2. 删除 Redis 中的 key（下次读时重建）
```

**为什么是"删除"而不是"更新"？**
- 更新可能存在竞争条件（A/B 线程交叉写入）
- 删除是幂等操作，更安全
- 缓存可能是计算后的结果（join/聚合），更新成本高

**面试加分**：对于强一致性需求，可以用 **binlog 订阅**（Canal）——监听 MySQL binlog，异步删除/更新 Redis，实现最终一致性。

---

## 第六部分：分布式锁

### Q13：用 Redis 实现分布式锁的正确姿势是什么？

**记忆点**：`SET key value NX EX` + 唯一标识 + Lua 释放

```
错误写法（逐步分析）：

// 错误1：SETNX + EXPIRE 不是原子的
SETNX lock_key 1      ← 设置成功
EXPIRE lock_key 10    ← 如果这里崩溃，锁永不过期！

// 错误2：没有唯一标识
SET lock_key 1 NX EX 10
// 线程A加锁 → A超时 → 锁自动释放
// 线程B加锁成功
// 线程A完成后 DEL lock_key ← 删掉了B的锁！

// 正确写法：
SET lock_key <uuid> NX EX 10    ← 原子操作，值为唯一ID

// 释放锁（Lua 脚本保证原子性）：
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
else
    return 0
end
```

**完整流程**：

```
加锁：
  SET lock:order:123 "uuid-xxx" NX EX 30
  ↑ key         ↑ 唯一标识  ↑不存在才设 ↑30秒超时

续期（看门狗）：
  后台线程每 10 秒检查：如果业务还在执行，PEXPIRE 续期
  → Redisson 的 WatchDog 机制

释放：
  Lua 脚本：GET + 比较 uuid + DEL（原子操作）
```

---

### Q14：RedLock 算法是什么？有什么争议？

**记忆点**：RedLock = 向 N 个独立 Redis 节点**多数派加锁**

```
RedLock 流程（5 个独立 Redis 节点）：

1. 获取当前时间 T1
2. 依次向 5 个节点发送 SET key uuid NX EX ttl
3. 统计成功数量，获取当前时间 T2
4. 如果成功 ≥ 3（多数派）且 T2-T1 < ttl → 加锁成功
5. 加锁成功：锁的有效时间 = ttl - (T2-T1)
6. 加锁失败：向所有节点发送 DEL 释放

  Node1: SET ✓
  Node2: SET ✓    3/5 成功
  Node3: SET ✗    → 加锁成功
  Node4: SET ✓
  Node5: SET ✗
```

**争议（Martin Kleppmann vs antirez）**：

| 论点 | Kleppmann（反对） | antirez（支持） |
|------|------------------|----------------|
| 时钟问题 | 节点时钟跳跃可能导致锁提前过期 | 可以用单调时钟 |
| GC 暂停 | 拿到锁后 GC 暂停，锁超时 | fencing token 解决 |
| 网络延迟 | 消息延迟导致判断错误 | 超时时间减去获取耗时 |

**实际建议**：
- 对**效率**要求的锁（防止重复计算）→ 单节点 Redis 锁够了
- 对**正确性**要求的锁（防止数据损坏）→ 用 ZooKeeper/etcd

---

## 第七部分：高可用架构

### Q15：Redis 主从复制的原理？全量复制和增量复制？

**记忆点**：**首次全量（RDB）+ 后续增量（repl_backlog）**

```
全量复制（首次连接）：
  Master                        Slave
    │  1. PSYNC ? -1              │
    │←─────────────────────────── │
    │  2. FULLRESYNC runid offset │
    │──────────────────────────→  │
    │  3. BGSAVE 生成 RDB          │
    │  4. 发送 RDB 文件            │
    │──────────────────────────→  │
    │  5. 发送 repl_backlog 中     │
    │     RDB 生成期间的增量命令    │
    │──────────────────────────→  │

增量复制（断线重连）：
  Master                        Slave
    │  PSYNC runid offset         │
    │←─────────────────────────── │
    │  CONTINUE                   │
    │  发送 offset 之后的增量命令  │
    │──────────────────────────→  │

repl_backlog（环形缓冲区）：
┌──────────────────────────────────┐
│ cmd1 │ cmd2 │ cmd3 │ ... │ cmdN │  ← 固定大小，写满后覆盖
└──────────────────────────────────┘
       ↑ slave_offset    ↑ master_offset
  如果 slave 断线太久，offset 被覆盖 → 只能全量复制
```

---

### Q16：哨兵（Sentinel）的故障转移流程是什么？

**记忆点**：**主观下线 → 客观下线 → 选举 Leader → 故障转移**

```
哨兵集群（至少3个哨兵）：

    ┌─────────┐  ┌─────────┐  ┌─────────┐
    │Sentinel1│  │Sentinel2│  │Sentinel3│
    └────┬────┘  └────┬────┘  └────┬────┘
         │            │            │
    ┌────┴────────────┴────────────┴────┐
    │           Redis Master            │
    └──────┬──────────────┬─────────────┘
           ↓              ↓
    ┌──────────┐   ┌──────────┐
    │  Slave1  │   │  Slave2  │
    └──────────┘   └──────────┘

故障转移步骤：
1. 主观下线(SDOWN): 某个 Sentinel ping Master 超时
2. 客观下线(ODOWN): 超过 quorum 个 Sentinel 都认为 Master 下线
3. Leader 选举: Sentinel 之间用 Raft 选出 Leader
4. Leader 执行故障转移:
   a. 选一个 Slave 升级为 Master（优先级/复制偏移量/runid）
   b. 通知其他 Slave 指向新 Master
   c. 通知客户端新 Master 地址
   d. 将旧 Master 标记为 Slave（恢复后自动成为新 Master 的从节点）
```

---

### Q17：Redis Cluster 的分片原理？

**记忆点**：**16384 个 slot，CRC16(key) % 16384 决定分配到哪个节点**

```
Redis Cluster（6 节点，3主3从）：

Node A (Master): slots 0-5460        Node D (Slave of A)
Node B (Master): slots 5461-10922    Node E (Slave of B)
Node C (Master): slots 10923-16383   Node F (Slave of C)

key 路由：
  slot = CRC16("user:1001") % 16384 = 8923
  → slot 8923 属于 Node B → 请求路由到 Node B

客户端连接任意节点：
  Client → Node A: GET user:1001
  Node A: 这个 key 在 slot 8923，属于 Node B
  → 返回 MOVED 8923 192.168.1.2:6379
  Client → Node B: GET user:1001
  → 返回结果
```

**Cluster vs Sentinel**：

| 维度 | Sentinel | Cluster |
|------|---------|---------|
| 数据分片 | 不分片，每个节点全量 | 分片（16384 slots） |
| 容量上限 | 单机内存 | 理论无上限 |
| 复杂度 | 简单 | 复杂（slot 迁移等） |
| 适用场景 | 数据量 < 单机内存 | 数据量大需要分片 |

---

## 第八部分：实战与优化

### Q18：Redis 的大 Key 和热 Key 问题怎么解决？

**记忆点**：大 Key 影响**内存和阻塞**，热 Key 影响**单节点负载**

```
大 Key 定义：
  String > 10KB
  Hash/Set/ZSet > 5000 个元素
  List > 10000 个元素

大 Key 问题：
  1. 内存不均（Cluster 中某节点内存远大于其他）
  2. 阻塞（DEL 大 key 可能阻塞几秒）
  3. 网络带宽（GET 大 value 影响其他请求）

解决：
  1. 拆分：大 Hash 按字段分多个小 Hash
  2. 异步删除：UNLINK 代替 DEL（后台线程删除）
  3. 压缩：value 压缩后再存储
  4. 发现：redis-cli --bigkeys 或 memory usage key

热 Key 定义：
  某个 key 的 QPS 远高于其他（如秒杀商品）

热 Key 问题：
  Cluster 中该 key 所在节点成为瓶颈

解决：
  1. 本地缓存：JVM/进程内缓存热点 key
  2. 读写分离：从节点分担读流量
  3. Key 分散：key 加后缀分散到多个节点
     key = "hotkey" → "hotkey_1", "hotkey_2", ... "hotkey_N"
     读取时随机选一个副本
```

---

### Q19：Redis 6.0 的多线程是怎么回事？还是单线程吗？

**记忆点**：**命令执行仍然单线程，IO 读写变多线程**

```
Redis 6.0 之前（纯单线程）：
  ┌────────────────────────────────┐
  │ 主线程                         │
  │ 读请求 → 解析 → 执行 → 写响应  │  ← 全部单线程
  └────────────────────────────────┘

Redis 6.0 之后（IO多线程 + 执行单线程）：
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ IO线程1  │ │ IO线程2  │ │ IO线程3  │  ← 多线程读写网络
  │ 读socket │ │ 读socket │ │ 读socket │
  └────┬─────┘ └────┬─────┘ └────┬─────┘
       │            │            │
       ↓            ↓            ↓
  ┌────────────────────────────────────┐
  │           主线程                    │  ← 单线程执行命令
  │     解析 → 执行命令 → 生成响应      │     （无需加锁！）
  └────────────────────────────────────┘
       │            │            │
       ↓            ↓            ↓
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ IO线程1  │ │ IO线程2  │ │ IO线程3  │  ← 多线程写响应
  │ 写socket │ │ 写socket │ │ 写socket │
  └──────────┘ └──────────┘ └──────────┘
```

**为什么命令执行还是单线程？**
- 避免加锁，数据结构操作天然线程安全
- Redis 的瓶颈不在 CPU（命令执行快），而在**网络 IO**
- 多线程 IO 已经能显著提升吞吐（测试显示 2 倍+）

---

### Q20：Pipeline、事务、Lua 脚本的区别？什么时候用哪个？

**记忆点**：Pipeline = **批量发送**，事务 = **批量执行**，Lua = **原子执行**

```
Pipeline（管道）：
  无 Pipeline：  CMD1 → 响应1 → CMD2 → 响应2 → CMD3 → 响应3
                 ←──RTT──→    ←──RTT──→    ←──RTT──→

  有 Pipeline：  CMD1 CMD2 CMD3 → 响应1 响应2 响应3
                 ←──────── 1个RTT ────────→
  → 减少网络往返，不保证原子性

事务（MULTI/EXEC）：
  MULTI
  SET key1 val1
  SET key2 val2
  EXEC
  → 命令排队，EXEC 时一起执行
  → 不支持回滚（某个命令失败其他仍执行）
  → 有 WATCH 做乐观锁

Lua 脚本：
  EVAL "redis.call('SET',KEYS[1],ARGV[1]) ..." 1 key val
  → 原子执行（脚本期间不会插入其他命令）
  → 可以有逻辑判断（if/else）
  → 最强大，但脚本不能太复杂（阻塞主线程）
```

| 特性 | Pipeline | 事务 | Lua |
|------|---------|------|-----|
| 减少 RTT | ✅ | ✅ | ✅ |
| 原子性 | ❌ | 部分（无回滚） | ✅ |
| 逻辑判断 | ❌ | 有限（WATCH） | ✅ |
| 阻塞风险 | 无 | 低 | 高（脚本慢就阻塞） |
| 典型场景 | 批量写入 | 简单事务 | 分布式锁/限流 |

---

## 第九部分：Redis 应用场景

### Q21：如何用 Redis 实现限流？

**记忆点**：**滑动窗口 = ZSet，令牌桶 = Lua 脚本**

```lua
-- 滑动窗口限流（ZSet 实现）
-- 限制每个用户 60 秒内最多 100 次请求

local key = KEYS[1]           -- rate_limit:user:123
local now = tonumber(ARGV[1]) -- 当前时间戳（毫秒）
local window = 60000          -- 60秒窗口
local limit = 100

-- 删除窗口外的记录
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)

-- 统计窗口内的请求数
local count = redis.call('ZCARD', key)

if count < limit then
    redis.call('ZADD', key, now, now .. math.random())
    redis.call('PEXPIRE', key, window)
    return 1  -- 允许
else
    return 0  -- 拒绝
end
```

---

### Q22：如何用 Redis 实现延迟队列？

**记忆点**：**ZSet + score 存执行时间**

```
延迟队列原理：
  ZADD delay_queue <execute_timestamp> <task_data>

  消费者循环：
  while true:
      tasks = ZRANGEBYSCORE delay_queue 0 <current_time> LIMIT 0 1
      if tasks:
          if ZREM delay_queue task:   # 原子取出（防止重复消费）
              process(task)
      else:
          sleep(100ms)

时间线：
  T=0: ZADD delay_queue 1000 "send_email"    ← 1000ms后执行
  T=0: ZADD delay_queue 5000 "check_payment" ← 5000ms后执行
  ...
  T=1000: 消费者取出 send_email 并执行
  T=5000: 消费者取出 check_payment 并执行
```

---

### Q23：Redis 实现排行榜的方案？

**记忆点**：ZSet 天然有序 → `ZADD` 写入，`ZREVRANGE` 读取

```bash
# 添加/更新分数
ZADD leaderboard 1000 "player:alice"
ZADD leaderboard 1500 "player:bob"
ZADD leaderboard 800  "player:carol"
ZINCRBY leaderboard 200 "player:alice"    # 加分

# TOP 10 排行榜
ZREVRANGE leaderboard 0 9 WITHSCORES
# 1) "player:bob"   1500
# 2) "player:alice"  1200
# 3) "player:carol"  800

# 查询某人排名
ZREVRANK leaderboard "player:alice"       # 返回 1（第2名，0-based）

# 查询某人分数
ZSCORE leaderboard "player:alice"         # 返回 1200

# 某个分数区间的玩家
ZRANGEBYSCORE leaderboard 800 1300 WITHSCORES
```

---

## 第十部分：面试综合题

### Q24：Redis 为什么这么快？

**记忆点**：**内存 + 单线程 + IO多路复用 + 高效数据结构**

```
速度因素拆解：

1. 纯内存操作              → 微秒级延迟
2. 单线程 → 无锁无上下文切换 → 极低开销
3. IO多路复用(epoll)       → 单线程处理万级连接
4. 高效数据结构：
   - SDS: O(1) 长度获取
   - ziplist: 紧凑内存，缓存友好
   - skiplist: O(logN) 有序操作
   - dict: O(1) 哈希查找
5. 通信协议简单(RESP)       → 解析开销小
6. 6.0 多线程 IO            → 网络吞吐翻倍
```

---

### Q25：设计一个简化版 Redis，你会怎么做？

**记忆点**：**事件循环 + 字典 + 过期机制 + 持久化**

```
核心组件：

┌──────────────────────────────────────────┐
│                Event Loop                 │
│  ┌────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Accept │  │ Read/    │  │ Timer    │ │
│  │ 新连接  │  │ Write IO │  │ 定时任务  │ │
│  └────────┘  └──────────┘  └──────────┘ │
│         ↓          ↓            ↓        │
│  ┌─────────────────────────────────────┐ │
│  │         Command Parser              │ │
│  └─────────────┬───────────────────────┘ │
│                ↓                         │
│  ┌─────────────────────────────────────┐ │
│  │         Data Store                  │ │
│  │  dict<string, RedisObject>          │ │
│  │  expires_dict<string, timestamp>    │ │
│  └─────────────────────────────────────┘ │
│                ↓                         │
│  ┌─────────────────────────────────────┐ │
│  │    Persistence (AOF/RDB)            │ │
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘

关键设计决策：
1. 数据存储：哈希表（dict），key→RedisObject
2. 过期管理：独立的过期字典 + 惰性删除 + 定期扫描
3. 事件循环：基于 epoll 的 reactor 模式
4. 持久化：AOF append + 后台 rewrite
5. 复制：主从 + repl_backlog 环形缓冲区
```

---

## 面试口诀速记

```
SDS 三优势：O(1)长度、二进制安全、预分配
小用 ziplist 大用 hashtable，阈值可配
ZSet 双结构：dict 查分、skiplist 排序

RDB 是快照恢复快，AOF 是日志数据全
混合持久化两全其美，4.0 引入

过期双删：惰性 + 定期
淘汰八策略，推荐 allkeys-lru

穿透查不存在 → 布隆过滤器
击穿热点过期 → 互斥锁
雪崩同时过期 → TTL加随机

一致性：先更新DB再删缓存
分布式锁：SET NX EX + UUID + Lua 释放
RedLock 多数派，争议看场景

主从全量靠 RDB，增量靠 backlog
哨兵三步：主观→客观→故障转移
Cluster 16384 槽，CRC16 路由
```

---

*这篇文章覆盖了 Redis 与缓存架构的核心面试考点。Redis 是面试高频中的高频——建议在本地搭一个 Redis，把每个命令都敲一遍，比死记硬背有效十倍。*
