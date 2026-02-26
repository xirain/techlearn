---
title: 网络编程与进程间通信面试题 —— 从 Socket 到 RPC 的深度问答
description: 覆盖 TCP/UDP、Socket 编程、IO 模型、epoll、进程间通信（管道/共享内存/消息队列/RPC）等高频面试题，补全 Windows 和 Linux 双平台知识
date: 2026-02-26
categories: [编程语言]
tags: [网络编程, socket, tcp, ipc, rpc, epoll, 面试, linux, windows]
---

这篇文章聚焦**网络编程**和**进程间通信（IPC）**的面试题，特别补充了 Windows RPC 的底层原理（不再只是"照着用"），以及 Linux 和 Windows 在这些领域的对比。

------

## 第一部分：TCP/UDP 基础

### Q1：TCP 和 UDP 的核心区别？

**记忆点：TCP 可靠有序有连接，UDP 不可靠无序无连接。TCP 牺牲速度换可靠，UDP 牺牲可靠换速度。**

```
                TCP                     UDP
连接           需要三次握手建立连接      无连接，直接发
可靠性         可靠（重传、确认、排序）   不可靠（可能丢包、乱序）
顺序           保证有序到达              不保证顺序
流量控制       有（滑动窗口）            无
拥塞控制       有（慢启动、拥塞避免）    无
传输单位       字节流（无边界）          数据报（有边界）
头部大小       20 字节起                 8 字节
适用场景       HTTP、FTP、数据库         DNS、视频直播、游戏
```

### Q2：TCP 三次握手的过程和原因？

**记忆点：SYN → SYN+ACK → ACK。三次是为了双方都确认自己的收发能力正常，两次不够（服务端不知道客户端能否收到自己的回复）。**

```
客户端                              服务端

  │  ── SYN (seq=x) ──────────>  │   第 1 次：客户端说"我要连接"
  │                               │   客户端确认：自己能发
  │  <── SYN+ACK (seq=y,ack=x+1) │   第 2 次：服务端说"收到，我也准备好了"
  │                               │   服务端确认：自己能收、能发
  │  ── ACK (ack=y+1) ─────────> │   第 3 次：客户端说"收到你的确认"
  │                               │   客户端确认：对方能收
  │         连接建立               │   双方都确认：收发正常

为什么不能两次？
  如果只有两次，服务端发了 SYN+ACK 就认为连接建立
  但客户端可能根本没收到 → 服务端白白分配资源
  经典场景：过期的 SYN 到达 → 服务端建立了一个"幽灵连接"
```

### Q3：TCP 四次挥手为什么是四次？

**记忆点：因为 TCP 是全双工的，每个方向的关闭需要独立的 FIN+ACK，所以是 2×2=4 次。中间有个 CLOSE_WAIT/TIME_WAIT。**

```
客户端                              服务端

  │  ── FIN ─────────────────>  │   第 1 次：客户端说"我发完了"
  │  <── ACK ─────────────────  │   第 2 次：服务端说"收到，但我可能还有数据要发"
  │                             │
  │        (服务端继续发数据)     │   ← 半关闭状态
  │                             │
  │  <── FIN ─────────────────  │   第 3 次：服务端说"我也发完了"
  │  ── ACK ─────────────────>  │   第 4 次：客户端说"收到"
  │                             │
  │  TIME_WAIT (等 2MSL)        │   ← 等待可能重传的 FIN
```

### Q4：TIME_WAIT 状态有什么用？为什么要等 2MSL？

**记忆点：防止最后一个 ACK 丢失导致对方重发 FIN 时找不到连接；防止旧连接的延迟数据包被新连接误收。2MSL 是一个报文在网络中最大存活时间的两倍。**

```
面试追问：TIME_WAIT 过多怎么办？

  ├── 现象：大量短连接的服务器上，端口被 TIME_WAIT 占满
  ├── 查看：netstat -an | grep TIME_WAIT | wc -l
  ├── 解决：
  │   ├── 开启 SO_REUSEADDR（允许重用处于 TIME_WAIT 的端口）
  │   ├── 调整内核参数 tcp_tw_reuse / tcp_tw_recycle
  │   ├── 使用长连接（HTTP Keep-Alive）减少连接频率
  │   └── 让客户端主动关闭（TIME_WAIT 出现在主动关闭的一方）
```

