---
title: 锁、并发编程与内存模型面试题 —— 从互斥锁到 Memory Order 的深度问答
description: 覆盖互斥锁/读写锁/自旋锁/无锁编程、线程同步原语、C++ 内存模型、内存屏障等高频面试题，补全 Windows 和 Linux 双平台知识
date: 2026-02-26
categories: [编程语言]
tags: [并发, 锁, 多线程, 内存模型, 原子操作, 面试, c++, linux, windows]
---

这是网络与系统编程面试系列的第二篇，聚焦**锁机制**、**并发编程**和**C++ 内存模型**。这些知识在面试中经常被深挖，尤其是锁的种类和内存序（memory order）的区别。

------

## 第一部分：锁的基础

### Q1：互斥锁（Mutex）的原理？

**记忆点：互斥锁保证同一时刻只有一个线程能进入临界区。底层依赖 CPU 的原子指令（CAS/TAS）+ 操作系统的线程调度（拿不到锁就睡眠）。**

```
互斥锁的状态：
  locked = 0（未锁定）
  locked = 1（已锁定）

加锁过程（简化）：
  1. 原子地检查 locked 是否为 0
  2. 如果是 0 → 设为 1，加锁成功
  3. 如果是 1 → 当前线程放入等待队列，进入睡眠
  （1 和 2 是一个原子操作，不可被打断）

解锁过程：
  1. 设 locked = 0
  2. 唤醒等待队列中的一个线程
```

```cpp
// Linux: pthread_mutex
pthread_mutex_t mtx = PTHREAD_MUTEX_INITIALIZER;
pthread_mutex_lock(&mtx);     // 加锁（拿不到就阻塞）
// 临界区
pthread_mutex_unlock(&mtx);   // 解锁

// Windows: CRITICAL_SECTION（轻量级，同进程内）
CRITICAL_SECTION cs;
InitializeCriticalSection(&cs);
EnterCriticalSection(&cs);    // 加锁
// 临界区
LeaveCriticalSection(&cs);    // 解锁

// Windows: Mutex（重量级，可跨进程）
HANDLE hMutex = CreateMutex(NULL, FALSE, "MyMutex");
WaitForSingleObject(hMutex, INFINITE);  // 加锁
// 临界区
ReleaseMutex(hMutex);                   // 解锁

// C++ 标准库（跨平台）
std::mutex mtx;
std::lock_guard<std::mutex> lock(mtx);  // RAII 加锁
```

### Q2：各种锁的区别和适用场景？

**记忆点：互斥锁（通用）、自旋锁（临界区极短）、读写锁（读多写少）、递归锁（同线程可重入）。**

```
锁类型          行为                           适用场景

互斥锁          拿不到锁 → 线程睡眠（让出CPU）  通用，临界区可能较长
(Mutex)         有上下文切换开销

自旋锁          拿不到锁 → 忙等（空转占CPU）    临界区极短（< 几微秒）
(SpinLock)      无上下文切换                    多核 CPU 上使用

读写锁          读锁共享，写锁独占              读多写少（如缓存、配置）
(RWLock)        多个读者可以同时读

递归锁          同一线程可以多次加锁             递归函数中需要加锁
(Recursive)     需要相同次数的解锁              （但通常说明设计有问题）

条件变量        不是锁！是等待/通知机制          生产者-消费者模式
(CondVar)       配合 Mutex 使用                 等待某个条件成立
```

### Q3：自旋锁为什么适合短临界区？

**记忆点：自旋锁不睡眠而是忙等（循环检测），省去了线程上下文切换的开销（~几微秒）。如果临界区很短（几纳秒），忙等比睡眠+唤醒更快。但临界区长了就是浪费 CPU。**

