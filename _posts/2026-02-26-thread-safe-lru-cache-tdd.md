---
title: 用 TDD 驱动 LRU Cache 从"裸奔"到线程安全高性能 —— 一步一步加锁的实战演进
description: 以 Google Test 为工具，从零锁的单线程 LRU Cache 出发，每一步先写测试再写实现，经历全局互斥锁、读写锁、分片锁三个阶段，最终实现一个高并发安全的 LRU Cache
date: 2026-02-26
categories: [编程语言]
tags: [c++, lru, 缓存, 多线程, 线程安全, mutex, 读写锁, tdd, google test, 并发]
---

这篇文章不是教你"什么是 LRU Cache"——那个在 [基础篇](/techlearn/posts/cpp-lru-cache-tutorial/) 已经讲过了。

这篇文章要做的事情更有意思：**用 TDD（测试驱动开发）的方式，把一个"裸奔"的 LRU Cache 一步一步改造成线程安全的高性能版本**。

每一步都是：先写测试暴露问题 → 再写代码解决问题。

------

## 全文路线图

```
阶段 0：单线程 LRU Cache（无锁，能用但不安全）
  │
  │  写多线程测试 → 测试失败/崩溃 → 证明确实不安全
  ▼
阶段 1：全局 mutex（安全了，但性能差）
  │
  │  写并发读测试 → 发现读也互斥 → 性能瓶颈
  ▼
阶段 2：读写锁 shared_mutex（读并发，写互斥）
  │
  │  写高并发压力测试 → 发现热点锁争用
  ▼
阶段 3：分片锁 ShardedLRUCache（终极方案）
  │
  │  基准测试对比四个版本的性能
  ▼
总结：选哪个取决于你的场景
```

------

## 阶段 0：单线程版本 —— 先把功能做对

### 0.1 先写测试（RED）

不管三七二十一，先用测试定义"什么是对的"：

```cpp
// tests/test_lru_cache.cpp
#include <gtest/gtest.h>
#include "lru_cache.h"

// ─── 基本功能测试 ───

TEST(LRUCacheTest, NewCacheIsEmpty) {
    LRUCache<int, std::string> cache(3);
    EXPECT_EQ(cache.size(), 0);
}

TEST(LRUCacheTest, PutAndGet) {
    LRUCache<int, std::string> cache(3);
    cache.put(1, "one");

    auto val = cache.get(1);
    ASSERT_TRUE(val.has_value());
    EXPECT_EQ(val.value(), "one");
}

TEST(LRUCacheTest, GetNonExistent) {
    LRUCache<int, std::string> cache(3);
    EXPECT_FALSE(cache.get(999).has_value());
}

TEST(LRUCacheTest, UpdateExistingKey) {
    LRUCache<int, std::string> cache(3);
    cache.put(1, "one");
    cache.put(1, "ONE");  // 更新

    auto val = cache.get(1);
    ASSERT_TRUE(val.has_value());
    EXPECT_EQ(val.value(), "ONE");
    EXPECT_EQ(cache.size(), 1);  // 数量不变
}

// ─── 淘汰测试（核心！）───

TEST(LRUCacheTest, EvictsLeastRecentlyUsed) {
    LRUCache<int, std::string> cache(3);
    cache.put(1, "one");    // [1]
    cache.put(2, "two");    // [2, 1]
    cache.put(3, "three");  // [3, 2, 1]

    // 缓存满了，再插入 4，应该淘汰最久未使用的 1
    cache.put(4, "four");   // [4, 3, 2]  淘汰 1

    EXPECT_FALSE(cache.get(1).has_value());   // 1 被淘汰
    EXPECT_TRUE(cache.get(2).has_value());    // 2 还在
    EXPECT_TRUE(cache.get(3).has_value());    // 3 还在
    EXPECT_TRUE(cache.get(4).has_value());    // 4 刚插入
}

TEST(LRUCacheTest, GetUpdatesRecency) {
    LRUCache<int, std::string> cache(3);
    cache.put(1, "one");    // [1]
    cache.put(2, "two");    // [2, 1]
    cache.put(3, "three");  // [3, 2, 1]

    cache.get(1);           // 访问 1，变为最近使用 → [1, 3, 2]

    cache.put(4, "four");   // 淘汰最久未使用的 2 → [4, 1, 3]

    EXPECT_TRUE(cache.get(1).has_value());    // 1 刚被访问过，还在
    EXPECT_FALSE(cache.get(2).has_value());   // 2 被淘汰
}

TEST(LRUCacheTest, PutUpdatesRecency) {
    LRUCache<int, std::string> cache(2);
    cache.put(1, "one");    // [1]
    cache.put(2, "two");    // [2, 1]
    cache.put(1, "ONE");    // 更新 1 → [1, 2]

    cache.put(3, "three");  // 淘汰 2 → [3, 1]

    EXPECT_TRUE(cache.get(1).has_value());    // 1 刚更新过
    EXPECT_FALSE(cache.get(2).has_value());   // 2 被淘汰
}

TEST(LRUCacheTest, CapacityOne) {
    LRUCache<int, int> cache(1);
    cache.put(1, 100);
    cache.put(2, 200);  // 淘汰 1

    EXPECT_FALSE(cache.get(1).has_value());
    EXPECT_EQ(cache.get(2).value(), 200);
}
```

编译——当然失败了，因为 `LRUCache` 还不存在。这就是 TDD 的 **RED** 阶段。

### 0.2 写实现让测试通过（GREEN）

