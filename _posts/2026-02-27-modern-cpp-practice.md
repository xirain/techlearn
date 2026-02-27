---
title: 现代 C++ 核心特性练手代码 —— 8 个可编译运行的实战练习
description: 覆盖智能指针与RAII、移动语义与完美转发、lambda与std::function、std::optional/variant/any、结构化绑定与if-constexpr、协程基础、编译期计算，每个练习约100行可直接编译运行
date: 2026-02-27
categories: [编程语言]
tags: [c++, 练手代码, 现代c++, 智能指针, 移动语义, lambda, 协程, constexpr, RAII]
---

面试能答对概念只是第一步，**能当场写出来才是硬实力**。这篇文章提供 8 个现代 C++ 练手程序，每个约 100 行，覆盖面试高频考点，可直接 `g++ -std=c++20` 编译运行。

> 📌 关联阅读：[现代 C++ 面试题](/posts/modern-cpp-interview) · [C++ 对象模型面试题](/posts/cpp-object-model-interview) · [C++ 模板元编程面试题](/posts/cpp-template-metaprogramming-interview)

------

## 练习1：智能指针与 RAII 资源管理器

**考点**：`unique_ptr` 自定义删除器、`shared_ptr` 循环引用、`weak_ptr` 打破循环、RAII 封装

```cpp
// smart_ptr_raii.cpp
// g++ -std=c++17 -o smart_ptr_raii smart_ptr_raii.cpp
#include <iostream>
#include <memory>
#include <functional>
#include <cassert>

// ============ RAII 文件句柄封装 ============
// 用 unique_ptr + 自定义删除器封装 C 资源
class FileGuard {
    struct FileCloser {
        void operator()(FILE* fp) const {
            if (fp) {
                std::cout << "  [FileGuard] fclose called\n";
                fclose(fp);
            }
        }
    };
    std::unique_ptr<FILE, FileCloser> fp_;
public:
    explicit FileGuard(const char* path, const char* mode)
        : fp_(fopen(path, mode)) {
        if (!fp_) throw std::runtime_error("fopen failed");
    }
    FILE* get() const { return fp_.get(); }
    // 移动语义自动可用，拷贝被禁止
};

// ============ 循环引用演示 ============
struct Node {
    std::string name;
    std::shared_ptr<Node> next;   // 强引用
    std::weak_ptr<Node> parent;   // 弱引用打破循环

    Node(std::string n) : name(std::move(n)) {
        std::cout << "  [Node] " << name << " constructed\n";
    }
    ~Node() {
        std::cout << "  [Node] " << name << " destroyed\n";
    }
};

// ============ unique_ptr 工厂模式 ============
class Shape {
public:
    virtual ~Shape() = default;
    virtual double area() const = 0;
};

class Circle : public Shape {
    double r_;
public:
    explicit Circle(double r) : r_(r) {}
    double area() const override { return 3.14159 * r_ * r_; }
};

class Rect : public Shape {
    double w_, h_;
public:
    Rect(double w, double h) : w_(w), h_(h) {}
    double area() const override { return w_ * h_; }
};

// 工厂返回 unique_ptr，所有权转移给调用方
std::unique_ptr<Shape> make_shape(const std::string& type, double a, double b = 0) {
    if (type == "circle") return std::make_unique<Circle>(a);
    if (type == "rect")   return std::make_unique<Rect>(a, b);
    return nullptr;
}

int main() {
    std::cout << "=== 1. RAII FileGuard ===\n";
    {
        FileGuard fg("/dev/null", "w");  // Linux; Windows 用 "NUL"
        fprintf(fg.get(), "hello RAII\n");
        // 离开作用域自动 fclose
    }

    std::cout << "\n=== 2. 循环引用 vs weak_ptr ===\n";
    {
        auto a = std::make_shared<Node>("A");
        auto b = std::make_shared<Node>("B");
        a->next = b;        // A → B (强引用)
        b->parent = a;      // B → A (弱引用，不增加引用计数)

        std::cout << "  a.use_count = " << a.use_count() << "\n";  // 1
        std::cout << "  b.use_count = " << b.use_count() << "\n";  // 2 (a->next)

        // weak_ptr 使用：lock() 提升为 shared_ptr
        if (auto p = b->parent.lock()) {
            std::cout << "  b's parent: " << p->name << "\n";
        }
    } // A 和 B 都能正确析构

    std::cout << "\n=== 3. unique_ptr 工厂 ===\n";
    {
        auto shapes = std::vector<std::unique_ptr<Shape>>{};
        shapes.push_back(make_shape("circle", 5.0));
        shapes.push_back(make_shape("rect", 3.0, 4.0));

        for (const auto& s : shapes) {
            std::cout << "  area = " << s->area() << "\n";
        }
        // vector 析构时自动释放所有 Shape
    }

    std::cout << "\n=== 4. shared_ptr + aliasing constructor ===\n";
    {
        struct Outer {
            int inner_val = 42;
        };
        auto outer = std::make_shared<Outer>();
        // aliasing: shared_ptr 指向 inner_val 但共享 outer 的引用计数
        std::shared_ptr<int> alias(outer, &outer->inner_val);
        std::cout << "  *alias = " << *alias << ", outer.use_count = "
                  << outer.use_count() << "\n";  // 42, 2
    }

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- `unique_ptr` 自定义删除器用于封装 C API（文件、Socket、锁等）
- `weak_ptr::lock()` 返回 `shared_ptr`，为空说明对象已销毁
- 工厂函数返回 `unique_ptr` 是现代 C++ 的标准做法
- aliasing constructor 可以让 `shared_ptr` 指向成员但共享所有权

---

## 练习2：移动语义与完美转发

**考点**：移动构造/赋值、`std::move` vs `std::forward`、万能引用、引用折叠

```cpp
// move_forward.cpp
// g++ -std=c++17 -o move_forward move_forward.cpp
#include <iostream>
#include <string>
#include <vector>
#include <utility>
#include <cassert>