```
对比：

互斥锁加锁失败：
  线程 → 保存上下文 → 放入等待队列 → CPU 调度其他线程 → 被唤醒 → 恢复上下文
  代价：约 10-30 微秒（上下文切换）

自旋锁加锁失败：
  while (locked) { /* 空转 */ }  // 一直占着 CPU 转圈
  代价：占用 CPU 但没有切换开销

  如果临界区只有 100 纳秒 → 自旋锁更快
  如果临界区有 100 毫秒 → 自旋锁浪费了 100ms 的 CPU！
```

```cpp
// 简单的自旋锁实现
class SpinLock {
    std::atomic_flag flag = ATOMIC_FLAG_INIT;
public:
    void lock() {
        while (flag.test_and_set(std::memory_order_acquire)) {
            // 忙等，可以加 pause/yield 减少 CPU 浪费
            #ifdef __x86_64__
            __builtin_ia32_pause();  // CPU hint：我在自旋
            #endif
        }
    }
    void unlock() {
        flag.clear(std::memory_order_release);
    }
};
```

### Q4：读写锁的实现原理？什么是写饥饿？

**记忆点：维护一个读者计数器和一个写标志。读加锁时：无写者则计数器+1（允许并发读）；写加锁时：等所有读者和写者都退出。写饥饿 = 持续有新读者进入，写者永远等不到机会。**

```
读写锁状态机：

  空闲 ──读锁──> 读模式（多个读者共享）
  空闲 ──写锁──> 写模式（独占）
  读模式 ──新读者──> 读模式（计数+1）
  读模式 ──所有读者释放──> 空闲
  读模式 ──写者请求──> 等待（直到所有读者释放）

写饥饿问题：
  读者 1 读锁 ── 读者 2 读锁 ── 写者等待 ── 读者 3 读锁（插队！）
                                    ↑
                              写者永远等不到

解决：写优先策略（写者请求后，新读者也要排队）
```

```cpp
// C++ 标准库（C++17）
std::shared_mutex mtx;

// 读者（共享锁）
{
    std::shared_lock<std::shared_mutex> lock(mtx);
    // 多个读者可以同时持有 shared_lock
    readData();
}

// 写者（独占锁）
{
    std::unique_lock<std::shared_mutex> lock(mtx);
    // 独占，等所有读者释放
    writeData();
}
```

### Q5：死锁的四个必要条件和避免方法？

**记忆点：互斥、持有并等待、不可抢占、循环等待 —— 四个条件缺一不可。打破任意一个就能防止死锁。实践中最常用：固定加锁顺序 + std::scoped_lock。**

```
四个必要条件：
  1. 互斥：资源不能共享（锁天然满足）
  2. 持有并等待：持有一个锁的同时等待另一个
  3. 不可抢占：锁不能被强制释放
  4. 循环等待：A 等 B，B 等 A

死锁示例：
  线程 1: lock(A) → lock(B)   // 先锁 A，等 B
  线程 2: lock(B) → lock(A)   // 先锁 B，等 A → 死锁！

避免方法：
  ├── 固定加锁顺序（所有线程都先锁 A 再锁 B）
  ├── 一次性获取所有锁（std::scoped_lock(A, B)）
  ├── 超时锁（try_lock_for，超时则释放已有锁重试）
  └── 减少锁粒度 / 用无锁数据结构
```

```cpp
// C++17：std::scoped_lock 自动解决加锁顺序问题
std::mutex mtxA, mtxB;
{
    std::scoped_lock lock(mtxA, mtxB);  // 内部用算法避免死锁
    // 同时持有两把锁
}
```

------

## 第二部分：同步原语

### Q6：条件变量（Condition Variable）怎么用？

**记忆点：条件变量 = "等待某个条件成立"的机制。必须配合 mutex 使用。wait 时自动释放锁并睡眠，被 notify 唤醒后自动重新加锁。必须用 while 循环检查条件（防止虚假唤醒）。**