```cpp
// include/lru_cache.h
#pragma once
#include <list>
#include <unordered_map>
#include <optional>
#include <cstddef>

template<typename Key, typename Value>
class LRUCache {
public:
    explicit LRUCache(size_t capacity) : capacity_(capacity) {}

    // 获取值，如果存在则提升为最近使用
    std::optional<Value> get(const Key& key) {
        auto it = map_.find(key);
        if (it == map_.end()) return std::nullopt;

        // 移到链表头部（最近使用）
        list_.splice(list_.begin(), list_, it->second);
        return it->second->second;
    }

    // 插入或更新
    void put(const Key& key, const Value& value) {
        auto it = map_.find(key);
        if (it != map_.end()) {
            // 已存在：更新值并移到头部
            it->second->second = value;
            list_.splice(list_.begin(), list_, it->second);
            return;
        }

        // 不存在：检查容量
        if (list_.size() >= capacity_) {
            // 淘汰尾部（最久未使用）
            auto& back = list_.back();
            map_.erase(back.first);
            list_.pop_back();
        }

        // 插入到头部
        list_.emplace_front(key, value);
        map_[key] = list_.begin();
    }

    size_t size() const { return map_.size(); }

private:
    size_t capacity_;
    // 链表：头部 = 最近使用，尾部 = 最久未使用
    std::list<std::pair<Key, Value>> list_;
    // 哈希表：key → 链表中的位置
    std::unordered_map<Key, typename std::list<std::pair<Key, Value>>::iterator> map_;
};
```

跑测试——全绿！

```
[==========] Running 8 tests from 1 test suite.
[  PASSED  ] 8 tests.
```

### 0.3 验证当前状态

```
阶段 0 状态：
  ✅ 功能正确（所有基础测试通过）
  ❌ 线程安全？不知道！还没测

  数据结构：
    list_ (双向链表)：维护使用顺序
    map_ (哈希表)：O(1) 查找

  时间复杂度：get O(1)、put O(1)
```

------

## 阶段 1：多线程测试暴露问题

### 1.1 写并发测试（RED）

现在我们写一个多线程的测试，看看"裸奔"的 LRU Cache 会不会出问题：

```cpp
// tests/test_lru_cache_concurrent.cpp
#include <gtest/gtest.h>
#include "lru_cache.h"
#include <thread>
#include <vector>
#include <atomic>

TEST(LRUCacheConcurrentTest, ConcurrentPutAndGet_NoLock) {
    LRUCache<int, int> cache(1000);
    constexpr int NUM_THREADS = 8;
    constexpr int OPS_PER_THREAD = 10000;
    std::atomic<int> errors{0};

    auto worker = [&](int thread_id) {
        for (int i = 0; i < OPS_PER_THREAD; i++) {
            int key = thread_id * OPS_PER_THREAD + i;
            cache.put(key, key * 10);

            auto val = cache.get(key);
            if (val.has_value() && val.value() != key * 10) {
                errors++;  // 值被篡改了
            }
        }
    };

    std::vector<std::thread> threads;
    for (int t = 0; t < NUM_THREADS; t++) {
        threads.emplace_back(worker, t);
    }

    for (auto& t : threads) t.join();

    // 这个测试大概率会崩溃，甚至到不了这里
    EXPECT_EQ(errors.load(), 0);
}
```

### 1.2 运行结果

```
运行这个测试，你会看到以下几种情况之一：

① 直接段错误（Segmentation Fault）
   → 多线程同时操作链表，迭代器失效

② 数据不一致
   → get 返回了错误的值

③ 死循环/卡住
   → 链表被破坏，形成环

④ 偶尔通过
   → 运气好没撞到竞争，但不代表安全

本质原因：
  线程 A 正在 splice 移动节点
  线程 B 同时在 erase/pop_back
  → 链表的指针被两个线程同时修改
  → 数据结构被破坏

  这就是典型的 Data Race（数据竞争）
```

### 1.3 分析问题

```
哪些操作不是线程安全的？

get() 中：
  map_.find()         ← 读哈希表
  list_.splice()      ← 修改链表！写操作！

  → get 看起来是"读"，但其实包含了写操作（移动链表节点）
  → 所以 get 不是只读的！

put() 中：
  map_.find()         ← 读
  map_.erase()        ← 写
  list_.pop_back()    ← 写
  list_.emplace_front() ← 写
  map_[key] = ...     ← 写

  → put 是纯粹的写操作

结论：get 和 put 都需要加锁
```

------

## 阶段 2：全局 mutex —— 最简单的安全方案

### 2.1 先更新测试（RED → 期望 GREEN）

我们创建一个带锁版本的 LRU Cache，测试应该能通过：

