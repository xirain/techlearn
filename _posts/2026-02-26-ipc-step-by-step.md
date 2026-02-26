---
title: 进程间通信实战 —— 从管道到共享内存，一步一步写出来
description: 用一个"跨进程计算服务"的实际场景，TDD 驱动，从匿名管道、命名管道、共享内存到 Unix Domain Socket 逐步演进，每种 IPC 都写出可运行的代码并对比性能
date: 2026-02-26
categories: [编程语言]
tags: [c++, ipc, 进程间通信, 管道, 共享内存, socket, unix domain socket, tdd, linux, windows]
---

[面试篇](/techlearn/posts/network-ipc-interview/) 讲了 IPC 的理论——管道是什么、共享内存为什么快、RPC 的分层架构。但你可能还是觉得"道理我都懂，就是写不出来"。

这篇文章用一个**具体项目**贯穿始终：做一个跨进程的"计算服务"，客户端发请求，服务端算结果。从最简单的管道开始，一步步换成更快、更灵活的 IPC 方式，每一步都先写测试再写代码。

------

## 全文路线图

```
目标：进程 A（客户端）发送 "ADD 10 20"
     进程 B（服务端）返回 "30"

阶段 0：定义通信协议 + 测试序列化
  │
阶段 1：匿名管道（pipe）—— 最简单，但只能父子进程
  │
阶段 2：命名管道（FIFO / Named Pipe）—— 任意进程通信
  │
阶段 3：共享内存（shm）—— 最快，零拷贝
  │
阶段 4：Unix Domain Socket —— 最灵活，像网络但快
  │
阶段 5：基准测试对比
  │
总结：选哪个取决于你的场景
```

------

## 阶段 0：定义通信协议

不管用什么 IPC 方式传输，数据格式是通用的。先把协议定好、测好。

### 0.1 协议设计

```
我们的协议很简单：

请求格式：
  [4字节: 消息体长度][消息体: "OP arg1 arg2"]
  例如："\x09\x00\x00\x00ADD 10 20"
        长度 9         操作 参数1 参数2

响应格式：
  [4字节: 消息体长度][消息体: "OK result" 或 "ERR message"]
  例如："\x05\x00\x00\x00OK 30"

为什么要长度前缀？
  → TCP/管道是字节流，没有消息边界
  → 没有长度前缀就会粘包
  → 这是最常用的解决方案（参见面试篇 Q5）
```

### 0.2 先写测试（RED）

```cpp
// tests/test_protocol.cpp
#include <gtest/gtest.h>
#include "protocol.h"

// ─── 请求序列化/反序列化 ───

TEST(ProtocolTest, SerializeRequest) {
    Request req{Operation::ADD, 10, 20};
    auto bytes = serialize(req);

    // 前 4 字节是长度
    uint32_t len;
    std::memcpy(&len, bytes.data(), sizeof(len));
    EXPECT_EQ(len, bytes.size() - sizeof(uint32_t));

    // 消息体内容
    std::string body(bytes.begin() + sizeof(uint32_t), bytes.end());
    EXPECT_EQ(body, "ADD 10 20");
}

TEST(ProtocolTest, DeserializeRequest) {
    Request original{Operation::ADD, 10, 20};
    auto bytes = serialize(original);

    auto parsed = deserializeRequest(bytes);
    ASSERT_TRUE(parsed.has_value());
    EXPECT_EQ(parsed->op, Operation::ADD);
    EXPECT_EQ(parsed->arg1, 10);
    EXPECT_EQ(parsed->arg2, 20);
}

TEST(ProtocolTest, AllOperations) {
    std::vector<std::pair<Operation, std::string>> cases = {
        {Operation::ADD, "ADD"},
        {Operation::SUB, "SUB"},
        {Operation::MUL, "MUL"},
        {Operation::DIV, "DIV"},
    };

    for (auto& [op, name] : cases) {
        Request req{op, 100, 3};
        auto bytes = serialize(req);
        auto parsed = deserializeRequest(bytes);
        ASSERT_TRUE(parsed.has_value()) << "Failed for " << name;
        EXPECT_EQ(parsed->op, op);
        EXPECT_EQ(parsed->arg1, 100);
        EXPECT_EQ(parsed->arg2, 3);
    }
}

TEST(ProtocolTest, DeserializeInvalidData) {
    std::vector<uint8_t> garbage = {0x00, 0x00, 0x00, 0x03, 'X', 'Y', 'Z'};
    auto parsed = deserializeRequest(garbage);
    EXPECT_FALSE(parsed.has_value());
}

// ─── 响应序列化/反序列化 ───

TEST(ProtocolTest, SerializeSuccessResponse) {
    Response resp{true, 42, ""};
    auto bytes = serialize(resp);

    std::string body(bytes.begin() + sizeof(uint32_t), bytes.end());
    EXPECT_EQ(body, "OK 42");
}

TEST(ProtocolTest, SerializeErrorResponse) {
    Response resp{false, 0, "Division by zero"};
    auto bytes = serialize(resp);

    std::string body(bytes.begin() + sizeof(uint32_t), bytes.end());
    EXPECT_EQ(body, "ERR Division by zero");
}

TEST(ProtocolTest, DeserializeResponse) {
    Response original{true, 42, ""};
    auto bytes = serialize(original);

    auto parsed = deserializeResponse(bytes);
    ASSERT_TRUE(parsed.has_value());
    EXPECT_TRUE(parsed->success);
    EXPECT_EQ(parsed->result, 42);
}

// ─── 消息读写辅助 ───

TEST(ProtocolTest, WriteAndReadMessage) {
    // 模拟一个管道/Socket：写入消息，再读出来
    std::vector<uint8_t> buffer;

    Request req{Operation::MUL, 7, 8};
    auto msg = serialize(req);

    // "写入"到 buffer
    buffer.insert(buffer.end(), msg.begin(), msg.end());

    // "读出"：先读 4 字节长度，再读消息体
    uint32_t len;
    std::memcpy(&len, buffer.data(), sizeof(len));
    EXPECT_EQ(len, 7);  // "MUL 7 8" = 7 字节

    std::vector<uint8_t> full_msg(buffer.begin(), buffer.begin() + sizeof(len) + len);
    auto parsed = deserializeRequest(full_msg);
    ASSERT_TRUE(parsed.has_value());
    EXPECT_EQ(parsed->op, Operation::MUL);
    EXPECT_EQ(parsed->arg1, 7);
    EXPECT_EQ(parsed->arg2, 8);
}

// ─── 计算逻辑 ───

TEST(ProtocolTest, ExecuteAdd) {
    Request req{Operation::ADD, 10, 20};
    auto resp = execute(req);
    EXPECT_TRUE(resp.success);
    EXPECT_EQ(resp.result, 30);
}

TEST(ProtocolTest, ExecuteSub) {
    Request req{Operation::SUB, 50, 30};
    auto resp = execute(req);
    EXPECT_TRUE(resp.success);
    EXPECT_EQ(resp.result, 20);
}

TEST(ProtocolTest, ExecuteMul) {
    Request req{Operation::MUL, 7, 8};
    auto resp = execute(req);
    EXPECT_TRUE(resp.success);
    EXPECT_EQ(resp.result, 56);
}

TEST(ProtocolTest, ExecuteDivByZero) {
    Request req{Operation::DIV, 10, 0};
    auto resp = execute(req);
    EXPECT_FALSE(resp.success);
}

TEST(ProtocolTest, ExecuteDiv) {
    Request req{Operation::DIV, 100, 4};
    auto resp = execute(req);
    EXPECT_TRUE(resp.success);
    EXPECT_EQ(resp.result, 25);
}
```

### 0.3 实现协议（GREEN）

