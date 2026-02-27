---
title: C++ 高性能优化练手代码 —— 6 个可编译运行的性能实战
description: 覆盖定长内存池/对象池、缓存友好遍历与false-sharing对比、无锁SPSC队列、编译期字符串与small-buffer优化、高效哈希表探测、SIMD向量化入门，每个练习约100行可直接编译运行
date: 2026-02-27
categories: [编程语言]
tags: [c++, 练手代码, 高性能, 内存池, cache, 无锁队列, SIMD, 性能优化, false-sharing]
---

高性能 C++ 是区分"会写"和"写得好"的分水岭——面试中能手写内存池、解释 false sharing、实现无锁队列，直接拉满技术评分。这 6 个练习对应面试中最常考的性能优化场景。

> 📌 关联阅读：[高性能优化面试题](/techlearn/posts/high-performance-interview) · [锁与并发练手代码](/techlearn/posts/concurrency-practice) · [C++ 对象模型练手代码](/techlearn/posts/cpp-object-model-practice)

------

## 练习1：定长内存池

**考点**：避免频繁 malloc/free、链表管理空闲块、RAII

```cpp
// memory_pool.cpp
// g++ -std=c++17 -O2 -o memory_pool memory_pool.cpp
#include <iostream>
#include <vector>
#include <chrono>
#include <cassert>
#include <cstdlib>

// 定长内存池：每个块大小固定，空闲块用链表串联
class FixedPool {
    struct Block {
        Block* next;  // 空闲链表的 next 指针复用内存块本身
    };

    void* pool_;       // 整块内存
    Block* free_;      // 空闲链表头
    size_t block_size_;
    size_t block_count_;
public:
    FixedPool(size_t block_size, size_t count)
        : block_size_(std::max(block_size, sizeof(Block)))
        , block_count_(count) {
        pool_ = std::malloc(block_size_ * count);
        free_ = nullptr;

        // 初始化空闲链表（从后往前，这样分配时从前往后）
        auto* p = static_cast<char*>(pool_);
        for (size_t i = 0; i < count; ++i) {
            auto* block = reinterpret_cast<Block*>(p + i * block_size_);
            block->next = free_;
            free_ = block;
        }
    }

    ~FixedPool() { std::free(pool_); }

    void* allocate() {
        if (!free_) return nullptr;  // 池满
        Block* block = free_;
        free_ = free_->next;
        return block;
    }

    void deallocate(void* ptr) {
        auto* block = static_cast<Block*>(ptr);
        block->next = free_;
        free_ = block;
    }

    FixedPool(const FixedPool&) = delete;
    FixedPool& operator=(const FixedPool&) = delete;
};

// 配合 placement new 使用
struct SmallObj {
    int x, y, z;
    SmallObj(int a, int b, int c) : x(a), y(b), z(c) {}
};

int main() {
    constexpr int N = 1000000;

    std::cout << "=== 内存池 vs malloc 性能对比 ===\n";

    // 1. malloc/free
    {
        auto start = std::chrono::high_resolution_clock::now();
        std::vector<void*> ptrs(N);
        for (int i = 0; i < N; ++i) ptrs[i] = std::malloc(sizeof(SmallObj));
        for (int i = 0; i < N; ++i) std::free(ptrs[i]);
        auto ms = std::chrono::duration_cast<std::chrono::microseconds>(
            std::chrono::high_resolution_clock::now() - start).count();
        std::cout << "  malloc/free: " << ms << " us\n";
    }

    // 2. 内存池
    {
        FixedPool pool(sizeof(SmallObj), N);
        auto start = std::chrono::high_resolution_clock::now();
        std::vector<void*> ptrs(N);
        for (int i = 0; i < N; ++i) ptrs[i] = pool.allocate();
        for (int i = 0; i < N; ++i) pool.deallocate(ptrs[i]);
        auto ms = std::chrono::duration_cast<std::chrono::microseconds>(
            std::chrono::high_resolution_clock::now() - start).count();
        std::cout << "  pool alloc:  " << ms << " us\n";
    }

    // 3. placement new 使用示例
    {
        FixedPool pool(sizeof(SmallObj), 10);
        void* mem = pool.allocate();
        auto* obj = new(mem) SmallObj(1, 2, 3);  // placement new
        std::cout << "\n  obj: " << obj->x << "," << obj->y << "," << obj->z << "\n";
        obj->~SmallObj();  // 手动析构
        pool.deallocate(mem);
    }

    std::cout << "\nDone!\n";
}
```

