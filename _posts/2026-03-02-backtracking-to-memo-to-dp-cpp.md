---
title: 回溯代码如何“无痛”改成记忆化搜索，再改成迭代DP（C++模板对照）
description: 通过统一状态定义，把回溯DFS平滑升级为记忆化搜索，再进一步改写为自底向上迭代DP；附可复用C++模板、转换步骤与常见坑位
date: 2026-03-02
categories: [C++]
tags: [c++, 回溯, 记忆化搜索, 动态规划, dfs, 算法]
---

上一篇我们讲清了递归里“调用-返回-状态恢复”的机制。

这篇继续解决一个实战痛点：

> **怎么把“能跑但慢”的回溯代码，几乎不改思路地升级成记忆化搜索，再改成迭代 DP？**

很多同学卡在这里，不是不会写 DP，而是“感觉三种写法像三套体系”。

其实它们是一套体系的三个形态：

- 回溯/DFS：按决策树搜索；
- 记忆化搜索：DFS + 缓存重复子问题；
- 迭代 DP：把同样的状态转移，改成有顺序地填表。

---

## 1. 先说结论：三者的关系

一句话：

> **记忆化搜索 = 回溯里“返回值型 DFS” + 状态缓存。**

再进一步：

> **迭代 DP = 记忆化搜索的状态集合 + 显式计算顺序。**

所以“无痛改造”的前提只有一个：

## 2. 先把状态定义成“可复用”

你原始回溯若是这样：

- 参数里混了很多“路径细节”；
- 全局变量四处改；
- 当前状态无法唯一确定子问题。

那很难记忆化。

你需要把函数改成这类签名：

```cpp
int dfs(State s) // 返回“从状态s出发的最优值/方案数”
```

这叫**返回值型递归**，它最容易转成 DP。

### 判断“状态定义是否合格”的标准

状态 `s` 必须满足：

1. **唯一性**：同样的 `s`，结果永远相同；
2. **完备性**：只靠 `s` 就能决定下一步转移；
3. **可枚举性**：未来能映射到数组下标或有限集合（便于 DP）。

---

## 3. 一个完整例子：零钱兑换（最少硬币数）

题目：给定硬币面值 `coins`，每种可无限使用，求凑出 `amount` 的最少硬币数；不可达返回 `-1`。

这是最适合演示“三连改造”的题。

---

## 4. 第一步：回溯/朴素 DFS（有重复子问题）

先写最直观版本：

```cpp
#include <bits/stdc++.h>
using namespace std;

class SolutionBacktracking {
public:
    int coinChange(vector<int>& coins, int amount) {
        int ans = dfs(coins, amount);
        return ans >= INF ? -1 : ans;
    }

private:
    static constexpr int INF = 1e9;

    int dfs(const vector<int>& coins, int remain) {
        if (remain == 0) return 0;
        if (remain < 0) return INF;

        int best = INF;
        for (int c : coins) {
            int sub = dfs(coins, remain - c);
            if (sub != INF) best = min(best, sub + 1);
        }
        return best;
    }
};
```

### 问题在哪？

`dfs(remain)` 会被重复计算很多次。
例如 `remain=11` 时会反复进入 `dfs(10)`, `dfs(9)`, ...
时间复杂度接近指数级。

---

## 5. 第二步：无痛升级为记忆化搜索

你会发现：上面递归函数已经是 `dfs(remain)` 返回值型，太适合加缓存了。

只加三件事：

1. `memo[remain]` 存结果；
2. 先查缓存，命中直接返回；
3. 计算完写回缓存。

```cpp
#include <bits/stdc++.h>
using namespace std;

class SolutionMemo {
public:
    int coinChange(vector<int>& coins, int amount) {
        memo.assign(amount + 1, UNVISITED);
        int ans = dfs(coins, amount);
        return ans >= INF ? -1 : ans;
    }

private:
    static constexpr int INF = 1e9;
    static constexpr int UNVISITED = -2; // 与合法值区分
    vector<int> memo;

    int dfs(const vector<int>& coins, int remain) {
        if (remain == 0) return 0;
        if (remain < 0) return INF;

        if (memo[remain] != UNVISITED) return memo[remain];

        int best = INF;
        for (int c : coins) {
            int sub = dfs(coins, remain - c);
            if (sub != INF) best = min(best, sub + 1);
        }

        memo[remain] = best;
        return best;
    }
};
```

### 复杂度变化

- 时间：`O(amount * n)`，`n` 为硬币种类数；
- 空间：`O(amount)`（缓存 + 递归栈）。

为什么是 `O(amount * n)`？
因为每个 `remain` 最多算一次，每次枚举 `n` 种硬币。

---

## 6. 第三步：从记忆化搜索改成迭代 DP

现在看记忆化方程：

`f(remain) = min( f(remain - c) + 1 )`

这是“由小状态推大状态”的典型。
于是定义：

