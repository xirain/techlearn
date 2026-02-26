---
title: 设计模式面试题 —— 从创建型到行为型的深度问答与 C++ 实现
description: 覆盖单例、工厂、抽象工厂、建造者、原型、适配器、装饰器、代理、观察者、策略、模板方法、命令模式等经典设计模式，25 道高频面试题附 C++ 代码
date: 2026-02-26
categories: [设计模式]
tags: [设计模式, C++, 面试, 单例, 工厂, 观察者, 策略, 装饰器, 代理, SOLID]
---

设计模式是面向对象设计的"武功秘籍"——23 种经典模式（GoF）本质上是对"封装变化"的不同解法。面试中设计模式出现频率中等偏高，尤其在 C++ 岗位，考官喜欢让你手写单例、工厂、观察者。

这篇文章的组织思路：**每道题先给出"一句话记忆点"，再讲核心思想，最后给出可编译的 C++ 实现**。重点放在面试最常考的模式上。

------

## 前置知识：SOLID 原则

### Q1：SOLID 原则是什么？为什么重要？

**记忆点：SOLID 是面向对象设计的五大原则——单一职责、开闭原则、里氏替换、接口隔离、依赖倒置。设计模式就是 SOLID 原则的具体应用。**

| 原则 | 全称 | 一句话 |
|------|------|--------|
| **S** | Single Responsibility | 一个类只做一件事 |
| **O** | Open/Closed | 对扩展开放，对修改关闭 |
| **L** | Liskov Substitution | 子类能替代父类且行为不变 |
| **I** | Interface Segregation | 接口要小而专，不强迫实现不需要的方法 |
| **D** | Dependency Inversion | 高层不依赖低层，都依赖抽象 |

**面试高频追问：** "举例说明违反了哪条 SOLID 原则？" → 一个类既读文件又解析又写数据库（违反 S）；通过修改 if-else 来加新逻辑（违反 O）；vector 能替代 list 但行为一致（L）。

------

## 第一部分：创建型模式

### Q2：单例模式怎么实现？有哪些写法？

**记忆点：确保一个类全局只有一个实例。C++ 最推荐"Meyers 单例"（局部静态变量），C++11 保证线程安全。**

**Meyers 单例（推荐）：**

```cpp
class Singleton {
public:
    static Singleton& getInstance() {
        static Singleton instance;  // C++11 保证线程安全
        return instance;
    }

    void doSomething() { /* ... */ }

    // 禁止拷贝和赋值
    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;

private:
    Singleton() = default;  // 构造函数私有
    ~Singleton() = default;
};

// 使用
Singleton::getInstance().doSomething();
```

**为什么 Meyers 单例在 C++11 后是线程安全的？**
C++11 标准规定：如果多个线程同时进入一个函数中局部 static 变量的初始化，只有一个线程会执行初始化，其他线程会等待完成。编译器会插入必要的同步原语。

**面试追问：饿汉式 vs 懒汉式？**

| 方式 | 初始化时机 | 线程安全 | 特点 |
|------|-----------|---------|------|
| 饿汉式 | 程序启动时（全局变量） | 天然安全 | 不用不创建的优势没有了 |
| 懒汉式 | 第一次调用时 | 需要保证 | Meyers 单例就是线程安全的懒汉式 |

**面试追问：双重检查锁（DCLP）写法？**

```cpp
class Singleton {
public:
    static Singleton* getInstance() {
        if (instance_ == nullptr) {                    // 第一次检查（无锁，快速路径）
            std::lock_guard<std::mutex> lock(mutex_);
            if (instance_ == nullptr) {                // 第二次检查（持锁，安全）
                instance_ = new Singleton();
            }
        }
        return instance_;
    }
private:
    static std::atomic<Singleton*> instance_;
    static std::mutex mutex_;
    Singleton() = default;
};
```

> 注意：C++11 之前 DCLP 有内存序问题（指令重排导致拿到未构造完成的对象），必须用 `std::atomic` 或内存屏障。**现代 C++ 直接用 Meyers 单例，不要手写 DCLP。**

### Q3：工厂方法模式是什么？和简单工厂有什么区别？

**记忆点：简单工厂用 if-else/switch 创建对象（违反开闭原则），工厂方法把创建逻辑交给子类（每种产品一个工厂类）。工厂方法 = "定义创建接口，让子类决定实例化哪个类"。**

