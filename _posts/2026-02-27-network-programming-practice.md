---
title: C++ 网络编程练手代码 —— 5 个可编译运行的服务器实战
description: 覆盖TCP Socket基础封装、epoll事件循环echo-server、简易Reactor框架、TCP粘包处理(长度前缀编解码)、定时器管理(最小堆)，每个练习约100行可直接编译运行(Linux)
date: 2026-02-27
categories: [网络编程]
tags: [c++, 练手代码, 网络编程, epoll, Reactor, TCP, socket, 定时器, 事件驱动]
---

网络编程是后端 C++ 面试的**核心战场**——能手写 epoll echo server、实现简易 Reactor、处理 TCP 粘包，展示的是系统编程的实战能力。这 5 个练习覆盖从裸 Socket 到框架设计的完整链路。

> **注意**：本文代码需要在 **Linux** 环境下编译运行（使用 epoll/socket API）。

> 📌 关联阅读：[高性能网络编程面试题](/posts/high-performance-network-interview) · [Linux 系统编程面试题](/posts/linux-system-programming-interview) · [并发编程练手代码](/posts/concurrency-practice)

------

## 练习1：TCP Socket 基础封装 (RAII)

**考点**：socket/bind/listen/accept/connect、RAII 封装、非阻塞设置

```cpp
// socket_raii.cpp
// g++ -std=c++17 -o socket_raii socket_raii.cpp
#include <iostream>
#include <string>
#include <cstring>
#include <stdexcept>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <fcntl.h>

// RAII Socket 封装
class Socket {
    int fd_ = -1;
public:
    Socket() : fd_(::socket(AF_INET, SOCK_STREAM, 0)) {
        if (fd_ < 0) throw std::runtime_error("socket() failed");
    }
    explicit Socket(int fd) : fd_(fd) {}
    ~Socket() { if (fd_ >= 0) ::close(fd_); }

    // 移动语义
    Socket(Socket&& o) noexcept : fd_(o.fd_) { o.fd_ = -1; }
    Socket& operator=(Socket&& o) noexcept {
        if (this != &o) { if (fd_ >= 0) ::close(fd_); fd_ = o.fd_; o.fd_ = -1; }
        return *this;
    }
    Socket(const Socket&) = delete;

    int fd() const { return fd_; }

    void set_reuse_addr() {
        int opt = 1;
        ::setsockopt(fd_, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    }

    void set_nonblock() {
        int flags = ::fcntl(fd_, F_GETFL);
        ::fcntl(fd_, F_SETFL, flags | O_NONBLOCK);
    }

    void bind(uint16_t port) {
        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_port = htons(port);
        addr.sin_addr.s_addr = INADDR_ANY;
        if (::bind(fd_, (sockaddr*)&addr, sizeof(addr)) < 0)
            throw std::runtime_error("bind() failed: " + std::string(strerror(errno)));
    }

    void listen(int backlog = 128) {
        if (::listen(fd_, backlog) < 0)
            throw std::runtime_error("listen() failed");
    }

    Socket accept() {
        sockaddr_in client_addr{};
        socklen_t len = sizeof(client_addr);
        int client_fd = ::accept(fd_, (sockaddr*)&client_addr, &len);
        if (client_fd < 0) throw std::runtime_error("accept() failed");
        std::cout << "  new connection from "
                  << inet_ntoa(client_addr.sin_addr) << ":"
                  << ntohs(client_addr.sin_port) << "\n";
        return Socket(client_fd);
    }

    ssize_t send(const void* data, size_t len) {
        return ::send(fd_, data, len, 0);
    }

    ssize_t recv(void* buf, size_t len) {
        return ::recv(fd_, buf, len, 0);
    }
};

int main() {
    std::cout << "=== TCP Echo Server (single client) ===\n";

    Socket server;
    server.set_reuse_addr();
    server.bind(9999);
    server.listen();
    std::cout << "  listening on :9999\n";
    std::cout << "  (test with: echo hello | nc localhost 9999)\n";

    auto client = server.accept();

    char buf[1024];
    ssize_t n = client.recv(buf, sizeof(buf));
    if (n > 0) {
        buf[n] = '\0';
        std::cout << "  received: " << buf;
        client.send(buf, n);  // echo back
    }

    std::cout << "  connection closed\n";
}
```

**关键点**：
- RAII 封装确保 fd 不会泄露（析构自动 close）
- 移动语义转移 fd 所有权（禁止拷贝）
- `SO_REUSEADDR` 避免 TIME_WAIT 导致 bind 失败
- `O_NONBLOCK` 是 epoll ET 模式的前提