```cpp
// include/protocol.h
#pragma once
#include <cstdint>
#include <cstring>
#include <optional>
#include <sstream>
#include <string>
#include <vector>

enum class Operation { ADD, SUB, MUL, DIV };

struct Request {
    Operation op;
    int64_t arg1;
    int64_t arg2;
};

struct Response {
    bool success;
    int64_t result;
    std::string error;
};

// ─── 操作名转换 ───

inline std::string opToString(Operation op) {
    switch (op) {
        case Operation::ADD: return "ADD";
        case Operation::SUB: return "SUB";
        case Operation::MUL: return "MUL";
        case Operation::DIV: return "DIV";
    }
    return "UNKNOWN";
}

inline std::optional<Operation> stringToOp(const std::string& s) {
    if (s == "ADD") return Operation::ADD;
    if (s == "SUB") return Operation::SUB;
    if (s == "MUL") return Operation::MUL;
    if (s == "DIV") return Operation::DIV;
    return std::nullopt;
}

// ─── 序列化：对象 → 字节流 ───

inline std::vector<uint8_t> serialize(const Request& req) {
    std::string body = opToString(req.op) + " "
                     + std::to_string(req.arg1) + " "
                     + std::to_string(req.arg2);
    uint32_t len = static_cast<uint32_t>(body.size());

    std::vector<uint8_t> result(sizeof(len) + len);
    std::memcpy(result.data(), &len, sizeof(len));
    std::memcpy(result.data() + sizeof(len), body.data(), len);
    return result;
}

inline std::vector<uint8_t> serialize(const Response& resp) {
    std::string body;
    if (resp.success) {
        body = "OK " + std::to_string(resp.result);
    } else {
        body = "ERR " + resp.error;
    }
    uint32_t len = static_cast<uint32_t>(body.size());

    std::vector<uint8_t> result(sizeof(len) + len);
    std::memcpy(result.data(), &len, sizeof(len));
    std::memcpy(result.data() + sizeof(len), body.data(), len);
    return result;
}

// ─── 反序列化：字节流 → 对象 ───

inline std::optional<Request> deserializeRequest(const std::vector<uint8_t>& data) {
    if (data.size() < sizeof(uint32_t)) return std::nullopt;

    uint32_t len;
    std::memcpy(&len, data.data(), sizeof(len));
    if (data.size() < sizeof(len) + len) return std::nullopt;

    std::string body(data.begin() + sizeof(len), data.begin() + sizeof(len) + len);
    std::istringstream iss(body);

    std::string op_str;
    int64_t a, b;
    if (!(iss >> op_str >> a >> b)) return std::nullopt;

    auto op = stringToOp(op_str);
    if (!op) return std::nullopt;

    return Request{*op, a, b};
}

inline std::optional<Response> deserializeResponse(const std::vector<uint8_t>& data) {
    if (data.size() < sizeof(uint32_t)) return std::nullopt;

    uint32_t len;
    std::memcpy(&len, data.data(), sizeof(len));
    if (data.size() < sizeof(len) + len) return std::nullopt;

    std::string body(data.begin() + sizeof(len), data.begin() + sizeof(len) + len);

    if (body.substr(0, 3) == "OK ") {
        int64_t result = std::stoll(body.substr(3));
        return Response{true, result, ""};
    } else if (body.substr(0, 4) == "ERR ") {
        return Response{false, 0, body.substr(4)};
    }
    return std::nullopt;
}

// ─── 计算执行 ───

inline Response execute(const Request& req) {
    switch (req.op) {
        case Operation::ADD:
            return {true, req.arg1 + req.arg2, ""};
        case Operation::SUB:
            return {true, req.arg1 - req.arg2, ""};
        case Operation::MUL:
            return {true, req.arg1 * req.arg2, ""};
        case Operation::DIV:
            if (req.arg2 == 0)
                return {false, 0, "Division by zero"};
            return {true, req.arg1 / req.arg2, ""};
    }
    return {false, 0, "Unknown operation"};
}

// ─── IO 辅助：从 fd 读写带长度前缀的消息 ───

#ifdef __linux__
#include <unistd.h>
#include <errno.h>

// 可靠地读 n 字节（处理 short read）
inline bool readExact(int fd, void* buf, size_t n) {
    auto* p = static_cast<uint8_t*>(buf);
    while (n > 0) {
        ssize_t r = ::read(fd, p, n);
        if (r <= 0) return false;  // EOF 或错误
        p += r;
        n -= r;
    }
    return true;
}

// 可靠地写 n 字节（处理 short write）
inline bool writeExact(int fd, const void* buf, size_t n) {
    auto* p = static_cast<const uint8_t*>(buf);
    while (n > 0) {
        ssize_t w = ::write(fd, p, n);
        if (w <= 0) return false;
        p += w;
        n -= w;
    }
    return true;
}

// 发送一条消息（长度前缀 + 消息体）
inline bool sendMessage(int fd, const std::vector<uint8_t>& msg) {
    return writeExact(fd, msg.data(), msg.size());
}

// 接收一条消息（先读长度，再读消息体）
inline std::optional<std::vector<uint8_t>> recvMessage(int fd) {
    uint32_t len;
    if (!readExact(fd, &len, sizeof(len))) return std::nullopt;

    std::vector<uint8_t> msg(sizeof(len) + len);
    std::memcpy(msg.data(), &len, sizeof(len));
    if (!readExact(fd, msg.data() + sizeof(len), len)) return std::nullopt;

    return msg;
}
#endif
```

### 0.4 阶段 0 总结

```
现在我们有了：
  ✅ 通信协议（请求/响应格式）
  ✅ 序列化/反序列化
  ✅ 计算逻辑
  ✅ 所有单元测试通过

还没有任何 IPC！
但这是正确的做法：先把"传什么"搞对，再考虑"怎么传"。

接下来每个阶段只需要换不同的"传输通道"，
协议和计算逻辑完全复用。
```

------

## 阶段 1：匿名管道 —— 最简单的 IPC

### 1.1 匿名管道是什么？

```
匿名管道就像一根水管：
  一头写入（write end），一头读出（read end）

  进程 A                     进程 B
  write(fd_w, data) ──管道──> read(fd_r, data)

特点：
  ├── 单向（一根管道只能一个方向）
  ├── 只能在有亲缘关系的进程间（fork）
  ├── 内核中的缓冲区（默认 64KB）
  └── 字节流（没有消息边界）

如果需要双向通信？→ 创建两根管道！

  进程A                         进程B
  write(pipe1_w) ──管道1──>  read(pipe1_r)    请求方向
  read(pipe2_r)  <──管道2──  write(pipe2_w)   响应方向
```

### 1.2 先写测试（RED）

