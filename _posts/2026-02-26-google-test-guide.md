---
title: Google Test 实战教程 —— AI 时代更需要"测试先行"
description: 从零开始学习 Google Test（GTest）框架，涵盖断言、Fixture、参数化测试、Mock、TDD 工作流、CMake 集成和 AI 辅助编程中的测试策略，让你写出可验证、可回归的 C++ 代码
date: 2026-02-26
categories: [编程语言]
tags: [c++, google test, gtest, gmock, tdd, 测试, 单元测试, cmake, ai辅助编程]
---

开发少不了测试。但很多 C++ 开发者（包括曾经的我）对测试的态度是"先写代码再说，有空再补测试"——结果就是永远没空。

进入 AI 辅助编程时代后，测试变得**更加重要**而非更不重要。为什么？因为 AI 生成的代码你不一定完全理解，**测试是你验证 AI 代码正确性的唯一武器**。"测试先行"不再是理想主义，而是实用主义。

这篇文章用 Google Test（GTest）框架来讲——它是 C++ 生态中最主流的测试框架，Google 自家用，工业界广泛采用。

------

## 第一章：为什么 AI 时代更需要测试？

### 传统开发 vs AI 辅助开发

```
传统开发：
  你写代码 → 你理解每一行 → 你"觉得"它对 → 上线 → 出 bug → 调试

AI 辅助开发：
  你描述需求 → AI 生成代码 → 你看了一眼"好像对" → 上线 → 出 bug → ???

  问题在哪？
  ├── AI 可能理解错你的需求
  ├── AI 生成的代码可能有边界情况的 bug
  ├── 你可能没完全理解 AI 写的代码
  └── 代码"看起来对"不等于"真的对"
```

### 测试先行的正确姿势

```
正确的 AI 辅助开发流程：

  1. 你先写测试（定义"什么是对的"）
  2. 让 AI 生成实现代码
  3. 跑测试
     ├── 全绿 → 代码符合你的预期
     └── 有红 → AI 的代码有问题，让它改或自己改
  4. 你改需求时先改测试，再让 AI 改代码，再跑测试

  核心思想：测试是"验收标准"，先写标准再写答案
```

这和 TDD（Test-Driven Development）的理念完全一致：**先写测试，再写实现，测试驱动开发**。

------

## 第二章：Google Test 快速上手

### 安装和项目结构

最推荐的方式是用 CMake 的 `FetchContent` 直接拉取：

```cmake
# CMakeLists.txt
cmake_minimum_required(VERSION 3.14)
project(my_project)

set(CMAKE_CXX_STANDARD 17)

# 拉取 Google Test
include(FetchContent)
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG        v1.15.2
)
FetchContent_MakeAvailable(googletest)

# 你的库代码
add_library(my_lib src/calculator.cpp)
target_include_directories(my_lib PUBLIC include)

# 测试可执行文件
enable_testing()
add_executable(my_tests
    tests/test_calculator.cpp
)
target_link_libraries(my_tests
    PRIVATE my_lib GTest::gtest_main
)

# 注册到 CTest
include(GoogleTest)
gtest_discover_tests(my_tests)
```

推荐的项目目录结构：

```
my_project/
├── CMakeLists.txt
├── include/
│   └── calculator.h       # 头文件
├── src/
│   └── calculator.cpp     # 实现
└── tests/
    └── test_calculator.cpp # 测试
```

### 你的第一个测试

先写头文件：

```cpp
// include/calculator.h
#pragma once

class Calculator {
public:
    int add(int a, int b);
    int subtract(int a, int b);
    double divide(int a, int b);
};
```

再写测试（注意：TDD 要求先写测试再写实现，但为了讲解先把两者都给出来）：

```cpp
// tests/test_calculator.cpp
#include <gtest/gtest.h>
#include "calculator.h"

TEST(CalculatorTest, AddTwoPositiveNumbers) {
    Calculator calc;
    EXPECT_EQ(calc.add(1, 2), 3);
}

TEST(CalculatorTest, AddNegativeNumbers) {
    Calculator calc;
    EXPECT_EQ(calc.add(-1, -2), -3);
}

TEST(CalculatorTest, SubtractNumbers) {
    Calculator calc;
    EXPECT_EQ(calc.subtract(5, 3), 2);
}

TEST(CalculatorTest, DivideByZeroThrows) {
    Calculator calc;
    EXPECT_THROW(calc.divide(10, 0), std::invalid_argument);
}
```

最后写实现：

```cpp
// src/calculator.cpp
#include "calculator.h"
#include <stdexcept>

int Calculator::add(int a, int b) { return a + b; }
int Calculator::subtract(int a, int b) { return a - b; }

double Calculator::divide(int a, int b) {
    if (b == 0) throw std::invalid_argument("Division by zero");
    return static_cast<double>(a) / b;
}
```

### 构建和运行

```bash
# 构建
mkdir build && cd build
cmake ..
cmake --build .

# 运行测试
ctest                    # CTest 方式
./my_tests               # 直接运行
./my_tests --gtest_filter="CalculatorTest.*"  # 只运行特定测试组
```

输出会像这样：

```
[==========] Running 4 tests from 1 test suite.
[----------] 4 tests from CalculatorTest
[ RUN      ] CalculatorTest.AddTwoPositiveNumbers
[       OK ] CalculatorTest.AddTwoPositiveNumbers (0 ms)
[ RUN      ] CalculatorTest.AddNegativeNumbers
[       OK ] CalculatorTest.AddNegativeNumbers (0 ms)
[ RUN      ] CalculatorTest.SubtractNumbers
[       OK ] CalculatorTest.SubtractNumbers (0 ms)
[ RUN      ] CalculatorTest.DivideByZeroThrows
[       OK ] CalculatorTest.DivideByZeroThrows (0 ms)
[----------] 4 tests from CalculatorTest (0 ms total)
[==========] 4 tests from 1 test suite ran. (0 ms total)
[  PASSED  ] 4 tests.
```

