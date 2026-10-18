---
tags:
  - guide
  - ai
  - index
description: AI goal 与 agent workflow 文档导航
created: 2026-04-18T00:00:00
updated: 2026-04-29T00:00:00
---

# AI Goal / Agent 文档导航

这个目录不再维护活跃实施计划。

- 当前需求、方案和验收以 GitHub Issues 为唯一任务真源
- `docs/guides/ai` 只保留索引、学习材料、冻结实现记录和工程参考
- 当前实现真值优先看代码、配置和 `docs/guides/development`

## 历史方案与现状

- [2026-04-29-ai-goal-agent-workflow-unification.md](../../plan/archive/2026-04-29-ai-goal-agent-workflow-unification.md)
  - 历史统一方案与冻结实施记录；当前行为以代码、配置、测试为准；未完成需求以 GitHub Issues 为准
- [ai-goal-creation-current-workflow.md](../development/ai-goal-creation-current-workflow.md)
  - 当前真实主链路说明，帮助区分现状与目标

## Frozen Implementation

- [goal-workflow-v1/README.md](./goal-workflow-v1/README.md)
  - 冻结 2026-04-19 的第一版 goal workflow 实现记录
- [ai-chat-streaming-current-implementation.md](../development/ai-chat-streaming-current-implementation.md)
  - 当前 AI 聊天与流式实现说明

## Learning / Career Reference

- [ai-agent-role-and-skills-guide.md](./ai-agent-role-and-skills-guide.md)
  - AI Agent / AI 应用工程岗位、技能地图与投递样本
- [memoflow-ai-goal-learning-guide.md](./memoflow-ai-goal-learning-guide.md)
  - 基于本仓库的 AI goal workflow 学习路线

## Engineering Reference

这些文档保留实现细节和分析价值，但不是当前 canonical plan：

- [p0-1-python-implementation-guide.md](./p0-1-python-implementation-guide.md)
- [code-review-python-p0-1.md](./code-review-python-p0-1.md)
- [code-review-frontend-p0-1.md](./code-review-frontend-p0-1.md)
- [ai-service-tdd-test-framework.md](./ai-service-tdd-test-framework.md)
- [TDD-in-AI-agent-development.md](./TDD-in-AI-agent-development.md)

## Archived Plans

以下文档已迁入 `docs/plan/archive`，保留历史参考价值：

- [route-2-unified-ai-workflow-orchestrator-plan.md](../../plan/archive/route-2-unified-ai-workflow-orchestrator-plan.md)
- [memoflow-ai-goal-feature-backlog.md](../../plan/archive/memoflow-ai-goal-feature-backlog.md)
- [P0-1-文档导航.md](../../plan/archive/P0-1-文档导航.md)
- [P0-1-clarification-complete-summary.md](../../plan/archive/P0-1-clarification-complete-summary.md)
- [p0-1-clarification-implementation-plan.md](../../plan/archive/p0-1-clarification-implementation-plan.md)

## Usage Rules

- 新的 AI 方案只写入 GitHub Issue，不创建独立 Plan
- 已有 archive 仅为冻结历史，不代表待实施任务
- `goal-workflow-v1/` 只记录历史实现，不混入未来方案
- 具体实现细节以当前代码、配置、测试和 `docs/guides/development` 为准
