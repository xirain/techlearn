---
title: C++ 模板元编程练手代码 —— 6 个可编译运行的编译期计算实战
description: 覆盖SFINAE与enable_if/Concepts替代方案、变参模板与折叠表达式、Type Traits自定义/组合、CRTP静态多态、编译期容器与元函数、模板特化与tag dispatch，每个练习约100行可直接编译运行
date: 2026-02-27
categories: [编程语言]
tags: [c++, 练手代码, 模板元编程, SFINAE, CRTP, type_traits, 变参模板, 折叠表达式, concepts]
---

模板元编程是 C++ 面试的**天花板考点**——能手写 `enable_if`、理解 SFINAE 触发条件、用 CRTP 替代虚函数，展示的是对 C++ 类型系统的深度掌控。这 6 个练习从基础到高级逐步递进。

> 📌 关联阅读：[C++ 模板元编程面试题](/techlearn/posts/cpp-template-metaprogramming-interview) · [现代 C++ 练手代码](/techlearn/posts/modern-cpp-practice) · [C++ 对象模型练手代码](/techlearn/posts/cpp-object-model-practice)

------

## 练习1：SFINAE 与 enable_if

**考点**：SFINAE 原理、`enable_if` 条件编译、`void_t` 检测表达式

```cpp
// sfinae_practice.cpp
// g++ -std=c++17 -o sfinae_practice sfinae_practice.cpp
#include <iostream>
#include <type_traits>
#include <string>
#include <vector>

// ============ 手写 enable_if ============
template<bool B, typename T = void>
struct my_enable_if {};

template<typename T>
struct my_enable_if<true, T> { using type = T; };

template<bool B, typename T = void>
using my_enable_if_t = typename my_enable_if<B, T>::type;

// ============ SFINAE 选择重载 ============
// 整数类型走这个
template<typename T>
auto to_string_v1(T val) -> std::enable_if_t<std::is_integral_v<T>, std::string> {
    return "int:" + std::to_string(val);
}

// 浮点类型走这个
template<typename T>
auto to_string_v1(T val) -> std::enable_if_t<std::is_floating_point_v<T>, std::string> {
    return "float:" + std::to_string(val);
}

// 字符串类型走这个
template<typename T>
auto to_string_v1(T val) -> std::enable_if_t<std::is_same_v<T, std::string>, std::string> {
    return "str:" + val;
}

// ============ void_t 检测类型特征 ============
// 检测类型是否有 .size() 方法
template<typename T, typename = void>
struct has_size : std::false_type {};

template<typename T>
struct has_size<T, std::void_t<decltype(std::declval<T>().size())>> : std::true_type {};

template<typename T>
inline constexpr bool has_size_v = has_size<T>::value;

// 检测类型是否可以 <<
template<typename T, typename = void>
struct is_printable : std::false_type {};

template<typename T>
struct is_printable<T, std::void_t<decltype(std::cout << std::declval<T>())>> : std::true_type {};

// ============ if constexpr 替代 SFINAE（C++17 推荐）============
template<typename T>
std::string to_string_v2(const T& val) {
    if constexpr (std::is_integral_v<T>) {
        return "int:" + std::to_string(val);
    } else if constexpr (std::is_floating_point_v<T>) {
        return "float:" + std::to_string(val);
    } else if constexpr (has_size_v<T>) {
        return "sized[" + std::to_string(val.size()) + "]";
    } else {
        return "unknown";
    }
}

int main() {
    std::cout << "=== 1. my_enable_if ===\n";
    {
        static_assert(std::is_same_v<my_enable_if_t<true, int>, int>);
        // my_enable_if_t<false, int>  → 编译错误（无 type 成员）
        std::cout << "  my_enable_if works!\n";
    }

    std::cout << "\n=== 2. SFINAE 重载选择 ===\n";
    {
        std::cout << "  " << to_string_v1(42) << "\n";
        std::cout << "  " << to_string_v1(3.14) << "\n";
        std::cout << "  " << to_string_v1(std::string("hello")) << "\n";
    }

    std::cout << "\n=== 3. void_t 类型检测 ===\n";
    {
        static_assert(has_size_v<std::string>);
        static_assert(has_size_v<std::vector<int>>);
        static_assert(!has_size_v<int>);
        static_assert(!has_size_v<double>);

        static_assert(is_printable<int>::value);
        static_assert(is_printable<std::string>::value);
        static_assert(!is_printable<std::vector<int>>::value);

        std::cout << "  string has size: " << has_size_v<std::string> << "\n";
        std::cout << "  int has size:    " << has_size_v<int> << "\n";
        std::cout << "  int printable:   " << is_printable<int>::value << "\n";
    }

    std::cout << "\n=== 4. if constexpr 替代 SFINAE ===\n";
    {
        std::cout << "  " << to_string_v2(42) << "\n";
        std::cout << "  " << to_string_v2(3.14) << "\n";
        std::cout << "  " << to_string_v2(std::string("hello")) << "\n";
        std::cout << "  " << to_string_v2(std::vector<int>{1,2,3}) << "\n";
    }

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- SFINAE = Substitution Failure Is Not An Error（替换失败不是错误）
- `enable_if` 通过条件控制模板是否参与重载决议
- `void_t` 是检测表达式是否合法的万能工具
- C++17 的 `if constexpr` 在很多场景下比 SFINAE 更清晰

---

## 练习2：变参模板与折叠表达式

**考点**：参数包展开、递归终止、C++17 折叠表达式、`sizeof...`

```cpp
// variadic_fold.cpp
// g++ -std=c++17 -o variadic_fold variadic_fold.cpp
#include <iostream>
#include <string>
#include <tuple>
#include <sstream>

