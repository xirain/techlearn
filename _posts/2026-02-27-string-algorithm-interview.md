---
title: 字符串算法面试题 —— 从双指针到后缀数组的由浅入深手撕指南
description: 覆盖字符串基础操作、双指针/滑动窗口、KMP/Rabin-Karp 模式匹配、Trie 前缀树、字符串 DP(编辑距离/回文/正则)、Manacher、后缀数组，30+ 道 LeetCode 高频题附模板代码
date: 2026-02-27
categories: [编程语言]
tags: [字符串, 算法, 面试, KMP, Trie, 动态规划, 回文, 滑动窗口, c++, LeetCode]
---

字符串是面试中**出现频率最高、变形最多**的题型——它不像图论那样需要复杂建模，但细节极多，边界处理稍有不慎就会 WA。很多人觉得字符串题"会做但写不对"，根本原因是没有形成**分类模板思维**。

这篇文章的组织思路：**由浅入深，每个层级先讲"什么时候用"，再给模板代码，最后用高频 LeetCode 题巩固**。读完后你看到字符串题应该能在 10 秒内判断出用哪个模板。

```
难度路线图：
Level 1  字符串基础 + 双指针 + 滑动窗口      ← 必须秒杀
Level 2  KMP + Rabin-Karp + Trie            ← 中高级面试考察
Level 3  字符串 DP + Manacher + 后缀数组     ← 区分度题目
```

------

## 第一部分：字符串基础——你以为简单但面试经常翻车

### Q1：C++ 中 string 的底层原理？和 C 风格字符串有什么区别？

**记忆点：`std::string` 底层是动态数组（类似 vector\<char\>），自动管理内存，支持 SSO（短字符串优化）。C 风格字符串是 `char*` + `\0` 终止符，手动管理内存，极易出错。面试中除非特别要求，一律用 `std::string`。**

```
std::string 内部结构（SSO 优化）：

短字符串（通常 ≤ 22 字节，各实现不同）：
  ┌──────────────────────────────┐
  │ size │ 字符数据直接存在栈上    │  ← 不分配堆内存！
  └──────────────────────────────┘

长字符串：
  ┌──────────────────────────────┐
  │ size │ capacity │ char* ptr  │  → 堆上的字符数组
  └──────────────────────────────┘

C 风格字符串 vs std::string：
  ┌──────────────┬────────────────────────┐
  │              │  char* / char[]         │  std::string
  ├──────────────┼────────────────────────┤
  │ 长度获取      │  strlen() O(n)         │  size() O(1)
  │ 拼接         │  strcat() 要保证空间    │  += 自动扩容
  │ 比较         │  strcmp()               │  == 运算符
  │ 安全性       │  容易缓冲区溢出         │  自动管理
  │ 传参         │  传指针                 │  传引用 const string&
  └──────────────┴────────────────────────┘

面试常考的 string 操作复杂度：
  s[i]            O(1)    随机访问
  s.size()        O(1)    获取长度
  s += c          O(1)*   尾部追加（摊销）
  s.substr(i, n)  O(n)    子串拷贝（不是 O(1)！常见陷阱）
  s.find(t)       O(n*m)  查找子串（朴素算法）
  s1 == s2        O(n)    比较（不是 O(1)！）
  s1 + s2         O(n+m)  拼接（创建新串）
```

**易错点：** `substr()` 是 O(n) 不是 O(1)，在循环中频繁调用 `substr` 会导致 TLE。需要比较子串时优先用双指针或哈希。

### Q2：字符串中的字符频率统计——三种写法

**记忆点：字符频率统计是字符串题的"地基"，至少 30% 的字符串题需要先统计频率。三种方式：数组（最快）、哈希表（通用）、排序（判断异位词）。**

```cpp
// 方式 1：固定数组（仅小写字母，最快）
int freq[26] = {};
for (char c : s) freq[c - 'a']++;

// 方式 2：unordered_map（通用，支持任意字符）
unordered_map<char, int> freq;
for (char c : s) freq[c]++;

// 方式 3：排序后比较（判断异位词专用）
string t1 = s1, t2 = s2;
sort(t1.begin(), t1.end());
sort(t2.begin(), t2.end());
bool isAnagram = (t1 == t2);
```

```
什么时候用哪种：
  纯小写字母           → int freq[26]，最快
  包含大小写/数字/符号  → unordered_map<char, int>
  判断两个串是否是异位词 → 排序后比较（简单）或频率数组比较（O(n)）
  Unicode / 中文字符    → unordered_map<char32_t, int>

实战技巧——两个频率数组的比较：
  // 判断 s1 和 s2 是否是异位词（O(n)，不用排序）
  int freq[26] = {};
  for (char c : s1) freq[c - 'a']++;
  for (char c : s2) freq[c - 'a']--;
  // freq 全为 0 则是异位词
  bool isAnagram = all_of(freq, freq + 26, [](int x){ return x == 0; });
```

------

## 第二部分：双指针——字符串的瑞士军刀

### Q3：反转字符串 / 反转单词——双指针基本功

