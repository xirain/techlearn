---
title: C++ 网络库实战指南 —— 不要手搓轮子，选对库事半功倍
description: 系统介绍 C++ 主流网络库（Boost.Asio、libevent、libuv、gRPC、cpp-httplib、Poco 等），覆盖选型建议、基本用法、注意事项和踩坑经验
date: 2026-02-26
categories: [编程语言]
tags: [c++, 网络库, boost, asio, grpc, http, websocket, 网络编程]
---

上一篇 [网络编程面试题](/techlearn/posts/network-ipc-interview/) 讲了底层原理，但实际开发中你不应该从 `socket()` + `epoll()` 开始手搓。选一个成熟的网络库，让你专注于业务逻辑而不是和字节序、粘包、异步回调搏斗。

这篇文章帮你搞清楚：有哪些库可选、各自擅长什么、怎么用、有什么坑。

------

## 全景对比：一张表看清所有选择

先看全貌，后面逐个详解：

```
库名             定位                  语言    异步模型       跨平台    难度    适合场景

Boost.Asio      通用异步 IO 框架       C++     Proactor       ✅       中高    需要精细控制的网络服务
                                                                             高性能服务器

cpp-httplib     轻量 HTTP 库           C++     同步/线程池     ✅       低     简单的 HTTP 服务/客户端
                (Header-only)                                                快速原型、工具

Poco            企业级应用框架          C++     多种            ✅       中     企业应用、HTTP/SMTP/FTP

libcurl         HTTP 客户端            C       同步+异步       ✅       低中   HTTP 客户端请求

gRPC            RPC 框架               多语言  异步            ✅       中     微服务间通信

libevent        事件驱动框架           C       Reactor         ✅       中     轻量级事件驱动服务器

libuv           异步 IO 框架           C       事件循环        ✅       中     跨平台异步 IO（Node.js 底层）

ZeroMQ          消息传递库             C       多种模式        ✅       中     分布式系统、消息队列

Muduo           Linux 网络库           C++     Reactor         Linux    中     Linux 高性能 TCP 服务器

Crow/Drogon     Web 框架               C++     异步            ✅       中     RESTful API 服务

Boost.Beast     HTTP/WebSocket         C++     基于 Asio       ✅       高     需要 WebSocket 或底层 HTTP 控制
```

------

## 一、Boost.Asio —— C++ 网络编程的"标准答案"

### 1.1 是什么

Boost.Asio 是 C++ 中最成熟、最主流的异步 IO 库。它不仅处理网络，还能处理定时器、信号、串口等异步操作。C++20 的 Networking TS（网络标准提案）就是以 Asio 为蓝本设计的。

```
地位：
├── Boost 库的一部分，但也可以独立使用（standalone Asio）
├── 几乎所有 C++ 网络框架的底层都用它
├── C++ 标准网络库的候选方案
└── 支持协程（C++20 co_await）
```

### 1.2 核心概念

```
Asio 的三大核心：

1. io_context（事件循环）
   所有异步操作的调度中心
   调用 io_context.run() 开始事件循环

2. Socket（网络操作对象）
   tcp::socket、udp::socket

3. 异步操作 + 回调
   async_read、async_write、async_accept
   操作完成后调用你提供的回调函数
```

### 1.3 同步 TCP 服务器（入门）

```cpp
#include <boost/asio.hpp>
using boost::asio::ip::tcp;

int main() {
    boost::asio::io_context io;

    // 监听 8080 端口
    tcp::acceptor acceptor(io, tcp::endpoint(tcp::v4(), 8080));

    while (true) {
        tcp::socket socket(io);
        acceptor.accept(socket);  // 阻塞等待连接

        // 读数据
        boost::asio::streambuf buf;
        boost::asio::read_until(socket, buf, "\n");
        std::string message = boost::asio::buffer_cast<const char*>(buf.data());

        // 写数据
        std::string response = "Echo: " + message;
        boost::asio::write(socket, boost::asio::buffer(response));
    }
}
```

### 1.4 异步 TCP 服务器（实战模式）

