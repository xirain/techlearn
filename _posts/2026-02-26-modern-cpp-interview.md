---
title: 现代 C++ 面试题全攻略 —— 50 道高频问题与易记答案
description: 覆盖 C++11/14/17/20 的高频面试问题，每道题给出"一句话记忆点"和"展开回答"两个层次，帮你快速准备面试
date: 2026-02-26
categories: [编程语言]
tags: [c++, 面试, 现代c++, 智能指针, 移动语义, 模板, 并发]
---

本文整理了现代 C++ 面试中最常被问到的 50 道题，每道题提供两个层次的回答：

- **记忆点**：一句话核心答案，面试时先说这句，镇住场子
- **展开**：详细解释 + 代码示例，按需展开

建议先通读一遍记忆点，然后对薄弱项深入看展开部分。

------

## 第一部分：智能指针与内存管理

### Q1：unique_ptr 和 shared_ptr 的区别？

**记忆点：unique_ptr 独占，shared_ptr 共享。unique_ptr 零开销，shared_ptr 有引用计数的开销。**

展开：

```
unique_ptr                           shared_ptr
├── 独占所有权，不能拷贝             ├── 共享所有权，可以拷贝
├── 只能 std::move 转移              ├── 内部维护引用计数
├── 零额外开销（和原始指针一样大）    ├── 额外开销（控制块 + 原子操作）
├── 默认首选                         ├── 真正需要共享时才用
└── 离开作用域自动 delete             └── 最后一个 shared_ptr 销毁时 delete
```

```cpp
auto u = std::make_unique<Widget>();   // 独占
// auto u2 = u;                       // ❌ 编译错误
auto u2 = std::move(u);               // ✅ 转移所有权

auto s = std::make_shared<Widget>();   // 共享
auto s2 = s;                          // ✅ 引用计数 = 2
```

### Q2：weak_ptr 解决什么问题？

**记忆点：解决 shared_ptr 的循环引用问题。weak_ptr 不增加引用计数，是一种"观察者"。**

展开：

```cpp
struct B;
struct A {
    std::shared_ptr<B> b_ptr;  // A 持有 B
};
struct B {
    std::shared_ptr<A> a_ptr;  // B 也持有 A → 循环引用！永远不会释放
};

// 解决：把其中一个改成 weak_ptr
struct B {
    std::weak_ptr<A> a_ptr;    // 不增加引用计数，打破循环
};

// 使用 weak_ptr 时需要先 lock()
if (auto sp = weak.lock()) {   // 返回 shared_ptr，如果对象还活着
    sp->doSomething();
}
```

### Q3：make_unique / make_shared 相比直接 new 有什么好处？

**记忆点：异常安全 + 性能优化。make_shared 一次分配控制块和对象（省一次 new）。**

展开：

```cpp
// 问题场景（异常不安全）：
process(std::shared_ptr<A>(new A()), computeB());
// 如果 new A() 成功但 computeB() 抛异常
// → A 的内存泄漏了（shared_ptr 还没来得及接管）

// 安全写法：
process(std::make_shared<A>(), computeB());
// make_shared 是一个完整的表达式，要么全成功要么全失败

// 性能优势（make_shared 独有）：
std::shared_ptr<A>(new A());   // 两次内存分配：1. new A  2. 控制块
std::make_shared<A>();          // 一次内存分配：对象和控制块放在一起
```

### Q4：什么时候还需要用原始指针？

**记忆点：只用于"借用"而非"拥有"。函数参数不涉及所有权转移时用原始指针或引用。**

展开：

```cpp
// ✅ 原始指针用于"非拥有"场景
void draw(const Widget* w) {     // 我只是用一下，不管它的生死
    if (w) w->render();
}

auto owner = std::make_unique<Widget>();
draw(owner.get());               // 传原始指针给不涉及所有权的函数

// 选择指南：
// 不能为 null → 用引用 const Widget&
// 可能为 null → 用原始指针 const Widget*
// 要转移所有权 → 用 unique_ptr
// 要共享所有权 → 用 shared_ptr
```

### Q5：RAII 是什么？

**记忆点：Resource Acquisition Is Initialization —— 资源获取即初始化。用对象的生命周期管理资源，构造时获取，析构时释放。**

展开：

```cpp
// RAII 的核心思想：把资源绑定到对象的生命周期
// 对象创建 → 获取资源
// 对象销毁 → 释放资源
// 永远不需要手动释放

// 智能指针是 RAII：构造时持有内存，析构时释放
// lock_guard 是 RAII：构造时加锁，析构时解锁
// fstream 是 RAII：构造时打开文件，析构时关闭

{
    std::lock_guard<std::mutex> lock(mtx);  // 加锁
    // ... 操作 ...
}   // 离开作用域，自动解锁。即使抛异常也能解锁
```

