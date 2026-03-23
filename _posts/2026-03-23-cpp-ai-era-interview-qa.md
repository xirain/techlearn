---
title: C++ 面试题实战：编程题 + AI 时代高频问答一文打包
description: 覆盖数值字符串解析、链表操作、合并有序数组，以及智能指针、POD、K8s、MCP 与 Function Calling、AI 时代程序员竞争力等面试高频题
date: 2026-03-23
categories: [面试]
tags: [c++, 面试, ai, kubernetes, mcp, function-calling]
---

这篇文章按“**编程题** + **面试问答**”两部分整理，适合你在面试前快速复盘，也适合当作回答模板。

---

## 一、编程题（C++）

## 1）数值字符串转字符（包含正负数、复数、科学计数法）

这题的关键不在“自己手写完整数学解析器”，而在于：

- 先定义输入范围；
- 再分类型解析（实数 / 复数）；
- 最后做严格校验（是否完整消费字符串、是否溢出、是否非法格式）。

下面给一个工程可用版本：

```cpp
#include <cmath>
#include <complex>
#include <cctype>
#include <limits>
#include <optional>
#include <string>
#include <variant>

using Numeric = std::variant<double, std::complex<double>>;

static inline std::string trim(std::string s) {
    size_t l = 0, r = s.size();
    while (l < r && std::isspace(static_cast<unsigned char>(s[l]))) ++l;
    while (r > l && std::isspace(static_cast<unsigned char>(s[r - 1]))) --r;
    return s.substr(l, r - l);
}

// 解析纯实数（支持 +3.14, -2, 1e-9）
std::optional<double> parseReal(const std::string& raw) {
    std::string s = trim(raw);
    if (s.empty()) return std::nullopt;

    size_t pos = 0;
    try {
        double v = std::stod(s, &pos);
        if (pos != s.size()) return std::nullopt; // 必须完整消费
        if (!std::isfinite(v)) return std::nullopt;
        return v;
    } catch (...) {
        return std::nullopt;
    }
}

// 解析复数：a+bi / a-bi / bi / a
std::optional<std::complex<double>> parseComplex(const std::string& raw) {
    std::string s = trim(raw);
    if (s.empty()) return std::nullopt;

    // 不含 i，当作实数
    if (s.find('i') == std::string::npos) {
        auto real = parseReal(s);
        if (!real) return std::nullopt;
        return std::complex<double>(*real, 0.0);
    }

    // 必须以 i 结尾
    if (s.back() != 'i') return std::nullopt;
    s.pop_back();

    // 找分隔实部和虚部的 + / -（忽略科学计数法中的 e+ / e-）
    int split = -1;
    for (int i = 1; i < static_cast<int>(s.size()); ++i) {
        if ((s[i] == '+' || s[i] == '-') && s[i - 1] != 'e' && s[i - 1] != 'E') {
            split = i;
        }
    }

    double realPart = 0.0;
    double imagPart = 0.0;

    if (split == -1) {
        // 只有虚部："3" / "-2.5" / "+1e3" / ""(表示 1)
        if (s.empty() || s == "+") imagPart = 1.0;
        else if (s == "-") imagPart = -1.0;
        else {
            auto imag = parseReal(s);
            if (!imag) return std::nullopt;
            imagPart = *imag;
        }
    } else {
        std::string rs = s.substr(0, split);
        std::string is = s.substr(split);

        auto real = parseReal(rs);
        if (!real) return std::nullopt;
        realPart = *real;

        if (is == "+" ) imagPart = 1.0;
        else if (is == "-") imagPart = -1.0;
        else {
            auto imag = parseReal(is);
            if (!imag) return std::nullopt;
            imagPart = *imag;
        }
    }

    return std::complex<double>(realPart, imagPart);
}

std::optional<Numeric> parseNumeric(const std::string& s) {
    auto c = parseComplex(s);
    if (!c) return std::nullopt;
    if (std::abs(c->imag()) < 1e-12) return c->real();
    return *c;
}
```

面试表达建议：

- “我会优先使用标准库能力 + 明确输入约束，不会在面试里造不必要的轮子”；
- “复杂字符串先拆成有限状态（是否含 `i`、是否含 `e/E`）再处理”；
- “强调异常输入和边界处理”。

## 2）链表：头插、尾插、删除 index、在 index 插入 val

题目本质是**指针操作稳定性**。你可以用哑结点（dummy）统一边界。

```cpp
#include <stdexcept>

struct Node {
    int val;
    Node* next;
    explicit Node(int v) : val(v), next(nullptr) {}
};

class LinkedList {
public:
    LinkedList() : head_(nullptr), tail_(nullptr), size_(0) {}

    ~LinkedList() {
        Node* cur = head_;
        while (cur) {
            Node* nxt = cur->next;
            delete cur;
            cur = nxt;
        }
    }

    void pushFront(int val) {
        Node* n = new Node(val);
        n->next = head_;
        head_ = n;
        if (size_ == 0) tail_ = n;
        ++size_;
    }

    void pushBack(int val) {
        Node* n = new Node(val);
        if (size_ == 0) {
            head_ = tail_ = n;
        } else {
            tail_->next = n;
            tail_ = n;
        }
        ++size_;
    }

    void eraseAt(size_t index) {
        if (index >= size_) throw std::out_of_range("index out of range");

        if (index == 0) {
            Node* del = head_;
            head_ = head_->next;
            delete del;
            --size_;
            if (size_ == 0) tail_ = nullptr;
            return;
        }

        Node* prev = head_;
        for (size_t i = 0; i + 1 < index; ++i) prev = prev->next;

        Node* del = prev->next;
        prev->next = del->next;
        if (del == tail_) tail_ = prev;
        delete del;
        --size_;
    }

    void insertAt(size_t index, int val) {
        if (index > size_) throw std::out_of_range("index out of range");
        if (index == 0) {
            pushFront(val);
            return;
        }
        if (index == size_) {
            pushBack(val);
            return;
        }

        Node* prev = head_;
        for (size_t i = 0; i + 1 < index; ++i) prev = prev->next;

        Node* n = new Node(val);
        n->next = prev->next;
        prev->next = n;
        ++size_;
    }

private:
    Node* head_;
    Node* tail_;
    size_t size_;
};
```