```cpp
std::mutex mtx;
std::condition_variable cv;
std::queue<int> queue;

// 生产者
void producer() {
    {
        std::lock_guard<std::mutex> lock(mtx);
        queue.push(42);
    }
    cv.notify_one();  // 通知一个等待的消费者
}

// 消费者
void consumer() {
    std::unique_lock<std::mutex> lock(mtx);
    cv.wait(lock, [&]{ return !queue.empty(); });
    //       ↑ 等价于：
    //       while (queue.empty()) {
    //           cv.wait(lock);  // 释放锁 + 睡眠，被唤醒后重新加锁
    //       }
    //       while 循环是防止虚假唤醒（spurious wakeup）！

    int val = queue.front();
    queue.pop();
}
```

```
Windows 对应：
  条件变量      → CONDITION_VARIABLE + SleepConditionVariableCS
  事件对象      → CreateEvent + SetEvent + WaitForSingleObject
  信号量        → CreateSemaphore

Linux 对应：
  条件变量      → pthread_cond_wait / pthread_cond_signal
  信号量        → sem_wait / sem_post
  Futex         → 用户态快速路径 + 内核态慢速路径
```

### Q7：什么是虚假唤醒（Spurious Wakeup）？

**记忆点：操作系统可能在没有 notify 的情况下唤醒 wait 中的线程，这是 POSIX 标准允许的行为。所以必须用 while 循环（不是 if）检查条件是否真的满足。**

```cpp
// ❌ 错误写法
if (queue.empty()) {
    cv.wait(lock);      // 可能被虚假唤醒，queue 还是空的
}
int val = queue.front();  // 💥 空队列访问！

// ✅ 正确写法
while (queue.empty()) {
    cv.wait(lock);      // 虚假唤醒后回到 while 检查
}
int val = queue.front();  // ✅ 保证不为空

// ✅ 更现代的写法（Lambda 谓词版）
cv.wait(lock, [&]{ return !queue.empty(); });
// 内部就是 while (!predicate()) wait(lock);
```

### Q8：信号量（Semaphore）和互斥锁的区别？

**记忆点：互斥锁是二元的（0/1），只有一个线程能进入。信号量是计数的（0~N），允许 N 个线程同时进入。互斥锁有"所有权"（谁加锁谁解锁），信号量没有（A 加锁 B 可以解锁）。**

```
互斥锁 Mutex：          信号量 Semaphore(N)：
  最多 1 个线程进入       最多 N 个线程进入
  谁锁谁解               谁都能 signal
  保护资源                控制并发度

信号量的典型用途：
  ├── 限流：最多允许 10 个线程同时访问数据库
  ├── 生产者-消费者：空槽信号量 + 满槽信号量
  └── 二元信号量 ≈ Mutex（但语义不同）
```

```cpp
// C++20 标准信号量
#include <semaphore>
std::counting_semaphore<10> sem(10);  // 最多 10 个

sem.acquire();  // 计数 -1（如果为 0 则阻塞）
// 使用资源
sem.release();  // 计数 +1

// 二元信号量
std::binary_semaphore ready(0);  // 初始为 0
// 线程 A
doWork();
ready.release();  // 通知
// 线程 B
ready.acquire();  // 等待通知
```

### Q9：Windows 和 Linux 同步原语对照表？

```
概念              Linux (POSIX)              Windows API                C++ 标准库

互斥锁            pthread_mutex              CRITICAL_SECTION           std::mutex
                                            (同进程，轻量)
                                            Mutex (跨进程，重量级)

读写锁            pthread_rwlock             SRWLock                    std::shared_mutex
                                            (Slim Reader/Writer Lock)   (C++17)

条件变量          pthread_cond               CONDITION_VARIABLE         std::condition_variable

信号量            sem_t (POSIX)              Semaphore                  std::counting_semaphore
                                            (CreateSemaphore)           (C++20)

事件              无直接对应                  Event                      无直接对应
                 (用 cond_var 模拟)          (CreateEvent)

自旋锁            pthread_spinlock           无直接 API                  用 atomic 自己实现
                                            (可用 InitializeSpin
                                             LockAndCount)

原子操作          GCC __atomic builtins      InterlockedXxx             std::atomic
                                            (InterlockedIncrement)

一次性初始化      pthread_once               InitOnceExecuteOnce        std::call_once

线程本地存储      __thread / thread_local    TlsAlloc / TlsFree         thread_local (C++11)

计时等待          pthread_xxx_timedwait      WaitForSingleObject        xxx.wait_for()
                                            (带超时参数)                xxx.wait_until()
```