```cpp
#include <boost/asio.hpp>
#include <memory>
using boost::asio::ip::tcp;

class Session : public std::enable_shared_from_this<Session> {
    tcp::socket socket_;
    char data_[1024];

public:
    Session(tcp::socket socket) : socket_(std::move(socket)) {}

    void start() { doRead(); }

private:
    void doRead() {
        auto self = shared_from_this();  // 防止回调时对象已销毁
        socket_.async_read_some(
            boost::asio::buffer(data_, sizeof(data_)),
            [this, self](boost::system::error_code ec, size_t length) {
                if (!ec) {
                    doWrite(length);
                }
            });
    }

    void doWrite(size_t length) {
        auto self = shared_from_this();
        boost::asio::async_write(
            socket_, boost::asio::buffer(data_, length),
            [this, self](boost::system::error_code ec, size_t) {
                if (!ec) {
                    doRead();  // 写完继续读
                }
            });
    }
};

class Server {
    tcp::acceptor acceptor_;

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
                    std::make_shared<Session>(std::move(socket))->start();
                }
                doAccept();  // 继续等下一个连接
            });
    }
};

int main() {
    boost::asio::io_context io;
    Server server(io, 8080);
    io.run();  // 开始事件循环（阻塞在这里）
}
```

### 1.5 C++20 协程版（最现代的写法）

```cpp
#include <boost/asio.hpp>
#include <boost/asio/co_spawn.hpp>
#include <boost/asio/detached.hpp>
using boost::asio::ip::tcp;
using boost::asio::awaitable;
using boost::asio::use_awaitable;

awaitable<void> handleClient(tcp::socket socket) {
    char data[1024];
    while (true) {
        // co_await！看起来像同步代码，实际是异步执行
        auto n = co_await socket.async_read_some(
            boost::asio::buffer(data), use_awaitable);

        co_await boost::asio::async_write(
            socket, boost::asio::buffer(data, n), use_awaitable);
    }
}

awaitable<void> listener(tcp::acceptor acceptor) {
    while (true) {
        auto socket = co_await acceptor.async_accept(use_awaitable);
        co_spawn(acceptor.get_executor(), handleClient(std::move(socket)),
                 boost::asio::detached);
    }
}

int main() {
    boost::asio::io_context io;
    co_spawn(io, listener(tcp::acceptor(io, {tcp::v4(), 8080})),
             boost::asio::detached);
    io.run();
}

// 对比回调版：代码量减半，可读性翻倍
// 没有回调嵌套、没有 shared_from_this
// 异步代码看起来和同步一样直观
```

### 1.6 注意事项和常见坑

```
坑 1：对象生命周期
  异步回调执行时，对象可能已销毁
  解决：enable_shared_from_this + shared_ptr
        在回调中捕获 self = shared_from_this()

坑 2：线程安全
  io_context.run() 可以多线程调用（线程池模式）
  但同一个 socket 的操作不能并发
  解决：用 strand 串行化同一连接的操作
        boost::asio::strand<boost::asio::io_context::executor_type>

坑 3：忘记保持 io_context 有活干
  如果没有待处理的异步操作，io_context.run() 会立即返回
  解决：用 work_guard 保持 io_context 存活
        auto guard = boost::asio::make_work_guard(io);

坑 4：缓冲区生命周期
  async_write(buffer) 中的 buffer 必须在回调触发前保持有效
  解决：buffer 放在 Session 的成员变量中，或 shared_ptr 管理

坑 5：错误处理
  每个异步回调的第一个参数都是 error_code
  必须检查！忽略错误码 = 迟早崩溃
```

------

## 二、cpp-httplib —— 最简单的 HTTP 库

### 2.1 是什么

一个 Header-only 的 C++ HTTP/HTTPS 库。一个头文件搞定，不需要编译任何东西。适合快速搭建 HTTP 服务或发送 HTTP 请求。

```
优点：
├── 一个头文件（httplib.h），#include 即用
├── 同时支持 HTTP 服务器和客户端
├── 支持 HTTPS（需链接 OpenSSL）
├── 支持多线程处理请求
└── API 极其简洁

缺点：
├── 不是异步的（每个请求一个线程）
├── 不适合高并发场景（万级连接以上）
└── 不支持 WebSocket
```

### 2.2 HTTP 服务器（10 行搞定）