### Q5：TCP 粘包/拆包是怎么回事？

**记忆点：TCP 是字节流协议没有消息边界，多个 send 的数据可能被合并接收（粘包）或一个 send 的数据被拆成多次接收（拆包）。**

```
发送端：
  send("Hello")
  send("World")

接收端可能收到：
  情况 1（正常）：  "Hello" + "World"
  情况 2（粘包）：  "HelloWorld"
  情况 3（拆包）：  "Hel" + "loWorld"
  情况 4（混合）：  "HelloWor" + "ld"

解决方案：
  ├── 固定长度：每个消息固定 N 字节
  ├── 分隔符：用 \r\n 或特殊字符分隔消息
  ├── 长度前缀：消息头部写明消息体长度（最常用）
  │   [4字节长度][消息体...]
  └── 应用层协议：HTTP 的 Content-Length / chunked

  注意：UDP 没有粘包问题（每个数据报是独立的）
```

### Q6：TCP 的滑动窗口和拥塞控制？

**记忆点：滑动窗口做流量控制（接收方告诉发送方"我还能收多少"），拥塞控制做网络保护（避免往网络里灌太多数据）。**

```
滑动窗口（Flow Control）：
  接收方通过 ACK 中的 window size 告诉发送方：
  "我的缓冲区还剩 X 字节，你别发太多"

  发送方            接收方
  ──数据──>        缓冲区 [██████░░░░]  window=4
  ──数据──>        缓冲区 [████████░░]  window=2
  ──数据──>        缓冲区 [██████████]  window=0 ← 停！
  (等待...)         应用读取数据
                   缓冲区 [████░░░░░░]  window=6 ← 可以继续发了

拥塞控制（Congestion Control）四个阶段：
  1. 慢启动（Slow Start）：指数增长，cwnd 每 RTT 翻倍
  2. 拥塞避免（Congestion Avoidance）：到阈值后线性增长
  3. 快重传（Fast Retransmit）：收到 3 个重复 ACK → 立即重传
  4. 快恢复（Fast Recovery）：不从 1 开始，从阈值/2 开始
```

------

## 第二部分：Socket 编程

### Q7：Socket 编程的基本流程？

**记忆点：服务端 socket→bind→listen→accept→read/write→close；客户端 socket→connect→read/write→close。**

```
服务端                              客户端

socket()    创建套接字               socket()    创建套接字
  │                                   │
bind()      绑定地址和端口             │
  │                                   │
listen()    开始监听                   │
  │                                   │
accept()  ← 阻塞等待连接 ──────────── connect()   发起连接
  │         返回新的 socket fd         │
  │                                   │
read()   <──────────────────────────  write()    发送数据
write()  ──────────────────────────>  read()     接收数据
  │                                   │
close()     关闭连接                  close()    关闭连接
```

```cpp
// Linux 代码骨架（服务端）
int server_fd = socket(AF_INET, SOCK_STREAM, 0);

struct sockaddr_in addr;
addr.sin_family = AF_INET;
addr.sin_addr.s_addr = INADDR_ANY;
addr.sin_port = htons(8080);

bind(server_fd, (struct sockaddr*)&addr, sizeof(addr));
listen(server_fd, SOMAXCONN);

int client_fd = accept(server_fd, NULL, NULL);
char buf[1024];
int n = read(client_fd, buf, sizeof(buf));
write(client_fd, "OK", 2);
close(client_fd);
close(server_fd);
```

### Q8：Windows 和 Linux 的 Socket API 差异？

**记忆点：核心 API 几乎一致（BSD Socket 标准），但 Windows 要先 WSAStartup 初始化，用 closesocket 而非 close，错误码用 WSAGetLastError。**

