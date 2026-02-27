---
title: C++ 对象模型与底层原理练手代码 —— 6 个可编译运行的探测实验
description: 覆盖虚函数表探测与手动调用、对象内存布局打印、多重继承菱形问题、虚继承内存分析、RTTI与dynamic_cast实现、POD与聚合类型判定，每个实验约100行可直接编译运行
date: 2026-02-27
categories: [编程语言]
tags: [c++, 练手代码, 对象模型, vtable, 内存布局, 虚继承, RTTI, 多重继承]
---

C++ 对象模型是面试的**深水区**——能当场画出 vtable 布局、解释虚继承的内存结构，直接拉开与其他候选人的差距。这篇文章提供 6 个实验程序，让你**亲眼看到**对象的内存布局和虚函数表。

> 📌 关联阅读：[C++ 对象模型面试题](/posts/cpp-object-model-interview) · [现代 C++ 面试题](/posts/modern-cpp-interview) · [现代 C++ 练手代码](/posts/modern-cpp-practice)

------

## 实验1：虚函数表探测与手动调用

**考点**：vptr 位置、vtable 结构、通过指针手动调用虚函数

```cpp
// vtable_probe.cpp
// g++ -std=c++17 -O0 -o vtable_probe vtable_probe.cpp
// 注意：此实验依赖 GCC/Clang 的 ABI 实现（Itanium C++ ABI）
#include <iostream>
#include <cstdint>

class Base {
public:
    virtual void foo() { std::cout << "  Base::foo()\n"; }
    virtual void bar() { std::cout << "  Base::bar()\n"; }
    virtual ~Base()    { std::cout << "  Base::~Base()\n"; }
    int x = 0xBBBB;
};

class Derived : public Base {
public:
    void foo() override { std::cout << "  Derived::foo()\n"; }
    void bar() override { std::cout << "  Derived::bar()\n"; }
    ~Derived() override { std::cout << "  Derived::~Derived()\n"; }
    int y = 0xDDDD;
};

// 函数指针类型（thiscall 无参虚函数）
using VFunc = void(*)(void*);

int main() {
    std::cout << "=== 1. 对象内存布局 ===\n";
    {
        Base b;
        Derived d;
        std::cout << "  sizeof(Base)    = " << sizeof(Base) << "\n";     // 16 (vptr=8 + x=4 + pad=4)
        std::cout << "  sizeof(Derived) = " << sizeof(Derived) << "\n";  // 24 (vptr=8 + x=4 + y=4 + pad)

        // vptr 在对象起始位置（Itanium ABI）
        auto* vptr_b = *reinterpret_cast<uintptr_t**>(&b);
        auto* vptr_d = *reinterpret_cast<uintptr_t**>(&d);
        std::cout << "  Base vptr    @ " << vptr_b << "\n";
        std::cout << "  Derived vptr @ " << vptr_d << "\n";
        std::cout << "  vptr different? " << (vptr_b != vptr_d ? "YES" : "NO") << "\n";
    }

    std::cout << "\n=== 2. 手动调用虚函数 ===\n";
    {
        Derived d;

        // 获取 vptr（对象起始8字节）
        auto* vptr = *reinterpret_cast<uintptr_t**>(&d);

        // vtable 布局 (Itanium ABI):
        //   vptr[0] = foo()
        //   vptr[1] = bar()
        //   vptr[2] = ~Derived() (complete destructor)
        //   vptr[3] = ~Derived() (deleting destructor)

        std::cout << "  calling vtable[0] (foo): ";
        auto fn0 = reinterpret_cast<VFunc>(vptr[0]);
        fn0(&d);  // 应输出 Derived::foo()

        std::cout << "  calling vtable[1] (bar): ";
        auto fn1 = reinterpret_cast<VFunc>(vptr[1]);
        fn1(&d);  // 应输出 Derived::bar()
    }

    std::cout << "\n=== 3. 多态验证 ===\n";
    {
        Base* p = new Derived();

        // 通过 Base* 调用，走 Derived 的 vtable
        p->foo();  // Derived::foo()
        p->bar();  // Derived::bar()

        // Base* 和 Derived* 的 vptr 指向同一个 vtable
        auto* vptr = *reinterpret_cast<uintptr_t**>(p);
        Derived d2;
        auto* vptr2 = *reinterpret_cast<uintptr_t**>(&d2);
        std::cout << "  same vtable? " << (vptr[0] == vptr2[0] ? "YES" : "NO") << "\n";

        delete p;
    }

    std::cout << "\n=== 4. 成员变量偏移 ===\n";
    {
        Derived d;
        auto base_addr = reinterpret_cast<uintptr_t>(&d);

        // vptr 在 offset 0
        std::cout << "  vptr offset = 0\n";

        // x (Base::x) 在 vptr 之后
        auto x_offset = reinterpret_cast<uintptr_t>(&d.x) - base_addr;
        std::cout << "  Base::x offset = " << x_offset << "\n";  // 8

        // y (Derived::y) 在 x 之后
        auto y_offset = reinterpret_cast<uintptr_t>(&d.y) - base_addr;
        std::cout << "  Derived::y offset = " << y_offset << "\n";  // 12

        // 十六进制打印内存
        auto* bytes = reinterpret_cast<unsigned char*>(&d);
        std::cout << "  memory dump: ";
        for (size_t i = 0; i < sizeof(d) && i < 24; ++i) {
            printf("%02x ", bytes[i]);
        }
        std::cout << "\n";
    }

    std::cout << "\nDone!\n";
}
```

