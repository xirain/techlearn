---
title: C++ 模板元编程面试题 —— 从 SFINAE 到 Concepts 的深度问答
description: 覆盖模板特化/偏特化、SFINAE(enable_if/void_t/decltype)、变参模板与折叠表达式、constexpr编译期计算、Type Traits实现原理、Concepts(C++20)、CRTP、模板调试技巧，22 道高频题附编译展开分析
date: 2026-02-27
categories: [编程语言]
tags: [c++, 面试, 模板, 元编程, SFINAE, Concepts, constexpr, type_traits, CRTP, 编译期]
---

C++ 模板元编程是高级岗位的**硬核区分度题**——语法层面的 C++ 大家都会，但能讲清楚 SFINAE 的工作原理、自己实现 `enable_if`、理解 Concepts 背后的约束推导的人，就是"C++ 语言专家"级别。

这篇文章从**模板基础 → SFINAE → Type Traits → 变参模板 → constexpr → Concepts**逐层深入，每道题都带**编译器展开过程**，帮你理解模板"背后发生了什么"。

> 📌 关联阅读：[现代 C++ 面试题](/techlearn/posts/modern-cpp-interview) · [C++ 对象模型面试题](/techlearn/posts/cpp-object-model-interview)

------

## 第一部分：模板特化与偏特化

### Q1：函数模板和类模板的特化规则有什么区别？

**记忆点**：**类模板支持偏特化，函数模板不支持（用重载替代）**

```cpp
// 类模板：主模板 + 全特化 + 偏特化
template<typename T, typename U>
struct Pair { /* 主模板 */ };

template<>
struct Pair<int, int> { /* 全特化 */ };

template<typename T>
struct Pair<T, int> { /* 偏特化：第二个参数固定为 int */ };

template<typename T>
struct Pair<T, T> { /* 偏特化：两个参数相同 */ };

template<typename T>
struct Pair<T*, T*> { /* 偏特化：两个都是指针 */ };

// 函数模板：只有全特化，不支持偏特化
template<typename T>
void process(T val) { /* 主模板 */ }

template<>
void process<int>(int val) { /* 全特化 */ }

// ❌ 不合法：函数模板偏特化
// template<typename T>
// void process<T*>(T* val) { }

// ✅ 用重载替代
template<typename T>
void process(T* val) { /* 重载，不是偏特化 */ }
```

**函数模板的匹配优先级**：
1. 普通函数（精确匹配）
2. 函数模板特化
3. 函数模板主模板

**面试加分**：不推荐函数模板全特化——它和重载的交互规则容易出 bug。推荐用重载或 `if constexpr` 替代。

---

### Q2：模板的两阶段查找（Two-Phase Lookup）是什么？

**记忆点**：**第一阶段查非依赖名，第二阶段（实例化时）查依赖名**

```cpp
template<typename T>
void foo(T x) {
    bar(42);     // 非依赖名：第一阶段（定义时）查找
    baz(x);      // 依赖名（依赖 T）：第二阶段（实例化时）查找
}

// 第一阶段：模板定义时
//   bar(42) → 在当前作用域查找 bar，找不到就报错
//   baz(x) → x 依赖 T，推迟到实例化

// 第二阶段：foo<int>(1) 实例化时
//   baz(x) → 用 ADL 和普通查找找 baz(int)
```

**常见陷阱**：

```cpp
template<typename T>
struct Derived : Base<T> {
    void foo() {
        x = 1;        // ❌ 第一阶段找不到 x（它在 Base<T> 里）
        this->x = 1;  // ✅ 依赖名，推迟到第二阶段
        Base<T>::x = 1; // ✅ 同上
    }
};
```

---

## 第二部分：SFINAE

### Q3：SFINAE 是什么？它是怎么工作的？

**记忆点**：**Substitution Failure Is Not An Error**——替换失败不是错误，只是排除候选

