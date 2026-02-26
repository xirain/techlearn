---
title: 从 0 到 1 实现一个 C++ LRUCache（深入浅出教学版）
description: 用最实用的思路讲清楚 LRU 的设计原理、数据结构选型与完整 C++ 实现，并总结面试高频追问
date: 2026-02-26
categories: [编程语言]
tags: [c++, 数据结构, 算法, lru, 缓存, 面试]
---

在后端开发、数据库、浏览器、CDN 甚至操作系统里，缓存都无处不在。  
而在各种缓存淘汰策略中，**LRU（Least Recently Used，最近最少使用）**是最经典、最常考的一种。

很多同学知道“LRU = 哈希表 + 双向链表”，但一到手写就会卡在细节：

- 为什么这两个结构要一起用？
- `get` 和 `put` 如何都做到 `O(1)`？
- C++ 里怎么安全地保存迭代器？
- 更新已有 key 时要不要先删后插？

这篇文章我们就按“能讲给别人听、也能自己写出来”的标准，把一个可用的 C++ `LRUCache` 彻底吃透。

---

## 一、先说需求：我们到底要实现什么？

通常题目会给出两个操作：

```text
LRUCache(capacity)  // 初始化容量
get(key)            // key 存在返回 value，否则返回 -1
put(key, value)     // 写入/更新 key
```

并且要求：

1. `get` 时间复杂度 `O(1)`
2. `put` 时间复杂度 `O(1)`
3. 当容量满时，淘汰“最久没被访问”的 key

注意这里的“访问”包括：

- `get(key)` 命中
- `put(key, value)` 更新已有 key

它们都会让这个 key 变成“最近使用过”。

---

## 二、为什么“哈希表 + 双向链表”是最优解

### 2.1 如果只有哈希表

哈希表能 `O(1)` 找到 key，但它不知道“谁最久没用过”。  
你没法快速找到要淘汰的对象。

### 2.2 如果只有链表

链表能维护“使用顺序”，头是最新，尾是最旧。  
但你查找某个 key 需要遍历，变成 `O(n)`。

### 2.3 组合起来

- **哈希表 `unordered_map`**：`key -> 链表节点位置`，负责 `O(1)` 查找
- **双向链表 `list`**：维护访问顺序，负责 `O(1)` 插入、删除、移动节点

核心不变量：

- 链表头部（`begin()`）= 最近使用（MRU）
- 链表尾部（`prev(end())`）= 最久未使用（LRU）

---

## 三、先画一个执行过程（直觉最重要）

假设容量是 2：

1. `put(1, 10)` → 链表：`[(1,10)]`
2. `put(2, 20)` → 链表：`[(2,20), (1,10)]`（新插入放头部）
3. `get(1)` 命中 → 把 1 移到头部：`[(1,10), (2,20)]`
4. `put(3, 30)` 容量满 → 淘汰尾部 `(2,20)`，再插头部：`[(3,30), (1,10)]`
5. `get(2)` 未命中，返回 -1

你会发现整个过程都在做三件事：

- 查 key（map）
- 移节点到头部（list）
- 从尾部删节点（list）

---

## 四、C++ 版本设计（实战可用）

我们先给出一个清晰的类定义：

```cpp
#include <unordered_map>
#include <list>
#include <utility>

class LRUCache {
public:
    explicit LRUCache(int capacity) : capacity_(capacity) {}

    int get(int key) {
        auto it = index_.find(key);
        if (it == index_.end()) {
            return -1;
        }

        // 命中后把节点移动到链表头部（最近使用）
        touch(it->second);
        return it->second->second;
    }

    void put(int key, int value) {
        auto it = index_.find(key);

        // 1) key 已存在：更新 value 并移动到头部
        if (it != index_.end()) {
            it->second->second = value;
            touch(it->second);
            return;
        }

        // 2) key 不存在，且容量已满：淘汰尾部（最久未使用）
        if (static_cast<int>(items_.size()) == capacity_) {
            int old_key = items_.back().first;
            index_.erase(old_key);
            items_.pop_back();
        }

        // 3) 插入新节点到头部
        items_.emplace_front(key, value);
        index_[key] = items_.begin();
    }

private:
    using Node = std::pair<int, int>; // {key, value}
    using List = std::list<Node>;
    using Iter = List::iterator;

    void touch(Iter node_it) {
        // list::splice 在同一个 list 内移动节点是 O(1)
        items_.splice(items_.begin(), items_, node_it);
    }

private:
    int capacity_;
    List items_; // 头新尾旧
    std::unordered_map<int, Iter> index_;
};
```