------

## 第二部分：移动语义与右值引用

### Q6：什么是左值和右值？

**记忆点：左值有名字、有地址、可以取地址（&x）；右值是临时的、没名字、即将销毁的值。**

展开：

```cpp
int x = 42;          // x 是左值（有名字，可以 &x）
                     // 42 是右值（临时值，不能 &42）

std::string s = "hello";
std::string t = s + " world";  // s 是左值
                                // s + " world" 是右值（临时对象）

// 关键记忆法：
// 能放在赋值号左边的 → 左值
// 只能放在右边的临时值 → 右值
```

### Q7：std::move 到底做了什么？

**记忆点：std::move 本身不移动任何东西！它只是把左值强制转换为右值引用，从而让编译器选择移动构造/赋值而非拷贝。**

展开：

```cpp
std::string a = "hello";

// std::move 的作用：把 a 从左值"变成"右值引用
// 这样下面的赋值会调用移动构造，而不是拷贝构造
std::string b = std::move(a);
// 现在：b = "hello"，a = ""（被掏空了）

// std::move 的本质（极简版）：
// template<typename T>
// T&& move(T& x) { return static_cast<T&&>(x); }
// 就是一个 static_cast！

// ⚠️ move 后的对象处于"合法但未定义"状态
// 只能对它做两件事：赋新值 或 析构
```

### Q8：移动构造和拷贝构造的区别？

**记忆点：拷贝构造复制资源（深拷贝），移动构造窃取资源（偷指针）。拷贝 O(n)，移动 O(1)。**

展开：

```
拷贝构造：
  源对象: [ptr → 数据:1,2,3,4,5]     不变
  新对象: [ptr → 新数据:1,2,3,4,5]   分配新内存 + 复制

移动构造：
  源对象: [ptr → nullptr]            被掏空
  新对象: [ptr → 数据:1,2,3,4,5]     直接拿走指针
```

### Q9：什么是完美转发（perfect forwarding）？

**记忆点：用 `std::forward<T>` 保持参数的左值/右值属性不变地传递下去。**

展开：

```cpp
// 问题：写一个工厂函数，要把参数原封不动地传给构造函数
template<typename T, typename... Args>
std::unique_ptr<T> make(Args&&... args) {
    // Args&& 是万能引用（不是右值引用！）
    // std::forward 保持参数原始的左/右值属性
    return std::make_unique<T>(std::forward<Args>(args)...);
}

// 如果传入左值 → forward 让它保持左值 → 调用拷贝构造
// 如果传入右值 → forward 让它保持右值 → 调用移动构造
// 不用 forward 的话，参数进入函数体后全变成左值，右值信息丢失
```

### Q10：移动构造函数为什么要加 noexcept？

**记忆点：标准库容器（如 vector 扩容）只有在移动构造标记了 noexcept 时才会用移动而非拷贝，否则为了异常安全会退回到拷贝。**

展开：

```cpp
class Widget {
public:
    Widget(Widget&& other) noexcept { ... }  // ← 加 noexcept！
    Widget& operator=(Widget&& other) noexcept { ... }
};

// 为什么？
// vector 扩容时要把旧元素搬到新空间
// 如果移动到一半抛异常 → 旧空间已毁，新空间不完整 → 数据丢失！
// 所以 vector 的策略：
//   移动构造有 noexcept → 用移动（快）
//   移动构造没有 noexcept → 用拷贝（安全但慢）
```

------

## 第三部分：Lambda 与函数式编程

### Q11：Lambda 的底层实现是什么？

**记忆点：编译器把 Lambda 转换成一个匿名的函数对象（functor 类），捕获的变量变成类的成员。**

展开：

```cpp
int x = 10;
auto f = [x](int y) { return x + y; };

// 编译器大致生成了这样的代码：
class __lambda_anonymous {
    int x;  // 捕获的变量成为成员
public:
    __lambda_anonymous(int x) : x(x) {}
    int operator()(int y) const { return x + y; }
};
auto f = __lambda_anonymous(x);
```

### Q12：Lambda 按值捕获和按引用捕获的区别和陷阱？

**记忆点：按值 `[=]` 复制一份快照（安全但可能过时），按引用 `[&]` 直接引用外部变量（高效但可能悬空）。**

展开：