```cpp
// ============ 产品抽象 ============
class Logger {
public:
    virtual void log(const std::string& msg) = 0;
    virtual ~Logger() = default;
};

class FileLogger : public Logger {
public:
    void log(const std::string& msg) override {
        std::cout << "[File] " << msg << "\n";
    }
};

class ConsoleLogger : public Logger {
public:
    void log(const std::string& msg) override {
        std::cout << "[Console] " << msg << "\n";
    }
};

// ============ 工厂抽象 ============
class LoggerFactory {
public:
    virtual std::unique_ptr<Logger> createLogger() = 0;
    virtual ~LoggerFactory() = default;
};

class FileLoggerFactory : public LoggerFactory {
public:
    std::unique_ptr<Logger> createLogger() override {
        return std::make_unique<FileLogger>();
    }
};

class ConsoleLoggerFactory : public LoggerFactory {
public:
    std::unique_ptr<Logger> createLogger() override {
        return std::make_unique<ConsoleLogger>();
    }
};

// 使用：新增日志类型只需加一对产品+工厂类，不修改已有代码 → 符合开闭原则
void doWork(LoggerFactory& factory) {
    auto logger = factory.createLogger();
    logger->log("Hello Design Pattern");
}
```

### Q4：抽象工厂模式适用什么场景？

**记忆点：抽象工厂 = "产品族"的工厂。当你需要创建一系列相关对象（同一主题/平台的按钮、文本框、菜单），用抽象工厂保证风格一致。**

```cpp
// 产品族：Button + TextBox
class Button {
public:
    virtual void render() = 0;
    virtual ~Button() = default;
};
class TextBox {
public:
    virtual void render() = 0;
    virtual ~TextBox() = default;
};

// Windows 风格产品族
class WinButton : public Button {
public:
    void render() override { std::cout << "Windows Button\n"; }
};
class WinTextBox : public TextBox {
public:
    void render() override { std::cout << "Windows TextBox\n"; }
};

// Mac 风格产品族
class MacButton : public Button {
public:
    void render() override { std::cout << "Mac Button\n"; }
};
class MacTextBox : public TextBox {
public:
    void render() override { std::cout << "Mac TextBox\n"; }
};

// 抽象工厂
class UIFactory {
public:
    virtual std::unique_ptr<Button> createButton() = 0;
    virtual std::unique_ptr<TextBox> createTextBox() = 0;
    virtual ~UIFactory() = default;
};

class WinFactory : public UIFactory {
public:
    std::unique_ptr<Button> createButton() override { return std::make_unique<WinButton>(); }
    std::unique_ptr<TextBox> createTextBox() override { return std::make_unique<WinTextBox>(); }
};

class MacFactory : public UIFactory {
public:
    std::unique_ptr<Button> createButton() override { return std::make_unique<MacButton>(); }
    std::unique_ptr<TextBox> createTextBox() override { return std::make_unique<MacTextBox>(); }
};
```

**简单工厂 vs 工厂方法 vs 抽象工厂：**

| 模式 | 产品数量 | 扩展方式 |
|------|---------|---------|
| 简单工厂 | 一种产品，多个变体 | 修改 if-else（违反 OCP） |
| 工厂方法 | 一种产品，多个变体 | 新增工厂子类（符合 OCP） |
| 抽象工厂 | 多种产品组成"产品族" | 新增工厂子类（整族切换） |

### Q5：建造者模式（Builder）解决什么问题？

**记忆点：构造函数参数太多时，用 Builder 链式调用来分步构造对象。"将复杂对象的构建与表示分离"。**

```cpp
class HttpRequest {
public:
    class Builder {
    public:
        Builder& setUrl(const std::string& url) { url_ = url; return *this; }
        Builder& setMethod(const std::string& method) { method_ = method; return *this; }
        Builder& addHeader(const std::string& key, const std::string& val) {
            headers_[key] = val;
            return *this;
        }
        Builder& setBody(const std::string& body) { body_ = body; return *this; }
        HttpRequest build() { return HttpRequest(*this); }
    private:
        friend class HttpRequest;
        std::string url_, method_ = "GET", body_;
        std::map<std::string, std::string> headers_;
    };

    void send() {
        std::cout << method_ << " " << url_ << "\n";
    }

private:
    explicit HttpRequest(const Builder& b)
        : url_(b.url_), method_(b.method_), headers_(b.headers_), body_(b.body_) {}
    std::string url_, method_, body_;
    std::map<std::string, std::string> headers_;
};

// 使用
auto req = HttpRequest::Builder()
    .setUrl("https://api.example.com/data")
    .setMethod("POST")
    .addHeader("Content-Type", "application/json")
    .setBody(R"({"key": "value"})")
    .build();
req.send();
```