------

## 第三章：断言体系 —— EXPECT vs ASSERT

Google Test 有两套断言：`EXPECT_*` 和 `ASSERT_*`。

### 区别一句话

```
EXPECT_* ：失败了继续跑后面的断言（非致命断言）
ASSERT_* ：失败了立即终止当前测试（致命断言）

原则：
  ├── 默认用 EXPECT_*（一次跑出所有失败，方便定位）
  └── 只在"后面的断言依赖这个结果"时用 ASSERT_*
```

### 常用断言速查表

```
布尔检查：
  EXPECT_TRUE(condition)         // 期望为 true
  EXPECT_FALSE(condition)        // 期望为 false

相等/不等：
  EXPECT_EQ(val1, val2)          // val1 == val2
  EXPECT_NE(val1, val2)          // val1 != val2

比较：
  EXPECT_LT(val1, val2)          // val1 < val2
  EXPECT_LE(val1, val2)          // val1 <= val2
  EXPECT_GT(val1, val2)          // val1 > val2
  EXPECT_GE(val1, val2)          // val1 >= val2

字符串：
  EXPECT_STREQ(str1, str2)      // C 字符串相等
  EXPECT_STRNE(str1, str2)      // C 字符串不等
  EXPECT_STRCASEEQ(str1, str2)  // 忽略大小写相等

浮点数（不要用 EXPECT_EQ 比较浮点数！）：
  EXPECT_FLOAT_EQ(val1, val2)   // float 近似相等（4 ULP 误差内）
  EXPECT_DOUBLE_EQ(val1, val2)  // double 近似相等
  EXPECT_NEAR(val1, val2, abs_error)  // 误差在 abs_error 内

异常：
  EXPECT_THROW(statement, exception_type)   // 抛出指定异常
  EXPECT_ANY_THROW(statement)               // 抛出任何异常
  EXPECT_NO_THROW(statement)                // 不抛异常
```

### 实际用例

```cpp
TEST(StringTest, BasicOperations) {
    std::string s = "Hello";

    // 布尔
    EXPECT_TRUE(s.size() > 0);
    EXPECT_FALSE(s.empty());

    // 相等
    EXPECT_EQ(s.size(), 5);
    EXPECT_EQ(s, "Hello");  // std::string 可以直接用 EXPECT_EQ

    // 比较
    EXPECT_GT(s.size(), 3);
}

TEST(FloatTest, PrecisionMatters) {
    double result = 0.1 + 0.2;

    // ❌ 错误：浮点数不要用 EXPECT_EQ
    // EXPECT_EQ(result, 0.3);  // 会失败！0.1+0.2 != 0.3 (浮点精度)

    // ✅ 正确
    EXPECT_NEAR(result, 0.3, 1e-10);
    EXPECT_DOUBLE_EQ(0.5 + 0.5, 1.0);  // 精确可表示的浮点数可以用
}

TEST(PointerTest, UseAssertForPointer) {
    int* ptr = getPointer();  // 可能返回 nullptr

    // 用 ASSERT：如果 ptr 是空的，后面解引用会崩溃
    ASSERT_NE(ptr, nullptr);

    // 到这里 ptr 一定不为空
    EXPECT_EQ(*ptr, 42);
}
```

### 自定义失败信息

```cpp
TEST(CustomMessageTest, WithContext) {
    int value = computeSomething();

    EXPECT_EQ(value, 42)
        << "computeSomething() 返回了 " << value
        << "，但期望是 42";

    // 失败时会输出：
    // Expected equality of these values:
    //   value
    //     Which is: 17
    //   42
    // computeSomething() 返回了 17，但期望是 42
}
```

------

## 第四章：Test Fixture —— 共享测试环境

多个测试用例需要相同的初始化环境时，用 Test Fixture。

### 为什么需要 Fixture？

```cpp
// ❌ 不用 Fixture：每个测试都重复初始化
TEST(DatabaseTest, Insert) {
    Database db;
    db.connect("localhost", 3306);
    db.login("admin", "password");
    // ... 测试 insert
    db.disconnect();
}

TEST(DatabaseTest, Query) {
    Database db;
    db.connect("localhost", 3306);   // 重复！
    db.login("admin", "password");   // 重复！
    // ... 测试 query
    db.disconnect();
}

// ✅ 用 Fixture：统一初始化和清理
```

### Fixture 基本用法

```cpp
class DatabaseTest : public ::testing::Test {
protected:
    Database db;

    void SetUp() override {
        // 每个 TEST_F 之前自动调用
        db.connect("localhost", 3306);
        db.login("admin", "password");
    }

    void TearDown() override {
        // 每个 TEST_F 之后自动调用
        db.disconnect();
    }
};

// 注意：用 TEST_F 不是 TEST！
TEST_F(DatabaseTest, InsertRecord) {
    // db 已经连接好了
    EXPECT_TRUE(db.insert("users", "Alice"));
    EXPECT_EQ(db.count("users"), 1);
}

TEST_F(DatabaseTest, QueryRecord) {
    // 每个测试都有全新的 db（SetUp 重新执行）
    db.insert("users", "Bob");
    auto result = db.query("users", "Bob");
    EXPECT_EQ(result.name, "Bob");
}
```

### Fixture 的生命周期

```
每个 TEST_F 的执行流程：

  构造 Fixture 对象（调用构造函数）
       │
       ▼
  SetUp()（初始化测试环境）
       │
       ▼
  执行测试体（你写的 TEST_F 代码）
       │
       ▼
  TearDown()（清理测试环境）
       │
       ▼
  析构 Fixture 对象（调用析构函数）

注意：每个 TEST_F 都创建新的 Fixture 实例！
      测试之间完全隔离，互不影响。
```