**记忆点：对撞双指针从两端往中间走，交换字符实现原地反转。反转单词 = "整体反转 + 局部反转"。**

```cpp
// 反转字符串（LC 344）—— 最基础的对撞双指针
void reverseString(vector<char>& s) {
    int left = 0, right = s.size() - 1;
    while (left < right) {
        swap(s[left++], s[right--]);
    }
}

// 反转字符串中的单词（LC 151）
// 思路："I love you" → 整体反转 "uoy evol I" → 每个单词反转 "you love I"
string reverseWords(string s) {
    // 1. 去除多余空格 + 反转整个字符串
    reverse(s.begin(), s.end());

    // 2. 逐个单词反转
    int n = s.size(), idx = 0;
    for (int start = 0; start < n; start++) {
        if (s[start] == ' ') continue;
        if (idx != 0) s[idx++] = ' ';   // 单词间加空格
        int end = start;
        while (end < n && s[end] != ' ')
            s[idx++] = s[end++];
        reverse(s.begin() + idx - (end - start), s.begin() + idx);
        start = end;
    }
    s.resize(idx);
    return s;
}
```

### Q4：回文串判断——双指针经典应用

**记忆点：左右指针往中间走，跳过非字母数字字符，忽略大小写比较。**

```cpp
// 验证回文串（LC 125）
bool isPalindrome(string s) {
    int left = 0, right = s.size() - 1;
    while (left < right) {
        while (left < right && !isalnum(s[left])) left++;   // 跳过非字母数字
        while (left < right && !isalnum(s[right])) right--;
        if (tolower(s[left]) != tolower(s[right])) return false;
        left++;
        right--;
    }
    return true;
}

// 验证回文串 II（LC 680）—— 最多删一个字符
// 思路：遇到不匹配时，尝试跳过左边或跳过右边
bool validPalindrome(string s) {
    auto check = [&](int l, int r) {
        while (l < r) {
            if (s[l] != s[r]) return false;
            l++; r--;
        }
        return true;
    };

    int l = 0, r = s.size() - 1;
    while (l < r) {
        if (s[l] != s[r])
            return check(l + 1, r) || check(l, r - 1);  // 尝试跳过一个
        l++; r--;
    }
    return true;
}
```

### Q5：最长回文子串——中心扩展法

**记忆点：回文串从中心往两边扩展。每个位置（或每两个相邻位置）都可以作为中心，向外扩展直到不匹配。时间 O(n²)，空间 O(1)。**

```cpp
// 最长回文子串（LC 5）—— 中心扩展
string longestPalindrome(string s) {
    int n = s.size(), start = 0, maxLen = 1;

    auto expand = [&](int left, int right) {
        while (left >= 0 && right < n && s[left] == s[right]) {
            if (right - left + 1 > maxLen) {
                start = left;
                maxLen = right - left + 1;
            }
            left--;
            right++;
        }
    };

    for (int i = 0; i < n; i++) {
        expand(i, i);       // 奇数长度回文，中心是一个字符
        expand(i, i + 1);   // 偶数长度回文，中心是两个字符之间
    }

    return s.substr(start, maxLen);
}
```

```
中心扩展 vs DP vs Manacher：
              时间      空间    实现难度    面试推荐
中心扩展      O(n²)     O(1)    ★☆☆       ✅ 首选（简单直觉）
DP            O(n²)     O(n²)   ★★☆       ✓  回文子串计数时用
Manacher      O(n)      O(n)    ★★★       △  除非面试官明确要求

面试时先写中心扩展，写完后说"如果需要 O(n) 可以用 Manacher"即可。
```

------

## 第三部分：滑动窗口——字符串题的半壁江山

### Q6：滑动窗口模板——字符串专用版

**记忆点：看到"连续子串" + "满足某条件" + "最长/最短/计数"三个关键词，立刻想到滑动窗口。**

```cpp
// 滑动窗口字符串万能模板
string/int slidingWindow(string s, string t) {
    int freq[128] = {};           // 窗口内字符频率（ASCII 覆盖所有可打印字符）
    int left = 0;
    int result = 0;               // 或 string result

    for (int right = 0; right < s.size(); right++) {
        freq[s[right]]++;         // 1. 右指针字符进入窗口

        while (/* 窗口需要收缩 */) {
            freq[s[left]]--;      // 2. 左指针字符离开窗口
            left++;
        }

        result = ...;             // 3. 更新答案
    }
    return result;
}
```

```
滑动窗口核心决策：
  ┌───────────────────┬─────────────────────────────┐
  │ 决策点             │ 选择                         │
  ├───────────────────┼─────────────────────────────┤
  │ 用 int[128] 还是 map │ 纯 ASCII 用数组（更快）      │
  │                   │ 可能有 Unicode 用 map         │
  ├───────────────────┼─────────────────────────────┤
  │ while 还是 if 收缩  │ 求最短 → while（尽量收缩）    │
  │                   │ 固定窗口大小 → if             │
  ├───────────────────┼─────────────────────────────┤
  │ 更新答案在收缩前还是后│ 求最长 → 收缩前更新           │
  │                   │ 求最短 → 收缩时更新            │
  └───────────────────┴─────────────────────────────┘
```