```
                    Linux               Windows

初始化              不需要               WSAStartup(MAKEWORD(2,2), &wsaData)
头文件              <sys/socket.h>       <winsock2.h> + <ws2tcpip.h>
                   <netinet/in.h>
                   <unistd.h>
关闭 socket         close(fd)            closesocket(sock)
错误码              errno                WSAGetLastError()
描述符类型          int (fd)             SOCKET (typedef UINT_PTR)
IO 模型             epoll                IOCP
非阻塞设置          fcntl(fd, F_SETFL)   ioctlsocket(sock, FIONBIO)
清理                不需要               WSACleanup()
链接库              不需要               ws2_32.lib

// Windows 代码额外步骤
WSADATA wsaData;
WSAStartup(MAKEWORD(2, 2), &wsaData);  // 必须先初始化
// ... socket 操作 ...
WSACleanup();  // 程序结束时清理
```

------

## 第三部分：IO 模型

### Q9：五种 IO 模型是什么？

**记忆点：阻塞、非阻塞、IO 多路复用、信号驱动、异步 IO。前四种本质都是同步（需要自己读数据），只有 AIO 是真异步。**

```
① 阻塞 IO（Blocking IO）
   调用 read() → 如果没数据就一直等 → 有数据了才返回
   类比：你在餐厅等位，站在门口干等

② 非阻塞 IO（Non-blocking IO）
   调用 read() → 没数据立即返回 EAGAIN → 你自己轮询
   类比：你每隔 5 分钟去问一次"有位子了吗"

③ IO 多路复用（select/poll/epoll）
   用一个系统调用监视多个 fd → 哪个就绪通知你 → 再去读
   类比：服务员帮你盯着所有桌子，哪桌空了告诉你

④ 信号驱动 IO（Signal-driven IO）
   注册 SIGIO 信号 → 数据就绪时内核发信号给你 → 你再去读
   类比：留个电话号码，有位子了餐厅打电话通知你

⑤ 异步 IO（Asynchronous IO）
   发起 aio_read() → 内核完成所有工作（等待+复制）→ 通知你"已经读好放在缓冲区了"
   类比：外卖送到你手里，你啥都不用干
```

### Q10：select、poll、epoll 的区别？

**记忆点：select 有 1024 fd 限制且每次全量拷贝；poll 去掉了限制但还是线性扫描；epoll 用事件驱动只通知就绪的 fd，O(1) 效率。**

```
              select          poll           epoll
───────────────────────────────────────────────────
fd 数量限制    1024(FD_SETSIZE) 无限制          无限制
数据结构       fd_set 位图      pollfd 数组     红黑树 + 就绪链表
每次调用       全量拷贝 fd 集   全量拷贝 fd 集  不需要重复拷贝
返回后         遍历所有 fd      遍历所有 fd     只返回就绪的 fd
时间复杂度     O(n)            O(n)           O(1) 事件通知
触发模式       水平触发(LT)    水平触发(LT)    LT + 边缘触发(ET)
跨平台         ✅ 全平台        ✅ Unix 系      ❌ 仅 Linux
```

```cpp
// epoll 使用示例
int epfd = epoll_create1(0);

struct epoll_event ev;
ev.events = EPOLLIN | EPOLLET;  // 边缘触发
ev.data.fd = server_fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, server_fd, &ev);

struct epoll_event events[MAX_EVENTS];
while (true) {
    int n = epoll_wait(epfd, events, MAX_EVENTS, -1);
    for (int i = 0; i < n; i++) {
        if (events[i].data.fd == server_fd) {
            // 新连接
        } else {
            // 数据可读
        }
    }
}
```

### Q11：epoll 的 LT（水平触发）和 ET（边缘触发）的区别？

**记忆点：LT 只要 fd 有数据就一直通知（数据没读完下次还通知）；ET 只在状态变化时通知一次（数据没读完不再通知，必须一次读完）。**

```
LT（水平触发，默认）：
  数据到达 → 通知你 → 你只读了一部分 → 下次 epoll_wait 还会通知你
  特点：编程简单，不会丢数据
  类比：闹钟响了你没起床，它会一直响

ET（边缘触发）：
  数据到达 → 通知你一次 → 你必须一次读完（循环读直到 EAGAIN）
  特点：效率更高（减少通知次数），但编程复杂，必须用非阻塞 IO
  类比：闹钟只响一次，没起床就没了

ET 的必须搭配：
  ├── 非阻塞 fd（否则最后一次 read 会卡住）
  └── 循环读直到 EAGAIN
  while (true) {
      n = read(fd, buf, sizeof(buf));
      if (n == -1 && errno == EAGAIN) break;  // 读完了
      process(buf, n);
  }
```

