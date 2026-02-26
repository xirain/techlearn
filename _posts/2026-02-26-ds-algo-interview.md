---
title: 数据结构与算法面试题 —— 从底层原理到手撕代码的深度问答
description: 覆盖数组、链表、栈、队列、哈希表、树、堆、图八大数据结构，排序、查找、动态规划、回溯、贪心五大算法体系，附 C++ STL 对照和高频手撕题
date: 2026-02-26
categories: [编程语言]
tags: [数据结构, 算法, 面试, c++, stl, 排序, 动态规划, 树, 图, 哈希表]
---

数据结构和算法是面试的"硬通货"——不管你做什么方向，面试官都会考。但很多人的复习方式是"刷 500 道 LeetCode"，刷完也记不住几道。

这篇文章换个思路：**先把底层原理讲透（"为什么"），再给面试回答模板（"怎么答"），最后附手撕代码（"怎么写"）**。理解了原理，题目换个壳你也能做出来。

------

## 第一部分：数据结构

### Q1：数组和链表的区别？什么时候用哪个？

**记忆点：数组连续内存随机访问 O(1) 但插删 O(n)；链表非连续内存插删 O(1) 但访问 O(n)。数组缓存友好，链表灵活。**

```
              数组                    链表
内存          连续                    非连续（节点通过指针串联）
随机访问      O(1) arr[i]             O(n) 要从头遍历
头部插入      O(n) 要移动后续元素      O(1) 改指针
尾部插入      O(1) 摊销（动态数组）    O(1)（如果有尾指针）
中间插入      O(n)                    O(1)（已知位置时）
删除          O(n)                    O(1)（已知位置时）
内存开销      紧凑（只存数据）         每个节点额外存指针（8字节/指针）
缓存友好      ✅ 连续内存预取高效      ❌ 随机跳转 cache miss

C++ STL 对应：
  数组 → std::vector（动态数组，最常用）
         std::array（固定大小数组）
  链表 → std::list（双向链表）
         std::forward_list（单向链表）

选择原则：
  ├── 频繁随机访问、很少插删 → vector
  ├── 频繁在中间/头部插删 → list
  ├── 不确定 → 默认 vector（缓存友好性带来的优势通常碾压链表）
  └── 实际工程中 vector 用得远比 list 多
```

### Q2：vector 的底层原理？扩容机制？

**记忆点：vector 底层是动态数组，size 是当前元素数，capacity 是已分配空间。满了时扩容为原来的 2 倍（MSVC）或 1.5 倍（GCC），扩容需要重新分配+拷贝所有元素，所以 push_back 摊销 O(1)。**

```
vector 的内存布局：

  [begin]                    [end]          [end_of_storage]
    │                          │                │
    ▼                          ▼                ▼
    ┌──┬──┬──┬──┬──┬──────────────────────────┐
    │10│20│30│40│50│        未使用空间          │
    └──┴──┴──┴──┴──┴──────────────────────────┘
    ←── size = 5 ──→
    ←────────── capacity = 10 ────────────────→

扩容过程（capacity 不够时）：
  1. 分配新内存（旧 capacity × 增长因子）
  2. 把旧元素移动/拷贝到新内存
  3. 释放旧内存
  4. 更新指针

  这就是为什么：
  ├── push_back 均摊 O(1)，最坏 O(n)
  ├── 扩容后旧的迭代器/指针全部失效！
  └── 如果能预知大小，先 reserve() 避免扩容

面试追问：为什么增长因子是 1.5 或 2？
  2 倍：简单，扩容次数最少，但内存浪费最多可达 50%
  1.5 倍：浪费少，但扩容更频繁
  关键：旧内存无法被后续扩容复用
    假设从 1 开始扩容：1, 2, 4, 8, 16, 32, 64...
    当需要 64 时，前面释放的 1+2+4+8+16+32=63 < 64，无法复用
    用 1.5 倍：1, 1, 2, 3, 4, 6, 9, 13...
    1+1+2+3+4+6 = 17 > 13，旧内存可以复用！
```

### Q3：哈希表的原理？解决冲突的方法？

**记忆点：哈希表 = 数组 + 哈希函数 + 冲突解决。哈希函数把 key 映射到数组下标。冲突解决主要两种：链地址法（每个桶挂链表）和开放寻址法（冲突了往后找空位）。**

```
哈希表工作原理：

  key "Alice" → hash("Alice") → 42 → 42 % 8 = 2 → 存到 bucket[2]

  bucket 数组：
  [0]  → null
  [1]  → null
  [2]  → ("Alice", 90) → ("Charlie", 85)  ← 冲突！链地址法
  [3]  → ("Bob", 80)
  [4]  → null
  ...

冲突解决方案：

  ① 链地址法（Separate Chaining）—— std::unordered_map 用的
     每个桶是一个链表（或红黑树，Java HashMap 在链表长度 >8 时转红黑树）
     优点：简单，删除方便
     缺点：链表长时退化为 O(n)

  ② 开放寻址法（Open Addressing）
     冲突了就往后找空位
     ├── 线性探测：hash+1, hash+2, hash+3... （容易聚集）
     ├── 二次探测：hash+1², hash+2², hash+3²... （减少聚集）
     └── 双重哈希：hash1 + i*hash2 （最均匀）
     优点：缓存友好（数据在连续内存中）
     缺点：删除复杂（需要惰性删除标记）

  装载因子 = 元素数 / 桶数
  装载因子越高 → 冲突越多 → 性能越差
  通常 > 0.75 就扩容（rehash）
  扩容 = 新建更大的数组 + 把所有元素重新哈希

C++ STL：
  std::unordered_map  → 链地址法
  std::unordered_set  → 链地址法
  时间复杂度：平均 O(1)，最坏 O(n)
```