---

## 练习2：epoll Echo Server（多连接）

**考点**：`epoll_create`/`epoll_ctl`/`epoll_wait`、ET 模式、非阻塞 IO

```cpp
// epoll_echo.cpp
// g++ -std=c++17 -o epoll_echo epoll_echo.cpp
#include <iostream>
#include <unordered_map>
#include <cstring>
#include <unistd.h>
#include <sys/socket.h>
#include <sys/epoll.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <fcntl.h>
#include <errno.h>

void set_nonblock(int fd) {
    int flags = fcntl(fd, F_GETFL);
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

int main() {
    // 1. 创建监听 socket
    int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(9999);
    addr.sin_addr.s_addr = INADDR_ANY;
    bind(listen_fd, (sockaddr*)&addr, sizeof(addr));
    listen(listen_fd, 128);
    set_nonblock(listen_fd);

    // 2. 创建 epoll
    int epoll_fd = epoll_create1(0);

    epoll_event ev{};
    ev.events = EPOLLIN | EPOLLET;  // ET 模式
    ev.data.fd = listen_fd;
    epoll_ctl(epoll_fd, EPOLL_CTL_ADD, listen_fd, &ev);

    std::cout << "epoll echo server on :9999 (ET mode)\n";
    std::cout << "(test: nc localhost 9999)\n\n";

    epoll_event events[64];
    char buf[4096];

    while (true) {
        int n = epoll_wait(epoll_fd, events, 64, -1);
        for (int i = 0; i < n; ++i) {
            int fd = events[i].data.fd;

            if (fd == listen_fd) {
                // 接受新连接（ET 模式需循环 accept）
                while (true) {
                    sockaddr_in client_addr{};
                    socklen_t len = sizeof(client_addr);
                    int client_fd = accept(listen_fd, (sockaddr*)&client_addr, &len);
                    if (client_fd < 0) {
                        if (errno == EAGAIN || errno == EWOULDBLOCK) break;
                        perror("accept");
                        break;
                    }
                    set_nonblock(client_fd);
                    ev.events = EPOLLIN | EPOLLET;
                    ev.data.fd = client_fd;
                    epoll_ctl(epoll_fd, EPOLL_CTL_ADD, client_fd, &ev);
                    std::cout << "[+] client fd=" << client_fd << "\n";
                }
            } else if (events[i].events & EPOLLIN) {
                // 读数据（ET 模式需循环读到 EAGAIN）
                while (true) {
                    ssize_t bytes = recv(fd, buf, sizeof(buf), 0);
                    if (bytes > 0) {
                        send(fd, buf, bytes, 0);  // echo back
                    } else if (bytes == 0) {
                        std::cout << "[-] client fd=" << fd << " disconnected\n";
                        epoll_ctl(epoll_fd, EPOLL_CTL_DEL, fd, nullptr);
                        close(fd);
                        break;
                    } else {
                        if (errno == EAGAIN || errno == EWOULDBLOCK) break;
                        perror("recv");
                        close(fd);
                        break;
                    }
                }
            }
        }
    }

    close(listen_fd);
    close(epoll_fd);
}
```

**关键点**：
- ET 模式**必须**循环读/写到 `EAGAIN`，否则事件丢失
- ET 模式**必须**使用非阻塞 fd
- `epoll_wait` 只返回就绪的 fd，效率远高于 `select/poll`
- 这是最简的多连接服务器，实际框架会加上 Buffer 管理和回调分发

---

## 练习3：TCP 粘包处理（长度前缀编解码）

**考点**：应用层协议设计、消息帧编解码、缓冲区管理