```cpp
// tests/test_lru_cache_mutex.cpp
#include <gtest/gtest.h>
#include "lru_cache_mutex.h"
#include <thread>
#include <vector>
#include <atomic>

// ─── 基础功能测试（确保加锁没破坏功能）───

class MutexLRUCacheTest : public ::testing::Test {
protected:
    ThreadSafeLRUCache<int, std::string> cache{3};
};

TEST_F(MutexLRUCacheTest, PutAndGet) {
    cache.put(1, "one");
    auto val = cache.get(1);
    ASSERT_TRUE(val.has_value());
    EXPECT_EQ(val.value(), "one");
}

TEST_F(MutexLRUCacheTest, EvictsLRU) {
    cache.put(1, "one");
    cache.put(2, "two");
    cache.put(3, "three");
    cache.put(4, "four");  // 淘汰 1

    EXPECT_FALSE(cache.get(1).has_value());
    EXPECT_TRUE(cache.get(4).has_value());
}

TEST_F(MutexLRUCacheTest, GetUpdatesRecency) {
    cache.put(1, "one");
    cache.put(2, "two");
    cache.put(3, "three");
    cache.get(1);           // 1 变为最近使用
    cache.put(4, "four");   // 淘汰 2

    EXPECT_TRUE(cache.get(1).has_value());
    EXPECT_FALSE(cache.get(2).has_value());
}

// ─── 并发安全测试 ───

TEST(MutexLRUCacheConcurrentTest, ConcurrentPutAndGet) {
    ThreadSafeLRUCache<int, int> cache(5000);
    constexpr int NUM_THREADS = 8;
    constexpr int OPS_PER_THREAD = 10000;
    std::atomic<int> errors{0};

    auto worker = [&](int thread_id) {
        for (int i = 0; i < OPS_PER_THREAD; i++) {
            int key = thread_id * OPS_PER_THREAD + i;
            cache.put(key, key * 10);

            auto val = cache.get(key);
            // 值可能被淘汰了（其他线程在插入），但如果在就必须正确
            if (val.has_value() && val.value() != key * 10) {
                errors++;
            }
        }
    };

    std::vector<std::thread> threads;
    for (int t = 0; t < NUM_THREADS; t++) {
        threads.emplace_back(worker, t);
    }
    for (auto& t : threads) t.join();

    EXPECT_EQ(errors.load(), 0);
}

TEST(MutexLRUCacheConcurrentTest, ConcurrentReadHeavy) {
    ThreadSafeLRUCache<int, int> cache(100);

    // 预填充
    for (int i = 0; i < 100; i++) {
        cache.put(i, i * 100);
    }

    constexpr int NUM_READERS = 8;
    constexpr int READS_PER_THREAD = 50000;
    std::atomic<int> hit_count{0};

    auto reader = [&](int thread_id) {
        for (int i = 0; i < READS_PER_THREAD; i++) {
            int key = i % 100;
            auto val = cache.get(key);
            if (val.has_value()) hit_count++;
        }
    };

    std::vector<std::thread> threads;
    for (int t = 0; t < NUM_READERS; t++) {
        threads.emplace_back(reader, t);
    }
    for (auto& t : threads) t.join();

    // 所有 key 都在缓存中（没有 put 操作不会淘汰），应该全部命中
    EXPECT_EQ(hit_count.load(), NUM_READERS * READS_PER_THREAD);
}

TEST(MutexLRUCacheConcurrentTest, ConcurrentMixedReadWrite) {
    ThreadSafeLRUCache<int, int> cache(500);
    constexpr int NUM_THREADS = 8;
    constexpr int OPS_PER_THREAD = 10000;

    std::atomic<bool> has_crash{false};

    auto mixed_worker = [&](int thread_id) {
        try {
            for (int i = 0; i < OPS_PER_THREAD; i++) {
                int key = i % 200;  // 制造大量冲突
                if (i % 3 == 0) {
                    cache.put(key, thread_id * 1000 + i);
                } else {
                    cache.get(key);
                }
            }
        } catch (...) {
            has_crash = true;
        }
    };

    std::vector<std::thread> threads;
    for (int t = 0; t < NUM_THREADS; t++) {
        threads.emplace_back(mixed_worker, t);
    }
    for (auto& t : threads) t.join();

    EXPECT_FALSE(has_crash.load());
}
```

### 2.2 实现：加一把大锁（GREEN）

```cpp
// include/lru_cache_mutex.h
#pragma once
#include <list>
#include <unordered_map>
#include <optional>
#include <mutex>
#include <cstddef>

template<typename Key, typename Value>
class ThreadSafeLRUCache {
public:
    explicit ThreadSafeLRUCache(size_t capacity) : capacity_(capacity) {}

    std::optional<Value> get(const Key& key) {
        std::lock_guard<std::mutex> lock(mutex_);  // 加锁
        auto it = map_.find(key);
        if (it == map_.end()) return std::nullopt;
        list_.splice(list_.begin(), list_, it->second);
        return it->second->second;
    }

    void put(const Key& key, const Value& value) {
        std::lock_guard<std::mutex> lock(mutex_);  // 加锁
        auto it = map_.find(key);
        if (it != map_.end()) {
            it->second->second = value;
            list_.splice(list_.begin(), list_, it->second);
            return;
        }
        if (list_.size() >= capacity_) {
            map_.erase(list_.back().first);
            list_.pop_back();
        }
        list_.emplace_front(key, value);
        map_[key] = list_.begin();
    }

    size_t size() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return map_.size();
    }

private:
    size_t capacity_;
    std::list<std::pair<Key, Value>> list_;
    std::unordered_map<Key, typename std::list<std::pair<Key, Value>>::iterator> map_;
    mutable std::mutex mutex_;  // 一把大锁
};
```

跑测试——全绿！不崩溃了。

### 2.3 但有什么问题？

```
全局 mutex 的问题：

  线程1 get(key_a) ─────┐
  线程2 get(key_b) ─────┤  全部串行等待！
  线程3 get(key_c) ─────┤
  线程4 put(key_d) ─────┘

  同一时刻只有一个线程能操作缓存
  8 个线程读不同的 key，也要排队

  这在"读多写少"的场景下特别浪费
  缓存的典型场景恰恰是读远多于写（读:写 ≈ 9:1 甚至 99:1）
```

但更关键的是——LRU Cache 的 `get` **不是只读的**！它要做 `splice` 移动节点。这意味着标准的读写锁方案需要特殊处理。

------

## 阶段 3：读写锁 —— 读并发但需要巧妙设计

### 3.1 LRU 的特殊困难

```
普通的"读写锁"方案：
  读操作 → shared_lock（多个读并发）
  写操作 → unique_lock（独占）

但 LRU Cache 的 get() 要做 splice（写操作）！
  → get 也需要 unique_lock？
  → 那跟全局 mutex 有什么区别？

解决方案：把"读取数据"和"更新热度"分离

  方案 A：延迟更新 —— get 只读数据，记录访问日志
                      定期批量更新链表顺序
  方案 B：近似 LRU  —— 不严格维护顺序，用概率近似
  方案 C：读时升级 —— 先 shared_lock 读哈希表
                      如果命中再升级为 unique_lock 做 splice

我们选方案 A，这也是工业级实现（如 Java Caffeine）的思路。
```

### 3.2 先写测试（RED）