```cpp
// tests/test_pipe_ipc.cpp
#include <gtest/gtest.h>
#include "protocol.h"

#ifdef __linux__
#include <unistd.h>
#include <sys/wait.h>
#include <cstdlib>

TEST(PipeIPCTest, SingleRequestResponse) {
    // 管道1：父→子（请求）
    int req_pipe[2];
    ASSERT_EQ(pipe(req_pipe), 0);

    // 管道2：子→父（响应）
    int resp_pipe[2];
    ASSERT_EQ(pipe(resp_pipe), 0);

    pid_t pid = fork();
    ASSERT_NE(pid, -1);

    if (pid == 0) {
        // ═══ 子进程（服务端）═══
        close(req_pipe[1]);   // 关闭请求管道的写端
        close(resp_pipe[0]);  // 关闭响应管道的读端

        // 读请求
        auto msg = recvMessage(req_pipe[0]);
        if (!msg) _exit(1);

        auto req = deserializeRequest(*msg);
        if (!req) _exit(2);

        // 执行计算
        auto resp = execute(*req);

        // 写响应
        auto resp_bytes = serialize(resp);
        sendMessage(resp_pipe[1], resp_bytes);

        close(req_pipe[0]);
        close(resp_pipe[1]);
        _exit(0);
    }

    // ═══ 父进程（客户端）═══
    close(req_pipe[0]);   // 关闭请求管道的读端
    close(resp_pipe[1]);  // 关闭响应管道的写端

    // 发请求：ADD 10 20
    Request req{Operation::ADD, 10, 20};
    auto req_bytes = serialize(req);
    ASSERT_TRUE(sendMessage(req_pipe[1], req_bytes));
    close(req_pipe[1]);  // 发完关闭写端

    // 读响应
    auto resp_msg = recvMessage(resp_pipe[0]);
    ASSERT_TRUE(resp_msg.has_value());

    auto resp = deserializeResponse(*resp_msg);
    ASSERT_TRUE(resp.has_value());
    EXPECT_TRUE(resp->success);
    EXPECT_EQ(resp->result, 30);

    close(resp_pipe[0]);

    // 等子进程结束
    int status;
    waitpid(pid, &status, 0);
    EXPECT_TRUE(WIFEXITED(status));
    EXPECT_EQ(WEXITSTATUS(status), 0);
}

TEST(PipeIPCTest, MultipleRequests) {
    int req_pipe[2], resp_pipe[2];
    ASSERT_EQ(pipe(req_pipe), 0);
    ASSERT_EQ(pipe(resp_pipe), 0);

    pid_t pid = fork();
    ASSERT_NE(pid, -1);

    if (pid == 0) {
        // 子进程：循环处理请求
        close(req_pipe[1]);
        close(resp_pipe[0]);

        while (true) {
            auto msg = recvMessage(req_pipe[0]);
            if (!msg) break;  // 管道关闭 → 退出

            auto req = deserializeRequest(*msg);
            if (!req) break;

            auto resp = execute(*req);
            auto resp_bytes = serialize(resp);
            if (!sendMessage(resp_pipe[1], resp_bytes)) break;
        }

        close(req_pipe[0]);
        close(resp_pipe[1]);
        _exit(0);
    }

    // 父进程：发多个请求
    close(req_pipe[0]);
    close(resp_pipe[1]);

    struct TestCase {
        Operation op;
        int64_t a, b, expected;
    };

    std::vector<TestCase> cases = {
        {Operation::ADD, 10, 20, 30},
        {Operation::SUB, 50, 30, 20},
        {Operation::MUL, 7, 8, 56},
        {Operation::DIV, 100, 4, 25},
    };

    for (auto& tc : cases) {
        Request req{tc.op, tc.a, tc.b};
        auto req_bytes = serialize(req);
        ASSERT_TRUE(sendMessage(req_pipe[1], req_bytes));

        auto resp_msg = recvMessage(resp_pipe[0]);
        ASSERT_TRUE(resp_msg.has_value());

        auto resp = deserializeResponse(*resp_msg);
        ASSERT_TRUE(resp.has_value());
        EXPECT_TRUE(resp->success);
        EXPECT_EQ(resp->result, tc.expected)
            << opToString(tc.op) << " " << tc.a << " " << tc.b;
    }

    close(req_pipe[1]);
    close(resp_pipe[0]);

    int status;
    waitpid(pid, &status, 0);
    EXPECT_TRUE(WIFEXITED(status));
}

TEST(PipeIPCTest, DivisionByZero) {
    int req_pipe[2], resp_pipe[2];
    ASSERT_EQ(pipe(req_pipe), 0);
    ASSERT_EQ(pipe(resp_pipe), 0);

    pid_t pid = fork();
    ASSERT_NE(pid, -1);

    if (pid == 0) {
        close(req_pipe[1]);
        close(resp_pipe[0]);

        auto msg = recvMessage(req_pipe[0]);
        auto req = deserializeRequest(*msg);
        auto resp = execute(*req);
        sendMessage(resp_pipe[1], serialize(resp));

        close(req_pipe[0]);
        close(resp_pipe[1]);
        _exit(0);
    }

    close(req_pipe[0]);
    close(resp_pipe[1]);

    Request req{Operation::DIV, 10, 0};
    sendMessage(req_pipe[1], serialize(req));
    close(req_pipe[1]);

    auto resp_msg = recvMessage(resp_pipe[0]);
    ASSERT_TRUE(resp_msg.has_value());
    auto resp = deserializeResponse(*resp_msg);
    ASSERT_TRUE(resp.has_value());
    EXPECT_FALSE(resp->success);

    close(resp_pipe[0]);
    waitpid(pid, nullptr, 0);
}

#endif  // __linux__
```

### 1.3 它已经能工作了！

测试通过。但仔细看代码——**有大量重复的 pipe/fork/close 管理**。

### 1.4 重构：封装管道通信（REFACTOR）

```cpp
// include/pipe_channel.h
#pragma once
#include "protocol.h"
#include <functional>
#include <sys/wait.h>

// 封装双向管道通信
class PipeChannel {
public:
    // 服务端回调类型
    using Handler = std::function<Response(const Request&)>;

    // 创建管道 + fork + 子进程运行服务
    static PipeChannel createWithServer(Handler handler) {
        int req_pipe[2], resp_pipe[2];
        pipe(req_pipe);
        pipe(resp_pipe);

        pid_t pid = fork();
        if (pid == 0) {
            // 子进程（服务端）
            close(req_pipe[1]);
            close(resp_pipe[0]);

            while (true) {
                auto msg = recvMessage(req_pipe[0]);
                if (!msg) break;
                auto req = deserializeRequest(*msg);
                if (!req) break;

                auto resp = handler(*req);
                if (!sendMessage(resp_pipe[1], serialize(resp))) break;
            }

            close(req_pipe[0]);
            close(resp_pipe[1]);
            _exit(0);
        }

        // 父进程（客户端）
        close(req_pipe[0]);
        close(resp_pipe[1]);

        return PipeChannel(req_pipe[1], resp_pipe[0], pid);
    }

    // 发送请求并等待响应
    std::optional<Response> call(const Request& req) {
        auto req_bytes = serialize(req);
        if (!sendMessage(write_fd_, req_bytes)) return std::nullopt;

        auto resp_msg = recvMessage(read_fd_);
        if (!resp_msg) return std::nullopt;

        return deserializeResponse(*resp_msg);
    }

    ~PipeChannel() {
        close(write_fd_);
        close(read_fd_);
        if (server_pid_ > 0) {
            waitpid(server_pid_, nullptr, 0);
        }
    }

    // 禁止拷贝
    PipeChannel(const PipeChannel&) = delete;
    PipeChannel& operator=(const PipeChannel&) = delete;

    // 允许移动
    PipeChannel(PipeChannel&& other) noexcept
        : write_fd_(other.write_fd_)
        , read_fd_(other.read_fd_)
        , server_pid_(other.server_pid_) {
        other.write_fd_ = -1;
        other.read_fd_ = -1;
        other.server_pid_ = -1;
    }

private:
    PipeChannel(int write_fd, int read_fd, pid_t server_pid)
        : write_fd_(write_fd), read_fd_(read_fd), server_pid_(server_pid) {}

    int write_fd_;
    int read_fd_;
    pid_t server_pid_;
};
```

重构后的测试干净了很多：

```cpp
TEST(PipeChannelTest, SimpleCall) {
    auto channel = PipeChannel::createWithServer(execute);

    auto resp = channel.call({Operation::ADD, 10, 20});
    ASSERT_TRUE(resp.has_value());
    EXPECT_TRUE(resp->success);
    EXPECT_EQ(resp->result, 30);
}

TEST(PipeChannelTest, MultipleCalls) {
    auto channel = PipeChannel::createWithServer(execute);

    auto r1 = channel.call({Operation::ADD, 1, 2});
    EXPECT_EQ(r1->result, 3);

    auto r2 = channel.call({Operation::MUL, 7, 8});
    EXPECT_EQ(r2->result, 56);

    auto r3 = channel.call({Operation::DIV, 100, 4});
    EXPECT_EQ(r3->result, 25);

    auto r4 = channel.call({Operation::DIV, 10, 0});
    EXPECT_FALSE(r4->success);
}
```