```cpp
#include "httplib.h"

int main() {
    httplib::Server svr;

    // GET 请求
    svr.Get("/hello", [](const httplib::Request& req, httplib::Response& res) {
        res.set_content("Hello, World!", "text/plain");
    });

    // 带参数的 GET
    svr.Get(R"(/users/(\d+))", [](const httplib::Request& req, httplib::Response& res) {
        auto id = req.matches[1];  // 正则捕获
        res.set_content("User ID: " + std::string(id), "text/plain");
    });

    // POST 请求（JSON）
    svr.Post("/api/data", [](const httplib::Request& req, httplib::Response& res) {
        auto body = req.body;  // 请求体
        res.set_content("{\"status\": \"ok\"}", "application/json");
    });

    // 静态文件服务
    svr.set_mount_point("/static", "./public");

    svr.listen("0.0.0.0", 8080);
}
```

### 2.3 HTTP 客户端

```cpp
#include "httplib.h"

// GET 请求
httplib::Client cli("http://httpbin.org");
auto res = cli.Get("/get");
if (res && res->status == 200) {
    std::cout << res->body << std::endl;
}

// POST JSON
httplib::Client cli("http://localhost:8080");
auto res = cli.Post("/api/data",
    "{\"name\": \"Alice\", \"age\": 30}",
    "application/json");

// 带 Header
httplib::Headers headers = {
    {"Authorization", "Bearer token123"},
    {"Accept", "application/json"}
};
auto res = cli.Get("/api/profile", headers);

// HTTPS
httplib::SSLClient cli("https://api.example.com");
cli.set_ca_cert_path("/etc/ssl/certs/ca-certificates.crt");
auto res = cli.Get("/secure");

// 超时设置
cli.set_connection_timeout(5);  // 连接超时 5 秒
cli.set_read_timeout(10);       // 读超时 10 秒
```

### 2.4 注意事项

```
1. 线程模型
   默认每个请求创建一个线程（或用线程池）
   svr.new_task_queue = [] { return new httplib::ThreadPool(8); };
   高并发场景不适合，但几百并发没问题

2. 大文件处理
   用流式 API，不要把整个文件读到内存
   svr.Get("/download", [](auto& req, auto& res) {
       res.set_content_provider(fileSize, "application/octet-stream",
           [](size_t offset, size_t length, auto& sink) {
               sink.write(data + offset, length);
               return true;
           });
   });

3. 编译注意
   Header-only 意味着编译时间较长（httplib.h 有 1 万多行）
   建议只在一个 .cpp 中 #include "httplib.h"
   其他文件前向声明或通过接口使用
```

------

## 三、libcurl —— HTTP 客户端之王

### 3.1 是什么

最流行的 HTTP 客户端库，几乎所有语言的 HTTP 库底层都是 libcurl。C 语言编写，但有很好的 C++ 封装。

```
特点：
├── 支持 HTTP/1.1、HTTP/2、HTTP/3
├── 支持几乎所有协议：FTP、SMTP、POP3、IMAP...
├── 极其成熟稳定（20+ 年历史）
├── 所有平台都有
└── 只做客户端，不做服务器
```

### 3.2 基本用法（C API）

```cpp
#include <curl/curl.h>

// 回调函数：接收响应数据
size_t writeCallback(void* contents, size_t size, size_t nmemb, std::string* out) {
    out->append((char*)contents, size * nmemb);
    return size * nmemb;
}

int main() {
    curl_global_init(CURL_GLOBAL_DEFAULT);
    CURL* curl = curl_easy_init();

    if (curl) {
        std::string response;

        curl_easy_setopt(curl, CURLOPT_URL, "https://api.example.com/data");
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, writeCallback);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
        curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);  // 超时 10 秒

        CURLcode res = curl_easy_perform(curl);

        if (res == CURLE_OK) {
            long http_code;
            curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);
            std::cout << "HTTP " << http_code << ": " << response << std::endl;
        } else {
            std::cerr << "Error: " << curl_easy_strerror(res) << std::endl;
        }

        curl_easy_cleanup(curl);
    }
    curl_global_cleanup();
}
```

### 3.3 POST 请求