------

## 第三部分：原子操作

### Q10：什么是 CAS（Compare-And-Swap）？

**记忆点：CAS 是一条 CPU 原子指令 —— "如果当前值等于期望值，就把它改成新值，否则什么都不做"。返回是否成功。是所有无锁数据结构的基石。**

```
CAS 伪代码：

bool CAS(addr, expected, desired) {
    // 以下是一个原子操作（CPU 硬件保证不可打断）
    if (*addr == expected) {
        *addr = desired;
        return true;    // 成功
    }
    return false;       // 失败，说明有人先改了
}
```

```cpp
// C++ 中的 CAS
std::atomic<int> value{0};

int expected = 0;
bool success = value.compare_exchange_strong(expected, 1);
// 如果 value == 0 → 改为 1，返回 true
// 如果 value != 0 → expected 被更新为当前值，返回 false

// CAS 循环（无锁编程的基本模式）
int old_val, new_val;
do {
    old_val = value.load();
    new_val = old_val + 1;
} while (!value.compare_exchange_weak(old_val, new_val));
// weak 版可能虚假失败，但在循环中更高效
```

### Q11：compare_exchange_weak 和 strong 的区别？

**记忆点：weak 可能虚假失败（即使值相等也可能返回 false），但在循环中更高效（某些 CPU 架构上 strong 需要额外指令）。在 CAS 循环中用 weak，单次判断用 strong。**

```
strong：保证如果值相等就一定成功
weak：即使值相等也可能失败（spurious failure）

// 为什么 weak 更快？
// 在 ARM/RISC-V 等架构上，CAS 用 LL/SC 指令实现
// LL/SC 可能因为其他 CPU 的缓存行为而失败
// strong 需要额外的重试循环来保证语义
// weak 直接返回失败，让调用者的循环来重试

// 选择指南：
do { ... } while (!cas_weak(...));  // ✅ 循环中用 weak
if (cas_strong(...)) { ... }        // ✅ 单次判断用 strong
```

### Q12：ABA 问题是什么？怎么解决？

**记忆点：CAS 只检查"值是否相同"，不能检测"值被改过又改回来"。A→B→A，CAS 以为没变过。解决方案：加版本号（每次修改版本+1，检查值+版本号）。**

```
ABA 问题场景：

线程 1: 读到 value = A
线程 1: 准备 CAS(A → C)，但被调度走了

线程 2: 修改 value = B
线程 2: 修改 value = A（又改回来了！）

线程 1: CAS(A → C) 成功！
        但它不知道 value 中间被改过！
        在某些场景下（如无锁链表）这会导致严重 bug

解决方案：
  ├── 版本号（最常用）
  │   不只比较值，还比较版本号
  │   value = {A, version=1} → {B, v=2} → {A, v=3}
  │   CAS 检查 (A, v=1) ≠ (A, v=3) → 失败 ✅
  │
  └── C++ 实现
      std::atomic<std::pair<T, uint64_t>>
      或者用 128 位 CAS（CMPXCHG16B 指令）
```

------

## 第四部分：C++ 内存模型

### Q13：为什么需要内存模型？

**记忆点：编译器和 CPU 都会对指令重排序来优化性能。在单线程中无感知，但在多线程中可能导致一个线程看到另一个线程的操作顺序与代码不一致。内存模型定义了多线程下的可见性和顺序保证。**