### Q4：红黑树是什么？为什么 STL 的 map/set 用它？

**记忆点：红黑树是自平衡二叉搜索树，通过"红黑着色+旋转"保证树高不超过 2log(n)。比 AVL 树旋转次数少（插入最多 2 次旋转），适合频繁插删的场景。**

```
红黑树的五条性质：
  1. 每个节点是红色或黑色
  2. 根节点是黑色
  3. 叶子节点（NIL）是黑色
  4. 红色节点的子节点必须是黑色（不能两个红连续）
  5. 从根到每个叶子的路径上，黑色节点数量相同（黑高相等）

  这五条性质保证了：最长路径不超过最短路径的 2 倍
  → 树高 ≤ 2log₂(n+1) → 查找/插入/删除都是 O(log n)

红黑树 vs AVL 树 vs B+树：
                红黑树          AVL 树          B+树
平衡性         宽松（2倍）     严格（高度差≤1） N叉平衡
查找           O(log n)       O(log n) 略快    O(log_m n)
插入旋转       最多 2 次       最多 2 次        不旋转，分裂
删除旋转       最多 3 次       O(log n) 次      不旋转，合并
用途           STL map/set    数据库索引(少见)  数据库/文件系统

为什么 STL 选红黑树不选 AVL？
  → STL 的 map/set 需要频繁插删
  → AVL 删除时可能旋转 O(log n) 次，红黑树最多 3 次
  → 红黑树在插删频繁时综合性能更好
```

### Q5：堆（Heap）的原理？和优先队列的关系？

**记忆点：堆是完全二叉树，用数组存储。最大堆：父 ≥ 子；最小堆：父 ≤ 子。插入和删除堆顶都是 O(log n)。C++ 的 priority_queue 底层就是堆。**

```
最大堆的数组存储：

  逻辑结构（树）：          数组存储：
        90                  [90, 80, 70, 50, 60, 30, 40]
       /  \                  0   1   2   3   4   5   6
      80   70
     / \   / \
    50 60 30 40

  父子关系（0-indexed）：
    父节点：(i - 1) / 2
    左孩子：2 * i + 1
    右孩子：2 * i + 2

堆的核心操作：

  上浮（Sift Up）—— 插入新元素后调整：
    把新元素放在末尾 → 和父节点比较 → 比父大就交换 → 重复
    时间：O(log n)

  下沉（Sift Down）—— 删除堆顶后调整：
    把末尾元素放到堆顶 → 和较大的孩子比较 → 比孩子小就交换 → 重复
    时间：O(log n)

  建堆（Heapify）：
    从最后一个非叶子节点开始，依次下沉
    时间：O(n)！不是 O(n log n)！

C++ STL：
  std::priority_queue<int>  → 最大堆（默认）
  std::priority_queue<int, vector<int>, greater<int>>  → 最小堆
  std::make_heap / push_heap / pop_heap → 在 vector 上操作堆

典型应用：
  ├── Top-K 问题（维护大小为 K 的堆）
  ├── 堆排序
  ├── 合并 K 个有序链表
  ├── 中位数（一个最大堆 + 一个最小堆）
  └── Dijkstra 最短路径
```

### Q6：栈和队列的应用场景？

**记忆点：栈 LIFO（后进先出）——函数调用、括号匹配、表达式求值、DFS；队列 FIFO（先进先出）——BFS、任务调度、缓冲区。**

```
栈的经典应用：
  ├── 函数调用栈（局部变量、返回地址）
  ├── 括号匹配：( [ { } ] ) → 遇左括号压栈，遇右括号弹栈匹配
  ├── 表达式求值：中缀转后缀（逆波兰）
  ├── 单调栈：下一个更大/更小元素
  ├── DFS（深度优先搜索）的迭代实现
  └── 撤销操作（Ctrl+Z）

队列的经典应用：
  ├── BFS（广度优先搜索）
  ├── 任务调度（FIFO 调度队列）
  ├── 滑动窗口最大值（单调队列/双端队列）
  ├── 消息队列
  └── 缓冲区（生产者-消费者模型）

C++ STL：
  std::stack<T>    → 默认基于 deque
  std::queue<T>    → 默认基于 deque
  std::deque<T>    → 双端队列（头尾都能 O(1) 插删）

面试高频：用两个栈实现队列 / 用两个队列实现栈
```

### Q7：图的存储方式？邻接矩阵 vs 邻接表？

**记忆点：邻接矩阵查边 O(1) 但空间 O(V²)，适合稠密图；邻接表空间 O(V+E)，适合稀疏图（大多数实际图都是稀疏的）。**

```
邻接矩阵：
  V 个顶点 → V×V 的二维数组
  matrix[i][j] = 1 表示 i→j 有边

  0  1  2  3
  ┌──┬──┬──┬──┐
0 │ 0│ 1│ 1│ 0│     0 → 1
1 │ 0│ 0│ 1│ 0│     0 → 2
2 │ 0│ 0│ 0│ 1│     1 → 2
3 │ 0│ 0│ 0│ 0│     2 → 3
  └──┴──┴──┴──┘

邻接表：
  每个顶点存一个链表/vector，记录它的邻居
  0: [1, 2]
  1: [2]
  2: [3]
  3: []

对比：
              邻接矩阵          邻接表
空间          O(V²)             O(V+E)
查边          O(1)              O(度)
遍历邻居      O(V)              O(度)
加边          O(1)              O(1)
适合          稠密图(E≈V²)       稀疏图(E<<V²)
实现          vector<vector<int>>   vector<vector<int>> 或 unordered_map
```

