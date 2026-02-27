---
title: AI Agent 开发范式演进 —— 从 Prompt Chain 到多智能体协作的技术全景
description: 深度解析 AI Agent 开发的五次范式跃迁（Prompt Chain → ReAct → Function Calling → MCP/A2A → Multi-Agent），对比主流框架（LangGraph/CrewAI/OpenAI Agents SDK/Claude Agent SDK），覆盖记忆架构、Agentic RAG、安全治理与生产实践
date: 2026-02-27
categories: [AI]
tags: [AI Agent, LLM, MCP, A2A, LangGraph, CrewAI, ReAct, 多智能体, RAG, 架构设计]
---

2025—2026 年，AI Agent 从实验室概念走向生产级系统。Gartner 预测到 2026 年底，40% 的企业应用将嵌入 AI Agent（2025 年不到 5%）。这篇文章梳理 Agent 开发的**五次范式跃迁**、主流框架选型、核心架构模式与生产实践。

------

## 一、范式演进：从"对话补全"到"自主行动"

### 1.1 五次范式跃迁全景

```
时间轴          范式                    核心思想
───────────────────────────────────────────────────────────────
2022-2023      Prompt Chain            链式提示词拼接
2023 Q1        ReAct                   推理 + 行动循环
2023 Q2        Function Calling        模型原生工具调用
2024-2025      MCP / Tool Protocol     标准化工具协议
2025-2026      Multi-Agent + A2A       多智能体协作网络
```

每一次跃迁都在解决上一代的**核心瓶颈**：

| 范式 | 解决了什么 | 遗留了什么 |
|------|-----------|-----------|
| Prompt Chain | 拆分复杂任务 | 无法与外部世界交互 |
| ReAct | 让模型能"动手" | 行动定义在自由文本中，解析脆弱 |
| Function Calling | 结构化工具调用 | 每个模型厂商接口不同，集成碎片化 |
| MCP | 统一工具协议 | 只解决 Agent↔Tool，Agent 之间无法协作 |
| Multi-Agent + A2A | Agent 间发现、委托、协作 | 治理、评估、可观测性仍在成熟中 |

### 1.2 范式一：Prompt Chain（2022-2023）

最早期的"Agent"本质是**多步提示词拼接**——把一个复杂任务拆成若干个 LLM 调用，前一步的输出拼接到下一步的输入。

```
[用户需求] → Prompt₁(分析) → Prompt₂(规划) → Prompt₃(执行) → [结果]
```

**典型代表**：LangChain 的 `SequentialChain`、早期 ChatGPT Plugin

**局限**：
- 纯文本管道，无法调用外部 API、数据库、文件系统
- 每一步都是独立的 LLM 调用，没有"记忆"和"反思"
- 链条一旦出错，无法自我修正

### 1.3 范式二：ReAct（Reason + Act，2023）

Yao et al. 提出 ReAct 范式：让 LLM 交替进行**推理**（Thought）和**行动**（Action），形成闭环。

```
循环 {
    Thought: 我需要查找 X 的信息
    Action:  search("X")
    Observation: 搜索结果是...
    Thought: 根据结果，我应该...
}
```

**突破**：Agent 第一次能"动手"——执行搜索、计算、查询等操作。

**问题**：行动定义在自由文本中，需要手动解析模型输出，格式脆弱，不同模型输出不一致。

### 1.4 范式三：Function Calling（2023）

OpenAI 率先让模型**原生输出结构化工具调用**，彻底解决了 ReAct 的解析问题。

```json
// 模型不再输出自由文本，而是结构化 JSON
{
  "function_call": {
    "name": "get_weather",
    "arguments": "{\"city\": \"Beijing\"}"
  }
}
```

**突破**：
- 工具调用从"文本解析"变成"JSON Schema 驱动"
- 模型知道有哪些工具可用（通过 tools 参数传入定义）
- 调用结果可以直接反馈给模型继续推理