### 构造/析构 vs SetUp/TearDown

```cpp
class MyFixture : public ::testing::Test {
protected:
    // 方式 1：构造函数/析构函数
    MyFixture() {
        // 初始化（不能用 ASSERT，因为构造函数没有返回值）
    }
    ~MyFixture() override {
        // 清理（不建议抛异常）
    }

    // 方式 2：SetUp/TearDown
    void SetUp() override {
        // 初始化（可以用 ASSERT！失败会跳过测试体）
    }
    void TearDown() override {
        // 清理（可以检查测试是否失败：HasFailure()）
    }
};

// 推荐：
// - 简单的成员初始化 → 构造函数
// - 可能失败的初始化（需要 ASSERT）→ SetUp
// - 清理逻辑 → TearDown（可以根据测试结果做不同清理）
```

### 实际案例：测试一个 LRU Cache

```cpp
#include <gtest/gtest.h>
#include "lru_cache.h"

class LRUCacheTest : public ::testing::Test {
protected:
    LRUCache<std::string, int> cache{3};  // 容量为 3 的缓存

    void SetUp() override {
        // 预填充一些数据
        cache.put("a", 1);
        cache.put("b", 2);
        cache.put("c", 3);
    }
};

TEST_F(LRUCacheTest, GetExistingKey) {
    auto val = cache.get("b");
    ASSERT_TRUE(val.has_value());
    EXPECT_EQ(val.value(), 2);
}

TEST_F(LRUCacheTest, GetNonExistingKey) {
    auto val = cache.get("z");
    EXPECT_FALSE(val.has_value());
}

TEST_F(LRUCacheTest, EvictsLRUWhenFull) {
    // 缓存已满（a, b, c），再插入 d
    cache.put("d", 4);

    // a 是最久未使用的，应该被淘汰
    EXPECT_FALSE(cache.get("a").has_value());

    // b, c, d 还在
    EXPECT_TRUE(cache.get("b").has_value());
    EXPECT_TRUE(cache.get("c").has_value());
    EXPECT_TRUE(cache.get("d").has_value());
}

TEST_F(LRUCacheTest, AccessUpdatesRecency) {
    // 访问 a，使其变为最近使用
    cache.get("a");

    // 插入 d，应该淘汰 b（现在 b 是最久未使用的）
    cache.put("d", 4);

    EXPECT_TRUE(cache.get("a").has_value());   // a 刚被访问过
    EXPECT_FALSE(cache.get("b").has_value());  // b 被淘汰
}
```

------

## 第五章：参数化测试 —— 一套逻辑多组数据

当你要对同一个函数用不同输入测试时，参数化测试避免大量重复代码。

### 基本参数化

```cpp
#include <gtest/gtest.h>
#include "math_utils.h"

// 第 1 步：定义参数化测试类
class IsPrimeTest : public ::testing::TestWithParam<int> {};

// 第 2 步：写测试逻辑
TEST_P(IsPrimeTest, PrimeNumbers) {
    int n = GetParam();  // 获取当前参数
    EXPECT_TRUE(isPrime(n)) << n << " should be prime";
}

// 第 3 步：提供参数
INSTANTIATE_TEST_SUITE_P(
    Primes,              // 实例名
    IsPrimeTest,         // 测试类
    ::testing::Values(2, 3, 5, 7, 11, 13, 17, 19, 23, 29)
);

// 等价于你手写了 10 个 TEST！
```

### 多参数 —— 用 struct

```cpp
struct DivisionCase {
    int dividend;
    int divisor;
    double expected;

    // 让测试名字更可读
    friend std::ostream& operator<<(std::ostream& os, const DivisionCase& c) {
        return os << c.dividend << "/" << c.divisor << "=" << c.expected;
    }
};

class DivisionTest : public ::testing::TestWithParam<DivisionCase> {};

TEST_P(DivisionTest, CorrectResult) {
    auto [dividend, divisor, expected] = GetParam();
    Calculator calc;
    EXPECT_DOUBLE_EQ(calc.divide(dividend, divisor), expected);
}

INSTANTIATE_TEST_SUITE_P(
    DivisionCases,
    DivisionTest,
    ::testing::Values(
        DivisionCase{10, 2, 5.0},
        DivisionCase{7, 2, 3.5},
        DivisionCase{0, 5, 0.0},
        DivisionCase{-10, 2, -5.0},
        DivisionCase{10, -2, -5.0}
    )
);
```

### 参数生成器

```cpp
// Values：逐个指定
::testing::Values(1, 2, 3, 4, 5)

// Range：范围（start, end, step）
::testing::Range(0, 100, 10)   // 0, 10, 20, ..., 90

// Bool：true 和 false
::testing::Bool()              // true, false

// Combine：笛卡尔积（多维参数组合）
::testing::Combine(
    ::testing::Values("http", "https"),
    ::testing::Values(80, 443, 8080)
)
// 生成：("http",80), ("http",443), ("http",8080),
//       ("https",80), ("https",443), ("https",8080)

// ValuesIn：从容器中取值
std::vector<int> data = loadTestData();
::testing::ValuesIn(data)
```

### 实际案例：测试字符串处理

```cpp
struct TrimCase {
    std::string input;
    std::string expected;
};

class TrimTest : public ::testing::TestWithParam<TrimCase> {};

TEST_P(TrimTest, RemovesLeadingAndTrailingSpaces) {
    auto [input, expected] = GetParam();
    EXPECT_EQ(trim(input), expected);
}

INSTANTIATE_TEST_SUITE_P(
    TrimCases,
    TrimTest,
    ::testing::Values(
        TrimCase{"  hello  ", "hello"},
        TrimCase{"hello", "hello"},           // 无空格
        TrimCase{"  ", ""},                    // 全空格
        TrimCase{"", ""},                      // 空串
        TrimCase{"\t hello \n", "hello"},      // 制表符和换行
        TrimCase{"hello  world", "hello  world"} // 中间的空格保留
    )
);
```