```cpp
// C++ 邻接表的常用写法
// 方式 1：vector<vector<int>>（最常用）
int n = 5;
vector<vector<int>> adj(n);
adj[0].push_back(1);  // 0 → 1
adj[0].push_back(2);  // 0 → 2

// 方式 2：带权图
vector<vector<pair<int,int>>> adj(n);  // (邻居, 权重)
adj[0].push_back({1, 10});  // 0 →(权重10)→ 1
```

------

## 第二部分：排序算法

### Q8：常见排序算法的比较？

**记忆点：快排平均最快 O(n log n) 但最坏 O(n²)；归并稳定 O(n log n) 但需要额外空间；堆排原地 O(n log n) 但缓存不友好。小数据量直接插入排序。**

```
算法          平均       最坏       空间     稳定   特点
─────────────────────────────────────────────────────
冒泡排序      O(n²)     O(n²)      O(1)    ✅     教学用，实际不用
选择排序      O(n²)     O(n²)      O(1)    ❌     每轮选最小
插入排序      O(n²)     O(n²)      O(1)    ✅     小数据量很快，近乎有序时 O(n)
─────────────────────────────────────────────────────
快速排序      O(nlogn)  O(n²)      O(logn) ❌     实际最快，缓存友好
归并排序      O(nlogn)  O(nlogn)   O(n)    ✅     稳定，适合外排序/链表排序
堆排序        O(nlogn)  O(nlogn)   O(1)    ❌     原地，但缓存不友好
─────────────────────────────────────────────────────
计数排序      O(n+k)    O(n+k)     O(k)    ✅     整数，范围 k 不大时
基数排序      O(d·n)    O(d·n)     O(n)    ✅     整数，d 是位数
桶排序        O(n)      O(n²)      O(n)    ✅     均匀分布时
─────────────────────────────────────────────────────

C++ STL：
  std::sort()       → 内省排序（快排+堆排+插入排序的混合）
  std::stable_sort() → 归并排序（稳定）
  std::partial_sort() → 堆排序（只排前 K 个）
```

### Q9：快速排序的原理？怎么优化？

**记忆点：选一个 pivot，把比它小的放左边、大的放右边（分区），然后递归处理左右两部分。最坏情况出现在每次 pivot 选到最大/最小值。优化：随机选 pivot、三数取中、小区间用插入排序。**

```cpp
// 基础快排
void quickSort(vector<int>& arr, int left, int right) {
    if (left >= right) return;

    int pivot = arr[left + (right - left) / 2];  // 取中间元素作 pivot
    int i = left, j = right;

    while (i <= j) {
        while (arr[i] < pivot) i++;
        while (arr[j] > pivot) j--;
        if (i <= j) {
            swap(arr[i], arr[j]);
            i++;
            j--;
        }
    }

    quickSort(arr, left, j);
    quickSort(arr, i, right);
}
```

```
快排的优化手段：
  ├── 随机 pivot：避免最坏情况 O(n²)
  │   int idx = left + rand() % (right - left + 1);
  │   swap(arr[idx], arr[left]);
  ├── 三数取中：取 left, mid, right 三个数的中位数
  ├── 小区间切换插入排序：区间 < 16 时用插入排序更快
  ├── 三路划分：处理大量重复元素
  │   [< pivot | == pivot | > pivot]
  └── 尾递归优化：先递归短的一半

面试追问：为什么快排比归并快（同样 O(nlogn)）？
  → 快排是原地排序，内存访问连续，缓存友好
  → 归并排序需要额外 O(n) 空间和拷贝
  → 快排的常数因子更小
```

### Q10：归并排序的原理？

**记忆点：分治——把数组对半分，递归排序左右两半，然后合并两个有序数组。合并是 O(n)，递归深度 O(log n)，总共 O(n log n)。稳定排序。**

```cpp
void mergeSort(vector<int>& arr, int left, int right) {
    if (left >= right) return;

    int mid = left + (right - left) / 2;
    mergeSort(arr, left, mid);
    mergeSort(arr, mid + 1, right);

    // 合并两个有序区间 [left, mid] 和 [mid+1, right]
    vector<int> temp;
    int i = left, j = mid + 1;
    while (i <= mid && j <= right) {
        if (arr[i] <= arr[j]) temp.push_back(arr[i++]);  // ≤ 保证稳定性
        else temp.push_back(arr[j++]);
    }
    while (i <= mid) temp.push_back(arr[i++]);
    while (j <= right) temp.push_back(arr[j++]);

    for (int k = 0; k < temp.size(); k++) {
        arr[left + k] = temp[k];
    }
}
```

```
归并排序的特殊用途：
  ├── 链表排序（链表归并不需要额外空间！用 slow/fast 找中点）
  ├── 外部排序（数据太大放不进内存时，分块排序后归并）
  ├── 求逆序对数量（归并时统计）
  └── 需要稳定排序时的首选
```

------

## 第三部分：查找算法

### Q11：二分查找及其变体？

**记忆点：有序数组中查找，每次排除一半，O(log n)。关键是边界处理——left < right 还是 left <= right，返回 left 还是 right。**

```cpp
// 标准二分：查找 target 是否存在
int binarySearch(vector<int>& arr, int target) {
    int left = 0, right = arr.size() - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;  // 防溢出
        if (arr[mid] == target) return mid;
        else if (arr[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;  // 没找到
}

// 变体 1：查找第一个 >= target 的位置（lower_bound）
int lowerBound(vector<int>& arr, int target) {
    int left = 0, right = arr.size();
    while (left < right) {
        int mid = left + (right - left) / 2;
        if (arr[mid] < target) left = mid + 1;
        else right = mid;
    }
    return left;
}

// 变体 2：查找第一个 > target 的位置（upper_bound）
int upperBound(vector<int>& arr, int target) {
    int left = 0, right = arr.size();
    while (left < right) {
        int mid = left + (right - left) / 2;
        if (arr[mid] <= target) left = mid + 1;
        else right = mid;
    }
    return left;
}
```