**关键点**：
- 空闲块的 `next` 指针复用块自身内存（零额外开销）
- 内存池分配/释放是 O(1)，且内存连续对缓存友好
- 使用 `placement new` 在池分配的内存上构造对象
- 适用于大量相同大小对象的频繁分配/释放（连接、请求、消息等）

---

## 练习2：缓存友好与 False Sharing

**考点**：行优先遍历 vs 列优先、cache line 对齐、`alignas(64)`

```cpp
// cache_friendly.cpp
// g++ -std=c++17 -O2 -pthread -o cache_friendly cache_friendly.cpp
#include <iostream>
#include <vector>
#include <chrono>
#include <thread>
#include <atomic>

constexpr int ROWS = 4096;
constexpr int COLS = 4096;

auto benchmark(const char* name, auto func) {
    auto start = std::chrono::high_resolution_clock::now();
    func();
    auto ms = std::chrono::duration_cast<std::chrono::microseconds>(
        std::chrono::high_resolution_clock::now() - start).count();
    std::cout << "  " << name << ": " << ms << " us\n";
    return ms;
}

int main() {
    std::cout << "=== 1. 行优先 vs 列优先遍历 ===\n";
    {
        std::vector<std::vector<int>> matrix(ROWS, std::vector<int>(COLS, 1));
        long long sum;

        // 行优先（缓存友好：连续内存访问）
        benchmark("row-major", [&] {
            sum = 0;
            for (int i = 0; i < ROWS; ++i)
                for (int j = 0; j < COLS; ++j)
                    sum += matrix[i][j];
        });

        // 列优先（缓存不友好：跳跃访问）
        benchmark("col-major", [&] {
            sum = 0;
            for (int j = 0; j < COLS; ++j)
                for (int i = 0; i < ROWS; ++i)
                    sum += matrix[i][j];
        });
    }

    std::cout << "\n=== 2. SoA vs AoS ===\n";
    {
        constexpr int N = 1000000;

        // AoS (Array of Structures)
        struct Particle_AoS { float x, y, z, w; };
        std::vector<Particle_AoS> aos(N);
        for (auto& p : aos) { p.x = 1; p.y = 2; p.z = 3; p.w = 4; }

        benchmark("AoS (sum x)", [&] {
            float sum = 0;
            for (const auto& p : aos) sum += p.x;
        });

        // SoA (Structure of Arrays)
        struct Particles_SoA {
            std::vector<float> x, y, z, w;
        };
        Particles_SoA soa;
        soa.x.resize(N, 1); soa.y.resize(N, 2);
        soa.z.resize(N, 3); soa.w.resize(N, 4);

        benchmark("SoA (sum x)", [&] {
            float sum = 0;
            for (float v : soa.x) sum += v;
        });
    }

    std::cout << "\n=== 3. False Sharing ===\n";
    {
        constexpr int ITER = 10000000;

        // Bad: 两个原子变量在同一缓存行
        struct BadCounters {
            std::atomic<long long> a{0};
            std::atomic<long long> b{0};
        };

        // Good: 对齐到不同缓存行
        struct GoodCounters {
            alignas(64) std::atomic<long long> a{0};
            alignas(64) std::atomic<long long> b{0};
        };

        auto test_counters = [&](auto& counters, const char* name) {
            counters.a = 0;
            counters.b = 0;
            benchmark(name, [&] {
                std::thread t1([&] { for (int i = 0; i < ITER; ++i) counters.a.fetch_add(1, std::memory_order_relaxed); });
                std::thread t2([&] { for (int i = 0; i < ITER; ++i) counters.b.fetch_add(1, std::memory_order_relaxed); });
                t1.join(); t2.join();
            });
        };

        BadCounters bad;
        GoodCounters good;
        std::cout << "  sizeof(BadCounters)  = " << sizeof(bad) << "\n";
        std::cout << "  sizeof(GoodCounters) = " << sizeof(good) << "\n";
        test_counters(bad, "false-sharing (bad)");
        test_counters(good, "cache-aligned (good)");
    }

    std::cout << "\nDone!\n";
}
```

