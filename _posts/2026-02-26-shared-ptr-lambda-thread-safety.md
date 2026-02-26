---
title: shared_ptr + Lambda + 多线程 —— 对象到底什么时候死？一篇搞懂生命周期管理
description: 用大量图解和案例，从零讲解 shared_ptr 在 Lambda 捕获和多线程场景下的对象生命周期管理，帮你彻底搞懂"谁持有对象、对象何时销毁、怎样才安全"
date: 2026-02-26
categories: [编程语言]
tags: [c++, shared_ptr, lambda, 多线程, 生命周期, 智能指针, enable_shared_from_this]
---

这个话题是现代 C++ 中最容易让人困惑的知识点之一。你可能单独学过 shared_ptr、学过 Lambda、学过多线程，每个都觉得"大概懂了"，但三者结合起来就懵了——对象到底什么时候死？Lambda 里捕获的指针还有效吗？多线程里谁最后释放？

这篇文章用**一个问题贯穿全文**：一个对象被多个地方引用，怎么保证用到它的时候它还活着，不用了之后它会自动死掉？

------

## 一、先从一个 Bug 说起

### 1.1 一段看起来没问题的代码

```cpp
class Connection {
public:
    void start() {
        // 启动一个线程去处理数据
        std::thread t([this]() {    // Lambda 捕获 this 指针
            std::this_thread::sleep_for(std::chrono::seconds(2));
            process();               // 2 秒后调用 process
        });
        t.detach();                  // 线程分离，后台运行
    }

    void process() {
        std::cout << "Processing data: " << data_ << std::endl;
    }

private:
    int data_ = 42;
};

int main() {
    {
        Connection conn;
        conn.start();               // 启动后台线程
    }   // conn 在这里销毁了！

    std::this_thread::sleep_for(std::chrono::seconds(3));
    // 后台线程 2 秒后调用 conn.process()
    // 但 conn 早就死了！→ 访问已销毁的对象 → 未定义行为 → 崩溃/乱码
}
```

### 1.2 问题的本质

```
时间线：

t=0s    conn 创建，启动后台线程
t=0s    conn.start() 返回
t=0s    离开作用域，conn 被析构 💀
        但后台线程还持有 this 指针！

t=2s    后台线程醒来
        调用 this->process()
        this 指向的内存已经被释放了
        💥 崩溃！

根本原因：
  Lambda 捕获了 this（原始指针）
  但 Lambda（后台线程）的生命周期 > 对象的生命周期
  对象先死了，Lambda 还在用它 → 悬空指针（dangling pointer）
```

**这就是 shared_ptr + Lambda 要解决的核心问题：让对象"活到最后一个使用者用完为止"。**

------

## 二、shared_ptr 的核心机制回顾

### 2.1 引用计数 = 有多少人在用这个对象

```
shared_ptr 的本质：每个 shared_ptr 是一个"使用凭证"

auto p1 = std::make_shared<Widget>();  // 引用计数 = 1
                                        // p1 持有一张凭证

auto p2 = p1;                          // 引用计数 = 2
                                        // p2 也拿了一张凭证

auto p3 = p1;                          // 引用计数 = 3
                                        // 三张凭证

p3.reset();                            // 引用计数 = 2
                                        // p3 交还了凭证

p2.reset();                            // 引用计数 = 1
                                        // 又交还一张

p1.reset();                            // 引用计数 = 0
                                        // 最后一张也交还了
                                        // 对象被销毁 💀
```

```
图解：

  p1 ──┐
       ├──→ [控制块: count=3] ──→ [Widget 对象]
  p2 ──┤
       │
  p3 ──┘

  p3 销毁后：
  p1 ──┐
       ├──→ [控制块: count=2] ──→ [Widget 对象]
  p2 ──┘

  全部销毁后：
  (无人引用)  [控制块: count=0] ──→ [Widget 对象] 💀 delete
```

### 2.2 关键规则

```
规则 1：拷贝 shared_ptr → 引用计数 +1（多一个人用）
规则 2：shared_ptr 销毁 → 引用计数 -1（少一个人用）
规则 3：引用计数 = 0 → 对象被 delete（没人用了就释放）
规则 4：引用计数的加减是原子操作（多线程安全）
```

**规则 4 很重要：引用计数本身是线程安全的！** 多个线程可以同时拷贝/销毁 shared_ptr，计数不会出错。但是，**对象本身不一定线程安全**——这是另一回事。

------

## 三、Lambda 捕获 shared_ptr —— 续命的关键

