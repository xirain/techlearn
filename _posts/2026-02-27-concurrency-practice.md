---
title: C++ 锁与并发编程练手代码 —— 7 个可编译运行的多线程实战
description: 覆盖mutex/unique_lock/shared_mutex/condition_variable线程安全队列、atomic无锁计数器/自旋锁、memory_order详解、简易线程池、promise-future异步、jthread与stop_token，每个练习约100行可直接编译运行
date: 2026-02-27
categories: [编程语言]
tags: [c++, 练手代码, 并发, 多线程, mutex, atomic, 线程池, 内存序, lock-free, condition_variable]
---

并发编程是 C++ 面试的**硬核考区**——能写出正确的线程安全队列、理解 memory_order 的含义、手撸简易线程池，直接证明你的系统编程能力。这 7 个练习覆盖从基础锁到无锁编程的核心场景。

> 📌 关联阅读：[锁与并发面试题](/techlearn/posts/lock-concurrency-memory-model-interview) · [高性能优化面试题](/techlearn/posts/high-performance-interview) · [现代 C++ 练手代码](/techlearn/posts/modern-cpp-practice)

------

## 练习1：线程安全队列 (mutex + condition_variable)

**考点**：`std::mutex`、`std::unique_lock`、`std::condition_variable`、生产者-消费者

```cpp
// thread_safe_queue.cpp
// g++ -std=c++17 -pthread -o thread_safe_queue thread_safe_queue.cpp
#include <iostream>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <thread>
#include <vector>
#include <optional>
#include <chrono>

template<typename T>
class ThreadSafeQueue {
    std::queue<T> queue_;
    mutable std::mutex mtx_;
    std::condition_variable cv_;
    bool closed_ = false;
public:
    void push(T val) {
        {
            std::lock_guard lock(mtx_);  // CTAD
            if (closed_) throw std::runtime_error("push to closed queue");
            queue_.push(std::move(val));
        }
        cv_.notify_one();  // 通知一个等待者
    }

    // 阻塞等待，队列关闭且空时返回 nullopt
    std::optional<T> pop() {
        std::unique_lock lock(mtx_);
        cv_.wait(lock, [this] { return !queue_.empty() || closed_; });
        if (queue_.empty()) return std::nullopt;  // 关闭且空
        T val = std::move(queue_.front());
        queue_.pop();
        return val;
    }

    // 非阻塞尝试
    std::optional<T> try_pop() {
        std::lock_guard lock(mtx_);
        if (queue_.empty()) return std::nullopt;
        T val = std::move(queue_.front());
        queue_.pop();
        return val;
    }

    void close() {
        {
            std::lock_guard lock(mtx_);
            closed_ = true;
        }
        cv_.notify_all();  // 唤醒所有等待者
    }

    size_t size() const {
        std::lock_guard lock(mtx_);
        return queue_.size();
    }
};

int main() {
    ThreadSafeQueue<int> q;
    constexpr int N = 20;

    // 生产者线程
    std::thread producer([&] {
        for (int i = 0; i < N; ++i) {
            q.push(i);
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
        q.close();
        std::cout << "[producer] done, queue closed\n";
    });

    // 多个消费者线程
    std::vector<std::thread> consumers;
    std::mutex print_mtx;
    for (int id = 0; id < 3; ++id) {
        consumers.emplace_back([&, id] {
            int count = 0;
            while (auto val = q.pop()) {
                std::lock_guard lock(print_mtx);
                std::cout << "[consumer " << id << "] got " << *val << "\n";
                ++count;
            }
            std::lock_guard lock(print_mtx);
            std::cout << "[consumer " << id << "] finished, processed " << count << "\n";
        });
    }

    producer.join();
    for (auto& t : consumers) t.join();
    std::cout << "All done!\n";
}
```