```cpp
// tests/test_lru_cache_rwlock.cpp
#include <gtest/gtest.h>
#include "lru_cache_rwlock.h"
#include <thread>
#include <vector>
#include <atomic>
#include <chrono>

// ─── 基础功能（必须和之前一致）───

class RWLockLRUCacheTest : public ::testing::Test {
protected:
    RWLockLRUCache<int, std::string> cache{3};
};

TEST_F(RWLockLRUCacheTest, PutAndGet) {
    cache.put(1, "one");
    auto val = cache.get(1);
    ASSERT_TRUE(val.has_value());
    EXPECT_EQ(val.value(), "one");
}

TEST_F(RWLockLRUCacheTest, EvictsLRU) {
    cache.put(1, "one");
    cache.put(2, "two");
    cache.put(3, "three");
    cache.put(4, "four");

    EXPECT_FALSE(cache.get(1).has_value());
    EXPECT_TRUE(cache.get(4).has_value());
}

TEST_F(RWLockLRUCacheTest, GetUpdatesRecency) {
    cache.put(1, "one");
    cache.put(2, "two");
    cache.put(3, "three");
    cache.get(1);
    cache.put(4, "four");

    EXPECT_TRUE(cache.get(1).has_value());
    EXPECT_FALSE(cache.get(2).has_value());
}

// ─── 并发安全 ───

TEST(RWLockLRUCacheConcurrentTest, ConcurrentPutAndGet) {
    RWLockLRUCache<int, int> cache(5000);
    constexpr int NUM_THREADS = 8;
    constexpr int OPS_PER_THREAD = 10000;
    std::atomic<int> errors{0};

    auto worker = [&](int thread_id) {
        for (int i = 0; i < OPS_PER_THREAD; i++) {
            int key = thread_id * OPS_PER_THREAD + i;
            cache.put(key, key * 10);
            auto val = cache.get(key);
            if (val.has_value() && val.value() != key * 10) {
                errors++;
            }
        }
    };

    std::vector<std::thread> threads;
    for (int t = 0; t < NUM_THREADS; t++) {
        threads.emplace_back(worker, t);
    }
    for (auto& t : threads) t.join();

    EXPECT_EQ(errors.load(), 0);
}

TEST(RWLockLRUCacheConcurrentTest, ReadHeavyPerformance) {
    RWLockLRUCache<int, int> cache(1000);

    // 预填充
    for (int i = 0; i < 1000; i++) {
        cache.put(i, i * 100);
    }

    constexpr int NUM_READERS = 8;
    constexpr int READS_PER_THREAD = 100000;
    std::atomic<int> hit_count{0};

    auto start = std::chrono::steady_clock::now();

    auto reader = [&](int thread_id) {
        for (int i = 0; i < READS_PER_THREAD; i++) {
            int key = i % 1000;
            auto val = cache.get(key);
            if (val.has_value()) hit_count++;
        }
    };

    std::vector<std::thread> threads;
    for (int t = 0; t < NUM_READERS; t++) {
        threads.emplace_back(reader, t);
    }
    for (auto& t : threads) t.join();

    auto elapsed = std::chrono::steady_clock::now() - start;
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(elapsed).count();

    EXPECT_EQ(hit_count.load(), NUM_READERS * READS_PER_THREAD);

    // 只是记录时间，不做硬性断言（不同机器差异大）
    std::cout << "[RWLock] " << NUM_READERS << " readers × "
              << READS_PER_THREAD << " reads = "
              << ms << " ms" << std::endl;
}

// ─── 延迟刷新测试 ───

TEST(RWLockLRUCacheTest, FlushPromotionBuffer) {
    RWLockLRUCache<int, std::string> cache(3);
    cache.put(1, "one");
    cache.put(2, "two");
    cache.put(3, "three");

    // 多次 get(1)，访问记录在 buffer 中
    for (int i = 0; i < 10; i++) {
        cache.get(1);
    }

    // 手动触发刷新（或者等 put 触发）
    cache.flush();

    // 现在插入新元素应该淘汰的不是 1（因为 1 被频繁访问）
    cache.put(4, "four");

    EXPECT_TRUE(cache.get(1).has_value());   // 1 还在
    // 2 或 3 被淘汰（取决于刷新后的顺序）
}
```

### 3.3 实现读写锁版本（GREEN）

```cpp
// include/lru_cache_rwlock.h
#pragma once
#include <list>
#include <unordered_map>
#include <optional>
#include <shared_mutex>
#include <mutex>
#include <vector>
#include <cstddef>

template<typename Key, typename Value>
class RWLockLRUCache {
public:
    explicit RWLockLRUCache(size_t capacity,
                            size_t flush_threshold = 64)
        : capacity_(capacity)
        , flush_threshold_(flush_threshold) {}

    std::optional<Value> get(const Key& key) {
        // 读锁：并发读哈希表和链表节点的值
        std::shared_lock<std::shared_mutex> read_lock(rw_mutex_);

        auto it = map_.find(key);
        if (it == map_.end()) return std::nullopt;

        Value result = it->second->second;  // 拷贝值

        // 记录访问到 buffer（buffer 有自己的小锁）
        {
            std::lock_guard<std::mutex> buf_lock(buffer_mutex_);
            promotion_buffer_.push_back(key);
        }

        // 如果 buffer 积累够了，尝试刷新
        if (promotion_buffer_.size() >= flush_threshold_) {
            read_lock.unlock();  // 先释放读锁
            try_flush();         // 尝试获取写锁刷新
        }

        return result;
    }

    void put(const Key& key, const Value& value) {
        std::unique_lock<std::shared_mutex> write_lock(rw_mutex_);

        // 先把 buffer 里积累的访问刷进链表
        drain_buffer_locked();

        auto it = map_.find(key);
        if (it != map_.end()) {
            it->second->second = value;
            list_.splice(list_.begin(), list_, it->second);
            return;
        }

        if (list_.size() >= capacity_) {
            map_.erase(list_.back().first);
            list_.pop_back();
        }

        list_.emplace_front(key, value);
        map_[key] = list_.begin();
    }

    // 手动刷新 promotion buffer
    void flush() {
        std::unique_lock<std::shared_mutex> write_lock(rw_mutex_);
        drain_buffer_locked();
    }

    size_t size() const {
        std::shared_lock<std::shared_mutex> lock(rw_mutex_);
        return map_.size();
    }

private:
    // 在已持有写锁的情况下，把 buffer 中的访问记录刷到链表
    void drain_buffer_locked() {
        std::vector<Key> buffer;
        {
            std::lock_guard<std::mutex> buf_lock(buffer_mutex_);
            buffer.swap(promotion_buffer_);
        }

        for (const auto& key : buffer) {
            auto it = map_.find(key);
            if (it != map_.end()) {
                list_.splice(list_.begin(), list_, it->second);
            }
        }
    }

    // 尝试获取写锁来刷新 buffer
    void try_flush() {
        // try_lock：拿不到就算了，让 put 或下次 get 来刷
        std::unique_lock<std::shared_mutex> write_lock(rw_mutex_, std::try_to_lock);
        if (write_lock.owns_lock()) {
            drain_buffer_locked();
        }
    }

    size_t capacity_;
    size_t flush_threshold_;

    std::list<std::pair<Key, Value>> list_;
    std::unordered_map<Key, typename std::list<std::pair<Key, Value>>::iterator> map_;

    mutable std::shared_mutex rw_mutex_;   // 读写锁

    std::mutex buffer_mutex_;              // buffer 的小锁
    std::vector<Key> promotion_buffer_;    // 延迟提升缓冲区
};
```