```cpp
CURL* curl = curl_easy_init();
std::string response;

// JSON POST
const char* json = "{\"name\": \"Alice\"}";
struct curl_slist* headers = NULL;
headers = curl_slist_append(headers, "Content-Type: application/json");

curl_easy_setopt(curl, CURLOPT_URL, "https://api.example.com/users");
curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json);
curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, writeCallback);
curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);

curl_easy_perform(curl);

curl_slist_free_all(headers);
curl_easy_cleanup(curl);
```

### 3.4 推荐的 C++ 封装库

原生 C API 比较啰嗦，推荐用封装库：

```cpp
// curlpp（C++ 封装）
#include <curlpp/cURLpp.hpp>
#include <curlpp/Easy.hpp>
#include <curlpp/Options.hpp>

curlpp::Easy request;
request.setOpt(curlpp::options::Url("https://api.example.com/data"));
request.setOpt(curlpp::options::WriteStream(&std::cout));
request.perform();
```

### 3.5 注意事项

```
1. curl_global_init 不是线程安全的
   必须在程序启动时（主线程）调用一次
   curl_easy_* 是线程安全的（每个线程一个 CURL handle）

2. 内存管理
   curl_easy_init 必须配对 curl_easy_cleanup
   curl_slist_append 创建的链表必须 curl_slist_free_all
   推荐用 RAII 包装

3. HTTPS 证书验证
   默认验证服务器证书（这是好事！）
   如果连接失败检查 CA 证书路径：
   curl_easy_setopt(curl, CURLOPT_CAINFO, "/path/to/ca-bundle.crt");
   不要图省事关闭验证：CURLOPT_SSL_VERIFYPEER = 0  // ❌ 不安全

4. 超时设置
   一定要设超时！默认无超时，可能永远挂起
   CURLOPT_TIMEOUT         → 总超时（秒）
   CURLOPT_CONNECTTIMEOUT  → 连接超时（秒）
```

------

## 四、gRPC —— 微服务通信标准

### 4.1 是什么

Google 开源的 RPC 框架，用 Protocol Buffers 定义接口，基于 HTTP/2 传输。微服务架构中最流行的通信方式。

```
特点：
├── 跨语言（C++、Java、Go、Python、Rust...）
├── 高性能（HTTP/2 多路复用 + Protobuf 二进制序列化）
├── 支持四种通信模式（一元、服务端流、客户端流、双向流）
├── 内置认证、负载均衡、健康检查
└── 有完善的代码生成工具
```

### 4.2 定义服务（.proto 文件）

```protobuf
syntax = "proto3";

package example;

service Greeter {
    // 普通 RPC（一元调用）
    rpc SayHello (HelloRequest) returns (HelloReply);

    // 服务端流
    rpc ListUsers (ListRequest) returns (stream User);

    // 客户端流
    rpc UploadLogs (stream LogEntry) returns (Summary);

    // 双向流
    rpc Chat (stream Message) returns (stream Message);
}

message HelloRequest {
    string name = 1;
}

message HelloReply {
    string message = 1;
}
```

### 4.3 服务端实现

```cpp
#include <grpcpp/grpcpp.h>
#include "greeter.grpc.pb.h"

class GreeterService final : public Greeter::Service {
    grpc::Status SayHello(grpc::ServerContext* context,
                          const HelloRequest* request,
                          HelloReply* reply) override {
        reply->set_message("Hello, " + request->name() + "!");
        return grpc::Status::OK;
    }
};

int main() {
    std::string address = "0.0.0.0:50051";
    GreeterService service;

    grpc::ServerBuilder builder;
    builder.AddListeningPort(address, grpc::InsecureServerCredentials());
    builder.RegisterService(&service);

    auto server = builder.BuildAndStart();
    std::cout << "Server listening on " << address << std::endl;
    server->Wait();
}
```

### 4.4 客户端调用

```cpp
#include <grpcpp/grpcpp.h>
#include "greeter.grpc.pb.h"

int main() {
    auto channel = grpc::CreateChannel("localhost:50051",
                                       grpc::InsecureChannelCredentials());
    auto stub = Greeter::NewStub(channel);

    HelloRequest request;
    request.set_name("World");

    HelloReply reply;
    grpc::ClientContext context;
    context.set_deadline(std::chrono::system_clock::now() +
                         std::chrono::seconds(5));  // 超时

    grpc::Status status = stub->SayHello(&context, request, &reply);

    if (status.ok()) {
        std::cout << reply.message() << std::endl;  // "Hello, World!"
    } else {
        std::cerr << "RPC failed: " << status.error_message() << std::endl;
    }
}
```