------

## 第六章：Google Mock —— 模拟依赖

真实项目中，你要测试的代码往往依赖数据库、网络、文件系统等外部服务。Mock 让你**模拟这些依赖**，只测试你的逻辑。

### 为什么需要 Mock？

```
不用 Mock：
  你的代码 → 调用真实数据库 → 需要数据库环境
  问题：
  ├── 测试慢（网络延迟）
  ├── 不可重复（数据库数据会变）
  ├── 难以测试异常路径（怎么让数据库出错？）
  └── CI 环境可能没有数据库

用 Mock：
  你的代码 → 调用 Mock 对象 → Mock 返回预设值
  优点：
  ├── 测试快（内存中模拟）
  ├── 可重复（行为完全可控）
  ├── 易测异常（让 Mock 抛异常）
  └── 无外部依赖
```

### Mock 基本用法

```cpp
// 第 1 步：定义接口（面向接口编程！）
class IDatabase {
public:
    virtual ~IDatabase() = default;
    virtual bool connect(const std::string& host) = 0;
    virtual std::string query(const std::string& sql) = 0;
    virtual bool insert(const std::string& table, const std::string& data) = 0;
};

// 第 2 步：创建 Mock 类
#include <gmock/gmock.h>

class MockDatabase : public IDatabase {
public:
    MOCK_METHOD(bool, connect, (const std::string& host), (override));
    MOCK_METHOD(std::string, query, (const std::string& sql), (override));
    MOCK_METHOD(bool, insert, (const std::string& table, const std::string& data), (override));
};

// 第 3 步：你的业务代码依赖接口
class UserService {
    IDatabase& db;
public:
    explicit UserService(IDatabase& database) : db(database) {}

    bool createUser(const std::string& name) {
        if (name.empty()) return false;
        return db.insert("users", name);
    }

    std::string findUser(int id) {
        return db.query("SELECT * FROM users WHERE id=" + std::to_string(id));
    }
};
```

### 使用 Mock 写测试

```cpp
using ::testing::Return;
using ::testing::_;
using ::testing::HasSubstr;

TEST(UserServiceTest, CreateUserSuccess) {
    MockDatabase mockDb;
    UserService service(mockDb);

    // 设置期望：当调用 insert("users", "Alice") 时返回 true
    EXPECT_CALL(mockDb, insert("users", "Alice"))
        .Times(1)
        .WillOnce(Return(true));

    EXPECT_TRUE(service.createUser("Alice"));
}

TEST(UserServiceTest, CreateUserEmptyName) {
    MockDatabase mockDb;
    UserService service(mockDb);

    // 空名字不应该调用数据库
    EXPECT_CALL(mockDb, insert(_, _)).Times(0);

    EXPECT_FALSE(service.createUser(""));
}

TEST(UserServiceTest, FindUserCallsCorrectSQL) {
    MockDatabase mockDb;
    UserService service(mockDb);

    // 验证 SQL 包含正确的 ID
    EXPECT_CALL(mockDb, query(HasSubstr("id=42")))
        .WillOnce(Return("Alice"));

    auto result = service.findUser(42);
    EXPECT_EQ(result, "Alice");
}

TEST(UserServiceTest, CreateUserDatabaseFails) {
    MockDatabase mockDb;
    UserService service(mockDb);

    // 模拟数据库故障
    EXPECT_CALL(mockDb, insert(_, _))
        .WillOnce(Return(false));

    EXPECT_FALSE(service.createUser("Alice"));
}
```

### EXPECT_CALL 详解

```cpp
EXPECT_CALL(mock_object, method_name(matchers))
    .Times(cardinality)        // 调用次数
    .WillOnce(action)          // 第一次调用时的行为
    .WillRepeatedly(action);   // 后续调用时的行为

// 次数（Times）
.Times(0)                    // 不应该被调用
.Times(1)                    // 恰好调用 1 次
.Times(3)                    // 恰好 3 次
.Times(::testing::AtLeast(2))   // 至少 2 次
.Times(::testing::AtMost(5))    // 最多 5 次
.Times(::testing::Between(2, 5)) // 2 到 5 次

// 动作（Actions）
.WillOnce(Return(42))          // 返回 42
.WillOnce(Throw(std::runtime_error("boom")))  // 抛异常
.WillOnce(DoDefault())        // 执行默认行为
.WillRepeatedly(Return(0))    // 后续每次都返回 0
```

### 匹配器（Matchers）

```cpp
using namespace ::testing;

// 通配符
EXPECT_CALL(mock, method(_))              // 任意值
EXPECT_CALL(mock, method(_, _))           // 任意两个参数

// 比较
EXPECT_CALL(mock, method(Eq(42)))         // 等于 42
EXPECT_CALL(mock, method(Ne(0)))          // 不等于 0
EXPECT_CALL(mock, method(Gt(10)))         // 大于 10
EXPECT_CALL(mock, method(Le(100)))        // 小于等于 100

// 字符串
EXPECT_CALL(mock, method(HasSubstr("hello")))   // 包含 "hello"
EXPECT_CALL(mock, method(StartsWith("http")))   // 以 "http" 开头
EXPECT_CALL(mock, method(MatchesRegex("\\d+"))) // 匹配正则

// 组合
EXPECT_CALL(mock, method(AllOf(Gt(0), Lt(100))))  // 0 < x < 100
EXPECT_CALL(mock, method(AnyOf(Eq(1), Eq(2))))    // 1 或 2
EXPECT_CALL(mock, method(Not(Eq(0))))              // 不是 0

// 容器
EXPECT_CALL(mock, method(ElementsAre(1, 2, 3)))           // 恰好 [1,2,3]
EXPECT_CALL(mock, method(Contains(42)))                    // 包含 42
EXPECT_CALL(mock, method(UnorderedElementsAre(3, 1, 2)))   // 无序 [1,2,3]
EXPECT_CALL(mock, method(IsEmpty()))                       // 空容器
```