**问题**：
- 每个模型厂商的 Function Calling 接口不同（OpenAI / Anthropic / Google 各有格式）
- 每接入一个新工具，都要在应用代码里写适配器
- 工具定义和模型绑定，换模型就要重写集成代码

### 1.5 范式四：MCP —— "AI 的 USB-C"（2024-2025）

Anthropic 提出 Model Context Protocol（MCP），将工具集成从**模型特定**变为**协议标准化**。

```
传统方式（N×M 问题）：
┌──────────┐     ┌──────────┐
│  Model A ├──→──┤ Tool 1   │  每个模型×每个工具
│  Model B ├──→──┤ Tool 2   │  = N×M 个适配器
│  Model C ├──→──┤ Tool 3   │
└──────────┘     └──────────┘

MCP 方式（N+M 问题）：
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Model A │     │          │     │ Tool 1   │
│  Model B ├──→──┤   MCP    ├──→──┤ Tool 2   │
│  Model C │     │ Protocol │     │ Tool 3   │
└──────────┘     └──────────┘     └──────────┘
```

MCP 的核心设计：
- **Server**：暴露工具能力（JSON Schema 描述输入输出）
- **Client**：LLM 应用连接 MCP Server，自动发现可用工具
- **传输层**：支持 stdio（本地进程）、HTTP+SSE（远程服务）

```python
# MCP Server 示例（Python）
from mcp.server import Server
from mcp.types import Tool

server = Server("weather-server")

@server.tool()
async def get_weather(city: str) -> str:
    """获取指定城市的天气信息"""
    # 调用天气 API
    return f"{city}: 晴, 25°C"

# 任何支持 MCP 的 Agent 都能自动发现和调用这个工具
```

**关键优势**：
- 开发者实现一次 MCP Server，所有支持 MCP 的 Agent 都能用
- Agent 不需要预先知道有哪些工具——运行时动态发现
- OpenAI、Google、Meta 等厂商都已宣布支持 MCP

### 1.6 范式五：A2A —— Agent 间协作协议（2025-2026）

Google 在 2025 年 4 月发布 Agent-to-Agent Protocol（A2A），解决 MCP 未覆盖的问题：**Agent 之间如何发现、委托、协作**。

```
MCP 解决：Agent ↔ Tool（垂直集成）
A2A 解决：Agent ↔ Agent（水平协作）

┌─────────────┐    A2A     ┌─────────────┐
│  Agent A    │◄─────────►│  Agent B    │
│  (规划者)    │            │  (执行者)    │
│  ┌───┐      │            │  ┌───┐      │
│  │MCP├→Tool │            │  │MCP├→Tool │
│  └───┘      │            │  └───┘      │
└─────────────┘            └─────────────┘
```

A2A 核心概念：
- **Agent Card**：每个 Agent 发布自己的能力描述（类似服务注册）
- **Task**：Agent 之间通过 Task 进行委托和状态同步
- **通信**：基于 JSON-RPC 2.0 + HTTP(S) + SSE

**MCP vs A2A 的关系**：

| 维度 | MCP | A2A |
|------|-----|-----|
| 解决什么 | Agent 如何使用工具 | Agent 之间如何协作 |
| 类比 | 操作系统的驱动程序接口 | 微服务之间的 RPC 协议 |
| 通信模式 | Client-Server | Peer-to-Peer |
| 发起者 | Anthropic | Google |
| 竞争关系 | 互补，不竞争 | 互补，不竞争 |

------

## 二、主流框架对比（2026）

### 2.1 四大框架定位

```
                    控制力（精细 → 粗粒度）
                    ◄──────────────────────►
                    │                      │
       ┌────────────┤                      ├────────────┐
       │ LangGraph  │                      │  CrewAI    │
  复   │ 图状态机    │                      │  角色扮演   │
  杂   │ 精确控制    │                      │  团队隐喻   │
  度   ├────────────┤                      ├────────────┤
  ↑    │ Claude     │                      │  OpenAI    │
       │ Agent SDK  │                      │  Agents SDK│
       │ MCP 原生    │                      │  极简四原语  │
       └────────────┤                      ├────────────┘
                    │                      │
```