```
重排序的三个层面：

1. 编译器重排序
   编译器可能改变代码执行顺序来优化
   x = 1;    →    可能先执行 y = 2
   y = 2;         再执行 x = 1

2. CPU 重排序
   CPU 有 Store Buffer、Write Combining Buffer
   即使指令按序发出，写入内存的顺序也可能不同

3. 缓存一致性延迟
   一个核心的写入可能需要时间才能被另一个核心看到

结果：
   线程 A:             线程 B:
   data = 42;          if (ready) {
   ready = true;           use(data);  // 可能看到 data = 0！
                       }               // 因为 ready=true 可能先于 data=42 可见
```

### Q14：C++ 的六种内存序（Memory Order）？

**记忆点：从最松到最严 —— relaxed（只保证原子性） → acquire/release（单向屏障，建立同步关系） → seq_cst（最严格，全局顺序一致）。日常用 seq_cst（默认）就够了，性能敏感时用 acquire/release。**

```
memory_order_relaxed       只保证原子性，不保证顺序
                           最快，适合独立的计数器

memory_order_acquire       读操作的屏障：之后的读写不能重排到它之前
                           "获取"其他线程 release 之前的所有写入

memory_order_release       写操作的屏障：之前的读写不能重排到它之后
                           "释放"本线程之前的所有写入对 acquire 方可见

memory_order_acq_rel       同时具备 acquire 和 release（用于 read-modify-write）

memory_order_seq_cst       最严格，所有线程看到相同的全局操作顺序
                           默认值，最安全但可能最慢

memory_order_consume       弱化版 acquire（已废弃，不要用）
```

### Q15：acquire-release 语义详解？

**记忆点：release 是"发布"（我的所有写入都完成了），acquire 是"获取"（我能看到对方 release 之前的所有写入）。配对使用，在两个线程间建立"先行发生于"（happens-before）关系。**

```cpp
std::atomic<bool> ready{false};
int data = 0;

// 线程 A（生产者）
data = 42;                                    // ① 普通写
ready.store(true, std::memory_order_release);  // ② release 写
// release 保证：① 不会被重排到 ② 之后

// 线程 B（消费者）
while (!ready.load(std::memory_order_acquire)); // ③ acquire 读
// acquire 保证：③ 之后的操作不会被重排到 ③ 之前
int local = data;                              // ④ 保证读到 42

// ② release 和 ③ acquire 建立了 happens-before 关系
// 所以 ① 的写入对 ④ 一定可见
```

```
时间线：

线程 A:  data=42  ──release──>  ready=true
                     │
                     │  happens-before（因果关系）
                     │
线程 B:              └──acquire──>  读 ready=true  ──>  读 data=42 ✅

如果不用 acquire/release：
线程 B 可能看到 ready=true 但 data=0（重排序导致）
```

### Q16：relaxed 顺序什么时候能用？

**记忆点：只需要原子性、不需要跨线程的顺序保证时用 relaxed。典型场景：统计计数器（只要最终结果正确，不关心中间顺序）。**

```cpp
// ✅ 计数器（只关心最终值，不关心顺序）
std::atomic<int> counter{0};
counter.fetch_add(1, std::memory_order_relaxed);  // 多线程安全递增

// ❌ 不能用 relaxed 的场景：标志位同步
std::atomic<bool> flag{false};
data = 42;
flag.store(true, std::memory_order_relaxed);  // ❌ 其他线程可能先看到 flag=true 再看到 data=0
```

### Q17：seq_cst 和 acquire/release 的性能差异？

**记忆点：x86 上差异极小（x86 本身就是强一致模型，大部分操作天然 acquire/release）。ARM/RISC-V 上差异明显（弱一致模型，seq_cst 需要额外的内存屏障指令）。**

```
x86（强一致模型）：
  ├── 所有 load 天然带 acquire 语义
  ├── 所有 store 天然带 release 语义
  ├── seq_cst store 需要一个 MFENCE 指令（唯一额外开销）
  └── 结论：在 x86 上，acquire/release 几乎免费

ARM/RISC-V（弱一致模型）：
  ├── 默认不保证任何顺序
  ├── acquire 需要 DMB 指令（数据内存屏障）
  ├── release 需要 DMB 指令
  ├── seq_cst 需要更强的屏障
  └── 结论：在 ARM 上，选对内存序有明显性能影响

实际建议：
  ├── 默认用 seq_cst（安全第一，除非profiling证明是瓶颈）
  ├── 计数器用 relaxed
  ├── 标志位/锁 用 acquire/release
  └── 不要过早优化内存序
```