------

## 第七章：TDD 工作流 —— 红绿重构

TDD（Test-Driven Development）的核心循环：

```
  ┌──────────────────────────────────────────┐
  │                                          │
  │   RED → GREEN → REFACTOR → RED → ...    │
  │                                          │
  │   红：写一个失败的测试                     │
  │   绿：写最少的代码让测试通过               │
  │   重构：改善代码结构但不改变行为            │
  │                                          │
  └──────────────────────────────────────────┘
```

### 完整 TDD 示例：实现一个 Stack

**第 1 轮：空栈**

```cpp
// 先写测试（RED）
TEST(StackTest, NewStackIsEmpty) {
    Stack<int> stack;
    EXPECT_TRUE(stack.empty());
    EXPECT_EQ(stack.size(), 0);
}
```

```cpp
// 再写最少代码让测试通过（GREEN）
template<typename T>
class Stack {
public:
    bool empty() const { return true; }
    size_t size() const { return 0; }
};
```

**第 2 轮：Push 一个元素**

```cpp
// 先写测试（RED）
TEST(StackTest, PushOneElement) {
    Stack<int> stack;
    stack.push(42);
    EXPECT_FALSE(stack.empty());
    EXPECT_EQ(stack.size(), 1);
}
```

```cpp
// 写实现让测试通过（GREEN）
template<typename T>
class Stack {
    std::vector<T> data;
public:
    bool empty() const { return data.empty(); }
    size_t size() const { return data.size(); }
    void push(const T& value) { data.push_back(value); }
};
```

**第 3 轮：Pop**

```cpp
// 先写测试（RED）
TEST(StackTest, PopReturnsLastPushed) {
    Stack<int> stack;
    stack.push(1);
    stack.push(2);
    EXPECT_EQ(stack.pop(), 2);
    EXPECT_EQ(stack.pop(), 1);
    EXPECT_TRUE(stack.empty());
}

TEST(StackTest, PopEmptyThrows) {
    Stack<int> stack;
    EXPECT_THROW(stack.pop(), std::out_of_range);
}
```

```cpp
// 写实现（GREEN）
T pop() {
    if (data.empty()) throw std::out_of_range("Stack is empty");
    T value = data.back();
    data.pop_back();
    return value;
}
```

**第 4 轮：Top（REFACTOR 时发现需要）**

```cpp
TEST(StackTest, TopDoesNotRemove) {
    Stack<int> stack;
    stack.push(42);
    EXPECT_EQ(stack.top(), 42);
    EXPECT_EQ(stack.size(), 1);  // 还在
}
```

### TDD 的关键原则

```
1. 一次只写一个失败的测试
   不要一口气写 10 个测试再去实现——你会迷失方向

2. 写"最少的代码"让测试通过
   不要提前优化，不要想着"将来可能需要"

3. 测试名字要描述行为，不是描述实现
   ✅ PopReturnsLastPushed
   ❌ TestPopMethodWithVector

4. 每个测试只测一个行为
   一个 TEST 里不要验证 5 个不相关的事情

5. 先测 Happy Path，再测 Edge Case
   ├── 正常输入
   ├── 边界值（0、空、最大值）
   ├── 异常路径
   └── 并发场景（如果适用）
```

------

## 第八章：测试组织和最佳实践

### 测试命名

```cpp
// Google 推荐的命名格式：
// TEST(测试套件名, 测试场景_期望行为)

// ✅ 好的命名
TEST(UserParser, EmptyInput_ReturnsNullopt)
TEST(UserParser, ValidJson_ReturnsUser)
TEST(UserParser, MissingNameField_ThrowsParseError)
TEST(Cache, EvictsLRU_WhenCapacityExceeded)

// ❌ 不好的命名
TEST(Test1, Test)
TEST(UserParser, Works)
TEST(UserParser, TestParse)
```

### 测试文件组织

```
tests/
├── test_calculator.cpp        # 一个模块一个测试文件
├── test_user_service.cpp
├── test_cache.cpp
├── test_string_utils.cpp
├── mocks/                     # Mock 类集中管理
│   ├── mock_database.h
│   └── mock_http_client.h
├── fixtures/                  # 复杂 Fixture
│   └── database_fixture.h
└── test_data/                 # 测试数据文件
    ├── valid_user.json
    └── invalid_input.txt
```

### AAA 模式

每个测试遵循 Arrange-Act-Assert 三段式：

```cpp
TEST(UserServiceTest, CreateUser_ValidInput_ReturnsTrue) {
    // Arrange（准备）
    MockDatabase mockDb;
    UserService service(mockDb);
    EXPECT_CALL(mockDb, insert(_, _)).WillOnce(Return(true));

    // Act（执行）
    bool result = service.createUser("Alice");

    // Assert（断言）
    EXPECT_TRUE(result);
}
```

### 常见反模式

```
❌ 反模式 1：测试太多东西
  一个 TEST 里验证 10 个不同的行为
  → 应该拆成 10 个独立的 TEST

❌ 反模式 2：测试实现细节而非行为
  测试内部数据结构、私有方法
  → 应该通过公共接口测试行为

❌ 反模式 3：脆弱测试（Brittle Tests）
  改一行实现代码就要改 20 个测试
  → 测试应该关注"做什么"而非"怎么做"

❌ 反模式 4：测试之间有依赖
  Test2 依赖 Test1 的执行结果
  → 每个测试必须独立，用 Fixture 确保初始状态

❌ 反模式 5：不测边界情况
  只测 add(1,2)=3，不测溢出、负数、零
  → 边界情况往往是 bug 的温床

❌ 反模式 6：Mock 过度
  每个依赖都 Mock，测试和实现严重耦合
  → 只 Mock 外部依赖（数据库、网络），内部逻辑用真实对象
```

