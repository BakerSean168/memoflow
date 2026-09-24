---
tags:
  - guide
  - development
  - runtime
  - docker
  - e2e
description: MemoFlow host-dev / prod-like / staging / prod runtime environments and supporting test lanes
created: 2026-07-14T00:00:00
updated: 2026-09-20T00:00:00
---

# Runtime environments（运行环境）

MemoFlow 的运行时首先按 **4 个环境** 建模：`host-dev`、`prod-like`、`staging`、`prod`。`e2e`、`dev-infra`、`test-infra` 是测试/基础设施辅助 lane，不是第五、第六套部署环境。

单一真相源（SSOT）：

- [`tools/runtime/profiles.json`](../../../tools/runtime/profiles.json)

## 四类环境

全局项目端口分配的上层 SSOT 位于 `my-infrastructure/registry.yaml` 与 `projects/memoflow.yaml`：MemoFlow 拥有 `20200-20299` 整个 100-port block。本仓库的 `tools/runtime/profiles.json` 只细化 MemoFlow 自己在该 block 内的环境/服务端口。

| Environment | 目的                                       | Host / 访问方式                                                       | 端口契约                                                               |
| ----------- | ------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `host-dev`  | 日常编码、Vite Bundled Dev HMR、API watch  | GCP Dev；工作站通过 VS Code Remote/SSH port forwarding 访问           | Web `20220`、API `20221`、PowerSync `20222`、PG `20230`、Redis `20231` |
| `prod-like` | 发布前完整 Docker / production-shaped 验收 | GCP Dev；`docker-compose.local.yml`；需要远程验收时用 Tailscale Serve | Web `20200`、API `20201`、PowerSync `20202`、PG `20210`、Redis `20211` |
| `staging`   | 稳定集成环境、candidate exact-digest 验收  | GCP Dev staging watcher                                               | Web `20250`、API `20251`、PowerSync `20252`、PG `20260`、Redis `20261` |
| `prod`      | 对用户提供正式服务                         | Alibaba production watcher + Caddy                                    | public HTTP `80` / HTTPS `443`；PG `5432`、Redis `6379` 仅 loopback    |

端口块的目的不是替代容器内部标准端口。比如 host-dev PostgreSQL 在宿主机使用 `20230`，容器内部仍然是 `5432`；PowerSync 在宿主机使用 `20222`，容器内部仍然是 `8080`。

### 为什么 host-dev 不再使用 5173 / 3000

`5173`、`3000`、`8080` 是框架/服务常见默认端口。在共享 GCP Dev 上同时开发 MemoFlow、BodySense、Job Harness 等项目时，继续把这些默认值当长期契约会产生冲突。因此 MemoFlow 按全局基础设施注册表占用项目块 `20200-20299`，其中 host-dev 固定使用环境 slot `20220-20239`，VS Code/SSH 转发也保持同号：

```text
GCP Dev :20220 -> workstation localhost:20220  (Web)
GCP Dev :20221 -> workstation localhost:20221  (API)
GCP Dev :20222 -> workstation localhost:20222  (PowerSync, only when needed)
```

日常浏览器入口应是 `http://localhost:20220`，而不是 Tailscale `:20200`。`20200-20219` 保留给 `prod-like`；`20250-20269` 保留给 `staging`。

## Supporting lanes

| Lane         | 用途                              | 端口                                         |
| ------------ | --------------------------------- | -------------------------------------------- |
| `e2e`        | Playwright 核心 e2e               | API `3000`、Web `5173`、PG `5433`            |
| `dev-infra`  | `host-dev` 的 Docker 基础设施子集 | PowerSync `20222`、PG `20230`、Redis `20231` |
| `test-infra` | e2e / integration 测试数据库      | PG `5433`                                    |

Support lane 可以与四类环境共享其 owner 环境的端口（例如 `dev-infra` 与 `host-dev`），但不能被误当成独立部署环境。

## 命令速查

```bash
# 查看所有环境 / lane 与端口
pnpm runtime:preflight -- --list

# host-dev
pnpm docker:dev:up
pnpm runtime:preflight:host-dev
pnpm nx run-many -t serve --projects=api,web --parallel=2

# prod-like（底层命令仍使用历史 docker:local 命名）
pnpm runtime:preflight:prod-like
pnpm docker:local:up

# staging：只做观测/preflight；部署 authority 属于 staging watcher
pnpm runtime:preflight:staging

# prod：在 GCP Dev 只打印 topology；不会探测/修改 Alibaba runtime
pnpm runtime:preflight:prod

# e2e
pnpm docker:test:up
pnpm runtime:preflight:e2e
pnpm e2e
```

`runtime:preflight:local-docker` 暂时保留为 `runtime:preflight:prod-like` 的兼容别名；新文档与新自动化统一使用 `prod-like`。

## GCP Dev 持久开发会话

日常开发固定使用一个持久 tmux 会话：

