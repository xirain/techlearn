---
title: 数据结构与算法练手代码 —— 6 个现代 C++ 实现的面试高频数据结构
description: 覆盖LRU Cache(unordered_map+双向链表)、跳表(SkipList)、布隆过滤器(Bloom Filter)、Trie前缀树、并查集(Union-Find路径压缩)、KMP字符串匹配，每个实现约100行现代C++风格
date: 2026-02-27
categories: [数据结构]
tags: [c++, 练手代码, LRU, 跳表, 布隆过滤器, Trie, 并查集, KMP, 数据结构, 算法]
---

数据结构手写题是面试的**经典保留节目**——LRU Cache、跳表、布隆过滤器几乎是必考题。这 6 个实现用现代 C++ 风格编写，每个约 100 行，覆盖面试最高频的数据结构。

> 📌 关联阅读：[数据结构与算法面试题](/techlearn/posts/ds-algo-interview) · [字符串算法面试题](/techlearn/posts/string-algorithm-interview) · [高性能优化练手代码](/techlearn/posts/high-performance-practice)

------

## 练习1：LRU Cache

**考点**：O(1) get/put、哈希表 + 双向链表、`std::list` splice 技巧

```cpp
// lru_cache.cpp
// g++ -std=c++17 -o lru_cache lru_cache.cpp
#include <iostream>
#include <unordered_map>
#include <list>
#include <optional>
#include <cassert>

template<typename K, typename V>
class LRUCache {
    size_t capacity_;
    // list 存储 {key, value}，front = 最近使用，back = 最久未用
    std::list<std::pair<K, V>> items_;
    // map 存储 key → list 迭代器
    std::unordered_map<K, typename std::list<std::pair<K, V>>::iterator> index_;

public:
    explicit LRUCache(size_t cap) : capacity_(cap) {}

    // O(1) 查询
    std::optional<V> get(const K& key) {
        auto it = index_.find(key);
        if (it == index_.end()) return std::nullopt;
        // 移到链表头部（最近使用）
        items_.splice(items_.begin(), items_, it->second);
        return it->second->second;
    }

    // O(1) 插入/更新
    void put(const K& key, V value) {
        auto it = index_.find(key);
        if (it != index_.end()) {
            // 更新值，移到头部
            it->second->second = std::move(value);
            items_.splice(items_.begin(), items_, it->second);
            return;
        }
        // 新插入
        if (items_.size() >= capacity_) {
            // 淘汰尾部（最久未用）
            auto& back = items_.back();
            index_.erase(back.first);
            items_.pop_back();
        }
        items_.emplace_front(key, std::move(value));
        index_[key] = items_.begin();
    }

    size_t size() const { return items_.size(); }

    void print() const {
        std::cout << "  [";
        for (auto it = items_.begin(); it != items_.end(); ++it) {
            if (it != items_.begin()) std::cout << " → ";
            std::cout << it->first << ":" << it->second;
        }
        std::cout << "]\n";
    }
};

int main() {
    std::cout << "=== LRU Cache ===\n";
    LRUCache<std::string, int> cache(3);

    cache.put("a", 1); cache.print();  // [a:1]
    cache.put("b", 2); cache.print();  // [b:2 → a:1]
    cache.put("c", 3); cache.print();  // [c:3 → b:2 → a:1]

    auto v = cache.get("a");           // a 被访问，移到头部
    std::cout << "  get(a) = " << *v << "\n";
    cache.print();                     // [a:1 → c:3 → b:2]

    cache.put("d", 4);                 // b 被淘汰
    cache.print();                     // [d:4 → a:1 → c:3]

    assert(!cache.get("b").has_value());  // b 已被淘汰
    assert(cache.get("c").value() == 3);

    cache.put("a", 10);               // 更新 a
    cache.print();                     // [a:10 → c:3 → d:4]

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- `std::list::splice` 是 O(1) 移动节点，不触发拷贝/析构
- 哈希表存迭代器（`std::list` 迭代器在 splice 后不失效）
- 淘汰策略：链表尾部是最久未用的，直接 `pop_back`
- 这就是 Redis 的 LRU 淘汰策略的核心思想

---

## 练习2：跳表 (SkipList)

**考点**：概率平衡、多层索引、O(log n) 查找/插入/删除

```cpp
// skiplist.cpp
// g++ -std=c++17 -o skiplist skiplist.cpp
#include <iostream>
#include <vector>
#include <random>
#include <optional>
#include <cassert>
#include <limits>

template<typename K, typename V>
class SkipList {
    static constexpr int MAX_LEVEL = 16;

