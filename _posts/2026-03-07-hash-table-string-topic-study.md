---
title: 哈希表与字符串专题学习：从底层原理到 LeetCode 实战
description: 系统掌握哈希函数、冲突解决、负载因子与 C++ unordered_map 实现机制，深入 KMP 与滑动窗口，并通过 5 道 LeetCode 题完成能力闭环。
date: 2026-03-07
categories: [算法]
tags: [哈希表, 字符串, unordered_map, KMP, 滑动窗口, LeetCode, C++]
---

这是一篇“专题化学习笔记”：不是零散刷题，而是把**原理 → 模板 → 题目 → 复盘卡片**串成一条完整路径。

你将获得 5 个明确目标：

1. 掌握哈希表核心原理（哈希函数、冲突解决、负载因子）
2. 精通 C++ `unordered_map` 的实现思路（链地址法 + 动态扩容）
3. 掌握字符串匹配中的 KMP 与滑动窗口
4. 完成 5 道 LeetCode 题，覆盖哈希表与字符串核心考点
5. 制作可复习的“哈希表知识卡片”

---

## 1. 哈希表核心原理

哈希表的本质是：

> 用哈希函数把“键 key”映射到数组下标，再在该下标附近查找/维护元素。

目标是把平均复杂度做到接近 O(1)。

### 1.1 哈希函数（Hash Function）

一个好的哈希函数通常满足：

- **确定性**：同一个 key 一定映射到同一个桶
- **高离散性**：不同 key 尽量均匀分布
- **计算成本低**：不能哈希比查找还慢

常见映射形式（抽象）：

```text
index = hash(key) % bucket_count
```

在工程里你通常不会手写 `std::string` 的哈希算法，但要知道其目标：**减少碰撞并保持速度**。

### 1.2 冲突（Collision）不可避免

只要键空间大于桶数量，就会出现不同 key 落在同一桶。

典型冲突解决策略：

1. **链地址法（Separate Chaining）**
   - 每个桶挂一个链表/链式结构
   - 冲突元素追加在同一桶中
   - 插入简单、删除方便

2. **开放寻址法（Open Addressing）**
   - 冲突时在表内继续探测（线性探测、二次探测、双重哈希）
   - 不使用额外链表，但删除和聚簇问题更复杂

C++ `unordered_map` 的主流实现思路偏向链地址法（实现细节依库而异）。

### 1.3 负载因子（Load Factor）

负载因子定义：

```text
load_factor = size / bucket_count
```

含义：每个桶平均有多少元素。

- 负载因子越高，冲突概率通常越高
- 冲突越高，桶内遍历越长，性能下降

因此哈希表会设置阈值（`max_load_factor`），超过阈值就触发**扩容 + 重哈希（rehash）**。

---

## 2. C++ `unordered_map` 实现机制（面试可讲版）

下面给你一个够用且清晰的理解模型。

### 2.1 数据结构骨架

可近似理解为：

- 一个 `bucket array`（桶数组）
- 每个桶指向一条节点链
- 节点保存：`{key, value, next}`

查找流程：

1. 计算 `h = hash(key)`
2. 定位桶 `b = h % bucket_count`
3. 在该桶链中比较 key（`==`）

### 2.2 插入与更新

`mp[key] = value` 典型语义：

- key 不存在：创建节点并挂入对应桶
- key 已存在：更新其 value

平均 O(1)，最坏 O(n)（全部冲突到一个桶）。

### 2.3 动态扩容与 rehash

当 `load_factor > max_load_factor` 时：

1. 分配更大的桶数组（通常是增长到更大容量）
2. 遍历旧桶中所有节点
3. 用新的 `bucket_count` 重新计算桶位置并迁移

这会带来一次性成本，但摊还后通常仍能保持平均 O(1)。

### 2.4 代码层面的性能建议

- 已知数据量时调用 `reserve(n)`，减少 rehash 次数
- 频繁统计计数时优先 `unordered_map<int,int>` / `unordered_map<string,int>`
- 对自定义类型做 key 时要提供 `hash` 与 `==`
- 对性能极敏感路径，关注哈希质量与内存分配行为