```cpp
// 陷阱 1：按引用捕获，但 Lambda 活得比被捕获变量长
std::function<int()> createCounter() {
    int count = 0;
    return [&count]() { return ++count; };  // ❌ count 已销毁，悬空引用！
}

// 修复：按值捕获 + mutable
std::function<int()> createCounter() {
    int count = 0;
    return [count]() mutable { return ++count; };  // ✅ 拷贝了一份
}

// 陷阱 2：在类中 [=] 捕获 this
class Widget {
    int data = 42;
    auto getLambda() {
        return [=]() { return data; };
        // 实际捕获的是 this 指针！不是 data 的副本
        // Widget 销毁后 Lambda 就悬空了
    }
    // C++17 修复：[*this] 显式拷贝整个对象
};
```

### Q13：std::function 和 Lambda 的关系？

**记忆点：Lambda 是具体的匿名函数对象，std::function 是通用的函数包装器。Lambda 零开销，std::function 有类型擦除的开销。**

展开：

```cpp
// Lambda 类型是唯一的匿名类型，只有 auto 能接
auto f1 = [](int x) { return x * 2; };  // 零开销

// std::function 可以存任何可调用对象（类型擦除）
std::function<int(int)> f2 = [](int x) { return x * 2; };  // 有开销
// f2 内部做了堆分配 + 虚函数调用

// 选择指南：
// 不需要存储/传递 → auto（零开销）
// 需要统一类型存储（如回调容器）→ std::function
// 模板参数 → 直接用模板（零开销）
template<typename F>
void apply(F&& func) { func(42); }  // 最高效
```

------

## 第四部分：auto 与类型推导

### Q14：auto 的推导规则？

**记忆点：auto 推导规则和模板参数推导一致 —— 去掉顶层 const 和引用。想保留引用用 `auto&`，想保留 const 用 `const auto&`。**

展开：

```cpp
int x = 42;
const int& rx = x;

auto a = rx;         // int（去掉了 const 和 &，是个副本）
auto& b = rx;        // const int&（保留了引用和 const）
const auto& c = x;   // const int&
auto&& d = x;        // int&（万能引用绑定到左值）
auto&& e = 42;       // int&&（万能引用绑定到右值）
```

### Q15：decltype 和 auto 的区别？

**记忆点：auto 推导时会去掉引用和顶层 const，decltype 完全保留表达式的类型（包括引用）。**

展开：

```cpp
int x = 42;
int& rx = x;

auto a = rx;            // int（auto 去掉了引用）
decltype(rx) b = x;     // int&（decltype 保留引用）
decltype(auto) c = rx;  // int&（C++14，结合两者：用 auto 的推导时机 + decltype 的保留规则）

// decltype 的一个重要用途：
// 推导函数返回类型
template<typename T, typename U>
auto add(T a, U b) -> decltype(a + b) {
    return a + b;
}
```

------

## 第五部分：并发编程

### Q16：std::mutex 和 std::lock_guard 的关系？

**记忆点：mutex 是锁本身，lock_guard 是 RAII 包装器（构造加锁，析构解锁），防止忘记解锁或异常时死锁。**

展开：

```cpp
std::mutex mtx;

// ❌ 手动加锁解锁（不安全）
mtx.lock();
// 如果这里抛异常 → 死锁！永远不会 unlock
doSomething();
mtx.unlock();

// ✅ lock_guard 自动管理
{
    std::lock_guard<std::mutex> lock(mtx);  // 加锁
    doSomething();
}   // 自动解锁，即使抛异常

// C++17 简化写法
{
    std::scoped_lock lock(mtx);     // 自动推导类型
    // scoped_lock 还能同时锁多个 mutex，防止死锁
    std::scoped_lock lock2(mtx1, mtx2);  // 一次性锁两个
}
```

### Q17：std::atomic 解决什么问题？

**记忆点：保证单个变量的读写是原子操作（不被线程切换打断），无需加锁。适合简单的计数器、标志位。**

展开：

```cpp
// ❌ 非原子操作（数据竞争）
int counter = 0;
// 线程 A: counter++  →  读(0) → 加 1 → 写(1)
// 线程 B: counter++  →  读(0) → 加 1 → 写(1)  ← 结果应该是 2，实际是 1

// ✅ 原子操作
std::atomic<int> counter{0};
counter++;                // 原子操作，线程安全
counter.fetch_add(5);     // 原子加
counter.store(100);       // 原子写
int val = counter.load(); // 原子读
```

### Q18：std::async 和 std::thread 的区别？

**记忆点：thread 是底层线程，你负责管理生命周期；async 是高层抽象，自动管理线程并通过 future 返回结果。**

展开：