**关键点**：
- Itanium ABI 中 vptr 在对象起始位置（偏移 0）
- vtable 是一个函数指针数组，每个虚函数占一个槽位
- 同一个类的所有实例共享同一个 vtable
- 手动调用 vtable 纯属学习目的，生产代码**绝不要这么做**

---

## 实验2：多重继承内存布局

**考点**：多个 vptr、this 指针调整、菱形继承问题

```cpp
// multiple_inheritance.cpp
// g++ -std=c++17 -O0 -o multiple_inheritance multiple_inheritance.cpp
#include <iostream>
#include <cstdint>

class Animal {
public:
    virtual void speak() { std::cout << "  Animal::speak()\n"; }
    int animal_id = 0xAAAA;
};

class Flyable {
public:
    virtual void fly() { std::cout << "  Flyable::fly()\n"; }
    int wing_span = 0xFFFF;
};

class Bird : public Animal, public Flyable {
public:
    void speak() override { std::cout << "  Bird::speak()\n"; }
    void fly() override   { std::cout << "  Bird::fly()\n"; }
    int feather_count = 0xBBBB;
};

void print_offset(const char* name, uintptr_t base, uintptr_t member) {
    std::cout << "  " << name << " offset = " << (member - base) << "\n";
}

int main() {
    std::cout << "=== 1. 多重继承内存布局 ===\n";
    {
        Bird b;
        auto base = reinterpret_cast<uintptr_t>(&b);

        std::cout << "  sizeof(Animal)  = " << sizeof(Animal) << "\n";   // 16
        std::cout << "  sizeof(Flyable) = " << sizeof(Flyable) << "\n";  // 16
        std::cout << "  sizeof(Bird)    = " << sizeof(Bird) << "\n";     // 40

        // 内存布局：
        // [Animal vptr][animal_id][pad] [Flyable vptr][wing_span][pad] [feather_count][pad]
        print_offset("animal_id",     base, reinterpret_cast<uintptr_t>(&b.animal_id));
        print_offset("wing_span",     base, reinterpret_cast<uintptr_t>(&b.wing_span));
        print_offset("feather_count", base, reinterpret_cast<uintptr_t>(&b.feather_count));

        std::cout << "\n  Memory layout:\n";
        std::cout << "  [0]  Animal vptr     → speak()\n";
        std::cout << "  [8]  animal_id\n";
        std::cout << "  [16] Flyable vptr    → fly()\n";
        std::cout << "  [24] wing_span\n";
        std::cout << "  [32] feather_count\n";
    }

    std::cout << "\n=== 2. this 指针调整 ===\n";
    {
        Bird b;
        Bird* bird_ptr = &b;
        Animal* animal_ptr = &b;    // 向上转型到第一个基类
        Flyable* flyable_ptr = &b;  // 向上转型到第二个基类

        std::cout << "  Bird*    = " << bird_ptr << "\n";
        std::cout << "  Animal*  = " << animal_ptr << "\n";
        std::cout << "  Flyable* = " << flyable_ptr << "\n";

        // Animal* 和 Bird* 地址相同（第一个基类）
        // Flyable* 地址不同！编译器做了 this 指针调整
        auto diff = reinterpret_cast<uintptr_t>(flyable_ptr)
                  - reinterpret_cast<uintptr_t>(bird_ptr);
        std::cout << "  Flyable* - Bird* = " << diff << " bytes (this adjustment)\n";

        // 多态调用仍然正确
        animal_ptr->speak();   // Bird::speak()
        flyable_ptr->fly();    // Bird::fly()
    }

    std::cout << "\n=== 3. dynamic_cast 在多重继承中 ===\n";
    {
        Bird b;
        Animal* ap = &b;

        // 从 Animal* 交叉转型到 Flyable*（跨继承链）
        Flyable* fp = dynamic_cast<Flyable*>(ap);
        std::cout << "  Animal* → Flyable* : "
                  << (fp ? "success" : "failed") << "\n";  // success
        if (fp) fp->fly();  // Bird::fly()

        // 向下转型
        Bird* bp = dynamic_cast<Bird*>(ap);
        std::cout << "  Animal* → Bird*    : "
                  << (bp ? "success" : "failed") << "\n";  // success
    }

    std::cout << "\n=== 4. 两个 vptr 验证 ===\n";
    {
        Bird b;
        auto* raw = reinterpret_cast<uintptr_t*>(&b);

        // raw[0] 是 Animal vtable 的 vptr
        // raw[2] 是 Flyable vtable 的 vptr（偏移 16 字节 = 2 个 uintptr_t）
        auto vptr1 = raw[0];
        auto vptr2 = raw[2];  // sizeof(Animal) / sizeof(uintptr_t)

        std::cout << "  vptr1 (Animal)  = " << std::hex << vptr1 << "\n";
        std::cout << "  vptr2 (Flyable) = " << std::hex << vptr2 << "\n";
        std::cout << "  different vtables? "
                  << (vptr1 != vptr2 ? "YES" : "NO") << std::dec << "\n";
    }

    std::cout << "\nDone!\n";
}
```