复杂度：

- 头插：`O(1)`
- 尾插：`O(1)`（维护 `tail`）
- 删除 index：`O(n)`
- index 插入：`O(n)`

## 3）merge 两个有序数组（nums1 长度 m+n，nums2 长度 n）

经典题，核心是**从后往前双指针**，避免覆盖 `nums1` 里还没比较的数据。

```cpp
#include <vector>

void merge(std::vector<int>& nums1, int m, const std::vector<int>& nums2, int n) {
    int i = m - 1;      // nums1 有效区尾
    int j = n - 1;      // nums2 尾
    int k = m + n - 1;  // 写入位置

    while (j >= 0) {
        if (i >= 0 && nums1[i] > nums2[j]) nums1[k--] = nums1[i--];
        else nums1[k--] = nums2[j--];
    }
}
```

复杂度：时间 `O(m+n)`，额外空间 `O(1)`。

---

## 二、面试问答（可直接背回答结构）

## 1）讲一下 `shared_ptr`、`unique_ptr`、`weak_ptr`

一句话：

- `unique_ptr`：独占所有权，不能拷贝，可移动，最轻量；
- `shared_ptr`：引用计数共享所有权，最后一个释放时析构对象；
- `weak_ptr`：不拥有对象，用来观察 `shared_ptr` 管理的对象，解决循环引用。

面试展开：

- 默认优先 `unique_ptr`，只在确实有共享语义时用 `shared_ptr`；
- `shared_ptr` 有控制块开销（原子计数 + 控制信息）；
- `weak_ptr` 通过 `lock()` 获取临时 `shared_ptr`，需要判空；
- 典型循环引用场景：双向图、父子节点互指。

## 2）POD 和 container 的区别

可以这样答：

- **POD（Plain Old Data）**：强调“像 C 一样简单的数据布局和行为”，可平凡拷贝、内存布局稳定（现代 C++ 中通常用 `trivial + standard-layout` 近似理解）；
- **container（容器）**：如 `std::vector`、`std::map`，是管理一组元素的数据结构，封装了内存管理、迭代器、算法接口。

关键区别：

- POD 是“类型属性”；container 是“数据结构抽象”；
- POD 更偏底层 ABI/序列化友好；container 更偏工程开发效率。

## 3）K8s 的 Pod、Service 是什么

高频标准回答：

- **Pod**：K8s 最小调度单元，包含一个或多个紧密耦合容器，共享网络命名空间和存储卷；
- **Service**：为一组 Pod 提供稳定访问入口（稳定虚拟 IP + DNS），屏蔽 Pod 生命周期变化。

补充两句加分：

- Pod 会漂移和重建，IP 不稳定；
- Service 通过 label selector 关联后端 Pod，可做负载均衡。

## 4）AI 时代传统程序员的优势，如何保持和提升

一个实用回答模板：

1. **传统程序员优势**：
   - 工程化能力（架构、可维护性、性能、稳定性）；
   - 复杂系统调试能力（定位线上问题、读日志、看监控）；
   - 业务抽象与边界把控（把需求变成可交付系统）。

2. **保持优势的方法**：
   - 从“写代码的人”升级为“定义问题和验收标准的人”；
   - 强化系统设计、数据建模、成本与风险意识；
   - 建立“AI 协作工作流”：Prompt 模板、自动测试、代码审查清单。

3. **提升方向**：
   - 学会把 AI 接入现有工程（检索、工具调用、评测）；
   - 掌握领域知识（金融、制造、医疗等），形成不可替代性。

## 5）MCP 和 Function Calling

可以这样对比：

- **Function Calling**：模型按预定义 schema 产出结构化调用参数，由宿主应用执行函数；
- **MCP（Model Context Protocol）**：把“工具、资源、提示”标准化为可发现、可复用的协议层，便于模型与外部系统统一对接。

一句话区分：

- Function Calling 更像“单应用内工具调用机制”；
- MCP 更像“跨应用/跨工具生态的标准接口层”。

## 6）Skill 是什么

在 AI Agent 语境下，`Skill` 可理解为“可复用的能力包”，通常包括：

- 触发条件（何时使用）；
- 工作流步骤（先做什么再做什么）；
- 依赖工具（脚本、API、模板）；
- 输出规范（结果格式、质量标准）。

价值在于把“个人经验”沉淀成“可调用模块”，提升一致性和效率。

## 7）AI 的发展趋势（面试可讲 4 点）

建议按这 4 点回答：

1. **多模态融合持续加强**：文本、图像、语音、视频统一建模与推理；
2. **Agent 化落地**：从“问答模型”走向“可规划 + 可执行任务系统”；
3. **行业化深入**：通用能力 + 行业知识库 + 私有工具链；
4. **治理与成本并重**：安全、合规、可解释、推理成本优化同时推进。

收尾可以说：

> 未来最有竞争力的工程师，不是单纯会写代码的人，而是能把“业务问题 + 工程系统 + AI 能力”闭环的人。

---

## 三、面试临场建议（30 秒版本）

- 编程题：先讲思路与复杂度，再写核心路径，最后补边界；
- 概念题：先一句话定义，再讲对比，再落到工程实践；
- AI 话题：避免空话，始终围绕“业务价值、质量保障、落地成本”。

祝你面试顺利，拿到心仪 offer。