------

## 第二部分：结构型模式

### Q6：适配器模式解决什么问题？

**记忆点：把一个类的接口转换成客户端期望的另一个接口。"电源适配器"——不改旧代码，包一层让它能在新接口下工作。**

```cpp
// 旧的第三方 JSON 解析库（接口不符合我们的要求）
class OldJsonParser {
public:
    std::string parseFromFile(const std::string& filename) {
        return "parsed data from " + filename;
    }
};

// 我们期望的接口
class DataParser {
public:
    virtual std::string parse(const std::string& input) = 0;
    virtual ~DataParser() = default;
};

// 适配器：让 OldJsonParser 适配 DataParser 接口
class JsonParserAdapter : public DataParser {
public:
    std::string parse(const std::string& input) override {
        return parser_.parseFromFile(input);  // 委托给旧实现
    }
private:
    OldJsonParser parser_;  // 组合（对象适配器）
};
```

**类适配器 vs 对象适配器：** 类适配器用多重继承（C++ 支持），对象适配器用组合（更灵活，推荐）。

### Q7：装饰器模式是什么？和继承有什么区别？

**记忆点：装饰器在不修改原类的情况下，动态给对象添加功能。和继承的区别——继承是静态的编译时确定，装饰器是运行时叠加，可以任意组合。"给咖啡加奶、加糖、加奶油"。**

```cpp
// 组件接口
class Stream {
public:
    virtual void write(const std::string& data) = 0;
    virtual ~Stream() = default;
};

// 具体组件
class FileStream : public Stream {
public:
    void write(const std::string& data) override {
        std::cout << "Write to file: " << data << "\n";
    }
};

// 装饰器基类
class StreamDecorator : public Stream {
public:
    explicit StreamDecorator(std::unique_ptr<Stream> stream) : stream_(std::move(stream)) {}
    void write(const std::string& data) override { stream_->write(data); }
protected:
    std::unique_ptr<Stream> stream_;
};

// 加密装饰器
class EncryptedStream : public StreamDecorator {
public:
    using StreamDecorator::StreamDecorator;
    void write(const std::string& data) override {
        std::string encrypted = "ENC(" + data + ")";  // 模拟加密
        StreamDecorator::write(encrypted);
    }
};

// 压缩装饰器
class CompressedStream : public StreamDecorator {
public:
    using StreamDecorator::StreamDecorator;
    void write(const std::string& data) override {
        std::string compressed = "ZIP(" + data + ")";  // 模拟压缩
        StreamDecorator::write(compressed);
    }
};

// 使用：任意组合装饰器
auto stream = std::make_unique<CompressedStream>(
    std::make_unique<EncryptedStream>(
        std::make_unique<FileStream>()
    )
);
stream->write("hello");  // 输出: Write to file: ZIP(ENC(hello))
```

### Q8：代理模式有哪些类型？

**记忆点：代理 = 给目标对象一个替身，控制对它的访问。常见类型：远程代理（跨网络）、虚拟代理（延迟加载）、保护代理（权限控制）、缓存代理。**

```cpp
// 虚拟代理：延迟加载大图片
class Image {
public:
    virtual void display() = 0;
    virtual ~Image() = default;
};

class RealImage : public Image {
public:
    explicit RealImage(const std::string& file) : filename_(file) {
        loadFromDisk();  // 耗时操作
    }
    void display() override {
        std::cout << "Displaying " << filename_ << "\n";
    }
private:
    void loadFromDisk() {
        std::cout << "Loading " << filename_ << " from disk...\n";
    }
    std::string filename_;
};

class ProxyImage : public Image {
public:
    explicit ProxyImage(const std::string& file) : filename_(file) {}
    void display() override {
        if (!realImage_) {
            realImage_ = std::make_unique<RealImage>(filename_);  // 延迟加载
        }
        realImage_->display();
    }
private:
    std::string filename_;
    std::unique_ptr<RealImage> realImage_;
};
```

