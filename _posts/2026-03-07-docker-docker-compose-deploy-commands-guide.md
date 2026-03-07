---
title: 面向 Deploy 人员的 Docker 与 Docker Compose 实战手册：常见命令与排障场景
description: 从镜像构建、容器运行、日志排查到 Docker Compose 编排，系统整理 Deploy 岗位最常见的命令和实战情景。
date: 2026-03-07
categories: [DevOps, 部署]
tags: [docker, docker-compose, deploy, devops, linux]
---

很多同学会写 `Dockerfile`，也会执行 `docker compose up`，但一到线上故障时常见问题还是：

- 容器起来了，服务却 502；
- 镜像构建很慢，不知道怎么优化；
- 生产环境想“平滑更新”，但命令总是靠复制粘贴；
- Compose 文件越写越长，团队里没人敢改。

这篇文章专门面向 **Deploy/运维/平台交付人员**，按“你在值班时真正会遇到的场景”来组织内容，帮你形成一套可直接落地的命令习惯。

---

## 1. 先建立一张 Deploy 视角的命令地图

把 Docker 相关工作拆成 5 类：

1. **镜像层**：构建、打标签、推送、清理；
2. **容器层**：运行、重启、查看日志、进入容器；
3. **网络卷层**：端口、网络联通、数据持久化；
4. **编排层（Compose）**：多服务拉起、更新、扩缩容；
5. **排障层**：状态检查、资源占用、异常回滚。

值班时的经验法则：

> 出故障先看容器状态和日志，再看网络，再看配置，最后才怀疑代码。

---

## 2. Docker 高频命令：从“能用”到“敢在线上用”

## 2.1 镜像构建与发布

### 场景 A：本地构建镜像并打版本标签

```bash
docker build -t registry.example.com/payment-api:1.4.2 .
```

建议：

- 标签不要只用 `latest`，至少保留语义化版本（如 `1.4.2`）；
- 同时打一个短 commit tag 方便回滚（如 `1.4.2-9f3a1c2`）。

### 场景 B：推送镜像到私有仓库

```bash
docker login registry.example.com
docker push registry.example.com/payment-api:1.4.2
```

常见坑：

- 推送失败 `denied`：通常是仓库权限或 tag 不存在；
- 推送很慢：确认是否跨地域、是否需要 registry mirror。

### 场景 C：清理无用镜像释放磁盘

```bash
docker image prune -f
docker image prune -a -f
```

说明：

- 第一条仅清理 dangling 镜像；
- 第二条会删除未被容器使用的镜像，线上执行前要确认回滚策略。

---

## 2.2 容器运行与生命周期管理

### 场景 D：临时拉起服务验证

```bash
docker run -d --name payment-api -p 8080:8080 \
  -e SPRING_PROFILES_ACTIVE=prod \
  registry.example.com/payment-api:1.4.2
```

关注点：

- `-d` 后台运行；
- `--name` 便于日志和监控识别；
- `-p` 左侧宿主机端口，右侧容器端口。

### 场景 E：查看运行状态与退出原因

```bash
docker ps
docker ps -a
docker inspect payment-api --format='{{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}}'
```

如果容器一直重启：

- 看 `ExitCode`；
- 看是否 `OOMKilled=true`；
- 看健康检查脚本是否写错。

### 场景 F：日志排障（三板斧）

```bash
docker logs --tail 200 payment-api
docker logs -f payment-api
docker logs --since 10m payment-api
```

建议固定动作：

1. 先看最近 200 行；
2. 再 `-f` 实时跟踪；
3. 限定时间窗口减少噪音。

### 场景 G：进入容器做现场检查

```bash
docker exec -it payment-api sh
# 或者
docker exec -it payment-api bash
```

进入后你通常要做三件事：

- `env` 看环境变量注入是否正确；
- `cat` 看配置文件是否挂载成功；
- `curl` 看容器内到下游依赖是否可达。

---

## 2.3 资源、网络与卷

### 场景 H：容器资源占用过高

```bash
docker stats
docker top payment-api
```

当 CPU 飙升时，先确认：

- 是不是单请求触发死循环；
- 是不是日志打印过量；
- 是不是 JVM/运行时参数配置不当。

### 场景 I：网络联通检查

```bash
docker network ls
docker network inspect bridge
```

排查套路：

1. 容器是否在同一个 network；
2. 服务间访问是否用“容器名/服务名”而不是 `localhost`；
3. 宿主机防火墙或云安全组是否放行。