**关键点**：
- `lock_guard` 用于简单加锁/解锁，`unique_lock` 用于需要条件变量的场景
- `cv_.wait(lock, predicate)` 自动处理虚假唤醒（spurious wakeup）
- `close()` + `notify_all()` 通知所有消费者优雅退出
- 通知在锁外调用性能更好（减少无效唤醒）

---

## 练习2：读写锁与共享数据

**考点**：`std::shared_mutex`、读多写少场景优化

```cpp
// shared_mutex_cache.cpp
// g++ -std=c++17 -pthread -o shared_mutex_cache shared_mutex_cache.cpp
#include <iostream>
#include <shared_mutex>
#include <unordered_map>
#include <string>
#include <thread>
#include <vector>
#include <atomic>
#include <chrono>

// 线程安全的读多写少缓存
template<typename K, typename V>
class ConcurrentCache {
    mutable std::shared_mutex mtx_;
    std::unordered_map<K, V> data_;
    std::atomic<uint64_t> read_count_{0};
    std::atomic<uint64_t> write_count_{0};
public:
    // 读操作：共享锁（多个线程可以同时读）
    std::optional<V> get(const K& key) const {
        std::shared_lock lock(mtx_);  // 共享锁
        read_count_.fetch_add(1, std::memory_order_relaxed);
        auto it = data_.find(key);
        if (it != data_.end()) return it->second;
        return std::nullopt;
    }

    // 写操作：独占锁
    void put(const K& key, V value) {
        std::unique_lock lock(mtx_);  // 独占锁
        write_count_.fetch_add(1, std::memory_order_relaxed);
        data_[key] = std::move(value);
    }

    // 带回调的读（避免拷贝）
    template<typename Func>
    auto read_with(const K& key, Func func) const {
        std::shared_lock lock(mtx_);
        auto it = data_.find(key);
        if (it != data_.end()) return func(it->second);
        return func(V{});
    }

    size_t size() const {
        std::shared_lock lock(mtx_);
        return data_.size();
    }

    void print_stats() const {
        std::cout << "reads: " << read_count_.load()
                  << ", writes: " << write_count_.load() << "\n";
    }
};

int main() {
    ConcurrentCache<std::string, int> cache;

    // 预填充数据
    for (int i = 0; i < 100; ++i) {
        cache.put("key" + std::to_string(i), i);
    }

    std::vector<std::thread> threads;
    auto start = std::chrono::steady_clock::now();

    // 10个读线程，每个读10000次
    for (int i = 0; i < 10; ++i) {
        threads.emplace_back([&] {
            for (int j = 0; j < 10000; ++j) {
                auto val = cache.get("key" + std::to_string(j % 100));
            }
        });
    }

    // 2个写线程，每个写1000次
    for (int i = 0; i < 2; ++i) {
        threads.emplace_back([&, i] {
            for (int j = 0; j < 1000; ++j) {
                cache.put("key" + std::to_string(j), j + i * 1000);
            }
        });
    }

    for (auto& t : threads) t.join();

    auto elapsed = std::chrono::steady_clock::now() - start;
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(elapsed).count();

    std::cout << "Elapsed: " << ms << "ms\n";
    cache.print_stats();
    std::cout << "Cache size: " << cache.size() << "\n";
}
```

**关键点**：
- `shared_lock` 允许多线程同时读（共享模式）
- `unique_lock` 独占写（排他模式）
- 读多写少场景 `shared_mutex` 比 `mutex` 吞吐高数倍
- 注意：读写锁本身有开销，极短临界区用 `mutex` 可能更快

---

## 练习3：atomic 与无锁编程

**考点**：`std::atomic`、CAS 操作、自旋锁、无锁计数器