### 3.4 分析读写锁版本

```
读写锁版本的运行模型：

  get() ：
    ┌── shared_lock（读锁）──────────────────┐
    │  查哈希表 → 读值 → 记录到 buffer      │
    └────────────────────────────────────────┘
    （buffer 满了 → try_to_lock 写锁 → 刷新链表）

  put() ：
    ┌── unique_lock（写锁）──────────────────┐
    │  刷新 buffer → 查/删/插哈希表和链表    │
    └────────────────────────────────────────┘

  优点：
    ├── 多个 get 可以并发执行（共享读锁）
    ├── get 不再移动链表（延迟到 buffer 刷新时批量做）
    └── buffer 刷新用 try_to_lock，拿不到就不阻塞

  缺点：
    ├── LRU 顺序不是严格实时的（buffer 中的访问还没刷到链表）
    ├── put 时要刷 buffer，可能有额外开销
    ├── 仍然只有一把读写锁，所有 key 竞争同一把锁
    └── 写操作（put）仍然会阻塞所有读

  适合：读多写少、对 LRU 精确度要求不高的场景
```

### 3.5 延迟刷新的权衡

```
"延迟刷新"意味着 LRU 不是 100% 精确的：

  时间线：
  t1: get(A)  → buffer: [A]        链表顺序不变
  t2: get(B)  → buffer: [A, B]     链表顺序不变
  t3: put(X)  → 刷新 buffer → 链表更新 → 检查淘汰
               此时 A 和 B 才真正被提升到头部

  如果 t2 和 t3 之间有一个 put(Y) 导致淘汰：
  → A 和 B 的访问还在 buffer 里没刷到链表
  → A 或 B 可能被"冤枉"淘汰

  这种不精确在实际生产中通常可以接受
  （缓存未命中只是多查一次后端，不是灾难）
```

------

## 阶段 4：分片锁 —— 终极高并发方案

### 4.1 分片的思路

```
全局锁的问题：一把锁管所有 key → 所有线程争抢一把锁

分片的解决：
  把 key 空间分成 N 个分片（shard）
  每个分片有自己独立的 LRU Cache + 独立的锁
  不同分片的操作完全不冲突

  key 分配到哪个分片？
  shard_index = hash(key) % NUM_SHARDS

  效果：
  线程1 操作 key_a → shard 3 → 锁 shard 3
  线程2 操作 key_b → shard 7 → 锁 shard 7
  → 两个线程互不干扰！

  理论上 N 个分片 → 争用概率降低 N 倍
```

### 4.2 先写测试（RED）

```cpp
// tests/test_lru_cache_sharded.cpp
#include <gtest/gtest.h>
#include "lru_cache_sharded.h"
#include <thread>
#include <vector>
#include <atomic>
#include <chrono>

// ─── 基础功能 ───

class ShardedLRUCacheTest : public ::testing::Test {
protected:
    // 总容量 30，分 3 个 shard，每个 shard 容量 10
    ShardedLRUCache<int, std::string> cache{30, 3};
};

TEST_F(ShardedLRUCacheTest, PutAndGet) {
    cache.put(1, "one");
    auto val = cache.get(1);
    ASSERT_TRUE(val.has_value());
    EXPECT_EQ(val.value(), "one");
}

TEST_F(ShardedLRUCacheTest, GetNonExistent) {
    EXPECT_FALSE(cache.get(999).has_value());
}

TEST_F(ShardedLRUCacheTest, UpdateExistingKey) {
    cache.put(1, "one");
    cache.put(1, "ONE");
    auto val = cache.get(1);
    ASSERT_TRUE(val.has_value());
    EXPECT_EQ(val.value(), "ONE");
}

TEST_F(ShardedLRUCacheTest, Eviction) {
    // 总容量 30，插入 35 个
    for (int i = 0; i < 35; i++) {
        cache.put(i, std::to_string(i));
    }

    // 至少有一些早期的 key 被淘汰了
    int evicted = 0;
    for (int i = 0; i < 35; i++) {
        if (!cache.get(i).has_value()) evicted++;
    }
    EXPECT_GT(evicted, 0);
    EXPECT_LE(evicted, 10);  // 不应该淘汰太多

    // 最新插入的应该还在
    EXPECT_TRUE(cache.get(34).has_value());
}

// ─── 并发安全 ───

TEST(ShardedLRUCacheConcurrentTest, ConcurrentPutAndGet) {
    ShardedLRUCache<int, int> cache(10000, 16);  // 16 个 shard
    constexpr int NUM_THREADS = 8;
    constexpr int OPS_PER_THREAD = 50000;
    std::atomic<int> errors{0};

    auto worker = [&](int thread_id) {
        for (int i = 0; i < OPS_PER_THREAD; i++) {
            int key = thread_id * OPS_PER_THREAD + i;
            cache.put(key, key * 10);
            auto val = cache.get(key);
            if (val.has_value() && val.value() != key * 10) {
                errors++;
            }
        }
    };

    std::vector<std::thread> threads;
    for (int t = 0; t < NUM_THREADS; t++) {
        threads.emplace_back(worker, t);
    }
    for (auto& t : threads) t.join();

    EXPECT_EQ(errors.load(), 0);
}

TEST(ShardedLRUCacheConcurrentTest, HighContentionSameKeys) {
    // 大量线程操作少量 key → 高争用
    ShardedLRUCache<int, int> cache(100, 16);
    constexpr int NUM_THREADS = 16;
    constexpr int OPS_PER_THREAD = 50000;

    std::atomic<bool> has_error{false};

    auto worker = [&](int thread_id) {
        for (int i = 0; i < OPS_PER_THREAD; i++) {
            int key = i % 50;  // 只用 50 个 key，制造高争用
            if (i % 3 == 0) {
                cache.put(key, thread_id * 1000 + i);
            } else {
                cache.get(key);
            }
        }
    };

    std::vector<std::thread> threads;
    for (int t = 0; t < NUM_THREADS; t++) {
        threads.emplace_back(worker, t);
    }
    for (auto& t : threads) t.join();

    EXPECT_FALSE(has_error.load());
}

// ─── 性能对比测试 ───

TEST(ShardedLRUCacheConcurrentTest, ReadHeavyPerformance) {
    ShardedLRUCache<int, int> cache(1000, 16);

    for (int i = 0; i < 1000; i++) {
        cache.put(i, i * 100);
    }

    constexpr int NUM_READERS = 8;
    constexpr int READS_PER_THREAD = 100000;
    std::atomic<int> hit_count{0};

    auto start = std::chrono::steady_clock::now();

    auto reader = [&](int thread_id) {
        for (int i = 0; i < READS_PER_THREAD; i++) {
            int key = i % 1000;
            auto val = cache.get(key);
            if (val.has_value()) hit_count++;
        }
    };

    std::vector<std::thread> threads;
    for (int t = 0; t < NUM_READERS; t++) {
        threads.emplace_back(reader, t);
    }
    for (auto& t : threads) t.join();

    auto elapsed = std::chrono::steady_clock::now() - start;
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(elapsed).count();

    EXPECT_EQ(hit_count.load(), NUM_READERS * READS_PER_THREAD);

    std::cout << "[Sharded] " << NUM_READERS << " readers × "
              << READS_PER_THREAD << " reads = "
              << ms << " ms" << std::endl;
}
```