### Q12：Windows 的 IOCP 是什么？和 epoll 对比？

**记忆点：IOCP 是 Windows 的异步 IO 完成端口，是真正的异步（内核完成数据拷贝后通知你）。epoll 是同步多路复用（通知你数据就绪，你自己读）。IOCP 是 Proactor 模式，epoll 是 Reactor 模式。**

```
epoll（Reactor 模式）：
  1. epoll_wait 通知你：fd 上有数据可读了
  2. 你自己调用 read() 把数据从内核复制到用户空间
  3. 你处理数据
  ← 通知就绪 + 自己读

IOCP（Proactor 模式）：
  1. 你先提交一个异步读请求（WSARecv），带上缓冲区
  2. 内核在后台完成读操作，数据直接放到你的缓冲区
  3. GetQueuedCompletionStatus 通知你：数据已经读好了
  ← 内核全包了，通知完成

对比：
              epoll                IOCP
模式          Reactor              Proactor
数据拷贝      应用层自己做          内核帮你做好
真异步        否（IO 多路复用）     是（真正异步 IO）
线程模型      通常单线程事件循环    天然多线程（线程池）
编程复杂度    相对简单              较复杂（异步思维）
平台          Linux                Windows
```

```cpp
// IOCP 基本流程
HANDLE iocp = CreateIoCompletionPort(INVALID_HANDLE_VALUE, NULL, 0, 0);

// 将 socket 关联到 IOCP
CreateIoCompletionPort((HANDLE)clientSocket, iocp, (ULONG_PTR)context, 0);

// 发起异步读（不会阻塞）
WSARecv(clientSocket, &dataBuf, 1, &bytesRecv, &flags, &overlapped, NULL);

// 工作线程等待完成通知
while (true) {
    GetQueuedCompletionStatus(iocp, &bytesTransferred, &key, &overlapped, INFINITE);
    // 到这里时，数据已经在 dataBuf 里了！
    processData(dataBuf, bytesTransferred);
}
```

------

## 第四部分：网络编程模型

### Q13：Reactor 和 Proactor 模式的区别？

**记忆点：Reactor 是"通知你事件就绪，你自己处理"；Proactor 是"帮你处理好了，通知你已完成"。Reactor = 我告诉你水烧开了你自己倒；Proactor = 我帮你倒好了告诉你可以喝了。**

```
Reactor（Linux 主流：epoll）：
  注册事件 → 等待就绪 → 回调处理（自己读写）
  代表：libevent、libev、Muduo、Redis、Nginx

Proactor（Windows 主流：IOCP）：
  发起异步操作 → 等待完成 → 回调处理（数据已就绪）
  代表：Boost.Asio（跨平台封装，Linux 上模拟 Proactor）
```

### Q14：常见的服务器并发模型？

**记忆点：从简单到复杂 —— 单线程阻塞 → 多进程 → 多线程 → 线程池 → IO多路复用 → Reactor → 主从 Reactor。**

```
① 每连接一进程（fork 模型）
   accept → fork → 子进程处理
   简单但开销大，进程创建/切换成本高

② 每连接一线程
   accept → 创建线程 → 线程处理
   比进程轻量但线程数有上限（万级连接就撑不住）

③ 线程池
   预先创建 N 个线程 → accept 后把连接分配给空闲线程
   避免频繁创建/销毁线程，但仍受线程数限制

④ 单 Reactor 单线程（Redis 模型）
   一个线程 epoll 处理所有连接
   简单高效但无法利用多核

⑤ 单 Reactor 多线程
   主线程 epoll 接收事件 → 分发给工作线程池处理
   利用多核但 Reactor 本身可能成瓶颈

⑥ 主从 Reactor（Nginx/Netty 模型）
   主 Reactor 只负责 accept → 分配给从 Reactor
   每个从 Reactor 在自己的线程中处理 IO
   目前最主流的高性能方案

⑥ 的结构图：
  主线程 (Main Reactor)
    │  accept 新连接
    ├──────────> 从 Reactor 1 (线程1)：处理连接 1,2,3
    ├──────────> 从 Reactor 2 (线程2)：处理连接 4,5,6
    └──────────> 从 Reactor 3 (线程3)：处理连接 7,8,9
```