- `dp[x]`：凑成金额 `x` 的最少硬币数；
- 初值：`dp[0] = 0`，其他设 `INF`；
- 转移：`dp[x] = min(dp[x], dp[x-c] + 1)`（若 `x>=c`）。

```cpp
#include <bits/stdc++.h>
using namespace std;

class SolutionDP {
public:
    int coinChange(vector<int>& coins, int amount) {
        const int INF = 1e9;
        vector<int> dp(amount + 1, INF);
        dp[0] = 0;

        for (int x = 1; x <= amount; ++x) {
            for (int c : coins) {
                if (x >= c && dp[x - c] != INF) {
                    dp[x] = min(dp[x], dp[x - c] + 1);
                }
            }
        }

        return dp[amount] == INF ? -1 : dp[amount];
    }
};
```

这就是“同一状态方程，不同执行策略”：

- 记忆化：需要时才算（top-down）；
- 迭代 DP：按顺序全算（bottom-up）。

---

## 7. 三种写法模板对照（可直接套）

### 模板 A：返回值型 DFS（起点）

```cpp
int dfs(State s) {
    if (终止) return 边界值;

    int ans = 初始值; // min题设INF，max题设-INF，计数题设0
    for (Choice ch : choices(s)) {
        ans = merge(ans, dfs(next_state(s, ch)));
    }
    return ans;
}
```

### 模板 B：记忆化搜索

```cpp
unordered_map<State, int> memo; // 或 vector<int>

int dfs(State s) {
    if (终止) return 边界值;
    if (memo.count(s)) return memo[s];

    int ans = 初始值;
    for (Choice ch : choices(s)) {
        ans = merge(ans, dfs(next_state(s, ch)));
    }
    return memo[s] = ans;
}
```

### 模板 C：迭代 DP

```cpp
// 1) 定义dp维度与语义
// 2) 初始化边界
// 3) 按依赖顺序遍历状态
for (状态按拓扑顺序) {
    for (可行转移) {
        dp[cur] = merge(dp[cur], transfer(dp[pre]));
    }
}
// 4) 返回目标状态
```

---

## 8. 如何判断该用“回溯 / 记忆化 / 迭代DP”？

可以按这个决策流程：

1. **先写 DFS 思路**：把状态与转移说明白；
2. 如果有明显重复子问题 → **加 memo**；
3. 如果状态是规则网格/线性区间，且依赖方向清晰 → **改迭代 DP**（常更快、更省栈）。

经验上：

- 面试中，先给 memo 版本通常更稳；
- 追求极致性能或避免递归栈，再给迭代版本加分。

---

## 9. “无痛改造”时最容易踩的坑

1. **memo key 不完整**
   - 例如状态其实需要 `(i, rest)`，你只用了 `i`。
2. **把路径变量混进状态**
   - 记忆化关注“子问题结果”，不是某条路径细节。
3. **边界值语义混乱**
   - `INF`、`-1`、`UNVISITED` 混在一起会出错。
4. **迭代顺序写反**
   - 比如 01 背包与完全背包的循环方向不同。
5. **递归可过，迭代却错初始化**
   - DP 的 80% bug 在初始化。

---

## 10. 再给一个常见对照：0/1 背包（选或不选）

状态常写成 `dfs(i, cap)`：

- 含义：从第 `i` 件物品开始、剩余容量 `cap` 时的最大价值；
- 转移：
  - 不选：`dfs(i+1, cap)`
  - 选：`dfs(i+1, cap-w[i]) + v[i]`（若 `cap>=w[i]`）

这几乎原样变成二维 DP：

- `dp[i][cap]`：同上语义；
- 遍历 `i` 从后往前；`cap` 遍历合法范围。

你会看到：

> **不是“学三套写法”，而是“同一状态机的三种落地形式”。**

---

## 11. 实战改造清单（建议收藏）

拿到一道题，按这个清单走：

- [ ] 定义状态 `State`，写成“从状态 s 出发的答案”；
- [ ] 写返回值型 DFS（先不急 DP）；
- [ ] 检查是否有重复子问题；
- [ ] 有重复就加 memo（保持 DFS 结构不变）；
- [ ] 把递归方程翻译成 `dp[...]` 语义；
- [ ] 确认初始化；
- [ ] 确认遍历顺序（依赖先于当前）；
- [ ] 用小样例手推表格验证。

这个流程能显著减少“想 DP 想不出来”的卡顿。

---

## 结语

你真正要掌握的，不是某道题的固定代码，而是**状态建模能力**。

当你把状态定义对了：

- 回溯是搜索视角；
- 记忆化是缓存视角；
- 迭代 DP 是调度视角。

三者自然互通。

如果你愿意，下一篇我可以写一版“多题并排对照”：

- 组合总和（回溯）
- 零钱兑换（记忆化）
- 完全背包（迭代 DP）

三题共用同一套状态定义语言，帮你把迁移能力练扎实。