// ============ C++11 递归展开 ============
// 递归终止
void print_recursive() {
    std::cout << "\n";
}
// 递归展开
template<typename T, typename... Rest>
void print_recursive(T first, Rest... rest) {
    std::cout << first;
    if constexpr (sizeof...(rest) > 0) std::cout << ", ";
    print_recursive(rest...);
}

// ============ C++17 折叠表达式 ============
// (pack op ...) → 右折叠
// (... op pack) → 左折叠
// (pack op ... op init) → 带初值右折叠
// (init op ... op pack) → 带初值左折叠

template<typename... Args>
auto sum(Args... args) {
    return (args + ...);  // 右折叠：(a1 + (a2 + (a3 + a4)))
}

template<typename... Args>
void print_fold(Args&&... args) {
    ((std::cout << args << " "), ...);  // 逗号折叠
    std::cout << "\n";
}

// 所有参数都满足条件？
template<typename... Args>
bool all_positive(Args... args) {
    return (... && (args > 0));  // 左折叠 &&
}

// ============ 编译期字符串拼接 ============
template<typename... Args>
std::string concat(Args&&... args) {
    std::ostringstream oss;
    ((oss << std::forward<Args>(args)), ...);
    return oss.str();
}

// ============ 对 tuple 每个元素执行操作 ============
template<typename Tuple, typename Func, size_t... Is>
void for_each_impl(Tuple& t, Func f, std::index_sequence<Is...>) {
    (f(std::get<Is>(t)), ...);  // 折叠展开
}

template<typename Tuple, typename Func>
void for_each_tuple(Tuple& t, Func f) {
    for_each_impl(t, f,
        std::make_index_sequence<std::tuple_size_v<std::decay_t<Tuple>>>{});
}

// ============ 类型安全的 printf ============
template<typename T>
void format_arg(std::ostream& os, const T& val) {
    os << val;
}

void my_printf(std::ostream& os, const char* fmt) {
    os << fmt;  // 没有参数了，直接输出剩余格式串
}