------

## 第五部分：无锁编程

### Q18：什么是无锁（Lock-Free）编程？

**记忆点：无锁不是"没有锁"，而是"至少有一个线程能持续推进"。不会像互斥锁那样因一个线程被调度走而导致所有线程卡住。基于 CAS 实现。**

```
无锁的严格定义：
  Lock-Free：至少一个线程在有限步骤内完成操作
             （不会全部卡住，但个别线程可能饿死）

  Wait-Free：每个线程都能在有限步骤内完成
             （最强保证，但实现复杂）

  Obstruction-Free：在没有竞争的情况下能完成
             （最弱保证）

无锁 vs 有锁：
  有锁：线程 A 持有锁被挂起 → 所有其他线程阻塞
  无锁：线程 A 被挂起 → 其他线程仍然可以正常工作
```

### Q19：无锁队列怎么实现？

**记忆点：用原子指针实现 head 和 tail，入队和出队都用 CAS 操作。单生产者单消费者（SPSC）的无锁队列最简单也最实用。**

```cpp
// 简化版 SPSC 无锁环形队列
template<typename T, size_t N>
class SPSCQueue {
    std::array<T, N> buffer;
    std::atomic<size_t> head{0};  // 消费者读
    std::atomic<size_t> tail{0};  // 生产者写

public:
    bool push(const T& item) {
        size_t t = tail.load(std::memory_order_relaxed);
        size_t next = (t + 1) % N;
        if (next == head.load(std::memory_order_acquire)) // 满了
            return false;
        buffer[t] = item;
        tail.store(next, std::memory_order_release);  // 发布
        return true;
    }

    bool pop(T& item) {
        size_t h = head.load(std::memory_order_relaxed);
        if (h == tail.load(std::memory_order_acquire))  // 空了
            return false;
        item = buffer[h];
        head.store((h + 1) % N, std::memory_order_release);
        return true;
    }
};

// 为什么 SPSC 最简单？
// 只有一个线程写 tail，一个线程写 head
// 不需要 CAS，只需要 acquire/release
// MPMC（多生产者多消费者）复杂得多，需要 CAS 循环
```

------

## 第六部分：内存屏障与 CPU 缓存

### Q20：什么是内存屏障（Memory Barrier / Fence）？

**记忆点：内存屏障是 CPU 指令，强制在屏障之前的内存操作完成后，才执行屏障之后的操作。相当于给 CPU 的重排序划一条"不可逾越的线"。**

```
CPU 内存操作类型：
  Load（读）和 Store（写）

四种重排序可能：
  LoadLoad   重排序 → 两次读之间可能乱序
  LoadStore  重排序 → 读之后的写可能先执行
  StoreLoad  重排序 → 写之后的读可能先执行（最常见！）
  StoreStore 重排序 → 两次写之间可能乱序

内存屏障类型：
  LoadLoad  屏障 → 屏障前的读 一定在 屏障后的读 之前完成
  StoreStore 屏障 → 屏障前的写 一定在 屏障后的写 之前完成
  LoadStore 屏障 → 屏障前的读 一定在 屏障后的写 之前完成
  全屏障 (Full Fence) → 以上全部保证
```

```cpp
// C++ 的独立屏障
std::atomic_thread_fence(std::memory_order_release);  // Store 屏障
std::atomic_thread_fence(std::memory_order_acquire);  // Load 屏障
std::atomic_thread_fence(std::memory_order_seq_cst);  // 全屏障

// 通常不直接用 fence，而是用原子操作的 memory_order 参数
// fence 是更底层的控制方式
```

### Q21：CPU 缓存与 False Sharing 问题？