### 3.1 捕获 this vs 捕获 shared_ptr

回到开头的 Bug，问题在于 Lambda 捕获了原始指针 `this`。修复方法是让 Lambda **持有一份 shared_ptr 的拷贝**：

```cpp
// ❌ 捕获 this（原始指针）—— 不管理生命周期
[this]() {
    this->process();  // this 可能已经失效！
};

// ✅ 捕获 shared_ptr 的拷贝 —— 引用计数 +1，续命
[self = shared_from_this()]() {
    self->process();  // self 是 shared_ptr，保证对象还活着
};
```

### 3.2 shared_from_this 是什么？

要在对象内部获取指向自己的 shared_ptr，必须继承 `std::enable_shared_from_this`：

```cpp
// 继承 enable_shared_from_this
class Connection : public std::enable_shared_from_this<Connection> {
public:
    void start() {
        // shared_from_this() 返回一个指向自己的 shared_ptr
        // Lambda 捕获这个 shared_ptr → 引用计数 +1 → 对象不会提前死掉
        auto self = shared_from_this();

        std::thread t([self]() {         // 捕获 shared_ptr 的拷贝！
            std::this_thread::sleep_for(std::chrono::seconds(2));
            self->process();             // 2 秒后调用，对象保证还活着
        });
        t.detach();
    }

    void process() {
        std::cout << "Processing: " << data_ << std::endl;
    }

private:
    int data_ = 42;
};

int main() {
    {
        // 注意：必须用 shared_ptr 创建对象！
        auto conn = std::make_shared<Connection>();
        conn->start();   // 后台线程捕获了 shared_ptr，引用计数 +1
    }
    // conn（main 中的 shared_ptr）销毁了，引用计数 -1
    // 但后台线程的 self 还在！引用计数 = 1，对象不死

    std::this_thread::sleep_for(std::chrono::seconds(3));
    // 2 秒后后台线程结束
    // self 销毁，引用计数 = 0
    // 对象这时候才被释放 ✅
}
```

### 3.3 图解生命周期

```
时间线：

t=0s  main 中 conn (shared_ptr) 创建
      引用计数 = 1

      conn->start()
        Lambda 捕获 self = shared_from_this()
        引用计数 = 2

      conn 离开作用域，析构
      引用计数 = 1（还有后台线程的 self）
      对象不死！✅

t=2s  后台线程执行 self->process()
      对象还活着，正常工作 ✅

      后台线程结束，self 析构
      引用计数 = 0
      对象被释放 💀

整个过程：对象活到了最后一个使用者用完为止
```

```
        conn (main)          self (后台线程)
        ──────────           ─────────────────
t=0s    创建 [count=1]       捕获 [count=2]
t=0s    销毁 [count=1]       还在 [count=1]     ← 对象活着
t=2s                         使用 process()      ← 安全调用
t=2s                         销毁 [count=0]      ← 对象释放
```

------

## 四、enable_shared_from_this 的规则和陷阱

### 4.1 必须用 shared_ptr 管理对象

```cpp
class Widget : public std::enable_shared_from_this<Widget> {
public:
    std::shared_ptr<Widget> getPtr() {
        return shared_from_this();
    }
};

// ✅ 正确：用 make_shared 创建
auto w = std::make_shared<Widget>();
auto p = w->getPtr();  // 没问题

// ❌ 错误：栈上创建
Widget w;
auto p = w.getPtr();   // 💥 未定义行为！没有 shared_ptr 管理这个对象

// ❌ 错误：裸 new
Widget* w = new Widget();
auto p = w->getPtr();  // 💥 未定义行为！
```

**为什么？** `shared_from_this()` 需要找到已有的控制块。如果对象不是由 `shared_ptr` 管理的，就没有控制块，调用就会出错。

### 4.2 不能在构造函数中调用

```cpp
class Widget : public std::enable_shared_from_this<Widget> {
public:
    Widget() {
        // ❌ 此时 shared_ptr 还没接管对象！
        auto self = shared_from_this();  // 💥 抛异常 bad_weak_ptr
    }
};

// 原因：构造函数执行时，make_shared 还没返回
// shared_ptr 的控制块还没绑定到对象上
// 所以 shared_from_this() 找不到控制块

// ✅ 解决方案：用工厂函数 + init 方法
class Widget : public std::enable_shared_from_this<Widget> {
    Widget() {}  // 私有构造函数
public:
    static std::shared_ptr<Widget> create() {
        auto w = std::shared_ptr<Widget>(new Widget());
        w->init();  // 现在可以安全调用 shared_from_this
        return w;
    }

    void init() {
        auto self = shared_from_this();  // ✅ 此时有控制块了
        // 可以安全地注册回调等
    }
};
```