### 4.5 注意事项

```
1. 编译复杂
   需要安装 protobuf + grpc
   CMake 配置较复杂
   建议用 vcpkg：vcpkg install grpc

2. 消息大小限制
   默认最大消息 4MB
   修改：builder.SetMaxReceiveMessageSize(64 * 1024 * 1024);

3. 连接管理
   Channel 是线程安全的，可以复用
   不要为每次调用创建新 Channel（开销大）
   auto channel = grpc::CreateChannel(...);  // 创建一次
   // 多个线程可以共享这个 channel

4. 错误处理
   用 Status 而不是异常
   检查 status.error_code() 和 status.error_message()
   常见错误码：UNAVAILABLE（服务不可达）、DEADLINE_EXCEEDED（超时）

5. 调试
   设置环境变量 GRPC_VERBOSITY=DEBUG 和 GRPC_TRACE=all
   或者用 grpcurl 命令行工具测试
```

------

## 五、libevent / libuv —— C 语言事件驱动库

### 5.1 libevent

```
定位：轻量级事件驱动库，封装了 epoll/kqueue/IOCP
代表用户：Memcached、Chromium（部分）、Tor
```

```cpp
#include <event2/event.h>
#include <event2/listener.h>
#include <event2/bufferevent.h>

// 读回调
void readCallback(struct bufferevent* bev, void* ctx) {
    char buf[1024];
    int n = bufferevent_read(bev, buf, sizeof(buf));
    bufferevent_write(bev, buf, n);  // Echo
}

// 新连接回调
void acceptCallback(struct evconnlistener* listener,
                    evutil_socket_t fd, struct sockaddr* addr,
                    int socklen, void* ctx) {
    auto base = evconnlistener_get_base(listener);
    auto bev = bufferevent_socket_new(base, fd, BEV_OPT_CLOSE_ON_FREE);
    bufferevent_setcb(bev, readCallback, NULL, NULL, NULL);
    bufferevent_enable(bev, EV_READ | EV_WRITE);
}

int main() {
    auto base = event_base_new();
    struct sockaddr_in sin = {};
    sin.sin_family = AF_INET;
    sin.sin_port = htons(8080);

    auto listener = evconnlistener_new_bind(base, acceptCallback, NULL,
        LEV_OPT_REUSEABLE | LEV_OPT_CLOSE_ON_FREE, -1,
        (struct sockaddr*)&sin, sizeof(sin));

    event_base_dispatch(base);  // 事件循环

    evconnlistener_free(listener);
    event_base_free(base);
}
```

### 5.2 libuv

```
定位：跨平台异步 IO 库（Node.js 的底层）
特点：统一的事件循环，支持文件 IO、子进程、DNS 等
代表用户：Node.js、Julia、Luvit
```

```cpp
#include <uv.h>

uv_loop_t* loop;

void onNewConnection(uv_stream_t* server, int status) {
    auto client = (uv_tcp_t*)malloc(sizeof(uv_tcp_t));
    uv_tcp_init(loop, client);
    uv_accept(server, (uv_stream_t*)client);
    uv_read_start((uv_stream_t*)client, allocBuffer, onRead);
}

int main() {
    loop = uv_default_loop();

    uv_tcp_t server;
    uv_tcp_init(loop, &server);

    struct sockaddr_in addr;
    uv_ip4_addr("0.0.0.0", 8080, &addr);
    uv_tcp_bind(&server, (const struct sockaddr*)&addr, 0);

    uv_listen((uv_stream_t*)&server, 128, onNewConnection);

    uv_run(loop, UV_RUN_DEFAULT);  // 事件循环
}
```

### 5.3 libevent vs libuv 对比