```cpp
// codec.cpp
// g++ -std=c++17 -o codec codec.cpp
// 这是编解码库，配合 echo server 使用
#include <iostream>
#include <vector>
#include <string>
#include <cstring>
#include <cassert>
#include <optional>

// ============ 长度前缀编解码器 ============
// 协议格式：[4字节长度(网络序)][消息体]
class LengthPrefixCodec {
public:
    // 编码：消息 → 帧
    static std::vector<char> encode(const std::string& msg) {
        uint32_t len = htonl(static_cast<uint32_t>(msg.size()));
        std::vector<char> frame(4 + msg.size());
        std::memcpy(frame.data(), &len, 4);
        std::memcpy(frame.data() + 4, msg.data(), msg.size());
        return frame;
    }

    // 解码：从缓冲区尝试提取一个完整消息
    static std::optional<std::string> decode(std::vector<char>& buffer) {
        if (buffer.size() < 4) return std::nullopt;  // 不够读长度

        uint32_t net_len;
        std::memcpy(&net_len, buffer.data(), 4);
        uint32_t msg_len = ntohl(net_len);

        if (msg_len > 1024 * 1024) {
            throw std::runtime_error("message too large: " + std::to_string(msg_len));
        }

        if (buffer.size() < 4 + msg_len) return std::nullopt;  // 不够读消息体

        // 提取消息
        std::string msg(buffer.data() + 4, msg_len);

        // 从缓冲区移除已消费的数据
        buffer.erase(buffer.begin(), buffer.begin() + 4 + msg_len);

        return msg;
    }

private:
    // 主机序 ↔ 网络序（大端）
    static uint32_t htonl(uint32_t val) {
        uint8_t bytes[4];
        bytes[0] = (val >> 24) & 0xFF;
        bytes[1] = (val >> 16) & 0xFF;
        bytes[2] = (val >> 8) & 0xFF;
        bytes[3] = val & 0xFF;
        uint32_t result;
        std::memcpy(&result, bytes, 4);
        return result;
    }
    static uint32_t ntohl(uint32_t val) { return htonl(val); }
};

// ============ 接收缓冲区（模拟网络 IO）============
class RecvBuffer {
    std::vector<char> data_;
public:
    // 模拟从 socket 接收数据（可能不完整）
    void append(const char* data, size_t len) {
        data_.insert(data_.end(), data, data + len);
    }

    // 尝试解码所有完整消息
    std::vector<std::string> decode_all() {
        std::vector<std::string> messages;
        while (auto msg = LengthPrefixCodec::decode(data_)) {
            messages.push_back(std::move(*msg));
        }
        return messages;
    }

    size_t pending_bytes() const { return data_.size(); }
};

int main() {
    std::cout << "=== 1. 编码解码测试 ===\n";
    {
        auto frame = LengthPrefixCodec::encode("Hello, World!");
        std::cout << "  encoded frame size: " << frame.size()
                  << " (4 + " << frame.size() - 4 << ")\n";

        std::vector<char> buf(frame.begin(), frame.end());
        auto msg = LengthPrefixCodec::decode(buf);
        assert(msg.has_value());
        std::cout << "  decoded: \"" << *msg << "\"\n";
        assert(buf.empty());  // 缓冲区已清空
    }

    std::cout << "\n=== 2. 粘包模拟 ===\n";
    {
        RecvBuffer recv_buf;

        // 编码 3 条消息
        auto f1 = LengthPrefixCodec::encode("msg1");
        auto f2 = LengthPrefixCodec::encode("msg2");
        auto f3 = LengthPrefixCodec::encode("message three");

        // 模拟粘包：3条消息一次性到达
        std::vector<char> all;
        all.insert(all.end(), f1.begin(), f1.end());
        all.insert(all.end(), f2.begin(), f2.end());
        all.insert(all.end(), f3.begin(), f3.end());

        recv_buf.append(all.data(), all.size());

        auto msgs = recv_buf.decode_all();
        std::cout << "  received " << msgs.size() << " messages from 1 recv:\n";
        for (const auto& m : msgs) std::cout << "    \"" << m << "\"\n";
    }

    std::cout << "\n=== 3. 拆包模拟 ===\n";
    {
        RecvBuffer recv_buf;
        auto frame = LengthPrefixCodec::encode("Hello, TCP splitting!");

        // 模拟拆包：消息分 3 次到达
        size_t part1 = 2;   // 只有长度字段的一半
        size_t part2 = 6;   // 长度字段剩余 + 消息体前几字节
        size_t part3 = frame.size() - part1 - part2;

        recv_buf.append(frame.data(), part1);
        auto msgs = recv_buf.decode_all();
        std::cout << "  after part1 (" << part1 << "b): " << msgs.size() << " msg, "
                  << recv_buf.pending_bytes() << " pending\n";

        recv_buf.append(frame.data() + part1, part2);
        msgs = recv_buf.decode_all();
        std::cout << "  after part2 (" << part2 << "b): " << msgs.size() << " msg, "
                  << recv_buf.pending_bytes() << " pending\n";

        recv_buf.append(frame.data() + part1 + part2, part3);
        msgs = recv_buf.decode_all();
        std::cout << "  after part3 (" << part3 << "b): " << msgs.size() << " msg\n";
        if (!msgs.empty()) std::cout << "    \"" << msgs[0] << "\"\n";
    }

    std::cout << "\nAll tests passed!\n";
}
```