### 4.3 enable_shared_from_this 的底层原理

```
enable_shared_from_this 内部有一个 weak_ptr 成员：

class enable_shared_from_this<T> {
    mutable weak_ptr<T> weak_this_;  // 内部的弱引用
    // ...
};

当你用 make_shared<T>() 创建对象时：
1. 分配内存，构造 T 对象
2. 创建控制块
3. 检测 T 是否继承了 enable_shared_from_this
4. 如果是 → 把刚创建的 shared_ptr 存到 weak_this_ 里

shared_from_this() 的实现：
shared_ptr<T> shared_from_this() {
    return shared_ptr<T>(weak_this_);  // 从 weak_ptr 升级为 shared_ptr
}
```

------

## 五、异步回调中的生命周期管理

### 5.1 Boost.Asio 中的经典模式

这是网络编程中最常见的场景：一个 Session 对象处理一个连接，异步读写操作的回调需要访问 Session。

```cpp
class Session : public std::enable_shared_from_this<Session> {
    tcp::socket socket_;
    char buffer_[1024];

public:
    Session(tcp::socket socket) : socket_(std::move(socket)) {}

    void start() {
        doRead();
    }

private:
    void doRead() {
        // 关键：Lambda 捕获 self
        auto self = shared_from_this();

        socket_.async_read_some(
            boost::asio::buffer(buffer_),
            [this, self](boost::system::error_code ec, size_t length) {
            //       ↑ self 保证：回调执行时 Session 还活着
            //  ↑ this 是为了方便访问成员（和 self.get() 指向同一个对象）
                if (!ec) {
                    doWrite(length);
                }
                // 如果 ec 有错误，不再 doRead/doWrite
                // self 在回调结束后销毁
                // 如果没有其他 shared_ptr 指向这个 Session → 引用计数=0 → Session 自动释放
            });
    }

    void doWrite(size_t length) {
        auto self = shared_from_this();

        boost::asio::async_write(
            socket_, boost::asio::buffer(buffer_, length),
            [this, self](boost::system::error_code ec, size_t) {
                if (!ec) {
                    doRead();  // 写完继续读 → 新的 shared_ptr 被 Lambda 捕获
                }
            });
    }
};
```

### 5.2 图解 Session 的生命周期链

```
Session 的生命周期由"回调链"维持：

  accept 回调持有 shared_ptr
       │
       ▼
  doRead() → Lambda 1 捕获 self [count +1]
  accept 回调结束 [count -1]
       │
       ▼ （async_read 完成）
  Lambda 1 执行 → doWrite() → Lambda 2 捕获 self [count +1]
  Lambda 1 结束 [count -1]
       │
       ▼ （async_write 完成）
  Lambda 2 执行 → doRead() → Lambda 3 捕获 self [count +1]
  Lambda 2 结束 [count -1]
       │
       ▼
  ... 循环 ...
       │
       ▼ （连接断开 / 错误发生）
  Lambda N 执行，ec 有错误，不再发起新的异步操作
  Lambda N 结束 [count -1]
  没有任何 Lambda 持有 self 了
  count = 0 → Session 自动释放 💀

  像接力赛一样：每个 Lambda 持有一棒（shared_ptr）
  传给下一个 Lambda 之后自己放手
  最后一棒的人放手 → 对象自动释放
```

### 5.3 为什么同时捕获 this 和 self？

```cpp
[this, self](auto ec, auto len) {
    // this 和 self 指向同一个对象
    // 用 this 是为了方便写 doRead()、buffer_ 等成员访问
    // 用 self 是为了续命（引用计数 +1）

    // 如果只捕获 self：
    // [self](auto ec, auto len) {
    //     self->doRead();    // 每次都要写 self->
    //     self->buffer_;     // 比较啰嗦
    // }

    // 如果只捕获 this：
    // [this](auto ec, auto len) {
    //     doRead();          // 方便！
    //     // 但 this 是原始指针，不管理生命周期
    //     // 回调执行时对象可能已经销毁了 💥
    // }

    // 两个一起捕获是最佳实践：
    // this → 方便访问成员
    // self → 续命保证安全
};
```

------

## 六、线程安全：shared_ptr 本身安全 ≠ 对象安全

### 6.1 shared_ptr 的线程安全保证