```cpp
// 编译器对函数模板的处理流程：
// 1. 找到所有候选函数（包括模板）
// 2. 对每个模板进行类型替换
// 3. 替换失败 → 不报错，只是从候选中移除（SFINAE）
// 4. 剩余候选中选择最佳匹配

template<typename T>
typename T::value_type get_value(T container) {  // 候选1
    return container[0];
}

template<typename T>
T get_value(T val) {  // 候选2
    return val;
}

get_value(42);
// 候选1：T=int, int::value_type → 替换失败 → SFINAE 排除
// 候选2：T=int, 返回 int → 成功
// 最终选择候选2
```

**SFINAE 只在"直接上下文"生效**：

```cpp
// ✅ SFINAE 生效（返回类型中的替换失败）
template<typename T>
typename T::type foo(T);

// ❌ SFINAE 不生效（函数体内的错误）
template<typename T>
void foo(T x) {
    typename T::type y;  // 这里的错误是硬错误，不是 SFINAE
}
```

---

### Q4：enable_if 怎么实现的？怎么用？

**记忆点**：`enable_if<true, T>::type = T`，`enable_if<false, T>::type` **不存在**（触发 SFINAE）

```cpp
// 标准库实现（极简版）
template<bool Cond, typename T = void>
struct enable_if {};  // 默认：type 不存在

template<typename T>
struct enable_if<true, T> {
    using type = T;   // 特化：Cond=true 时定义 type
};

// 使用方式1：返回类型
template<typename T>
typename std::enable_if<std::is_integral<T>::value, T>::type
double_it(T val) {
    return val * 2;
}
// T=int: is_integral<int>::value=true → enable_if<true,int>::type=int ✓
// T=string: is_integral<string>::value=false → enable_if<false,...>::type 不存在 → SFINAE

// 使用方式2：模板参数（更简洁）
template<typename T,
         typename = std::enable_if_t<std::is_integral_v<T>>>
T double_it(T val) {
    return val * 2;
}

// 使用方式3：C++17 if constexpr（最推荐）
template<typename T>
auto double_it(T val) {
    if constexpr (std::is_integral_v<T>) {
        return val * 2;
    } else {
        return val;  // 非整数不翻倍
    }
}
```

---

### Q5：void_t 是什么？怎么用它检测类型特征？

**记忆点**：`void_t<Ts...>` = 只要 Ts... 全部合法就是 void，否则 SFINAE

```cpp
// void_t 实现（C++17 标准库提供）
template<typename...>
using void_t = void;

// 用 void_t 检测"是否有 .size() 方法"
template<typename T, typename = void>
struct has_size : std::false_type {};  // 默认：没有

template<typename T>
struct has_size<T, std::void_t<decltype(std::declval<T>().size())>>
    : std::true_type {};  // 特化：如果 T.size() 合法 → true

// 展开过程（T = vector<int>）：
// declval<vector<int>>().size() → 合法，返回 size_t
// void_t<size_t> → void
// has_size<vector<int>, void> 匹配特化版本 → true_type

// 展开过程（T = int）：
// declval<int>().size() → 不合法 → SFINAE
// 回退到主模板 → false_type

static_assert(has_size<std::vector<int>>::value);  // ✓
static_assert(!has_size<int>::value);               // ✓
```

---

### Q6：decltype 和 declval 在模板中怎么配合使用？

**记忆点**：`declval<T>()` = **伪造一个 T 的右值引用，不需要构造函数**

```cpp
// declval 的作用：在编译期"假装"有一个 T 类型的对象
// 不能在运行时调用，只能在 decltype/sizeof 等不求值上下文中用

// 检测两个类型是否能相加
template<typename T, typename U, typename = void>
struct can_add : std::false_type {};

template<typename T, typename U>
struct can_add<T, U,
    std::void_t<decltype(std::declval<T>() + std::declval<U>())>>
    : std::true_type {};

static_assert(can_add<int, double>::value);     // ✓ int + double 合法
static_assert(!can_add<int, std::string>::value); // ✓ int + string 不合法

// 获取返回类型
template<typename F, typename... Args>
using invoke_result_t = decltype(std::declval<F>()(std::declval<Args>()...));

// 示例
auto lambda = [](int x) { return x * 2.0; };
using Result = invoke_result_t<decltype(lambda), int>;  // double
```

---

## 第三部分：Type Traits

### Q7：常用的 Type Traits 有哪些？怎么分类？