------

## 第九章：高级技巧

### 类型参数化测试

当你要测试一个模板类对多种类型都正确时：

```cpp
template<typename T>
class StackTypedTest : public ::testing::Test {
protected:
    Stack<T> stack;
};

// 要测试的类型列表
using TestTypes = ::testing::Types<int, double, std::string>;
TYPED_TEST_SUITE(StackTypedTest, TestTypes);

TYPED_TEST(StackTypedTest, PushAndPop) {
    TypeParam value{};  // TypeParam 是当前的类型
    this->stack.push(value);
    EXPECT_EQ(this->stack.size(), 1);
    this->stack.pop();
    EXPECT_TRUE(this->stack.empty());
}

// 这一个 TYPED_TEST 会为 int、double、string 各生成一个测试
```

### 死亡测试

测试代码在某种输入下是否会崩溃（abort、段错误、assert 失败）：

```cpp
void divideUnsafe(int a, int b) {
    assert(b != 0);  // release 下不会检查
    // 或者直接 a/b 可能段错误
}

TEST(DeathTest, DivideByZeroCrashes) {
    // 期望这个函数调用会导致进程终止
    EXPECT_DEATH(divideUnsafe(1, 0), ".*");

    // 也可以匹配错误信息
    EXPECT_DEATH(divideUnsafe(1, 0), "Assertion.*failed");
}

// 命名约定：死亡测试套件名以 DeathTest 结尾
// Google Test 会用 fork 执行，不影响其他测试
```

### 跳过测试

```cpp
TEST(FeatureTest, OnlyOnLinux) {
#ifdef _WIN32
    GTEST_SKIP() << "This test only runs on Linux";
#endif
    // Linux-only 测试逻辑
}

TEST(FeatureTest, NeedsDatabase) {
    if (!isDatabaseAvailable()) {
        GTEST_SKIP() << "Database not available";
    }
    // 需要数据库的测试
}
```

### 全局 SetUp/TearDown

```cpp
class GlobalEnvironment : public ::testing::Environment {
public:
    void SetUp() override {
        // 所有测试之前执行一次（初始化日志、数据库连接池等）
        Logger::init();
    }

    void TearDown() override {
        // 所有测试之后执行一次
        Logger::shutdown();
    }
};

// 在 main 中注册（如果你用 gtest_main 就不需要自己写 main）
int main(int argc, char** argv) {
    ::testing::InitGoogleTest(&argc, argv);
    ::testing::AddGlobalTestEnvironment(new GlobalEnvironment);
    return RUN_ALL_TESTS();
}
```

### 自定义 Matcher

```cpp
// 自定义一个检查"是偶数"的 Matcher
MATCHER(IsEven, "is even") {
    return arg % 2 == 0;
}

// 带参数的 Matcher
MATCHER_P(IsDivisibleBy, n, "is divisible by " + std::to_string(n)) {
    return arg % n == 0;
}

TEST(CustomMatcherTest, Usage) {
    EXPECT_THAT(42, IsEven());
    EXPECT_THAT(15, IsDivisibleBy(3));
    EXPECT_THAT(15, IsDivisibleBy(5));

    // 组合使用
    std::vector<int> nums = {2, 4, 6, 8};
    EXPECT_THAT(nums, Each(IsEven()));
}
```

------

## 第十章：CMake + CTest 集成

### 完整的 CMake 配置

```cmake
cmake_minimum_required(VERSION 3.14)
project(my_project VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ── 主项目 ──
add_library(core
    src/calculator.cpp
    src/user_service.cpp
    src/cache.cpp
)
target_include_directories(core PUBLIC include)

add_executable(app src/main.cpp)
target_link_libraries(app PRIVATE core)

# ── 测试（可选构建）──
option(BUILD_TESTS "Build tests" ON)

if(BUILD_TESTS)
    include(FetchContent)
    FetchContent_Declare(
        googletest
        GIT_REPOSITORY https://github.com/google/googletest.git
        GIT_TAG        v1.15.2
    )
    # Windows: 防止覆盖父项目的编译器/链接器设置
    set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
    FetchContent_MakeAvailable(googletest)

    enable_testing()

    # 多个测试可执行文件
    add_executable(test_calculator tests/test_calculator.cpp)
    target_link_libraries(test_calculator PRIVATE core GTest::gtest_main GTest::gmock)

    add_executable(test_user_service tests/test_user_service.cpp)
    target_link_libraries(test_user_service PRIVATE core GTest::gtest_main GTest::gmock)

    include(GoogleTest)
    gtest_discover_tests(test_calculator)
    gtest_discover_tests(test_user_service)
endif()
```

### 运行和过滤

```bash
# 构建
cmake -B build -DBUILD_TESTS=ON
cmake --build build

# 运行所有测试
cd build && ctest

# 详细输出
ctest --verbose
ctest -V

# 只运行失败的测试
ctest --rerun-failed

# 过滤测试（CTest 正则）
ctest -R "Calculator"       # 名字包含 Calculator 的测试
ctest -E "DeathTest"        # 排除死亡测试

# 直接运行可执行文件（更多过滤选项）
./test_calculator --gtest_filter="CalculatorTest.Add*"
./test_calculator --gtest_filter="*Divide*"
./test_calculator --gtest_filter="-*Slow*"         # 排除
./test_calculator --gtest_filter="Suite1.*:Suite2.*"  # 多个
./test_calculator --gtest_list_tests               # 列出所有测试

# 重复运行（检测偶发失败）
./test_calculator --gtest_repeat=100
./test_calculator --gtest_repeat=100 --gtest_break_on_failure

# 随机顺序（检测测试间依赖）
./test_calculator --gtest_shuffle

# 输出 XML 报告（CI 用）
./test_calculator --gtest_output=xml:report.xml
```