---

## 3. 字符串匹配算法：KMP + 滑动窗口

### 3.1 KMP：把“失败信息”变成加速器

朴素匹配失配时，主串指针会回退很多比较。
KMP 的关键是预处理模式串 `pattern` 的 `next/lps` 数组，让模式串自己跳。

#### 3.1.1 `lps` 定义

`lps[i]` 表示：

- `pattern[0..i]` 这个前缀中
- **最长相等真前后缀**的长度

例如 `pattern = "ababaca"`，其 `lps` 可帮助在失配时把 `j` 直接跳到合适位置，而不是回到 0。

#### 3.1.2 KMP 复杂度

- 预处理 `lps`：O(m)
- 匹配过程：O(n)
- 总复杂度：O(n + m)

其中 `n` 是主串长度，`m` 是模式串长度。

#### 3.1.3 KMP 模板（C++）

```cpp
vector<int> buildLps(const string& p) {
    int m = (int)p.size();
    vector<int> lps(m, 0);
    for (int i = 1, len = 0; i < m; ) {
        if (p[i] == p[len]) {
            lps[i++] = ++len;
        } else if (len > 0) {
            len = lps[len - 1];
        } else {
            lps[i++] = 0;
        }
    }
    return lps;
}

int kmpSearch(const string& s, const string& p) {
    if (p.empty()) return 0;
    auto lps = buildLps(p);
    for (int i = 0, j = 0; i < (int)s.size(); ) {
        if (s[i] == p[j]) {
            ++i; ++j;
            if (j == (int)p.size()) return i - j;
        } else if (j > 0) {
            j = lps[j - 1];
        } else {
            ++i;
        }
    }
    return -1;
}
```

### 3.2 滑动窗口：动态维护“一个合法区间”

滑动窗口通常处理“子串/子数组 + 约束”问题。

统一套路：

1. 右指针右移，纳入新字符
2. 更新窗口状态（计数、种类数、有效性）
3. 若不合法，左指针右移直到恢复合法
4. 在每次合法时更新答案

复杂度通常是 O(n)，因为左右指针都只单调前进。

---

## 4. 5 道 LeetCode 题目实战（哈希表 + 字符串）

下面这 5 题覆盖频次统计、窗口、哈希判重、KMP、构造与映射。

## 4.1 #1 Two Sum（哈希表入门必做）

**题意**：找两个下标，使得 `nums[i] + nums[j] = target`。

**思路**：边遍历边查补数。

- 设当前值 `x`
- 先查 `target - x` 是否已在哈希表
- 若存在直接返回
- 否则记录 `x -> index`

```cpp
vector<int> twoSum(vector<int>& nums, int target) {
    unordered_map<int, int> pos;
    pos.reserve(nums.size() * 2);
    for (int i = 0; i < (int)nums.size(); ++i) {
        int need = target - nums[i];
        if (pos.count(need)) return {pos[need], i};
        pos[nums[i]] = i;
    }
    return {};
}
```

- 时间复杂度：O(n)
- 空间复杂度：O(n)

## 4.2 #49 Group Anagrams（哈希分组）

**题意**：把字母异位词分组。

**思路 A（常用）**：排序后作为 key。

- `"eat" -> "aet"`
- `"tea" -> "aet"`
- 同 key 放同一组

```cpp
vector<vector<string>> groupAnagrams(vector<string>& strs) {
    unordered_map<string, vector<string>> mp;
    for (auto s : strs) {
        string key = s;
        sort(key.begin(), key.end());
        mp[key].push_back(move(s));
    }
    vector<vector<string>> ans;
    ans.reserve(mp.size());
    for (auto& [k, v] : mp) ans.push_back(move(v));
    return ans;
}
```

- 时间复杂度：O(n * k log k)（`k` 为字符串平均长度）
- 进阶可用 26 计数签名降排序成本

## 4.3 #3 Longest Substring Without Repeating Characters（滑动窗口经典）

**题意**：最长无重复字符子串长度。