**记忆点：CPU 缓存以缓存行（通常 64 字节）为单位操作。两个不相关的变量如果恰好在同一个缓存行中，两个 CPU 核心分别修改它们时会互相导致缓存行失效，严重影响性能。**

```
False Sharing 示意：

一个缓存行 (64 字节)
┌──────────────────────────────────────┐
│  counter_a (4字节)  counter_b (4字节)  ...padding...  │
└──────────────────────────────────────┘
     ↑                    ↑
   CPU 核心 1 修改      CPU 核心 2 修改

核心 1 修改 counter_a → 整个缓存行在核心 2 中失效
核心 2 修改 counter_b → 整个缓存行在核心 1 中失效
两个不相关的操作互相拖累！
```

```cpp
// ❌ 有 False Sharing
struct Counters {
    std::atomic<int> a;  // 和 b 可能在同一个缓存行
    std::atomic<int> b;
};

// ✅ 用 alignas 避免 False Sharing
struct Counters {
    alignas(64) std::atomic<int> a;  // 独占一个缓存行
    alignas(64) std::atomic<int> b;  // 独占一个缓存行
};

// C++17：std::hardware_destructive_interference_size
// 这个常量等于缓存行大小（通常 64）
struct Counters {
    alignas(std::hardware_destructive_interference_size) std::atomic<int> a;
    alignas(std::hardware_destructive_interference_size) std::atomic<int> b;
};
```

### Q22：volatile 和 atomic 的区别？

**记忆点：volatile 只禁止编译器优化（不缓存到寄存器），不提供原子性和内存序保证。atomic 才是多线程安全的。在 C++ 中，volatile 不能用于多线程同步（这和 Java 不同！）。**

```
              volatile                std::atomic

编译器优化     禁止（每次都从内存读写）   禁止
原子性         ❌ 不保证                  ✅ 保证
内存序         ❌ 不保证                  ✅ 可指定
用途           硬件寄存器映射             多线程同步
               信号处理                  无锁编程
               防止编译器优化掉读写

// ❌ volatile 不能用于多线程
volatile bool flag = false;
// 线程 A: flag = true;
// 线程 B: while (!flag);  // 不保证看到线程 A 的写入！

// ✅ 正确做法
std::atomic<bool> flag{false};
// 线程 A: flag.store(true);
// 线程 B: while (!flag.load());  // 保证看到
```

------

## 第七部分：线程池与异步模式

### Q23：线程池的设计要点？

**记忆点：预创建 N 个线程 + 一个任务队列 + 条件变量通知。线程从队列取任务执行，没任务就睡眠。线程数通常 = CPU 核心数（计算密集型）或更多（IO 密集型）。**

```cpp
class ThreadPool {
    std::vector<std::thread> workers;
    std::queue<std::function<void()>> tasks;
    std::mutex mtx;
    std::condition_variable cv;
    bool stop = false;

public:
    ThreadPool(size_t numThreads) {
        for (size_t i = 0; i < numThreads; i++) {
            workers.emplace_back([this]() {
                while (true) {
                    std::function<void()> task;
                    {
                        std::unique_lock<std::mutex> lock(mtx);
                        cv.wait(lock, [this]{ return stop || !tasks.empty(); });
                        if (stop && tasks.empty()) return;
                        task = std::move(tasks.front());
                        tasks.pop();
                    }
                    task();  // 在锁外面执行任务
                }
            });
        }
    }

    void submit(std::function<void()> task) {
        {
            std::lock_guard<std::mutex> lock(mtx);
            tasks.push(std::move(task));
        }
        cv.notify_one();
    }

    ~ThreadPool() {
        { std::lock_guard<std::mutex> lock(mtx); stop = true; }
        cv.notify_all();
        for (auto& w : workers) w.join();
    }
};
```

```
线程数量选择：

计算密集型：线程数 = CPU 核心数
  计算不涉及等待，更多线程只会增加切换开销

IO 密集型：线程数 = CPU 核心数 × (1 + IO等待时间/计算时间)
  线程大部分时间在等 IO，可以多开

混合型：拆分为计算池和 IO 池
```