### Q7：无重复字符的最长子串（LC 3）

**记忆点：维护一个无重复字符的窗口，右指针扩展时如果字符已存在就收缩左指针。**

```cpp
int lengthOfLongestSubstring(string s) {
    int freq[128] = {};
    int left = 0, result = 0;

    for (int right = 0; right < s.size(); right++) {
        freq[s[right]]++;
        while (freq[s[right]] > 1) {     // 有重复了
            freq[s[left]]--;
            left++;
        }
        result = max(result, right - left + 1);
    }
    return result;
}
```

### Q8：最小覆盖子串（LC 76）——滑动窗口天花板

**记忆点：找 s 中包含 t 所有字符的最短子串。用 need 记录还需要多少个字符，用 count 记录已满足的字符种类数。**

```cpp
string minWindow(string s, string t) {
    int need[128] = {};
    int required = 0;             // 需要满足的不同字符数

    for (char c : t) {
        if (need[c] == 0) required++;
        need[c]++;
    }

    int window[128] = {};
    int formed = 0;               // 已满足的不同字符数
    int left = 0, minLen = INT_MAX, minStart = 0;

    for (int right = 0; right < s.size(); right++) {
        char c = s[right];
        window[c]++;
        if (window[c] == need[c]) formed++;  // 这个字符刚好满足

        while (formed == required) {         // 所有字符都满足了，收缩！
            if (right - left + 1 < minLen) {
                minLen = right - left + 1;
                minStart = left;
            }
            char d = s[left];
            window[d]--;
            if (window[d] < need[d]) formed--;  // 不满足了
            left++;
        }
    }

    return minLen == INT_MAX ? "" : s.substr(minStart, minLen);
}
```

```
这道题的关键细节：
  1. need[c] 记录 t 中每个字符需要的数量
  2. formed 表示"有多少种字符已经满足了需求"
  3. 收缩条件：formed == required（所有字符都满足了）
  4. 收缩时更新答案（因为求最短）

类似套路的题：
  ├── 字母异位词（LC 438）—— 固定窗口大小 = t.size()
  ├── 替换后的最长重复字符（LC 424）—— 窗口内最多字符 + K ≥ 窗口大小
  └── 至多包含 K 个不同字符的最长子串（LC 340）
```

### Q9：找所有字母异位词（LC 438）——固定窗口大小

**记忆点：窗口大小固定为 p.size()，滑动时比较窗口内的字符频率和 p 的频率是否相同。**

```cpp
vector<int> findAnagrams(string s, string p) {
    if (s.size() < p.size()) return {};

    int freq_p[26] = {}, freq_w[26] = {};
    int pLen = p.size();

    for (char c : p) freq_p[c - 'a']++;
    for (int i = 0; i < pLen; i++) freq_w[s[i] - 'a']++;

    vector<int> result;
    if (memcmp(freq_p, freq_w, sizeof(freq_p)) == 0)   // 用 memcmp 比较数组
        result.push_back(0);

    for (int i = pLen; i < s.size(); i++) {
        freq_w[s[i] - 'a']++;               // 右边进
        freq_w[s[i - pLen] - 'a']--;         // 左边出
        if (memcmp(freq_p, freq_w, sizeof(freq_p)) == 0)
            result.push_back(i - pLen + 1);
    }
    return result;
}
```

------

## 第四部分：KMP 算法——模式匹配的终极武器

### Q10：为什么需要 KMP？朴素匹配有什么问题？

**记忆点：朴素匹配（暴力）O(n×m)——每次匹配失败回退到文本串的下一个位置重新开始。KMP O(n+m)——匹配失败时不回退文本指针，利用已匹配部分的信息跳转到正确位置。关键在于预处理模式串的 next 数组（也叫 failure function / prefix function）。**

```
朴素匹配的问题：
  text:    A B A B A B C
  pattern: A B A B C

  第 1 次匹配：
  A B A B A B C
  A B A B C         ← 在位置 4 失败
  ↑ 匹配了 4 个字符，但全部作废，文本指针回到位置 1 重新开始

  KMP 的改进：
  A B A B A B C
  A B A B C         ← 在位置 4 失败
      A B A B C     ← 不回退！直接跳到位置 2 继续（因为 "AB" 是前后缀匹配）

  为什么能跳？因为 pattern "ABAB" 中：
    前缀 "AB" == 后缀 "AB"
    已匹配的 "ABAB" 中有重复结构，不需要重新比较
```

### Q11：next 数组（前缀函数）的含义和构建

**记忆点：`next[i]` 表示模式串 `p[0..i]` 中，最长的"既是前缀又是后缀"的长度（不包括整个串本身）。构建过程本身就是 KMP 对自己做匹配。**

```
例：pattern = "ABABABCA"

  i   p[0..i]     最长相等前后缀    next[i]
  0   A           无                0
  1   AB          无                0
  2   ABA         A = A             1
  3   ABAB        AB = AB           2
  4   ABABA       ABA = ABA         3
  5   ABABAB      ABAB = ABAB       4
  6   ABABABC     无                0
  7   ABABABCA    A = A             1

  next = [0, 0, 1, 2, 3, 4, 0, 1]

  直觉理解：next[i] 告诉你"如果在位置 i+1 匹配失败了，应该跳到 next[i] 继续比较"
```