**记忆点**：**判断类 / 修改类 / 关系类**

```
Type Traits 分类：

判断类（返回 true/false）：
  is_integral<T>        整数类型？
  is_floating_point<T>  浮点类型？
  is_pointer<T>         指针？
  is_reference<T>       引用？
  is_class<T>           类/结构体？
  is_same<T, U>         同一类型？
  is_base_of<Base, D>   继承关系？
  is_constructible<T, Args...>  能否构造？
  is_trivially_copyable<T>      平凡可拷贝？

修改类（返回修改后的类型）：
  remove_const<T>       去 const
  remove_reference<T>   去引用
  remove_pointer<T>     去指针
  add_const<T>          加 const
  decay<T>              退化（去引用+去const+数组→指针）
  conditional<B, T, F>  B?T:F

关系类：
  common_type<T, U>     公共类型
  invoke_result<F, Args...>  调用结果类型
```

---

### Q8：如何自己实现 is_same 和 remove_const？

**记忆点**：Type Traits 的本质是**模板特化 + 类型计算**

```cpp
// is_same 实现
template<typename T, typename U>
struct is_same : std::false_type {};  // 默认：不同

template<typename T>
struct is_same<T, T> : std::true_type {};  // 特化：相同

// remove_const 实现
template<typename T>
struct remove_const { using type = T; };  // 默认：原样

template<typename T>
struct remove_const<const T> { using type = T; };  // 特化：去 const

// remove_reference 实现
template<typename T>
struct remove_reference { using type = T; };

template<typename T>
struct remove_reference<T&> { using type = T; };

template<typename T>
struct remove_reference<T&&> { using type = T; };

// conditional 实现（编译期三目运算）
template<bool Cond, typename T, typename F>
struct conditional { using type = T; };  // true → T

template<typename T, typename F>
struct conditional<false, T, F> { using type = F; };  // false → F

// decay 实现（简化版）
template<typename T>
struct decay {
    using U = std::remove_reference_t<T>;
    using type = std::conditional_t<
        std::is_array_v<U>,
        std::remove_extent_t<U>*,     // 数组 → 指针
        std::conditional_t<
            std::is_function_v<U>,
            std::add_pointer_t<U>,     // 函数 → 函数指针
            std::remove_cv_t<U>        // 其他 → 去 const/volatile
        >
    >;
};
```

---

## 第四部分：变参模板

### Q9：变参模板（Variadic Templates）怎么展开参数包？

**记忆点**：**递归展开（C++11）vs 折叠表达式（C++17）**

```cpp
// C++11：递归展开
// 基础情况
void print() {}  // 空包终止

// 递归情况
template<typename T, typename... Args>
void print(T first, Args... rest) {
    std::cout << first << " ";
    print(rest...);  // 递归展开剩余参数
}

print(1, "hello", 3.14);
// → print(1, "hello", 3.14)
// → cout << 1; print("hello", 3.14)
// → cout << "hello"; print(3.14)
// → cout << 3.14; print()
// → 终止

// C++17：折叠表达式（更简洁）
template<typename... Args>
void print(Args... args) {
    ((std::cout << args << " "), ...);  // 一元右折叠
}

// C++17：if constexpr 终止递归
template<typename T, typename... Args>
void print(T first, Args... rest) {
    std::cout << first << " ";
    if constexpr (sizeof...(rest) > 0) {
        print(rest...);
    }
}
```

---

### Q10：C++17 折叠表达式有哪几种形式？

**记忆点**：**一元/二元 × 左折叠/右折叠 = 4 种**

```cpp
// 假设参数包 args = {1, 2, 3, 4}

// 一元右折叠：(args op ...)
// 展开为：1 op (2 op (3 op 4))
template<typename... Args>
auto sum(Args... args) { return (args + ...); }
// sum(1,2,3,4) = 1 + (2 + (3 + 4)) = 10

// 一元左折叠：(... op args)
// 展开为：((1 op 2) op 3) op 4
template<typename... Args>
auto sum(Args... args) { return (... + args); }
// sum(1,2,3,4) = ((1 + 2) + 3) + 4 = 10

// 二元右折叠：(args op ... op init)
// 展开为：1 op (2 op (3 op (4 op init)))

// 二元左折叠：(init op ... op args)
// 展开为：(((init op 1) op 2) op 3) op 4

// 实用示例
template<typename... Args>
bool all_true(Args... args) {
    return (... && args);  // 全部为 true
}

template<typename... Args>
bool any_true(Args... args) {
    return (... || args);  // 任一为 true
}

// 打印所有参数（逗号折叠）
template<typename... Args>
void print_all(Args... args) {
    ((std::cout << args << '\n'), ...);
}
```