```
C++ STL 对应：
  std::lower_bound(begin, end, target)  → 第一个 >= target
  std::upper_bound(begin, end, target)  → 第一个 > target
  std::binary_search(begin, end, target) → 是否存在

二分查找的扩展应用（面试高频）：
  ├── 旋转排序数组中查找
  ├── 在排序矩阵中查找
  ├── 求平方根（二分逼近）
  ├── 找峰值元素
  ├── "能力检测"型二分：最小化最大值、最大化最小值
  └── 记住：只要能把问题转化为"有序 + 排除一半"就能用二分
```

### Q12：BFS 和 DFS 的区别和实现？

**记忆点：DFS 用栈（或递归），走到底再回头，适合路径/连通性问题；BFS 用队列，逐层扩展，适合最短路径问题。**

```cpp
// DFS —— 递归（最直觉）
void dfs(vector<vector<int>>& adj, int node, vector<bool>& visited) {
    visited[node] = true;
    // 处理 node
    for (int neighbor : adj[node]) {
        if (!visited[neighbor]) {
            dfs(adj, neighbor, visited);
        }
    }
}

// DFS —— 迭代（用栈）
void dfsIterative(vector<vector<int>>& adj, int start) {
    vector<bool> visited(adj.size(), false);
    stack<int> s;
    s.push(start);

    while (!s.empty()) {
        int node = s.top(); s.pop();
        if (visited[node]) continue;
        visited[node] = true;
        // 处理 node
        for (int neighbor : adj[node]) {
            if (!visited[neighbor]) s.push(neighbor);
        }
    }
}

// BFS —— 用队列
void bfs(vector<vector<int>>& adj, int start) {
    vector<bool> visited(adj.size(), false);
    queue<int> q;
    q.push(start);
    visited[start] = true;

    while (!q.empty()) {
        int node = q.front(); q.pop();
        // 处理 node
        for (int neighbor : adj[node]) {
            if (!visited[neighbor]) {
                visited[neighbor] = true;
                q.push(neighbor);
            }
        }
    }
}
```

```
BFS vs DFS 选择：
  最短路径（无权图）→ BFS
  所有路径/排列组合 → DFS + 回溯
  连通性判断        → BFS 或 DFS 都行
  拓扑排序          → BFS（Kahn 算法）或 DFS
  二叉树层序遍历    → BFS
  二叉树前/中/后序  → DFS
```

------

## 第四部分：动态规划

### Q13：动态规划的核心思想？怎么判断一道题该用 DP？

**记忆点：DP = 记忆化的穷举。如果一个问题有"重叠子问题"和"最优子结构"，就可以用 DP。做法：定义状态 → 写状态转移方程 → 确定初始值和遍历顺序。**

```
判断是否用 DP 的三个特征：
  1. 重叠子问题：同一个子问题被多次计算
     例：fib(5) = fib(4) + fib(3)，fib(4) = fib(3) + fib(2)
     fib(3) 被计算了两次

  2. 最优子结构：大问题的最优解包含子问题的最优解
     例：最短路径的子路径也是最短的

  3. 无后效性：当前状态确定后，未来的决策不受过去的影响
     例：到达 (i,j) 后，从 (i,j) 到终点的最短路径和之前怎么到 (i,j) 无关

DP 解题模板：
  Step 1：定义状态 dp[i] 或 dp[i][j] 表示什么
  Step 2：写出状态转移方程
  Step 3：确定初始条件（base case）
  Step 4：确定遍历顺序（确保计算 dp[i] 时依赖的 dp[j] 已经算过）
  Step 5：（可选）空间优化（滚动数组）
```

### Q14：经典 DP 题解析

**爬楼梯 —— DP 入门**

```
Q: 一次可以爬 1 或 2 级台阶，到第 n 级有多少种方法？

状态：dp[i] = 到第 i 级的方法数
转移：dp[i] = dp[i-1] + dp[i-2]（从 i-1 爬 1 级 或 从 i-2 爬 2 级）
初始：dp[0] = 1, dp[1] = 1
```

```cpp
int climbStairs(int n) {
    if (n <= 1) return 1;
    int prev2 = 1, prev1 = 1;  // 空间优化：只需记住前两个
    for (int i = 2; i <= n; i++) {
        int curr = prev1 + prev2;
        prev2 = prev1;
        prev1 = curr;
    }
    return prev1;
}
```

**背包问题 —— DP 的灵魂**

```
Q: N 个物品，每个有重量 w[i] 和价值 v[i]，背包容量 W，求最大价值。

0-1 背包（每个物品只能选一次）：
  状态：dp[i][j] = 前 i 个物品，容量 j 时的最大价值
  转移：dp[i][j] = max(dp[i-1][j],              // 不选第 i 个
                       dp[i-1][j-w[i]] + v[i])   // 选第 i 个
  初始：dp[0][*] = 0
```

```cpp
int knapsack01(vector<int>& w, vector<int>& v, int W) {
    int n = w.size();
    // 空间优化：一维 DP（逆序遍历容量！）
    vector<int> dp(W + 1, 0);
    for (int i = 0; i < n; i++) {
        for (int j = W; j >= w[i]; j--) {  // 逆序！保证每个物品只选一次
            dp[j] = max(dp[j], dp[j - w[i]] + v[i]);
        }
    }
    return dp[W];
}
```