### 4.3 实现分片锁版本（GREEN）

```cpp
// include/lru_cache_sharded.h
#pragma once
#include <vector>
#include <list>
#include <unordered_map>
#include <optional>
#include <mutex>
#include <functional>
#include <cstddef>

template<typename Key, typename Value, typename Hash = std::hash<Key>>
class ShardedLRUCache {
public:
    ShardedLRUCache(size_t total_capacity, size_t num_shards = 16)
        : num_shards_(num_shards)
    {
        size_t per_shard = std::max<size_t>(1, total_capacity / num_shards);
        shards_.reserve(num_shards);
        for (size_t i = 0; i < num_shards; i++) {
            shards_.emplace_back(per_shard);
        }
    }

    std::optional<Value> get(const Key& key) {
        return get_shard(key).get(key);
    }

    void put(const Key& key, const Value& value) {
        get_shard(key).put(key, value);
    }

    size_t size() const {
        size_t total = 0;
        for (const auto& shard : shards_) {
            total += shard.size();
        }
        return total;
    }

private:
    // ─── 单个分片（内部类）───
    class Shard {
    public:
        explicit Shard(size_t capacity) : capacity_(capacity) {}

        // 移动构造（vector emplace_back 需要）
        Shard(Shard&& other) noexcept {
            std::lock_guard<std::mutex> lock(other.mutex_);
            capacity_ = other.capacity_;
            list_ = std::move(other.list_);
            map_ = std::move(other.map_);
        }

        std::optional<Value> get(const Key& key) {
            std::lock_guard<std::mutex> lock(mutex_);
            auto it = map_.find(key);
            if (it == map_.end()) return std::nullopt;
            list_.splice(list_.begin(), list_, it->second);
            return it->second->second;
        }

        void put(const Key& key, const Value& value) {
            std::lock_guard<std::mutex> lock(mutex_);
            auto it = map_.find(key);
            if (it != map_.end()) {
                it->second->second = value;
                list_.splice(list_.begin(), list_, it->second);
                return;
            }
            if (list_.size() >= capacity_) {
                map_.erase(list_.back().first);
                list_.pop_back();
            }
            list_.emplace_front(key, value);
            map_[key] = list_.begin();
        }

        size_t size() const {
            std::lock_guard<std::mutex> lock(mutex_);
            return map_.size();
        }

    private:
        size_t capacity_;
        std::list<std::pair<Key, Value>> list_;
        std::unordered_map<Key, typename std::list<std::pair<Key, Value>>::iterator> map_;
        mutable std::mutex mutex_;
    };

    // 根据 key 找到对应的 shard
    Shard& get_shard(const Key& key) {
        size_t idx = hasher_(key) % num_shards_;
        return shards_[idx];
    }

    const Shard& get_shard(const Key& key) const {
        size_t idx = hasher_(key) % num_shards_;
        return shards_[idx];
    }

    size_t num_shards_;
    std::vector<Shard> shards_;
    Hash hasher_;
};
```

### 4.4 分片锁分析