```cpp
// 构建 next 数组（前缀函数）
vector<int> buildNext(const string& pattern) {
    int m = pattern.size();
    vector<int> next(m, 0);
    int j = 0;                        // j 是前缀指针

    for (int i = 1; i < m; i++) {
        while (j > 0 && pattern[i] != pattern[j])
            j = next[j - 1];          // 回退！利用之前的结果
        if (pattern[i] == pattern[j])
            j++;
        next[i] = j;
    }
    return next;
}
```

```
构建过程详解（pattern = "ABABC"）：

  i=1: p[1]='B' vs p[0]='A' → 不匹配, j=0 → next[1]=0
  i=2: p[2]='A' vs p[0]='A' → 匹配!  j=1 → next[2]=1
  i=3: p[3]='B' vs p[1]='B' → 匹配!  j=2 → next[3]=2
  i=4: p[4]='C' vs p[2]='A' → 不匹配
       j = next[j-1] = next[1] = 0
       p[4]='C' vs p[0]='A' → 还是不匹配, j=0 → next[4]=0

  next = [0, 0, 1, 2, 0]
```

### Q12：KMP 完整匹配代码

```cpp
// KMP 搜索（返回第一个匹配位置，-1 表示未找到）
int kmpSearch(const string& text, const string& pattern) {
    if (pattern.empty()) return 0;

    vector<int> next = buildNext(pattern);
    int j = 0;   // pattern 指针

    for (int i = 0; i < text.size(); i++) {
        while (j > 0 && text[i] != pattern[j])
            j = next[j - 1];           // 失败时跳转
        if (text[i] == pattern[j])
            j++;
        if (j == pattern.size()) {
            return i - j + 1;          // 找到匹配！
            // 如果要找所有匹配：result.push_back(i - j + 1); j = next[j - 1];
        }
    }
    return -1;
}
```

```
KMP 面试回答框架：

  "KMP 的核心是预处理模式串，构建 next 数组。
   next[i] 记录 p[0..i] 中最长相等前后缀的长度。
   匹配失败时，文本指针不回退，模式指针跳到 next[j-1]。
   时间 O(n+m)，空间 O(m)。"

  面试追问："为什么构建 next 数组是 O(m)？"
  → j 的增减总量不超过 2m 次（每次 i 增 1 时 j 最多增 1，
     而 j 的总减少不超过总增加量），所以是 O(m)。

  面试追问："什么时候用 KMP？"
  → 单模式串匹配。如果多个模式串用 Aho-Corasick（AC 自动机）。
  → 实际工程中 string::find() 通常够用，KMP 在面试中主要考察算法理解。
```

------

## 第五部分：Rabin-Karp——哈希匹配

### Q13：Rabin-Karp 的原理？和 KMP 比哪个更实用？

**记忆点：Rabin-Karp 用滚动哈希（Rolling Hash）比较子串——先算模式串的哈希值，然后在文本上滑动窗口，每次 O(1) 更新哈希值。哈希相等时再逐字符验证（防哈希冲突）。平均 O(n+m)，最坏 O(nm)。**

```
Rabin-Karp 的核心——滚动哈希：

  text = "ABCDE"  pattern = "BCD"  窗口大小 = 3

  把字符串看作一个 base 进制数（base 通常取 31 或 131）：
  hash("ABC") = A×31² + B×31¹ + C×31⁰

  滑动窗口：
  hash("BCD") = (hash("ABC") - A×31²) × 31 + D
                 ↑ 减去最高位    ↑ 左移      ↑ 加新字符

  → 每次 O(1) 计算新窗口的哈希值
```

```cpp
// Rabin-Karp 模式匹配
int rabinKarp(const string& text, const string& pattern) {
    int n = text.size(), m = pattern.size();
    if (m > n) return -1;

    const long long BASE = 31, MOD = 1e9 + 7;

    // 预计算 BASE^(m-1)
    long long power = 1;
    for (int i = 0; i < m - 1; i++)
        power = power * BASE % MOD;

    // 计算 pattern 哈希和第一个窗口哈希
    long long hashP = 0, hashW = 0;
    for (int i = 0; i < m; i++) {
        hashP = (hashP * BASE + pattern[i]) % MOD;
        hashW = (hashW * BASE + text[i]) % MOD;
    }

    for (int i = 0; i <= n - m; i++) {
        if (hashP == hashW) {
            // 哈希相等，逐字符验证（防冲突）
            if (text.substr(i, m) == pattern)
                return i;
        }
        // 滚动更新哈希
        if (i + m < n) {
            hashW = ((hashW - text[i] * power % MOD + MOD) * BASE + text[i + m]) % MOD;
        }
    }
    return -1;
}
```