### Windows 特别注意

```cmake
# Windows 上使用 Google Test 的常见坑

# 1. CRT 链接冲突
# 如果不设置这个，可能报 LNK2038 错误
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)

# 2. MSVC 的 UTF-8 支持
if(MSVC)
    add_compile_options(/utf-8)   # 源码用 UTF-8
endif()

# 3. 在 Visual Studio 中运行
# 可以使用 Test Explorer 窗口直接看到所有测试
# 需要安装 "Google Test Adapter" 扩展
```

------

## 第十一章：CI/CD 中的测试

### GitHub Actions 配置

```yaml
# .github/workflows/test.yml
name: C++ Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4

    - name: Configure
      run: cmake -B build -DBUILD_TESTS=ON

    - name: Build
      run: cmake --build build

    - name: Test
      run: cd build && ctest --verbose --output-on-failure

    - name: Upload test results
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: test-results
        path: build/report.xml
```

### 多平台 CI

{% raw %}
```yaml
jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        build_type: [Debug, Release]

    runs-on: ${{ matrix.os }}

    steps:
    - uses: actions/checkout@v4

    - name: Configure
      run: cmake -B build -DBUILD_TESTS=ON -DCMAKE_BUILD_TYPE=${{ matrix.build_type }}

    - name: Build
      run: cmake --build build --config ${{ matrix.build_type }}

    - name: Test
      run: cd build && ctest -C ${{ matrix.build_type }} --verbose
```
{% endraw %}

------

## 第十二章：AI 辅助编程的测试策略

### 让 AI 帮你写测试

```
你可以这样指示 AI：

"给这个函数写测试，包括：
  1. 正常输入的 happy path
  2. 空输入
  3. 边界值（最大值、最小值、零）
  4. 异常路径（无效输入应该抛什么异常）
  5. 性能相关的边界（超大输入）"

AI 擅长这个——它能系统地覆盖边界情况
但你要审查 AI 写的测试是否真的测了有意义的东西
```

### 让 AI 根据你的测试写实现

```
更好的工作流：

  1. 你定义接口（.h 文件）
  2. 你写测试（或让 AI 帮写，但你要审查）
  3. 让 AI 写实现
  4. 跑测试
  5. 不通过 → 把测试结果给 AI → 让它修改

这样你始终掌控"什么是正确的"（测试）
AI 只负责"怎么实现"（代码）
```

### 测试即文档

```
好的测试是最好的文档，因为它：
  ├── 展示了函数的正确用法
  ├── 说明了预期的行为和边界
  ├── 随代码一起更新（不像注释会过时）
  └── 可运行、可验证

AI 可以从你的测试中"读懂"你要什么
比自然语言描述更精确
```

### 实际工作流示例

```
场景：你要实现一个 JSON 解析器

第 1 步：你写接口
  class JsonParser {
  public:
      JsonValue parse(const std::string& json);
  };

第 2 步：你写（或审查 AI 写的）测试
  TEST(JsonParser, ParseEmptyObject) { ... }
  TEST(JsonParser, ParseString) { ... }
  TEST(JsonParser, ParseNumber) { ... }
  TEST(JsonParser, ParseNested) { ... }
  TEST(JsonParser, InvalidJson_Throws) { ... }

第 3 步：把头文件 + 测试文件给 AI
  "请实现 JsonParser，让所有测试通过"

第 4 步：跑测试
  $ ./test_json_parser
  [  PASSED  ] 4 tests.
  [  FAILED  ] 1 test.
  JsonParser.ParseNested: Expected nested value...

第 5 步：把失败信息给 AI
  "ParseNested 测试失败了，这是错误信息，请修复"

第 6 步：修复后全绿
  [  PASSED  ] 5 tests.
  ✅ 完成
```

------

## 第十三章：实战项目 —— 完整示例

把前面学到的所有技巧串起来，写一个完整的测试案例：

### 被测代码：简单的任务队列

```cpp
// include/task_queue.h
#pragma once
#include <queue>
#include <mutex>
#include <condition_variable>
#include <optional>
#include <functional>
#include <chrono>

class TaskQueue {
public:
    using Task = std::function<void()>;

    explicit TaskQueue(size_t max_size = 100);

    // 添加任务，队列满时返回 false
    bool push(Task task);

    // 获取任务，队列空时阻塞等待，超时返回 nullopt
    std::optional<Task> pop(std::chrono::milliseconds timeout);

    // 获取当前队列大小
    size_t size() const;

    // 队列是否为空
    bool empty() const;

    // 关闭队列（pop 将不再阻塞，返回 nullopt）
    void shutdown();

    bool is_shutdown() const;

private:
    mutable std::mutex mutex_;
    std::condition_variable cv_;
    std::queue<Task> queue_;
    size_t max_size_;
    bool shutdown_ = false;
};
```

### 完整测试代码