---

### Q11：怎么在编译期获取参数包的第 N 个类型？

**记忆点**：**递归索引**或 **std::tuple_element**

```cpp
// 方式1：递归实现
template<size_t N, typename T, typename... Ts>
struct nth_type {
    using type = typename nth_type<N - 1, Ts...>::type;
};

template<typename T, typename... Ts>
struct nth_type<0, T, Ts...> {
    using type = T;
};

// 使用
using T = nth_type<2, int, double, std::string>::type;  // std::string

// 方式2：std::tuple_element（标准库）
using T = std::tuple_element_t<2, std::tuple<int, double, std::string>>;
// std::string
```

---

## 第五部分：constexpr 编译期计算

### Q12：constexpr 函数在 C++11/14/17/20 中的能力有什么变化？

**记忆点**：**每个版本放宽限制，C++20 几乎无限制**

```cpp
// C++11 constexpr：只能一条 return 语句
constexpr int factorial_11(int n) {
    return n <= 1 ? 1 : n * factorial_11(n - 1);
}

// C++14 constexpr：允许局部变量、循环、多条语句
constexpr int factorial_14(int n) {
    int result = 1;
    for (int i = 2; i <= n; ++i)
        result *= i;
    return result;
}

// C++17：constexpr if + constexpr lambda
constexpr auto factorial_17 = [](int n) {
    int result = 1;
    for (int i = 2; i <= n; ++i)
        result *= i;
    return result;
};

// C++20：constexpr std::vector, std::string, 虚函数, try-catch...
constexpr int count_words(std::string_view sv) {
    int count = 0;
    bool in_word = false;
    for (char c : sv) {
        if (c == ' ') { in_word = false; }
        else if (!in_word) { in_word = true; count++; }
    }
    return count;
}
static_assert(count_words("hello world") == 2);
```

| 版本 | 新增能力 |
|------|---------|
| C++11 | 只能一条 return，可以递归 |
| C++14 | 局部变量、循环、多条语句 |
| C++17 | constexpr if、constexpr lambda |
| C++20 | 虚函数、动态分配、try-catch、consteval |

---

### Q13：constexpr、consteval、constinit 有什么区别？

**记忆点**：**constexpr = 可以编译期，consteval = 必须编译期，constinit = 变量必须编译期初始化**

```cpp
// constexpr：可以编译期，也可以运行时
constexpr int square(int x) { return x * x; }
constexpr int a = square(5);   // ✅ 编译期
int n = get_input();
int b = square(n);              // ✅ 运行时也行

// consteval（C++20）：必须在编译期求值
consteval int square_ct(int x) { return x * x; }
constexpr int a = square_ct(5); // ✅ 编译期
int b = square_ct(n);           // ❌ 编译错误！运行时值不允许

// constinit（C++20）：变量必须编译期初始化
constinit int global = square(5);  // ✅ 编译期初始化
constinit int bad = get_input();   // ❌ 不能编译期初始化

// constinit 解决的问题：静态初始化顺序（Static Initialization Order Fiasco）
```

| 关键字 | 作用对象 | 编译期要求 | 运行时使用 |
|--------|---------|-----------|-----------|
| constexpr | 函数/变量 | 可以 | 可以 |
| consteval | 函数 | 必须 | 不允许 |
| constinit | 变量 | 初始化必须 | 初始化后可修改 |

---

### Q14：编译期字符串处理有什么实际应用？

**记忆点**：**编译期 hash、格式验证、编码转换**

