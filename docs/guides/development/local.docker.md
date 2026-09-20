---
tags:
  - guide
  - development
  - docker
  - local
description: 使用 docker-compose.local.yml 做 prod-like 本地验证的统一入口
created: 2026-05-19T00:00:00
updated: 2026-07-31T00:00:00
---

# Local Docker 验证

`docker-compose.local.yml` 是当前仓库做容器化改动、本地联调和发布前验收的默认入口。它固定使用 Compose project `memoflow-prod-like`，与 host-dev 的 `memoflow-host-dev` 隔离。

它的定位不是“随便起一下服务”，而是：

- 尽量贴近生产拓扑：`postgres + redis + migrator + api + powersync + web`
- 强制本地构建 `api` / `web` 镜像
- 在进入 PR 和 release 链路前，先验证本地容器运行结果
- **host 端口与 host-dev / Playwright e2e 隔离**（SSOT：`tools/runtime/profiles.json`）

## 适用场景

以下变更默认先走本地 Docker 验证：

- Dockerfile
- `docker-compose.local.yml`
- `docker-compose.prod.yml`
- API / Web 启动链路
- PowerSync / snapshot / cron / runtime path / env 注入
- “只在容器里会出问题”的依赖、bundling、入口脚本问题

## 启动命令

推荐统一入口（会强制隔离 host 端口）：

```bash
pnpm runtime:preflight:prod-like
pnpm docker:local:up
```

该入口会把当前 Git revision 和 UTC 构建时间写入 Web、API 的 OCI 镜像标签；工作区存在未提交修改时，revision 带 `-dirty` 后缀。构建后可用以下命令核对：

```bash
docker image inspect memoflow-api:local --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}'
```

等价底层命令：

```bash
VCS_REF=<git-sha> BUILD_DATE=<utc-iso-time> docker compose -f docker-compose.local.yml --env-file .env.production --env-file .env.production.local up -d --build
```

> 若直接调用底层 compose 并覆盖 SSOT 端口，可能与 GCP Dev 上的其他环境/测试 lane 抢口。
> `pnpm docker:local:*` 会按 SSOT 纠正冲突端口（见 [runtime-lanes.md](./runtime-lanes.md)）。

默认本地访问端口：

- Web: `http://localhost:20200`
- API: `http://localhost:20201`
- PowerSync: `http://localhost:20202`
- PostgreSQL: `127.0.0.1:20210`
- Redis: `127.0.0.1:20211`

prod-like 的 API/Web/PowerSync host publish 默认只绑定 `127.0.0.1`，避免局域网/Tailnet 直接绕过 TLS 命中明文 HTTP。需要远程验证时，应在宿主机使用受信任 TLS terminator。GCP Dev 的 canonical 方式是 Tailscale Serve：

```bash
sudo tailscale serve --bg --https=20201 http://127.0.0.1:20201
sudo tailscale serve --bg --https=20200 http://127.0.0.1:20200
sudo tailscale serve --bg --https=20202 http://127.0.0.1:20202
```

对应远程入口：

- Web: `https://<magicdns>:20200`
- API / Better Auth: `https://<magicdns>:20201`
- PowerSync: `https://<magicdns>:20202`

GitHub/OAuth callback、`AUTH_BASE_URL`、`MEMOFLOW_WEB_URL`、`POWERSYNC_URL` 必须与这些 HTTPS public origins 保持一致。默认 443 若已被其他控制面使用，不要覆盖；使用 local-docker 既有独立端口即可。

`migrator` 是一次性数据库初始化服务，没有 host 端口。它在 PostgreSQL healthy 后执行 Prisma schema reconciliation 与数据库 bootstrap；成功时以 `Exited (0)` 结束，API 随后才会启动。`Exited (0)` 是预期状态，不是服务故障。

仅重启已有容器：

```bash
pnpm docker:local:up
# 或（不跑 build-prep 时请自知风险）
docker compose -f docker-compose.local.yml --env-file .env.production --env-file .env.production.local up -d
```

查看日志：

```bash
pnpm docker:local:logs
```

停止并移除容器：

```bash
pnpm docker:local:down
```

## 与 host-dev / staging / e2e 的关系