```
              libevent                 libuv

语言          C                        C
异步模型      Reactor                  事件循环（类 Proactor）
网络 IO       ✅                       ✅
文件 IO       ❌ (需要自己处理)          ✅ (线程池异步文件 IO)
子进程        ❌                        ✅
DNS           ✅ (内置异步 DNS)          ✅
定时器        ✅                        ✅
Windows       ⚠️ (支持但不完美)          ✅ (IOCP 原生支持)
线程池        ❌                        ✅ (内置)
代表用户      Memcached               Node.js

选择建议：
  纯网络服务器 → libevent 更轻量
  需要文件 IO + 子进程 + 跨平台 → libuv
  C++ 项目 → 优先考虑 Boost.Asio
```

------

## 六、Poco —— 企业级 C++ 应用框架

### 6.1 是什么

一个完整的 C++ 应用框架，不仅有网络，还包括日志、JSON、XML、数据库、加密等。适合需要"全家桶"的企业项目。

```
模块：
├── Poco::Net         → HTTP/HTTPS 客户端和服务器
├── Poco::Net::SSL    → TLS/SSL 支持
├── Poco::JSON        → JSON 解析和生成
├── Poco::XML         → XML 解析
├── Poco::Data        → 数据库抽象层（MySQL/SQLite/ODBC）
├── Poco::Crypto      → 加密和哈希
├── Poco::Util        → 配置文件、命令行解析
└── Poco::Logger      → 日志系统
```

### 6.2 HTTP 服务器

```cpp
#include <Poco/Net/HTTPServer.h>
#include <Poco/Net/HTTPRequestHandler.h>
#include <Poco/Net/HTTPResponse.h>
#include <Poco/Net/ServerSocket.h>

class HelloHandler : public Poco::Net::HTTPRequestHandler {
public:
    void handleRequest(Poco::Net::HTTPServerRequest& request,
                       Poco::Net::HTTPServerResponse& response) override {
        response.setContentType("text/plain");
        response.setStatus(Poco::Net::HTTPResponse::HTTP_OK);
        std::ostream& out = response.send();
        out << "Hello from Poco!";
    }
};

class HandlerFactory : public Poco::Net::HTTPRequestHandlerFactory {
public:
    Poco::Net::HTTPRequestHandler* createRequestHandler(
        const Poco::Net::HTTPServerRequest& request) override {
        return new HelloHandler;
    }
};

int main() {
    Poco::Net::ServerSocket socket(8080);
    Poco::Net::HTTPServer server(new HandlerFactory, socket,
                                  new Poco::Net::HTTPServerParams);
    server.start();
    // 等待退出信号...
    server.stop();
}
```

### 6.3 HTTP 客户端

```cpp
#include <Poco/Net/HTTPClientSession.h>
#include <Poco/Net/HTTPRequest.h>
#include <Poco/Net/HTTPResponse.h>
#include <Poco/StreamCopier.h>

Poco::Net::HTTPClientSession session("api.example.com", 80);

Poco::Net::HTTPRequest request(Poco::Net::HTTPRequest::HTTP_GET, "/data");
request.set("Accept", "application/json");
session.sendRequest(request);

Poco::Net::HTTPResponse response;
auto& body = session.receiveResponse(response);
std::string result;
Poco::StreamCopier::copyToString(body, result);

std::cout << response.getStatus() << ": " << result << std::endl;
```

------

## 七、WebSocket 相关库

### 7.1 选择方案

```
需要 WebSocket 的场景：实时聊天、推送通知、在线游戏、实时数据

方案选择：
├── Boost.Beast → 最底层，最灵活，和 Asio 配合
├── websocketpp → 老牌 WebSocket 库
├── uWebSockets → 极致性能（号称最快的 WebSocket 库）
└── Drogon/Crow → Web 框架内置 WebSocket 支持
```

### 7.2 Boost.Beast WebSocket 示例

```cpp
#include <boost/beast.hpp>
#include <boost/asio.hpp>
namespace beast = boost::beast;
namespace websocket = beast::websocket;
using tcp = boost::asio::ip::tcp;

// 同步 WebSocket 客户端
int main() {
    boost::asio::io_context io;
    tcp::resolver resolver(io);
    websocket::stream<tcp::socket> ws(io);

    auto results = resolver.resolve("echo.websocket.org", "80");
    boost::asio::connect(ws.next_layer(), results);

    ws.handshake("echo.websocket.org", "/");

    ws.write(boost::asio::buffer("Hello WebSocket!"));

    beast::flat_buffer buffer;
    ws.read(buffer);
    std::cout << beast::buffers_to_string(buffer.data()) << std::endl;

    ws.close(websocket::close_code::normal);
}
```