```cpp
// std::thread：手动管理
std::thread t([]() { doWork(); });
t.join();  // 必须 join 或 detach，否则析构时程序终止

// std::async：自动管理 + 返回值
auto future = std::async(std::launch::async, []() {
    return computeResult();  // 在另一个线程中计算
});
auto result = future.get();  // 阻塞等待结果

// async 的优势：
// 1. 自动管理线程生命周期
// 2. 可以获取返回值
// 3. 异常会通过 future 传递回来
```

### Q19：什么是 std::promise 和 std::future？

**记忆点：promise 是"承诺给你一个值"（生产者），future 是"等着拿那个值"（消费者）。一对一的线程间通信。**

展开：

```cpp
std::promise<int> prom;
std::future<int> fut = prom.get_future();

// 生产者线程
std::thread producer([&prom]() {
    int result = heavyComputation();
    prom.set_value(result);  // 兑现承诺
});

// 消费者线程
int value = fut.get();  // 阻塞等待，直到 promise 兑现
producer.join();
```

------

## 第六部分：模板与泛型编程

### Q20：typename 和 class 在模板参数中有区别吗？

**记忆点：在模板参数声明中完全等价，没有区别。但在访问依赖类型时必须用 typename。**

展开：

```cpp
template<typename T>   // ← typename 和 class 完全一样
template<class T>      // ← 没有任何区别，纯粹风格偏好

// 但这里必须用 typename：
template<typename T>
void foo() {
    typename T::value_type x;  // 告诉编译器这是一个类型，不是静态成员
}
```

### Q21：什么是 SFINAE？

**记忆点：Substitution Failure Is Not An Error —— 模板替换失败不是错误，只是让这个重载"消失"，编译器会继续尝试其他重载。**

展开：

```cpp
// C++11 的 enable_if 利用了 SFINAE
template<typename T>
typename std::enable_if<std::is_integral<T>::value, T>::type
double_it(T x) { return x * 2; }  // 只对整数类型有效

template<typename T>
typename std::enable_if<std::is_floating_point<T>::value, T>::type
double_it(T x) { return x * 2.0; }  // 只对浮点类型有效

// C++20 用 Concepts 替代了 SFINAE，写法清爽得多
template<std::integral T>
T double_it(T x) { return x * 2; }
```

### Q22：什么是 Concepts（C++20）？

**记忆点：Concepts 是模板参数的"类型约束"，让编译器在你用错类型时给出清晰的错误信息，替代了 SFINAE。**

展开：

```cpp
// 定义 Concept
template<typename T>
concept Hashable = requires(T a) {
    { std::hash<T>{}(a) } -> std::convertible_to<size_t>;
};

// 使用 Concept 约束模板
template<Hashable T>
void addToHashSet(T value) { ... }

// 或者简写
void addToHashSet(Hashable auto value) { ... }

// 用错类型时的错误信息：
// "MyClass does not satisfy Hashable"  ← 一目了然
// 对比 SFINAE 的错误信息：几十行天书
```

### Q23：变参模板怎么用？

**记忆点：`typename... Args` 定义参数包，`Args...` 展开参数包。C++17 的折叠表达式让展开更简洁。**

展开：

```cpp
// C++11：递归展开
template<typename T>
void print(T t) { std::cout << t << std::endl; }

template<typename T, typename... Rest>
void print(T first, Rest... rest) {
    std::cout << first << " ";
    print(rest...);  // 递归，每次少一个参数
}

// C++17：折叠表达式（一行搞定）
template<typename... Args>
void print(Args... args) {
    ((std::cout << args << " "), ...);  // 逗号折叠
    std::cout << std::endl;
}

print(1, "hello", 3.14);  // 1 hello 3.14
```

------

## 第七部分：C++17 实用特性

### Q24：std::optional 的作用？

**记忆点：表示"可能有值也可能没有值"，替代用 -1/nullptr/特殊值 表示"无效"的老做法。**

展开：

```cpp
// 以前
int findIndex(/*...*/) { return -1; }  // -1 是什么意思？要查文档

// 现在
std::optional<int> findIndex(/*...*/) {
    if (found) return index;
    return std::nullopt;  // 明确表示"没找到"
}

auto idx = findIndex(/*...*/);
if (idx.has_value()) { use(*idx); }    // 写法 1
if (idx) { use(*idx); }               // 写法 2（optional 可转 bool）
int val = idx.value_or(-1);            // 写法 3（有默认值）
```

### Q25：std::variant 和 union 的区别？

**记忆点：variant 是类型安全的 union —— 它知道当前存的是什么类型，访问错误类型会抛异常而不是未定义行为。**

展开：