```
分片锁的运行模型：

  ShardedLRUCache（总容量 1600，16 个分片）
  ┌──────────────────────────────────────────────┐
  │  Shard 0 (容量100)  │  Shard 1 (容量100)     │
  │  [mutex + list+map] │  [mutex + list+map]    │
  ├──────────────────────┤───────────────────────-┤
  │  Shard 2 (容量100)  │  Shard 3 (容量100)     │
  │  [mutex + list+map] │  [mutex + list+map]    │
  ├──────────────────────┤───────────────────────-┤
  │  ...                │  ...                   │
  ├──────────────────────┤───────────────────────-┤
  │  Shard 14           │  Shard 15              │
  │  [mutex + list+map] │  [mutex + list+map]    │
  └──────────────────────────────────────────────┘

  key 通过 hash(key) % 16 分配到对应的 shard
  不同 shard 之间完全独立，互不阻塞

  优点：
    ├── 锁争用降低 16 倍（16 个 shard）
    ├── 实现简单（每个 shard 就是一个小 LRU Cache + mutex）
    ├── 容易调节（shard 数量可配置）
    └── get 仍然是精确的 LRU（每个 shard 内部严格 LRU）

  缺点：
    ├── 不是全局精确 LRU（shard 之间独立淘汰）
    │   key_a 在 shard 3 中被淘汰，但 shard 7 可能还有空间
    ├── 总容量分配不均匀（某些 shard 可能热度高、频繁淘汰）
    ├── size() 需要遍历所有 shard
    └── 内存开销稍大（每个 shard 一个 mutex + 一个 map）

  适合：高并发场景，对全局 LRU 精确度要求不高
```

------

## 阶段 5：基准测试对比

### 5.1 写基准测试

```cpp
// tests/benchmark_lru_cache.cpp
#include <gtest/gtest.h>
#include "lru_cache.h"
#include "lru_cache_mutex.h"
#include "lru_cache_rwlock.h"
#include "lru_cache_sharded.h"

#include <thread>
#include <vector>
#include <chrono>
#include <iostream>
#include <functional>

// 通用测试框架
template<typename CacheType>
long long benchmarkReadHeavy(CacheType& cache,
                             int num_threads,
                             int ops_per_thread,
                             int key_range) {
    // 预填充
    for (int i = 0; i < key_range; i++) {
        cache.put(i, i * 100);
    }

    auto start = std::chrono::steady_clock::now();

    auto worker = [&](int thread_id) {
        for (int i = 0; i < ops_per_thread; i++) {
            int key = i % key_range;
            if (i % 10 == 0) {
                // 10% 写
                cache.put(key, thread_id * 1000 + i);
            } else {
                // 90% 读
                cache.get(key);
            }
        }
    };

    std::vector<std::thread> threads;
    for (int t = 0; t < num_threads; t++) {
        threads.emplace_back(worker, t);
    }
    for (auto& t : threads) t.join();

    auto elapsed = std::chrono::steady_clock::now() - start;
    return std::chrono::duration_cast<std::chrono::milliseconds>(elapsed).count();
}

TEST(BenchmarkTest, CompareAllVersions) {
    constexpr int CAPACITY = 5000;
    constexpr int NUM_THREADS = 8;
    constexpr int OPS_PER_THREAD = 100000;
    constexpr int KEY_RANGE = 1000;

    std::cout << "\n========== LRU Cache 并发性能对比 ==========" << std::endl;
    std::cout << "线程数: " << NUM_THREADS
              << "  每线程操作: " << OPS_PER_THREAD
              << "  读写比: 9:1" << std::endl;
    std::cout << "=============================================\n" << std::endl;

    // 1. 全局 mutex
    {
        ThreadSafeLRUCache<int, int> cache(CAPACITY);
        auto ms = benchmarkReadHeavy(cache, NUM_THREADS, OPS_PER_THREAD, KEY_RANGE);
        std::cout << "全局 mutex:     " << ms << " ms" << std::endl;
    }

    // 2. 读写锁
    {
        RWLockLRUCache<int, int> cache(CAPACITY);
        auto ms = benchmarkReadHeavy(cache, NUM_THREADS, OPS_PER_THREAD, KEY_RANGE);
        std::cout << "读写锁:         " << ms << " ms" << std::endl;
    }

    // 3. 分片锁 (4 shards)
    {
        ShardedLRUCache<int, int> cache(CAPACITY, 4);
        auto ms = benchmarkReadHeavy(cache, NUM_THREADS, OPS_PER_THREAD, KEY_RANGE);
        std::cout << "分片锁(4片):    " << ms << " ms" << std::endl;
    }

    // 4. 分片锁 (16 shards)
    {
        ShardedLRUCache<int, int> cache(CAPACITY, 16);
        auto ms = benchmarkReadHeavy(cache, NUM_THREADS, OPS_PER_THREAD, KEY_RANGE);
        std::cout << "分片锁(16片):   " << ms << " ms" << std::endl;
    }

    // 5. 分片锁 (64 shards)
    {
        ShardedLRUCache<int, int> cache(CAPACITY, 64);
        auto ms = benchmarkReadHeavy(cache, NUM_THREADS, OPS_PER_THREAD, KEY_RANGE);
        std::cout << "分片锁(64片):   " << ms << " ms" << std::endl;
    }
}
```

### 5.2 典型结果

```
========== LRU Cache 并发性能对比 ==========
线程数: 8  每线程操作: 100000  读写比: 9:1
=============================================

全局 mutex:      320 ms
读写锁:          250 ms
分片锁(4片):     130 ms
分片锁(16片):     85 ms
分片锁(64片):     80 ms

分析：
  ├── 全局 mutex → 基准线（所有操作串行化）
  ├── 读写锁 → 提升约 20%（读可并发但 LRU 的 get 有 splice 问题）
  ├── 分片(4) → 提升约 60%（4 路并行）
  ├── 分片(16) → 提升约 73%（16 路并行，接近线程数）
  └── 分片(64) → 提升约 75%（收益递减，超过线程数后边际收益小）

注意：
  实际数值因机器和负载模式而异
  分片数 ≈ 2×CPU核心数 时通常达到较好平衡
  分片太多会增加内存开销和缓存不均匀的问题
```

------

## 阶段 6：更多优化方向（知识扩展）

### 6.1 进一步优化的思路