### 2.2 详细对比

| 维度 | LangGraph | CrewAI | OpenAI Agents SDK | Claude Agent SDK |
|------|-----------|--------|-------------------|------------------|
| **架构模型** | 有向图状态机 | 角色 + 任务 + 团队 | 四原语（Agent/Handoff/Guardrail/Session） | MCP 原生 + Tool/Prompt |
| **核心隐喻** | "乐高积木" | "预装机器人" | "极简手术刀" | "USB-C 万能接口" |
| **学习曲线** | 陡峭 | 平缓 | 最低 | 中等 |
| **状态管理** | 内置持久化 + Reducer | 框架管理 | 会话级 | 上下文窗口 + 外部存储 |
| **模型绑定** | 任意模型 | 任意模型 | 最佳体验限 OpenAI | 最佳体验限 Claude |
| **多 Agent** | 图编排 | 角色委托 | Handoff 模式 | MCP Server 组合 |
| **MCP 支持** | ✅ | ✅ | ✅（实验性） | ✅（原生） |
| **生产就绪** | v1.0，最成熟 | 快速增长中 | 托管服务 | Claude Code 验证 |
| **GitHub Stars** | 47M+ 下载 | 44K+ ⭐ | 19K+ ⭐ | 开源 SDK |
| **适合场景** | 复杂工作流、需要精确控制 | 快速原型、团队协作隐喻 | OpenAI 生态内的轻量 Agent | 工具密集型、MCP 生态 |

### 2.3 选型决策树

```
你的场景是什么？
│
├─► 需要精确控制每个执行步骤？
│   └─► LangGraph（图状态机，节点/边/条件路由）
│
├─► 多个"角色"协作完成任务？
│   └─► CrewAI（定义角色 + 背景 + 目标，组装团队）
│
├─► 快速搭建，主用 OpenAI 模型？
│   └─► OpenAI Agents SDK（四个原语搞定）
│
├─► 工具集成是核心需求？
│   └─► Claude Agent SDK + MCP（原生协议支持）
│
└─► 大型企业，需要混合编排？
    └─► LangGraph 做大脑 + CrewAI/OpenAI 做子团队（Agentic Mesh）
```

------

## 三、Agent 核心架构模式

### 3.1 单 Agent 循环（基础模式）

```
                    ┌──────────────┐
                    │   User Input │
                    └──────┬───────┘
                           ▼
              ┌────────────────────────┐
              │      Agent Core       │
              │  ┌──────────────────┐ │
              │  │  System Prompt   │ │
              │  │  + Context       │ │
              │  └──────────────────┘ │
              │           │           │
              │     ┌─────▼─────┐     │
              │     │    LLM    │     │
              │     └─────┬─────┘     │
              │           │           │
              │    ┌──────▼──────┐    │
              │    │  Decision   │    │
              │    │  Tool Call? │    │
              │    └──┬─────┬───┘    │
              │  Yes  │     │ No     │
              │  ┌────▼──┐  │        │
              │  │ Tool  │  │        │
              │  │Execute│  │        │
              │  └────┬──┘  │        │
              │       │     │        │
              │  ┌────▼─────▼───┐    │
              │  │   Response   │    │
              │  └──────────────┘    │
              └────────────────────────┘
```

这是最基本的 Agent 模式：LLM 接收输入 → 决定是否调用工具 → 执行工具 → 返回结果 → 循环直到任务完成。

**关键实现要点**：
- **退出条件**：必须有明确的终止条件（最大轮次、目标达成判断）
- **错误恢复**：工具调用失败时的重试/降级策略
- **上下文管理**：随着循环增长，上下文窗口可能溢出

### 3.2 Supervisor/Worker 模式（多 Agent）