```cpp
// atomic_practice.cpp
// g++ -std=c++17 -pthread -o atomic_practice atomic_practice.cpp
#include <iostream>
#include <atomic>
#include <thread>
#include <vector>
#include <chrono>
#include <cassert>

// ============ 自旋锁 ============
class SpinLock {
    std::atomic_flag flag_ = ATOMIC_FLAG_INIT;
public:
    void lock() {
        while (flag_.test_and_set(std::memory_order_acquire)) {
            // 自旋等待（CPU 空转）
            // 可以加 yield/pause 减少 CPU 浪费
#if defined(__x86_64__) || defined(_M_X64)
            __builtin_ia32_pause();  // x86 PAUSE 指令
#endif
        }
    }
    void unlock() {
        flag_.clear(std::memory_order_release);
    }
};

// ============ 无锁栈（Treiber Stack）============
template<typename T>
class LockFreeStack {
    struct Node {
        T data;
        Node* next;
        Node(T d, Node* n) : data(std::move(d)), next(n) {}
    };
    std::atomic<Node*> head_{nullptr};
    std::atomic<size_t> size_{0};
public:
    void push(T val) {
        Node* new_node = new Node(std::move(val), nullptr);
        new_node->next = head_.load(std::memory_order_relaxed);
        // CAS：如果 head_ 还是 new_node->next，就替换为 new_node
        while (!head_.compare_exchange_weak(
            new_node->next, new_node,
            std::memory_order_release,
            std::memory_order_relaxed)) {
            // CAS 失败说明有竞争，new_node->next 已被更新为新的 head_
            // 自动重试
        }
        size_.fetch_add(1, std::memory_order_relaxed);
    }

    std::optional<T> pop() {
        Node* old_head = head_.load(std::memory_order_relaxed);
        while (old_head && !head_.compare_exchange_weak(
            old_head, old_head->next,
            std::memory_order_acquire,
            std::memory_order_relaxed)) {
            // 自动重试
        }
        if (!old_head) return std::nullopt;
        T val = std::move(old_head->data);
        size_.fetch_sub(1, std::memory_order_relaxed);
        delete old_head;  // 注意：实际项目需要安全回收（hazard pointer/epoch）
        return val;
    }

    size_t size() const { return size_.load(std::memory_order_relaxed); }

    ~LockFreeStack() {
        while (pop()) {}
    }
};

int main() {
    std::cout << "=== 1. atomic 基本操作 ===\n";
    {
        std::atomic<int> counter{0};
        constexpr int N = 100000;

        std::vector<std::thread> threads;
        for (int i = 0; i < 10; ++i) {
            threads.emplace_back([&] {
                for (int j = 0; j < N; ++j) {
                    counter.fetch_add(1, std::memory_order_relaxed);
                }
            });
        }
        for (auto& t : threads) t.join();
        std::cout << "  counter = " << counter.load() << " (expected "
                  << 10 * N << ")\n";
        assert(counter.load() == 10 * N);
    }

    std::cout << "\n=== 2. SpinLock ===\n";
    {
        SpinLock spin;
        int shared_data = 0;
        constexpr int N = 100000;

        std::vector<std::thread> threads;
        for (int i = 0; i < 4; ++i) {
            threads.emplace_back([&] {
                for (int j = 0; j < N; ++j) {
                    spin.lock();
                    ++shared_data;
                    spin.unlock();
                }
            });
        }
        for (auto& t : threads) t.join();
        std::cout << "  shared_data = " << shared_data
                  << " (expected " << 4 * N << ")\n";
        assert(shared_data == 4 * N);
    }

    std::cout << "\n=== 3. Lock-Free Stack (Treiber) ===\n";
    {
        LockFreeStack<int> stack;
        constexpr int N = 10000;

        // 多线程 push
        std::vector<std::thread> threads;
        for (int i = 0; i < 4; ++i) {
            threads.emplace_back([&, i] {
                for (int j = 0; j < N; ++j) {
                    stack.push(i * N + j);
                }
            });
        }
        for (auto& t : threads) t.join();
        std::cout << "  after push: size = " << stack.size() << "\n";
        assert(stack.size() == 4 * N);

        // 多线程 pop
        std::atomic<int> pop_count{0};
        threads.clear();
        for (int i = 0; i < 4; ++i) {
            threads.emplace_back([&] {
                while (stack.pop()) {
                    pop_count.fetch_add(1, std::memory_order_relaxed);
                }
            });
        }
        for (auto& t : threads) t.join();
        std::cout << "  popped: " << pop_count.load() << "\n";
        assert(stack.size() == 0);
    }

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- `compare_exchange_weak` 是 CAS 操作，可能虚假失败（需循环）
- 自旋锁适合极短临界区（几条指令），否则用 `mutex`
- Treiber Stack 是最简单的无锁数据结构
- 实际无锁编程需要处理 ABA 问题和安全内存回收

---

## 练习4：memory_order 详解

**考点**：六种内存序、acquire-release 语义、happens-before 关系

```cpp
// memory_order.cpp
// g++ -std=c++17 -pthread -O2 -o memory_order memory_order.cpp
#include <iostream>
#include <atomic>
#include <thread>
#include <cassert>