------

## 第五部分：进程间通信（IPC）

### Q15：Linux 有哪些 IPC 方式？各自特点？

**记忆点：管道（父子进程）、命名管道/FIFO（任意进程）、消息队列（带类型的消息）、共享内存（最快）、信号量（同步）、Socket（跨网络）、信号（异步通知）。**

```
IPC 方式        速度    方向       关系要求    适用场景

管道 (pipe)     中      单向       父子进程    简单数据流 (shell 管道)
命名管道(FIFO)  中      单向/双向  任意进程    无亲缘关系的进程通信
消息队列        中      双向       任意进程    结构化消息传递
共享内存        最快    双向       任意进程    大量数据交换（需自行同步）
信号量          N/A     N/A       任意进程    同步/互斥（不传数据）
信号(signal)    快      单向       任意进程    异步事件通知（SIGTERM 等）
Unix Socket     中      双向       同一台机器  类似网络通信但更快
TCP/UDP Socket  慢      双向       跨网络      跨机器通信
```

### Q16：管道（pipe）的原理？

**记忆点：管道是内核中的一块缓冲区（默认 64KB），写端写入、读端读出，单向半双工。匿名管道只能用于有亲缘关系的进程（fork 继承 fd），命名管道（FIFO）可用于任意进程。**

```cpp
// 匿名管道
int pipefd[2];
pipe(pipefd);     // pipefd[0] 读端, pipefd[1] 写端

if (fork() == 0) {
    // 子进程：写
    close(pipefd[0]);
    write(pipefd[1], "hello", 5);
    close(pipefd[1]);
} else {
    // 父进程：读
    close(pipefd[1]);
    char buf[10];
    read(pipefd[0], buf, sizeof(buf));
    close(pipefd[0]);
}

// 命名管道
mkfifo("/tmp/myfifo", 0666);
// 进程 A: open("/tmp/myfifo", O_WRONLY) → write
// 进程 B: open("/tmp/myfifo", O_RDONLY) → read
```

### Q17：共享内存为什么最快？怎么用？

**记忆点：共享内存直接让两个进程映射同一块物理内存，不需要内核中转（零拷贝），所以最快。但需要自行用信号量或互斥锁做同步。**

```
其他 IPC 的数据流：
  进程A → 用户空间拷贝到内核 → 内核拷贝到进程B 用户空间
  两次拷贝！

共享内存的数据流：
  进程A ───┐
            ├── 直接读写同一块物理内存
  进程B ───┘
  零拷贝！
```

```cpp
// POSIX 共享内存（Linux）
int fd = shm_open("/my_shm", O_CREAT | O_RDWR, 0666);
ftruncate(fd, 4096);
void* ptr = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);

// 现在 ptr 指向的内存两个进程都能访问
sprintf((char*)ptr, "Hello from process A");

// 进程 B 同样 shm_open + mmap 后就能读到数据

// Windows 共享内存
HANDLE hMap = CreateFileMapping(INVALID_HANDLE_VALUE, NULL,
                                PAGE_READWRITE, 0, 4096, "MySharedMem");
void* ptr = MapViewOfFile(hMap, FILE_MAP_ALL_ACCESS, 0, 0, 4096);
```

### Q18：消息队列（Message Queue）的特点？

**记忆点：消息队列在内核中维护一个消息链表，支持按消息类型读取（可以选择性接收），自带同步（不需要额外加锁），消息有边界不会粘包。**

```cpp
// POSIX 消息队列
mqd_t mq = mq_open("/my_queue", O_CREAT | O_RDWR, 0666, &attr);
mq_send(mq, "hello", 5, priority);
mq_receive(mq, buf, sizeof(buf), &priority);

// 对比管道 vs 消息队列：
// 管道：字节流，无边界，FIFO
// 消息队列：消息为单位，有边界，可按优先级/类型
```