```
                 ┌──────────────────┐
                 │   Supervisor     │
                 │  (规划 + 分发)    │
                 └───┬────┬────┬───┘
                     │    │    │
            ┌────────┘    │    └────────┐
            ▼             ▼             ▼
     ┌──────────┐  ┌──────────┐  ┌──────────┐
     │ Worker A │  │ Worker B │  │ Worker C │
     │ (搜索)   │  │ (分析)   │  │ (写作)   │
     │ ┌──────┐ │  │ ┌──────┐ │  │ ┌──────┐ │
     │ │Tools │ │  │ │Tools │ │  │ │Tools │ │
     │ └──────┘ │  │ └──────┘ │  │ └──────┘ │
     └──────────┘  └──────────┘  └──────────┘
```

Supervisor 负责任务分解和结果整合，Worker 专注于各自的子任务。这就是 AI Agent 领域的"微服务革命"——Gartner 报告显示，2024 Q1 到 2025 Q2，多 Agent 系统的咨询量增长了 **1445%**。

### 3.3 七大设计模式速览

| 模式 | 核心思想 | 适用场景 |
|------|---------|---------|
| **ReAct** | 推理→行动→观察循环 | 需要推理的工具使用 |
| **Reflection** | Agent 自我评估和修正输出 | 代码生成、写作优化 |
| **Tool Use** | 结构化工具调用 | API 集成、数据查询 |
| **Planning** | 先规划再执行 | 复杂多步骤任务 |
| **Multi-Agent** | 多个专业 Agent 协作 | 大型复杂系统 |
| **Sequential** | 固定流水线，步步传递 | 数据处理管道 |
| **Human-in-the-Loop** | 关键节点人工审批 | 高风险决策 |

------

## 四、记忆与知识架构

### 4.1 Agent 记忆的三层架构

```
┌─────────────────────────────────────────────┐
│              Agent Memory System             │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────┐  ← 当前对话上下文       │
│  │  Working Memory  │     (Context Window)   │
│  │  (短期记忆)       │     几千~几十万 tokens  │
│  └────────┬────────┘                        │
│           │                                 │
│  ┌────────▼────────┐  ← 向量数据库           │
│  │  Episodic Memory│     (Pinecone/Chroma)  │
│  │  (情景记忆)       │     语义相似检索        │
│  └────────┬────────┘                        │
│           │                                 │
│  ┌────────▼────────┐  ← 知识图谱             │
│  │  Semantic Memory│     (Neo4j/关系DB)      │
│  │  (语义记忆)       │     实体关系推理        │
│  └─────────────────┘                        │
│                                             │
└─────────────────────────────────────────────┘
```

**2026 的关键趋势**：记忆不再等于"一个向量索引"，而是包含**语义结构、来源追踪、新鲜度、策略感知检索**的完整系统。

### 4.2 RAG 的演进：从检索到行动

```
Basic RAG (2023)：
  Query → 向量检索 → 拼接上下文 → LLM 生成

Agentic RAG (2025-2026)：
  Query → Agent 分析意图
       → 动态选择检索策略（向量/图谱/SQL/API）
       → 多轮迭代检索和验证
       → 工具辅助推理
       → 生成 + 自我校验
```

2026 年的 RAG 三个层级：

| 层级 | 适用场景 | 技术栈 |
|------|---------|--------|
| **Hybrid RAG** | 企业基线，平衡精度和成本 | 向量 + 关键词混合检索 |
| **Graph RAG** | 多跳推理、关系发现 | 知识图谱 + 图遍历 |
| **Agentic RAG** | 复杂多步工作流 | Agent 驱动的动态检索 |

------

## 五、生产实践与治理

### 5.1 Token 经济学——被忽视的核心问题

Anthropic 在实践中发现：一个连接 5 个 MCP Server 的 Agent，**工具定义就消耗约 55K tokens**，还没开始对话。加上更多服务，很容易突破 100K tokens 的工具定义开销。

**2025 年的三大优化手段**：

| 技术 | 效果 | 原理 |
|------|------|------|
| **Tool Search Tool** | 减少 85% token | 按需发现工具，而非全量加载 |
| **Programmatic Tool Calling** | 减少 50%+ 调用 | 模型写代码批量调用工具，而非逐个 tool_call |
| **Tool Use Examples** | 提升 10-15% 准确率 | 用示例教模型正确使用工具，而非仅靠 Schema |