### 1.5 阶段 1 总结

```
匿名管道实现：
  ✅ 完成双向通信（两根管道）
  ✅ 请求-响应模式
  ✅ 多次调用
  ✅ 封装成 PipeChannel 类

局限：
  ❌ 只能在 fork 出来的父子进程间使用
  ❌ 服务端不能独立运行（必须 fork）
  ❌ 不能跨网络

数据流：
  客户端 → write() → 内核管道缓冲区 → read() → 服务端
  两次拷贝：用户空间 → 内核 → 用户空间
```

------

## 阶段 2：命名管道 —— 任意进程通信

### 2.1 命名管道 vs 匿名管道

```
匿名管道：只存在于内存中，没有文件系统路径
          只能通过 fork 继承文件描述符

命名管道（FIFO）：在文件系统中有路径
                  任何知道路径的进程都能打开

  mkfifo("/tmp/calc_req", 0666)
  → 在 /tmp 下创建一个特殊文件
  → 进程 A 打开写，进程 B 打开读
  → 数据通过内核缓冲区传递（不写磁盘！）

Linux FIFO vs Windows Named Pipe：
  Linux FIFO：单向，两个 FIFO 实现双向
  Windows Named Pipe：天然双向，还能跨网络
  这里先讲 Linux FIFO，Windows 的后面对比
```

### 2.2 先写测试（RED）

```cpp
// tests/test_fifo_ipc.cpp
#include <gtest/gtest.h>
#include "fifo_channel.h"

#ifdef __linux__

class FIFOTest : public ::testing::Test {
protected:
    static constexpr const char* REQ_FIFO = "/tmp/test_calc_req";
    static constexpr const char* RESP_FIFO = "/tmp/test_calc_resp";

    void SetUp() override {
        // 清理可能残留的文件
        unlink(REQ_FIFO);
        unlink(RESP_FIFO);
    }

    void TearDown() override {
        unlink(REQ_FIFO);
        unlink(RESP_FIFO);
    }
};

TEST_F(FIFOTest, ServerAndClient) {
    auto server = FIFOServer::create(REQ_FIFO, RESP_FIFO, execute);

    // 服务端在后台线程运行
    server.startInBackground();

    // 客户端连接
    FIFOClient client(REQ_FIFO, RESP_FIFO);

    auto resp = client.call({Operation::ADD, 10, 20});
    ASSERT_TRUE(resp.has_value());
    EXPECT_EQ(resp->result, 30);

    server.stop();
}

TEST_F(FIFOTest, MultipleCalls) {
    auto server = FIFOServer::create(REQ_FIFO, RESP_FIFO, execute);
    server.startInBackground();

    FIFOClient client(REQ_FIFO, RESP_FIFO);

    EXPECT_EQ(client.call({Operation::ADD, 1, 2})->result, 3);
    EXPECT_EQ(client.call({Operation::MUL, 7, 8})->result, 56);
    EXPECT_EQ(client.call({Operation::SUB, 100, 30})->result, 70);
    EXPECT_FALSE(client.call({Operation::DIV, 10, 0})->success);

    server.stop();
}

TEST_F(FIFOTest, IndependentProcesses) {
    // 用 fork 模拟两个独立进程（不用继承 fd）
    auto server = FIFOServer::create(REQ_FIFO, RESP_FIFO, execute);

    pid_t pid = fork();
    ASSERT_NE(pid, -1);

    if (pid == 0) {
        // 子进程作为服务端（独立进程）
        server.run();  // 阻塞运行直到没有客户端
        _exit(0);
    }

    // 父进程作为客户端
    // 等一下让服务端准备好
    usleep(50000);  // 50ms

    FIFOClient client(REQ_FIFO, RESP_FIFO);
    auto resp = client.call({Operation::ADD, 100, 200});
    ASSERT_TRUE(resp.has_value());
    EXPECT_EQ(resp->result, 300);

    // 关闭客户端 → 服务端检测到并退出
    // （析构函数关闭 fd）

    int status;
    waitpid(pid, &status, 0);
}

#endif
```

### 2.3 实现命名管道通信（GREEN）

```cpp
// include/fifo_channel.h
#pragma once
#include "protocol.h"
#include <sys/stat.h>
#include <fcntl.h>
#include <thread>
#include <atomic>
#include <functional>

class FIFOServer {
public:
    using Handler = std::function<Response(const Request&)>;

    static FIFOServer create(const char* req_path, const char* resp_path,
                             Handler handler) {
        // 创建 FIFO 文件
        mkfifo(req_path, 0666);
        mkfifo(resp_path, 0666);
        return FIFOServer(req_path, resp_path, std::move(handler));
    }

    // 阻塞运行（处理一个客户端连接）
    void run() {
        // open 会阻塞直到另一端也打开
        int req_fd = open(req_path_.c_str(), O_RDONLY);
        int resp_fd = open(resp_path_.c_str(), O_WRONLY);

        if (req_fd < 0 || resp_fd < 0) return;

        while (!stop_flag_) {
            auto msg = recvMessage(req_fd);
            if (!msg) break;

            auto req = deserializeRequest(*msg);
            if (!req) break;

            auto resp = handler_(*req);
            if (!sendMessage(resp_fd, serialize(resp))) break;
        }

        close(req_fd);
        close(resp_fd);
    }

    // 后台线程运行
    void startInBackground() {
        worker_ = std::thread([this] { run(); });
    }

    void stop() {
        stop_flag_ = true;
        if (worker_.joinable()) {
            // 打开一次管道让 open/recvMessage 解除阻塞
            int fd = open(req_path_.c_str(), O_WRONLY | O_NONBLOCK);
            if (fd >= 0) close(fd);
            worker_.join();
        }
    }

    ~FIFOServer() { stop(); }

    FIFOServer(const FIFOServer&) = delete;
    FIFOServer& operator=(const FIFOServer&) = delete;
    FIFOServer(FIFOServer&&) = default;

private:
    FIFOServer(const char* req_path, const char* resp_path, Handler handler)
        : req_path_(req_path), resp_path_(resp_path)
        , handler_(std::move(handler)) {}

    std::string req_path_;
    std::string resp_path_;
    Handler handler_;
    std::thread worker_;
    std::atomic<bool> stop_flag_{false};
};

class FIFOClient {
public:
    FIFOClient(const char* req_path, const char* resp_path) {
        // 注意打开顺序要和服务端相反，否则可能死锁
        write_fd_ = open(req_path, O_WRONLY);
        read_fd_ = open(resp_path, O_RDONLY);
    }

    std::optional<Response> call(const Request& req) {
        if (!sendMessage(write_fd_, serialize(req))) return std::nullopt;
        auto msg = recvMessage(read_fd_);
        if (!msg) return std::nullopt;
        return deserializeResponse(*msg);
    }

    ~FIFOClient() {
        if (write_fd_ >= 0) close(write_fd_);
        if (read_fd_ >= 0) close(read_fd_);
    }

private:
    int write_fd_ = -1;
    int read_fd_ = -1;
};
```

### 2.4 阶段 2 总结

```
命名管道（FIFO）：
  ✅ 任意两个进程可以通信（不需要 fork 亲缘关系）
  ✅ 服务端和客户端可以独立启动
  ✅ 通过文件路径找到对方

  ❌ 同一时间只能一个客户端（FIFO 不支持多路连接）
  ❌ 需要两个 FIFO 文件实现双向（Linux 限制）
  ❌ open 会阻塞直到另一端也打开（可能卡住）
  ❌ 不能跨网络

  数据流（和匿名管道一样）：
  客户端 → write() → 内核缓冲区 → read() → 服务端
  两次拷贝
```