```cpp
// 编译期字符串 hash（用于 switch-case）
constexpr uint32_t fnv1a(std::string_view sv) {
    uint32_t hash = 2166136261u;
    for (char c : sv) {
        hash ^= static_cast<uint32_t>(c);
        hash *= 16777619u;
    }
    return hash;
}

// 用法：字符串 switch
void handle_command(std::string_view cmd) {
    switch (fnv1a(cmd)) {
        case fnv1a("start"):  do_start();  break;
        case fnv1a("stop"):   do_stop();   break;
        case fnv1a("status"): do_status(); break;
    }
}

// 编译期正则验证（概念验证）
consteval bool is_valid_email_pattern(std::string_view pattern) {
    // 编译期检查格式是否合法
    return pattern.find('@') != std::string_view::npos;
}
static_assert(is_valid_email_pattern("user@domain.com"));
```

---

## 第六部分：CRTP 与高级模式

### Q15：CRTP（Curiously Recurring Template Pattern）是什么？有什么用？

**记忆点**：CRTP = **基类以派生类为模板参数**，实现**静态多态**

```cpp
// CRTP 基本形式
template<typename Derived>
struct Base {
    void interface() {
        // 编译期调用派生类的实现（无虚函数开销）
        static_cast<Derived*>(this)->implementation();
    }
};

struct MyClass : Base<MyClass> {
    void implementation() {
        std::cout << "MyClass::implementation\n";
    }
};

// 使用
MyClass obj;
obj.interface();  // → MyClass::implementation（无虚函数表！）
```

**CRTP 的三大用途**：

```cpp
// 用途1：静态多态（替代虚函数）
template<typename Derived>
struct Shape {
    double area() { return static_cast<Derived*>(this)->area_impl(); }
};
struct Circle : Shape<Circle> {
    double r;
    double area_impl() { return 3.14159 * r * r; }
};

// 用途2：Mixin（给类添加功能）
template<typename Derived>
struct Printable {
    void print() {
        auto& self = static_cast<Derived&>(*this);
        std::cout << self.to_string() << std::endl;
    }
};
struct Widget : Printable<Widget> {
    std::string to_string() { return "Widget"; }
};

// 用途3：计数器（统计实例数量）
template<typename Derived>
struct Counter {
    static inline int count = 0;
    Counter() { ++count; }
    ~Counter() { --count; }
};
struct Dog : Counter<Dog> {};
struct Cat : Counter<Cat> {};
// Dog::count 和 Cat::count 独立计数
```

**CRTP vs 虚函数**：

| 维度 | 虚函数 | CRTP |
|------|--------|------|
| 多态时机 | 运行时 | 编译时 |
| 性能 | 虚函数表间接调用 | 直接调用（可内联） |
| 灵活性 | 可以用基类指针 | 不能（类型在编译时确定） |
| 适用 | 类型在运行时才知道 | 类型在编译时已知 |

---

### Q16：Tag Dispatch 和 if constexpr 哪个更好？

**记忆点**：Tag Dispatch = C++11 老方法，if constexpr = C++17 新方法（更推荐）

```cpp
// Tag Dispatch（C++11）
namespace detail {
    template<typename Iter>
    void advance_impl(Iter& it, int n, std::random_access_iterator_tag) {
        it += n;  // O(1)
    }
    template<typename Iter>
    void advance_impl(Iter& it, int n, std::input_iterator_tag) {
        while (n-- > 0) ++it;  // O(n)
    }
}
template<typename Iter>
void advance(Iter& it, int n) {
    detail::advance_impl(it, n,
        typename std::iterator_traits<Iter>::iterator_category{});
}

// if constexpr（C++17，更简洁）
template<typename Iter>
void advance(Iter& it, int n) {
    if constexpr (std::is_same_v<
        typename std::iterator_traits<Iter>::iterator_category,
        std::random_access_iterator_tag>) {
        it += n;
    } else {
        while (n-- > 0) ++it;
    }
}

// Concepts（C++20，最清晰）
void advance(std::random_access_iterator auto& it, int n) {
    it += n;
}
void advance(std::input_iterator auto& it, int n) {
    while (n-- > 0) ++it;
}
```

---

## 第七部分：C++20 Concepts

### Q17：Concepts 是什么？它解决了什么问题？