**关键点**：
- 行优先遍历利用 CPU 缓存预取（spatial locality），比列优先快数倍
- SoA 在只访问部分字段时更缓存友好（每条缓存行全是有用数据）
- False Sharing：两个线程写同一缓存行的不同变量，导致缓存行反复失效
- `alignas(64)` 将变量对齐到独立缓存行，消除 false sharing

---

## 练习3：无锁 SPSC 队列

**考点**：单生产者单消费者、环形缓冲区、acquire-release 内存序

```cpp
// spsc_queue.cpp
// g++ -std=c++17 -O2 -pthread -o spsc_queue spsc_queue.cpp
#include <iostream>
#include <atomic>
#include <thread>
#include <chrono>
#include <cassert>
#include <vector>

// 无锁 SPSC 环形队列（Lock-Free Single Producer Single Consumer）
template<typename T, size_t Capacity>
class SPSCQueue {
    static_assert((Capacity & (Capacity - 1)) == 0, "Capacity must be power of 2");

    alignas(64) std::atomic<size_t> head_{0};  // 消费者读，生产者写
    alignas(64) std::atomic<size_t> tail_{0};  // 生产者读，消费者写
    T buffer_[Capacity];

    size_t mask(size_t idx) const { return idx & (Capacity - 1); }
public:
    bool push(const T& val) {
        size_t tail = tail_.load(std::memory_order_relaxed);
        size_t next = tail + 1;
        if (mask(next) == mask(head_.load(std::memory_order_acquire))) {
            return false;  // 满
        }
        buffer_[mask(tail)] = val;
        tail_.store(next, std::memory_order_release);  // 发布：确保数据写入在 tail 更新之前
        return true;
    }

    bool pop(T& val) {
        size_t head = head_.load(std::memory_order_relaxed);
        if (mask(head) == mask(tail_.load(std::memory_order_acquire))) {
            return false;  // 空
        }
        val = buffer_[mask(head)];
        head_.store(head + 1, std::memory_order_release);  // 发布：确保数据读取在 head 更新之前
        return true;
    }

    size_t size() const {
        return tail_.load(std::memory_order_relaxed) -
               head_.load(std::memory_order_relaxed);
    }
};

int main() {
    std::cout << "=== 1. 正确性测试 ===\n";
    {
        SPSCQueue<int, 1024> q;
        constexpr int N = 100000;
        std::atomic<bool> done{false};

        std::thread producer([&] {
            for (int i = 0; i < N; ++i) {
                while (!q.push(i)) {}  // 满则自旋
            }
            done = true;
        });

        std::thread consumer([&] {
            int expected = 0;
            while (expected < N) {
                int val;
                if (q.pop(val)) {
                    assert(val == expected && "order mismatch!");
                    ++expected;
                }
            }
        });

        producer.join();
        consumer.join();
        std::cout << "  " << N << " items transferred correctly!\n";
    }

    std::cout << "\n=== 2. 吞吐量测试 ===\n";
    {
        SPSCQueue<int64_t, 65536> q;
        constexpr int64_t N = 10000000;

        auto start = std::chrono::high_resolution_clock::now();

        std::thread producer([&] {
            for (int64_t i = 0; i < N; ++i) {
                while (!q.push(i)) {}
            }
        });

        std::thread consumer([&] {
            int64_t val, count = 0;
            while (count < N) {
                if (q.pop(val)) ++count;
            }
        });

        producer.join();
        consumer.join();

        auto us = std::chrono::duration_cast<std::chrono::microseconds>(
            std::chrono::high_resolution_clock::now() - start).count();
        double mops = N * 1.0 / us;
        std::cout << "  " << N << " ops in " << us << " us\n";
        std::cout << "  throughput: " << mops << " M ops/sec\n";
    }

    std::cout << "\nDone!\n";
}
```

**关键点**：
- SPSC 队列不需要锁，只靠 `atomic` 的 acquire-release 语义保证正确性
- 容量必须是 2 的幂，用位运算 `& (Capacity-1)` 替代取模
- `head_` 和 `tail_` 对齐到不同缓存行避免 false sharing
- 实际性能可达数千万 ops/sec，远超加锁队列

---

## 练习4：Small Buffer 优化

**考点**：SSO 思想、栈上预分配、避免堆分配、`std::string` 的 SSO