```cpp
std::variant<int, std::string, double> v;

v = 42;                    // 存 int
v = "hello"s;              // 现在存 string

// 安全访问
auto& s = std::get<std::string>(v);  // ✅
// auto& i = std::get<int>(v);       // ❌ 抛 std::bad_variant_access

// 用 visit 做模式匹配（最推荐的方式）
std::visit([](auto&& arg) {
    std::cout << arg << std::endl;    // 编译器为每种类型生成一个分支
}, v);
```

### Q26：if constexpr 和普通 if 的区别？

**记忆点：if constexpr 在编译期决定走哪个分支，不满足的分支直接丢弃不编译。普通 if 两个分支都必须能编译。**

展开：

```cpp
template<typename T>
auto process(T value) {
    if constexpr (std::is_integral_v<T>) {
        return value / 2;       // 只有整数类型才编译这行
    } else {
        return value.substr(1); // 只有字符串类型才编译这行
    }
}

// 如果用普通 if：
// process(42) 时，value.substr(1) 也要编译 → 编译错误！
// if constexpr 把不满足的分支直接丢弃了
```

### Q27：结构化绑定（Structured Bindings）有什么限制？

**记忆点：可以绑定数组、tuple/pair、以及所有公开成员的结构体。不能绑定继承的成员、不能部分绑定。**

展开：

```cpp
// ✅ 数组
int arr[3] = {1, 2, 3};
auto [a, b, c] = arr;

// ✅ pair / tuple
auto [key, value] = std::make_pair("age", 25);

// ✅ 简单结构体
struct Point { double x, y; };
auto [x, y] = Point{1.0, 2.0};

// ❌ 不能只绑定部分成员
// auto [x] = Point{1.0, 2.0};  // 错误：成员数不匹配
```

------

## 第八部分：constexpr 与编译期计算

### Q28：constexpr 变量和 const 变量的区别？

**记忆点：constexpr 保证编译期求值，const 只保证运行时不可修改（值可能在运行时才确定）。**

展开：

```cpp
const int a = getValue();       // 运行时求值也行，只是不能修改
constexpr int b = 42;           // 必须编译期就能确定
// constexpr int c = getValue(); // ❌ 除非 getValue() 也是 constexpr

constexpr int factorial(int n) {
    return n <= 1 ? 1 : n * factorial(n - 1);
}

constexpr int x = factorial(10);   // 编译期算好 = 3628800
int y = factorial(n);              // 如果 n 不是编译期常量 → 运行时计算
```

### Q29：consteval 和 constexpr 的区别（C++20）？

**记忆点：constexpr 可以在编译期或运行时执行（两栖）；consteval 强制只能在编译期执行（纯编译期）。**

展开：

```cpp
constexpr int maybeCompileTime(int x) { return x * 2; }
// 传编译期常量 → 编译期执行
// 传运行时变量 → 运行时执行

consteval int mustCompileTime(int x) { return x * 2; }  // C++20
// 传编译期常量 → ✅ 编译期执行
// 传运行时变量 → ❌ 编译错误
```

------

## 第九部分：容器与算法

### Q30：emplace_back 和 push_back 的区别？

**记忆点：push_back 接受一个已构造好的对象（可能拷贝/移动），emplace_back 直接在容器内部原地构造（转发参数给构造函数），省一次移动。**

展开：

```cpp
std::vector<std::pair<int, std::string>> v;

// push_back：先构造临时对象，再移动到容器内
v.push_back({1, "hello"});           // 构造 pair → 移动到 vector

// emplace_back：直接在容器末尾构造
v.emplace_back(1, "hello");          // 直接构造 pair，无需临时对象

// 对于简单类型（int, string）差别不大
// 对于构造成本高的对象，emplace_back 更优
```

### Q31：unordered_map 和 map 的区别？

**记忆点：map 用红黑树（有序，O(log n)），unordered_map 用哈希表（无序，平均 O(1)）。大多数场景 unordered_map 更快。**

展开：

```
                map              unordered_map
底层结构        红黑树            哈希表
查找            O(log n)         O(1) 平均，O(n) 最差
插入            O(log n)         O(1) 平均
有序遍历        ✅ 按 key 排序    ❌ 无序
key 要求        要有 < 运算符     要有 hash 函数 + == 运算符
内存            较紧凑            可能浪费（预留桶）
```

### Q32：std::array 相比 C 数组有什么优势？

**记忆点：std::array 是零开销的 C 数组封装，但多了边界检查、可以拷贝赋值、支持 STL 算法。**

展开：

```cpp
// C 数组
int arr[5] = {1,2,3,4,5};
// sizeof(arr) 在传参后变成指针大小
// 不能直接拷贝赋值
// 没有 .size()

// std::array
std::array<int, 5> arr = {1,2,3,4,5};
arr.size();          // 5，永远正确
arr.at(10);          // 抛异常（越界检查）
arr[10];             // 未定义行为（和 C 数组一样快）
auto arr2 = arr;     // 可以直接拷贝！

// 性能：和 C 数组完全一样（零开销抽象）
```