**关键点**：
- 多重继承的对象有**多个 vptr**，每个基类子对象一个
- 向上转型到非第一个基类时，编译器自动调整 this 指针
- `dynamic_cast` 支持跨继承链的交叉转型（需要 RTTI）
- 理解内存布局是回答"多态开销"问题的关键

---

## 实验3：虚继承与菱形继承

**考点**：虚基类指针(vbptr)、共享基类实例、虚继承内存开销

```cpp
// virtual_inheritance.cpp
// g++ -std=c++17 -O0 -o virtual_inheritance virtual_inheritance.cpp
#include <iostream>
#include <cstdint>

// 菱形继承问题
//      Base
//      /  \
//     A    B
//      \  /
//       D

class Base {
public:
    int base_val = 0xFF;
    virtual void identify() { std::cout << "  Base\n"; }
};

// ============ 不使用虚继承（有二义性）============
namespace NoVirtual {
    class A : public Base {
    public:
        int a_val = 0xAA;
    };
    class B : public Base {
    public:
        int b_val = 0xBB;
    };
    class D : public A, public B {
    public:
        int d_val = 0xDD;
    };
}

// ============ 使用虚继承（解决二义性）============
namespace WithVirtual {
    class A : virtual public Base {
    public:
        int a_val = 0xAA;
    };
    class B : virtual public Base {
    public:
        int b_val = 0xBB;
    };
    class D : public A, public B {
    public:
        int d_val = 0xDD;
        void identify() override { std::cout << "  D\n"; }
    };
}

int main() {
    std::cout << "=== 1. 不使用虚继承（菱形问题）===\n";
    {
        NoVirtual::D d;
        std::cout << "  sizeof(D) = " << sizeof(d) << "\n";

        // d.base_val;  // 编译错误：ambiguous！
        d.A::base_val = 1;  // 必须指定路径
        d.B::base_val = 2;

        std::cout << "  d.A::base_val = " << d.A::base_val << "\n";  // 1
        std::cout << "  d.B::base_val = " << d.B::base_val << "\n";  // 2
        std::cout << "  两份 Base 副本！地址不同: "
                  << (&d.A::base_val != &d.B::base_val ? "YES" : "NO") << "\n";

        // 内存：[A::vptr][A::Base::base_val][a_val] [B::vptr][B::Base::base_val][b_val] [d_val]
    }

    std::cout << "\n=== 2. 使用虚继承（解决菱形）===\n";
    {
        WithVirtual::D d;
        std::cout << "  sizeof(D) = " << sizeof(d) << "\n";

        // 只有一份 Base，可以直接访问
        d.base_val = 42;
        std::cout << "  d.base_val = " << d.base_val << "\n";  // 42

        // 通过不同路径访问，是同一个
        std::cout << "  same Base? "
                  << (&static_cast<WithVirtual::A&>(d).base_val ==
                      &static_cast<WithVirtual::B&>(d).base_val ? "YES" : "NO")
                  << "\n";  // YES

        // 多态正常工作
        Base* bp = &d;
        bp->identify();  // D
    }

    std::cout << "\n=== 3. 虚继承的内存开销 ===\n";
    {
        std::cout << "  sizeof(Base)              = " << sizeof(Base) << "\n";
        std::cout << "  sizeof(NoVirtual::A)      = " << sizeof(NoVirtual::A) << "\n";
        std::cout << "  sizeof(WithVirtual::A)    = " << sizeof(WithVirtual::A) << "\n";
        std::cout << "  sizeof(NoVirtual::D)      = " << sizeof(NoVirtual::D) << "\n";
        std::cout << "  sizeof(WithVirtual::D)    = " << sizeof(WithVirtual::D) << "\n";

        // 虚继承的 A 比普通继承的 A 大——多了 vbptr（虚基类指针）
        std::cout << "\n  虚继承额外开销来自 vbptr（虚基类指针/偏移表）\n";
        std::cout << "  用于在运行时找到共享的 Base 子对象位置\n";
    }

    std::cout << "\n=== 4. 构造顺序验证 ===\n";
    {
        struct VBase {
            VBase() { std::cout << "  VBase()\n"; }
        };
        struct VA : virtual VBase {
            VA() { std::cout << "  VA()\n"; }
        };
        struct VB : virtual VBase {
            VB() { std::cout << "  VB()\n"; }
        };
        struct VD : VA, VB {
            VD() { std::cout << "  VD()\n"; }
        };

        std::cout << "  构造顺序（虚基类最先）:\n";
        VD d;
        // 输出: VBase → VA → VB → VD
        // 虚基类由最终派生类直接构造，只构造一次
    }

    std::cout << "\nDone!\n";
}
```