```cpp
// tests/test_task_queue.cpp
#include <gtest/gtest.h>
#include "task_queue.h"
#include <thread>
#include <atomic>

// ── Fixture ──
class TaskQueueTest : public ::testing::Test {
protected:
    TaskQueue queue{5};  // 容量为 5
};

// ── 基本功能 ──
TEST_F(TaskQueueTest, NewQueueIsEmpty) {
    EXPECT_TRUE(queue.empty());
    EXPECT_EQ(queue.size(), 0);
}

TEST_F(TaskQueueTest, PushIncreasesSize) {
    queue.push([]{ });
    EXPECT_EQ(queue.size(), 1);
    EXPECT_FALSE(queue.empty());
}

TEST_F(TaskQueueTest, PopReturnsTask) {
    bool executed = false;
    queue.push([&]{ executed = true; });

    auto task = queue.pop(std::chrono::milliseconds(100));
    ASSERT_TRUE(task.has_value());

    task.value()();  // 执行任务
    EXPECT_TRUE(executed);
    EXPECT_TRUE(queue.empty());
}

TEST_F(TaskQueueTest, FIFO_Order) {
    std::vector<int> order;
    queue.push([&]{ order.push_back(1); });
    queue.push([&]{ order.push_back(2); });
    queue.push([&]{ order.push_back(3); });

    for (int i = 0; i < 3; i++) {
        auto task = queue.pop(std::chrono::milliseconds(100));
        ASSERT_TRUE(task.has_value());
        task.value()();
    }

    EXPECT_EQ(order, (std::vector<int>{1, 2, 3}));
}

// ── 边界情况 ──
TEST_F(TaskQueueTest, PushReturnsFalseWhenFull) {
    for (int i = 0; i < 5; i++) {
        EXPECT_TRUE(queue.push([]{ }));
    }
    // 第 6 个应该失败
    EXPECT_FALSE(queue.push([]{ }));
}

TEST_F(TaskQueueTest, PopTimesOutWhenEmpty) {
    auto start = std::chrono::steady_clock::now();
    auto task = queue.pop(std::chrono::milliseconds(50));
    auto elapsed = std::chrono::steady_clock::now() - start;

    EXPECT_FALSE(task.has_value());
    EXPECT_GE(elapsed, std::chrono::milliseconds(40));  // 允许少量误差
}

// ── 多线程 ──
TEST_F(TaskQueueTest, ConcurrentPushAndPop) {
    std::atomic<int> sum{0};
    const int num_tasks = 100;
    TaskQueue bigQueue{200};

    // 生产者线程
    std::thread producer([&]{
        for (int i = 1; i <= num_tasks; i++) {
            bigQueue.push([&sum, i]{ sum += i; });
        }
    });

    // 消费者线程
    std::thread consumer([&]{
        for (int i = 0; i < num_tasks; i++) {
            auto task = bigQueue.pop(std::chrono::milliseconds(1000));
            if (task) task.value()();
        }
    });

    producer.join();
    consumer.join();

    // 1+2+...+100 = 5050
    EXPECT_EQ(sum.load(), 5050);
}

// ── Shutdown ──
TEST_F(TaskQueueTest, ShutdownUnblocksWaitingPop) {
    std::optional<TaskQueue::Task> result;

    std::thread waiter([&]{
        result = queue.pop(std::chrono::milliseconds(5000));
    });

    // 给 waiter 一点时间进入等待
    std::this_thread::sleep_for(std::chrono::milliseconds(50));

    queue.shutdown();
    waiter.join();

    EXPECT_FALSE(result.has_value());
    EXPECT_TRUE(queue.is_shutdown());
}

TEST_F(TaskQueueTest, PushFailsAfterShutdown) {
    queue.shutdown();
    EXPECT_FALSE(queue.push([]{ }));
}
```

### 对应的实现

```cpp
// src/task_queue.cpp
#include "task_queue.h"

TaskQueue::TaskQueue(size_t max_size) : max_size_(max_size) {}

bool TaskQueue::push(Task task) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (shutdown_ || queue_.size() >= max_size_) return false;
    queue_.push(std::move(task));
    cv_.notify_one();
    return true;
}

std::optional<TaskQueue::Task> TaskQueue::pop(std::chrono::milliseconds timeout) {
    std::unique_lock<std::mutex> lock(mutex_);
    if (!cv_.wait_for(lock, timeout, [this]{
        return !queue_.empty() || shutdown_;
    })) {
        return std::nullopt;  // 超时
    }
    if (queue_.empty()) return std::nullopt;  // shutdown 且队列空
    Task task = std::move(queue_.front());
    queue_.pop();
    return task;
}

size_t TaskQueue::size() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return queue_.size();
}

bool TaskQueue::empty() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return queue_.empty();
}

void TaskQueue::shutdown() {
    std::lock_guard<std::mutex> lock(mutex_);
    shutdown_ = true;
    cv_.notify_all();
}

bool TaskQueue::is_shutdown() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return shutdown_;
}
```

------

## 速查表

```
安装            CMake FetchContent + GTest::gtest_main
断言            EXPECT_*（继续）/ ASSERT_*（终止）
浮点数          EXPECT_NEAR / EXPECT_DOUBLE_EQ（不用 EXPECT_EQ）
Fixture         继承 testing::Test + SetUp/TearDown + TEST_F
参数化          TestWithParam<T> + TEST_P + INSTANTIATE_TEST_SUITE_P
Mock            MOCK_METHOD + EXPECT_CALL + Return/Throw
匹配器          _（任意）/ Eq / HasSubstr / Contains / AllOf
TDD 循环        红(失败测试) → 绿(最少代码) → 重构(改善结构)
运行过滤        --gtest_filter="Suite.Test*"
输出报告        --gtest_output=xml:report.xml
跳过测试        GTEST_SKIP()
死亡测试        EXPECT_DEATH(statement, regex)
CI              cmake --build + ctest --verbose
Windows         gtest_force_shared_crt ON + /utf-8
AI 工作流       先写测试 → AI 写实现 → 跑测试 → 迭代
```

------

> 测试不是负担，而是保障。尤其在 AI 辅助编程时代，**测试是你对代码质量唯一可靠的防线**。先写测试，让 AI 去填实现——你掌控标准，它负责干活。

> 本系列其他文章：
> - [现代 C++ 学习指南](/techlearn/posts/modern-cpp-guide/) —— 从 C++11 到 C++23 的核心特性
> - [现代 C++ 面试题](/techlearn/posts/modern-cpp-interview/) —— 50 道高频面试题
> - [shared_ptr + Lambda + 多线程](/techlearn/posts/shared-ptr-lambda-thread-safety/) —— 对象生命周期管理
> - [C++ 网络库实战](/techlearn/posts/cpp-network-libraries/) —— 10 大主流网络库指南