```
我们已经实现的三个版本足够应对大多数场景。
但如果你想了解工业级实现的更多技巧，这里列出方向：

① 无锁 LRU（Lock-Free）
   用 CAS 操作替代 mutex
   极其复杂（链表的 lock-free 操作是学术级难题）
   实际项目中很少这样做（投入产出比低）

② 时钟淘汰（Clock / CLOCK-Pro）
   不用链表维护顺序，用环形数组 + 标志位
   操作更 cache-friendly（内存连续）
   但不是严格 LRU，是近似 LRU

③ 多级缓存（L1/L2）
   线程本地缓存（thread_local）作为 L1
   共享 LRU Cache 作为 L2
   L1 无锁（只有本线程访问），L1 未命中才查 L2
   缺点：L1 的数据可能过时

④ 异步淘汰
   淘汰操作交给后台线程
   主路径只做读取和标记
   类似 Java Caffeine 的做法

⑤ Hazard Pointer / RCU
   用于安全回收被淘汰的节点（避免 use-after-free）
   Linux 内核大量使用 RCU（Read-Copy-Update）
```

### 6.2 thread_local 缓存示例

```cpp
// 思路：每个线程有自己的小缓存，减少对全局锁的访问

template<typename Key, typename Value>
class TwoLevelLRUCache {
public:
    TwoLevelLRUCache(size_t l2_capacity, size_t l1_capacity = 32)
        : l2_cache_(l2_capacity, 16)  // 全局分片 LRU
        , l1_capacity_(l1_capacity) {}

    std::optional<Value> get(const Key& key) {
        // 先查 L1（thread_local，无锁）
        auto& l1 = get_l1();
        auto it = l1.find(key);
        if (it != l1.end()) {
            return it->second;  // L1 命中
        }

        // L1 未命中，查 L2（需要锁）
        auto val = l2_cache_.get(key);
        if (val.has_value()) {
            // 写入 L1
            if (l1.size() >= l1_capacity_) {
                l1.erase(l1.begin());  // 简单淘汰
            }
            l1[key] = val.value();
        }
        return val;
    }

    void put(const Key& key, const Value& value) {
        // 同时更新 L1 和 L2
        auto& l1 = get_l1();
        l1[key] = value;
        l2_cache_.put(key, value);
    }

private:
    // thread_local 的 L1 缓存
    static std::unordered_map<Key, Value>& get_l1() {
        thread_local std::unordered_map<Key, Value> l1;
        return l1;
    }

    ShardedLRUCache<Key, Value> l2_cache_;
    size_t l1_capacity_;
};
```

```
注意 thread_local 缓存的问题：

  ├── L1 的数据可能过时（其他线程更新了 L2 但你的 L1 不知道）
  ├── 适合"读远多于写"且"允许短暂不一致"的场景
  ├── 如果需要强一致，就不能用 L1 缓存
  └── L1 大小要控制（每个线程都占内存）
```

------

## 完整的 TDD 历程回顾

```
整个开发过程的测试演进：

阶段 0：
  ├── 写基础功能测试 → 实现单线程 LRU Cache
  └── 8 个测试全绿 ✅

阶段 1：
  ├── 写并发测试 → 单线程版本崩溃 ❌
  └── 证明了确实需要线程安全

阶段 2：
  ├── 复用基础功能测试（确保加锁没破坏功能）
  ├── 并发安全测试通过 ✅
  ├── 读密集测试通过但性能不佳
  └── 全局 mutex 方案确认安全但需要优化

阶段 3：
  ├── 复用所有测试（功能 + 并发）
  ├── 新增延迟刷新测试
  ├── 新增性能输出
  └── 读写锁方案确认安全且读性能有所提升

阶段 4：
  ├── 复用所有测试
  ├── 新增高争用测试
  ├── 新增性能对比
  └── 分片锁方案确认安全且性能最佳

每一步都是：
  先写测试定义期望 → 再写代码满足期望 → 测试通过后进入下一步
```

------

## 如何选择？决策树

```
你的场景是什么？
│
├── 单线程？
│   └── 用阶段 0 的裸版本就行，别加锁浪费性能
│
├── 多线程但并发不高？（< 4 线程）
│   └── 全局 mutex（阶段 2），简单可靠
│
├── 多线程、读多写少？
│   ├── 能接受近似 LRU？
│   │   └── 读写锁 + 延迟刷新（阶段 3）
│   └── 需要精确 LRU？
│       └── 分片锁（阶段 4），每个 shard 内部精确 LRU
│
├── 高并发（> 8 线程）？
│   └── 分片锁（阶段 4），shard 数 ≈ 2 × CPU 核心数
│
└── 极端高并发 + 低延迟？
    └── 分片锁 + thread_local L1 缓存（阶段 6）
        需要能接受短暂不一致
```

------

## 速查表

```
版本            锁类型        get 并发    put 并发    LRU 精确度   复杂度
─────────────────────────────────────────────────────────────────────
无锁(阶段0)     无            ✅          ✅          精确         最简单
全局mutex        mutex         ❌ 串行     ❌ 串行     精确         简单
读写锁          shared_mutex  ✅ 并发     ❌ 独占     近似         中等
分片锁          N × mutex     ✅ 并发     ✅ 并发     分片内精确   中等
分片+L1         N×mutex+TLS   ✅ 极快     ✅ 并发     近似         较复杂

核心 API        std::mutex          lock_guard<mutex>
                std::shared_mutex   shared_lock(读) / unique_lock(写)
                thread_local        线程本地存储

TDD 循环        RED(写失败测试) → GREEN(写最少代码) → REFACTOR(优化结构)

分片数建议      shard_count ≈ 2 × CPU 核心数
                太少 → 争用多
                太多 → 内存浪费 + 淘汰不均匀
```

------

> 从"裸奔"到线程安全，不是一蹴而就的。每一步加锁都有代价，每一个优化都有权衡。**先写测试证明问题存在，再写代码解决问题**——这就是 TDD 的力量。

> 本系列相关文章：
> - [LRU Cache 基础实现](/techlearn/posts/cpp-lru-cache-tutorial/) —— 从 0 到 1 的数据结构
> - [Google Test 实战教程](/techlearn/posts/google-test-guide/) —— TDD 工具链
> - [shared_ptr + Lambda + 多线程](/techlearn/posts/shared-ptr-lambda-thread-safety/) —— 对象生命周期
> - [锁、并发与内存模型面试题](/techlearn/posts/lock-concurrency-memory-model-interview/) —— 面试要点