```
为什么 0-1 背包要逆序遍历容量？
  正序：dp[j-w[i]] 可能已经被本轮更新过
       → 相当于同一个物品用了多次 → 变成完全背包了
  逆序：dp[j-w[i]] 还是上一轮的值
       → 保证每个物品只用一次

完全背包（每个物品可以选无限次）：
  → 只需要把内层循环改为正序！
  for (int j = w[i]; j <= W; j++)  // 正序
```

**最长公共子序列 (LCS)**

```
Q: 两个字符串的最长公共子序列长度。

状态：dp[i][j] = text1[0..i-1] 和 text2[0..j-1] 的 LCS 长度
转移：
  if text1[i-1] == text2[j-1]:
    dp[i][j] = dp[i-1][j-1] + 1       // 相同字符，都取
  else:
    dp[i][j] = max(dp[i-1][j], dp[i][j-1])  // 跳过其中一个
```

```cpp
int longestCommonSubsequence(string& a, string& b) {
    int m = a.size(), n = b.size();
    vector<vector<int>> dp(m + 1, vector<int>(n + 1, 0));

    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            if (a[i-1] == b[j-1]) {
                dp[i][j] = dp[i-1][j-1] + 1;
            } else {
                dp[i][j] = max(dp[i-1][j], dp[i][j-1]);
            }
        }
    }
    return dp[m][n];
}
```

### Q15：DP 的常见类型和套路？

**记忆点：按状态定义分类——线性 DP、区间 DP、树形 DP、状压 DP、数位 DP。面试 80% 是线性 DP 和背包变形。**

```
常见 DP 类型：

① 线性 DP（最常考）
   状态沿一个维度递推
   ├── 爬楼梯 / 斐波那契
   ├── 最长递增子序列（LIS）
   ├── 最大子数组和
   └── 打家劫舍

② 背包 DP
   ├── 0-1 背包：每个物品选一次
   ├── 完全背包：每个物品选无限次
   ├── 多重背包：每个物品有数量限制
   └── 变形：目标和、零钱兑换、分割等和子集

③ 二维 DP / 网格 DP
   ├── 最小路径和
   ├── 不同路径
   └── 编辑距离

④ 区间 DP
   ├── 戳气球
   ├── 矩阵链乘法
   └── 最长回文子序列

⑤ 树形 DP
   ├── 二叉树的直径
   ├── 树的最大路径和
   └── 打家劫舍 III

⑥ 状态压缩 DP
   用二进制表示状态
   ├── 旅行商问题（TSP）
   └── 位运算优化状态
```

------

## 第五部分：经典算法思想

### Q16：贪心算法的核心？和 DP 什么区别？

**记忆点：贪心每一步选当前最优，不回头；DP 考虑所有子问题再选全局最优。贪心更快但只在满足"贪心选择性质"时正确。**

```
贪心 vs 动态规划：
  贪心：局部最优 → 希望导致全局最优（不一定，需要证明）
  DP：  考虑所有可能 → 保证全局最优（一定正确）

  例子：找零钱
    硬币 [1, 5, 10, 25]，找 41 分
    贪心：25 + 10 + 5 + 1 = 4 枚 ✅ 正好是最优
    硬币 [1, 3, 4]，找 6 分
    贪心：4 + 1 + 1 = 3 枚 ❌ 最优是 3 + 3 = 2 枚

经典贪心题：
  ├── 活动选择（按结束时间排序）
  ├── 跳跃游戏
  ├── 分配糖果
  ├── 区间调度（无重叠区间）
  ├── 加油站
  └── Huffman 编码
```

### Q17：回溯算法的模板？

**记忆点：回溯 = DFS + 剪枝。在决策树上穷举所有可能，走不通就回退（撤销选择）。模板：选择列表 → 做选择 → 递归 → 撤销选择。**

```cpp
// 回溯模板
void backtrack(路径, 选择列表) {
    if (满足结束条件) {
        result.push_back(路径);
        return;
    }

    for (选择 : 选择列表) {
        if (不合法) continue;   // 剪枝
        做选择;                  // 路径.push_back(选择)
        backtrack(路径, 选择列表);
        撤销选择;                // 路径.pop_back()
    }
}
```

```cpp
// 实例：全排列
void permute(vector<int>& nums, vector<int>& path,
             vector<bool>& used, vector<vector<int>>& result) {
    if (path.size() == nums.size()) {
        result.push_back(path);
        return;
    }

    for (int i = 0; i < nums.size(); i++) {
        if (used[i]) continue;          // 剪枝：已使用的跳过
        used[i] = true;                 // 做选择
        path.push_back(nums[i]);
        permute(nums, path, used, result);
        path.pop_back();                // 撤销选择
        used[i] = false;
    }
}
```

```
经典回溯题：
  ├── 全排列 / 全排列 II（有重复）
  ├── 子集 / 组合
  ├── N 皇后
  ├── 数独求解
  ├── 单词搜索
  ├── 括号生成
  └── 电话号码的字母组合
```

### Q18：分治算法？

**记忆点：分治 = 分解 + 解决 + 合并。把大问题分成子问题，递归解决子问题，合并结果。归并排序和快排就是分治。**

```
分治的三步：
  1. Divide：把问题分成 2 个（或多个）子问题
  2. Conquer：递归解决子问题
  3. Combine：合并子问题的解

经典分治：
  ├── 归并排序：分两半 → 排序 → 合并
  ├── 快速排序：选 pivot 分区 → 分别排序
  ├── 二分查找：排除一半
  ├── 求最大子数组和（分治解法）
  ├── 求逆序对（归并排序变形）
  ├── 最近点对问题
  └── 大整数乘法（Karatsuba）

主定理（Master Theorem）—— 分析分治时间复杂度：
  T(n) = aT(n/b) + O(n^d)

  ├── a < b^d → O(n^d)          合并主导
  ├── a = b^d → O(n^d · log n)  平衡
  └── a > b^d → O(n^(log_b(a))) 递归主导

  归并排序：T(n) = 2T(n/2) + O(n) → a=2, b=2, d=1 → O(n log n)
```