```
shared_ptr 保证的（线程安全的）：
  ✅ 引用计数的增减是原子操作
  ✅ 多个线程可以同时拷贝/销毁不同的 shared_ptr（指向同一对象）
  ✅ 对象只会被 delete 一次

shared_ptr 不保证的（需要你自己处理）：
  ❌ 多个线程同时修改同一个 shared_ptr 变量
  ❌ 多个线程同时访问对象的成员（对象本身的线程安全）
```

### 6.2 案例分析

```cpp
auto p = std::make_shared<Widget>();

// ✅ 安全：不同线程操作不同的 shared_ptr 变量
// （虽然它们指向同一个对象）
std::thread t1([p]() { p->read(); });   // p 的拷贝
std::thread t2([p]() { p->read(); });   // p 的另一个拷贝
// 两个线程各持有自己的 shared_ptr 拷贝
// 引用计数安全地从 1 → 3 → 最后变回 0

// ❌ 不安全：多个线程修改同一个 shared_ptr 变量
std::shared_ptr<Widget> global_ptr = std::make_shared<Widget>();
std::thread t1([&]() { global_ptr = std::make_shared<Widget>(); });  // 修改
std::thread t2([&]() { global_ptr = std::make_shared<Widget>(); });  // 修改
// 两个线程同时修改 global_ptr 本身 → 数据竞争！💥

// ✅ 修复：用锁保护，或用 atomic<shared_ptr>（C++20）
std::mutex mtx;
std::thread t1([&]() {
    std::lock_guard lock(mtx);
    global_ptr = std::make_shared<Widget>();
});

// C++20：
std::atomic<std::shared_ptr<Widget>> atomic_ptr;
atomic_ptr.store(std::make_shared<Widget>());
```

### 6.3 对象成员的线程安全要自己保证

```cpp
class Counter : public std::enable_shared_from_this<Counter> {
    int count_ = 0;           // ❌ 不安全：多线程同时修改
    std::mutex mtx_;          // 加锁保护

public:
    void increment() {
        std::lock_guard lock(mtx_);
        count_++;             // ✅ 加锁后安全
    }

    void startWorkers() {
        for (int i = 0; i < 10; i++) {
            auto self = shared_from_this();
            std::thread([self]() {
                for (int j = 0; j < 1000; j++) {
                    self->increment();  // 对象还活着（self 续命）
                                        // 成员访问线程安全（有锁保护）
                }
            }).detach();
        }
    }
};

// 总结：
// shared_ptr 解决的是 → 对象什么时候释放（生命周期）
// mutex 解决的是     → 对象怎么安全访问（数据竞争）
// 两者解决不同的问题，经常要一起用
```

------

## 七、常见的错误模式和修复

### 7.1 错误 1：循环引用导致内存泄漏

```cpp
class Parent;
class Child;

class Parent {
public:
    std::shared_ptr<Child> child;
    ~Parent() { std::cout << "Parent destroyed" << std::endl; }
};

class Child {
public:
    std::shared_ptr<Parent> parent;  // ❌ 循环引用！
    ~Child() { std::cout << "Child destroyed" << std::endl; }
};

int main() {
    auto p = std::make_shared<Parent>();
    auto c = std::make_shared<Child>();
    p->child = c;
    c->parent = p;
}
// main 结束，p 和 c 销毁
// 但 Parent 被 Child 的 shared_ptr 引用 → 引用计数 = 1
// Child 被 Parent 的 shared_ptr 引用 → 引用计数 = 1
// 谁都到不了 0 → 谁都不会被释放 → 内存泄漏！
// 析构函数永远不会被调用
```

```
  p ──→ Parent ──child──→ Child ←── c
            ↑                │
            └───parent───────┘
         循环引用！引用计数永远不为 0
```

```cpp
// ✅ 修复：用 weak_ptr 打破循环
class Child {
public:
    std::weak_ptr<Parent> parent;  // 弱引用，不增加引用计数
    ~Child() { std::cout << "Child destroyed" << std::endl; }
};

// 使用 weak_ptr 时需要先 lock()
if (auto p = child->parent.lock()) {  // 尝试获取 shared_ptr
    p->doSomething();                  // 成功了才能用
} else {
    // Parent 已经销毁了
}
```

### 7.2 错误 2：Lambda 捕获 this 但对象已死

```cpp
class Button {
    std::string label_ = "Click Me";

public:
    std::function<void()> getClickHandler() {
        // ❌ 捕获 this（原始指针）
        return [this]() {
            std::cout << label_ << std::endl;  // this 可能已经失效
        };
    }
};

auto handler = btn->getClickHandler();
delete btn;       // 对象销毁了
handler();        // 💥 访问已销毁对象
```