### Q19：Windows 有哪些 IPC 方式？

**记忆点：除了和 Linux 共有的 Socket/管道/共享内存，Windows 还有特有的 COM、WM_COPYDATA、Mailslot、Named Pipe（双向）和 RPC。**

```
Windows IPC 方式          特点

匿名管道 (Anonymous Pipe)  类似 Linux pipe，父子进程间
命名管道 (Named Pipe)       双向通信！不同于 Linux FIFO
                           支持网络透明（\\server\pipe\name）
                           Windows 上最常用的本地 IPC
共享内存 (File Mapping)     CreateFileMapping + MapViewOfFile
WM_COPYDATA                通过窗口消息传递数据（仅 GUI 程序）
Mailslot                   单向广播式通信
COM/DCOM                   组件对象模型（进程间方法调用）
Windows RPC                远程过程调用框架
Socket                     和 Linux 一致
剪贴板 (Clipboard)         最简单但最受限
```

```
Windows Named Pipe vs Linux FIFO：

                Windows Named Pipe       Linux FIFO
方向            双向（全双工）            单向（半双工）
网络透明        ✅ 可跨机器               ❌ 仅本机
消息模式        支持消息/字节流            仅字节流
安全性          支持 ACL 权限控制          文件权限
异步            支持 Overlapped IO        需要非阻塞 IO
```

------

## 第六部分：RPC 深入理解

### Q20：RPC 到底是什么？

**记忆点：RPC（远程过程调用）让你像调用本地函数一样调用远程机器上的函数。底层封装了序列化、网络传输、反序列化的全部细节。**

```
本地函数调用：
  result = add(1, 2);   // 直接调用，同一进程

RPC 调用（看起来一样）：
  result = add(1, 2);   // 实际上：
                         // 1. 把参数 (1,2) 序列化成字节流
                         // 2. 通过网络发送到远程服务器
                         // 3. 远程服务器反序列化，执行 add(1,2)
                         // 4. 把结果 3 序列化
                         // 5. 通过网络发回
                         // 6. 本地反序列化得到结果 3
                         // 你感觉不到这些细节
```

### Q21：RPC 的完整调用流程？

**记忆点：Client Stub（客户端桩）序列化参数 → 网络传输 → Server Stub（服务端桩）反序列化 → 执行 → 原路返回结果。Stub 就是"代理人"。**

```
客户端                                  服务端

  应用代码                               实际函数
  result = add(1, 2)                    int add(int a, int b)
      │                                      ▲
      ▼                                      │
  Client Stub（客户端代理）              Server Stub（服务端代理）
  ├── 把函数名、参数序列化               ├── 反序列化参数
  │   → {func:"add", args:[1,2]}       │   → a=1, b=2
  ├── 封装成网络消息                     ├── 调用真正的 add(1,2)
  │                                    ├── 序列化返回值 → {result:3}
  │                                    │
  └──── 网络传输（TCP/HTTP/...）────────┘

  "Stub" 这个词的意思 = 存根/桩
  它是一个代理，帮你处理序列化和网络通信的全部细节
```

### Q22：Windows RPC 的架构？（你之前用过的那个）

**记忆点：Windows RPC 用 IDL 文件定义接口 → MIDL 编译器生成 Stub 代码 → 客户端和服务端各拿一半 Stub → 运行时通过 RPC Runtime 通信。**

```
开发流程：

Step 1: 写 IDL 文件（接口定义语言）
  ┌─────────────────────────────────────┐
  │ // calculator.idl                   │
  │ [uuid(12345678-...)]                │
  │ interface ICalculator {             │
  │     int Add([in] int a, [in] int b);│
  │     int Multiply([in] int a,        │
  │                  [in] int b);       │
  │ }                                   │
  └─────────────────────────────────────┘

Step 2: MIDL 编译器处理 IDL
  midl calculator.idl
  生成：
  ├── calculator_h.h     → 公共头文件（接口定义）
  ├── calculator_c.c     → Client Stub（客户端代理代码）
  ├── calculator_s.c     → Server Stub（服务端代理代码）
  └── dlldata.c          → 辅助代码

Step 3: 客户端代码
  // 绑定到服务端
  RpcStringBindingCompose(NULL, "ncacn_np", "\\\\server",
                          "\\pipe\\calculator", NULL, &binding);
  RpcBindingFromStringBinding(binding, &hBinding);

  // 调用（看起来就像本地函数！）
  int result = Add(hBinding, 1, 2);  // 实际通过网络调用

Step 4: 服务端代码
  // 注册接口
  RpcServerRegisterIf(ICalculator_v1_0_s_ifspec, NULL, NULL);
  // 监听
  RpcServerUseProtseqEp("ncacn_np", max_calls, "\\pipe\\calculator", NULL);
  RpcServerListen(1, max_calls, FALSE);

  // 实现真正的函数
  int Add(handle_t h, int a, int b) { return a + b; }
```

