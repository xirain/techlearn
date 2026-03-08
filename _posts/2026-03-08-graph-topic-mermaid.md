---
title: 图论专题：Mermaid 图解图搜索、拓扑排序、并查集与 4 道 LeetCode 核心题
description: 用 Mermaid 图解图论中的 DFS、BFS、拓扑排序、并查集和 4 道 LeetCode 经典题，系统掌握图论专题。
date: 2026-03-08
categories: [数据结构]
tags: [算法, 图论, graph, leetcode, mermaid, bfs, dfs]
mermaid: true
---

图论题经常给人一种“类型很多、套路很多”的感觉。

但真正做题时，图论高频题大多还是围绕这几件事：

- 图怎么表示
- 节点之间怎么连
- 如何遍历整张图
- 是否有环
- 是否存在依赖顺序
- 连通性如何维护

这篇文章继续用 Mermaid 图解的方式，把图论里最常见的 DFS、BFS、拓扑排序和并查集串起来，再用 4 道 LeetCode 题把核心模型落地。

> 学习目标：
> 1. 理解图的基本表示方式与搜索方式。
> 2. 掌握 DFS / BFS 在图中的作用。
> 3. 理解拓扑排序和并查集的典型应用。
> 4. 用 4 道 LeetCode 题覆盖图论高频模型。
> 5. 用一张知识卡片建立图论题的判断框架。

---

## 一、图的本质：节点 + 边

图由节点和边组成。

```mermaid
flowchart LR
    A((A)) --> B((B))
    A --> C((C))
    B --> D((D))
    C --> D
```

图题和树题最大的不同是：

- 树通常默认无环
- 图可能有环、可能不连通

所以图题几乎总会多出两个意识：

- `visited`
- 连通关系

---

## 二、图怎么表示

高频写法通常是邻接表。

```mermaid
flowchart TD
    A["0: [1,2]"] --> B["1: [2,3]"]
    B --> C["2: [3]"]
    C --> D["3: []"]
```

你可以把它理解成：

- 每个节点都维护一个“它能走到哪些节点”的列表

这样 DFS / BFS 就自然变成：

1. 取出当前节点
2. 遍历相邻节点
3. 对还没访问过的节点继续处理

---

## 三、图搜索：DFS 与 BFS

### DFS

```mermaid
flowchart TD
    A[起点] --> B[深入一个邻居]
    B --> C[继续深入]
    C --> D[走不通则回退]
```

适合：

- 连通块搜索
- 是否可达
- 路径枚举

### BFS

```mermaid
flowchart TD
    A[起点] --> B[第 1 层邻居]
    B --> C[第 2 层邻居]
    C --> D[第 3 层邻居]
```

适合：

- 无权图最短路
- 最少步数
- 分层扩展

---

## 四、拓扑排序：处理依赖关系

如果图表示“先做 A，才能做 B”这种依赖关系，那么它通常是有向图问题。

拓扑排序适用于：

**有向无环图（DAG）中的依赖顺序。**

```mermaid
flowchart LR
    A[课程 0] --> B[课程 1]
    A --> C[课程 2]
    B --> D[课程 3]
    C --> D
```

拓扑排序的关键是入度：

- 入度为 0 的点，说明当前没有前置依赖，可以先处理

```mermaid
flowchart TD
    A[统计所有节点入度] --> B[把入度为 0 的节点入队]
    B --> C[弹出一个节点并加入答案]
    C --> D[删除它指向的边]
    D --> E[若新节点入度变 0 则入队]
```

---

## 五、并查集：维护连通性

并查集适合处理：

- 两个节点是否连通
- 多次合并连通块
- 动态维护集合归属

```mermaid
flowchart TD
    A[节点 1] --> P1[根节点]
    B[节点 2] --> P1
    C[节点 3] --> P2[另一个根]
    D[union] --> E[把两个根合并]
```

并查集核心只有两件事：

- `find(x)`：找根
- `union(a, b)`：合并两个集合

---

## 六、4 道 LeetCode 题目打通图论专题

## 1）LeetCode 200. 岛屿数量

题型定位：网格图 DFS / BFS。

```java
class Solution {
    public int numIslands(char[][] grid) {
        int m = grid.length, n = grid[0].length, count = 0;
        for (int i = 0; i < m; i++) {
            for (int j = 0; j < n; j++) {
                if (grid[i][j] == '1') {
                    count++;
                    dfs(grid, i, j);
                }
            }
        }
        return count;
    }

    private void dfs(char[][] grid, int i, int j) {
        if (i < 0 || i >= grid.length || j < 0 || j >= grid[0].length || grid[i][j] != '1') {
            return;
        }
        grid[i][j] = '0';
        dfs(grid, i + 1, j);
        dfs(grid, i - 1, j);
        dfs(grid, i, j + 1);
        dfs(grid, i, j - 1);
    }
}
```

```mermaid
flowchart TD
    A[发现一个陆地] --> B[计数加 1]
    B --> C[DFS 扩展整块连通区域]
    C --> D[标记已访问]
```

这题练的是：

- 把网格看成图
- 连通块计数

## 2）LeetCode 994. 腐烂的橘子

题型定位：多源 BFS。