------

## 第六部分：高频手撕题

### Q19：反转链表

**记忆点：三个指针 prev/curr/next，每次把 curr->next 指向 prev，然后三个都前进一步。**

```cpp
ListNode* reverseList(ListNode* head) {
    ListNode* prev = nullptr;
    ListNode* curr = head;

    while (curr) {
        ListNode* next = curr->next;  // 先保存下一个
        curr->next = prev;            // 反转指针
        prev = curr;                  // prev 前进
        curr = next;                  // curr 前进
    }

    return prev;  // prev 现在是新的头
}
```

```
图示：
  原始：1 → 2 → 3 → 4 → null

  第 1 步：null ← 1   2 → 3 → 4 → null
                prev curr

  第 2 步：null ← 1 ← 2   3 → 4 → null
                     prev curr

  第 3 步：null ← 1 ← 2 ← 3   4 → null
                          prev curr

  第 4 步：null ← 1 ← 2 ← 3 ← 4
                               prev  curr=null

  返回 prev = 4
```

### Q20：判断链表是否有环

**记忆点：快慢指针。快指针每次走 2 步，慢指针每次走 1 步。如果有环，快的一定会追上慢的。**

```cpp
bool hasCycle(ListNode* head) {
    ListNode* slow = head;
    ListNode* fast = head;

    while (fast && fast->next) {
        slow = slow->next;
        fast = fast->next->next;
        if (slow == fast) return true;  // 相遇 = 有环
    }
    return false;  // fast 到头了 = 无环
}

// 追问：找到环的入口？
ListNode* detectCycle(ListNode* head) {
    ListNode* slow = head;
    ListNode* fast = head;

    while (fast && fast->next) {
        slow = slow->next;
        fast = fast->next->next;
        if (slow == fast) {
            // 相遇后：slow 回到头部，两个都走 1 步，再次相遇就是入口
            slow = head;
            while (slow != fast) {
                slow = slow->next;
                fast = fast->next;
            }
            return slow;
        }
    }
    return nullptr;
}
```

### Q21：二叉树的遍历（递归+迭代）

**记忆点：前序（根左右）、中序（左根右）、后序（左右根）、层序（BFS）。递归简单但要能写迭代版。**

```cpp
// 前序遍历 —— 递归
void preorder(TreeNode* root, vector<int>& result) {
    if (!root) return;
    result.push_back(root->val);  // 根
    preorder(root->left, result);  // 左
    preorder(root->right, result); // 右
}

// 前序遍历 —— 迭代（栈）
vector<int> preorderIterative(TreeNode* root) {
    vector<int> result;
    stack<TreeNode*> s;
    if (root) s.push(root);

    while (!s.empty()) {
        TreeNode* node = s.top(); s.pop();
        result.push_back(node->val);
        // 先右后左（因为栈是后进先出，先进的右边后处理）
        if (node->right) s.push(node->right);
        if (node->left) s.push(node->left);
    }
    return result;
}

// 中序遍历 —— 迭代
vector<int> inorderIterative(TreeNode* root) {
    vector<int> result;
    stack<TreeNode*> s;
    TreeNode* curr = root;

    while (curr || !s.empty()) {
        while (curr) {          // 一路向左
            s.push(curr);
            curr = curr->left;
        }
        curr = s.top(); s.pop();
        result.push_back(curr->val);  // 访问
        curr = curr->right;           // 转右子树
    }
    return result;
}

// 层序遍历 —— BFS
vector<vector<int>> levelOrder(TreeNode* root) {
    vector<vector<int>> result;
    if (!root) return result;

    queue<TreeNode*> q;
    q.push(root);

    while (!q.empty()) {
        int size = q.size();
        vector<int> level;
        for (int i = 0; i < size; i++) {
            TreeNode* node = q.front(); q.pop();
            level.push_back(node->val);
            if (node->left) q.push(node->left);
            if (node->right) q.push(node->right);
        }
        result.push_back(level);
    }
    return result;
}
```

### Q22：最长递增子序列 (LIS)

**记忆点：dp[i] = 以 nums[i] 结尾的 LIS 长度。O(n²) 的 DP 解法面试够用。O(n log n) 解法用贪心+二分（维护一个"尾部最小值"数组）。**

```cpp
// O(n²) DP
int lengthOfLIS(vector<int>& nums) {
    int n = nums.size();
    vector<int> dp(n, 1);  // 每个元素自身就是长度 1 的子序列

    for (int i = 1; i < n; i++) {
        for (int j = 0; j < i; j++) {
            if (nums[j] < nums[i]) {
                dp[i] = max(dp[i], dp[j] + 1);
            }
        }
    }
    return *max_element(dp.begin(), dp.end());
}

// O(n log n) 贪心 + 二分
int lengthOfLIS_fast(vector<int>& nums) {
    vector<int> tails;  // tails[i] = 长度为 i+1 的 LIS 的最小末尾

    for (int num : nums) {
        auto it = lower_bound(tails.begin(), tails.end(), num);
        if (it == tails.end()) {
            tails.push_back(num);  // 比所有都大，延长 LIS
        } else {
            *it = num;  // 替换，让末尾尽可能小
        }
    }
    return tails.size();
}
```

### Q23：Top-K 问题

**记忆点：求最大的 K 个数用大小为 K 的最小堆；求最小的 K 个数用大小为 K 的最大堆。也可以用快速选择（Quick Select）O(n) 平均。**