// ============ Acquire-Release 示例 ============
struct Message {
    int data = 0;
    bool ready = false;  // 非原子，依赖 atomic 保护
};

std::atomic<Message*> mailbox{nullptr};

void producer() {
    auto* msg = new Message;
    msg->data = 42;           // 普通写
    msg->ready = true;        // 普通写

    // release: 保证上面的写在 store 之前完成
    mailbox.store(msg, std::memory_order_release);
    //        ↑ 这个 store 之前的所有写对 acquire 端可见
}

void consumer() {
    Message* msg = nullptr;
    // acquire: 保证 load 之后的读能看到 release 端的所有写
    while (!(msg = mailbox.load(std::memory_order_acquire))) {
        std::this_thread::yield();
    }
    //        ↑ 这个 load 之后的所有读能看到 release 之前的写
    assert(msg->data == 42);
    assert(msg->ready == true);
    std::cout << "  data = " << msg->data
              << ", ready = " << msg->ready << "\n";
    delete msg;
}

// ============ Relaxed 做计数器（不需要顺序保证）============
std::atomic<uint64_t> counter{0};

void count_worker(int n) {
    for (int i = 0; i < n; ++i) {
        // relaxed: 只保证原子性，不保证顺序
        // 足够做计数器
        counter.fetch_add(1, std::memory_order_relaxed);
    }
}

// ============ seq_cst 全序（默认，最安全也最慢）============
std::atomic<bool> x_flag{false}, y_flag{false};
std::atomic<int> z_count{0};

void write_x() { x_flag.store(true, std::memory_order_seq_cst); }
void write_y() { y_flag.store(true, std::memory_order_seq_cst); }

void read_x_then_y() {
    while (!x_flag.load(std::memory_order_seq_cst)) {}
    if (y_flag.load(std::memory_order_seq_cst)) z_count.fetch_add(1);
}
void read_y_then_x() {
    while (!y_flag.load(std::memory_order_seq_cst)) {}
    if (x_flag.load(std::memory_order_seq_cst)) z_count.fetch_add(1);
}

