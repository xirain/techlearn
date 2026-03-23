---
title: C++ 面试题实战：编程题 + AI 时代高频问答（修订版）
description: 覆盖数值字符串解析、链表、合并有序数组，并重点澄清 Pod 和 Container（Docker/K8s）的区别，附 AI 时代面试回答模板
date: 2026-03-23
categories: [面试]
tags: [c++, 面试, ai, kubernetes, docker, mcp, function-calling]
---

你给出的面试清单很典型：前半段考编码基本功，后半段考系统理解和表达能力。
这版我重点修正一个易混点：**这里的 pod 和 container，指的是 Docker / K8s 语境，不是 C++ 的 POD 类型**。

---

## 一、编程题（C++）

## 1）数值字符串解析（正负数、复数、科学计数法）

面试策略：

1. 先定义输入协议（允许空格、`a+bi`、`1e-3` 等）；
2. 用标准库解析实数（`std::stod`）；
3. 对复数做结构化拆分（处理 `e+`/`e-` 不能误判为实虚部分隔符）。

```cpp
#include <cmath>
#include <complex>
#include <cctype>
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

std::optional<double> parseReal(const std::string& raw) {
    std::string s = trim(raw);
    if (s.empty()) return std::nullopt;

    size_t pos = 0;
    try {
        double v = std::stod(s, &pos);
        if (pos != s.size()) return std::nullopt;
        if (!std::isfinite(v)) return std::nullopt;
        return v;
    } catch (...) {
        return std::nullopt;
    }
}

std::optional<std::complex<double>> parseComplex(const std::string& raw) {
    std::string s = trim(raw);
    if (s.empty()) return std::nullopt;

    if (s.find('i') == std::string::npos) {
        auto real = parseReal(s);
        if (!real) return std::nullopt;
        return std::complex<double>(*real, 0.0);
    }

    if (s.back() != 'i') return std::nullopt;
    s.pop_back();

    int split = -1;
    for (int i = 1; i < static_cast<int>(s.size()); ++i) {
        if ((s[i] == '+' || s[i] == '-') && s[i - 1] != 'e' && s[i - 1] != 'E') split = i;
    }

    double re = 0.0, im = 0.0;
    if (split == -1) {
        if (s.empty() || s == "+") im = 1.0;
        else if (s == "-") im = -1.0;
        else {
            auto imag = parseReal(s);
            if (!imag) return std::nullopt;
            im = *imag;
        }
    } else {
        auto real = parseReal(s.substr(0, split));
        if (!real) return std::nullopt;
        re = *real;

        std::string is = s.substr(split);
        if (is == "+") im = 1.0;
        else if (is == "-") im = -1.0;
        else {
            auto imag = parseReal(is);
            if (!imag) return std::nullopt;
            im = *imag;
        }
    }

    return std::complex<double>(re, im);
}

std::optional<Numeric> parseNumeric(const std::string& s) {
    auto c = parseComplex(s);
    if (!c) return std::nullopt;
    if (std::abs(c->imag()) < 1e-12) return c->real();
    return *c;
}
```

## 2）链表：头插、尾插、删除 index、在 index 插入 val

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
        if (size_ == 0) head_ = tail_ = n;
        else {
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
        if (index == 0) return pushFront(val);
        if (index == size_) return pushBack(val);

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

## 3）merge 两个有序数组（nums1 预留 m+n 空间）

```cpp
#include <vector>

void merge(std::vector<int>& nums1, int m, const std::vector<int>& nums2, int n) {
    int i = m - 1;
    int j = n - 1;
    int k = m + n - 1;

    while (j >= 0) {
        if (i >= 0 && nums1[i] > nums2[j]) nums1[k--] = nums1[i--];
        else nums1[k--] = nums2[j--];
    }
}
```

复杂度：时间 `O(m+n)`，额外空间 `O(1)`。

---

## 二、面试问答（重点修正版）

## 1）`shared_ptr`、`unique_ptr`、`weak_ptr`

- `unique_ptr`：独占所有权，默认首选；
- `shared_ptr`：共享所有权，有控制块与原子计数开销；
- `weak_ptr`：观察者，不增加强引用计数，用于打破循环引用。

一句话模板：

> 默认 `unique_ptr`，共享语义才上 `shared_ptr`，环引用场景用 `weak_ptr`。

## 2）Pod 和 Container 的区别（Docker / K8s）

> 注意：这里是云原生问题，不是 C++ 的 POD 类型。

可以这样答：

- **Container（容器）**：运行实例（典型由 Docker/containerd 拉起），封装应用进程及其依赖；
- **Pod（K8s）**：Kubernetes 的最小调度单元，里面可以放一个或多个容器，这些容器共享网络命名空间（同一个 Pod IP）和部分存储卷。

面试可加一句：

- 在生产里常见“一个 Pod 一个主容器 + 若干 sidecar（日志、代理、监控）”；
- 也就是说 **Pod 是调度与部署边界，Container 是运行时边界**。

## 3）K8s 的 Pod、Service

- Pod：承载容器、会被重建，IP 可能变化；
- Service：给一组 Pod 提供稳定访问入口（ClusterIP / DNS），通过 label selector 选后端。

一句话：

> Pod 不稳定，Service 提供稳定访问。

## 4）AI 时代传统程序员的优势，如何保持并提升

优势：

- 工程化能力（可维护性、性能、稳定性）；
- 复杂系统排障能力；
- 业务抽象能力（把需求落成系统）。

提升：

- 从“写代码”升级为“定义问题 + 验收标准”；
- 强化架构设计、数据建模、可观测性；
- 与 AI 建立协作流：Prompt 模板、自动化测试、代码评审清单。

## 5）MCP 和 Function Calling

- Function Calling：模型根据 schema 产生函数调用参数，由宿主执行；
- MCP：统一工具与资源接入协议，更偏生态级标准化接入。

一句话：

> Function Calling 偏单应用调用，MCP 偏跨工具生态互联。

## 6）Skill

在 Agent 语境中，Skill 是“可复用能力包”，通常包含：

- 触发条件；
- 步骤模板；
- 工具清单；
- 输出格式与质量标准。

## 7）AI 发展趋势

建议答 4 点：

1. 多模态融合持续增强；
2. Agent 化从问答走向任务执行；
3. 行业化深入（通用模型 + 私域数据 + 专业工具链）；
4. 安全合规与成本优化并行。

---

## 三、30 秒收尾模板

- 编程题：先思路 + 复杂度，再写主路径，最后补边界；
- 概念题：先定义，再对比，最后讲落地场景；
- AI 题：围绕业务价值、可控质量、上线成本。

祝你面试顺利，拿到满意 offer。