**关键点**：
- 不用虚继承：菱形继承有两份 Base，访问需指定路径
- 虚继承：共享一份 Base，但多了 vbptr 开销
- 虚基类由**最终派生类**负责构造（不是中间类）
- 虚继承的对象布局更复杂，运行时需要通过 vbptr 间接寻址

---

## 实验4：RTTI 与 typeid / dynamic_cast

**考点**：type_info 结构、dynamic_cast 代价、typeid 用法

```cpp
// rtti_experiment.cpp
// g++ -std=c++17 -O0 -o rtti_experiment rtti_experiment.cpp
#include <iostream>
#include <typeinfo>
#include <string>
#include <vector>
#include <memory>
#include <chrono>

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
    double radius() const { return r_; }
};

class Rect : public Shape {
    double w_, h_;
public:
    Rect(double w, double h) : w_(w), h_(h) {}
    double area() const override { return w_ * h_; }
};

class Triangle : public Shape {
    double base_, height_;
public:
    Triangle(double b, double h) : base_(b), height_(h) {}
    double area() const override { return 0.5 * base_ * height_; }
};

int main() {
    std::cout << "=== 1. typeid 基本用法 ===\n";
    {
        Circle c(5.0);
        Rect r(3.0, 4.0);
        Shape& ref = c;

        // typeid 返回 std::type_info
        std::cout << "  typeid(c)   = " << typeid(c).name() << "\n";
        std::cout << "  typeid(r)   = " << typeid(r).name() << "\n";
        std::cout << "  typeid(ref) = " << typeid(ref).name() << "\n";  // 多态：Circle

        // 非多态类型，typeid 看声明类型
        int x = 42;
        std::cout << "  typeid(x)   = " << typeid(x).name() << "\n";

        // type_info 可以比较
        std::cout << "  ref is Circle? " << (typeid(ref) == typeid(Circle)) << "\n";  // 1
    }

    std::cout << "\n=== 2. dynamic_cast 向下转型 ===\n";
    {
        auto shapes = std::vector<std::unique_ptr<Shape>>{};
        shapes.push_back(std::make_unique<Circle>(5.0));
        shapes.push_back(std::make_unique<Rect>(3.0, 4.0));
        shapes.push_back(std::make_unique<Triangle>(6.0, 3.0));

        for (const auto& s : shapes) {
            // 指针版 dynamic_cast：失败返回 nullptr
            if (auto* cp = dynamic_cast<Circle*>(s.get())) {
                std::cout << "  Circle! radius = " << cp->radius() << "\n";
            } else if (auto* rp = dynamic_cast<Rect*>(s.get())) {
                std::cout << "  Rect! area = " << rp->area() << "\n";
            } else {
                std::cout << "  Other shape, area = " << s->area() << "\n";
            }
        }
    }

    std::cout << "\n=== 3. dynamic_cast 引用版（抛异常）===\n";
    {
        Circle c(3.0);
        Shape& ref = c;

        try {
            Circle& cr = dynamic_cast<Circle&>(ref);
            std::cout << "  cast to Circle& OK, r=" << cr.radius() << "\n";
        } catch (const std::bad_cast& e) {
            std::cout << "  bad_cast: " << e.what() << "\n";
        }

        try {
            Rect& rr = dynamic_cast<Rect&>(ref);  // 应该失败
            (void)rr;
        } catch (const std::bad_cast& e) {
            std::cout << "  bad_cast caught: " << e.what() << "\n";
        }
    }

    std::cout << "\n=== 4. RTTI vs 虚函数（性能对比思路）===\n";
    {
        // dynamic_cast 涉及类型信息遍历，比虚函数调用慢
        // 好的设计应该用虚函数多态，而不是 dynamic_cast 判类型
        std::cout << "  反模式（用 dynamic_cast）:\n";
        std::cout << "    if (auto* c = dynamic_cast<Circle*>(s)) ...\n";
        std::cout << "    else if (auto* r = dynamic_cast<Rect*>(s)) ...\n\n";

        std::cout << "  正确做法（用虚函数/Visitor）:\n";
        std::cout << "    s->accept(visitor);  // 编译期多态分发\n\n";

        // 可以用 -fno-rtti 禁用 RTTI 节省空间
        std::cout << "  编译选项 -fno-rtti 禁用 RTTI:\n";
        std::cout << "  - typeid 不可用\n";
        std::cout << "  - dynamic_cast 不可用\n";
        std::cout << "  - 减小二进制大小（去掉 type_info 表）\n";
    }

    std::cout << "\nDone!\n";
}
```