```
KMP vs Rabin-Karp：
  ┌──────────────┬─────────────┬──────────────┐
  │              │ KMP          │ Rabin-Karp   │
  ├──────────────┼─────────────┼──────────────┤
  │ 时间         │ O(n+m) 确定  │ O(n+m) 平均  │
  │ 最坏         │ O(n+m)       │ O(nm) 哈希冲突│
  │ 实现难度     │ ★★★          │ ★★☆          │
  │ 多模式匹配   │ 需要AC自动机  │ 天然支持     │
  │ 适用场景     │ 单模式精确匹配│ 多模式/子串查重│
  └──────────────┴─────────────┴──────────────┘

  Rabin-Karp 的独特优势：
  ├── 多模式匹配：把所有模式串的哈希值存到 set 中，一次遍历
  ├── 最长重复子串：二分长度 + 滚动哈希判断是否存在重复
  └── 抄袭检测：文档相似度比较（实际工程中更常用）
```

------

## 第六部分：Trie（前缀树）——前缀匹配专用

### Q14：Trie 的原理和实现？

**记忆点：Trie 是一棵多叉树，每条边代表一个字符，从根到某节点的路径构成一个前缀。用 children[26] 数组存子节点（仅限小写字母）。插入/查找时间 O(L)，L 是单词长度。**

```
Trie 存储 ["apple", "app", "apricot", "bat"]：

              root
             /    \
            a      b
            |      |
            p      a
           / \     |
          p   r    t*
          |   |
          l   i
          |   |
          e*  c
              |
              o
              |
              t*

  * 表示 isEnd = true（这里是一个完整单词的结尾）
  "app" 的路径：root → a → p → p*
  "apple" 的路径：root → a → p → p → l → e*
```

```cpp
class Trie {
    struct Node {
        Node* children[26] = {};
        bool isEnd = false;
    };
    Node* root = new Node();

public:
    void insert(const string& word) {
        auto node = root;
        for (char c : word) {
            int i = c - 'a';
            if (!node->children[i])
                node->children[i] = new Node();
            node = node->children[i];
        }
        node->isEnd = true;
    }

    bool search(const string& word) {
        auto node = traverse(word);
        return node && node->isEnd;     // 必须是完整单词
    }

    bool startsWith(const string& prefix) {
        return traverse(prefix) != nullptr;  // 只需要前缀存在
    }

private:
    Node* traverse(const string& s) {
        auto node = root;
        for (char c : s) {
            int i = c - 'a';
            if (!node->children[i]) return nullptr;
            node = node->children[i];
        }
        return node;
    }
};
```

### Q15：Trie 的高频面试题

```
Trie 经典题及变形：
  ┌─────────────────────────────┬──────────────────────────────┐
  │ 题目                        │ 关键思路                      │
  ├─────────────────────────────┼──────────────────────────────┤
  │ 实现 Trie（LC 208）          │ 基础实现（上面的代码）          │
  │ 添加与搜索单词（LC 211）      │ '.' 通配符 → DFS 遍历所有子节点│
  │ 单词搜索 II（LC 212）        │ Trie + 回溯（在网格上 DFS）    │
  │ 替换单词（LC 648）           │ 查找最短前缀                  │
  │ 键值映射（LC 677）           │ 前缀求和                      │
  │ 最长公共前缀（LC 14）        │ Trie 或直接纵向比较            │
  └─────────────────────────────┴──────────────────────────────┘
```

```cpp
// 添加与搜索单词（LC 211）—— '.' 可以匹配任意字符
bool searchWithDot(Node* node, const string& word, int idx) {
    if (idx == word.size()) return node->isEnd;

    char c = word[idx];
    if (c == '.') {
        // '.' 匹配任意字符 → 遍历所有非空子节点
        for (int i = 0; i < 26; i++) {
            if (node->children[i] && searchWithDot(node->children[i], word, idx + 1))
                return true;
        }
        return false;
    } else {
        int i = c - 'a';
        if (!node->children[i]) return false;
        return searchWithDot(node->children[i], word, idx + 1);
    }
}
```

------

## 第七部分：字符串 DP——面试区分度最高的题型

### Q16：编辑距离（LC 72）——字符串 DP 的标杆题

**记忆点：`dp[i][j]` = word1 前 i 个字符变成 word2 前 j 个字符的最少操作数。三种操作对应三种转移：插入、删除、替换。**

```
状态转移：
  if word1[i-1] == word2[j-1]:
      dp[i][j] = dp[i-1][j-1]            // 字符相同，不操作
  else:
      dp[i][j] = 1 + min(
          dp[i-1][j],                     // 删除 word1[i-1]
          dp[i][j-1],                     // 插入 word2[j-1]
          dp[i-1][j-1]                    // 替换 word1[i-1] → word2[j-1]
      )

初始化：
  dp[i][0] = i    （word1 前 i 个字符 → 空串，删 i 次）
  dp[0][j] = j    （空串 → word2 前 j 个字符，插 j 次）

例：word1 = "horse", word2 = "ros"

       ""  r  o  s
  ""  [ 0  1  2  3 ]
  h   [ 1  1  2  3 ]
  o   [ 2  2  1  2 ]
  r   [ 3  2  2  2 ]
  s   [ 4  3  3  2 ]
  e   [ 5  4  4  3 ]  ← 答案：dp[5][3] = 3
```

