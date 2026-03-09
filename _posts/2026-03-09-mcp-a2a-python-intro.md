---
title: MCP 与 A2A 入门：从概念到 Python 实战
description: 深入浅出理解 MCP 和 A2A 的核心思想、差异与协同方式，并通过两个简洁的 Python 示例快速上手。
date: 2026-03-09
categories: [AI工程]
tags: [mcp, a2a, python, agent, protocol]
---

## 为什么你会经常同时听到 MCP 和 A2A？

如果你最近在做 AI Agent 项目，大概率会遇到两个高频词：**MCP（Model Context Protocol）** 和 **A2A（Agent-to-Agent）**。

很多同学一开始会困惑：

- MCP 和 A2A 是不是同一个东西？
- 都是“让模型干活”，那它们的边界在哪里？
- 实际工程里，是二选一，还是组合使用？

先给一个直观结论：

- **MCP 更像“给 Agent 接工具和上下文的标准插座”**；
- **A2A 更像“让多个 Agent 彼此协作的沟通协议”**。

一句话记忆：**MCP 解决“怎么用工具”，A2A 解决“怎么找同伴协作”**。

---

## MCP 是什么？

### 核心定位

MCP 的目标是把“外部能力”标准化地暴露给模型或 Agent，例如：

- 文件系统读取；
- 数据库查询；
- 调用内部 API；
- 执行受控脚本。

以前每接一个工具都要写一套定制 glue code；有了 MCP 以后，工具提供方按 MCP 协议实现一个服务端，Agent 侧按 MCP 客户端方式接入，就能复用统一接口。

### 你可以把它理解成

- **USB-C 接口**：形态统一，背后设备多样；
- **“工具菜单”协议**：先告诉你我有哪些工具、参数怎么填，再执行调用并返回结构化结果。

### MCP 的典型交互流程

1. Client 连接 MCP Server；
2. 读取 server 能提供的 tools / resources；
3. 按需调用某个 tool（带参数）；
4. 将返回结果喂给 LLM 继续推理。

这意味着：**MCP 把“能力接入层”做成了标准件**。

---

## A2A 是什么？

### 核心定位

A2A（Agent-to-Agent）强调的是**多个 Agent 之间如何发现、协商、委托与回传结果**。

当任务复杂到一个 Agent 不够时（例如“先做检索，再做代码生成，再做审校”），A2A 会非常自然：

- 一个协调者 Agent（Orchestrator）负责拆任务；
- 多个专业 Agent（检索、编码、审校）分别完成子任务；
- 最终汇总结果。

### 你可以把它理解成

- **团队协作协议**：不是直接调用工具，而是“调用另一个有专业能力的 Agent”；
- **跨角色协同机制**：定义了任务消息、状态、结果回传的格式和流程。

### A2A 的典型交互流程

1. Agent A 发布任务或请求；
2. Agent B 接收并执行；
3. B 返回中间状态（可选）和最终结果；
4. A 继续编排后续步骤。

这意味着：**A2A 把“多 Agent 编排层”做成了标准件**。

---

## MCP 与 A2A 的关系：不是替代，而是分层

用一张“分层图”来记忆最清楚：

- **上层（协作层）**：A2A，解决 Agent 与 Agent 的协作；
- **下层（能力层）**：MCP，解决 Agent 与工具/数据源的连接。

在真实系统里非常常见的一种组合是：

- 协调 Agent 通过 A2A 把任务派给“数据分析 Agent”；
- 数据分析 Agent 内部再通过 MCP 调数据库、读文件、跑计算。

也就是说：**A2A 管“谁来做”，MCP 管“拿什么做”**。

---

## Python 实战示例一：一个最小可运行的 MCP 思想示例

> 说明：下面代码为了教学简化了工程细节，重点是帮助你理解“工具注册 + 工具调用 + 结构化返回”的模式。

```python
# mcp_like_demo.py
from typing import Callable, Dict, Any


class SimpleMCPServer:
    def __init__(self):
        self.tools: Dict[str, Callable[..., Any]] = {}

    def register_tool(self, name: str, fn: Callable[..., Any]):
        self.tools[name] = fn

    def list_tools(self):
        return list(self.tools.keys())

    def call_tool(self, name: str, **kwargs):
        if name not in self.tools:
            return {"ok": False, "error": f"unknown tool: {name}"}
        try:
            result = self.tools[name](**kwargs)
            return {"ok": True, "data": result}
        except Exception as e:
            return {"ok": False, "error": str(e)}


# -------- 定义工具 --------
def add(a: float, b: float):
    return a + b


def weather(city: str):
    fake_db = {
        "shanghai": "晴，20°C",
        "beijing": "多云，16°C",
    }
    return fake_db.get(city.lower(), "暂无数据")


if __name__ == "__main__":
    server = SimpleMCPServer()
    server.register_tool("add", add)
    server.register_tool("weather", weather)

    print("tools:", server.list_tools())
    print(server.call_tool("add", a=3, b=5))
    print(server.call_tool("weather", city="Shanghai"))
```