### 5.2 安全与治理框架

OWASP 在 2025 年 12 月发布了 **Agentic 应用 Top 10 安全风险**，核心治理原则是**最小权限（Least Agency）**——Agent 只应获得完成任务所需的最小自主权。

```
安全分层模型：

┌──────────────────────────────────┐
│  Layer 4: 审计与可观测            │  ← 全链路追踪、决策日志
├──────────────────────────────────┤
│  Layer 3: 输出护栏 (Guardrails)  │  ← 内容过滤、格式校验
├──────────────────────────────────┤
│  Layer 2: 工具权限控制            │  ← 读写分离、显式授权
├──────────────────────────────────┤
│  Layer 1: 输入验证               │  ← Prompt 注入防护
└──────────────────────────────────┘
```

**实践建议**：
- 从只读权限开始，逐步开放写权限
- 高影响操作（发送邮件、删除数据）必须 Human-in-the-Loop
- 实现 Prompt 注入检测（System Prompt 和 Tool 输出都可能被注入）
- 建立完整的 Agent 决策审计日志

### 5.3 评估基础设施

2026 年，Agent 的评估已经收敛为三层架构：

```
┌────────────────────────────────────────┐
│  Layer 1: PR Gate (快速门禁)            │
│  • 确定性检查（格式、Schema、类型）      │
│  • 单元测试                            │
│  • 秒级反馈                            │
├────────────────────────────────────────┤
│  Layer 2: Nightly Regression (回归)     │
│  • LLM-as-Judge 评估                   │
│  • 端到端场景测试                       │
│  • 分钟级反馈                           │
├────────────────────────────────────────┤
│  Layer 3: Production Monitor (生产监控) │
│  • 实时质量指标                         │
│  • 异常告警                            │
│  • A/B 测试                            │
└────────────────────────────────────────┘
```

------

## 六、动手实践：三种范式的代码对比

### 6.1 Function Calling（传统方式）

```python
# 每个模型厂商的接口不同，这是 OpenAI 的格式
import openai

tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "获取天气",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "城市名"}
            },
            "required": ["city"]
        }
    }
}]

response = openai.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "北京天气怎么样？"}],
    tools=tools
)

# 需要手动处理 tool_call、执行函数、将结果拼回消息
tool_call = response.choices[0].message.tool_calls[0]
# ... 手动执行、手动拼接、手动循环
```

**问题**：每个工具、每个模型都要写胶水代码。

### 6.2 MCP 方式（标准化协议）

```python
# MCP Server：定义一次，任何 Agent 都能用
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("weather")

@mcp.tool()
async def get_weather(city: str) -> str:
    """获取指定城市的实时天气"""
    # 实际调用天气 API
    return f"{city}: 晴天, 25°C, 湿度 45%"

@mcp.tool()
async def get_forecast(city: str, days: int = 3) -> str:
    """获取未来几天的天气预报"""
    return f"{city}: 未来{days}天晴转多云"

# 启动 MCP Server
mcp.run()

# 任何支持 MCP 的 Client（Claude, GPT, 自建 Agent）
# 都能自动发现 get_weather 和 get_forecast 工具
```

```json
// .mcp.json —— Agent 端配置
{
  "mcpServers": {
    "weather": {
      "command": "python",
      "args": ["weather_server.py"]
    }
  }
}
```

### 6.3 Multi-Agent 方式（CrewAI 示例）

```python
from crewai import Agent, Task, Crew

# 定义专业角色
researcher = Agent(
    role="市场调研员",
    goal="收集和分析市场数据",
    backstory="资深行业分析师，擅长数据挖掘",
    tools=[search_tool, scrape_tool]  # MCP 工具或自定义工具
)

writer = Agent(
    role="报告撰写人",
    goal="将分析结果整理成专业报告",
    backstory="技术写作专家，善于将数据转化为洞察"
)

# 定义任务
research_task = Task(
    description="调研 2026 年 AI Agent 市场格局",
    agent=researcher,
    expected_output="市场数据和竞争分析"
)

writing_task = Task(
    description="基于调研结果撰写分析报告",
    agent=writer,
    expected_output="3000 字的市场分析报告",
    context=[research_task]  # 依赖调研任务的输出
)

# 组装团队并执行
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, writing_task],
    verbose=True
)

result = crew.kickoff()
```