**记忆点**：Concepts = **给模板参数加约束**，替代 SFINAE 的可读写法

```cpp
// 问题：SFINAE 的错误信息极其难读
template<typename T,
         typename = std::enable_if_t<std::is_integral_v<T>>>
T double_it(T val) { return val * 2; }

double_it("hello");  // 错误信息：几十行模板实例化错误

// Concepts 解决方案
template<typename T>
concept Integral = std::is_integral_v<T>;

template<Integral T>
T double_it(T val) { return val * 2; }

double_it("hello");  // 错误：constraints not satisfied: Integral<const char*>
//                      ↑ 一行清晰的错误信息！
```

**Concepts 的四种使用语法**：

```cpp
// 定义 Concept
template<typename T>
concept Addable = requires(T a, T b) {
    { a + b } -> std::same_as<T>;
};

// 语法1：约束模板参数
template<Addable T>
T add(T a, T b) { return a + b; }

// 语法2：requires 子句
template<typename T>
    requires Addable<T>
T add(T a, T b) { return a + b; }

// 语法3：尾部 requires
template<typename T>
T add(T a, T b) requires Addable<T> { return a + b; }

// 语法4：简写（auto）
Addable auto add(Addable auto a, Addable auto b) { return a + b; }
```

---

### Q18：requires 表达式怎么写？有哪几种约束？

**记忆点**：**简单约束 / 类型约束 / 复合约束 / 嵌套约束**

```cpp
template<typename T>
concept Container = requires(T c) {
    // 简单约束：表达式必须合法
    c.begin();
    c.end();
    c.size();

    // 类型约束：类型必须存在
    typename T::value_type;
    typename T::iterator;

    // 复合约束：表达式合法 + 返回类型约束
    { c.size() } -> std::convertible_to<std::size_t>;
    { c.begin() } -> std::same_as<typename T::iterator>;
    { *c.begin() } -> std::same_as<typename T::value_type&>;

    // 嵌套约束：额外条件
    requires std::is_default_constructible_v<T>;
};

// 更多示例
template<typename T>
concept Hashable = requires(T a) {
    { std::hash<T>{}(a) } -> std::convertible_to<std::size_t>;
};

template<typename T>
concept Printable = requires(std::ostream& os, T val) {
    { os << val } -> std::same_as<std::ostream&>;
};
```

---

### Q19：Concepts 和 SFINAE/enable_if 的对比？什么时候还需要 SFINAE？

**记忆点**：**能用 Concepts 就用 Concepts，SFINAE 仅在 C++17 以下项目中用**

| 维度 | SFINAE/enable_if | Concepts (C++20) |
|------|------------------|-----------------|
| 可读性 | 差（嵌套模板） | 好（声明式） |
| 错误信息 | 极差（几十行） | 好（约束不满足） |
| 编写难度 | 高 | 低 |
| 编译速度 | 慢 | 快 |
| 可组合性 | 差 | 好（concept 可组合） |
| C++版本要求 | C++11+ | C++20+ |

```cpp
// Concepts 的组合
template<typename T>
concept Sortable = Container<T>
    && requires(T c) {
        { *c.begin() < *c.begin() } -> std::convertible_to<bool>;
    };

// SFINAE 写同样的东西要复杂得多...
```

**仍需要 SFINAE 的场景**：
- 项目无法使用 C++20
- 需要和 C++17 以下的代码交互
- 极其精细的重载控制

---

## 第八部分：模板调试与实战

### Q20：模板编译错误信息太难读，有什么调试技巧？

**记忆点**：**static_assert + 逐步实例化 + 编译器工具**

```cpp
// 技巧1：static_assert 给出清晰错误
template<typename T>
void process(T val) {
    static_assert(std::is_integral_v<T>,
                  "process() requires an integral type");
    // ...
}

// 技巧2：用 type_name 打印类型（调试用）
template<typename T>
void debug_type() {
    // GCC/Clang: __PRETTY_FUNCTION__ 包含模板参数
    std::cout << __PRETTY_FUNCTION__ << std::endl;
}

// 技巧3：逐步实例化，缩小错误范围
// 不要一次写完复杂模板，先用 static_assert 验证每一步
template<typename T>
struct MyTrait {
    using step1 = std::remove_reference_t<T>;
    static_assert(!std::is_void_v<step1>, "Step 1 failed");

    using step2 = std::remove_const_t<step1>;
    static_assert(std::is_class_v<step2>, "Step 2 failed");

    using type = step2;
};

// 技巧4：Clang 的 -fdiagnostics-show-template-tree
// 以树形结构显示模板参数差异
```