------

## 八、C++ Web 框架

### 8.1 Drogon —— 高性能异步 Web 框架

```
特点：
├── 基于事件循环的异步框架
├── 内置 ORM、WebSocket、HTTP 客户端
├── 性能极高（TechEmpower 排名靠前）
├── 支持 C++17 协程
└── 类似 Go 的 Gin 或 Python 的 FastAPI 的体验
```

```cpp
#include <drogon/drogon.h>

int main() {
    drogon::app()
        .addListener("0.0.0.0", 8080)

        .registerHandler("/hello",
            [](const drogon::HttpRequestPtr& req,
               std::function<void(const drogon::HttpResponsePtr&)>&& callback) {
                auto resp = drogon::HttpResponse::newHttpResponse();
                resp->setBody("Hello from Drogon!");
                callback(resp);
            })

        .registerHandler("/api/users/{id}",
            [](const drogon::HttpRequestPtr& req,
               std::function<void(const drogon::HttpResponsePtr&)>&& callback,
               const std::string& id) {
                Json::Value json;
                json["id"] = id;
                json["name"] = "Alice";
                auto resp = drogon::HttpResponse::newHttpJsonResponse(json);
                callback(resp);
            },
            {drogon::Get})

        .run();
}
```

### 8.2 Crow —— 轻量级 Web 框架

```
特点：
├── 灵感来自 Python Flask
├── Header-only
├── API 极简
└── 适合小型 API 服务
```

```cpp
#include "crow.h"

int main() {
    crow::SimpleApp app;

    CROW_ROUTE(app, "/")([]() {
        return "Hello, World!";
    });

    CROW_ROUTE(app, "/json")([]() {
        crow::json::wvalue result;
        result["status"] = "ok";
        result["count"] = 42;
        return result;
    });

    CROW_ROUTE(app, "/user/<int>")([](int id) {
        return "User: " + std::to_string(id);
    });

    app.port(8080).multithreaded().run();
}
```

------

## 九、ZeroMQ —— 消息传递库

### 9.1 是什么

不是传统的消息队列（不是 RabbitMQ/Kafka），而是一个**高性能消息传递库**，提供 Socket 级别的 API 但自带消息模式（发布订阅、请求响应、推拉等）。

```
消息模式：
├── REQ/REP   → 请求-响应（同步 RPC 风格）
├── PUB/SUB   → 发布-订阅（广播）
├── PUSH/PULL → 推-拉（任务分发/工作队列）
├── PAIR      → 一对一连接
└── ROUTER/DEALER → 异步请求-响应
```

### 9.2 请求-响应模式

```cpp
// 服务端
#include <zmq.hpp>

zmq::context_t context(1);
zmq::socket_t socket(context, zmq::socket_type::rep);
socket.bind("tcp://*:5555");

while (true) {
    zmq::message_t request;
    socket.recv(request, zmq::recv_flags::none);
    std::string msg(static_cast<char*>(request.data()), request.size());

    zmq::message_t reply(5);
    memcpy(reply.data(), "World", 5);
    socket.send(reply, zmq::send_flags::none);
}

// 客户端
zmq::context_t context(1);
zmq::socket_t socket(context, zmq::socket_type::req);
socket.connect("tcp://localhost:5555");

zmq::message_t request(5);
memcpy(request.data(), "Hello", 5);
socket.send(request, zmq::send_flags::none);

zmq::message_t reply;
socket.recv(reply, zmq::recv_flags::none);
```

------

## 十、选型决策树