------

## 第十部分：现代 C++ 设计模式与习惯用法

### Q33：什么是"零成本抽象"（Zero-Cost Abstraction）？

**记忆点：C++ 的设计哲学 —— 你使用高级抽象（如 unique_ptr、range-for、Lambda），生成的机器码和你手写底层代码一样高效。用了不额外付费，不用也不预先扣费。**

展开：

```cpp
// unique_ptr vs 原始指针 → 生成相同的汇编代码
// std::array vs C 数组 → 生成相同的汇编代码
// range-for vs 手写 for → 生成相同的汇编代码
// Lambda vs 函数指针 → Lambda 通常更快（可以内联）

// 这是 C++ 和 Java/C# 的核心区别：
// Java: 所有抽象都有运行时开销（GC、虚函数调用、堆分配）
// C++:  大部分抽象在编译期消解，运行时零开销
```

### Q34：什么是 Rule of Five / Rule of Zero？

**记忆点：Rule of Five —— 如果你定义了析构/拷贝/移动中的任何一个，就应该定义全部五个。Rule of Zero —— 最好一个都不定义，用智能指针和标准容器让编译器自动生成。**

展开：

```cpp
// Rule of Five（需要手动管理资源时）
class Buffer {
public:
    ~Buffer();                                    // 1. 析构
    Buffer(const Buffer&);                        // 2. 拷贝构造
    Buffer& operator=(const Buffer&);             // 3. 拷贝赋值
    Buffer(Buffer&&) noexcept;                    // 4. 移动构造
    Buffer& operator=(Buffer&&) noexcept;         // 5. 移动赋值
};

// Rule of Zero（推荐：用智能指针，啥都不用写）
class Widget {
    std::string name;                   // 自动管理
    std::vector<int> data;              // 自动管理
    std::unique_ptr<Impl> pImpl;        // 自动管理
    // 不需要写任何特殊成员函数！编译器全部自动生成
};
```

### Q35：什么是 pImpl 惯用法？

**记忆点：把类的实现细节藏在一个指向实现类的指针里（Pointer to Implementation），减少编译依赖、加快编译、保持 ABI 稳定。**

展开：

```cpp
// widget.h（头文件，暴露给用户）
class Widget {
public:
    Widget();
    ~Widget();
    void doSomething();
private:
    struct Impl;                        // 前向声明
    std::unique_ptr<Impl> pImpl;        // 只有一个指针
};

// widget.cpp（实现文件，细节全藏这里）
struct Widget::Impl {
    std::string name;
    std::vector<int> data;
    HeavyDependency dep;                // 用户不需要包含这些头文件
};

Widget::Widget() : pImpl(std::make_unique<Impl>()) {}
Widget::~Widget() = default;  // 必须在 cpp 中定义（Impl 完整类型）

// 好处：
// 1. 修改 Impl 内部不需要重新编译使用 Widget 的代码
// 2. 减少头文件依赖（编译更快）
// 3. 保持二进制兼容（ABI 稳定）
```

### Q36：什么是 CRTP（Curiously Recurring Template Pattern）？

**记忆点：一个类继承一个以自身为模板参数的基类 —— 实现"编译期多态"（静态多态），没有虚函数表的运行时开销。**

展开：

```cpp
template<typename Derived>
class Base {
public:
    void interface() {
        static_cast<Derived*>(this)->implementation();  // 编译期绑定
    }
};

class MyClass : public Base<MyClass> {   // 把自己传给基类模板
public:
    void implementation() { std::cout << "MyClass" << std::endl; }
};

// 对比虚函数（运行时多态）：有虚函数表查找开销
// CRTP（编译期多态）：零运行时开销，但不能动态选择
```

------

## 第十一部分：杂项高频题

### Q37：enum class 和传统 enum 的区别？

**记忆点：enum class 有作用域（不污染命名空间）、不隐式转换为 int、可以指定底层类型。**

展开：

```cpp
// 传统 enum
enum Color { Red, Green, Blue };
int x = Red;        // ✅ 隐式转 int（危险）
// 如果另一个 enum 也有 Red → 冲突！

// enum class
enum class Color { Red, Green, Blue };
Color c = Color::Red;    // 必须加作用域
// int x = Color::Red;   // ❌ 不能隐式转 int
int x = static_cast<int>(Color::Red);  // ✅ 显式转换

// 可以指定底层类型
enum class Status : uint8_t { OK = 0, Error = 1 };
```