**装饰器 vs 代理的区别：**
- 装饰器：**增强**功能（加密、压缩），客户端知道在装饰
- 代理：**控制访问**（延迟加载、权限），客户端不知道用的是代理

### Q9：外观模式（Facade）是什么？

**记忆点：为复杂子系统提供一个简化的统一接口。"遥控器"——你不需要知道电视内部怎么工作，按一个键就行。**

```cpp
class Compiler {
public:
    void compile(const std::string& src) {
        Lexer lexer;
        auto tokens = lexer.tokenize(src);

        Parser parser;
        auto ast = parser.parse(tokens);

        CodeGen codegen;
        codegen.generate(ast);
    }
    // Facade 把 Lexer + Parser + CodeGen 三个子系统封装成一个 compile() 调用
};
```

外观模式不限制直接访问子系统，只是提供便利入口。它体现了"最少知识原则"（迪米特法则）。

------

## 第三部分：行为型模式

### Q10：观察者模式怎么实现？

**记忆点：一对多依赖关系——当"主题"状态变化时，所有"观察者"自动收到通知。事件系统、发布-订阅的基础。**

```cpp
#include <vector>
#include <algorithm>
#include <functional>

class EventEmitter {
public:
    using Callback = std::function<void(const std::string&)>;

    void on(const std::string& event, Callback cb) {
        listeners_[event].push_back(std::move(cb));
    }

    void emit(const std::string& event, const std::string& data) {
        if (listeners_.count(event)) {
            for (auto& cb : listeners_[event]) {
                cb(data);
            }
        }
    }

private:
    std::unordered_map<std::string, std::vector<Callback>> listeners_;
};

// 使用
EventEmitter emitter;
emitter.on("price_change", [](const std::string& data) {
    std::cout << "Display update: " << data << "\n";
});
emitter.on("price_change", [](const std::string& data) {
    std::cout << "Log: " << data << "\n";
});
emitter.emit("price_change", "AAPL: $150");
```

**经典的接口实现方式：**

```cpp
class Observer {
public:
    virtual void update(const std::string& msg) = 0;
    virtual ~Observer() = default;
};

class Subject {
public:
    void attach(std::shared_ptr<Observer> obs) { observers_.push_back(obs); }
    void detach(std::shared_ptr<Observer> obs) {
        observers_.erase(
            std::remove(observers_.begin(), observers_.end(), obs),
            observers_.end()
        );
    }
    void notify(const std::string& msg) {
        for (auto& obs : observers_) {
            obs->update(msg);
        }
    }
private:
    std::vector<std::shared_ptr<Observer>> observers_;
};
```

### Q11：策略模式是什么？怎么消除 if-else？

**记忆点：把一组算法封装成独立的类，让它们可以互相替换。用策略模式替代大段 if-else/switch，符合开闭原则。**

```cpp
// 策略接口
class SortStrategy {
public:
    virtual void sort(std::vector<int>& data) = 0;
    virtual ~SortStrategy() = default;
};

class BubbleSort : public SortStrategy {
public:
    void sort(std::vector<int>& data) override {
        // 冒泡排序实现
        for (size_t i = 0; i < data.size(); i++)
            for (size_t j = 0; j + 1 < data.size() - i; j++)
                if (data[j] > data[j + 1])
                    std::swap(data[j], data[j + 1]);
        std::cout << "BubbleSort used\n";
    }
};

class QuickSort : public SortStrategy {
public:
    void sort(std::vector<int>& data) override {
        std::sort(data.begin(), data.end());  // 简化实现
        std::cout << "QuickSort used\n";
    }
};

// 上下文：根据策略执行不同算法
class Sorter {
public:
    void setStrategy(std::unique_ptr<SortStrategy> strategy) {
        strategy_ = std::move(strategy);
    }
    void sort(std::vector<int>& data) {
        strategy_->sort(data);
    }
private:
    std::unique_ptr<SortStrategy> strategy_;
};

// 使用
Sorter sorter;
sorter.setStrategy(std::make_unique<QuickSort>());
std::vector<int> data = {5, 3, 1, 4, 2};
sorter.sort(data);  // 运行时切换策略
```

**面试加分：** C++ 中可以用 `std::function` + lambda 代替策略接口类，更轻量：