```
Windows RPC 分层架构：

  你的代码（调用 Add(1,2)）
       │
  Client Stub（MIDL 自动生成）
  ├── 序列化参数（NDR 格式）
  │
  RPC Runtime（rpcrt4.dll）
  ├── 连接管理
  ├── 安全认证
  ├── 重试/超时
  │
  传输协议
  ├── ncacn_np   → Named Pipe（最常用于本机/局域网）
  ├── ncacn_ip_tcp → TCP
  ├── ncalrpc     → 本机 LPC（最快，同一台机器内）
  └── ncacn_http  → HTTP（穿越防火墙）
       │
    网络
       │
  Server Stub → 反序列化 → 调用真正的函数
```

### Q23：为什么说你之前"只会照着用"？哪些细节容易被追问？

**记忆点：IDL 语法细节、NDR 序列化格式、绑定方式（字符串绑定 vs 端点映射）、安全认证（NTLM/Kerberos）、内存管理（MIDL_user_allocate）、异步 RPC。**

```
面试常见追问及回答要点：

Q: IDL 中 [in]、[out]、[in,out] 是什么意思？
A: 数据方向标记
   [in] = 客户端 → 服务端（参数传入）
   [out] = 服务端 → 客户端（结果传出）
   [in,out] = 双向（传入并可能被修改后返回）
   这决定了 Stub 代码序列化哪些数据

Q: RPC 的内存谁负责释放？
A: 遵循"谁分配谁释放"原则
   [in] 参数：客户端分配和释放
   [out] 参数：服务端分配（用 MIDL_user_allocate），客户端释放（用 MIDL_user_free）
   这两个函数你必须实现！

Q: 绑定句柄（Binding Handle）有哪几种？
A: 三种
   ├── 自动绑定（auto_handle）：最简单，MIDL 自动处理
   ├── 隐式绑定（implicit_handle）：全局绑定句柄
   └── 显式绑定（explicit_handle）：每个调用可以用不同的服务端
   显式最灵活但最啰嗦

Q: NDR（Network Data Representation）是什么？
A: Windows RPC 的序列化格式
   处理不同架构的字节序、对齐、类型大小差异
   类似 Google 的 protobuf，但更老也更底层

Q: RPC 的安全认证？
A: RPC Runtime 支持多种安全提供者：
   ├── NTLM（传统 Windows 认证）
   ├── Kerberos（域环境推荐）
   ├── SCHANNEL（SSL/TLS）
   └── 可以设置认证级别：
       RPC_C_AUTHN_LEVEL_NONE      → 不认证
       RPC_C_AUTHN_LEVEL_CONNECT   → 连接时认证
       RPC_C_AUTHN_LEVEL_PKT_INTEGRITY → 每包完整性校验
       RPC_C_AUTHN_LEVEL_PKT_PRIVACY   → 每包加密
```

### Q24：现代 RPC 框架对比？

**记忆点：Windows RPC 是微软专有的。现代跨平台 RPC 首选 gRPC（Google，用 protobuf，HTTP/2）。**

```
              Windows RPC      gRPC            Thrift
公司          Microsoft        Google          Facebook(Meta)
IDL           MIDL (.idl)      Protobuf(.proto) Thrift (.thrift)
序列化        NDR              Protobuf         Thrift Binary
传输          Named Pipe/TCP   HTTP/2           TCP
跨语言        主要 C/C++       多语言           多语言
跨平台        仅 Windows       全平台           全平台
流式传输      不支持           支持（双向流）    不支持
现状          遗留系统         主流首选         仍在使用
```