    struct Node {
        K key;
        V value;
        std::vector<Node*> next;  // next[i] = 第 i 层的下一个节点
        Node(K k, V v, int level) : key(std::move(k)), value(std::move(v)), next(level, nullptr) {}
    };

    Node* head_;       // 哨兵头节点
    int cur_level_ = 1;
    size_t size_ = 0;
    std::mt19937 rng_{std::random_device{}()};

    int random_level() {
        int level = 1;
        while (level < MAX_LEVEL && (rng_() % 4) == 0) ++level;  // p=0.25
        return level;
    }

public:
    SkipList() {
        head_ = new Node(K{}, V{}, MAX_LEVEL);
    }

    ~SkipList() {
        Node* cur = head_;
        while (cur) { Node* next = cur->next[0]; delete cur; cur = next; }
    }

    void insert(K key, V value) {
        std::vector<Node*> update(MAX_LEVEL, head_);
        Node* cur = head_;

        // 从最高层往下找插入位置
        for (int i = cur_level_ - 1; i >= 0; --i) {
            while (cur->next[i] && cur->next[i]->key < key)
                cur = cur->next[i];
            update[i] = cur;
        }

        // 如果 key 已存在，更新 value
        if (cur->next[0] && cur->next[0]->key == key) {
            cur->next[0]->value = std::move(value);
            return;
        }

        int level = random_level();
        if (level > cur_level_) cur_level_ = level;

        Node* node = new Node(std::move(key), std::move(value), level);
        for (int i = 0; i < level; ++i) {
            node->next[i] = update[i]->next[i];
            update[i]->next[i] = node;
        }
        ++size_;
    }

    std::optional<V> find(const K& key) const {
        Node* cur = head_;
        for (int i = cur_level_ - 1; i >= 0; --i) {
            while (cur->next[i] && cur->next[i]->key < key)
                cur = cur->next[i];
        }
        cur = cur->next[0];
        if (cur && cur->key == key) return cur->value;
        return std::nullopt;
    }

    bool erase(const K& key) {
        std::vector<Node*> update(MAX_LEVEL, head_);
        Node* cur = head_;
        for (int i = cur_level_ - 1; i >= 0; --i) {
            while (cur->next[i] && cur->next[i]->key < key)
                cur = cur->next[i];
            update[i] = cur;
        }
        cur = cur->next[0];
        if (!cur || cur->key != key) return false;

        for (int i = 0; i < (int)cur->next.size(); ++i)
            update[i]->next[i] = cur->next[i];
        delete cur;
        --size_;
        return true;
    }

    size_t size() const { return size_; }

    void print() const {
        for (int i = cur_level_ - 1; i >= 0; --i) {
            std::cout << "  L" << i << ": ";
            Node* cur = head_->next[i];
            while (cur) {
                std::cout << cur->key << " ";
                cur = cur->next[i];
            }
            std::cout << "\n";
        }
    }
};