### Q24：Windows 和 Linux 的线程 API 对照？

```
操作              Linux (POSIX)              Windows API              C++ 标准

创建线程          pthread_create             CreateThread             std::thread
等待结束          pthread_join               WaitForSingleObject      t.join()
分离线程          pthread_detach             CloseHandle 后不等       t.detach()
线程 ID           pthread_self()             GetCurrentThreadId()     std::this_thread::get_id()
睡眠              sleep/usleep/nanosleep     Sleep(ms)                std::this_thread::sleep_for
让出 CPU          sched_yield                SwitchToThread           std::this_thread::yield
线程本地存储      __thread / thread_local    TlsAlloc + TlsSetValue   thread_local
设置 CPU 亲和性   pthread_setaffinity_np     SetThreadAffinityMask    无标准 API
线程优先级        pthread_setschedparam      SetThreadPriority        无标准 API
```

------

## 第八部分：经典并发问题

### Q25：生产者-消费者问题？

**记忆点：有界缓冲区 + 两个条件变量（not_full 和 not_empty） + 一把互斥锁。生产者满了就等 not_full，消费者空了就等 not_empty。**

```cpp
template<typename T, size_t N>
class BoundedQueue {
    std::array<T, N> buffer;
    size_t head = 0, tail = 0, count = 0;
    std::mutex mtx;
    std::condition_variable not_full, not_empty;

public:
    void put(T item) {
        std::unique_lock<std::mutex> lock(mtx);
        not_full.wait(lock, [this]{ return count < N; });
        buffer[tail] = std::move(item);
        tail = (tail + 1) % N;
        count++;
        not_empty.notify_one();
    }

    T take() {
        std::unique_lock<std::mutex> lock(mtx);
        not_empty.wait(lock, [this]{ return count > 0; });
        T item = std::move(buffer[head]);
        head = (head + 1) % N;
        count--;
        not_full.notify_one();
        return item;
    }
};
```

### Q26：读者-写者问题？

**记忆点：多个读者可同时读，写者独占。核心难点是写饥饿（持续有读者进入，写者永远等不到）。解决方案：写优先策略（写者请求后，新读者也排队）。C++17 的 shared_mutex 已经封装好了。**

### Q27：哲学家就餐问题？

**记忆点：5 个哲学家围圆桌，每人两侧各一根筷子，必须同时拿起左右两根才能吃。如果都先拿左边再等右边 → 死锁。解决方案：①固定顺序（编号小的筷子先拿） ②最多 4 人同时尝试 ③资源分级。**

------

## 速查表

```
锁类型      互斥锁(通用) 自旋锁(极短临界区) 读写锁(读多写少) 递归锁(可重入)

同步原语    条件变量(等待条件) 信号量(计数限流) 屏障(集合点)

原子操作    CAS(无锁基石) ABA问题(加版本号) weak vs strong(循环用weak)

内存序      relaxed(只原子性) acquire/release(配对同步) seq_cst(最安全默认)

内存屏障    阻止重排序 | x86天然acquire/release | ARM需要显式屏障

False Sharing  alignas(64) 让变量独占缓存行

volatile    只防编译器优化 ≠ 原子操作 ≠ 多线程安全

线程池      N线程 + 任务队列 + 条件变量 | 计算密集N=核心数 | IO密集可多开

Windows     CRITICAL_SECTION(快/同进程) Mutex(慢/跨进程) IOCP(异步IO)
Linux       pthread_mutex(标准) futex(快速路径) epoll(IO多路复用)
C++标准     std::mutex / atomic / thread / condition_variable / shared_mutex
```

------

> 本文与上篇 [网络编程与进程间通信面试题](/techlearn/posts/network-ipc-interview/) 构成完整的系统编程面试准备系列。建议配合 [现代 C++ 面试题](/techlearn/posts/modern-cpp-interview/) 一起复习，覆盖面更全。