```protobuf
// gRPC 的 IDL 长这样（.proto 文件）
syntax = "proto3";

service Calculator {
    rpc Add (AddRequest) returns (AddResponse);
    rpc ServerStream (Request) returns (stream Response);  // 服务端流
}

message AddRequest {
    int32 a = 1;
    int32 b = 2;
}

message AddResponse {
    int32 result = 1;
}
```

------

## 第七部分：网络编程实战问题

### Q25：如何处理大量并发连接？（C10K / C10M 问题）

**记忆点：C10K 用 epoll/IOCP + 非阻塞 IO + 事件驱动已经解决；C10M 需要内核旁路（DPDK/XDP）、零拷贝、无锁数据结构。**

```
C10K（万级连接）解决方案：
  ├── IO 多路复用（epoll / IOCP）
  ├── 非阻塞 IO
  ├── 事件驱动架构（Reactor）
  └── 连接池 + 线程池

C10M（千万级连接）额外需要：
  ├── 内核旁路（Bypass Kernel）：DPDK 直接在用户态处理网络包
  ├── 零拷贝（Zero-copy）：sendfile、mmap、splice
  ├── 无锁编程
  └── CPU 亲和性绑定
```

### Q26：什么是零拷贝（Zero-Copy）？

**记忆点：传统文件发送需要 4 次拷贝（磁盘→内核→用户→内核→网卡），零拷贝通过 sendfile/mmap 减少到 2 次（磁盘→内核→网卡），数据不经过用户空间。**

```
传统发送文件：
  磁盘 →① 内核缓冲区 →② 用户缓冲区 →③ Socket 缓冲区 →④ 网卡
  4 次拷贝，2 次用户态/内核态切换

sendfile 零拷贝：
  磁盘 →① 内核缓冲区 ──────────────→② 网卡
  2 次拷贝，0 次用户态拷贝
  数据全程不经过用户空间

// Linux
sendfile(socket_fd, file_fd, &offset, count);

// Windows（TransmitFile）
TransmitFile(socket, fileHandle, 0, 0, NULL, NULL, 0);
```

### Q27：心跳机制怎么设计？

**记忆点：定时发送小包探测连接是否存活。TCP 自带 Keep-Alive（默认 2 小时太长），应用层心跳更灵活。客户端定时发 Ping，服务端回 Pong，超时未收到 Pong 则断开重连。**

```
应用层心跳设计：
  客户端每 30 秒发送 PING
  服务端收到后回复 PONG
  客户端连续 3 次没收到 PONG → 判定连接断开 → 重连

  优于 TCP Keep-Alive 的原因：
  ├── TCP Keep-Alive 默认 2 小时才检测
  ├── 某些 NAT/防火墙会静默丢弃 Keep-Alive 包
  ├── 应用层心跳可以携带业务数据（如负载信息）
  └── 可以精细控制超时策略
```

------

## 速查表

```
TCP 三握手    SYN → SYN+ACK → ACK（双方确认收发能力）
TCP 四挥手    FIN → ACK → FIN → ACK（全双工各自关闭）
TIME_WAIT    主动关闭方等 2MSL（防 ACK 丢失 + 防旧包串线）
粘包解决      长度前缀 / 分隔符 / 固定长度
IO 模型       阻塞 / 非阻塞 / 多路复用 / 信号驱动 / 异步
epoll vs IOCP  Reactor(通知就绪) vs Proactor(通知完成)
LT vs ET      持续通知 vs 只通知一次
IPC 最快      共享内存（零拷贝，但需自行同步）
RPC 本质      序列化 → 网络传输 → 反序列化 → 调用 → 原路返回
Win RPC       IDL → MIDL编译 → Stub → RPC Runtime → 传输协议
gRPC          Protobuf + HTTP/2，现代 RPC 首选
零拷贝        sendfile / mmap，数据不经过用户空间
```

------

> 下篇将深入讲解 [锁、并发编程与内存模型](/techlearn/posts/lock-concurrency-memory-model-interview/) 的面试题。