```cpp
// 方法 1：最小堆（O(n log K)）
vector<int> topK(vector<int>& nums, int k) {
    // 最小堆（堆顶是最小的）
    priority_queue<int, vector<int>, greater<int>> minHeap;

    for (int num : nums) {
        minHeap.push(num);
        if (minHeap.size() > k) {
            minHeap.pop();  // 弹出最小的，留下的就是最大的 K 个
        }
    }

    vector<int> result;
    while (!minHeap.empty()) {
        result.push_back(minHeap.top());
        minHeap.pop();
    }
    return result;
}

// 方法 2：快速选择（O(n) 平均）
int partition(vector<int>& nums, int left, int right) {
    int pivot = nums[right];
    int i = left;
    for (int j = left; j < right; j++) {
        if (nums[j] >= pivot) {  // 降序分区
            swap(nums[i], nums[j]);
            i++;
        }
    }
    swap(nums[i], nums[right]);
    return i;
}

void quickSelect(vector<int>& nums, int left, int right, int k) {
    if (left >= right) return;
    int pos = partition(nums, left, right);
    if (pos == k) return;
    else if (pos < k) quickSelect(nums, pos + 1, right, k);
    else quickSelect(nums, left, pos - 1, k);
}
```

```
Top-K 方法对比：
              时间       空间     特点
排序          O(nlogn)   O(1)    最简单但最慢
最小堆        O(nlogK)   O(K)    适合数据流（在线算法）
快速选择      O(n) 平均  O(1)    最快但不保证有序
```

### Q24：合并 K 个有序链表

**记忆点：用最小堆存每个链表的头节点，每次取最小的出来，再把它的下一个节点放进堆。O(N log K)。**

```cpp
ListNode* mergeKLists(vector<ListNode*>& lists) {
    // 最小堆：按节点值排序
    auto cmp = [](ListNode* a, ListNode* b) {
        return a->val > b->val;
    };
    priority_queue<ListNode*, vector<ListNode*>, decltype(cmp)> pq(cmp);

    // 把每个链表的头节点放入堆
    for (auto head : lists) {
        if (head) pq.push(head);
    }

    ListNode dummy(0);
    ListNode* tail = &dummy;

    while (!pq.empty()) {
        ListNode* node = pq.top(); pq.pop();
        tail->next = node;
        tail = tail->next;
        if (node->next) pq.push(node->next);
    }

    return dummy.next;
}
```

### Q25：最短路径算法

**记忆点：单源最短路用 Dijkstra（非负权，O(E log V)）或 Bellman-Ford（可负权，O(VE)）；全源最短路用 Floyd（O(V³)）。**

```cpp
// Dijkstra —— 优先队列优化
vector<int> dijkstra(vector<vector<pair<int,int>>>& adj, int src) {
    int n = adj.size();
    vector<int> dist(n, INT_MAX);
    dist[src] = 0;

    // (距离, 节点)
    priority_queue<pair<int,int>, vector<pair<int,int>>, greater<>> pq;
    pq.push({0, src});

    while (!pq.empty()) {
        auto [d, u] = pq.top(); pq.pop();
        if (d > dist[u]) continue;  // 已经有更短的路径了

        for (auto [v, w] : adj[u]) {
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                pq.push({dist[v], v});
            }
        }
    }
    return dist;
}
```

```
最短路径算法选择：
  ├── 无权图 → BFS（O(V+E)）
  ├── 非负权、单源 → Dijkstra（O(E log V)）
  ├── 有负权、单源 → Bellman-Ford（O(VE)）
  ├── 有负权、检测负环 → Bellman-Ford
  └── 全源最短路 → Floyd-Warshall（O(V³)）
```

------

## 第七部分：STL 数据结构速查

### Q26：C++ STL 容器一览

**记忆点：sequence 容器保持插入顺序（vector/deque/list）；associative 容器按 key 排序（map/set）；unordered 容器用哈希表（unordered_map/unordered_set）。**

```
容器              底层结构       查找      插入      删除      有序
─────────────────────────────────────────────────────────────────
vector            动态数组       O(n)      O(1)*尾   O(n)      否
deque             分段数组       O(n)      O(1)头尾  O(n)      否
list              双向链表       O(n)      O(1)      O(1)      否
forward_list      单向链表       O(n)      O(1)      O(1)      否
─────────────────────────────────────────────────────────────────
set               红黑树         O(logn)   O(logn)   O(logn)   ✅
map               红黑树         O(logn)   O(logn)   O(logn)   ✅
multiset          红黑树         O(logn)   O(logn)   O(logn)   ✅
multimap          红黑树         O(logn)   O(logn)   O(logn)   ✅
─────────────────────────────────────────────────────────────────
unordered_set     哈希表         O(1)*     O(1)*     O(1)*     ❌
unordered_map     哈希表         O(1)*     O(1)*     O(1)*     ❌
─────────────────────────────────────────────────────────────────
stack             适配器(deque)  —         O(1)      O(1)      —
queue             适配器(deque)  —         O(1)      O(1)      —
priority_queue    堆(vector)     O(1)top   O(logn)   O(logn)   部分

* = 平均情况，最坏 O(n)

怎么选：
  ├── 随机访问多 → vector
  ├── 需要有序 + 范围查询 → set/map（红黑树）
  ├── 只要查找快、不要求有序 → unordered_set/unordered_map
  ├── 头尾都要快速插入 → deque
  ├── 频繁在中间插删（且有迭代器）→ list
  └── Top-K / 优先级 → priority_queue
```

### Q27：迭代器失效总结

**记忆点：vector 插入/删除会导致插入/删除点之后的迭代器失效（扩容时全部失效）；map/set 只有被删除元素的迭代器失效；unordered 系列 rehash 时全部失效。**

