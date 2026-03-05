---
title: C++ STL 常用操作指南：增删改查（CRUD）一篇搞定
description: 面向初学者和面试场景，系统讲解 C++ STL 中 vector、string、deque、list、set、map、unordered_map 等容器的增删改查操作、复杂度与常见坑。
date: 2026-03-05
categories: [C++]
tags: [c++, stl, vector, map, unordered_map, set, CRUD]
---

很多同学学 STL 时都有一个痛点：

- 接口记住了，但一写题就忘；
- `insert` / `erase` 会用，但复杂度没概念；
- 知道有 `map` 和 `unordered_map`，却不知道什么时候该选谁。

这篇文章按 **CRUD（增删改查）** 来整理 STL 高频操作，目标是：

> 你不仅能“会写”，还知道“为什么这么写更稳、更快”。

---

## 1. 先建立一张脑图：STL 容器怎么分？

可以先把常见容器分三类：

1. **顺序容器**：`vector`、`string`、`deque`、`list`
2. **有序关联容器（红黑树）**：`set`、`map`、`multiset`、`multimap`
3. **无序关联容器（哈希表）**：`unordered_set`、`unordered_map`...

理解这个分类后，CRUD 的行为就容易预测：

- 顺序容器：按位置操作明显（下标、迭代器）
- 有序容器：元素自动有序，查找/插入/删除通常 `O(log n)`
- 无序容器：平均 `O(1)`，但不保证有序

---

## 2. 顺序容器 CRUD（vector / string / deque / list）

## 2.1 `vector`：最常用，面试主力

### C（Create，增）

```cpp
vector<int> v;
v.push_back(10);               // 尾插 O(1) 均摊
v.emplace_back(20);            // 就地构造（对象类型更有优势）
v.insert(v.begin() + 1, 15);   // 指定位置插入 O(n)
```

### R（Read，查）

```cpp
int x = v[0];      // O(1)，不做边界检查
int y = v.at(0);   // O(1)，越界会抛异常
int n = v.size();
bool empty = v.empty();
```

### U（Update，改）

```cpp
v[0] = 100;                 // 按下标修改
for (auto& e : v) e += 1;   // 批量修改要用引用
```

### D（Delete，删）

```cpp
v.pop_back();                // 尾删 O(1)
v.erase(v.begin() + 1);      // 删除某位置 O(n)
v.clear();                   // 清空
```

### 高频坑

- `erase` 会导致该位置及后续迭代器失效。
- 在循环里删元素，建议用“返回迭代器”写法：

```cpp
for (auto it = v.begin(); it != v.end(); ) {
    if (*it % 2 == 0) it = v.erase(it);
    else ++it;
}
```

---

## 2.2 `string`：本质是字符版 `vector`

### 增

```cpp
string s = "abc";
s.push_back('d');
s += "ef";
s.insert(1, "XYZ");
```

### 查

```cpp
char c = s[0];
size_t pos = s.find("bc");   // 找不到返回 string::npos
```

### 改

```cpp
s[0] = 'A';
s.replace(1, 2, "TT");
```

### 删

```cpp
s.pop_back();
s.erase(1, 2); // 从下标1开始删2个字符
```

---

## 2.3 `deque` 与 `list` 怎么记？

- `deque`：双端队列，头尾插删都快，支持随机访问。
- `list`：双向链表，中间插删快，但不支持随机访问（不能 `list[i]`）。

如果你主要刷算法题，默认优先 `vector`；只有明确需要头部高频操作或链表特性时再换。

---

## 3. 关联容器 CRUD（set / map）

## 3.1 `set`：只存 key，自动去重且有序

```cpp
set<int> st;

// 增
st.insert(3);
st.insert(1);
st.insert(3); // 重复元素不会插入

// 查
bool has3 = st.count(3);      // 0 或 1
auto it = st.find(1);         // 找不到返回 st.end()

// 改
// set 元素是 key，本质不可直接修改（会破坏有序性）

// 删
st.erase(3);                  // 按 key 删除
auto it2 = st.find(1);
if (it2 != st.end()) st.erase(it2);
```

---

## 3.2 `map`：key-value，按 key 有序

```cpp
map<string, int> mp;

// 增
mp["alice"] = 90;                // 若 key 不存在会创建
mp.insert({"bob", 85});
mp.emplace("cindy", 95);

// 查
int a = mp["alice"];             // 存在则读取；不存在会创建默认值（坑点）
auto it = mp.find("bob");        // 推荐查找方式
if (it != mp.end()) {
    // it->first 是 key，it->second 是 value
}

// 改
mp["alice"] = 99;
if (auto it2 = mp.find("bob"); it2 != mp.end()) {
    it2->second = 88;
}

// 删
mp.erase("cindy");
```

### `map` 的实战提醒

1. 只想“查是否存在”，优先 `find` / `count`，少用 `mp[key]`（会意外插入）。
2. 遍历默认按 key 从小到大。

---

## 4. 无序关联容器 CRUD（unordered_map / unordered_set）

## 4.1 `unordered_map`：刷题统计频次最常用

```cpp
unordered_map<int, int> cnt;

// 增
cnt[5]++;
cnt.emplace(8, 1);

// 查
auto it = cnt.find(5);
if (it != cnt.end()) {
    // it->second 是频次
}

// 改
cnt[5] = 10;

// 删
cnt.erase(8);
```

### 使用建议

- 平均复杂度更优（`O(1)`），但最坏可能退化。
- 元素无序，不能做“有序遍历”。
- 自定义类型做 key 时，记得提供哈希函数与相等比较。

---

## 5. 常用“增删改查”模板（可直接背）

## 5.1 删除 `vector` 中所有目标值（erase-remove 惯用法）

```cpp
vector<int> v = {1, 2, 2, 3, 2, 4};
v.erase(remove(v.begin(), v.end(), 2), v.end());
// 结果: 1 3 4
```

## 5.2 统计数组频次（unordered_map）

```cpp
vector<int> nums = {1, 2, 2, 3, 1, 2};
unordered_map<int, int> freq;
for (int x : nums) freq[x]++;
```

## 5.3 判断元素是否存在（set / unordered_set）

```cpp
unordered_set<string> vis;
vis.insert("nodeA");
if (vis.count("nodeA")) {
    // 存在
}
```

---

## 6. 复杂度速查表（面试高频）

- `vector`
  - 末尾增删：均摊 `O(1)`
  - 中间插删：`O(n)`
  - 随机访问：`O(1)`
- `map/set`（红黑树）
  - 增删查：`O(log n)`
- `unordered_map/unordered_set`（哈希）
  - 平均增删查：`O(1)`，最坏 `O(n)`

选型口诀：

> 要有序，用 `map/set`；
> 要极致查找速度且不关心顺序，用 `unordered_map/set`；
> 要高频下标访问和遍历，用 `vector`。

---

## 7. 常见错误清单（建议收藏）

1. 在 `map` 上用 `mp[key]` 判断存在性，导致脏数据被插入。
2. 在 `vector` 循环删除时直接 `++it`，跳元素或迭代器失效。
3. 把 `set` 当数组用，尝试通过下标访问。
4. 忘记 `unordered_*` 不保证顺序，输出顺序在不同机器上可能不同。
5. 忘记给 range-for 用引用，导致“修改不生效”。

---

## 8. 一段话总结

STL 学习的关键不是“背 API”，而是把每个容器放到 CRUD 框架里理解：

- **增删改查分别怎么写**；
- **每个操作复杂度是多少**；
- **哪些操作会触发隐式行为（如默认插入、迭代器失效）**。

你把这三点建立起来，刷题、面试、工程代码都会稳很多。