**关键点**：
- `typeid` 对多态类型看实际类型，对非多态类型看声明类型
- `dynamic_cast` 指针版失败返回 `nullptr`，引用版抛 `std::bad_cast`
- `dynamic_cast` 有运行时开销，优先用虚函数多态
- `-fno-rtti` 可禁用 RTTI 减小二进制体积（Google/游戏引擎常用）

---

## 实验5：成员函数指针与 std::invoke

**考点**：成员函数指针语法、`std::invoke` 统一调用、`std::mem_fn`

```cpp
// member_pointer.cpp
// g++ -std=c++17 -O0 -o member_pointer member_pointer.cpp
#include <iostream>
#include <functional>
#include <vector>
#include <string>
#include <algorithm>

class Widget {
    std::string name_;
    int value_;
public:
    Widget(std::string n, int v) : name_(std::move(n)), value_(v) {}

    void print() const {
        std::cout << "  " << name_ << " = " << value_ << "\n";
    }
    int get_value() const { return value_; }
    void set_value(int v) { value_ = v; }
    const std::string& name() const { return name_; }

    static void static_func() {
        std::cout << "  Widget::static_func()\n";
    }
};

int main() {
    std::cout << "=== 1. 成员函数指针 ===\n";
    {
        // 声明成员函数指针（语法复杂）
        void (Widget::*print_ptr)() const = &Widget::print;
        int (Widget::*get_ptr)() const = &Widget::get_value;

        Widget w("test", 42);

        // 调用：对象 + .* 或 ->*
        (w.*print_ptr)();
        int val = (w.*get_ptr)();
        std::cout << "  via pointer: " << val << "\n";

        // 指针调用
        Widget* pw = &w;
        (pw->*print_ptr)();
    }

    std::cout << "\n=== 2. std::invoke 统一调用 ===\n";
    {
        Widget w("invoke", 100);

        // std::invoke 统一了所有可调用对象的调用方式
        std::invoke(&Widget::print, w);                  // 成员函数
        auto v = std::invoke(&Widget::get_value, w);     // 成员函数
        std::cout << "  invoke get_value: " << v << "\n";

        // 成员变量指针也可以 invoke
        // auto& name = std::invoke(&Widget::name, w);

        // 普通函数/lambda
        auto add = [](int a, int b) { return a + b; };
        std::cout << "  invoke lambda: " << std::invoke(add, 3, 4) << "\n";

        // 静态成员函数
        std::invoke(&Widget::static_func);
    }

    std::cout << "\n=== 3. std::mem_fn 包装 ===\n";
    {
        std::vector<Widget> widgets = {
            {"Alice", 30}, {"Bob", 10}, {"Carol", 50}
        };

        // std::mem_fn 把成员函数包装成普通可调用对象
        auto printer = std::mem_fn(&Widget::print);
        for (const auto& w : widgets) printer(w);

        // 配合算法使用
        auto get_val = std::mem_fn(&Widget::get_value);
        auto it = std::max_element(widgets.begin(), widgets.end(),
            [&](const Widget& a, const Widget& b) {
                return get_val(a) < get_val(b);
            });
        std::cout << "  max: ";
        it->print();

        // 排序（按 value）
        std::sort(widgets.begin(), widgets.end(),
            [](const Widget& a, const Widget& b) {
                return a.get_value() < b.get_value();
            });
        std::cout << "  sorted:\n";
        for (const auto& w : widgets) printer(w);
    }

    std::cout << "\n=== 4. 成员函数指针大小 ===\n";
    {
        // 成员函数指针可能比普通函数指针大！
        std::cout << "  sizeof(void(*)())               = " << sizeof(void(*)()) << "\n";
        std::cout << "  sizeof(void(Widget::*)() const)  = "
                  << sizeof(void(Widget::*)() const) << "\n";
        // 虚继承类的成员指针可能更大（需要 this 调整信息）
    }

    std::cout << "\nDone!\n";
}
```