运行：

```bash
python mcp_like_demo.py
```

你会看到类似输出：

```text
tools: ['add', 'weather']
{'ok': True, 'data': 8}
{'ok': True, 'data': '晴，20°C'}
```

这个示例虽然不是完整 MCP 协议栈，但它抓住了 MCP 的核心价值：

- 工具以统一方式暴露；
- 调用参数结构化；
- 返回结果结构化，便于 LLM/Agent 继续消费。

---

## Python 实战示例二：一个最小 A2A 思想示例

我们用两个“角色”模拟：

- `planner_agent`：负责拆解任务；
- `coder_agent`：负责产出代码草稿。

```python
# a2a_like_demo.py
from dataclasses import dataclass
from typing import Dict, Any


@dataclass
class A2AMessage:
    sender: str
    receiver: str
    task: str
    payload: Dict[str, Any]


class PlannerAgent:
    name = "planner_agent"

    def handle(self, user_goal: str) -> A2AMessage:
        subtask = f"为目标生成 Python 示例代码：{user_goal}"
        return A2AMessage(
            sender=self.name,
            receiver="coder_agent",
            task="generate_code",
            payload={"requirement": subtask},
        )


class CoderAgent:
    name = "coder_agent"

    def handle(self, msg: A2AMessage) -> Dict[str, Any]:
        if msg.task != "generate_code":
            return {"ok": False, "error": "unsupported task"}

        code = (
            "def hello(name: str) -> str:\n"
            "    return f'hello, {name}'\n"
        )
        return {
            "ok": True,
            "from": self.name,
            "result": {
                "summary": "已生成最小示例函数",
                "code": code,
                "for_requirement": msg.payload["requirement"],
            },
        }


if __name__ == "__main__":
    planner = PlannerAgent()
    coder = CoderAgent()

    # 用户目标
    goal = "写一个问候函数"

    # A2A 消息：planner -> coder
    a2a_msg = planner.handle(goal)
    response = coder.handle(a2a_msg)

    print(response["result"]["summary"])
    print(response["result"]["code"])
```

运行：

```bash
python a2a_like_demo.py
```

你会发现这个模型是“角色协作”而不是“直接工具调用”。这正是 A2A 的思路：

- 消息有发送者、接收者、任务类型；
- 接收方按职责处理并返回结果；
- 协调方可以继续串联下一跳 Agent。

---

## 一个更贴近真实项目的组合案例

假设你要做“自动生成周报”的 Agent 系统：

1. `orchestrator_agent`（总控）接收“生成周报”；
2. 通过 A2A 把“拉取数据”分配给 `data_agent`；
3. `data_agent` 再通过 MCP 调用：
   - `jira_query_tool`（拿任务完成情况）；
   - `git_stats_tool`（拿代码提交统计）；
4. `writer_agent` 整理为自然语言周报；
5. `review_agent` 做格式和事实检查。

这个流程里：

- A2A 负责跨 Agent 协作；
- MCP 负责 Agent 内部工具接入。

分层清晰后，系统会更易于扩展、测试与治理。

---

## 落地建议：团队实践时优先做这 4 件事

### 1）先定义“协议对象”再写业务

不管 MCP 还是 A2A，都要先统一：

- 请求字段；
- 错误码；
- 结果结构。

否则后期联调成本会非常高。

### 2）把“可观测性”当一等公民

建议至少记录：

- 调用链路 ID；
- 每个 Agent/Tool 的耗时；
- 成功率与错误分布。

没有可观测性，多 Agent 系统会很快变黑盒。

### 3）从单 Agent + MCP 起步，再引入 A2A

很多团队一开始就上多 Agent，结果复杂度失控。更稳妥路径是：

- 第一步：先让单 Agent 通过 MCP 稳定调用核心工具；
- 第二步：当任务真的需要角色分工时，再接入 A2A。

### 4）给每个 Agent 明确“能力边界”

例如：

- `coder_agent` 只产出代码，不直接发版；
- `review_agent` 只做审核，不改业务事实。

边界清晰，协作才可控。

---

## 总结

- **MCP**：标准化“Agent 如何使用工具与上下文”；
- **A2A**：标准化“Agent 之间如何协作”；
- 二者并不冲突，反而非常互补。

如果你刚开始实践，建议用这条路线：

1. 先做一个最小 MCP 工具链（如搜索 + 数据查询）；
2. 再把任务拆给两个 Agent，体验 A2A 协作；
3. 最后补齐日志、追踪、重试与权限控制。

当你把“工具层”和“协作层”分离开，整个 Agent 系统的可维护性会有质变提升。
