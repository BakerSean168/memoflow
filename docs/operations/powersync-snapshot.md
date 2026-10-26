---
tags:
  - guide
  - development
  - powersync
  - snapshot
  - desktop
description: PowerSync per-profile snapshot 的部署、验证与回补说明
created: 2026-05-19T00:00:00
updated: 2026-05-19T00:00:00
---

# PowerSync Profile Snapshot Rollout

本文档只说明当前仓库里 **已经存在** 的 snapshot 能力如何部署和验收，不重复描述历史设计过程。

当前真值来源：

- 桌面端 as-built 状态看 [2026-05-17-desktop-multi-account-local-storage-architecture.md](https://github.com/BakerSean168/memoflow/blob/7a45112e1840950ead1ba98b748fc70fa1b38344/docs/plan/archive/2026-05-17-desktop-multi-account-local-storage-architecture.md)
- API snapshot 路由与构建逻辑看 `apps/api/src/modules/powersync/`
- cron 注册看 `apps/api/src/shared/infrastructure/cron/`

## 当前能力

仓库里已经具备：

- profile snapshot manifest API
- profile snapshot download API
- 手动 build CLI
- 手动 publish CLI
- API 进程内 snapshot rebuild cron
- 桌面端首次 hydrate 逻辑

未包含的内容：

- 自动创建持久化卷
- 自动注入生产环境变量
- 自动执行首次生产验收

## 部署前提

生产环境必须具备以下配置：

- `POWERSYNC_URL`
- `POWERSYNC_PRIVATE_KEY`
- `POWERSYNC_KEY_ID`
- `POWERSYNC_SNAPSHOT_DIR`
- `SNAPSHOT_REBUILD_ENABLED=true`
- `SNAPSHOT_REBUILD_SCHEDULE`

目录要求：

- `POWERSYNC_SNAPSHOT_DIR` 必须指向持久化存储
- API 进程必须对该目录有读写权限
- 目录空间要按“活跃账号数 × 平均 SQLite 大小”预估

## 上线步骤

1. 在生产环境配置 `POWERSYNC_SNAPSHOT_DIR`，并确认目录可持久化。
2. 配置完整的 PowerSync 凭据：`POWERSYNC_URL`、`POWERSYNC_PRIVATE_KEY`、`POWERSYNC_KEY_ID`。
3. 打开自动化：`SNAPSHOT_REBUILD_ENABLED=true`。
4. 设置合理的 `SNAPSHOT_REBUILD_SCHEDULE`。
5. 重启 API 进程，确认 cron 注册日志中出现 `powersync:snapshot-rebuild`。
6. 先手动执行一次单账号构建，确认端到端链路可用。
7. 再观察首次 cron 触发，确认批量 rebuild 正常。

## 手动验收

单账号构建：

```powershell
pnpm nx run api:powersync:snapshot:build -- --identity-id <identityId>
```

仅发布已有 SQLite：

```powershell
pnpm nx run api:powersync:snapshot:publish -- --identity-id <identityId> --sqlite-path <path-to-powersync.sqlite>
```

构建后应验证：

- `POWERSYNC_SNAPSHOT_DIR/<snapshotKey>/manifest.json` 存在
- `POWERSYNC_SNAPSHOT_DIR/<snapshotKey>/powersync.sqlite` 存在
- `GET /api/v1/powersync/profile-snapshot` 返回 `available: true`
- `downloadUrl` 可下载 SQLite 文件

桌面端验收：

1. 在新 profile 或空 profile 上登录在线账号。
2. 确认桌面端优先请求 snapshot manifest。
3. 若存在 snapshot，确认本地 profile DB 先被 hydrate，再进入同步。
4. 若 snapshot 不可用或下载失败，确认会回退到空库 + 正常同步。

## 日志与观测

需要重点观察的日志：

- API 启动时 cron 注册日志
- `SnapshotRebuildJob` 的开始、跳过、完成、失败日志
- 桌面端 `ProfileSnapshotService` 的 manifest unavailable / hydrated / fallback 日志

以下情况属于预期可恢复：

- PowerSync 凭据不完整时，cron 跳过
- 没有 active accounts 时，cron 跳过
- snapshot 下载失败时，桌面端回退到空库同步

以下情况需要介入：

- cron 持续报错且没有任何账号构建成功
- snapshot 目录持续增长且没有清理策略
- manifest 存在但下载文件损坏
- 桌面端长期命中 checksum mismatch

## 手动回补

当自动作业未开启或某个账号需要紧急回补时：

1. 先手动执行 `api:powersync:snapshot:build`
2. 检查生成出的 `manifest.json` 和 `powersync.sqlite`
3. 用 API manifest/download 路由复验可访问性
4. 再让桌面端重新走该账号的首次登录或重建流程

若只已有 SQLite 文件而不需要重新拉取同步：

1. 执行 `api:powersync:snapshot:publish`
2. 再重复 manifest/download 验证

## 当前边界

本文档不承诺以下能力：

- snapshot 自动清理策略
- snapshot 增量构建
- 多副本 API 之间的 snapshot 分布式协调
- 生产环境一键自愈

当前目标只是：让现有 snapshot 构建、分发、桌面 hydrate 和 cron rebuild 可以稳定上线、可观察、可回补。