```java
class Solution {
    public int orangesRotting(int[][] grid) {
        int m = grid.length, n = grid[0].length;
        Queue<int[]> queue = new LinkedList<>();
        int fresh = 0;

        for (int i = 0; i < m; i++) {
            for (int j = 0; j < n; j++) {
                if (grid[i][j] == 2) queue.offer(new int[]{i, j});
                if (grid[i][j] == 1) fresh++;
            }
        }

        int minutes = 0;
        int[][] dirs = {{1,0},{-1,0},{0,1},{0,-1}};

        while (!queue.isEmpty() && fresh > 0) {
            int size = queue.size();
            for (int i = 0; i < size; i++) {
                int[] cur = queue.poll();
                for (int[] d : dirs) {
                    int x = cur[0] + d[0], y = cur[1] + d[1];
                    if (x >= 0 && x < m && y >= 0 && y < n && grid[x][y] == 1) {
                        grid[x][y] = 2;
                        fresh--;
                        queue.offer(new int[]{x, y});
                    }
                }
            }
            minutes++;
        }
        return fresh == 0 ? minutes : -1;
    }
}
```

```mermaid
flowchart TD
    A[所有初始腐烂橘子同时入队] --> B[第 1 分钟扩散]
    B --> C[第 2 分钟扩散]
    C --> D[直到没有新鲜橘子或无法继续]
```

这题训练的是：

- 多源 BFS
- “按层推进 = 时间推进”

## 3）LeetCode 207. 课程表

题型定位：拓扑排序 / 判环。

```java
class Solution {
    public boolean canFinish(int numCourses, int[][] prerequisites) {
        List<List<Integer>> graph = new ArrayList<>();
        for (int i = 0; i < numCourses; i++) graph.add(new ArrayList<>());
        int[] indegree = new int[numCourses];

        for (int[] p : prerequisites) {
            graph.get(p[1]).add(p[0]);
            indegree[p[0]]++;
        }

        Queue<Integer> queue = new LinkedList<>();
        for (int i = 0; i < numCourses; i++) {
            if (indegree[i] == 0) queue.offer(i);
        }

        int count = 0;
        while (!queue.isEmpty()) {
            int cur = queue.poll();
            count++;
            for (int next : graph.get(cur)) {
                if (--indegree[next] == 0) queue.offer(next);
            }
        }
        return count == numCourses;
    }
}
```

```mermaid
flowchart TD
    A[统计入度] --> B[入度为 0 的课程入队]
    B --> C[弹出并学习]
    C --> D[删掉它指向的依赖边]
    D --> E[新的入度为 0 课程入队]
    E --> F{所有课程都被处理了吗}
```

这题训练的是：

- 有向图依赖关系
- 拓扑排序判环

## 4）LeetCode 547. 省份数量

题型定位：并查集 / 连通块。

```java
class Solution {
    public int findCircleNum(int[][] isConnected) {
        int n = isConnected.length;
        UnionFind uf = new UnionFind(n);

        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                if (isConnected[i][j] == 1) {
                    uf.union(i, j);
                }
            }
        }
        return uf.count;
    }
}
```

```mermaid
flowchart TD
    A[城市 0 与 1 连通] --> B[合并集合]
    C[城市 1 与 2 连通] --> B
    B --> D[0 1 2 属于同一省份]
```

这题练的是：

- 连通块概念
- 并查集维护集合数量

---

## 七、图论题怎么快速判断模型

```mermaid
flowchart TD
    A[看到图论题] --> B{要求最短步数 / 最少转换}
    B -->|是| C[BFS]
    B -->|否| D{要求连通块个数 / 是否连通}
    D -->|是| E[DFS / BFS / 并查集]
    D -->|否| F{是否存在先后依赖}
    F -->|是| G[拓扑排序]
    F -->|否| H{是否动态合并集合}
    H -->|是| I[并查集]
    H -->|否| J[继续分析带权图或其他图模型]
```

---

## 八、图论常见错误

## 1）忘记 `visited`

图可能有环，不标记访问很容易无限绕圈。

## 2）把树题习惯带到图题

树天然无环，图不一定。

## 3）拓扑排序忘了入度更新

如果出队后不更新邻居入度，整套流程就断了。

## 4）并查集只会 `union` 不会维护根

路径压缩和按秩合并虽然不是必须，但会显著提升效率。

```mermaid
flowchart TD
    A[图搜索] --> B[判断是否已访问]
    B -->|否| C[标记并继续]
    B -->|是| D[跳过]
```

---

## 九、图论知识卡片

```mermaid
mindmap
  root((图论))
    搜索
      DFS
      BFS
    结构
      邻接表
      visited
    依赖关系
      拓扑排序
      入度
    连通性
      并查集
      连通块
    高频题型
      最短步数
      岛屿
      课程表
      省份数量
```

复习版要点：

- 图题本质是节点和边的关系处理
- 图和树的关键区别是：图可能有环
- 最短步数优先想到 BFS
- 依赖顺序优先想到拓扑排序
- 动态连通性优先想到并查集

---

## 十、最后总结

如果只记一句话，请记这个：

**图论高频题看起来多，实质上大多还是在做“搜索、判环、排依赖、维护连通性”。**

做题时先判断：

- 这是搜索问题、最短路问题，还是依赖问题
- 图里有没有环
- 是否需要维护连通块

把这篇里的 4 道题做透，图论的高频主干就基本搭起来了。