// ============ 可追踪拷贝/移动的 Buffer 类 ============
class Buffer {
    std::string tag_;
    size_t size_;
    int* data_;
public:
    explicit Buffer(std::string tag, size_t n)
        : tag_(std::move(tag)), size_(n), data_(new int[n]{}) {
        std::cout << "  [" << tag_ << "] construct, size=" << size_ << "\n";
    }

    ~Buffer() {
        std::cout << "  [" << tag_ << "] destroy"
                  << (data_ ? "" : " (moved-from)") << "\n";
        delete[] data_;
    }

    // 拷贝构造：深拷贝
    Buffer(const Buffer& o)
        : tag_(o.tag_ + "-copy"), size_(o.size_), data_(new int[o.size_]) {
        std::copy(o.data_, o.data_ + size_, data_);
        std::cout << "  [" << tag_ << "] COPY from " << o.tag_ << "\n";
    }

    // 移动构造：窃取资源
    Buffer(Buffer&& o) noexcept
        : tag_(std::move(o.tag_)), size_(o.size_), data_(o.data_) {
        o.data_ = nullptr;  // 源对象置空
        o.size_ = 0;
        tag_ += "-moved";
        std::cout << "  [" << tag_ << "] MOVE\n";
    }

    // 统一赋值（copy-and-swap idiom）
    Buffer& operator=(Buffer o) noexcept {
        std::swap(tag_, o.tag_);
        std::swap(size_, o.size_);
        std::swap(data_, o.data_);
        return *this;
    }

    size_t size() const { return size_; }
    const std::string& tag() const { return tag_; }
};

// ============ 完美转发：emplace 模拟 ============
template<typename Container, typename... Args>
void emplace_log(Container& c, Args&&... args) {
    std::cout << "  forwarding " << sizeof...(args) << " args\n";
    c.emplace_back(std::forward<Args>(args)...);
    // std::forward 保持左值/右值属性
    // 如果传入的是左值 → 转发为左值引用 → 触发拷贝构造
    // 如果传入的是右值 → 转发为右值引用 → 触发移动构造
}

// ============ std::move 的正确与错误用法 ============
struct Holder {
    std::string name;
    // 正确：参数按值传递，然后 move 进成员
    explicit Holder(std::string n) : name(std::move(n)) {}
};