```cpp
class Sorter {
public:
    using Strategy = std::function<void(std::vector<int>&)>;
    void setStrategy(Strategy s) { strategy_ = std::move(s); }
    void sort(std::vector<int>& data) { strategy_(data); }
private:
    Strategy strategy_;
};

// lambda 做策略
sorter.setStrategy([](std::vector<int>& data) {
    std::sort(data.begin(), data.end());
});
```

### Q12：模板方法模式是什么？

**记忆点：在基类中定义算法的骨架（步骤顺序），具体步骤交给子类实现。"做菜的流程固定——买菜、洗菜、炒菜、装盘，但每道菜的具体做法不同"。**

```cpp
class DataMiner {
public:
    // 模板方法：定义算法骨架，final 防止子类覆盖流程
    void mine(const std::string& path) final {
        auto raw = extractData(path);       // 步骤1
        auto parsed = parseData(raw);       // 步骤2
        auto result = analyzeData(parsed);  // 步骤3
        generateReport(result);             // 步骤4（可选的 hook）
    }
    virtual ~DataMiner() = default;

protected:
    virtual std::string extractData(const std::string& path) = 0;  // 子类必须实现
    virtual std::string parseData(const std::string& raw) = 0;     // 子类必须实现
    virtual std::string analyzeData(const std::string& data) {     // 有默认实现
        return "default analysis of " + data;
    }
    virtual void generateReport(const std::string& result) {       // hook，可覆盖
        std::cout << "Report: " << result << "\n";
    }
};

class CsvMiner : public DataMiner {
protected:
    std::string extractData(const std::string& path) override {
        return "csv raw data from " + path;
    }
    std::string parseData(const std::string& raw) override {
        return "parsed csv: " + raw;
    }
};
```

**策略模式 vs 模板方法：**
- 策略：用**组合**，算法整体替换，运行时切换
- 模板方法：用**继承**，算法骨架固定，子类实现某些步骤

### Q13：命令模式适合什么场景？

**记忆点：把"请求"封装成对象，支持撤销/重做、排队、日志记录。编辑器的 Undo/Redo、任务队列、宏命令都是命令模式。**

```cpp
class Command {
public:
    virtual void execute() = 0;
    virtual void undo() = 0;
    virtual ~Command() = default;
};

class TextEditor {
public:
    std::string content;
    void append(const std::string& text) { content += text; }
    void removeLast(size_t n) { content.erase(content.size() - n); }
};

class InsertCommand : public Command {
public:
    InsertCommand(TextEditor& editor, std::string text)
        : editor_(editor), text_(std::move(text)) {}

    void execute() override { editor_.append(text_); }
    void undo() override { editor_.removeLast(text_.size()); }

private:
    TextEditor& editor_;
    std::string text_;
};

// 命令管理器（支持 undo/redo）
class CommandManager {
public:
    void execute(std::unique_ptr<Command> cmd) {
        cmd->execute();
        undoStack_.push(std::move(cmd));
    }
    void undo() {
        if (!undoStack_.empty()) {
            undoStack_.top()->undo();
            undoStack_.pop();
        }
    }
private:
    std::stack<std::unique_ptr<Command>> undoStack_;
};
```

### Q14：责任链模式怎么用？

**记忆点：多个处理器串成链，请求沿链传递，每个处理器决定"处理"或"传给下一个"。中间件（Express/Koa）、审批流程、日志级别过滤都是责任链。**

```cpp
class Handler {
public:
    void setNext(std::shared_ptr<Handler> next) { next_ = std::move(next); }

    virtual bool handle(const std::string& request) {
        if (next_) return next_->handle(request);
        return false;  // 到链尾，无人处理
    }
    virtual ~Handler() = default;

protected:
    std::shared_ptr<Handler> next_;
};

class AuthHandler : public Handler {
public:
    bool handle(const std::string& request) override {
        if (request.find("token=") == std::string::npos) {
            std::cout << "Auth failed\n";
            return false;
        }
        std::cout << "Auth passed\n";
        return Handler::handle(request);  // 传给下一个
    }
};

class RateLimitHandler : public Handler {
public:
    bool handle(const std::string& request) override {
        std::cout << "Rate limit check passed\n";
        return Handler::handle(request);
    }
};

// 使用
auto auth = std::make_shared<AuthHandler>();
auto rateLimit = std::make_shared<RateLimitHandler>();
auth->setNext(rateLimit);
auth->handle("token=abc123&data=hello");
```

------