这份实现是面试和工程里都很常见的写法。

---

## 五、逐行讲透关键点

### 5.1 为什么 map 存的是 `list::iterator`

因为我们要在 `O(1)` 时间内：

- 定位 key 对应的链表节点
- 把它从原位置移到头部

`iterator` 就像“节点指针”。拿到它就能直接操作节点，不用遍历。

### 5.2 `touch` 为什么用 `splice`

`std::list::splice` 可以把一个已有节点“挪位置”而不是“拷贝重建”。  
在同一条 `list` 内移动节点是常数复杂度，正是我们要的 `O(1)`。

### 5.3 `put` 更新已有 key 的细节

很多人会写成“先删旧节点，再插新节点”。能做，但步骤更多。  
更简洁的方法是：

1. 直接改 `value`
2. 调 `touch` 移到头部

这样逻辑更稳，性能也好。

### 5.4 淘汰时为什么先 `erase(map)` 再 `pop_back(list)`

因为 `pop_back` 后，尾节点就没了。  
我们在删除 map 条目前，需要先拿到尾节点的 key：

```cpp
int old_key = items_.back().first;
index_.erase(old_key);
items_.pop_back();
```

顺序必须保证正确。

---

## 六、复杂度分析

- `get`：
  - `unordered_map::find` 平均 `O(1)`
  - `list::splice` `O(1)`
  - 总体平均 `O(1)`

- `put`：
  - map 查找平均 `O(1)`
  - 可能淘汰尾部 `O(1)`
  - 头插 `O(1)`
  - 总体平均 `O(1)`

空间复杂度：`O(capacity)`。

> 严格来说，`unordered_map` 在极端哈希冲突下会退化，但工程和面试语境里通常按平均 `O(1)` 讨论。

---

## 七、面试高频坑位（90% 的失误在这里）

1. **忘记在 `get` 命中时更新“最近使用”顺序**  
   结果缓存会错淘汰。

2. **`put` 更新已有 key 时没移动到头部**  
   语义不完整。

3. **链表删节点后 map 里还留旧迭代器**  
   这是典型悬空迭代器 bug。

4. **容量为 0 的边界条件没处理**  
   如果业务允许 `capacity == 0`，应在 `put` 直接返回。

下面是加上容量 0 保护的版本：

```cpp
void put(int key, int value) {
    if (capacity_ == 0) return;

    auto it = index_.find(key);
    if (it != index_.end()) {
        it->second->second = value;
        touch(it->second);
        return;
    }

    if (static_cast<int>(items_.size()) == capacity_) {
        int old_key = items_.back().first;
        index_.erase(old_key);
        items_.pop_back();
    }

    items_.emplace_front(key, value);
    index_[key] = items_.begin();
}
```

---

## 八、一个可直接运行的小测试

```cpp
#include <cassert>

int main() {
    LRUCache cache(2);

    cache.put(1, 10);
    cache.put(2, 20);
    assert(cache.get(1) == 10); // 1 变为最近使用

    cache.put(3, 30);           // 淘汰 key=2
    assert(cache.get(2) == -1);
    assert(cache.get(3) == 30);
    assert(cache.get(1) == 10);

    cache.put(1, 15);           // 更新 key=1
    assert(cache.get(1) == 15);

    return 0;
}
```

如果这些断言都通过，说明你的核心逻辑已经正确。

---

## 九、工程进阶：线程安全怎么做？

上面的实现默认是**单线程**场景。  
如果多线程并发访问，至少要在 `get/put` 上加互斥锁（例如 `std::mutex`），保证 map 和 list 的一致性。

进一步优化会涉及：

- 读写锁（读多写少场景）
- 分段锁（减少锁竞争）
- 无锁结构（复杂度高，不建议面试手写）

面试里你可以先给出单线程正确实现，再补一句“并发下需要同步机制”，通常已经很加分。

---

## 十、总结（你应该真正记住的）

LRU 不是“背模板”，而是维护两个事实：

1. **我能不能快速找到 key？** → `unordered_map`
2. **我能不能快速更新‘最近使用顺序’并淘汰最旧？** → `list`

当你把这两个问题想清楚，`LRUCache` 的代码就只是机械翻译。

如果你愿意，我下一篇可以继续写：

- 如何把这个 LRU 改造成“支持泛型 key/value”版本
- 如何加 TTL（过期时间）
- 如何实现 LFU，并对比 LRU / LFU 的适用场景