---

### Q21：编译期计算在实际项目中有哪些应用？

**记忆点**：**编译期 Map / 状态机 / 序列化 / 单位检查**

```cpp
// 应用1：编译期查找表
constexpr std::array<int, 256> make_hex_table() {
    std::array<int, 256> table{};
    for (int i = 0; i < 256; i++) table[i] = -1;
    for (int i = '0'; i <= '9'; i++) table[i] = i - '0';
    for (int i = 'a'; i <= 'f'; i++) table[i] = i - 'a' + 10;
    for (int i = 'A'; i <= 'F'; i++) table[i] = i - 'A' + 10;
    return table;
}
constexpr auto hex_table = make_hex_table();
// → 编译时生成，运行时零开销查表

// 应用2：强类型单位系统
template<int Meters, int Seconds>
struct Unit {
    double value;
};
using Distance = Unit<1, 0>;   // 米
using Time = Unit<0, 1>;       // 秒
using Speed = Unit<1, -1>;     // 米/秒

template<int M1, int S1, int M2, int S2>
auto operator/(Unit<M1,S1> a, Unit<M2,S2> b) {
    return Unit<M1-M2, S1-S2>{a.value / b.value};
}
// Distance / Time → Speed（编译期保证单位正确！）

// 应用3：编译期正则表达式（如 CTRE 库）
#include <ctre.hpp>
constexpr auto match = ctre::match<"\\d{4}-\\d{2}-\\d{2}">;
if (match("2026-02-27")) { /* ... */ }
// 正则在编译时编译为状态机，运行时极快
```

---

### Q22：模板元编程的"编译期类型列表"怎么实现？

**记忆点**：**TypeList = 编译期的 std::vector<type>**

```cpp
// 类型列表
template<typename... Ts>
struct TypeList {};

// 获取长度
template<typename List>
struct Length;
template<typename... Ts>
struct Length<TypeList<Ts...>> {
    static constexpr size_t value = sizeof...(Ts);
};

// 获取第 N 个类型
template<size_t N, typename List>
struct At;
template<typename T, typename... Ts>
struct At<0, TypeList<T, Ts...>> { using type = T; };
template<size_t N, typename T, typename... Ts>
struct At<N, TypeList<T, Ts...>> : At<N-1, TypeList<Ts...>> {};

// 追加类型
template<typename List, typename T>
struct Append;
template<typename... Ts, typename T>
struct Append<TypeList<Ts...>, T> {
    using type = TypeList<Ts..., T>;
};

// 使用
using MyList = TypeList<int, double, std::string>;
static_assert(Length<MyList>::value == 3);
using Second = At<1, MyList>::type;  // double
using Extended = Append<MyList, char>::type;  // TypeList<int,double,string,char>
```

---

## 面试口诀速记

```
类模板能偏特化，函数模板用重载
两阶段查找：非依赖定义时查，依赖名实例化时查

SFINAE 替换失败非错误，enable_if 控制候选
void_t 检测接口，declval 伪造对象
Type Traits 三类：判断/修改/关系

变参模板两种展开：递归（C++11）折叠（C++17）
constexpr 能编译期，consteval 必须编译期

CRTP 静态多态无虚表，Mixin 加功能不加耦合
Tag Dispatch 老方法，if constexpr 新写法

Concepts 约束清晰易读
requires 四种：简单/类型/复合/嵌套
能用 Concepts 别用 SFINAE

模板调试：static_assert 先验证
编译期应用：查表/单位/状态机
```

---

*这篇文章覆盖了 C++ 模板元编程的核心面试考点。模板是 C++ 最强大也最复杂的特性——建议每道题都在 Compiler Explorer (godbolt.org) 上实际编译运行，看看编译器到底做了什么。*
