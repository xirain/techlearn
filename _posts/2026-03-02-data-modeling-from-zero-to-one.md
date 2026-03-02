---
title: 编程里的数据建模怎么入手：从“会写代码”到“会设计数据”
description: 用一个电商订单系统案例，讲清什么是数据建模、为什么重要、如何从需求到概念模型、逻辑模型、物理模型落地，并给出可运行代码示例
date: 2026-03-02
categories: [系统设计]
tags: [数据建模, 数据库设计, 系统设计, SQL, Python, DDD]
---

很多同学写代码时，会把“业务逻辑”当主角，把“数据”当配角。

结果就是：

- 功能能做出来，但一改需求就崩；
- 表越来越多，字段越来越乱；
- 联表很痛，统计很慢；
- Bug 经常出在“状态不一致”。

这篇我们就系统讲清楚：**数据建模到底是什么，以及怎么一步步上手**。

---

## 1. 什么是数据建模（先说人话版）

**数据建模**，本质是：

> 把现实世界的业务对象、关系、规则，翻译成程序和数据库都能稳定执行的数据结构。

你可以把它理解成“给业务立法”：

- 什么对象存在？（用户、订单、商品）
- 对象之间是什么关系？（一个用户有多个订单）
- 有哪些硬约束？（订单金额不能为负，订单必须属于某个用户）
- 数据如何演进？（待支付 -> 已支付 -> 已发货 -> 已完成）

如果这些在一开始没想清楚，后面会靠大量 if/else 和补丁修复。

---

## 2. 为什么数据建模这么重要？

### 2.1 它决定系统的“可维护性上限”

业务逻辑可以重构，接口可以改版，但底层数据结构一旦混乱，改动成本会指数上升。

### 2.2 它决定协作效率

建模清晰的团队，产品、后端、前端、测试对“状态”和“字段含义”理解一致；
建模混乱的团队，讨论一周都在对齐“这个字段到底什么意思”。

### 2.3 它决定分析能力

你后面要做 BI、推荐、风控，第一步都是依赖可解释的数据模型。

---

## 3. 入门路线：从 0 到 1 的四步法

给你一个最实用的顺序：

1. **识别实体（Entity）**：系统里有哪些核心对象；
2. **识别关系（Relation）**：对象怎么关联；
3. **定义约束（Constraint）**：哪些数据必须合法；
4. **定义状态流（State）**：数据如何变化。

你可以先不追求“最优模型”，先保证“语义正确 + 能演进”。

---

## 4. 用一个完整案例讲透：电商订单系统

我们做一个最小但真实的场景：

- 用户可以下单；
- 订单包含多个商品项；
- 订单有状态流转；
- 支持统计用户消费总额。

### 4.1 第一步：概念模型（业务视角）

核心实体：

- `User`（用户）
- `Product`（商品）
- `Order`（订单）
- `OrderItem`（订单项）

关系：

- 一个 `User` 有多个 `Order`（1:N）
- 一个 `Order` 有多个 `OrderItem`（1:N）
- 一个 `OrderItem` 指向一个 `Product`（N:1）

这一步先别急着写 SQL，先把业务语义钉住。

### 4.2 第二步：逻辑模型（关系型结构）

把概念模型映射成表结构：

- `users(id, name, email)`
- `products(id, name, price)`
- `orders(id, user_id, status, total_amount, created_at)`
- `order_items(id, order_id, product_id, quantity, unit_price)`

注意两个关键点：

1. `unit_price` 要放在 `order_items`，不能只查 `products.price`，因为商品会涨价，订单要保留“下单时价格”；
2. `total_amount` 可做冗余字段，提升查询性能，但要由事务保证一致性。

### 4.3 第三步：物理模型（SQL 落地）

下面是可执行的 PostgreSQL DDL 示例：

```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'PAID', 'SHIPPED', 'DONE', 'CANCELLED')),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0)
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
```

这个 DDL 已经体现了数据建模三件套：

- **结构**（表和字段）
- **关系**（外键）
- **约束**（CHECK / NOT NULL / UNIQUE）