| 车道      | API   | Web   | PG    | 说明                                                        |
| --------- | ----- | ----- | ----- | ----------------------------------------------------------- |
| prod-like | 20201 | 20200 | 20210 | `docker-compose.local.yml`                                  |
| host-dev  | 21001 | 21000 | 21010 | `pnpm nx run-many -t serve --projects=api,web --parallel=2` |
| staging   | 20251 | 20250 | 20260 | canonical staging watcher                                   |
| e2e       | 3000  | 5173  | 5433  | Playwright                                                  |

完整环境职责、端口 ownership 与排障见 [runtime-lanes.md](./runtime-lanes.md)。

## 事务邮件（console / 真发）

- 默认 `EMAIL_PROVIDER=console`：验证码不外发，依赖 `LOCAL_VALIDATION` 取码端点。
- 真发 SMTP / Resend、域名 DNS、可选 `AUTH_CHALLENGE_STORE=redis`：见 [transactional-email-smtp.md](./transactional-email-smtp.md)。
- 实施与验收细节：[`docs/plan/archive/2026-07-28-transactional-email-smtp.md`](../../plan/archive/2026-07-28-transactional-email-smtp.md)。

## 本地验证最低要求

进入 PR 前，至少确认：

- `api` healthy
- `migrator` 为 `Exited (0)`，且日志包含 `Database initialization completed`
- `web` healthy
- `powersync` healthy
- 相关改动相关的 env / volume 已在本地 compose 中接通
- 关键用户链路在本地容器环境下能跑通

如果改动涉及 snapshot / PowerSync / cron，额外确认：

- `POWERSYNC_SNAPSHOT_DIR` 已挂到本地 volume
- `SNAPSHOT_REBUILD_ENABLED` / `SNAPSHOT_REBUILD_SCHEDULE` 注入到了 `api`
- 本地容器里对应脚本、路由或日志路径能工作

## 发布级产品旅程证据

核心产品旅程使用当前 prod-like profile 的实际端口运行：

```bash
pnpm nx run web:e2e:local-docker
```

该 target 在 Playwright 前后同时收集证据：

- Web、API 的 host TCP listener 已打开。
- Compose 的 host → container 端口映射与运行时 profile 一致。
- Web、API 产品容器均 healthy，且 OCI revision 与本次验证 revision 完全一致。
- Chromium 发出的唯一 query token 出现在当前 Web 容器的 Nginx 日志中。

机器可读证据写入（已被 Git 忽略）：

```text
reports/local-deploy-validation/local-docker-playwright-evidence.json
```

PM journey 账号统一使用 `pm-phase-*@test.com` 固定前缀。清理前必须先预览，
再显式应用；清理在单个数据库事务内按 `identity_id` 依赖顺序执行：

```bash
node tools/testing/cleanup-local-docker-pm-data.mjs
node tools/testing/cleanup-local-docker-pm-data.mjs --apply
node tools/testing/cleanup-local-docker-pm-data.mjs
```

最后一条预览应返回 `0 rows`。不要扩大前缀去清理普通开发账号。

## 与发布链路的关系

本地 Docker 验证通过后，才进入后续工作流：

1. 在短生命周期分支上提交改动并发起 PR
2. PR 合并到 `main`
3. 到达发布里程碑时手工运行 `Prepare Release`，由 release-please 更新或创建 Release PR
4. Release PR 合并后的 exact SHA 先通过 `CI`
5. `Release Publish` 创建 Draft/tag，调用 Desktop assets 与 `publish-images.yml`
6. postflight 全绿后才公开 GitHub Release；生产 rollout 独立执行

不要把“直接改生产 compose / 直接换线上 tag / 手工试 production 镜像”当作默认开发流程。  
这些只应作为例外的生产验收或故障处理动作，并且应晚于本地 Docker 验证。

相关入口：

- Docker 构建架构、优化前后指标与缓存说明见 [docker-image-build-optimization.md](./docker-image-build-optimization.md)
- 运行时车道说明见 [runtime-lanes.md](./runtime-lanes.md)
- 发布链路说明见 [release-workflow.md](./release-workflow.md)
- Git/PR 约定见 [git-workflow.md](./git-workflow.md)
- 生产部署说明见 [deployment README](../../deployment/README.md)