```
vector：
  push_back → 未扩容：end() 失效；扩容：全部失效
  insert/erase → 插入/删除点之后全部失效

deque：
  头尾插入 → 迭代器失效但引用不失效
  中间插入/删除 → 全部失效

list：
  插入 → 不影响任何迭代器
  删除 → 只有被删除元素的迭代器失效

map/set：
  插入 → 不影响
  删除 → 只有被删除元素的迭代器失效

unordered_*：
  插入 → 可能触发 rehash → 全部失效
  删除 → 只有被删除元素失效（不触发 rehash）

安全的删除方式：
```

```cpp
// ❌ 错误：删除后迭代器失效
for (auto it = vec.begin(); it != vec.end(); ++it) {
    if (*it == target) vec.erase(it);  // it 失效了！下一次 ++it 是未定义行为
}

// ✅ 正确：erase 返回下一个有效迭代器
for (auto it = vec.begin(); it != vec.end(); ) {
    if (*it == target) it = vec.erase(it);
    else ++it;
}

// ✅ 也可以用 erase-remove 惯用法
vec.erase(remove(vec.begin(), vec.end(), target), vec.end());

// ✅ C++20 更简洁
std::erase(vec, target);
```

------

## 第八部分：复杂度分析

### Q28：时间复杂度怎么算？

**记忆点：看最深层循环的执行次数。常见复杂度排序：O(1) < O(log n) < O(n) < O(n log n) < O(n²) < O(2ⁿ) < O(n!)。**

```
常见代码模式 → 复杂度：

O(1)       常数操作：arr[i], hash.find(key)
O(log n)   每次减半：二分查找、平衡树操作
O(n)       单层循环：遍历数组
O(n log n) 排序：快排、归并排序
O(n²)      双层循环：冒泡排序、暴力两数之和
O(2ⁿ)      指数：所有子集、递归斐波那契（不记忆化）
O(n!)      阶乘：全排列

直觉判断法：
  n ≤ 10      → O(n!) 或 O(2ⁿ) 可以接受
  n ≤ 20      → O(2ⁿ) 可以
  n ≤ 1000    → O(n²) 可以
  n ≤ 10⁶     → O(n log n) 可以
  n ≤ 10⁸     → 只能 O(n)
  n > 10⁸     → 需要 O(log n) 或 O(1)
```

### Q29：空间复杂度？

**记忆点：额外使用的空间，不算输入本身。递归的空间复杂度要算调用栈深度。**

```
O(1)       原地操作：交换、双指针
O(log n)   递归调用栈深度：二分、快排（平均）
O(n)       额外数组：归并排序的临时数组、哈希表
O(n²)      二维 DP 表
O(2ⁿ)      记录所有子集

常见陷阱：
  递归的空间 = O(递归深度)
  快排：平均 O(log n)，最坏 O(n)（退化为链式递归）
  DFS：O(树高) 或 O(图的节点数)
```

------

## 面试做题策略

```
拿到一道算法题的思路：

Step 1：理解题意（5分钟内）
  ├── 输入输出是什么？
  ├── 数据范围是多少？（决定了时间复杂度上限）
  ├── 有没有特殊条件？（有序？正数？不重复？）
  └── 先想几个例子验证理解

Step 2：选择算法（先想暴力，再优化）
  ├── 暴力解法是什么？时间复杂度？
  ├── 能不能用哈希表空间换时间？
  ├── 有序 → 二分？双指针？
  ├── 最优值 → DP？贪心？
  ├── 排列组合 → 回溯？
  ├── 图/树 → BFS/DFS？
  └── 分治？

Step 3：和面试官沟通方案
  "我打算用 xxx 方法，时间 O(xxx)，空间 O(xxx)，可以吗？"
  不要闷头写代码！

Step 4：写代码
  ├── 先写框架（函数签名、主循环）
  ├── 再填细节
  ├── 注意边界：空数组、单元素、负数、溢出
  └── 变量名有意义

Step 5：测试
  ├── 用例子走一遍代码（dry run）
  ├── 测试边界情况
  └── 确认时间空间复杂度
```

------

## 速查表

```
数据结构选择：
  随机访问        → vector (O(1))
  有序 + 查找     → set/map (O(logn))
  纯查找          → unordered_set/map (O(1))
  先进先出        → queue
  后进先出        → stack
  优先级          → priority_queue

算法选择：
  有序查找        → 二分 O(logn)
  最短路径(无权)  → BFS O(V+E)
  最短路径(有权)  → Dijkstra O(ElogV)
  排序            → std::sort O(nlogn)
  最优解          → DP 或贪心
  所有解/排列     → 回溯

复杂度速记：
  二分             O(log n)
  排序             O(n log n)
  两数之和(哈希)   O(n)
  LIS              O(n²) 或 O(n log n)
  背包             O(n × W)
  全排列           O(n × n!)
  子集             O(n × 2ⁿ)

DP 四步法：
  1. 状态定义 dp[i] 是什么
  2. 转移方程 dp[i] = f(dp[j])
  3. 初始值 base case
  4. 遍历顺序（保证依赖的先算）
```

------

> 数据结构和算法不是背题，是练思维。理解了"为什么这个数据结构适合这个问题"，你就不再需要背 500 道题了。

> 本系列相关文章：
> - [现代 C++ 面试题](/techlearn/posts/modern-cpp-interview/) —— 语言特性
> - [锁、并发与内存模型面试题](/techlearn/posts/lock-concurrency-memory-model-interview/) —— 多线程
> - [网络编程与 IPC 面试题](/techlearn/posts/network-ipc-interview/) —— 网络
> - [用 TDD 驱动线程安全 LRU Cache](/techlearn/posts/thread-safe-lru-cache-tdd/) —— LRU 实战