### Q38：nullptr 和 NULL 的区别？

**记忆点：NULL 是整数 0 的宏定义，可能引起函数重载歧义；nullptr 是类型安全的空指针常量（std::nullptr_t 类型）。**

展开：

```cpp
void foo(int x)    { std::cout << "int" << std::endl; }
void foo(int* ptr) { std::cout << "pointer" << std::endl; }

foo(NULL);     // 调用 foo(int)！因为 NULL = 0 是整数
foo(nullptr);  // 调用 foo(int*)，正确！
```

### Q39：override 和 final 的作用？

**记忆点：override 让编译器检查你是否真的在重写基类虚函数（防止拼写错误）。final 禁止进一步重写或继承。**

展开：

```cpp
class Base {
public:
    virtual void draw() const;
    virtual void update();
};

class Derived : public Base {
public:
    void draw() const override;   // ✅ 编译器确认确实在重写

    // void drow() const override; // ❌ 编译错误：Base 里没有 drow
    // 没有 override 的话，这会悄悄变成一个新函数，而不是重写

    void update() final;          // 禁止子类再重写 update
};

class FinalClass final { };       // 禁止被继承
```

### Q40：static_assert 是什么？

**记忆点：编译期断言 —— 在编译时检查条件，不满足直接报错，带自定义错误信息。比运行时 assert 更好。**

展开：

```cpp
// 编译期检查
static_assert(sizeof(int) == 4, "int must be 4 bytes");
static_assert(std::is_move_constructible_v<Widget>, "Widget must be movable");

// 模板中使用
template<typename T>
class Container {
    static_assert(std::is_default_constructible_v<T>,
                  "T must have a default constructor");
};
```

### Q41：什么是字符串字面量后缀？

**记忆点：`"hello"s` 创建 std::string，`"hello"sv` 创建 string_view，避免 `const char*` 到 string 的隐式转换。**

展开：

```cpp
using namespace std::string_literals;
using namespace std::string_view_literals;

auto s1 = "hello";     // const char*（C 字符串）
auto s2 = "hello"s;    // std::string
auto s3 = "hello"sv;   // std::string_view

// 还有其他字面量后缀
using namespace std::chrono_literals;
auto duration = 5s;     // std::chrono::seconds(5)
auto ms = 100ms;        // std::chrono::milliseconds(100)
```

### Q42：什么是 [[nodiscard]]？

**记忆点：标记函数返回值"不能被忽略"，忽略了编译器会警告。用于返回错误码或关键结果的函数。**

展开：

```cpp
[[nodiscard]] ErrorCode initialize();

initialize();  // ⚠️ 警告：你忽略了返回值！

// C++20：可以附加原因
[[nodiscard("check error code")]] ErrorCode init();

// 常见用途：
// 1. 错误码返回值
// 2. 工厂函数（忽略返回值 = 内存泄漏）
// 3. 纯函数（忽略返回值 = 调用毫无意义）
```

------

## 第十二部分：C++20 重点特性

### Q43：Ranges 解决了什么问题？

**记忆点：让 STL 算法支持管道操作（|），无需手动传 begin/end，支持惰性求值，代码像声明式编程。**

展开：

```cpp
// 以前：传 begin/end，嵌套使用很丑
std::vector<int> temp;
std::copy_if(v.begin(), v.end(), std::back_inserter(temp),
             [](int x) { return x > 0; });
std::transform(temp.begin(), temp.end(), temp.begin(),
               [](int x) { return x * 2; });

// C++20 Ranges：管道风格
auto result = v
    | std::views::filter([](int x) { return x > 0; })
    | std::views::transform([](int x) { return x * 2; });
// 惰性求值：不创建中间容器，遍历时才计算
```

### Q44：什么是 Coroutines（协程）？

**记忆点：协程是可以暂停和恢复的函数。用 co_await 暂停等待异步结果，用 co_yield 逐个产出值，无需回调地狱。**

展开：

```cpp
// 生成器（co_yield）
Generator<int> fibonacci() {
    int a = 0, b = 1;
    while (true) {
        co_yield a;                   // 产出一个值，暂停
        std::tie(a, b) = std::pair{b, a + b};
    }
}

for (int n : fibonacci() | std::views::take(10)) {
    std::cout << n << " ";           // 0 1 1 2 3 5 8 13 21 34
}

// 异步操作（co_await）
Task<std::string> fetchData() {
    auto response = co_await httpGet("https://api.example.com");
    auto data = co_await parseJson(response);
    co_return data;                   // 看起来是同步代码，实际是异步执行
}
```

### Q45：Modules 解决了什么问题（C++20）？

