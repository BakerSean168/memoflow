---
tags:
  - guide
  - development
  - git
  - workflow
description: Git 协作流程入口
created: 2025-11-23T16:20:00
updated: 2026-04-13T00:00:00
---

# Git 工作流

这篇文档只保留仓库当前需要的最小协作约定，不再维护大段 Git 教程、分支案例库或历史流程说明。

## Worktree 开发模式

项目使用 git worktree 长期槽位模式，支持多个 AI agent 并行开发。

### 目录结构

```
D:\home\projects\memoflow\          # main worktree，干净基准
D:\home\projects\memoflow-tree1\    # 长期开发槽位 1
D:\home\projects\memoflow-tree2\    # 长期开发槽位 2
```

### 端口分配

| 服务       | main | tree1 | tree2 |
| ---------- | ---- | ----- | ----- |
| API        | 3000 | 3010  | 3020  |
| Web (Vite) | 5173 | 5183  | 5193  |

端口契约来自 `tools/runtime/profiles.json`；host-dev 使用项目端口块，prod-like 的机器级 override 仅放在 `.env.prod-like.local`。

### 在槽位内开发

每个槽位同时只处理一个任务。进入槽位后从 `origin/main` 切 feature 分支：

```bash
cd D:\home\projects\memoflow-tree1
git fetch origin
git switch -c feature/你的任务 origin/main
```

任务完成并合并后，清理并切到下一个任务：

```bash
git fetch origin
git switch -c feature/下一个任务 origin/main
```

### Docker 服务

PostgreSQL 和 Redis 跑在 Docker 里，所有 worktree 共用同一套实例，不需要重复启动。

### 注意事项

- 切换任务前确保当前工作区干净（已提交或 stash）
- 不要在多个 worktree 中 checkout 同一个本地分支
- 每个 worktree 的 `node_modules` 和 Prisma Client 是独立的，`pnpm install` 已通过全局 store 共享缓存

## 当前约定

- 使用短生命周期分支，默认从 `main` 切出并通过 PR 合回 `main`。
- 提交信息遵循 Conventional Commits，重点是 `feat`、`fix`、`refactor`、`docs`、`test`、`chore`。
- 提交前先跑离改动最近的 Nx target；测试入口见 [`testing.md`](./testing.md)。
- 容器、运行时和部署相关改动，默认先走 [`local.docker.md`](./local.docker.md) 的本地 Docker 验证，再进入 PR。
- 不在仓库文档里维护和平台配置强绑定的 PR 审批、保护分支或发布面板操作细节。

## 最小实践

- 分支命名保持直接可读，例如 `feat/sync-token`, `fix/desktop-ipc-timeout`, `refactor/task-module`。
- commit message 只表达一次原子变更，不把多类修改揉进同一条提交。
- 文档改动如果同时伴随代码或配置变化，应和对应实现一起提交，避免”文档先于代码”或”代码已变、文档未跟”。
- 如果流程规则已经固化在 CI、仓库设置或发布配置中，文档只保留入口说明，不重复解释平台操作。

## 发布入口

- 标准发布链路见 [release-workflow.md](./release-workflow.md)。
- 日常开发不要把手工修改生产镜像 tag 或手工替换线上容器当成默认流程。