```cpp
// ✅ 修复方案 1：捕获 shared_ptr
class Button : public std::enable_shared_from_this<Button> {
public:
    std::function<void()> getClickHandler() {
        auto self = shared_from_this();
        return [self]() {
            std::cout << self->label_ << std::endl;  // 安全
        };
    }
};

// ✅ 修复方案 2：捕获 weak_ptr（如果不需要续命）
class Button : public std::enable_shared_from_this<Button> {
public:
    std::function<void()> getClickHandler() {
        std::weak_ptr<Button> weak = shared_from_this();
        return [weak]() {
            if (auto self = weak.lock()) {    // 尝试获取
                std::cout << self->label_ << std::endl;
            } else {
                std::cout << "Button already gone" << std::endl;
            }
        };
    }
};
```

### 7.3 什么时候用 shared_ptr vs weak_ptr 捕获？

```
用 shared_ptr 捕获 [self = shared_from_this()]：
  → 回调执行时对象必须还活着
  → 回调"续命"了对象
  → 适合：异步 IO 回调、必须执行的定时器

用 weak_ptr 捕获 [weak = weak_from_this()]：
  → 回调执行时对象可能已经不存在了，这没关系
  → 回调不影响对象生命周期
  → 适合：UI 事件回调、可选的通知、观察者模式
```

### 7.4 错误 3：多次 shared_from_this 导致多余拷贝

```cpp
void Session::doRead() {
    auto self = shared_from_this();
    socket_.async_read_some(buffer_,
        [this, self](auto ec, auto len) {
            if (!ec) {
                doWrite(len);
                // doWrite 内部又会调用 shared_from_this()
                // 这没问题！每次只存在一个回调链上的 self
            }
        });
}

// 注意：不要在一个函数里反复创建 shared_ptr
void bad() {
    auto self1 = shared_from_this();  // +1
    auto self2 = shared_from_this();  // +1（没有额外创建控制块，安全）
    auto self3 = shared_from_this();  // +1
    // 三个 shared_ptr，引用计数 = 原来 +3
    // 虽然安全但没有意义，一个就够了
}
```

### 7.5 错误 4：将 this 传给 shared_ptr 构造函数

```cpp
class Widget {
public:
    std::shared_ptr<Widget> getPtr() {
        // ❌ 创建了一个新的控制块！
        return std::shared_ptr<Widget>(this);
    }
};

auto w = std::make_shared<Widget>();  // 控制块 A
auto p = w->getPtr();                 // 控制块 B（新的！）
// 现在有两个控制块管理同一个对象
// w 销毁 → 控制块 A 计数=0 → delete 对象
// p 销毁 → 控制块 B 计数=0 → 再次 delete 同一个对象 💥 双重释放！

// ✅ 正确做法：用 shared_from_this()
class Widget : public std::enable_shared_from_this<Widget> {
public:
    std::shared_ptr<Widget> getPtr() {
        return shared_from_this();  // 复用已有的控制块
    }
};
```

------

## 八、完整的实战案例：一个异步 TCP 服务器

把所有知识点整合到一个完整的例子中：