------

## 阶段 3：共享内存 —— 最快的 IPC

### 3.1 为什么共享内存最快？

```
管道/Socket 的数据流：
  进程A用户空间 → 拷贝到内核 → 拷贝到进程B用户空间
  两次拷贝 + 两次用户/内核态切换

共享内存的数据流：
  进程A ──┐
          ├── 直接读写同一块物理内存页
  进程B ──┘
  零拷贝！零内核介入！

原理：
  操作系统让两个进程的虚拟地址映射到同一块物理内存
  进程 A 在地址 0x7f001000 写入数据
  进程 B 在地址 0x7f005000 读到同样的数据
  两个虚拟地址 → 同一块物理 RAM

  但是！需要自行同步——两个进程同时读写会出问题
  → 用信号量或互斥锁来同步
```

### 3.2 先写测试（RED）

```cpp
// tests/test_shm_ipc.cpp
#include <gtest/gtest.h>
#include "shm_channel.h"

#ifdef __linux__

class ShmTest : public ::testing::Test {
protected:
    static constexpr const char* SHM_NAME = "/test_calc_shm";
    static constexpr const char* SEM_REQ_NAME = "/test_calc_sem_req";
    static constexpr const char* SEM_RESP_NAME = "/test_calc_sem_resp";

    void TearDown() override {
        // 清理共享资源
        shm_unlink(SHM_NAME);
        sem_unlink(SEM_REQ_NAME);
        sem_unlink(SEM_RESP_NAME);
    }
};

TEST_F(ShmTest, SingleRequest) {
    auto server = ShmServer::create(SHM_NAME, SEM_REQ_NAME, SEM_RESP_NAME, execute);
    server.startInBackground();

    ShmClient client(SHM_NAME, SEM_REQ_NAME, SEM_RESP_NAME);

    auto resp = client.call({Operation::ADD, 10, 20});
    ASSERT_TRUE(resp.has_value());
    EXPECT_EQ(resp->result, 30);

    server.stop();
}

TEST_F(ShmTest, MultipleRequests) {
    auto server = ShmServer::create(SHM_NAME, SEM_REQ_NAME, SEM_RESP_NAME, execute);
    server.startInBackground();

    ShmClient client(SHM_NAME, SEM_REQ_NAME, SEM_RESP_NAME);

    EXPECT_EQ(client.call({Operation::ADD, 1, 2})->result, 3);
    EXPECT_EQ(client.call({Operation::MUL, 7, 8})->result, 56);
    EXPECT_EQ(client.call({Operation::SUB, 100, 30})->result, 70);
    EXPECT_EQ(client.call({Operation::DIV, 100, 4})->result, 25);
    EXPECT_FALSE(client.call({Operation::DIV, 10, 0})->success);

    server.stop();
}

TEST_F(ShmTest, LargeNumbers) {
    auto server = ShmServer::create(SHM_NAME, SEM_REQ_NAME, SEM_RESP_NAME, execute);
    server.startInBackground();

    ShmClient client(SHM_NAME, SEM_REQ_NAME, SEM_RESP_NAME);

    auto resp = client.call({Operation::MUL, 1000000, 1000000});
    ASSERT_TRUE(resp.has_value());
    EXPECT_EQ(resp->result, 1000000000000LL);

    server.stop();
}

#endif
```

### 3.3 实现共享内存通信（GREEN）

```cpp
// include/shm_channel.h
#pragma once
#include "protocol.h"
#include <sys/mman.h>
#include <fcntl.h>
#include <semaphore.h>
#include <thread>
#include <atomic>
#include <functional>
#include <cstring>

// 共享内存中的数据布局
struct ShmBlock {
    // 请求区
    uint32_t req_len;
    char req_data[4096];

    // 响应区
    uint32_t resp_len;
    char resp_data[4096];

    // 控制标志
    std::atomic<bool> shutdown;
};

class ShmServer {
public:
    using Handler = std::function<Response(const Request&)>;

    static ShmServer create(const char* shm_name,
                            const char* sem_req_name,
                            const char* sem_resp_name,
                            Handler handler) {
        // 创建共享内存
        int fd = shm_open(shm_name, O_CREAT | O_RDWR, 0666);
        ftruncate(fd, sizeof(ShmBlock));
        auto* block = static_cast<ShmBlock*>(
            mmap(nullptr, sizeof(ShmBlock), PROT_READ | PROT_WRITE,
                 MAP_SHARED, fd, 0));
        close(fd);

        // 初始化共享内存
        std::memset(block, 0, sizeof(ShmBlock));
        block->shutdown.store(false);

        // 创建信号量
        sem_t* sem_req = sem_open(sem_req_name, O_CREAT, 0666, 0);
        sem_t* sem_resp = sem_open(sem_resp_name, O_CREAT, 0666, 0);

        return ShmServer(block, sem_req, sem_resp, std::move(handler),
                         shm_name, sem_req_name, sem_resp_name);
    }

    void run() {
        while (!block_->shutdown.load()) {
            // 等待客户端发来请求
            struct timespec ts;
            clock_gettime(CLOCK_REALTIME, &ts);
            ts.tv_nsec += 100000000;  // 100ms 超时
            if (ts.tv_nsec >= 1000000000) {
                ts.tv_sec++;
                ts.tv_nsec -= 1000000000;
            }

            if (sem_timedwait(sem_req_, &ts) != 0) continue;
            if (block_->shutdown.load()) break;

            // 从共享内存读请求
            std::vector<uint8_t> req_bytes(sizeof(uint32_t) + block_->req_len);
            std::memcpy(req_bytes.data(), &block_->req_len, sizeof(uint32_t));
            std::memcpy(req_bytes.data() + sizeof(uint32_t),
                        block_->req_data, block_->req_len);

            auto req = deserializeRequest(req_bytes);
            if (!req) continue;

            // 执行计算
            auto resp = handler_(*req);

            // 把响应写入共享内存
            auto resp_bytes = serialize(resp);
            uint32_t resp_len;
            std::memcpy(&resp_len, resp_bytes.data(), sizeof(resp_len));
            block_->resp_len = resp_len;
            std::memcpy(block_->resp_data,
                        resp_bytes.data() + sizeof(uint32_t), resp_len);

            // 通知客户端：响应已就绪
            sem_post(sem_resp_);
        }
    }

    void startInBackground() {
        worker_ = std::thread([this] { run(); });
    }

    void stop() {
        block_->shutdown.store(true);
        sem_post(sem_req_);  // 唤醒可能阻塞的 sem_wait
        if (worker_.joinable()) worker_.join();
    }

    ~ShmServer() {
        stop();
        munmap(block_, sizeof(ShmBlock));
        sem_close(sem_req_);
        sem_close(sem_resp_);
    }

private:
    ShmServer(ShmBlock* block, sem_t* sem_req, sem_t* sem_resp,
              Handler handler, const char* shm_name,
              const char* sem_req_name, const char* sem_resp_name)
        : block_(block), sem_req_(sem_req), sem_resp_(sem_resp)
        , handler_(std::move(handler)) {}

    ShmBlock* block_;
    sem_t* sem_req_;
    sem_t* sem_resp_;
    Handler handler_;
    std::thread worker_;
};

class ShmClient {
public:
    ShmClient(const char* shm_name,
              const char* sem_req_name,
              const char* sem_resp_name) {
        int fd = shm_open(shm_name, O_RDWR, 0666);
        block_ = static_cast<ShmBlock*>(
            mmap(nullptr, sizeof(ShmBlock), PROT_READ | PROT_WRITE,
                 MAP_SHARED, fd, 0));
        close(fd);

        sem_req_ = sem_open(sem_req_name, 0);
        sem_resp_ = sem_open(sem_resp_name, 0);
    }

    std::optional<Response> call(const Request& req) {
        // 把请求写入共享内存
        auto req_bytes = serialize(req);
        uint32_t req_len;
        std::memcpy(&req_len, req_bytes.data(), sizeof(req_len));
        block_->req_len = req_len;
        std::memcpy(block_->req_data,
                    req_bytes.data() + sizeof(uint32_t), req_len);

        // 通知服务端：请求已就绪
        sem_post(sem_req_);

        // 等待服务端响应
        sem_wait(sem_resp_);

        // 从共享内存读响应
        std::vector<uint8_t> resp_bytes(sizeof(uint32_t) + block_->resp_len);
        std::memcpy(resp_bytes.data(), &block_->resp_len, sizeof(uint32_t));
        std::memcpy(resp_bytes.data() + sizeof(uint32_t),
                    block_->resp_data, block_->resp_len);

        return deserializeResponse(resp_bytes);
    }

    ~ShmClient() {
        munmap(block_, sizeof(ShmBlock));
        sem_close(sem_req_);
        sem_close(sem_resp_);
    }

private:
    ShmBlock* block_;
    sem_t* sem_req_;
    sem_t* sem_resp_;
};
```