- session：`MemoFlow`
- window：`dev`
- cwd：`/home/dev/projects/memoflow`
- window 内运行：

```bash
pnpm docker:dev:up && pnpm nx run-many -t serve --projects=api,web --parallel=2
```

这个 window 只拥有 `host-dev`：Docker 承载 PostgreSQL / Redis / PowerSync，API 与 Web 在宿主机直接运行并热更新。连接 GCP Dev 的工作站通过 VS Code / SSH 转发 `20220`、`20221`，必要时再转发 `20222`。

Web `20220` 默认启用 Vite Bundled Dev（`MEMOFLOW_VITE_BUNDLED_DEV=true`）。它仍保留 Vite/HMR 开发语义，但把浏览器侧的大型 native-ESM module waterfall 收敛为少量 bundled dev assets，更适合 GCP Dev -> 工作站这种高 RTT 链路。需要诊断 Vite/plugin 兼容问题时，可在 gitignored `.env.development.local` 中设置 `MEMOFLOW_VITE_BUNDLED_DEV=false` 临时回退 classic native-ESM dev server；Playwright/test lane 也固定保持 classic 模式，避免实验能力改变 CI 语义。

`@tailwindcss/vite` 4.3.x 的 classic `hotUpdate` hook 仍假设存在 `ViteDevServer.server` 上下文，而 Bundled Dev 当前提供更小的 HMR context。Web Vite config 仅在 Bundled Dev 下跳过该 classic-server invalidation helper；Tailwind transform 仍参与 bundled regeneration。该兼容层必须保持局部，并在上游原生支持 Bundled Dev 后删除。

当前 Vite/Rolldown Bundled Dev 还会把少量链接工作区 dist export 保留成浏览器无法解析的 bare specifier；目前实测涉及 `@memoflow/http-client` 与 `@memoflow/utils/shared`。因此仅 Bundled Dev lane 将这两个浏览器运行时入口 source-alias 到对应 `src` entry。classic dev、Playwright 与 production build 不采用这些兼容 alias；上游修复后应删除。

不要把 host-dev 借用 `20200` 暴露给远程浏览器；`20200-20219` 始终属于 `prod-like`。host-dev 的 canonical 工作站入口保持 SSH/VS Code 同号转发后的 `http://localhost:20220`。

## prod-like 与 `.env.production.local`

- `docker-compose.local.yml` 是 `prod-like` 的实现，不是环境名称本身。 Compose project 固定为 `memoflow-prod-like`；host-dev infrastructure 固定为 `memoflow-host-dev`，避免 Docker 把另一环境的容器误判为 orphan。
- 密钥与镜像 tag 可放在 `.env.production.local`。
- Host 端口以 `tools/runtime/profiles.json` 为准；`pnpm docker:local:*` 会把默认端口强制收敛到 `20200-20211`。
- 机器级 override 仍必须位于 gitignored `.env.prod-like.local` 且显式设置 `LOCAL_DOCKER_MACHINE_PORTS=true`；override 会检查是否撞到同一 host group 的 host-dev / staging / e2e 端口。

GCP Dev 的共享环境不要再使用历史 `1213x` 私有覆盖。canonical prod-like 使用：

```dotenv
API_HOST_PORT=20201
WEB_HOST_PORT=20200
POWERSYNC_HOST_PORT=20202
POSTGRES_HOST_PORT=20210
REDIS_HOST_PORT=20211
```

## Staging 与 production authority

`staging` 和 `prod` 都不是开发者手工 `docker compose up` 的临时环境：

- `staging` 由 candidate/staging control artifact + staging watcher 在 GCP Dev 上维护；
- `prod` 由 Published Release -> production-set -> `production-selected` control artifact -> Alibaba production watcher 维护；
- runtime SSOT 记录它们的端口、URL 和 host ownership，但不会让 GCP Dev 的 preflight 去本地探测 Alibaba production 端口。

## Playwright 复用策略

- `e2e` 仍使用独立测试 lane；默认不复用错误的 host-dev/prod-like API。
- 若 `:3000` 已有服务，必须确认 `/healthz` 的 `lane=e2e`，否则 Playwright fail closed。
- host-dev 已迁到 `20220/20221`，因此不再与 e2e 的 `5173/3000` 发生日常端口冲突。

## 维护约定

1. 新增/修改端口，先改 `tools/runtime/profiles.json`。
2. 四类 primary environment 名称固定为 `host-dev` / `prod-like` / `staging` / `prod`。
3. `docker-compose.local.yml`、Tailscale Serve、tmux、VS Code forwarding、文档不得各自发明端口。
4. 跨项目共享 GCP Dev 时，每个项目分配自己的 host-dev port block；不要回退到框架默认 `5173/3000/8080` 作为长期契约。
5. production 标准入口 `80/443` 属于独立 Alibaba host，不参与 GCP Dev 端口冲突计算。