int main() {
    std::cout << "=== SkipList ===\n";
    SkipList<int, std::string> sl;

    for (int i : {3, 6, 7, 9, 12, 19, 17, 26, 21, 25})
        sl.insert(i, "v" + std::to_string(i));

    std::cout << "  structure:\n";
    sl.print();

    assert(sl.find(7).value() == "v7");
    assert(sl.find(19).value() == "v19");
    assert(!sl.find(10).has_value());

    sl.erase(19);
    assert(!sl.find(19).has_value());
    std::cout << "\n  after erase(19):\n";
    sl.print();

    std::cout << "\n  size = " << sl.size() << "\n";
    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- 跳表用概率代替平衡树的旋转，实现 O(log n) 操作
- Redis 的有序集合（ZSet）底层就是跳表
- `p=0.25` 表示每个节点平均 1.33 层索引
- 相比红黑树，跳表实现简单且天然支持范围查询

---

## 练习3：布隆过滤器 (Bloom Filter)

**考点**：空间效率、误判率计算、多个哈希函数

```cpp
// bloom_filter.cpp
// g++ -std=c++17 -o bloom_filter bloom_filter.cpp
#include <iostream>
#include <vector>
#include <string>
#include <cmath>
#include <functional>
#include <cassert>

class BloomFilter {
    std::vector<bool> bits_;
    size_t num_hashes_;

    // 使用双重哈希模拟 k 个哈希函数
    size_t hash_i(const std::string& key, size_t i) const {
        size_t h1 = std::hash<std::string>{}(key);
        size_t h2 = std::hash<std::string>{}(key + "salt");
        return (h1 + i * h2) % bits_.size();
    }

public:
    // n=预期元素数, p=期望误判率
    BloomFilter(size_t n, double p) {
        // 最优位数 m = -(n * ln(p)) / (ln(2))^2
        size_t m = static_cast<size_t>(-1.0 * n * std::log(p) / (std::log(2) * std::log(2)));
        // 最优哈希数 k = (m/n) * ln(2)
        num_hashes_ = static_cast<size_t>(1.0 * m / n * std::log(2));
        num_hashes_ = std::max(num_hashes_, size_t(1));
        bits_.resize(m, false);

        std::cout << "  BloomFilter: m=" << m << " bits, k=" << num_hashes_
                  << " hashes, " << m / 8 << " bytes\n";
    }

    void insert(const std::string& key) {
        for (size_t i = 0; i < num_hashes_; ++i)
            bits_[hash_i(key, i)] = true;
    }

    // 可能存在 (有误判) / 一定不存在
    bool maybe_contains(const std::string& key) const {
        for (size_t i = 0; i < num_hashes_; ++i)
            if (!bits_[hash_i(key, i)]) return false;
        return true;
    }

    double fill_ratio() const {
        size_t set_bits = 0;
        for (bool b : bits_) if (b) ++set_bits;
        return 1.0 * set_bits / bits_.size();
    }
};

int main() {
    std::cout << "=== Bloom Filter ===\n";

    // 预期 10000 个元素，1% 误判率
    BloomFilter bf(10000, 0.01);

    // 插入 10000 个元素
    for (int i = 0; i < 10000; ++i)
        bf.insert("key" + std::to_string(i));

    // 验证已插入的元素（不应有漏判）
    int false_negatives = 0;
    for (int i = 0; i < 10000; ++i)
        if (!bf.maybe_contains("key" + std::to_string(i)))
            ++false_negatives;

    std::cout << "  false negatives: " << false_negatives << " (should be 0)\n";
    assert(false_negatives == 0);

    // 测试未插入的元素（统计误判率）
    int false_positives = 0;
    int test_count = 10000;
    for (int i = 10000; i < 10000 + test_count; ++i)
        if (bf.maybe_contains("key" + std::to_string(i)))
            ++false_positives;

    double fpr = 1.0 * false_positives / test_count;
    std::cout << "  false positives: " << false_positives << "/" << test_count
              << " = " << (fpr * 100) << "%\n";
    std::cout << "  fill ratio: " << (bf.fill_ratio() * 100) << "%\n";

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- 布隆过滤器只能说"可能存在"或"一定不存在"，不会漏判
- 最优参数：m = -(n ln p) / (ln 2)^2, k = (m/n) ln 2
- 双重哈希 `h(i) = h1 + i*h2` 模拟多个独立哈希函数
- Redis、HBase、Cassandra 都用布隆过滤器减少无效磁盘查询

---

## 练习4：Trie 前缀树

**考点**：前缀查询、自动补全、内存优化

```cpp
// trie.cpp
// g++ -std=c++17 -o trie trie.cpp
#include <iostream>
#include <unordered_map>
#include <string>
#include <vector>
#include <memory>
#include <cassert>

class Trie {
    struct Node {
        std::unordered_map<char, std::unique_ptr<Node>> children;
        bool is_end = false;
        int count = 0;  // 以此节点结尾的单词数
    };
    std::unique_ptr<Node> root_ = std::make_unique<Node>();

public:
    void insert(const std::string& word) {
        auto* cur = root_.get();
        for (char c : word) {
            if (!cur->children.count(c))
                cur->children[c] = std::make_unique<Node>();
            cur = cur->children[c].get();
        }
        cur->is_end = true;
        cur->count++;
    }

    bool search(const std::string& word) const {
        auto* node = find_node(word);
        return node && node->is_end;
    }

    bool starts_with(const std::string& prefix) const {
        return find_node(prefix) != nullptr;
    }

    // 自动补全：返回所有以 prefix 开头的单词
    std::vector<std::string> autocomplete(const std::string& prefix, int limit = 10) const {
        auto* node = find_node(prefix);
        if (!node) return {};
        std::vector<std::string> results;
        collect(node, prefix, results, limit);
        return results;
    }

    // 统计以 prefix 开头的单词数量
    int count_prefix(const std::string& prefix) const {
        auto* node = find_node(prefix);
        if (!node) return 0;
        int total = 0;
        count_all(node, total);
        return total;
    }

private:
    const Node* find_node(const std::string& prefix) const {
        const Node* cur = root_.get();
        for (char c : prefix) {
            auto it = cur->children.find(c);
            if (it == cur->children.end()) return nullptr;
            cur = it->second.get();
        }
        return cur;
    }

    void collect(const Node* node, std::string current,
                 std::vector<std::string>& results, int limit) const {
        if ((int)results.size() >= limit) return;
        if (node->is_end) results.push_back(current);
        for (const auto& [c, child] : node->children) {
            collect(child.get(), current + c, results, limit);
        }
    }

    void count_all(const Node* node, int& total) const {
        total += node->count;
        for (const auto& [c, child] : node->children)
            count_all(child.get(), total);
    }
};

int main() {
    std::cout << "=== Trie ===\n";
    Trie trie;

    // 插入单词
    for (auto& w : {"apple", "app", "application", "apply",
                     "banana", "band", "bandwidth"}) {
        trie.insert(w);
    }

    // 精确查找
    assert(trie.search("apple"));
    assert(trie.search("app"));
    assert(!trie.search("ap"));
    assert(!trie.search("apples"));
    std::cout << "  search tests passed\n";

    // 前缀查找
    assert(trie.starts_with("app"));
    assert(trie.starts_with("ban"));
    assert(!trie.starts_with("cat"));
    std::cout << "  prefix tests passed\n";

    // 自动补全
    auto completions = trie.autocomplete("app");
    std::cout << "  autocomplete('app'): ";
    for (const auto& w : completions) std::cout << w << " ";
    std::cout << "\n";

    // 前缀计数
    std::cout << "  count('app') = " << trie.count_prefix("app") << "\n";  // 4
    std::cout << "  count('ban') = " << trie.count_prefix("ban") << "\n";  // 3

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- Trie 的每个节点代表一个字符，从根到叶的路径组成单词
- `unordered_map` 存储子节点，支持任意字符集
- `autocomplete` 通过 DFS 收集所有后缀
- 搜索引擎的搜索建议、输入法联想都基于 Trie

---

## 练习5：并查集 (Union-Find)

**考点**：路径压缩、按秩合并、O(α(n)) 近似常数操作

```cpp
// union_find.cpp
// g++ -std=c++17 -o union_find union_find.cpp
#include <iostream>
#include <vector>
#include <cassert>
#include <numeric>

class UnionFind {
    std::vector<int> parent_;
    std::vector<int> rank_;
    int components_;
public:
    explicit UnionFind(int n) : parent_(n), rank_(n, 0), components_(n) {
        std::iota(parent_.begin(), parent_.end(), 0);  // parent[i] = i
    }

    // 查找根（路径压缩）
    int find(int x) {
        if (parent_[x] != x)
            parent_[x] = find(parent_[x]);  // 路径压缩：直接指向根
        return parent_[x];
    }

    // 合并（按秩合并）
    bool unite(int x, int y) {
        int rx = find(x), ry = find(y);
        if (rx == ry) return false;  // 已在同一集合

        // 按秩合并：矮树接到高树下面
        if (rank_[rx] < rank_[ry]) std::swap(rx, ry);
        parent_[ry] = rx;
        if (rank_[rx] == rank_[ry]) ++rank_[rx];
        --components_;
        return true;
    }

    bool connected(int x, int y) { return find(x) == find(y); }
    int components() const { return components_; }
    int size() const { return parent_.size(); }
};

int main() {
    std::cout << "=== Union-Find ===\n";

    // 1. 基本操作
    {
        UnionFind uf(10);
        uf.unite(0, 1);
        uf.unite(2, 3);
        uf.unite(0, 3);  // {0,1,2,3} 合并

        assert(uf.connected(0, 3));
        assert(uf.connected(1, 2));
        assert(!uf.connected(0, 4));
        std::cout << "  basic tests passed\n";
        std::cout << "  components = " << uf.components() << "\n";  // 7
    }

    // 2. 岛屿数量问题
    {
        std::cout << "\n  === 岛屿数量 ===\n";
        std::vector<std::vector<int>> grid = {
            {1, 1, 0, 0, 0},
            {1, 1, 0, 0, 0},
            {0, 0, 1, 0, 0},
            {0, 0, 0, 1, 1}
        };
        int rows = grid.size(), cols = grid[0].size();

        // 统计陆地格子数
        int land = 0;
        for (auto& row : grid) for (int v : row) if (v) ++land;

        UnionFind uf(rows * cols);
        int dx[] = {0, 1}, dy[] = {1, 0};  // 只向右和下合并

        for (int i = 0; i < rows; ++i) {
            for (int j = 0; j < cols; ++j) {
                if (!grid[i][j]) continue;
                for (int d = 0; d < 2; ++d) {
                    int ni = i + dx[d], nj = j + dy[d];
                    if (ni < rows && nj < cols && grid[ni][nj])
                        uf.unite(i * cols + j, ni * cols + nj);
                }
            }
        }

        // 岛屿数 = 陆地连通分量数
        int islands = land;
        // 减去被合并的次数
        std::vector<bool> seen(rows * cols, false);
        int unique_roots = 0;
        for (int i = 0; i < rows; ++i)
            for (int j = 0; j < cols; ++j)
                if (grid[i][j] && !seen[uf.find(i * cols + j)]) {
                    seen[uf.find(i * cols + j)] = true;
                    ++unique_roots;
                }

        std::cout << "  islands = " << unique_roots << "\n";  // 3
    }

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- 路径压缩：`find` 时将节点直接挂到根上，下次 O(1) 查找
- 按秩合并：矮树接到高树，保持树的平衡
- 两个优化结合后，单次操作接近 O(1)（实际是 O(α(n))）
- 典型应用：连通性判断、最小生成树 (Kruskal)、社交网络好友圈

---

## 练习6：KMP 字符串匹配

**考点**：next 数组（部分匹配表）、O(n+m) 匹配、next 数组构建

```cpp
// kmp.cpp
// g++ -std=c++17 -o kmp kmp.cpp
#include <iostream>
#include <string>
#include <vector>
#include <cassert>

class KMP {
    std::string pattern_;
    std::vector<int> next_;  // 部分匹配表（前缀函数）

    // 构建 next 数组
    void build_next() {
        int m = pattern_.size();
        next_.resize(m, 0);
        int j = 0;  // 前缀末尾
        for (int i = 1; i < m; ++i) {
            while (j > 0 && pattern_[i] != pattern_[j])
                j = next_[j - 1];  // 回退
            if (pattern_[i] == pattern_[j])
                ++j;
            next_[i] = j;
        }
    }

public:
    explicit KMP(std::string pattern) : pattern_(std::move(pattern)) {
        build_next();
    }

    // 查找所有匹配位置
    std::vector<int> find_all(const std::string& text) const {
        std::vector<int> positions;
        int n = text.size(), m = pattern_.size();
        int j = 0;  // 模式串指针

        for (int i = 0; i < n; ++i) {
            while (j > 0 && text[i] != pattern_[j])
                j = next_[j - 1];  // 利用 next 数组跳过
            if (text[i] == pattern_[j])
                ++j;
            if (j == m) {
                positions.push_back(i - m + 1);  // 找到匹配
                j = next_[j - 1];  // 继续寻找下一个
            }
        }
        return positions;
    }

    // 查找第一个匹配位置
    int find_first(const std::string& text) const {
        auto all = find_all(text);
        return all.empty() ? -1 : all[0];
    }

    // 打印 next 数组（调试用）
    void print_next() const {
        std::cout << "  pattern: ";
        for (char c : pattern_) std::cout << c << " ";
        std::cout << "\n  next:    ";
        for (int v : next_) std::cout << v << " ";
        std::cout << "\n";
    }
};

int main() {
    std::cout << "=== KMP ===\n";

    // 1. 基本匹配
    {
        KMP kmp("ABAB");
        kmp.print_next();  // next: [0, 0, 1, 2]

        auto pos = kmp.find_all("ABABDABABABABC");
        std::cout << "  matches at: ";
        for (int p : pos) std::cout << p << " ";
        std::cout << "\n";
        // 预期：0, 5, 7
    }

    // 2. next 数组验证
    {
        KMP kmp("AABAAAB");
        kmp.print_next();  // next: [0, 1, 0, 1, 2, 2, 3]
    }

    // 3. 无匹配
    {
        KMP kmp("XYZ");
        auto pos = kmp.find_all("ABCDEFG");
        assert(pos.empty());
        std::cout << "  no match test passed\n";
    }

    // 4. 全匹配
    {
        KMP kmp("AA");
        auto pos = kmp.find_all("AAAA");
        std::cout << "  'AA' in 'AAAA': ";
        for (int p : pos) std::cout << p << " ";
        std::cout << "\n";  // 0, 1, 2
        assert(pos.size() == 3);
    }

    // 5. 性能优势说明
    {
        std::cout << "\n  暴力匹配: O(n*m) 每次失配回退到起点+1\n";
        std::cout << "  KMP:      O(n+m) 利用已匹配信息跳过\n";
        std::cout << "  next[j]:  pattern[0..j] 的最长相等前后缀长度\n";
    }

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- next 数组含义：`next[j]` = `pattern[0..j]` 的最长相等前后缀长度
- 失配时模式串指针跳到 `next[j-1]`，不需要回退文本指针
- 总时间复杂度 O(n+m)，因为 i 只前进不回退
- KMP 的核心难点在于理解 next 数组的构建过程