### 3.4 共享内存的同步机制详解

```
数据在共享内存中的状态转换：

  ┌─ 客户端写请求 ─┐    ┌─ 服务端写响应 ─┐
  │                │    │                │
  ▼                │    ▼                │
  ShmBlock:        │    ShmBlock:        │
  ┌──────────┐     │    ┌──────────┐     │
  │ req_data │ ←───┘    │ resp_data│ ←───┘
  │ req_len  │          │ resp_len │
  └──────────┘          └──────────┘

  同步时序：

  客户端                    服务端
    │                        │
    │── 写 req 到共享内存 ──│
    │── sem_post(sem_req) ──>│  "请求写好了"
    │                        │── 读 req 从共享内存
    │                        │── 执行计算
    │                        │── 写 resp 到共享内存
    │  "响应写好了" <── sem_post(sem_resp)
    │── 读 resp 从共享内存 ──│
    │                        │

  两个信号量确保了：
  ├── 客户端写完请求后服务端才读
  ├── 服务端写完响应后客户端才读
  └── 不会出现半读半写的数据竞争
```

### 3.5 阶段 3 总结

```
共享内存：
  ✅ 零拷贝（同一块物理内存）
  ✅ 任意进程（通过路径名找到）
  ✅ 最快的 IPC 方式

  ❌ 同步复杂（需要信号量或 mutex）
  ❌ 当前实现只支持一个客户端
  ❌ 不能跨网络
  ❌ 需要手动管理共享内存的生命周期（shm_unlink）
  ❌ 固定大小的通信缓冲区（我们用了 4096）

  数据流：
  客户端 → 直接写共享内存 → 服务端直接读
  零拷贝！但需要信号量协调时序
```

------

## 阶段 4：Unix Domain Socket —— 最灵活的本地 IPC

### 4.1 为什么还需要 Socket？

```
管道的问题：
  ├── 匿名管道只能父子进程
  ├── 命名管道同时只能一个客户端
  └── 没有连接概念，不支持多路复用

共享内存的问题：
  ├── 同步很复杂
  ├── 固定大小缓冲区
  └── 多客户端管理很难

Unix Domain Socket 解决了这些：
  ├── 任意进程通信（通过文件路径）
  ├── 支持多客户端（accept 多个连接）
  ├── 全双工（一个 socket 即可双向）
  ├── 流式/数据报都支持（SOCK_STREAM / SOCK_DGRAM）
  ├── 可以和 epoll 配合（高性能服务器）
  └── API 和 TCP Socket 几乎一样（方便将来切换到网络）

  比 TCP Socket 快的原因：
  ├── 不走网络协议栈（不需要 IP 头、TCP 头、校验和）
  ├── 数据直接在内核中从发送缓冲区拷贝到接收缓冲区
  └── 不需要路由查找、拥塞控制等网络逻辑
```

### 4.2 先写测试（RED）

```cpp
// tests/test_uds_ipc.cpp
#include <gtest/gtest.h>
#include "uds_channel.h"

#ifdef __linux__

class UDSTest : public ::testing::Test {
protected:
    static constexpr const char* SOCKET_PATH = "/tmp/test_calc.sock";

    void SetUp() override {
        unlink(SOCKET_PATH);
    }

    void TearDown() override {
        unlink(SOCKET_PATH);
    }
};

TEST_F(UDSTest, SingleClient) {
    UDSServer server(SOCKET_PATH, execute);
    server.startInBackground();

    UDSClient client(SOCKET_PATH);

    auto resp = client.call({Operation::ADD, 10, 20});
    ASSERT_TRUE(resp.has_value());
    EXPECT_EQ(resp->result, 30);

    server.stop();
}

TEST_F(UDSTest, MultipleCalls) {
    UDSServer server(SOCKET_PATH, execute);
    server.startInBackground();

    UDSClient client(SOCKET_PATH);

    EXPECT_EQ(client.call({Operation::ADD, 1, 2})->result, 3);
    EXPECT_EQ(client.call({Operation::MUL, 7, 8})->result, 56);
    EXPECT_EQ(client.call({Operation::SUB, 100, 30})->result, 70);
    EXPECT_EQ(client.call({Operation::DIV, 100, 4})->result, 25);
    EXPECT_FALSE(client.call({Operation::DIV, 10, 0})->success);

    server.stop();
}

TEST_F(UDSTest, MultipleClients) {
    UDSServer server(SOCKET_PATH, execute);
    server.startInBackground();

    // 多个客户端同时连接
    constexpr int NUM_CLIENTS = 4;
    constexpr int CALLS_PER_CLIENT = 100;

    std::atomic<int> total_success{0};

    auto client_work = [&](int client_id) {
        UDSClient client(SOCKET_PATH);
        for (int i = 0; i < CALLS_PER_CLIENT; i++) {
            auto resp = client.call({Operation::ADD,
                                     client_id * 1000 + i, 1});
            if (resp && resp->success &&
                resp->result == client_id * 1000 + i + 1) {
                total_success++;
            }
        }
    };

    std::vector<std::thread> threads;
    for (int i = 0; i < NUM_CLIENTS; i++) {
        threads.emplace_back(client_work, i);
    }
    for (auto& t : threads) t.join();

    EXPECT_EQ(total_success.load(), NUM_CLIENTS * CALLS_PER_CLIENT);

    server.stop();
}

TEST_F(UDSTest, ClientDisconnectDoesNotCrashServer) {
    UDSServer server(SOCKET_PATH, execute);
    server.startInBackground();

    // 客户端 1 连接后立即断开
    {
        UDSClient client1(SOCKET_PATH);
        client1.call({Operation::ADD, 1, 1});
    }  // client1 析构，断开连接

    // 客户端 2 应该仍然能正常通信
    {
        UDSClient client2(SOCKET_PATH);
        auto resp = client2.call({Operation::ADD, 100, 200});
        ASSERT_TRUE(resp.has_value());
        EXPECT_EQ(resp->result, 300);
    }

    server.stop();
}

#endif
```

### 4.3 实现 Unix Domain Socket（GREEN）