## 第四部分：综合面试题

### Q15：工厂模式和策略模式有什么区别？

**记忆点：工厂模式关注"创建什么对象"，策略模式关注"用什么算法"。工厂是创建型模式，策略是行为型模式。工厂解决的是对象创建的问题，策略解决的是算法选择的问题。**

```
工厂模式：我不知道创建哪个具体类 → 让工厂来决定
策略模式：我不知道用哪个算法 → 让策略来决定

实际中经常组合使用：
  工厂创建策略对象 → 上下文使用策略对象
```

### Q16：装饰器模式和代理模式有什么区别？

**记忆点：结构相似但意图不同。装饰器用于"增强"功能（可叠加多个），代理用于"控制访问"（通常只有一层）。**

| 维度 | 装饰器 | 代理 |
|------|--------|------|
| 目的 | 增强功能 | 控制访问 |
| 层数 | 可多层嵌套 | 通常一层 |
| 创建时机 | 客户端组合装饰器 | 代理内部创建目标对象 |
| 典型场景 | IO 流、中间件 | 懒加载、权限、缓存 |

### Q17：观察者模式和发布-订阅模式的区别？

**记忆点：观察者模式中主题直接通知观察者（紧耦合），发布-订阅模式通过"消息中心/事件总线"解耦（发布者和订阅者互不认识）。**

```
观察者模式：
  Subject ---notify--→ Observer1
                    --→ Observer2
  （Subject 直接持有 Observer 的引用）

发布-订阅模式：
  Publisher --→ Event Bus --→ Subscriber1
                          --→ Subscriber2
  （Publisher 和 Subscriber 通过 Event Bus 间接通信，互不知道对方存在）
```

### Q18：设计一个简单的线程池（综合运用多种模式）

**记忆点：线程池 = 命令模式（任务封装为对象）+ 生产者-消费者模式（任务队列）+ 单例模式（全局线程池）。**

```cpp
#include <thread>
#include <mutex>
#include <condition_variable>
#include <queue>
#include <functional>
#include <vector>

class ThreadPool {
public:
    explicit ThreadPool(size_t numThreads) : stop_(false) {
        for (size_t i = 0; i < numThreads; ++i) {
            workers_.emplace_back([this] {
                while (true) {
                    std::function<void()> task;
                    {
                        std::unique_lock<std::mutex> lock(mtx_);
                        cv_.wait(lock, [this] { return stop_ || !tasks_.empty(); });
                        if (stop_ && tasks_.empty()) return;
                        task = std::move(tasks_.front());
                        tasks_.pop();
                    }
                    task();
                }
            });
        }
    }

    void submit(std::function<void()> task) {
        {
            std::lock_guard<std::mutex> lock(mtx_);
            tasks_.push(std::move(task));
        }
        cv_.notify_one();
    }

    ~ThreadPool() {
        {
            std::lock_guard<std::mutex> lock(mtx_);
            stop_ = true;
        }
        cv_.notify_all();
        for (auto& w : workers_) {
            if (w.joinable()) w.join();
        }
    }

private:
    std::vector<std::thread> workers_;
    std::queue<std::function<void()>> tasks_;
    std::mutex mtx_;
    std::condition_variable cv_;
    bool stop_;
};
```

### Q19：实际项目中你用过哪些设计模式？

**记忆点：这是开放题，重点是结合实际经验。回答思路——"场景 + 模式 + 解决了什么问题"。**

常见回答参考：

| 场景 | 模式 | 说明 |
|------|------|------|
| 日志系统 | 单例 | 全局唯一的 Logger 实例 |
| 数据库驱动 | 工厂方法 | 根据配置创建 MySQL/PostgreSQL/SQLite 驱动 |
| IO 流加密/压缩 | 装饰器 | 灵活叠加功能，不改原始流 |
| 配置解析 | 策略 | JSON/YAML/TOML 不同格式用不同策略解析 |
| HTTP 中间件 | 责任链 | 认证→限流→日志→业务处理 |
| 编辑器 Undo | 命令 | 每个操作封装为命令对象，支持撤销 |
| 事件系统 | 观察者 | UI 事件监听、消息通知 |
| 游戏对象创建 | 原型 | clone() 复制已有对象而非从头构造 |

### Q20：什么时候不该用设计模式？