```cpp
// small_buffer.cpp
// g++ -std=c++17 -O2 -o small_buffer small_buffer.cpp
#include <iostream>
#include <string>
#include <cstring>
#include <chrono>
#include <vector>

// 模拟 std::string 的 Small String Optimization
class MyString {
    static constexpr size_t SSO_SIZE = 22;  // 栈上缓冲区大小

    union {
        struct {
            char* ptr;
            size_t capacity;
        } heap;
        char sso[SSO_SIZE + 1];  // +1 for null terminator
    };
    size_t size_ = 0;
    bool on_heap_ = false;

    char* data_ptr() { return on_heap_ ? heap.ptr : sso; }
    const char* data_ptr() const { return on_heap_ ? heap.ptr : sso; }

public:
    MyString() { sso[0] = '\0'; }

    MyString(const char* s) {
        size_ = std::strlen(s);
        if (size_ <= SSO_SIZE) {
            std::memcpy(sso, s, size_ + 1);
            on_heap_ = false;
        } else {
            heap.capacity = size_;
            heap.ptr = new char[size_ + 1];
            std::memcpy(heap.ptr, s, size_ + 1);
            on_heap_ = true;
        }
    }

    ~MyString() { if (on_heap_) delete[] heap.ptr; }

    // 拷贝
    MyString(const MyString& o) : size_(o.size_), on_heap_(o.on_heap_) {
        if (on_heap_) {
            heap.capacity = o.heap.capacity;
            heap.ptr = new char[size_ + 1];
            std::memcpy(heap.ptr, o.heap.ptr, size_ + 1);
        } else {
            std::memcpy(sso, o.sso, size_ + 1);
        }
    }

    // 移动
    MyString(MyString&& o) noexcept : size_(o.size_), on_heap_(o.on_heap_) {
        if (on_heap_) {
            heap = o.heap;
            o.heap.ptr = nullptr;
        } else {
            std::memcpy(sso, o.sso, size_ + 1);
        }
        o.size_ = 0;
        o.on_heap_ = false;
        o.sso[0] = '\0';
    }

    const char* c_str() const { return data_ptr(); }
    size_t size() const { return size_; }
    bool is_sso() const { return !on_heap_; }
};

int main() {
    std::cout << "=== 1. SSO 行为验证 ===\n";
    {
        MyString short_str("hello");            // SSO（栈上）
        MyString long_str("this is a very long string that exceeds SSO buffer");

        std::cout << "  sizeof(MyString) = " << sizeof(MyString) << "\n";
        std::cout << "  short: is_sso=" << short_str.is_sso()
                  << ", str=\"" << short_str.c_str() << "\"\n";
        std::cout << "  long:  is_sso=" << long_str.is_sso()
                  << ", str=\"" << long_str.c_str() << "\"\n";
    }

    std::cout << "\n=== 2. std::string 的 SSO 探测 ===\n";
    {
        // 实际 std::string 的 SSO 阈值因实现而异
        for (size_t len : {0, 7, 15, 22, 23, 31, 100}) {
            std::string s(len, 'x');
            const void* data_addr = s.data();
            const void* obj_addr = &s;
            bool is_internal =
                data_addr >= obj_addr &&
                data_addr < (const char*)obj_addr + sizeof(s);
            std::cout << "  len=" << len
                      << " sso=" << (is_internal ? "YES" : "NO")
                      << " sizeof=" << sizeof(s) << "\n";
        }
    }

    std::cout << "\n=== 3. SSO 性能对比 ===\n";
    {
        constexpr int N = 1000000;

        auto bench = [N](const char* name, const char* val) {
            auto start = std::chrono::high_resolution_clock::now();
            for (int i = 0; i < N; ++i) {
                std::string s(val);
                (void)s;
            }
            auto us = std::chrono::duration_cast<std::chrono::microseconds>(
                std::chrono::high_resolution_clock::now() - start).count();
            std::cout << "  " << name << ": " << us << " us\n";
        };

        bench("short (SSO)", "hello");
        bench("long (heap)", "this is a long string that definitely won't fit in SSO");
    }

    std::cout << "\nDone!\n";
}
```