```cpp
// include/uds_channel.h
#pragma once
#include "protocol.h"
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <thread>
#include <vector>
#include <atomic>
#include <functional>
#include <cstring>

class UDSServer {
public:
    using Handler = std::function<Response(const Request&)>;

    UDSServer(const char* path, Handler handler)
        : path_(path), handler_(std::move(handler)) {
        // 创建 Unix Domain Socket
        listen_fd_ = socket(AF_UNIX, SOCK_STREAM, 0);

        struct sockaddr_un addr{};
        addr.sun_family = AF_UNIX;
        strncpy(addr.sun_path, path, sizeof(addr.sun_path) - 1);

        bind(listen_fd_, (struct sockaddr*)&addr, sizeof(addr));
        listen(listen_fd_, 5);
    }

    void startInBackground() {
        worker_ = std::thread([this] { run(); });
    }

    void run() {
        while (!stop_flag_.load()) {
            // 设置超时以便能够检查 stop_flag
            struct timeval tv{0, 100000};  // 100ms
            fd_set fds;
            FD_ZERO(&fds);
            FD_SET(listen_fd_, &fds);

            int ret = select(listen_fd_ + 1, &fds, nullptr, nullptr, &tv);
            if (ret <= 0) continue;

            int client_fd = accept(listen_fd_, nullptr, nullptr);
            if (client_fd < 0) continue;

            // 每个客户端一个线程处理
            client_threads_.emplace_back([this, client_fd] {
                handleClient(client_fd);
            });
        }
    }

    void stop() {
        stop_flag_ = true;
        close(listen_fd_);
        if (worker_.joinable()) worker_.join();
        for (auto& t : client_threads_) {
            if (t.joinable()) t.join();
        }
    }

    ~UDSServer() { stop(); }

private:
    void handleClient(int fd) {
        while (!stop_flag_.load()) {
            auto msg = recvMessage(fd);
            if (!msg) break;  // 客户端断开

            auto req = deserializeRequest(*msg);
            if (!req) break;

            auto resp = handler_(*req);
            if (!sendMessage(fd, serialize(resp))) break;
        }
        close(fd);
    }

    std::string path_;
    Handler handler_;
    int listen_fd_ = -1;
    std::thread worker_;
    std::vector<std::thread> client_threads_;
    std::atomic<bool> stop_flag_{false};
};

class UDSClient {
public:
    explicit UDSClient(const char* path) {
        fd_ = socket(AF_UNIX, SOCK_STREAM, 0);

        struct sockaddr_un addr{};
        addr.sun_family = AF_UNIX;
        strncpy(addr.sun_path, path, sizeof(addr.sun_path) - 1);

        connect(fd_, (struct sockaddr*)&addr, sizeof(addr));
    }

    std::optional<Response> call(const Request& req) {
        if (!sendMessage(fd_, serialize(req))) return std::nullopt;
        auto msg = recvMessage(fd_);
        if (!msg) return std::nullopt;
        return deserializeResponse(*msg);
    }

    ~UDSClient() {
        if (fd_ >= 0) close(fd_);
    }

private:
    int fd_ = -1;
};
```

### 4.4 阶段 4 总结

```
Unix Domain Socket：
  ✅ 任意进程通信
  ✅ 支持多客户端（accept 多个连接）
  ✅ 全双工
  ✅ API 和 TCP 几乎一样（方便切换到网络）
  ✅ 支持 epoll/select 多路复用

  ❌ 比共享内存慢（仍有内核缓冲区拷贝）
  ❌ 不能跨网络（AF_UNIX 只限本机）
  ❌ 需要管理 socket 文件

  数据流：
  客户端 → 内核 socket 缓冲区 → 服务端
  一次拷贝（内核内部直接拷贝，不经过网络协议栈）
```

------

## 阶段 5：基准测试对比

### 5.1 写性能测试

```cpp
// tests/test_ipc_benchmark.cpp
#include <gtest/gtest.h>
#include "protocol.h"
#include "pipe_channel.h"
#include "shm_channel.h"
#include "uds_channel.h"
#include <chrono>
#include <iostream>

#ifdef __linux__

template<typename SetupFunc, typename CallFunc, typename CleanupFunc>
long long benchmarkIPC(const std::string& name,
                       int num_calls,
                       SetupFunc setup,
                       CallFunc call,
                       CleanupFunc cleanup) {
    setup();

    auto start = std::chrono::steady_clock::now();

    for (int i = 0; i < num_calls; i++) {
        Request req{Operation::ADD, i, i + 1};
        auto resp = call(req);
        if (!resp || !resp->success || resp->result != 2 * i + 1) {
            std::cerr << name << ": 错误 at i=" << i << std::endl;
            break;
        }
    }

    auto elapsed = std::chrono::steady_clock::now() - start;
    auto us = std::chrono::duration_cast<std::chrono::microseconds>(elapsed).count();

    cleanup();

    std::cout << name << ": "
              << num_calls << " 次调用 = "
              << us << " us ("
              << us / num_calls << " us/call)" << std::endl;

    return us;
}

TEST(IPCBenchmark, CompareAll) {
    constexpr int NUM_CALLS = 10000;

    std::cout << "\n========== IPC 性能对比 ==========" << std::endl;
    std::cout << "每种方式执行 " << NUM_CALLS << " 次请求-响应" << std::endl;
    std::cout << "==================================" << std::endl;

    // 1. 匿名管道
    {
        PipeChannel* channel = nullptr;
        benchmarkIPC("匿名管道  ", NUM_CALLS,
            [&]{ channel = new PipeChannel(
                     PipeChannel::createWithServer(execute)); },
            [&](const Request& req) { return channel->call(req); },
            [&]{ delete channel; });
    }

    // 2. 共享内存
    {
        const char* shm = "/bench_shm";
        const char* sem_req = "/bench_sem_req";
        const char* sem_resp = "/bench_sem_resp";
        ShmServer* server = nullptr;
        ShmClient* client = nullptr;

        benchmarkIPC("共享内存   ", NUM_CALLS,
            [&]{
                server = new ShmServer(
                    ShmServer::create(shm, sem_req, sem_resp, execute));
                server->startInBackground();
                client = new ShmClient(shm, sem_req, sem_resp);
            },
            [&](const Request& req) { return client->call(req); },
            [&]{
                server->stop();
                delete client;
                delete server;
                shm_unlink(shm);
                sem_unlink(sem_req);
                sem_unlink(sem_resp);
            });
    }

    // 3. Unix Domain Socket
    {
        const char* path = "/tmp/bench_calc.sock";
        UDSServer* server = nullptr;
        UDSClient* client = nullptr;

        benchmarkIPC("UDS Socket ", NUM_CALLS,
            [&]{
                unlink(path);
                server = new UDSServer(path, execute);
                server->startInBackground();
                usleep(10000);  // 等服务端就绪
                client = new UDSClient(path);
            },
            [&](const Request& req) { return client->call(req); },
            [&]{
                delete client;
                server->stop();
                delete server;
                unlink(path);
            });
    }

    std::cout << "\n注意：实际数值因机器和系统配置而异" << std::endl;
}

#endif
```

### 5.2 典型结果

```
========== IPC 性能对比 ==========
每种方式执行 10000 次请求-响应
==================================
匿名管道  : 10000 次调用 = 85000 us (8 us/call)
共享内存   : 10000 次调用 = 25000 us (2 us/call)
UDS Socket : 10000 次调用 = 60000 us (6 us/call)

分析（单次请求-响应往返延迟）：

  共享内存     ~2 us    ████ 最快（零拷贝，信号量唤醒）
  UDS Socket   ~6 us    ██████████ 中等（内核缓冲区拷贝）
  匿名管道     ~8 us    █████████████ 稍慢（两根管道，两次 write+read）

为什么共享内存最快？
  └── 数据不经过内核缓冲区，直接读写同一块内存
      只有信号量的 sem_post/sem_wait 涉及内核调用

为什么 UDS 比管道快一些？
  └── UDS 是全双工（一个 fd），管道需要两个 fd
      UDS 的内核路径更优化

注意：这些数据高度依赖具体场景
  ├── 消息越大 → 共享内存优势越明显
  ├── 客户端越多 → UDS 优势越明显（支持多路复用）
  └── 跨网络 → 只有 TCP Socket 能用
```