```cpp
int minDistance(string word1, string word2) {
    int m = word1.size(), n = word2.size();
    vector<vector<int>> dp(m + 1, vector<int>(n + 1));

    for (int i = 0; i <= m; i++) dp[i][0] = i;
    for (int j = 0; j <= n; j++) dp[0][j] = j;

    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            if (word1[i-1] == word2[j-1])
                dp[i][j] = dp[i-1][j-1];
            else
                dp[i][j] = 1 + min({dp[i-1][j], dp[i][j-1], dp[i-1][j-1]});
        }
    }
    return dp[m][n];
}
```

### Q17：最长回文子序列（LC 516）

**记忆点：`dp[i][j]` = s[i..j] 的最长回文子序列长度。注意是子序列（不连续），不是子串（连续）。**

```
转移：
  if s[i] == s[j]:
      dp[i][j] = dp[i+1][j-1] + 2      // 两端字符相同，加进来
  else:
      dp[i][j] = max(dp[i+1][j], dp[i][j-1])  // 跳过一端

初始化：dp[i][i] = 1（单个字符是长度 1 的回文）

遍历顺序：i 从大到小，j 从小到大（因为 dp[i] 依赖 dp[i+1]）
```

```cpp
int longestPalindromeSubseq(string s) {
    int n = s.size();
    vector<vector<int>> dp(n, vector<int>(n, 0));

    for (int i = n - 1; i >= 0; i--) {    // i 从下往上
        dp[i][i] = 1;
        for (int j = i + 1; j < n; j++) { // j 从左往右
            if (s[i] == s[j])
                dp[i][j] = dp[i+1][j-1] + 2;
            else
                dp[i][j] = max(dp[i+1][j], dp[i][j-1]);
        }
    }
    return dp[0][n-1];
}
```

### Q18：回文子串计数（LC 647）

**记忆点：数所有回文子串的数量。可以用中心扩展（每个中心往外扩展，每成功一次计数+1），也可以用 DP。中心扩展更简洁。**

```cpp
int countSubstrings(string s) {
    int n = s.size(), count = 0;

    auto expand = [&](int left, int right) {
        while (left >= 0 && right < n && s[left] == s[right]) {
            count++;              // 每扩展成功一次就多一个回文子串
            left--;
            right++;
        }
    };

    for (int i = 0; i < n; i++) {
        expand(i, i);             // 奇数长度
        expand(i, i + 1);         // 偶数长度
    }
    return count;
}
```

### Q19：字符串 DP 题型总结

```
字符串 DP 分类速查：

┌───────────────────────┬────────────────────────┬─────────────────────────────┐
│ 题目                   │ 状态定义                │ 关键转移                     │
├───────────────────────┼────────────────────────┼─────────────────────────────┤
│ 编辑距离 (LC 72)       │ dp[i][j] = 操作次数     │ 相同跳过 / 三选一+1          │
│ 最长公共子序列 (LC 1143)│ dp[i][j] = LCS 长度     │ 相同+1 / max(左,上)          │
│ 最长公共子串           │ dp[i][j] = 以i,j结尾    │ 相同+1 / 不同归零            │
│                       │ 的公共子串长度           │                             │
│ 最长回文子序列 (LC 516) │ dp[i][j] = s[i..j]     │ 相同+2 / max(缩左,缩右)      │
│                       │ 回文子序列长度           │                             │
│ 最长回文子串 (LC 5)     │ dp[i][j] = 是否回文     │ s[i]==s[j] && dp[i+1][j-1]  │
│ 正则表达式匹配 (LC 10) │ dp[i][j] = 能否匹配     │ '.' 匹配任意 / '*' 零次或多次│
│ 通配符匹配 (LC 44)     │ dp[i][j] = 能否匹配     │ '?' 匹配一个 / '*' 匹配任意  │
│ 不同的子序列 (LC 115)  │ dp[i][j] = 方案数       │ 相同: dp[i-1][j-1]+dp[i-1][j]│
│ 单词拆分 (LC 139)      │ dp[i] = 前i个能否拆分   │ 枚举最后一个单词             │
│ 交错字符串 (LC 97)     │ dp[i][j] = 能否交错组成  │ 取 s1[i-1] 或 s2[j-1]       │
└───────────────────────┴────────────────────────┴─────────────────────────────┘

字符串 DP 通用技巧：
  1. 两个串 → 二维 dp[i][j]，分别表示两个串的前 i、j 个字符
  2. 一个串的区间 → 二维 dp[i][j]，表示 s[i..j] 的性质
  3. 初始化：dp[0][*] 和 dp[*][0] 通常对应空串的情况
  4. 遍历顺序：确保 dp[i][j] 依赖的格子已经计算过
```

------

## 第八部分：Manacher 算法——O(n) 求最长回文子串

### Q20：Manacher 算法的核心思想？

**记忆点：Manacher 利用回文串的对称性——如果已知一个大回文串，它内部的小回文串可以通过对称镜像直接得到长度，不需要重新扩展。预处理插入分隔符统一奇偶，用 center 和 right 维护当前最右回文边界。时间 O(n)。**