**关键点**：
- SSO 在对象内部预留小缓冲区，短字符串不需要堆分配
- 典型 `std::string` 的 SSO 阈值：GCC/libstdc++ 是 15，Clang/libc++ 是 22
- SSO 避免了堆分配的开销（malloc + 缓存不友好 + 内存碎片）
- 同样的思想可以用于 `small_vector`、`small_function` 等

---

## 练习5：高效哈希表（开放寻址）

**考点**：Robin Hood 探测、load factor、缓存友好的哈希表设计

```cpp
// hash_table.cpp
// g++ -std=c++17 -O2 -o hash_table hash_table.cpp
#include <iostream>
#include <vector>
#include <optional>
#include <functional>
#include <chrono>
#include <unordered_map>
#include <cassert>

// 开放寻址哈希表（线性探测 + Robin Hood）
template<typename K, typename V>
class FlatHashMap {
    struct Slot {
        K key;
        V value;
        uint8_t dist = 0;   // 距离理想位置的偏移
        bool occupied = false;
    };

    std::vector<Slot> slots_;
    size_t size_ = 0;
    size_t mask_;

    size_t hash_idx(const K& key) const {
        return std::hash<K>{}(key) & mask_;
    }

    void grow() {
        auto old = std::move(slots_);
        slots_.resize(slots_.size() * 2);
        mask_ = slots_.size() - 1;
        size_ = 0;
        for (auto& s : old) {
            if (s.occupied) insert(std::move(s.key), std::move(s.value));
        }
    }

public:
    explicit FlatHashMap(size_t initial = 16)
        : slots_(initial), mask_(initial - 1) {
        assert((initial & (initial - 1)) == 0);  // 2 的幂
    }

    void insert(K key, V value) {
        if (size_ * 4 >= slots_.size() * 3) grow();  // load factor > 0.75

        size_t idx = hash_idx(key);
        Slot incoming{std::move(key), std::move(value), 1, true};

        while (true) {
            auto& slot = slots_[idx];
            if (!slot.occupied) {
                slot = std::move(incoming);
                ++size_;
                return;
            }
            if (slot.key == incoming.key) {
                slot.value = std::move(incoming.value);  // 更新
                return;
            }
            // Robin Hood: 如果当前 slot 的探测距离比 incoming 短，交换
            if (slot.dist < incoming.dist) {
                std::swap(slot, incoming);
            }
            ++incoming.dist;
            idx = (idx + 1) & mask_;
        }
    }

    std::optional<V> find(const K& key) const {
        size_t idx = hash_idx(key);
        uint8_t dist = 1;
        while (true) {
            const auto& slot = slots_[idx];
            if (!slot.occupied || slot.dist < dist) return std::nullopt;
            if (slot.key == key) return slot.value;
            ++dist;
            idx = (idx + 1) & mask_;
        }
    }

    size_t size() const { return size_; }
};

int main() {
    std::cout << "=== 1. 正确性测试 ===\n";
    {
        FlatHashMap<std::string, int> map;
        map.insert("apple", 1);
        map.insert("banana", 2);
        map.insert("cherry", 3);

        assert(map.find("apple").value() == 1);
        assert(map.find("banana").value() == 2);
        assert(!map.find("missing").has_value());

        map.insert("apple", 10);  // 更新
        assert(map.find("apple").value() == 10);
        std::cout << "  correctness OK\n";
    }

    std::cout << "\n=== 2. 性能对比 ===\n";
    {
        constexpr int N = 100000;

        // FlatHashMap
        {
            FlatHashMap<int, int> map(16);
            auto start = std::chrono::high_resolution_clock::now();
            for (int i = 0; i < N; ++i) map.insert(i, i);
            for (int i = 0; i < N; ++i) map.find(i);
            auto us = std::chrono::duration_cast<std::chrono::microseconds>(
                std::chrono::high_resolution_clock::now() - start).count();
            std::cout << "  FlatHashMap: " << us << " us\n";
        }

        // std::unordered_map
        {
            std::unordered_map<int, int> map;
            auto start = std::chrono::high_resolution_clock::now();
            for (int i = 0; i < N; ++i) map[i] = i;
            for (int i = 0; i < N; ++i) map.find(i);
            auto us = std::chrono::duration_cast<std::chrono::microseconds>(
                std::chrono::high_resolution_clock::now() - start).count();
            std::cout << "  unordered_map: " << us << " us\n";
        }
    }

    std::cout << "\nDone!\n";
}
```