**关键点**：
- 长度前缀是最通用的粘包解决方案（Protobuf、gRPC 都用）
- `RecvBuffer` 缓存不完整的数据，等凑齐后再解码
- `decode_all()` 循环解码处理粘包（一次 recv 可能包含多条消息）
- 消息长度检查防止恶意大包导致 OOM

---

## 练习4：最小堆定时器

**考点**：`std::priority_queue`、定时器管理、超时检测

```cpp
// timer_heap.cpp
// g++ -std=c++17 -o timer_heap timer_heap.cpp
#include <iostream>
#include <queue>
#include <functional>
#include <chrono>
#include <thread>
#include <vector>
#include <cstdint>

using Clock = std::chrono::steady_clock;
using TimePoint = Clock::time_point;
using Duration = std::chrono::milliseconds;

struct Timer {
    uint64_t id;
    TimePoint expire;
    std::function<void()> callback;
    Duration interval;  // 0 = 一次性，>0 = 周期性

    bool operator>(const Timer& o) const {
        return expire > o.expire;  // 最小堆
    }
};

class TimerManager {
    std::priority_queue<Timer, std::vector<Timer>, std::greater<>> heap_;
    uint64_t next_id_ = 1;
public:
    // 添加一次性定时器
    uint64_t add_timer(Duration delay, std::function<void()> cb) {
        uint64_t id = next_id_++;
        heap_.push({id, Clock::now() + delay, std::move(cb), Duration::zero()});
        return id;
    }

    // 添加周期性定时器
    uint64_t add_periodic(Duration interval, std::function<void()> cb) {
        uint64_t id = next_id_++;
        heap_.push({id, Clock::now() + interval, cb, interval});
        return id;
    }

    // 获取最近的超时时间（用于 epoll_wait 的 timeout 参数）
    int next_timeout_ms() const {
        if (heap_.empty()) return -1;  // 无定时器，永久等待
        auto diff = std::chrono::duration_cast<Duration>(
            heap_.top().expire - Clock::now());
        return std::max(0, static_cast<int>(diff.count()));
    }

    // 处理所有到期的定时器
    int tick() {
        int fired = 0;
        auto now = Clock::now();
        while (!heap_.empty() && heap_.top().expire <= now) {
            Timer t = heap_.top();
            heap_.pop();
            t.callback();
            ++fired;

            // 周期性定时器重新加入
            if (t.interval > Duration::zero()) {
                t.expire = now + t.interval;
                heap_.push(std::move(t));
            }
        }
        return fired;
    }

    size_t size() const { return heap_.size(); }
};

int main() {
    std::cout << "=== 定时器管理器 ===\n";

    TimerManager mgr;

    // 添加定时器
    mgr.add_timer(Duration(100), [] {
        std::cout << "  [100ms] one-shot timer fired!\n";
    });

    mgr.add_timer(Duration(200), [] {
        std::cout << "  [200ms] another one-shot fired!\n";
    });

    int periodic_count = 0;
    mgr.add_periodic(Duration(150), [&periodic_count] {
        ++periodic_count;
        std::cout << "  [150ms periodic] tick #" << periodic_count << "\n";
    });

    // 事件循环模拟
    auto start = Clock::now();
    while (true) {
        int timeout = mgr.next_timeout_ms();
        if (timeout < 0 || periodic_count >= 5) break;

        // 模拟 epoll_wait(epoll_fd, events, max, timeout)
        std::this_thread::sleep_for(Duration(timeout));

        int fired = mgr.tick();
        auto elapsed = std::chrono::duration_cast<Duration>(Clock::now() - start).count();
        if (fired > 0) {
            std::cout << "  --- " << elapsed << "ms elapsed, "
                      << fired << " timers fired, "
                      << mgr.size() << " remaining ---\n";
        }
    }

    std::cout << "\nDone!\n";
}
```

**关键点**：
- 最小堆保证 `next_timeout_ms()` 是 O(1)，`tick()` 是 O(k log n)
- `next_timeout_ms()` 用于 `epoll_wait` 的超时参数，精确控制唤醒时间
- 周期性定时器在触发后重新加入堆中
- 实际框架（muduo/libevent）都用类似的定时器堆设计

---