```
预处理：在字符间插入 '#' 统一奇偶
  "abba"  →  "#a#b#b#a#"
  "aba"   →  "#a#b#a#"

  这样所有回文串都变成奇数长度，中心扩展只需处理一种情况。

核心变量：
  p[i]    = 以 i 为中心的回文半径（不含中心本身）
  center  = 当前最右回文的中心
  right   = 当前最右回文的右边界（不含）

对称性加速：
  如果 i < right，那么 i 关于 center 的镜像点 mirror = 2*center - i
  p[i] 至少 = min(p[mirror], right - i)
  然后再尝试扩展

  例：
  ──────── center ────────
  ├── mirror ──┤── i ──┤
  左半边的回文信息可以直接复制给右半边！
```

```cpp
string manacher(string s) {
    // 1. 预处理：插入分隔符
    string t = "#";
    for (char c : s) { t += c; t += '#'; }

    int n = t.size();
    vector<int> p(n, 0);          // p[i] = 回文半径
    int center = 0, right = 0;    // 最右回文的中心和右边界
    int maxLen = 0, maxCenter = 0;

    for (int i = 0; i < n; i++) {
        // 2. 利用对称性初始化
        if (i < right) {
            int mirror = 2 * center - i;
            p[i] = min(p[mirror], right - i);
        }

        // 3. 中心扩展
        while (i - p[i] - 1 >= 0 && i + p[i] + 1 < n
               && t[i - p[i] - 1] == t[i + p[i] + 1]) {
            p[i]++;
        }

        // 4. 更新最右回文边界
        if (i + p[i] > right) {
            center = i;
            right = i + p[i];
        }

        // 5. 记录最长回文
        if (p[i] > maxLen) {
            maxLen = p[i];
            maxCenter = i;
        }
    }

    // 6. 还原到原字符串的下标
    int start = (maxCenter - maxLen) / 2;
    return s.substr(start, maxLen);
}
```

```
Manacher 面试回答要点：
  1. "在字符间插入 '#' 统一奇偶"
  2. "维护当前最右回文边界 right 和中心 center"
  3. "新位置 i 先利用镜像点的结果初始化，再尝试扩展"
  4. "总扩展次数是 O(n) 的，因为 right 只增不减"

什么时候用 Manacher：
  ├── 面试官明确要求 O(n) 解最长回文子串
  ├── 需要求所有位置的回文半径（如回文分割优化）
  └── 竞赛中需要极致性能

  面试中大多数情况中心扩展 O(n²) 就够了，Manacher 是加分项。
```

------

## 第九部分：后缀数组——字符串问题的终极工具

### Q21：后缀数组和 LCP 数组是什么？

**记忆点：后缀数组（Suffix Array）是所有后缀按字典序排序后的起始下标数组。LCP 数组（Longest Common Prefix）记录排序后相邻后缀的最长公共前缀长度。后缀数组能解决几乎所有字符串问题，但实现复杂，面试中主要考察概念理解。**

```
s = "banana"
所有后缀：
  i=0: banana
  i=1: anana
  i=2: nana
  i=3: ana
  i=4: na
  i=5: a

按字典序排序：
  sa[0] = 5: a
  sa[1] = 3: ana
  sa[2] = 1: anana
  sa[3] = 0: banana
  sa[4] = 4: na
  sa[5] = 2: nana

后缀数组 sa = [5, 3, 1, 0, 4, 2]

LCP 数组（相邻后缀的最长公共前缀）：
  lcp[0] = 0          （第一个没有前驱）
  lcp[1] = 1          a | ana        → 公共前缀 "a"
  lcp[2] = 3          ana | anana    → 公共前缀 "ana"
  lcp[3] = 0          anana | banana → 公共前缀 ""
  lcp[4] = 0          banana | na    → 公共前缀 ""
  lcp[5] = 2          na | nana      → 公共前缀 "na"

lcp = [0, 1, 3, 0, 0, 2]
```

```
后缀数组能解决的问题：
  ├── 最长重复子串 → lcp 数组最大值
  ├── 不同子串数量 → n(n+1)/2 - sum(lcp)
  ├── 最长公共子串（两个串）→ 拼接后求 sa + lcp
  ├── 子串排序/第 K 小子串
  └── 字符串匹配（二分查找后缀数组）

面试中的定位：
  了解概念即可，不太会要求手写 O(n) 构建（SA-IS 算法）。
  O(n log²n) 的倍增法有可能被要求简述思路。
  面试时更常用 Trie / KMP / 哈希解决相同问题。
```

------

## 第十部分：实战总结——字符串题分类速查

### 看到题目关键词 → 立刻想到算法