**记忆点：不要为了用模式而用模式。如果逻辑简单直接（只有 2-3 个 if-else），不需要扩展，硬套模式反而增加复杂度。"过度设计"比"没设计"更危险。**

**信号灯：**
- 只有一种实现且未来不太可能扩展 → 不需要工厂/策略
- 只有一两个观察者 → 直接回调比观察者模式更简单
- 类只被使用一次 → 不需要抽象接口
- "如果我引入这个模式，代码行数增加但可读性降低了" → 不该用

------

## 面试高频追问

### Q21：什么是依赖注入（DI）？和控制反转（IoC）什么关系？

**记忆点：IoC 是原则（"不要调用我们，我们调用你"），DI 是 IoC 的一种实现手段——通过构造函数/参数把依赖从外部传入，而不是在内部 new。**

```cpp
// 不用 DI（紧耦合）
class OrderService {
    MySQLRepository repo;  // 内部创建，依赖具体类
};

// 用 DI（松耦合）
class OrderService {
public:
    explicit OrderService(std::unique_ptr<Repository> repo)
        : repo_(std::move(repo)) {}  // 从外部注入，依赖抽象接口
private:
    std::unique_ptr<Repository> repo_;
};
```

### Q22：C++ 的 RAII 可以看作什么模式？

**记忆点：RAII（资源获取即初始化）可以看作一种简化的代理/装饰模式——用对象的生命周期管理资源。`std::lock_guard`、`std::unique_ptr` 都是 RAII。**

```cpp
// RAII 管理文件
class FileGuard {
public:
    explicit FileGuard(const std::string& path) : file_(fopen(path.c_str(), "r")) {}
    ~FileGuard() { if (file_) fclose(file_); }
    FILE* get() { return file_; }

    FileGuard(const FileGuard&) = delete;
    FileGuard& operator=(const FileGuard&) = delete;
private:
    FILE* file_;
};
```

### Q23：23 种 GoF 设计模式的分类速记？

```
创建型（5 种）—— 怎么创建对象：
  单例、工厂方法、抽象工厂、建造者、原型

结构型（7 种）—— 怎么组合类/对象：
  适配器、装饰器、代理、外观、桥接、组合、享元

行为型（11 种）—— 怎么分配职责和通信：
  策略、观察者、模板方法、命令、责任链、
  迭代器、中介者、备忘录、状态、访问者、解释器

面试重点（必须能手写）：
  单例、工厂方法、观察者、策略、装饰器、代理

面试常考（能讲清原理）：
  抽象工厂、建造者、适配器、模板方法、命令、责任链
```

### Q24：组合优于继承——怎么理解？

**记忆点：继承是"is-a"关系（强耦合、编译时确定），组合是"has-a"关系（松耦合、运行时灵活）。GoF 核心原则——"多用组合，少用继承"。**

继承的问题：
1. **脆弱基类**：修改基类可能破坏所有子类
2. **组合爆炸**：多维变化需要大量子类（飞鸟+会飞+红色 = FlyingRedBird？）
3. **单继承限制**：Java/C# 只支持单继承

组合的优势：
1. **灵活**：运行时替换组件
2. **独立变化**：各组件独立演化
3. **容易测试**：可以 mock 组件

```cpp
// 继承方式：组合爆炸
class FlyingRedBird : public Bird { ... };
class SwimmingBlueBird : public Bird { ... };
// 每种组合都要一个类...

// 组合方式：灵活组合
class Bird {
    std::unique_ptr<FlyBehavior> fly_;
    std::unique_ptr<ColorBehavior> color_;
};
// 运行时任意组合飞行方式和颜色
```

### Q25：面试中如何回答"设计一个 XXX"类问题？

**记忆点：不要上来就写代码。先问清需求 → 识别变化点 → 选择合适模式 → 画出类图 → 再写代码。**

**回答框架：**

1. **澄清需求**：这个系统需要支持哪些功能？有哪些扩展点？
2. **识别变化**：哪些部分是稳定的？哪些部分可能变化？
3. **选择模式**：
   - 创建对象的方式会变？→ 工厂/建造者
   - 算法/行为会变？→ 策略/模板方法
   - 需要通知多方？→ 观察者
   - 需要叠加功能？→ 装饰器
   - 需要控制访问？→ 代理
4. **画类图**：UML 或伪代码展示核心结构
5. **写关键代码**：不需要写完整实现，展示核心接口和关键逻辑