int main() {
    std::cout << "=== 1. 移动 vs 拷贝 ===\n";
    {
        Buffer a("A", 1024);
        Buffer b = a;               // 拷贝构造
        Buffer c = std::move(a);    // 移动构造（a 被掏空）
        std::cout << "  a.size after move = " << a.size() << "\n";  // 0
    }

    std::cout << "\n=== 2. vector 扩容触发移动 ===\n";
    {
        std::vector<Buffer> v;
        v.reserve(2);  // 预分配，避免多余移动
        v.emplace_back("X", 100);
        v.emplace_back("Y", 200);
        std::cout << "  vector size = " << v.size() << "\n";
    }

    std::cout << "\n=== 3. 完美转发 ===\n";
    {
        std::vector<Buffer> v;
        v.reserve(4);

        Buffer lval("lval", 50);
        emplace_log(v, lval);              // 左值 → 拷贝
        emplace_log(v, std::move(lval));   // 右值 → 移动
        emplace_log(v, "temp", 30);        // 直接构造（完美转发参数）
    }

    std::cout << "\n=== 4. RVO (返回值优化) ===\n";
    {
        // 编译器会做 NRVO，不触发拷贝或移动
        auto make = []() -> Buffer {
            Buffer b("RVO", 64);
            return b;  // NRVO：直接在调用方内存构造
        };
        auto b = make();
        std::cout << "  tag = " << b.tag() << "\n";
    }

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- 移动后源对象必须处于**有效但未指定状态**（析构安全）
- `std::move` 不移动任何东西，只做 `static_cast<T&&>` 类型转换
- `std::forward<T>` 保持实参的左/右值性质（完美转发）
- copy-and-swap 惯用法统一拷贝赋值和移动赋值
- NRVO 是编译器优化，不依赖移动语义

---

## 练习3：Lambda 表达式与 std::function

**考点**：捕获方式、泛型 lambda、`std::function` 开销、立即调用表达式 (IIFE)

```cpp
// lambda_practice.cpp
// g++ -std=c++20 -o lambda_practice lambda_practice.cpp
#include <iostream>
#include <vector>
#include <algorithm>
#include <functional>
#include <string>
#include <numeric>

// ============ 用 lambda 实现策略模式 ============
template<typename T, typename Pred>
std::vector<T> filter(const std::vector<T>& v, Pred pred) {
    std::vector<T> result;
    std::copy_if(v.begin(), v.end(), std::back_inserter(result), pred);
    return result;
}

// ============ lambda 做回调注册 ============
class EventBus {
    using Handler = std::function<void(const std::string&)>;
    std::vector<std::pair<std::string, Handler>> handlers_;
public:
    void on(std::string event, Handler h) {
        handlers_.emplace_back(std::move(event), std::move(h));
    }
    void emit(const std::string& event, const std::string& data) {
        for (auto& [ev, h] : handlers_) {
            if (ev == event) h(data);
        }
    }
};

int main() {
    std::cout << "=== 1. 各种捕获方式 ===\n";
    {
        int x = 10;
        std::string name = "hello";

        auto by_val    = [x]       { return x; };           // 值捕获（拷贝）
        auto by_ref    = [&x]      { x += 1; return x; };  // 引用捕获
        auto by_move   = [s = std::move(name)] { return s.size(); }; // init-capture 移动
        auto all_ref   = [&]       { return x; };           // 隐式全部引用
        auto mutable_l = [x]() mutable { return ++x; };    // mutable 允许修改副本

        std::cout << "  by_val: " << by_val() << "\n";       // 10
        std::cout << "  by_ref: " << by_ref() << "\n";       // 11
        std::cout << "  by_move: " << by_move() << "\n";     // 5
        std::cout << "  mutable: " << mutable_l() << "\n";   // 11 (副本)
        std::cout << "  x after: " << x << "\n";             // 11 (被 by_ref 修改)
    }

    std::cout << "\n=== 2. 泛型 lambda (C++20 template) ===\n";
    {
        // C++14 auto 参数
        auto add14 = [](auto a, auto b) { return a + b; };

        // C++20 显式模板参数
        auto add20 = []<typename T>(T a, T b) -> T { return a + b; };

        std::cout << "  add14(1,2) = " << add14(1, 2) << "\n";
        std::cout << "  add14(s,s) = " << add14(std::string("he"), std::string("llo")) << "\n";
        std::cout << "  add20(3,4) = " << add20(3, 4) << "\n";
    }

    std::cout << "\n=== 3. IIFE (立即调用) ===\n";
    {
        // 用 IIFE 初始化复杂 const 变量
        const auto config = [] {
            struct Config { int port; std::string host; bool debug; };
            Config c;
            c.port = 8080;
            c.host = "localhost";
            c.debug = true;
            return c;
        }();  // 注意末尾 ()
        std::cout << "  config: " << config.host << ":" << config.port << "\n";
    }

    std::cout << "\n=== 4. 高阶函数 + filter ===\n";
    {
        std::vector<int> nums = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};

        auto evens = filter(nums, [](int n) { return n % 2 == 0; });
        auto gt5   = filter(nums, [](int n) { return n > 5; });

        std::cout << "  evens: ";
        for (int n : evens) std::cout << n << " ";
        std::cout << "\n  gt5: ";
        for (int n : gt5) std::cout << n << " ";
        std::cout << "\n";

        // std::accumulate + lambda
        auto sum = std::accumulate(nums.begin(), nums.end(), 0,
            [](int acc, int n) { return acc + n; });
        std::cout << "  sum = " << sum << "\n";
    }

    std::cout << "\n=== 5. EventBus 回调 ===\n";
    {
        EventBus bus;
        int click_count = 0;

        bus.on("click", [&click_count](const std::string& data) {
            ++click_count;
            std::cout << "  click handler: " << data << "\n";
        });
        bus.on("click", [](const std::string& data) {
            std::cout << "  another handler: " << data << "\n";
        });

        bus.emit("click", "button1");
        bus.emit("click", "button2");
        std::cout << "  total clicks = " << click_count << "\n";
    }

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- `[x]` 值捕获是 const 的，需要 `mutable` 才能修改副本
- `[s = std::move(name)]` init-capture 可以移动捕获（C++14）
- C++20 的 `[]<typename T>` 显式模板 lambda 比 `auto` 参数更精确
- IIFE 是初始化复杂 `const` 变量的惯用法
- `std::function` 有类型擦除开销，模板参数 `Pred` 无开销

---

## 练习4：std::optional / variant / any 三件套

**考点**：可空值处理、类型安全联合体、`std::visit` 模式匹配

```cpp
// optional_variant.cpp
// g++ -std=c++17 -o optional_variant optional_variant.cpp
#include <iostream>
#include <optional>
#include <variant>
#include <any>
#include <string>
#include <vector>
#include <map>
#include <cassert>

// ============ std::optional：替代 nullptr/哨兵值 ============
struct User {
    int id;
    std::string name;
};

// 返回 optional 表示"可能没有结果"
std::optional<User> find_user(int id) {
    static const std::map<int, User> db = {
        {1, {1, "Alice"}}, {2, {2, "Bob"}}
    };
    if (auto it = db.find(id); it != db.end()) {
        return it->second;
    }
    return std::nullopt;  // 明确表示"没有"
}

// ============ std::variant：类型安全的 union ============
// JSON 值的简化建模
using JsonValue = std::variant<
    std::nullptr_t,               // null
    bool,                         // true/false
    double,                       // number
    std::string,                  // string
    std::vector<int>              // array (简化)
>;

// 用 overloaded 技巧实现 visitor
template<class... Ts> struct overloaded : Ts... { using Ts::operator()...; };
template<class... Ts> overloaded(Ts...) -> overloaded<Ts...>;  // C++17 CTAD

std::string json_type(const JsonValue& v) {
    return std::visit(overloaded{
        [](std::nullptr_t)             { return std::string("null"); },
        [](bool b)                     { return std::string(b ? "true" : "false"); },
        [](double d)                   { return std::string("number: ") + std::to_string(d); },
        [](const std::string& s)       { return std::string("string: ") + s; },
        [](const std::vector<int>& a)  { return std::string("array[") + std::to_string(a.size()) + "]"; }
    }, v);
}

// ============ std::any：类型擦除容器 ============
class Config {
    std::map<std::string, std::any> data_;
public:
    template<typename T>
    void set(const std::string& key, T value) {
        data_[key] = std::move(value);
    }

    template<typename T>
    T get(const std::string& key) const {
        auto it = data_.find(key);
        if (it == data_.end()) throw std::runtime_error("key not found: " + key);
        return std::any_cast<T>(it->second);  // 类型不匹配抛 bad_any_cast
    }

    bool has(const std::string& key) const {
        return data_.count(key) > 0;
    }
};

int main() {
    std::cout << "=== 1. std::optional ===\n";
    {
        // 正常查找
        if (auto user = find_user(1); user) {  // if with initializer (C++17)
            std::cout << "  found: " << user->name << "\n";
        }

        // 未找到
        auto result = find_user(99);
        std::cout << "  found 99? " << result.has_value() << "\n";  // 0

        // value_or 提供默认值
        auto name = find_user(99).transform([](const User& u) {
            return u.name;  // C++23 monadic: map 操作
        });
        // C++17 写法：
        auto name17 = find_user(99).value_or(User{0, "Unknown"}).name;
        std::cout << "  name_or: " << name17 << "\n";
    }

    std::cout << "\n=== 2. std::variant + visit ===\n";
    {
        std::vector<JsonValue> values = {
            nullptr,
            true,
            3.14,
            std::string("hello"),
            std::vector<int>{1, 2, 3}
        };

        for (const auto& v : values) {
            std::cout << "  " << json_type(v) << "\n";
        }

        // 直接获取（已知类型时）
        JsonValue num = 42.0;
        std::cout << "  get<double>: " << std::get<double>(num) << "\n";

        // 安全获取
        if (auto* p = std::get_if<std::string>(&num)) {
            std::cout << "  is string: " << *p << "\n";
        } else {
            std::cout << "  not a string\n";
        }
    }

    std::cout << "\n=== 3. std::any (类型擦除) ===\n";
    {
        Config cfg;
        cfg.set("port", 8080);
        cfg.set("host", std::string("localhost"));
        cfg.set("debug", true);

        std::cout << "  port = " << cfg.get<int>("port") << "\n";
        std::cout << "  host = " << cfg.get<std::string>("host") << "\n";
        std::cout << "  debug = " << cfg.get<bool>("debug") << "\n";

        // 类型错误会抛异常
        try {
            cfg.get<double>("port");  // port 是 int 不是 double
        } catch (const std::bad_any_cast& e) {
            std::cout << "  bad_any_cast caught: " << e.what() << "\n";
        }
    }

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- `optional` 替代 `nullptr`/`-1` 等哨兵值，语义更清晰
- `variant` 替代 `union` + 手动类型标记，编译期类型安全
- `overloaded` 是 C++17 的经典技巧，配合 `std::visit` 做模式匹配
- `any` 有运行时类型擦除开销，优先用 `variant`（编译期已知类型集合时）

---

## 练习5：结构化绑定与 if-constexpr

**考点**：C++17 结构化绑定、`if constexpr`、`constexpr if` + `type_traits` 编译期分支

```cpp
// structured_binding.cpp
// g++ -std=c++20 -o structured_binding structured_binding.cpp
#include <iostream>
#include <tuple>
#include <map>
#include <string>
#include <type_traits>
#include <vector>
#include <array>
#include <numeric>

// ============ 结构化绑定 ============
// 返回多个值
auto divide(int a, int b) -> std::pair<int, int> {
    return {a / b, a % b};
}

struct Point3D {
    double x, y, z;
};

// ============ if constexpr 编译期分支 ============
template<typename T>
std::string to_string_smart(const T& val) {
    if constexpr (std::is_arithmetic_v<T>) {
        return std::to_string(val);
    } else if constexpr (std::is_same_v<T, std::string>) {
        return val;
    } else if constexpr (std::is_same_v<T, const char*>) {
        return std::string(val);
    } else {
        static_assert(sizeof(T) == 0, "Unsupported type");  // 编译期错误
    }
}

// ============ constexpr 编译期计算 ============
constexpr auto fibonacci(int n) -> long long {
    if (n <= 1) return n;
    long long a = 0, b = 1;
    for (int i = 2; i <= n; ++i) {
        long long t = a + b;
        a = b;
        b = t;
    }
    return b;
}

// constexpr 排序（C++20 允许 constexpr std::array + 算法）
constexpr auto sorted_array() {
    std::array<int, 5> arr = {5, 3, 1, 4, 2};
    // 简单冒泡排序（constexpr 友好）
    for (size_t i = 0; i < arr.size(); ++i)
        for (size_t j = i + 1; j < arr.size(); ++j)
            if (arr[i] > arr[j]) std::swap(arr[i], arr[j]);
    return arr;
}

// ============ 编译期 + 运行期混合 ============
template<typename T, size_t N>
constexpr T array_sum(const std::array<T, N>& arr) {
    T sum = 0;
    for (const auto& v : arr) sum += v;
    return sum;
}

int main() {
    std::cout << "=== 1. 结构化绑定 ===\n";
    {
        // pair 解构
        auto [quotient, remainder] = divide(17, 5);
        std::cout << "  17/5 = " << quotient << " rem " << remainder << "\n";

        // struct 解构
        Point3D p{1.0, 2.0, 3.0};
        auto [x, y, z] = p;
        std::cout << "  point: (" << x << ", " << y << ", " << z << ")\n";

        // map 遍历
        std::map<std::string, int> scores = {{"Alice", 90}, {"Bob", 85}};
        for (const auto& [name, score] : scores) {
            std::cout << "  " << name << ": " << score << "\n";
        }

        // tuple 解构
        auto [a, b, c] = std::make_tuple(1, "hello", 3.14);
        std::cout << "  tuple: " << a << ", " << b << ", " << c << "\n";
    }

    std::cout << "\n=== 2. if constexpr 编译期分支 ===\n";
    {
        std::cout << "  int: " << to_string_smart(42) << "\n";
        std::cout << "  double: " << to_string_smart(3.14) << "\n";
        std::cout << "  string: " << to_string_smart(std::string("hello")) << "\n";
        std::cout << "  cstr: " << to_string_smart("world") << "\n";
        // to_string_smart(std::vector<int>{}) → 编译错误 static_assert
    }

    std::cout << "\n=== 3. constexpr 编译期计算 ===\n";
    {
        // 编译期计算斐波那契
        constexpr auto fib20 = fibonacci(20);
        static_assert(fib20 == 6765, "fib(20) should be 6765");
        std::cout << "  fib(20) = " << fib20 << " (compile-time)\n";

        // 编译期排序
        constexpr auto sorted = sorted_array();
        static_assert(sorted[0] == 1 && sorted[4] == 5);
        std::cout << "  sorted: ";
        for (int v : sorted) std::cout << v << " ";
        std::cout << "(compile-time)\n";

        // 编译期求和
        constexpr std::array<int, 4> arr = {10, 20, 30, 40};
        constexpr auto sum = array_sum(arr);
        static_assert(sum == 100);
        std::cout << "  sum = " << sum << " (compile-time)\n";
    }

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- 结构化绑定适用于 `pair`、`tuple`、`struct`（公有成员）、`array`
- `if constexpr` 在编译期裁剪分支——不满足条件的分支不会被实例化
- C++20 的 `constexpr` 几乎支持所有操作（动态内存除外）
- `static_assert` 在编译期验证结果正确性

---

## 练习6：std::format 与 Ranges (C++20/23)

**考点**：`std::format` 格式化、`std::ranges` 惰性管道、`views` 组合

```cpp
// ranges_format.cpp
// g++ -std=c++23 -o ranges_format ranges_format.cpp
// 注意：需要 GCC 13+ 或 Clang 17+ 完整支持
#include <iostream>
#include <vector>
#include <string>
#include <ranges>
#include <algorithm>
#include <numeric>
#include <format>

struct Employee {
    std::string name;
    int age;
    double salary;
};

int main() {
    std::cout << "=== 1. std::format ===\n";
    {
        int port = 8080;
        std::string host = "localhost";
        double pi = 3.14159265;

        // 基本格式化（替代 printf/stringstream）
        auto s1 = std::format("{}:{}", host, port);
        auto s2 = std::format("pi = {:.3f}", pi);
        auto s3 = std::format("{:>10} | {:05d}", "name", 42);
        auto s4 = std::format("{0} is {0}", "echo");  // 位置参数

        std::cout << "  " << s1 << "\n";  // localhost:8080
        std::cout << "  " << s2 << "\n";  // pi = 3.142
        std::cout << "  " << s3 << "\n";  //       name | 00042
        std::cout << "  " << s4 << "\n";  // echo is echo
    }

    std::cout << "\n=== 2. Ranges 管道操作 ===\n";
    {
        std::vector<int> nums = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};

        // 管道式：过滤偶数 → 平方 → 取前3个
        auto result = nums
            | std::views::filter([](int n) { return n % 2 == 0; })
            | std::views::transform([](int n) { return n * n; })
            | std::views::take(3);

        std::cout << "  even squares (top 3): ";
        for (int v : result) std::cout << v << " ";
        std::cout << "\n";  // 4 16 36
    }

    std::cout << "\n=== 3. Ranges + 结构体 ===\n";
    {
        std::vector<Employee> team = {
            {"Alice", 30, 120000},
            {"Bob", 25, 80000},
            {"Carol", 35, 150000},
            {"Dave", 28, 95000},
        };

        // 薪资 > 90000 的员工名字
        auto high_earners = team
            | std::views::filter([](const Employee& e) { return e.salary > 90000; })
            | std::views::transform([](const Employee& e) { return e.name; });

        std::cout << "  high earners: ";
        for (const auto& name : high_earners) std::cout << name << " ";
        std::cout << "\n";  // Alice Carol Dave

        // 按年龄排序（ranges::sort 直接操作）
        std::ranges::sort(team, {}, &Employee::age);
        std::cout << "  sorted by age: ";
        for (const auto& e : team) {
            std::cout << std::format("{}({}) ", e.name, e.age);
        }
        std::cout << "\n";
    }

    std::cout << "\n=== 4. iota + 惰性求值 ===\n";
    {
        // 无限序列 → 惰性过滤 → 取前 N 个
        auto first_10_primes = std::views::iota(2)
            | std::views::filter([](int n) {
                if (n < 2) return false;
                for (int i = 2; i * i <= n; ++i)
                    if (n % i == 0) return false;
                return true;
            })
            | std::views::take(10);

        std::cout << "  first 10 primes: ";
        for (int p : first_10_primes) std::cout << p << " ";
        std::cout << "\n";  // 2 3 5 7 11 13 17 19 23 29
    }

    std::cout << "\n=== 5. enumerate + zip (C++23) ===\n";
    {
        std::vector<std::string> names = {"Alice", "Bob", "Carol"};

        // C++23 enumerate
        for (auto [i, name] : names | std::views::enumerate) {
            std::cout << std::format("  [{}] {}\n", i, name);
        }
    }

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- `std::format` 是 `printf` 和 `stringstream` 的现代替代，类型安全
- `std::views` 是惰性的——只在遍历时计算，支持无限序列
- 管道操作符 `|` 让数据处理链式可读
- `ranges::sort(container, {}, &Struct::field)` 通过投影排序

---

## 练习7：RAII 封装通用资源管理

**考点**：ScopeGuard、通用 RAII 包装、defer 模式

```cpp
// scope_guard.cpp
// g++ -std=c++17 -o scope_guard scope_guard.cpp
#include <iostream>
#include <functional>
#include <mutex>
#include <string>
#include <memory>

// ============ ScopeGuard：作用域退出时执行清理 ============
class ScopeGuard {
    std::function<void()> cleanup_;
    bool active_ = true;
public:
    explicit ScopeGuard(std::function<void()> f) : cleanup_(std::move(f)) {}
    ~ScopeGuard() { if (active_) cleanup_(); }

    ScopeGuard(ScopeGuard&& o) noexcept
        : cleanup_(std::move(o.cleanup_)), active_(o.active_) {
        o.active_ = false;
    }

    void dismiss() { active_ = false; }  // 取消清理

    ScopeGuard(const ScopeGuard&) = delete;
    ScopeGuard& operator=(const ScopeGuard&) = delete;
};

// 宏简化使用（模拟 Go 的 defer）
#define CONCAT_IMPL(a, b) a##b
#define CONCAT(a, b) CONCAT_IMPL(a, b)
#define DEFER ScopeGuard CONCAT(_defer_, __LINE__) = ScopeGuard

// ============ 通用 RAII 包装器 ============
template<typename T, typename Deleter>
class UniqueHandle {
    T handle_;
    Deleter deleter_;
    bool valid_ = true;
public:
    UniqueHandle(T h, Deleter d) : handle_(h), deleter_(std::move(d)) {}
    ~UniqueHandle() { if (valid_) deleter_(handle_); }

    UniqueHandle(UniqueHandle&& o) noexcept
        : handle_(o.handle_), deleter_(std::move(o.deleter_)), valid_(o.valid_) {
        o.valid_ = false;
    }

    T get() const { return handle_; }
    explicit operator bool() const { return valid_; }

    UniqueHandle(const UniqueHandle&) = delete;
    UniqueHandle& operator=(const UniqueHandle&) = delete;
};

// 工厂函数
template<typename T, typename D>
auto make_handle(T h, D d) { return UniqueHandle<T, D>(h, std::move(d)); }

// ============ LockGuard + 条件执行 ============
template<typename Mutex, typename Func>
auto with_lock(Mutex& m, Func f) -> decltype(f()) {
    std::lock_guard lock(m);  // CTAD (C++17)
    return f();
}

int main() {
    std::cout << "=== 1. ScopeGuard 基本用法 ===\n";
    {
        std::cout << "  entering scope\n";
        ScopeGuard guard([] { std::cout << "  [ScopeGuard] cleanup!\n"; });
        std::cout << "  doing work...\n";
        // 无论正常退出还是异常，都会执行 cleanup
    }

    std::cout << "\n=== 2. DEFER 宏 (模拟 Go defer) ===\n";
    {
        std::cout << "  step 1\n";
        DEFER([] { std::cout << "  [defer 1] last cleanup\n"; });
        std::cout << "  step 2\n";
        DEFER([] { std::cout << "  [defer 2] middle cleanup\n"; });
        std::cout << "  step 3\n";
        // 析构顺序：defer 2 → defer 1（LIFO）
    }

    std::cout << "\n=== 3. dismiss (取消清理) ===\n";
    {
        auto* raw = new int(42);
        ScopeGuard guard([raw] { std::cout << "  deleting\n"; delete raw; });

        // 所有权转移成功，取消 guard
        std::unique_ptr<int> owned(raw);
        guard.dismiss();  // 不再需要 guard 清理
        std::cout << "  owned value = " << *owned << "\n";
    }

    std::cout << "\n=== 4. UniqueHandle (通用 RAII) ===\n";
    {
        // 模拟 socket fd
        int fake_fd = 42;
        auto handle = make_handle(fake_fd, [](int fd) {
            std::cout << "  [UniqueHandle] closing fd=" << fd << "\n";
        });
        std::cout << "  using handle fd=" << handle.get() << "\n";
    }

    std::cout << "\n=== 5. with_lock (RAII 锁) ===\n";
    {
        std::mutex mtx;
        int counter = 0;

        auto result = with_lock(mtx, [&] {
            ++counter;
            std::cout << "  counter = " << counter << " (under lock)\n";
            return counter;
        });
        std::cout << "  result = " << result << "\n";
    }

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- ScopeGuard 是 RAII 的终极应用——确保任何资源在作用域退出时被清理
- `dismiss()` 用于所有权转移成功后取消清理（两阶段提交模式）
- DEFER 宏模拟 Go 的 `defer`，析构顺序是 LIFO（后进先出）
- `with_lock` 将锁的获取和释放封装成高阶函数

---

## 练习8：C++20 Concepts 与约束

**考点**：concept 定义、`requires` 子句、约束函数重载

```cpp
// concepts_practice.cpp
// g++ -std=c++20 -o concepts_practice concepts_practice.cpp
#include <iostream>
#include <concepts>
#include <string>
#include <vector>
#include <type_traits>
#include <cmath>
#include <numeric>

// ============ 自定义 Concept ============
// 可哈希类型
template<typename T>
concept Hashable = requires(T t) {
    { std::hash<T>{}(t) } -> std::convertible_to<size_t>;
};

// 可序列化（有 serialize 方法）
template<typename T>
concept Serializable = requires(const T& t) {
    { t.serialize() } -> std::convertible_to<std::string>;
};

// 数值类型
template<typename T>
concept Numeric = std::integral<T> || std::floating_point<T>;

// 容器类型（有 begin/end/size）
template<typename C>
concept Container = requires(C c) {
    c.begin();
    c.end();
    { c.size() } -> std::convertible_to<size_t>;
};

// ============ 使用 Concept 约束函数 ============
// 方式1：concept 做模板参数
template<Numeric T>
T safe_divide(T a, T b) {
    if constexpr (std::floating_point<T>) {
        if (b == T{0}) return std::numeric_limits<T>::infinity();
    } else {
        if (b == T{0}) throw std::domain_error("divide by zero");
    }
    return a / b;
}

// 方式2：requires 子句
template<typename T>
    requires Serializable<T>
void save(const T& obj) {
    std::cout << "  saving: " << obj.serialize() << "\n";
}

// 方式3：auto + concept（最简写法）
void print_if_numeric(Numeric auto val) {
    std::cout << "  numeric: " << val << "\n";
}

// ============ Concept 重载 ============
// 不同类型走不同分支（比 if constexpr 更清晰）
template<std::integral T>
std::string format_value(T val) {
    return std::to_string(val) + " (integer)";
}

template<std::floating_point T>
std::string format_value(T val) {
    return std::to_string(val) + " (floating)";
}

std::string format_value(const std::string& val) {
    return "\"" + val + "\" (string)";
}

// ============ 泛型容器算法（Concept 约束） ============
template<Container C>
    requires Numeric<typename C::value_type>
auto sum_container(const C& c) {
    using T = typename C::value_type;
    return std::accumulate(c.begin(), c.end(), T{0});
}

// ============ 测试用结构体 ============
struct Config {
    std::string name;
    int version;
    std::string serialize() const {
        return "{name:" + name + ",v:" + std::to_string(version) + "}";
    }
};

int main() {
    std::cout << "=== 1. Concept 约束函数 ===\n";
    {
        std::cout << "  10/3 = " << safe_divide(10, 3) << "\n";       // 3
        std::cout << "  10.0/3 = " << safe_divide(10.0, 3.0) << "\n"; // 3.333
        std::cout << "  1.0/0 = " << safe_divide(1.0, 0.0) << "\n";   // inf

        // safe_divide("a", "b");  // 编译错误：string 不满足 Numeric
    }

    std::cout << "\n=== 2. Serializable concept ===\n";
    {
        Config cfg{"myapp", 3};
        save(cfg);  // OK: Config 有 serialize()
        // save(42);  // 编译错误：int 不满足 Serializable

        // 编译期检查
        static_assert(Serializable<Config>);
        static_assert(!Serializable<int>);
    }

    std::cout << "\n=== 3. Concept 重载 ===\n";
    {
        std::cout << "  " << format_value(42) << "\n";
        std::cout << "  " << format_value(3.14) << "\n";
        std::cout << "  " << format_value(std::string("hello")) << "\n";
    }

    std::cout << "\n=== 4. Container concept ===\n";
    {
        std::vector<int> vi = {1, 2, 3, 4, 5};
        std::vector<double> vd = {1.1, 2.2, 3.3};
        std::cout << "  sum(int) = " << sum_container(vi) << "\n";     // 15
        std::cout << "  sum(double) = " << sum_container(vd) << "\n";  // 6.6

        // sum_container(std::vector<std::string>{"a"});
        // 编译错误：string 不满足 Numeric
    }

    std::cout << "\n=== 5. 标准库 Concepts ===\n";
    {
        // 常用标准 concept 检查
        static_assert(std::integral<int>);
        static_assert(std::floating_point<double>);
        static_assert(std::copyable<std::string>);
        static_assert(std::movable<std::unique_ptr<int>>);
        static_assert(!std::copyable<std::unique_ptr<int>>);  // unique_ptr 不可拷贝
        static_assert(std::default_initializable<std::vector<int>>);

        static_assert(Hashable<int>);
        static_assert(Hashable<std::string>);

        std::cout << "  all static_asserts passed!\n";
    }

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- Concept = 命名的类型约束，替代 `enable_if` + SFINAE
- `requires` 表达式检查：类型是否有某方法、返回值是否满足约束
- Concept 可以直接做函数重载的约束（比 `if constexpr` 更清晰）
- 标准库提供了 `std::integral`、`std::floating_point`、`std::copyable` 等常用 concept