```
┌─────────────────────────────┬──────────────────────────────────┐
│ 关键词                      │ 算法/模板                         │
├─────────────────────────────┼──────────────────────────────────┤
│ "回文"                      │ 中心扩展（首选）/ DP / Manacher   │
│ "异位词" / "字母频率"        │ 频率数组[26] / 排序比较           │
│ "最长/最短子串" + 条件       │ 滑动窗口                         │
│ "子序列"                    │ DP / 贪心（按序扫描）             │
│ "模式匹配" / "strStr"       │ KMP / Rabin-Karp / 内置find      │
│ "前缀" / "字典" / "自动补全" │ Trie                             │
│ "编辑距离" / "变换"          │ 二维 DP                          │
│ "反转"                      │ 双指针                           │
│ "括号匹配" / "嵌套"         │ 栈                               │
│ "解码" / "编码"             │ 栈 / 递归                        │
│ "重复子串"                  │ KMP(next数组性质) / 哈希 / 后缀数组│
│ "最长公共前缀"              │ 纵向扫描 / Trie                   │
│ "正则/通配符匹配"           │ DP                                │
│ "字符串转数字"              │ 模拟 + 溢出检查                   │
│ "最长不重复"                │ 滑动窗口 + set/freq               │
└─────────────────────────────┴──────────────────────────────────┘
```

### 字符串题的万能思考路径

```
Step 1: 分析输入规模
  n ≤ 100    → O(n³) DP / 暴力可以
  n ≤ 1000   → O(n²) DP / 中心扩展可以
  n ≤ 10^5   → O(n log n) 或 O(n) 必须
  n ≤ 10^6   → O(n) KMP / 滑动窗口 / Manacher

Step 2: 识别题型
  两个串比较     → 二维 DP（编辑距离/LCS/匹配）
  单个串的子串   → 滑动窗口 / 中心扩展
  单个串的子序列 → DP / 贪心
  查找模式串     → KMP / Rabin-Karp
  前缀相关       → Trie

Step 3: 套模板写代码
  → 先写出模板骨架
  → 再填入本题的具体条件
  → 最后处理边界
```

### 字符串题高频易错点

```
1. 下标从 0 还是 1 开始
   string DP 中 dp[i][j] 通常表示前 i 个和前 j 个字符
   → dp[0][*] 和 dp[*][0] 是空串的情况
   → 访问原字符时要用 s[i-1] 不是 s[i]！

2. substr 的时间复杂度
   s.substr(i, len) 是 O(len)，不是 O(1)
   → 在循环中反复 substr 会 TLE
   → 改用下标比较：s.compare(i, len, t) == 0

3. 字符串比较的时间
   s1 == s2 是 O(n)，不是 O(1)
   → 哈希比较是 O(1)（但有冲突风险）
   → 需要多次比较时考虑 Rabin-Karp

4. 空串和单字符
   s = ""  → size() = 0，任何 s[0] 都越界
   s = "a" → 回文，子串只有自己
   → 写完代码后一定要检查这两个 case

5. ASCII vs 小写字母
   题目说"仅包含小写字母" → int[26] 就够
   题目说"可打印 ASCII"   → int[128]
   题目没说               → 用 unordered_map 最安全

6. 字符串拼接的性能
   ✗ string result; for (...) result = result + s;  // O(n²)！每次创建新串
   ✓ string result; for (...) result += s;           // O(n) 摊销
   ✓ stringstream ss; for (...) ss << s; return ss.str();

7. KMP 的 next 数组下标
   有的教材 next 从 -1 开始，有的从 0 开始
   → 面试时统一用"从 0 开始"的版本（本文的写法）
   → 不要在面试现场切换风格，容易写乱
```

### 字符串算法复杂度速查

```
┌──────────────────────┬────────────────┬────────────────┐
│ 算法                  │ 时间            │ 空间            │
├──────────────────────┼────────────────┼────────────────┤
│ 暴力匹配              │ O(n·m)         │ O(1)           │
│ KMP                  │ O(n+m)         │ O(m)           │
│ Rabin-Karp           │ O(n+m) 平均    │ O(1)           │
│ Trie 插入/查找        │ O(L)           │ O(Σ·L·N)      │
│ 中心扩展（回文）       │ O(n²)          │ O(1)           │
│ Manacher             │ O(n)           │ O(n)           │
│ 编辑距离 DP           │ O(n·m)         │ O(n·m)→O(m)   │
│ LCS DP               │ O(n·m)         │ O(n·m)→O(m)   │
│ 后缀数组构建（倍增）   │ O(n·log²n)     │ O(n)           │
│ 后缀数组构建（SA-IS）  │ O(n)           │ O(n)           │
│ 滑动窗口              │ O(n)           │ O(k) k=字符集  │
└──────────────────────┴────────────────┴────────────────┘
```

------

> 字符串题的核心不是"背多少算法"，而是**快速识别题型 → 套对模板 → 处理好边界**。本文的 10 个部分覆盖了面试中 95% 的字符串题型，建议按难度层级逐个击破：先练滑动窗口和双指针（面试必考），再练 KMP 和 Trie（中高级），最后了解 Manacher 和后缀数组（加分项）。

> 本系列相关文章：
> - [数据结构与算法面试题](/techlearn/posts/ds-algo-interview/) —— 通用算法体系
> - [现代 C++ 面试题](/techlearn/posts/modern-cpp-interview/) —— 语言特性
> - [锁、并发与内存模型面试题](/techlearn/posts/lock-concurrency-memory-model-interview/) —— 多线程