**记忆点：替代 #include 头文件。编译更快（不重复解析头文件）、没有宏泄漏、明确导出接口。**

展开：

```cpp
// 以前：头文件
#include <vector>    // 每个 .cpp 都要重新解析整个 vector 头文件
#include "mylib.h"   // 宏定义会泄漏、include 顺序可能有影响

// 现在：Modules
// mymodule.cppm
export module mymodule;

export class Widget {
    // 只有 export 的才对外可见
};

class Internal {
    // 不 export 的外部看不到
};

// 使用
import mymodule;     // 编译器只解析一次，速度大幅提升
```

------

## 第十三部分：综合对比题

### Q46：什么时候用 struct，什么时候用 class？

**记忆点：语法上唯一区别是默认访问权限（struct 默认 public，class 默认 private）。惯例上，纯数据集合用 struct，有复杂行为用 class。**

### Q47：现代 C++ 中 const 的最佳实践？

**记忆点：Const Everything —— 默认加 const，除非你确实需要修改。**

```cpp
// 变量
const auto& item = getItem();        // 不打算修改就加 const

// 成员函数
int getValue() const;                // 不修改成员就加 const

// 参数
void process(const std::string& s);  // 只读参数加 const

// 指针
const int* p;     // 指向的值不可改
int* const p;     // 指针本身不可改
const int* const; // 都不可改
```

### Q48：智能指针的性能开销？

**记忆点：unique_ptr 零开销（和原始指针一样）。shared_ptr 有开销（控制块 + 原子引用计数）。**

```
                  大小            额外操作

原始指针          8 字节           无
unique_ptr       8 字节           无（零开销）
shared_ptr       16 字节          原子计数操作（拷贝/销毁时）
                 (对象指针 +      + 控制块堆分配
                  控制块指针)       (make_shared 可优化)
```

### Q49：现代 C++ 最容易犯的错误有哪些？

```
错误                                      正确做法

1. move 后继续使用原对象                → move 后视为无效
2. Lambda 按引用捕获局部变量然后异步使用  → 按值捕获或确保生命周期
3. shared_ptr 循环引用                  → 用 weak_ptr 打破循环
4. 移动构造不加 noexcept                → 一定要加
5. auto 接引用时忘记加 &                → auto& / const auto&
6. 在头文件中 using namespace std       → 只在 cpp 中用
7. constexpr 函数里用了运行时操作       → 确保所有路径都是编译期可求值
```

### Q50：如果从零开始一个现代 C++ 项目，技术栈选什么？

```
项目配置：
├── 标准：C++20（或 C++17 保守起见）
├── 构建：CMake 3.20+
├── 包管理：vcpkg 或 Conan
├── 编译器：GCC 13+ / Clang 17+ / MSVC 2022+
└── 代码规范：clang-tidy + clang-format

必备库：
├── 日志：spdlog
├── 测试：Catch2 或 Google Test
├── JSON：nlohmann/json
├── 格式化：std::format (C++20) 或 fmt
├── HTTP：cpp-httplib 或 Boost.Beast
└── 序列化：protobuf 或 cereal

代码风格：
├── 智能指针替代原始指针
├── auto 用于迭代器和工厂返回值
├── range-for 替代下标循环
├── enum class 替代 enum
├── nullptr 替代 NULL
├── using 替代 typedef
└── [[nodiscard]] 用于不可忽略返回值
```

------

## 速查表：面试前 10 分钟快速过一遍

```
智能指针    unique（独占零开销） shared（共享引用计数） weak（打破循环）
移动语义    move 只做类型转换 | 移动 = 偷指针 O(1) | noexcept 必加
Lambda     [=]值 [&]引用 | 底层是匿名 functor | mutable 可改捕获
auto       去掉引用和顶层 const | auto& 保留 | decltype 完全保留
constexpr  编译期求值 | consteval 强制编译期 | if constexpr 编译期分支
并发       mutex + lock_guard | atomic 无锁 | async + future 异步
容器       unordered_map O(1) | optional 替代特殊值 | emplace 原地构造
模板       Concepts 替代 SFINAE | 折叠表达式展开参数包 | if constexpr
设计       Rule of Zero | pImpl 隐藏实现 | CRTP 静态多态
C++20      Concepts | Ranges 管道 | Coroutines 协程 | Modules 替 include
```

------

> 本文覆盖了现代 C++ 面试中最高频的 50 道题。每道题的"记忆点"可以作为面试时的第一句回答，展开部分用于深入追问。建议结合 [现代 C++ 升级指南](/techlearn/posts/modern-cpp-guide/) 一文一起学习，先理解特性再准备面试。