## 练习5：简易 Reactor 框架

**考点**：事件分发、Channel 封装、EventLoop 主循环

```cpp
// mini_reactor.cpp
// g++ -std=c++17 -o mini_reactor mini_reactor.cpp
#include <iostream>
#include <functional>
#include <unordered_map>
#include <unistd.h>
#include <sys/epoll.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <fcntl.h>
#include <cstring>

// ============ Channel：fd 的事件处理器 ============
class Channel {
public:
    using Callback = std::function<void()>;
    int fd;
    Callback on_read;
    Callback on_write;
    Callback on_close;
    uint32_t events = 0;  // 当前监控的事件
};

// ============ EventLoop：事件循环 ============
class EventLoop {
    int epoll_fd_;
    bool running_ = true;
    std::unordered_map<int, Channel*> channels_;
    epoll_event events_[64];
public:
    EventLoop() : epoll_fd_(epoll_create1(0)) {}
    ~EventLoop() { close(epoll_fd_); }

    void add_channel(Channel* ch, uint32_t events) {
        ch->events = events;
        channels_[ch->fd] = ch;
        epoll_event ev{};
        ev.events = events;
        ev.data.fd = ch->fd;
        epoll_ctl(epoll_fd_, EPOLL_CTL_ADD, ch->fd, &ev);
    }

    void remove_channel(int fd) {
        epoll_ctl(epoll_fd_, EPOLL_CTL_DEL, fd, nullptr);
        channels_.erase(fd);
    }

    void loop() {
        while (running_) {
            int n = epoll_wait(epoll_fd_, events_, 64, 1000);
            for (int i = 0; i < n; ++i) {
                int fd = events_[i].data.fd;
                auto it = channels_.find(fd);
                if (it == channels_.end()) continue;
                auto* ch = it->second;

                if (events_[i].events & (EPOLLHUP | EPOLLERR)) {
                    if (ch->on_close) ch->on_close();
                } else if (events_[i].events & EPOLLIN) {
                    if (ch->on_read) ch->on_read();
                } else if (events_[i].events & EPOLLOUT) {
                    if (ch->on_write) ch->on_write();
                }
            }
        }
    }

    void stop() { running_ = false; }
};

void set_nonblock(int fd) {
    fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) | O_NONBLOCK);
}

int main() {
    // 创建监听 socket
    int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(9999);
    addr.sin_addr.s_addr = INADDR_ANY;
    bind(listen_fd, (sockaddr*)&addr, sizeof(addr));
    listen(listen_fd, 128);
    set_nonblock(listen_fd);

    EventLoop loop;

    // 监听 channel
    Channel listen_ch;
    listen_ch.fd = listen_fd;
    listen_ch.on_read = [&] {
        while (true) {
            sockaddr_in client_addr{};
            socklen_t len = sizeof(client_addr);
            int client_fd = accept(listen_fd, (sockaddr*)&client_addr, &len);
            if (client_fd < 0) break;
            set_nonblock(client_fd);

            // 为新连接创建 channel
            auto* ch = new Channel();
            ch->fd = client_fd;
            ch->on_read = [ch, &loop] {
                char buf[4096];
                while (true) {
                    ssize_t n = recv(ch->fd, buf, sizeof(buf), 0);
                    if (n > 0) {
                        send(ch->fd, buf, n, 0);  // echo
                    } else if (n == 0) {
                        std::cout << "[-] fd=" << ch->fd << "\n";
                        loop.remove_channel(ch->fd);
                        close(ch->fd);
                        delete ch;
                        break;
                    } else {
                        if (errno == EAGAIN) break;
                        loop.remove_channel(ch->fd);
                        close(ch->fd);
                        delete ch;
                        break;
                    }
                }
            };

            loop.add_channel(ch, EPOLLIN | EPOLLET);
            std::cout << "[+] fd=" << client_fd << "\n";
        }
    };

    loop.add_channel(&listen_ch, EPOLLIN | EPOLLET);

    std::cout << "Mini Reactor echo server on :9999\n";
    std::cout << "(test: nc localhost 9999)\n";
    loop.loop();

    close(listen_fd);
}
```

**关键点**：
- Channel 封装 fd + 回调函数，是 Reactor 的核心抽象
- EventLoop 负责 epoll 事件分发，将事件映射到 Channel 的回调
- 这就是 muduo/libevent/Netty 的核心设计思想的简化版
- 实际框架会加上：Buffer 管理、定时器、多线程 EventLoop 池