**关键点**：
- 开放寻址将数据存在连续数组中，对缓存非常友好
- Robin Hood 哈希均衡了探测距离，减少最坏情况
- `std::unordered_map` 用链地址法（每个桶一个链表），缓存不友好
- 实际高性能哈希表（abseil、robin-map）都用开放寻址

---

## 练习6：对象池（复用对象避免构造/析构）

**考点**：对象复用、工厂模式、RAII 自动归还

```cpp
// object_pool.cpp
// g++ -std=c++17 -O2 -o object_pool object_pool.cpp
#include <iostream>
#include <vector>
#include <memory>
#include <functional>
#include <chrono>
#include <cassert>

// 对象池：预创建对象，使用时借出，用完归还
template<typename T>
class ObjectPool {
    struct Deleter {
        ObjectPool* pool;
        void operator()(T* ptr) {
            pool->release(ptr);  // 归还而非删除
        }
    };

    std::vector<std::unique_ptr<T>> all_;     // 所有对象的所有权
    std::vector<T*> available_;               // 可用对象
    std::function<void(T&)> reset_func_;      // 重置函数

public:
    using Ptr = std::unique_ptr<T, Deleter>;

    explicit ObjectPool(size_t initial, std::function<void(T&)> reset = {})
        : reset_func_(std::move(reset)) {
        for (size_t i = 0; i < initial; ++i) {
            all_.push_back(std::make_unique<T>());
            available_.push_back(all_.back().get());
        }
    }

    Ptr acquire() {
        if (available_.empty()) {
            // 池空了，扩展
            all_.push_back(std::make_unique<T>());
            available_.push_back(all_.back().get());
        }
        T* obj = available_.back();
        available_.pop_back();
        return Ptr(obj, Deleter{this});
    }

    size_t available_count() const { return available_.size(); }
    size_t total_count() const { return all_.size(); }

private:
    void release(T* ptr) {
        if (reset_func_) reset_func_(*ptr);  // 重置状态
        available_.push_back(ptr);
    }
};

// 模拟数据库连接
struct Connection {
    int id = 0;
    bool in_transaction = false;
    std::string query_buffer;

    void execute(const std::string& sql) {
        query_buffer = sql;
    }
};

int main() {
    std::cout << "=== 1. 基本用法 ===\n";
    {
        ObjectPool<Connection> pool(3, [](Connection& c) {
            c.in_transaction = false;
            c.query_buffer.clear();
        });

        std::cout << "  available: " << pool.available_count() << "\n";  // 3

        {
            auto conn1 = pool.acquire();
            auto conn2 = pool.acquire();
            conn1->execute("SELECT 1");
            conn2->execute("INSERT ...");
            std::cout << "  available: " << pool.available_count() << "\n";  // 1
            // 离开作用域自动归还
        }

        std::cout << "  available: " << pool.available_count() << "\n";  // 3
    }

    std::cout << "\n=== 2. 性能对比 ===\n";
    {
        constexpr int N = 100000;

        // 每次 new/delete
        {
            auto start = std::chrono::high_resolution_clock::now();
            for (int i = 0; i < N; ++i) {
                auto* c = new Connection();
                c->execute("test");
                delete c;
            }
            auto us = std::chrono::duration_cast<std::chrono::microseconds>(
                std::chrono::high_resolution_clock::now() - start).count();
            std::cout << "  new/delete: " << us << " us\n";
        }

        // 对象池
        {
            ObjectPool<Connection> pool(1, [](Connection& c) { c.query_buffer.clear(); });
            auto start = std::chrono::high_resolution_clock::now();
            for (int i = 0; i < N; ++i) {
                auto c = pool.acquire();
                c->execute("test");
            }
            auto us = std::chrono::duration_cast<std::chrono::microseconds>(
                std::chrono::high_resolution_clock::now() - start).count();
            std::cout << "  pool:       " << us << " us\n";
        }
    }

    std::cout << "\nDone!\n";
}
```

**关键点**：
- 自定义 `Deleter` 让 `unique_ptr` 析构时归还对象而非删除
- 对象池避免了频繁的构造/析构和堆分配开销
- `reset_func_` 在归还时清理对象状态，确保下次使用时是干净的
- 适用于连接池、线程池、消息对象等场景