### 场景 J：数据持久化

```bash
docker volume ls
docker volume inspect mydata
docker run -d --name mysql -v mydata:/var/lib/mysql mysql:8
```

记住：容器可以删，卷不要轻易删。误删卷通常比误删容器严重。

---

## 3. Docker Compose 实战：多服务场景的“主力工具”

如果你在部署 `Nginx + API + Redis + MySQL` 这类组合，Compose 是首选。

一个典型 `docker-compose.yml` 示例：

```yaml
services:
  api:
    image: registry.example.com/payment-api:1.4.2
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=prod
    depends_on:
      - redis
      - mysql
    restart: always

  redis:
    image: redis:7
    restart: always

  mysql:
    image: mysql:8
    environment:
      - MYSQL_ROOT_PASSWORD=change-me
    volumes:
      - mysql_data:/var/lib/mysql
    restart: always

volumes:
  mysql_data:
```

---

## 3.1 Compose 高频命令清单（值班必备）

### 场景 K：拉起全套服务

```bash
docker compose up -d
```

### 场景 L：只重建某个服务（代码更新常用）

```bash
docker compose up -d --build api
```

### 场景 M：查看服务状态与日志

```bash
docker compose ps
docker compose logs -f api
docker compose logs --since 15m
```

### 场景 N：平滑重启某服务

```bash
docker compose restart api
```

### 场景 O：停止并清理环境

```bash
docker compose down
docker compose down -v
```

注意：`-v` 会删除挂载卷，生产环境必须谨慎。

---

## 3.2 Compose 配置管理建议（生产可维护）

1. **分环境文件**：
   - `compose.yml`（基础）
   - `compose.prod.yml`（生产覆盖）

2. **配合 `.env` 管理变量**：
   - 统一镜像版本、端口、敏感配置引用；
   - 不把密钥直接写进 yml。

3. **上线前先做配置预检**：

```bash
docker compose config
```

这个命令能提前发现大量拼写和变量替换问题。

---

## 4. 常见故障场景与标准排障流程

## 4.1 场景 1：服务启动后健康检查失败

建议步骤：

1. `docker compose ps` 看状态是否 `unhealthy`；
2. `docker compose logs -f api` 看启动日志；
3. `docker inspect` 检查 healthcheck 命令和间隔；
4. `docker exec` 进容器手动执行 healthcheck 命令。

## 4.2 场景 2：新版本发布后响应变慢

建议步骤：

1. `docker stats` 看 CPU/MEM；
2. 对比新旧镜像启动参数；
3. 检查是否误开 debug 日志；
4. 必要时立刻切回上一版本镜像。

## 4.3 场景 3：磁盘突然打满

建议步骤：

1. `docker system df` 看镜像、容器、卷占用；
2. 清理无用镜像/停止容器；
3. 检查是否日志未轮转；
4. 制定固定清理任务（但要避开业务高峰）。

---

## 5. Deploy 团队推荐的最小上线脚本思路

在 CI/CD 或发布机上，至少把下面动作标准化：

1. 拉取指定 tag 镜像；
2. `docker compose config` 预检；
3. `docker compose up -d` 更新；
4. 健康检查（HTTP 或业务探活）；
5. 失败自动回滚到上一 tag。

核心目标是：

- **可重复**（同样命令能重复执行）；
- **可回滚**（版本可追踪）；
- **可观测**（日志、状态、告警打通）。

---

## 6. 一张值班速查表（建议收藏）

```bash
# 状态
docker ps
docker compose ps

# 日志
docker logs --tail 200 <container>
docker compose logs -f <service>

# 进入容器
docker exec -it <container> sh

# 资源
docker stats
docker system df

# 更新
/docker compose pull
/docker compose up -d

# 清理（谨慎）
docker image prune -f
docker compose down
```

> 注意：速查表中的更新命令请去掉前面的 `/`，这里故意加了前缀提醒你“上线命令必须确认环境后执行”。

---

## 结语

对 Deploy 人员来说，Docker/Compose 不是“会几个命令”就够了，关键是形成 **标准动作 + 故障闭环**：

- 平时沉淀命令模板；
- 发布前做配置预检；
- 故障时按固定路径排查；
- 每次事故后补自动化和监控。

当你把这些动作固化到脚本和流水线里，Docker 才真正从“工具”变成“稳定交付能力”。