```
你需要做什么？

├── 简单的 HTTP API 服务（几十并发）
│   └── cpp-httplib（一个头文件搞定）
│
├── RESTful Web 服务（中等并发）
│   └── Crow（轻量） 或 Drogon（高性能）
│
├── 需要发送 HTTP 请求（客户端）
│   ├── 简单场景 → cpp-httplib
│   └── 复杂场景（代理/Cookie/重定向/HTTP2） → libcurl
│
├── 高性能 TCP 服务器
│   ├── Linux only → Muduo
│   └── 跨平台 → Boost.Asio
│
├── 微服务间通信（RPC）
│   └── gRPC（业界标准）
│
├── 实时通信（WebSocket）
│   ├── 只需 WebSocket → uWebSockets
│   └── WebSocket + HTTP → Drogon 或 Boost.Beast
│
├── 分布式消息传递
│   └── ZeroMQ
│
├── 企业应用（HTTP + JSON + DB + 日志 全家桶）
│   └── Poco
│
└── 需要和 Node.js/Electron 集成
    └── libuv
```

------

## 十一、通用注意事项

### 11.1 所有网络库都要注意的事

```
1. 超时设置
   永远不要使用默认超时（可能是无限等待）
   连接超时 + 读超时 + 写超时 都要设

2. 错误处理
   网络操作随时可能失败
   每个操作都检查返回值/错误码
   断线重连要有退避策略（exponential backoff）

3. 缓冲区管理
   异步操作中缓冲区必须在回调前保持有效
   注意缓冲区大小限制（防止 OOM）

4. 线程安全
   大多数网络对象（socket、connection）不是线程安全的
   同一个连接的操作要串行化
   共享的连接池/数据结构需要加锁

5. 优雅关闭
   先停止接受新连接
   等待现有连接处理完毕
   设置关闭超时
   释放所有资源

6. 日志和监控
   记录连接数、请求量、错误率、延迟
   方便排查线上问题

7. HTTPS / TLS
   生产环境必须使用 HTTPS
   不要禁用证书验证
   注意证书过期和续期
```

### 11.2 性能调优通用建议

```
1. 连接复用
   不要为每次请求创建新连接
   用连接池 / HTTP Keep-Alive / gRPC Channel 复用

2. 减少拷贝
   用 move 语义传递缓冲区
   用 scatter/gather IO（readv/writev）
   大文件用 sendfile（零拷贝）

3. 批量操作
   多个小消息合并发送（Nagle 算法 或 手动 batch）
   如果需要低延迟，禁用 Nagle：TCP_NODELAY

4. 异步优先
   高并发场景用异步 IO（Asio / epoll / IOCP）
   同步模型在几百并发时就会成为瓶颈

5. 压缩
   HTTP 响应开启 gzip/brotli 压缩
   gRPC 默认支持压缩
```

### 11.3 CMake 集成示例

```cmake
cmake_minimum_required(VERSION 3.20)
project(MyServer LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)

# 方式 1：vcpkg（推荐）
# vcpkg install boost-asio grpc cpp-httplib
find_package(Boost REQUIRED COMPONENTS system)
find_package(gRPC CONFIG REQUIRED)

# 方式 2：FetchContent（自动下载）
include(FetchContent)
FetchContent_Declare(httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib
    GIT_TAG v0.15.0
)
FetchContent_MakeAvailable(httplib)

add_executable(server src/main.cpp)
target_link_libraries(server PRIVATE
    Boost::system
    httplib::httplib
)
```

------

## 总结

```
一句话选型：

"我就想发个 HTTP 请求"         → cpp-httplib（客户端）或 libcurl
"我要写个简单的 API 服务"       → cpp-httplib 或 Crow
"我要写高性能服务器"            → Boost.Asio
"微服务之间要通信"              → gRPC
"我需要 WebSocket"             → Boost.Beast 或 Drogon
"我要个全家桶"                  → Poco 或 Drogon
"我在做分布式系统"              → ZeroMQ
```

**核心原则：不要手搓轮子。** 网络编程的坑（粘包、断线重连、超时、并发、内存管理）前人都踩过了，选一个成熟的库让你专注在业务逻辑上。从最简单的库开始（cpp-httplib），随着需求增长再切换到更强大的库（Asio/gRPC）。

------

> 本文聚焦最常用的库和最实用的代码示例。每个库都有大量高级用法无法在一篇文章中覆盖，建议选定一个库后深入阅读其官方文档。配合 [网络编程面试题](/techlearn/posts/network-ipc-interview/) 理解底层原理，开发时事半功倍。