**思路**：窗口内字符频次 ≤ 1。

```cpp
int lengthOfLongestSubstring(string s) {
    vector<int> cnt(128, 0);
    int ans = 0;
    for (int l = 0, r = 0; r < (int)s.size(); ++r) {
        cnt[s[r]]++;
        while (cnt[s[r]] > 1) {
            cnt[s[l]]--;
            ++l;
        }
        ans = max(ans, r - l + 1);
    }
    return ans;
}
```

- 时间复杂度：O(n)
- 空间复杂度：O(字符集)

## 4.4 #438 Find All Anagrams in a String（固定窗口 + 频次数组）

**题意**：找出 `s` 中所有是 `p` 的异位词的起始下标。

**思路**：固定长度窗口（长度 = `p.size()`），比较频次。

```cpp
vector<int> findAnagrams(string s, string p) {
    vector<int> ans;
    if (s.size() < p.size()) return ans;

    vector<int> need(26, 0), win(26, 0);
    for (char c : p) need[c - 'a']++;

    int m = (int)p.size();
    for (int i = 0; i < (int)s.size(); ++i) {
        win[s[i] - 'a']++;
        if (i >= m) win[s[i - m] - 'a']--;
        if (win == need) ans.push_back(i - m + 1);
    }
    return ans;
}
```

- 时间复杂度：O(26 * n)，可视为 O(n)

## 4.5 #28 Find the Index of the First Occurrence in a String（KMP 应用）

**题意**：实现 `strStr()`。

**思路**：直接套 KMP。

```cpp
int strStr(string haystack, string needle) {
    return kmpSearch(haystack, needle);
}
```

当主串很长且模式重复结构明显时，KMP 的线性保证非常关键。

---

## 5. 高频错误清单（面试前必看）

### 哈希表常错点

1. 把平均 O(1) 误说成严格 O(1)
2. 忘记冲突与最坏 O(n)
3. `unordered_map` 遍历顺序当成有序
4. 不做 `reserve` 导致频繁 rehash

### 字符串常错点

1. KMP 的 `lps` 定义混淆（真前后缀）
2. 滑窗中“先扩右再缩左”的顺序不稳定
3. 计数数组字符映射越界（`'a'~'z'` vs ASCII）
4. 边界空串没处理（尤其 `needle == ""`）

---

## 6. 哈希表知识卡片（可直接收藏）

## 卡片 A：概念速记

- 哈希表 = 数组 + 哈希函数 + 冲突处理
- 平均复杂度：查/增/删接近 O(1)
- 最坏复杂度：O(n)
- 负载因子：`size / bucket_count`

## 卡片 B：C++ `unordered_map` 关键点

- 底层常用链地址法思想
- `max_load_factor` 控制扩容阈值
- `reserve(n)` 提前分桶，减少 rehash
- 不保证遍历顺序稳定

## 卡片 C：什么时候用哈希，什么时候用数组计数

- key 离散且范围大：哈希表
- key 范围小且连续（如 26 字母）：数组计数更快更省常数

## 卡片 D：KMP 一句话记忆

> KMP 通过 `lps` 记录“失配后模式串该跳到哪”，避免主串回退，实现 O(n+m)。

## 卡片 E：滑窗模板

- 右扩：纳入字符
- 判非法：左缩至合法
- 每轮更新答案
- 双指针都单调前进，因此 O(n)

---

## 7. 一周训练建议（可执行版）

- Day 1：复习哈希原理 + 手写 Two Sum / Group Anagrams
- Day 2：专项滑窗（#3、#438）并总结“窗口状态定义”
- Day 3：手写 KMP（`buildLps + search`）
- Day 4：计时复做 5 题，控制在 90 分钟内
- Day 5：口述 `unordered_map` 扩容机制（不看笔记）
- Day 6：错题二刷 + 重写知识卡片
- Day 7：模拟面试讲解专题（原理 + 题解 + trade-off）

如果你能把这篇中的 5 题在“不看答案”的前提下写到无 bug，并能口述底层逻辑，哈希表与字符串专题基本就过关了。