**关键点**：
- 成员函数指针类型写法复杂：`RetType (Class::*name)(Args) const`
- `std::invoke` 统一了函数指针、成员指针、lambda、仿函数的调用方式
- `std::mem_fn` 将成员函数包装为可直接传给算法的可调用对象
- 成员函数指针大小可能大于普通指针（包含 this 调整偏移信息）

---

## 实验6：对象布局与对齐 (alignof/alignas)

**考点**：内存对齐规则、padding 计算、`alignas` 指定对齐、cache line 对齐

```cpp
// alignment_layout.cpp
// g++ -std=c++17 -O0 -o alignment_layout alignment_layout.cpp
#include <iostream>
#include <cstdint>
#include <cstddef>

// ============ 对齐导致的 padding ============
struct BadLayout {
    char a;      // 1 byte + 7 padding
    double b;    // 8 bytes
    char c;      // 1 byte + 3 padding
    int d;       // 4 bytes
};  // 总计 24 bytes（浪费 10 bytes）

struct GoodLayout {
    double b;    // 8 bytes
    int d;       // 4 bytes
    char a;      // 1 byte
    char c;      // 1 byte + 2 padding
};  // 总计 16 bytes（只浪费 2 bytes）

// ============ #pragma pack ============
#pragma pack(push, 1)
struct PackedLayout {
    char a;
    double b;
    char c;
    int d;
};  // 总计 14 bytes（无 padding，但可能有性能问题）
#pragma pack(pop)

// ============ alignas 指定对齐 ============
struct alignas(64) CacheAligned {
    int data[4];
};  // 对齐到 64 字节（缓存行大小）

struct NormalStruct {
    int data[4];
};

// ============ 打印布局工具 ============
#define PRINT_FIELD(type, field) \
    std::cout << "  " #field ": offset=" << offsetof(type, field) \
              << ", size=" << sizeof(((type*)0)->field) << "\n"

int main() {
    std::cout << "=== 1. 对齐导致的 padding ===\n";
    {
        std::cout << "  BadLayout:\n";
        std::cout << "  sizeof = " << sizeof(BadLayout) << "\n";
        PRINT_FIELD(BadLayout, a);  // 0
        PRINT_FIELD(BadLayout, b);  // 8
        PRINT_FIELD(BadLayout, c);  // 16
        PRINT_FIELD(BadLayout, d);  // 20
        std::cout << "  alignof = " << alignof(BadLayout) << "\n";

        std::cout << "\n  GoodLayout (重排后):\n";
        std::cout << "  sizeof = " << sizeof(GoodLayout) << "\n";
        PRINT_FIELD(GoodLayout, b);  // 0
        PRINT_FIELD(GoodLayout, d);  // 8
        PRINT_FIELD(GoodLayout, a);  // 12
        PRINT_FIELD(GoodLayout, c);  // 13
        std::cout << "  alignof = " << alignof(GoodLayout) << "\n";

        std::cout << "\n  节省 " << sizeof(BadLayout) - sizeof(GoodLayout)
                  << " bytes！\n";
    }

    std::cout << "\n=== 2. #pragma pack(1) 紧凑布局 ===\n";
    {
        std::cout << "  PackedLayout:\n";
        std::cout << "  sizeof = " << sizeof(PackedLayout) << "\n";  // 14
        PRINT_FIELD(PackedLayout, a);  // 0
        PRINT_FIELD(PackedLayout, b);  // 1 (未对齐！)
        PRINT_FIELD(PackedLayout, c);  // 9
        PRINT_FIELD(PackedLayout, d);  // 10
        std::cout << "  ⚠ 未对齐的访问在某些架构上会崩溃或变慢\n";
    }

    std::cout << "\n=== 3. alignas 缓存行对齐 ===\n";
    {
        std::cout << "  sizeof(CacheAligned)  = " << sizeof(CacheAligned) << "\n";   // 64
        std::cout << "  alignof(CacheAligned) = " << alignof(CacheAligned) << "\n";  // 64
        std::cout << "  sizeof(NormalStruct)  = " << sizeof(NormalStruct) << "\n";    // 16
        std::cout << "  alignof(NormalStruct) = " << alignof(NormalStruct) << "\n";   // 4

        CacheAligned obj;
        auto addr = reinterpret_cast<uintptr_t>(&obj);
        std::cout << "  CacheAligned addr % 64 = " << (addr % 64) << "\n";  // 0
        std::cout << "  缓存行对齐用于避免 false sharing\n";
    }

    std::cout << "\n=== 4. 空基类优化 (EBO) ===\n";
    {
        struct Empty {};
        struct NotEBO {
            Empty e;  // 占 1 字节 + padding
            int x;
        };
        struct WithEBO : Empty {
            int x;  // Empty 基类优化为 0 字节
        };

        std::cout << "  sizeof(Empty)    = " << sizeof(Empty) << "\n";     // 1
        std::cout << "  sizeof(NotEBO)   = " << sizeof(NotEBO) << "\n";    // 8 (1+3pad+4)
        std::cout << "  sizeof(WithEBO)  = " << sizeof(WithEBO) << "\n";   // 4 (EBO!)

        // C++20 [[no_unique_address]] 也能实现类似效果
        struct WithAttr {
            [[no_unique_address]] Empty e;
            int x;
        };
        std::cout << "  sizeof(WithAttr) = " << sizeof(WithAttr) << "\n";  // 4
    }

    std::cout << "\n=== 5. 对齐分配内存 ===\n";
    {
        // C++17 aligned new
        auto* p = new CacheAligned;
        auto addr = reinterpret_cast<uintptr_t>(p);
        std::cout << "  new CacheAligned addr % 64 = " << (addr % 64) << "\n";
        delete p;

        // std::aligned_alloc (C11/C++17)
        void* raw = std::aligned_alloc(64, 64 * 10);
        std::cout << "  aligned_alloc addr % 64 = "
                  << (reinterpret_cast<uintptr_t>(raw) % 64) << "\n";
        std::free(raw);
    }

    std::cout << "\nDone!\n";
}
```

**关键点**：
- 成员按大小降序排列可以最小化 padding
- `#pragma pack(1)` 消除 padding 但可能导致性能下降或硬件异常
- `alignas(64)` 对齐到缓存行边界，用于避免多线程 false sharing
- 空基类优化 (EBO) 和 `[[no_unique_address]]` 消除空类的 1 字节开销