### 6.4 三种范式的本质区别

```
Function Calling:  开发者写胶水代码 → 模型调工具 → 开发者处理结果
                   （开发者是编排者）

MCP:               模型通过协议发现工具 → 自动调用 → 自动处理
                   （协议是编排者）

Multi-Agent:       多个 Agent 各司其职 → 互相委托 → 协作完成
                   （Agent 团队是编排者）
```

------

## 七、2026 趋势展望

### 7.1 Agentic Mesh —— 混合编排成为主流

未来不是选择某一个框架，而是**模块化组合**：LangGraph 做"大脑"编排全局，CrewAI 管理"营销团队"子任务，OpenAI Agent 处理快速子查询——正如微服务架构中的 API Gateway + 各专业服务。

### 7.2 从 RAG 到 Contextual Memory

静态 RAG 适合不变的知识库，但 Agent 需要**从交互中学习**、维护状态、适应反馈。Agentic Memory（上下文记忆）正在成为自适应 Agent 的核心能力。

### 7.3 Agent Ops —— 超越 DevOps

Agent 进入生产后需要专门的运维体系：
- **可观测性**：每一步决策的追踪和回放
- **评估**：LLM-as-Judge + 人工抽检的混合评估
- **成本控制**：Token 用量监控、缓存策略、模型路由
- **版本管理**：Prompt/工具/模型版本的协同管理

### 7.4 知识图谱复兴

纯向量检索无法处理多跳推理（"A 投资了 B，B 收购了 C，所以 A 间接持有 C"），Knowledge Graph + LLM 的结合（Graph RAG）正在成为企业 Agent 的知识底座。

------

## 总结

| 如果你要… | 建议方案 |
|-----------|---------|
| 快速原型验证 | OpenAI Agents SDK / CrewAI |
| 精确控制工作流 | LangGraph |
| 工具集成为核心 | MCP 协议 + Claude Agent SDK |
| 多 Agent 协作 | CrewAI（团队隐喻）或 LangGraph（图编排） |
| 跨组织 Agent 互通 | A2A 协议 |
| 企业级生产部署 | LangGraph + LangSmith + 评估基础设施 |

Agent 开发的本质已经从"如何让模型更聪明"转向"如何设计更好的架构"——选对模式、控好权限、管好记忆，比选哪个 LLM 更重要。

------

## 参考资料

- [Agentic AI Design Patterns (2026 Edition)](https://medium.com/@dewasheesh.rana/agentic-ai-design-patterns-2026-ed-e3a5125162c5)
- [The Agentic AI Infrastructure Landscape 2025-2026](https://medium.com/@vinniesmandava/the-agentic-ai-infrastructure-landscape-in-2025-2026-a-strategic-analysis-for-tool-builders-b0da8368aee2)
- [Function Calling vs MCP vs A2A: Developer's Guide](https://zilliz.com/blog/function-calling-vs-mcp-vs-a2a-developers-guide-to-ai-agent-protocols)
- [Anthropic: Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use)
- [Anthropic: Building Agents with Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [The 2026 Guide to Agentic Workflow Architectures](https://www.stack-ai.com/blog/the-2026-guide-to-agentic-workflow-architectures)
- [A2A and MCP - A2A Protocol](https://a2a-protocol.org/latest/topics/a2a-and-mcp/)
- [Open Source AI Agent Frameworks Compared (2026)](https://openagents.org/blog/posts/2026-02-23-open-source-ai-agent-frameworks-compared)
- [Agentic RAG 2026](https://zylos.ai/research/2026-01-09-agentic-rag)
- [OWASP Top 10 for Agentic Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