template<typename T, typename... Rest>
void my_printf(std::ostream& os, const char* fmt, const T& val, const Rest&... rest) {
    while (*fmt) {
        if (*fmt == '{' && *(fmt + 1) == '}') {
            format_arg(os, val);
            my_printf(os, fmt + 2, rest...);
            return;
        }
        os << *fmt++;
    }
}

int main() {
    std::cout << "=== 1. 递归展开 ===\n";
    print_recursive(1, "hello", 3.14, true);

    std::cout << "\n=== 2. 折叠表达式 ===\n";
    std::cout << "  sum(1,2,3,4) = " << sum(1, 2, 3, 4) << "\n";
    std::cout << "  print: "; print_fold("hello", 42, 3.14, true);
    std::cout << "  all_positive(1,2,3) = " << all_positive(1, 2, 3) << "\n";
    std::cout << "  all_positive(1,-2,3) = " << all_positive(1, -2, 3) << "\n";

    std::cout << "\n=== 3. concat ===\n";
    std::cout << "  " << concat("name=", "Alice", ", age=", 30) << "\n";

    std::cout << "\n=== 4. for_each_tuple ===\n";
    {
        auto t = std::make_tuple(42, "hello", 3.14);
        std::cout << "  tuple: ";
        for_each_tuple(t, [](const auto& v) {
            std::cout << v << " ";
        });
        std::cout << "\n";
    }

    std::cout << "\n=== 5. 类型安全 printf ===\n";
    {
        my_printf(std::cout, "  name={}, age={}, score={}\n",
                  std::string("Alice"), 25, 95.5);
    }

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- 折叠表达式（C++17）大幅简化了参数包的展开
- `sizeof...(pack)` 获取参数包大小（编译期常量）
- `index_sequence` 配合 `std::get` 是遍历 tuple 的标准技巧
- 逗号折叠 `((expr), ...)` 可以对每个参数执行操作

---

## 练习3：CRTP 静态多态

**考点**：CRTP 模式、编译期多态替代虚函数、Mixin 模式

```cpp
// crtp_practice.cpp
// g++ -std=c++17 -O2 -o crtp_practice crtp_practice.cpp
#include <iostream>
#include <string>
#include <vector>
#include <chrono>

// ============ CRTP 基本模式 ============
template<typename Derived>
class Shape {
public:
    double area() const {
        return static_cast<const Derived*>(this)->area_impl();
    }
    void describe() const {
        std::cout << "  Shape area = " << area() << "\n";
    }
};

class CRTPCircle : public Shape<CRTPCircle> {
    double r_;
public:
    explicit CRTPCircle(double r) : r_(r) {}
    double area_impl() const { return 3.14159 * r_ * r_; }
};

class CRTPRect : public Shape<CRTPRect> {
    double w_, h_;
public:
    CRTPRect(double w, double h) : w_(w), h_(h) {}
    double area_impl() const { return w_ * h_; }
};

// ============ CRTP Mixin：为类添加功能 ============
// 可打印 Mixin
template<typename Derived>
class Printable {
public:
    void print() const {
        // 调用派生类的 to_string
        std::cout << static_cast<const Derived*>(this)->to_string() << "\n";
    }
};

// 可比较 Mixin（只需实现 <，自动获得 >, <=, >=, ==, !=）
template<typename Derived>
class Comparable {
public:
    bool operator>(const Derived& other) const {
        return other < static_cast<const Derived&>(*this);
    }
    bool operator<=(const Derived& other) const {
        return !(static_cast<const Derived&>(*this) > other);
    }
    bool operator>=(const Derived& other) const {
        return !(static_cast<const Derived&>(*this) < other);
    }
    bool operator==(const Derived& other) const {
        return !(static_cast<const Derived&>(*this) < other)
            && !(other < static_cast<const Derived&>(*this));
    }
    bool operator!=(const Derived& other) const {
        return !(*this == other);
    }
};

class Temperature : public Printable<Temperature>, public Comparable<Temperature> {
    double celsius_;
public:
    explicit Temperature(double c) : celsius_(c) {}

    std::string to_string() const {
        return std::to_string(celsius_) + "°C";
    }
    bool operator<(const Temperature& o) const {
        return celsius_ < o.celsius_;
    }
};

// ============ CRTP 计数器（统计实例数）============
template<typename Derived>
class InstanceCounter {
    static inline int count_ = 0;
protected:
    InstanceCounter()  { ++count_; }
    ~InstanceCounter() { --count_; }
    InstanceCounter(const InstanceCounter&) { ++count_; }
public:
    static int instance_count() { return count_; }
};

class Widget : public InstanceCounter<Widget> {
public:
    std::string name;
    Widget(std::string n) : name(std::move(n)) {}
};

class Gadget : public InstanceCounter<Gadget> {
public:
    int id;
    Gadget(int i) : id(i) {}
};

// ============ CRTP vs 虚函数性能对比思路 ============
// 虚函数版
class VShape {
public:
    virtual ~VShape() = default;
    virtual double area() const = 0;
};
class VCircle : public VShape {
    double r_;
public:
    VCircle(double r) : r_(r) {}
    double area() const override { return 3.14159 * r_ * r_; }
};

int main() {
    std::cout << "=== 1. CRTP 静态多态 ===\n";
    {
        CRTPCircle c(5.0);
        CRTPRect r(3.0, 4.0);
        c.describe();  // Shape area = 78.5398
        r.describe();  // Shape area = 12

        // 注意：不能放进同一个容器（类型不同）
        // std::vector<Shape*> shapes;  // 编译错误
    }

    std::cout << "\n=== 2. Mixin 模式 ===\n";
    {
        Temperature t1(36.5), t2(37.0), t3(36.5);
        t1.print();  // 36.5°C
        t2.print();  // 37.0°C

        std::cout << "  36.5 < 37.0 ? " << (t1 < t2) << "\n";   // 1
        std::cout << "  36.5 > 37.0 ? " << (t1 > t2) << "\n";   // 0
        std::cout << "  36.5 == 36.5? " << (t1 == t3) << "\n";   // 1
        std::cout << "  36.5 != 37.0? " << (t1 != t2) << "\n";   // 1
    }

    std::cout << "\n=== 3. CRTP 实例计数器 ===\n";
    {
        Widget w1("a"), w2("b");
        Gadget g1(1);
        std::cout << "  Widget count: " << Widget::instance_count() << "\n";  // 2
        std::cout << "  Gadget count: " << Gadget::instance_count() << "\n";  // 1
        {
            Widget w3("c");
            std::cout << "  Widget count: " << Widget::instance_count() << "\n";  // 3
        }
        std::cout << "  Widget count: " << Widget::instance_count() << "\n";  // 2
    }

    std::cout << "\n=== 4. CRTP vs 虚函数 ===\n";
    {
        // CRTP：编译期确定调用目标，可以内联
        // 虚函数：运行期通过 vtable 查找，无法内联
        std::cout << "  CRTP: 零开销抽象（编译期解析，可内联）\n";
        std::cout << "  虚函数: 运行时多态（vtable 间接调用）\n";
        std::cout << "  CRTP 缺点: 不能放同一容器，编译慢\n";
        std::cout << "  虚函数优点: 运行时多态，接口统一\n";
    }

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- CRTP = Curiously Recurring Template Pattern（奇异递归模板模式）
- CRTP 的多态在编译期解析，可以被内联优化，零运行时开销
- Mixin 模式通过 CRTP 给类"混入"功能（可打印、可比较等）
- CRTP 的缺点：不同 Derived 类型不兼容，不能放进同一容器

---

## 练习4：Type Traits 自定义与组合

**考点**：自定义 type_traits、`conditional`、`decay`、类型变换

```cpp
// type_traits_practice.cpp
// g++ -std=c++17 -o type_traits_practice type_traits_practice.cpp
#include <iostream>
#include <type_traits>
#include <string>
#include <vector>
#include <array>
#include <map>

// ============ 自定义 Type Traits ============
// 是否是 std::vector
template<typename T>
struct is_vector : std::false_type {};

template<typename T, typename A>
struct is_vector<std::vector<T, A>> : std::true_type {};

template<typename T>
inline constexpr bool is_vector_v = is_vector<T>::value;

// 是否是 std::map
template<typename T>
struct is_map : std::false_type {};

template<typename K, typename V, typename C, typename A>
struct is_map<std::map<K, V, C, A>> : std::true_type {};

// 获取容器元素类型
template<typename T>
struct element_type { using type = T; };

template<typename T, typename A>
struct element_type<std::vector<T, A>> { using type = T; };

template<typename T, size_t N>
struct element_type<std::array<T, N>> { using type = T; };

template<typename T>
using element_type_t = typename element_type<T>::type;

// ============ 类型变换 ============
// 移除所有修饰（const、volatile、引用、指针）
template<typename T>
struct strip {
    using type = T;
};

template<typename T>
struct strip<const T> : strip<T> {};

template<typename T>
struct strip<volatile T> : strip<T> {};

template<typename T>
struct strip<T&> : strip<T> {};

template<typename T>
struct strip<T&&> : strip<T> {};

template<typename T>
struct strip<T*> : strip<T> {};

template<typename T>
using strip_t = typename strip<T>::type;

// ============ 编译期 type list ============
template<typename... Ts>
struct TypeList {
    static constexpr size_t size = sizeof...(Ts);
};

// 获取第 N 个类型
template<size_t N, typename List>
struct type_at;

template<size_t N, typename Head, typename... Tail>
struct type_at<N, TypeList<Head, Tail...>> : type_at<N-1, TypeList<Tail...>> {};

template<typename Head, typename... Tail>
struct type_at<0, TypeList<Head, Tail...>> { using type = Head; };

template<size_t N, typename List>
using type_at_t = typename type_at<N, List>::type;

// 检查类型是否在列表中
template<typename T, typename List>
struct type_contains;

template<typename T>
struct type_contains<T, TypeList<>> : std::false_type {};

template<typename T, typename Head, typename... Tail>
struct type_contains<T, TypeList<Head, Tail...>>
    : std::conditional_t<std::is_same_v<T, Head>,
                         std::true_type,
                         type_contains<T, TypeList<Tail...>>> {};

int main() {
    std::cout << "=== 1. 自定义 Type Traits ===\n";
    {
        static_assert(is_vector_v<std::vector<int>>);
        static_assert(!is_vector_v<std::string>);
        static_assert(!is_vector_v<int>);

        static_assert(is_map<std::map<int, std::string>>::value);
        static_assert(!is_map<std::vector<int>>::value);

        std::cout << "  vector<int> is vector: " << is_vector_v<std::vector<int>> << "\n";
        std::cout << "  string is vector: " << is_vector_v<std::string> << "\n";
    }

    std::cout << "\n=== 2. element_type ===\n";
    {
        static_assert(std::is_same_v<element_type_t<std::vector<int>>, int>);
        static_assert(std::is_same_v<element_type_t<std::vector<std::string>>, std::string>);
        static_assert(std::is_same_v<element_type_t<std::array<double, 5>>, double>);
        static_assert(std::is_same_v<element_type_t<int>, int>);  // 非容器返回自身
        std::cout << "  element_type tests passed!\n";
    }

    std::cout << "\n=== 3. strip（移除所有修饰）===\n";
    {
        static_assert(std::is_same_v<strip_t<const int&>, int>);
        static_assert(std::is_same_v<strip_t<int**>, int>);
        static_assert(std::is_same_v<strip_t<const volatile int*&>, int>);
        static_assert(std::is_same_v<strip_t<int>, int>);
        std::cout << "  strip tests passed!\n";
    }

    std::cout << "\n=== 4. TypeList 编译期类型列表 ===\n";
    {
        using MyTypes = TypeList<int, double, std::string, bool>;
        static_assert(MyTypes::size == 4);

        static_assert(std::is_same_v<type_at_t<0, MyTypes>, int>);
        static_assert(std::is_same_v<type_at_t<1, MyTypes>, double>);
        static_assert(std::is_same_v<type_at_t<2, MyTypes>, std::string>);

        static_assert(type_contains<int, MyTypes>::value);
        static_assert(type_contains<std::string, MyTypes>::value);
        static_assert(!type_contains<float, MyTypes>::value);

        std::cout << "  TypeList size = " << MyTypes::size << "\n";
        std::cout << "  contains int: " << type_contains<int, MyTypes>::value << "\n";
        std::cout << "  contains float: " << type_contains<float, MyTypes>::value << "\n";
    }

    std::cout << "\n=== 5. 标准库 Type Traits 常用组合 ===\n";
    {
        // conditional: 编译期三元运算符
        using BigType = std::conditional_t<(sizeof(int) > 4), int, long long>;
        std::cout << "  BigType = " << typeid(BigType).name() << "\n";

        // decay: 移除引用+const+数组退化+函数退化
        static_assert(std::is_same_v<std::decay_t<const int&>, int>);
        static_assert(std::is_same_v<std::decay_t<int[10]>, int*>);
        static_assert(std::is_same_v<std::decay_t<int(double)>, int(*)(double)>);

        // common_type: 公共类型
        static_assert(std::is_same_v<std::common_type_t<int, double>, double>);

        std::cout << "  standard traits tests passed!\n";
    }

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- 偏特化（partial specialization）是自定义 type_traits 的核心技术
- `strip` 展示了递归模板特化剥离类型修饰符
- TypeList 是编译期类型容器，是很多元编程库的基础
- `conditional_t` 是编译期的三元运算符

---

## 练习5：编译期计算与 constexpr

**考点**：`constexpr` 函数、编译期字符串处理、`consteval`

```cpp
// constexpr_compute.cpp
// g++ -std=c++20 -o constexpr_compute constexpr_compute.cpp
#include <iostream>
#include <array>
#include <string_view>
#include <algorithm>
#include <numeric>

// ============ 编译期查找表 ============
constexpr auto make_sin_table() {
    std::array<double, 360> table{};
    constexpr double PI = 3.14159265358979;
    for (int i = 0; i < 360; ++i) {
        double rad = i * PI / 180.0;
        // 泰勒展开近似 sin（constexpr 不能调用 std::sin）
        double x = rad;
        double term = x;
        double sum = x;
        for (int n = 1; n < 10; ++n) {
            term *= -x * x / ((2.0 * n) * (2.0 * n + 1));
            sum += term;
        }
        table[i] = sum;
    }
    return table;
}

constexpr auto SIN_TABLE = make_sin_table();

// ============ 编译期字符串哈希 ============
constexpr uint32_t fnv1a_hash(std::string_view sv) {
    uint32_t hash = 2166136261u;
    for (char c : sv) {
        hash ^= static_cast<uint32_t>(c);
        hash *= 16777619u;
    }
    return hash;
}

// 配合 switch 使用
void dispatch(std::string_view cmd) {
    switch (fnv1a_hash(cmd)) {
        case fnv1a_hash("get"):
            std::cout << "  GET command\n"; break;
        case fnv1a_hash("set"):
            std::cout << "  SET command\n"; break;
        case fnv1a_hash("del"):
            std::cout << "  DEL command\n"; break;
        default:
            std::cout << "  unknown: " << cmd << "\n";
    }
}

// ============ consteval（必须编译期求值）============
consteval int must_be_compile_time(int n) {
    return n * n;
}

// ============ 编译期排序 ============
template<typename T, size_t N>
constexpr auto sort_array(std::array<T, N> arr) {
    for (size_t i = 0; i < N; ++i)
        for (size_t j = i + 1; j < N; ++j)
            if (arr[i] > arr[j])
                std::swap(arr[i], arr[j]);
    return arr;
}

// ============ 编译期素数筛 ============
template<size_t N>
constexpr auto sieve_primes() {
    std::array<bool, N> is_prime{};
    is_prime.fill(true);
    is_prime[0] = is_prime[1] = false;
    for (size_t i = 2; i * i < N; ++i) {
        if (is_prime[i]) {
            for (size_t j = i * i; j < N; j += i)
                is_prime[j] = false;
        }
    }
    return is_prime;
}

constexpr auto PRIMES = sieve_primes<100>();

int main() {
    std::cout << "=== 1. 编译期查找表 ===\n";
    {
        static_assert(SIN_TABLE[0] < 0.001);    // sin(0) ≈ 0
        static_assert(SIN_TABLE[90] > 0.999);   // sin(90°) ≈ 1
        std::cout << "  sin(30°) = " << SIN_TABLE[30] << "\n";
        std::cout << "  sin(90°) = " << SIN_TABLE[90] << "\n";
        std::cout << "  sin(180°) = " << SIN_TABLE[180] << "\n";
    }

    std::cout << "\n=== 2. 编译期字符串哈希 ===\n";
    {
        constexpr auto h1 = fnv1a_hash("hello");
        constexpr auto h2 = fnv1a_hash("world");
        static_assert(h1 != h2);
        std::cout << "  hash(hello) = " << h1 << "\n";
        std::cout << "  hash(world) = " << h2 << "\n";

        dispatch("get");
        dispatch("set");
        dispatch("del");
        dispatch("unknown");
    }

    std::cout << "\n=== 3. consteval ===\n";
    {
        constexpr int v = must_be_compile_time(7);  // OK
        static_assert(v == 49);
        std::cout << "  7^2 = " << v << " (compile-time only)\n";
        // int x = 5; must_be_compile_time(x);  // 编译错误！
    }

    std::cout << "\n=== 4. 编译期排序 ===\n";
    {
        constexpr auto arr = sort_array(std::array{5, 2, 8, 1, 9, 3});
        static_assert(arr[0] == 1 && arr[5] == 9);
        std::cout << "  sorted: ";
        for (int v : arr) std::cout << v << " ";
        std::cout << "(compile-time)\n";
    }

    std::cout << "\n=== 5. 编译期素数筛 ===\n";
    {
        std::cout << "  primes < 100: ";
        for (int i = 2; i < 100; ++i) {
            if (PRIMES[i]) std::cout << i << " ";
        }
        std::cout << "\n";
        static_assert(PRIMES[2] && PRIMES[97] && !PRIMES[4]);
    }

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- `constexpr` 函数可在编译期和运行期使用
- `consteval` 函数**必须**在编译期求值（否则编译错误）
- 编译期查找表（sin表、素数筛）避免了运行时计算开销
- 编译期字符串哈希 + `switch` 是实现字符串分发的高效技巧

---

## 练习6：模板特化与 Tag Dispatch

**考点**：全特化/偏特化、tag dispatch 模式、编译期分发

```cpp
// tag_dispatch.cpp
// g++ -std=c++17 -o tag_dispatch tag_dispatch.cpp
#include <iostream>
#include <type_traits>
#include <iterator>
#include <vector>
#include <list>
#include <string>

// ============ Tag Dispatch：根据迭代器类别选择算法 ============
// 模拟 std::advance 的实现
namespace my {

// 随机访问迭代器：O(1) 跳转
template<typename It>
void advance_impl(It& it, int n, std::random_access_iterator_tag) {
    std::cout << "  [random_access] O(1) jump\n";
    it += n;
}

// 双向迭代器：O(n) 逐步移动
template<typename It>
void advance_impl(It& it, int n, std::bidirectional_iterator_tag) {
    std::cout << "  [bidirectional] O(n) step\n";
    if (n > 0) while (n--) ++it;
    else       while (n++) --it;
}

// 前向迭代器：只能前进
template<typename It>
void advance_impl(It& it, int n, std::forward_iterator_tag) {
    std::cout << "  [forward] O(n) forward only\n";
    while (n--) ++it;
}

template<typename It>
void advance(It& it, int n) {
    // Tag Dispatch：编译期根据迭代器标签选择实现
    advance_impl(it, n, typename std::iterator_traits<It>::iterator_category{});
}

} // namespace my

// ============ 模板全特化 ============
template<typename T>
struct TypeName {
    static std::string name() { return "unknown"; }
};

template<> struct TypeName<int>         { static std::string name() { return "int"; } };
template<> struct TypeName<double>      { static std::string name() { return "double"; } };
template<> struct TypeName<std::string> { static std::string name() { return "string"; } };

// 偏特化
template<typename T>
struct TypeName<std::vector<T>> {
    static std::string name() { return "vector<" + TypeName<T>::name() + ">"; }
};

template<typename T>
struct TypeName<T*> {
    static std::string name() { return TypeName<T>::name() + "*"; }
};

// ============ Priority Tag（优先级标签）============
template<int N> struct priority_tag : priority_tag<N-1> {};
template<>      struct priority_tag<0> {};

// 最高优先级：有 .serialize()
template<typename T>
auto serialize_impl(const T& v, priority_tag<2>)
    -> decltype(v.serialize(), std::string{}) {
    return v.serialize();
}

// 中等优先级：可以用 to_string
template<typename T>
auto serialize_impl(const T& v, priority_tag<1>)
    -> decltype(std::to_string(v), std::string{}) {
    return std::to_string(v);
}

// 最低优先级：兜底
template<typename T>
std::string serialize_impl(const T&, priority_tag<0>) {
    return "<not serializable>";
}

template<typename T>
std::string serialize(const T& v) {
    return serialize_impl(v, priority_tag<2>{});
}

// 测试类
struct MyObj {
    std::string serialize() const { return "{MyObj}"; }
};

int main() {
    std::cout << "=== 1. Tag Dispatch ===\n";
    {
        std::vector<int> v = {1, 2, 3, 4, 5};
        auto it1 = v.begin();
        my::advance(it1, 3);  // random_access
        std::cout << "  *it1 = " << *it1 << "\n";  // 4

        std::list<int> l = {1, 2, 3, 4, 5};
        auto it2 = l.begin();
        my::advance(it2, 3);  // bidirectional
        std::cout << "  *it2 = " << *it2 << "\n";  // 4
    }

    std::cout << "\n=== 2. 模板特化 ===\n";
    {
        std::cout << "  " << TypeName<int>::name() << "\n";
        std::cout << "  " << TypeName<double>::name() << "\n";
        std::cout << "  " << TypeName<std::vector<int>>::name() << "\n";
        std::cout << "  " << TypeName<std::vector<std::string>>::name() << "\n";
        std::cout << "  " << TypeName<int*>::name() << "\n";
        std::cout << "  " << TypeName<float>::name() << "\n";  // unknown
    }

    std::cout << "\n=== 3. Priority Tag ===\n";
    {
        MyObj obj;
        std::cout << "  " << serialize(obj) << "\n";     // {MyObj} (priority 2)
        std::cout << "  " << serialize(42) << "\n";       // 42 (priority 1)
        std::cout << "  " << serialize(3.14) << "\n";     // 3.14 (priority 1)

        struct NoSerialize {};
        std::cout << "  " << serialize(NoSerialize{}) << "\n";  // <not serializable>
    }

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- Tag Dispatch 利用函数重载在编译期选择实现（STL 常用技术）
- 全特化写死某个具体类型的行为，偏特化对类型模式匹配
- Priority Tag 利用继承关系决定重载优先级，是 SFINAE 的优雅替代
- 这些技术在 C++20 Concepts 出现后有了更清晰的替代方案