------

## 阶段 6：Windows 对比

```
前面的代码都是 Linux 的。Windows 的对应方案：

Linux              Windows                  差异
─────────────────────────────────────────────────────
pipe()             CreatePipe()             API 不同
FIFO (mkfifo)      Named Pipe               Windows 天然双向！
                   (CreateNamedPipe)         支持跨网络
shm_open+mmap      CreateFileMapping         API 不同但概念一样
                   +MapViewOfFile
sem_open            CreateSemaphore           概念一样
Unix Socket        TCP localhost 或           Windows 10 1803+
                   Named Pipe                 才支持 AF_UNIX
epoll              IOCP                      Reactor vs Proactor

Windows Named Pipe 特别好用：
  ├── 双向（不需要两个管道）
  ├── 支持跨网络（\\\\server\\pipe\\name）
  ├── 支持多客户端（ConnectNamedPipe）
  ├── 支持异步（Overlapped IO）
  └── 很多 Windows 服务用它做 IPC

Windows 代码骨架（Named Pipe 服务端）：
```

```cpp
// Windows Named Pipe 服务端
#ifdef _WIN32
#include <windows.h>

void windowsNamedPipeServer() {
    // 创建命名管道
    HANDLE hPipe = CreateNamedPipeA(
        "\\\\.\\pipe\\CalcService",   // 管道名
        PIPE_ACCESS_DUPLEX,           // 双向
        PIPE_TYPE_MESSAGE |           // 消息模式（有边界！）
        PIPE_READMODE_MESSAGE |
        PIPE_WAIT,
        PIPE_UNLIMITED_INSTANCES,     // 不限客户端数
        4096,                         // 输出缓冲区
        4096,                         // 输入缓冲区
        0,
        NULL
    );

    while (true) {
        // 等待客户端连接
        ConnectNamedPipe(hPipe, NULL);

        // 读请求
        char buffer[4096];
        DWORD bytesRead;
        ReadFile(hPipe, buffer, sizeof(buffer), &bytesRead, NULL);

        // 处理请求...

        // 写响应
        DWORD bytesWritten;
        WriteFile(hPipe, response, respLen, &bytesWritten, NULL);

        // 断开，等待下一个客户端
        DisconnectNamedPipe(hPipe);
    }

    CloseHandle(hPipe);
}

// Windows Named Pipe 客户端
void windowsNamedPipeClient() {
    HANDLE hPipe = CreateFileA(
        "\\\\.\\pipe\\CalcService",
        GENERIC_READ | GENERIC_WRITE,
        0, NULL, OPEN_EXISTING, 0, NULL);

    // 设置为消息模式
    DWORD mode = PIPE_READMODE_MESSAGE;
    SetNamedPipeHandleState(hPipe, &mode, NULL, NULL);

    // 写请求
    WriteFile(hPipe, request, reqLen, &bytesWritten, NULL);

    // 读响应
    ReadFile(hPipe, buffer, sizeof(buffer), &bytesRead, NULL);

    CloseHandle(hPipe);
}
#endif
```

```
Windows Named Pipe vs Linux 各方案的功能对比：

功能              Linux pipe  Linux FIFO  Linux UDS   Win NamedPipe
─────────────────────────────────────────────────────────────────
双向               ❌          ❌          ✅          ✅
多客户端           ❌          ❌          ✅          ✅
消息边界           ❌          ❌          ❌(流式)    ✅
跨网络             ❌          ❌          ❌          ✅
异步 IO            select      select      epoll       IOCP
安全控制           文件权限    文件权限    文件权限    ACL

Windows Named Pipe 相当于 Linux UDS + 消息边界 + 跨网络
这就是为什么很多 Windows 应用偏爱 Named Pipe
```

------

## 阶段 7：整体架构对比

### 如何选择？

```
你的场景是什么？
│
├── 父子进程、简单数据传递？
│   └── 匿名管道（pipe）—— 最简单
│
├── 两个独立进程、一对一通信？
│   ├── Linux → FIFO 或 UDS
│   └── Windows → Named Pipe
│
├── 需要最快的速度？大量数据交换？
│   └── 共享内存 + 信号量/mutex
│       但要自己处理同步，复杂度高
│
├── 需要多个客户端连接同一个服务？
│   ├── Linux → Unix Domain Socket
│   └── Windows → Named Pipe
│
├── 将来可能跨网络？
│   ├── TCP Socket（最通用）
│   ├── Windows → Named Pipe（支持跨网络）
│   └── gRPC（现代方案，跨语言跨平台）
│
└── 不确定？
    └── 从 Unix Domain Socket 开始
        API 和 TCP 一样，将来容易切换到网络
```

### 完整对比表

```
              匿名管道    命名管道     共享内存     UDS        TCP
关系          父子进程    任意进程     任意进程     任意进程   跨网络
方向          单向        单向(Linux)  双向         双向       双向
多客户端      ❌          ❌           ❌(需设计)   ✅         ✅
速度          中          中           最快         快         慢
同步          自带        自带         需自行处理   自带       自带
消息边界      无          无           自定义       无(流式)   无(流式)
编程复杂度    简单        简单         复杂         中等       中等
跨网络        ❌          ❌           ❌           ❌         ✅
```

------

## TDD 全程回顾

```
整个开发过程：

阶段 0：协议
  ├── 15 个测试 → 定义序列化/反序列化/计算逻辑
  └── 后续所有阶段复用这套协议

阶段 1：匿名管道
  ├── 3 个测试 → 单次/多次/异常
  ├── 重构封装 PipeChannel
  └── 2 个测试 → 验证封装后仍正确

阶段 2：命名管道
  ├── 3 个测试 → 基本通信/多次调用/独立进程
  └── 证明不需要 fork 亲缘关系

阶段 3：共享内存
  ├── 3 个测试 → 单次/多次/大数字
  └── 证明零拷贝的正确性

阶段 4：Unix Domain Socket
  ├── 4 个测试 → 单客户端/多调用/多客户端/断连恢复
  └── 证明多客户端并发安全

阶段 5：基准测试
  └── 量化对比各方案性能

每一步的核心：
  不是"写完代码再补测试"
  而是"先写测试定义什么是对的，再写代码让测试通过"
```

------

## 速查表

```
管道创建        pipe(fd)                 mkfifo(path, mode)
共享内存        shm_open + ftruncate + mmap
信号量          sem_open + sem_post + sem_wait
UDS 创建        socket(AF_UNIX, SOCK_STREAM, 0)
UDS 地址        struct sockaddr_un { .sun_family=AF_UNIX, .sun_path=... }
可靠读写        循环 read/write 直到 n 字节完成
消息协议        [4字节长度前缀][消息体]
序列化          文本格式 "OP arg1 arg2"（简单）
                二进制格式 protobuf（生产级）
Windows         CreateNamedPipe / CreateFileMapping
性能排序        共享内存 > UDS > 管道 > TCP
灵活性排序      TCP > UDS > Named Pipe > 共享内存 > 管道
```

------

> IPC 不神秘——本质就是"两个进程怎么传数据"。管道最简单，共享内存最快，Socket 最灵活。先选最简单的能满足需求的方案，性能不够再升级。

> 本系列相关文章：
> - [网络编程与 IPC 面试题](/techlearn/posts/network-ipc-interview/) —— 理论问答
> - [锁、并发与内存模型面试题](/techlearn/posts/lock-concurrency-memory-model-interview/) —— 同步原语
> - [用 TDD 驱动线程安全 LRU Cache](/techlearn/posts/thread-safe-lru-cache-tdd/) —— 同样的方法论
> - [Google Test 实战教程](/techlearn/posts/google-test-guide/) —— TDD 工具链