```cpp
#include <boost/asio.hpp>
#include <iostream>
#include <memory>
using boost::asio::ip::tcp;

// ========== Session：管理一个客户端连接 ==========
class Session : public std::enable_shared_from_this<Session> {
    tcp::socket socket_;
    char data_[1024];
    std::string name_;

public:
    Session(tcp::socket socket, int id)
        : socket_(std::move(socket))
        , name_("Session-" + std::to_string(id)) {
        std::cout << name_ << " created" << std::endl;
    }

    ~Session() {
        std::cout << name_ << " destroyed" << std::endl;
        // 当没有任何 shared_ptr 指向这个 Session 时
        // 析构函数自动调用，连接自动关闭
    }

    void start() {
        std::cout << name_ << " started" << std::endl;
        doRead();
    }

private:
    void doRead() {
        // ★ 关键：捕获 self，让 Session 活到回调执行
        auto self = shared_from_this();

        socket_.async_read_some(
            boost::asio::buffer(data_),
            [this, self](boost::system::error_code ec, size_t length) {
                if (!ec) {
                    std::cout << name_ << " received " << length << " bytes" << std::endl;
                    doWrite(length);
                } else {
                    // 错误或连接断开
                    // 不再发起新的异步操作
                    // self 在 Lambda 结束后销毁
                    // 如果没有其他地方持有 shared_ptr → Session 自动释放
                    std::cout << name_ << " disconnected: " << ec.message() << std::endl;
                }
            });
    }

    void doWrite(size_t length) {
        auto self = shared_from_this();

        boost::asio::async_write(
            socket_,
            boost::asio::buffer(data_, length),
            [this, self](boost::system::error_code ec, size_t) {
                if (!ec) {
                    doRead();  // 继续下一轮读取
                }
            });
    }
};

// ========== Server：监听新连接 ==========
class Server {
    tcp::acceptor acceptor_;
    int nextId_ = 0;

public:
    Server(boost::asio::io_context& io, short port)
        : acceptor_(io, tcp::endpoint(tcp::v4(), port)) {
        doAccept();
    }

private:
    void doAccept() {
        acceptor_.async_accept(
            [this](boost::system::error_code ec, tcp::socket socket) {
                if (!ec) {
                    // 创建 Session（shared_ptr 管理）
                    auto session = std::make_shared<Session>(
                        std::move(socket), nextId_++);

                    session->start();

                    // session（局部变量）在这里销毁
                    // 但 start() 中的 Lambda 已经捕获了 self
                    // 所以 Session 不会被释放
                }
                doAccept();  // 继续等下一个连接
            });
    }
};

int main() {
    boost::asio::io_context io;
    Server server(io, 8080);
    io.run();
}
```

```
连接生命周期跟踪：

客户端连接：
  Session-0 created        → make_shared [count=1]
  Session-0 started        → doRead Lambda 捕获 self [count=2]
  (局部 session 销毁)       → [count=1]，但 Lambda 持有
  Session-0 received 5 bytes → doWrite Lambda 捕获 self [count=2]
  (doRead Lambda 结束)      → [count=1]
  Session-0 received 3 bytes → doRead Lambda 又捕获 self [count=2]
  (doWrite Lambda 结束)     → [count=1]
  ...

客户端断开：
  Session-0 disconnected   → 不再发起新异步操作
  Lambda 结束               → [count=0]
  Session-0 destroyed       → 自动释放！✅

  从创建到销毁，没有任何手动 delete
  对象在不再需要时自动释放
```

------

## 九、决策流程图

```
我要在 Lambda/回调/异步操作中使用一个对象的成员，怎么办？

                         ┌──────────────┐
                         │ 对象怎么创建的？│
                         └──────┬───────┘
                                │
                    ┌───────────┼───────────┐
                    ▼                       ▼
              栈上/局部变量              shared_ptr 管理
              (或 unique_ptr)
                    │                       │
                    ▼                       ▼
          回调会在对象          继承 enable_shared_from_this
          生命周期内执行吗？          │
                    │                ├── 回调必须执行 → 捕获 shared_ptr
           ┌───────┤                │   [self = shared_from_this()]
           ▼       ▼                │
          是       否               └── 回调可以跳过 → 捕获 weak_ptr
           │       │                    [weak = weak_from_this()]
           ▼       ▼                    if (auto self = weak.lock()) { ... }
       捕获引用  不安全！
       [&obj]   必须改用
                shared_ptr
```

------

## 十、要点总结

```
核心概念                        一句话

shared_ptr                     引用计数，最后一个销毁时释放对象
enable_shared_from_this        让对象内部能获取指向自己的 shared_ptr
shared_from_this()             返回 shared_ptr，引用计数 +1，延长对象寿命
weak_ptr                       不增加引用计数的"观察者"
Lambda 捕获 self               保证回调执行时对象还活着（续命）
Lambda 捕获 weak               不影响生命周期，使用前检查是否还活着

安全规则：
  1. 对象必须用 make_shared 创建
  2. 不在构造函数中调用 shared_from_this
  3. 异步回调捕获 self = shared_from_this()
  4. 同时捕获 this 和 self（方便 + 安全）
  5. 用 weak_ptr 打破循环引用
  6. shared_ptr 的引用计数线程安全，但对象本身不一定
  7. 别用 shared_ptr<T>(this)，用 shared_from_this()
```

------

> 本文的所有案例都可以直接编译运行（需要 Boost.Asio 的部分需要安装 Boost）。建议从最简单的例子开始动手实验，观察构造和析构的输出，建立对生命周期的直觉。配合 [现代 C++ 面试题](/techlearn/posts/modern-cpp-interview/) Q1-Q5 和 [C++ 网络库指南](/techlearn/posts/cpp-network-libraries/) 一起学习效果更好。
