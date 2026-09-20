---
tags:
  - guide
  - development
  - index
description: 开发指南目录索引
created: 2025-01-22T00:00:00
updated: 2026-07-29T00:00:00
---

# 开发指南

本目录只保留开发流程相关的入口文档。规范来源、测试入口和配置细节优先以对应主题文档和代码注释为准，不在这里维护历史状态说明。

## 当前入口

| 文档                                                                                         | 用途                                                                         |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [ai-goal-creation-current-workflow.md](./ai-goal-creation-current-workflow.md)               | 系统讲解当前 AI 创建目标工作流，覆盖草稿生成、自动化执行、分层结构和调试入口 |
| [ai-chat-streaming-current-implementation.md](./ai-chat-streaming-current-implementation.md) | 分析当前 AI 对话页和流式实现，梳理现状与后续手动扩展路线                     |
| [coding-standards.md](./coding-standards.md)                                                 | 代码风格、分层和通用实现约束                                                 |
| [git-workflow.md](./git-workflow.md)                                                         | 分支、提交和协作流程                                                         |
| [local-development.md](./local-development.md)                                               | 本机开发模式、Docker/宿主服务替换、Desktop 启动与统一 Nx 命令心智            |
| [local.docker.md](./local.docker.md)                                                         | 使用 `docker-compose.local.yml` 做 prod-like 本地容器验证的入口              |
| [transactional-email-smtp.md](./transactional-email-smtp.md)                                 | 事务邮件 console / SMTP / Resend、域名 DNS、Redis challenge                  |
| [runtime-lanes.md](./runtime-lanes.md)                                                       | host-dev / prod-like / staging / prod 四环境与辅助测试 lane 的端口契约       |
| [powersync-profile-snapshot-rollout.md](./powersync-profile-snapshot-rollout.md)             | PowerSync per-profile snapshot 的部署、验收、观测与手动回补说明              |
| [release-workflow.md](./release-workflow.md)                                                 | Release Lifecycle V2 当前操作入口；V3 目标见架构与 active plan               |
| [testing.md](./testing.md)                                                                   | 测试快速入口，跳转到 `docs/test`                                             |
| [tech-stack-upgrade-local-sync.md](./tech-stack-upgrade-local-sync.md)                       | 2026-07 技术栈升级后本机/worktree 依赖与 Docker 卷同步指南                   |

## 使用约定

- 需要入门入口时，优先看 [`docs/getting-started/README.md`](../../getting-started/README.md) 和根 `README.md`。
- 需要测试命令或测试分层时，优先看 [`docs/test/README.md`](../../test/README.md)。
- 需要仓库规范时，优先看 `docs/standards/` 和对应主题指南。
- 日志位置、主题同步、运行期配置等实现细节优先看对应模块代码、配置文件和注释，不再单独维护厚指南。
- 目录索引不再维护统计、对齐日志或历史更新记录。