### 4.4 第四步：应用层模型（代码表达）

很多初学者只建表，不建“领域模型”，导致业务规则散落在控制器里。

下面用 Python + dataclass 做一个清晰的领域表达：

```python
from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum
from typing import List


class OrderStatus(str, Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    SHIPPED = "SHIPPED"
    DONE = "DONE"
    CANCELLED = "CANCELLED"


@dataclass
class OrderItem:
    product_id: int
    quantity: int
    unit_price: Decimal

    def amount(self) -> Decimal:
        if self.quantity <= 0:
            raise ValueError("quantity must be positive")
        if self.unit_price < 0:
            raise ValueError("unit_price cannot be negative")
        return self.unit_price * self.quantity


@dataclass
class Order:
    user_id: int
    items: List[OrderItem] = field(default_factory=list)
    status: OrderStatus = OrderStatus.PENDING

    def total_amount(self) -> Decimal:
        return sum((item.amount() for item in self.items), Decimal("0"))

    def pay(self) -> None:
        if self.status != OrderStatus.PENDING:
            raise ValueError(f"order cannot be paid from state: {self.status}")
        if not self.items:
            raise ValueError("order must contain at least one item")
        self.status = OrderStatus.PAID

    def ship(self) -> None:
        if self.status != OrderStatus.PAID:
            raise ValueError(f"order cannot be shipped from state: {self.status}")
        self.status = OrderStatus.SHIPPED
```

这里的重点不是语法，而是思想：

- “金额必须非负”这种规则，应在模型层兜底；
- “状态流转”必须由模型方法控制，而不是任意改字段。

---

## 5. 初学者最容易踩的 6 个坑

### 坑 1：把所有信息塞进一个大表

短期省事，长期灾难。拆分实体，建立关系，是可维护的前提。

### 坑 2：没有主键/唯一约束

“代码里保证唯一”通常不可靠，数据库约束才是最终防线。

### 坑 3：把状态写成随意字符串

应该明确枚举值 + 转换规则，避免出现 `paid`、`Paid`、`PAYED` 并存。

### 坑 4：金额使用 float/double

金额请用定点数（如 `NUMERIC(10,2)` / `Decimal`），避免精度误差。

### 坑 5：忽略历史快照

例如订单项单价必须留存，不要总是回查“当前商品价”。

### 坑 6：过早追求“完美范式”

先做“正确 + 可读 + 可验证”，再做性能和范式优化。

---

## 6. 由浅入深：你可以这样持续进阶

### 阶段 A（入门）

- 能正确画出实体关系（ER）
- 会写主键、外键、唯一约束、非空约束
- 能表达基础状态机

### 阶段 B（进阶）

- 理解 1NF/2NF/3NF 与反范式
- 会用事务保证冗余字段一致性
- 能按查询场景设计索引

### 阶段 C（实战）

- 处理高并发下的一致性问题（乐观锁、幂等键）
- 设计审计日志/事件表支撑追踪
- 基于领域模型驱动代码组织（DDD 思路）

---

## 7. 一个小型实战任务（建议你自己练）

你可以按下面步骤做一个 mini 项目：

1. 建 `users/products/orders/order_items` 四张表；
2. 实现“创建订单 + 支付订单 + 发货订单”接口；
3. 加一个接口：查询某用户最近 30 天消费总额；
4. 再加一个需求：商品改价后，历史订单金额不变；
5. 最后回头检查：你的模型是否自然支持了这个变化？

如果能自然支持，说明建模是健康的。

---

## 8. 总结

记住一句话：

> **数据建模不是画图工具里的文档工作，而是系统长期可演进能力的核心。**

写功能之前，先定义“数据世界的规则”；
规则定义好了，代码复杂度会明显下降。

如果你愿意，我下一篇可以继续写：

- 同一个订单系统，如何从单体数据库演进到“读写分离 + 分库分表”；
- 或者专门讲“如何把 ER 图映射成 DDD 聚合根”。