int main() {
    std::cout << "=== 1. Acquire-Release 传递数据 ===\n";
    {
        std::thread t1(producer);
        std::thread t2(consumer);
        t1.join();
        t2.join();
    }

    std::cout << "\n=== 2. Relaxed 计数器 ===\n";
    {
        counter.store(0);
        constexpr int N = 100000;
        std::thread t1(count_worker, N);
        std::thread t2(count_worker, N);
        std::thread t3(count_worker, N);
        t1.join(); t2.join(); t3.join();
        std::cout << "  counter = " << counter.load()
                  << " (expected " << 3 * N << ")\n";
        assert(counter.load() == 3 * N);
    }

    std::cout << "\n=== 3. seq_cst 全序保证 ===\n";
    {
        // seq_cst 保证：x 和 y 的 store 有全局一致的顺序
        // 所以 z_count 至少为 1
        x_flag = false; y_flag = false; z_count = 0;
        std::thread t1(write_x);
        std::thread t2(write_y);
        std::thread t3(read_x_then_y);
        std::thread t4(read_y_then_x);
        t1.join(); t2.join(); t3.join(); t4.join();
        std::cout << "  z_count = " << z_count.load()
                  << " (should be >= 1 with seq_cst)\n";
        assert(z_count.load() >= 1);
    }

    std::cout << "\n=== Memory Order 总结 ===\n";
    std::cout << "  relaxed : 只保证原子性，用于计数器/统计\n";
    std::cout << "  acquire : load 后的读写不上移，用于读端\n";
    std::cout << "  release : store 前的读写不下移，用于写端\n";
    std::cout << "  acq_rel : 同时 acquire + release\n";
    std::cout << "  seq_cst : 全局全序（默认，最安全最慢）\n";

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- `acquire-release` 建立 happens-before 关系，是无锁编程的核心
- `relaxed` 只保证原子性，适合独立计数器
- `seq_cst` 是默认内存序，最安全但最慢（全局排序屏障）
- 优化建议：先用 `seq_cst` 写对，再根据性能需要放松

---

## 练习5：简易线程池

**考点**：`std::thread`、`std::function`、`std::future`/`std::packaged_task`

```cpp
// thread_pool.cpp
// g++ -std=c++17 -pthread -o thread_pool thread_pool.cpp
#include <iostream>
#include <thread>
#include <vector>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <functional>
#include <future>
#include <numeric>

class ThreadPool {
    std::vector<std::thread> workers_;
    std::queue<std::function<void()>> tasks_;
    std::mutex mtx_;
    std::condition_variable cv_;
    bool stop_ = false;
public:
    explicit ThreadPool(size_t n) {
        for (size_t i = 0; i < n; ++i) {
            workers_.emplace_back([this] {
                while (true) {
                    std::function<void()> task;
                    {
                        std::unique_lock lock(mtx_);
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

    // 提交任务，返回 future 获取结果
    template<typename F, typename... Args>
    auto submit(F&& f, Args&&... args) -> std::future<decltype(f(args...))> {
        using ReturnType = decltype(f(args...));
        auto task = std::make_shared<std::packaged_task<ReturnType()>>(
            std::bind(std::forward<F>(f), std::forward<Args>(args)...)
        );
        std::future<ReturnType> result = task->get_future();
        {
            std::lock_guard lock(mtx_);
            if (stop_) throw std::runtime_error("submit to stopped pool");
            tasks_.emplace([task]() { (*task)(); });
        }
        cv_.notify_one();
        return result;
    }

    ~ThreadPool() {
        {
            std::lock_guard lock(mtx_);
            stop_ = true;
        }
        cv_.notify_all();
        for (auto& w : workers_) w.join();
    }
};

// 模拟耗时计算
int heavy_compute(int n) {
    int sum = 0;
    for (int i = 1; i <= n; ++i) sum += i;
    return sum;
}

int main() {
    std::cout << "=== 线程池测试 ===\n";
    {
        ThreadPool pool(4);
        std::vector<std::future<int>> futures;

        // 提交 10 个任务
        for (int i = 1; i <= 10; ++i) {
            futures.push_back(pool.submit(heavy_compute, i * 10000));
        }

        // 收集结果
        for (size_t i = 0; i < futures.size(); ++i) {
            int result = futures[i].get();  // 阻塞等待结果
            std::cout << "  task " << i << ": " << result << "\n";
        }
    }  // 析构时自动等待所有线程

    std::cout << "\n=== 混合任务类型 ===\n";
    {
        ThreadPool pool(2);

        // 不同返回类型
        auto f1 = pool.submit([] { return 42; });
        auto f2 = pool.submit([] { return std::string("hello"); });
        auto f3 = pool.submit([] {
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
            return 3.14;
        });

        std::cout << "  int: " << f1.get() << "\n";
        std::cout << "  str: " << f2.get() << "\n";
        std::cout << "  dbl: " << f3.get() << "\n";
    }

    std::cout << "\nAll done!\n";
}
```

**关键点**：
- `packaged_task` + `future` 实现异步获取结果
- 线程池核心是工作线程循环从任务队列取任务执行
- `submit` 返回 `future`，调用方可以用 `get()` 阻塞等待结果
- 析构时先设 `stop_=true`，再 `notify_all`，最后 `join` 所有线程

---

## 练习6：promise-future 与 async

**考点**：`std::promise`/`std::future`、`std::async`、`std::shared_future`

```cpp
// future_async.cpp
// g++ -std=c++17 -pthread -o future_async future_async.cpp
#include <iostream>
#include <future>
#include <thread>
#include <chrono>
#include <vector>
#include <numeric>
#include <cmath>

// ============ 并行计算：分块求和 ============
template<typename Iterator>
double parallel_sum(Iterator begin, Iterator end) {
    auto len = std::distance(begin, end);
    if (len < 1000) {
        return std::accumulate(begin, end, 0.0);
    }

    auto mid = begin + len / 2;
    // async 可能开新线程（由实现决定）
    auto left = std::async(std::launch::async, parallel_sum<Iterator>, begin, mid);
    double right = parallel_sum(mid, end);  // 当前线程处理右半部分
    return left.get() + right;
}

int main() {
    std::cout << "=== 1. promise-future 手动通信 ===\n";
    {
        std::promise<int> promise;
        std::future<int> future = promise.get_future();

        std::thread worker([&promise] {
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
            promise.set_value(42);  // 设置结果
            std::cout << "  [worker] value set\n";
        });

        std::cout << "  [main] waiting for result...\n";
        int result = future.get();  // 阻塞直到 set_value
        std::cout << "  [main] got: " << result << "\n";
        worker.join();
    }

    std::cout << "\n=== 2. promise 传递异常 ===\n";
    {
        std::promise<int> promise;
        auto future = promise.get_future();

        std::thread worker([&promise] {
            try {
                throw std::runtime_error("something went wrong");
            } catch (...) {
                promise.set_exception(std::current_exception());
            }
        });

        try {
            future.get();  // 重新抛出异常
        } catch (const std::exception& e) {
            std::cout << "  caught: " << e.what() << "\n";
        }
        worker.join();
    }

    std::cout << "\n=== 3. std::async ===\n";
    {
        // launch::async 强制在新线程执行
        auto f1 = std::async(std::launch::async, [] {
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
            return 100;
        });

        // launch::deferred 延迟到 get() 时在调用线程执行
        auto f2 = std::async(std::launch::deferred, [] {
            return 200;
        });

        std::cout << "  async result: " << f1.get() << "\n";
        std::cout << "  deferred result: " << f2.get() << "\n";
    }

    std::cout << "\n=== 4. 并行求和 ===\n";
    {
        std::vector<double> data(1000000);
        std::iota(data.begin(), data.end(), 1.0);

        auto start = std::chrono::steady_clock::now();
        double sum = parallel_sum(data.begin(), data.end());
        auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - start).count();

        std::cout << "  sum = " << sum << ", time = " << ms << "ms\n";
    }

    std::cout << "\n=== 5. shared_future 多个等待者 ===\n";
    {
        std::promise<int> promise;
        std::shared_future<int> shared = promise.get_future().share();

        // 多个线程等待同一个结果
        std::vector<std::thread> threads;
        for (int i = 0; i < 3; ++i) {
            threads.emplace_back([shared, i] {
                int val = shared.get();  // 可多次调用
                std::cout << "  thread " << i << " got: " << val << "\n";
            });
        }

        promise.set_value(999);
        for (auto& t : threads) t.join();
    }

    std::cout << "\nAll done!\n";
}
```

**关键点**：
- `promise` 是写端，`future` 是读端，一一对应
- `promise` 可以通过 `set_exception` 传递异常
- `shared_future` 允许多个线程等待同一个结果
- `std::async` 的 `launch::deferred` 是懒执行，`get()` 时才运行

---

## 练习7：C++20 jthread 与 stop_token

**考点**：`std::jthread` 自动 join、`std::stop_token` 协作取消

```cpp
// jthread_practice.cpp
// g++ -std=c++20 -pthread -o jthread_practice jthread_practice.cpp
#include <iostream>
#include <thread>
#include <chrono>
#include <vector>
#include <stop_token>
#include <mutex>
#include <latch>
#include <barrier>
#include <semaphore>

std::mutex print_mtx;

void safe_print(const std::string& msg) {
    std::lock_guard lock(print_mtx);
    std::cout << msg << "\n";
}

int main() {
    std::cout << "=== 1. jthread 自动 join ===\n";
    {
        // jthread 析构时自动 join（不需要手动 join）
        std::jthread t([] {
            safe_print("  [jthread] running");
        });
        // 离开作用域自动 join，不会 terminate
    }
    safe_print("  [main] after jthread scope");

    std::cout << "\n=== 2. stop_token 协作取消 ===\n";
    {
        // jthread 第一个参数可以是 stop_token
        std::jthread worker([](std::stop_token st) {
            int count = 0;
            while (!st.stop_requested()) {
                ++count;
                std::this_thread::sleep_for(std::chrono::milliseconds(50));
            }
            safe_print("  [worker] stopped after " + std::to_string(count) + " iterations");
        });

        std::this_thread::sleep_for(std::chrono::milliseconds(200));
        worker.request_stop();  // 请求停止
        // 析构时自动 join
    }

    std::cout << "\n=== 3. stop_callback ===\n";
    {
        std::jthread worker([](std::stop_token st) {
            // 注册停止回调
            std::stop_callback cb(st, [] {
                safe_print("  [callback] stop requested!");
            });

            while (!st.stop_requested()) {
                std::this_thread::sleep_for(std::chrono::milliseconds(50));
            }
            safe_print("  [worker] exiting");
        });

        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        worker.request_stop();
    }

    std::cout << "\n=== 4. std::latch (一次性屏障) ===\n";
    {
        constexpr int N = 4;
        std::latch startup(N);  // 等待 N 个线程就绪

        std::vector<std::jthread> threads;
        for (int i = 0; i < N; ++i) {
            threads.emplace_back([&startup, i] {
                safe_print("  [thread " + std::to_string(i) + "] preparing...");
                std::this_thread::sleep_for(std::chrono::milliseconds(50 * (i + 1)));
                startup.count_down();  // 就绪
                safe_print("  [thread " + std::to_string(i) + "] ready");
            });
        }

        startup.wait();  // 等待所有线程就绪
        safe_print("  [main] all threads ready, go!");
    }

    std::cout << "\n=== 5. std::counting_semaphore ===\n";
    {
        // 限制同时运行的线程数为 2
        std::counting_semaphore<2> sem(2);

        std::vector<std::jthread> threads;
        for (int i = 0; i < 5; ++i) {
            threads.emplace_back([&sem, i] {
                sem.acquire();  // 获取许可（最多2个同时获取）
                safe_print("  [thread " + std::to_string(i) + "] working (slot acquired)");
                std::this_thread::sleep_for(std::chrono::milliseconds(100));
                safe_print("  [thread " + std::to_string(i) + "] done");
                sem.release();  // 释放许可
            });
        }
    }

    std::cout << "\nAll done!\n";
}
```

**关键点**：
- `jthread` = `thread` + 自动 join + stop_token 支持
- `stop_token` 是协作式取消（线程自己检查并退出，不是强杀）
- `latch` 是一次性屏障，`count_down` 后不可重置
- `counting_semaphore` 限制并发数量（类似连接池限流）
