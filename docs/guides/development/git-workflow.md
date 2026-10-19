---
tags: [guide, development, git, workflow]
description: 单人多 Agent 严格串行 Issue / PR 工作流
updated: 2026-10-19
---

# Git 工作流：Issue-only / Single Worktree

## 最小规则

- **任务真源：GitHub Issue**。需求、方案、约束、验收、阻塞只在 Issue 中维护。
- **代码真源：Git**。每仓库只有一个常用工作目录、一个当前 Writer；其他 Agent 只能基于固定 SHA 只读审查。
- **验收真源：PR + Required CI**。每次从最新 main 创建短期任务分支；完成定向本地测试，提交 PR；必需检查通过并合并后，才启动下一个 Issue 的写入任务。
- **交接：按需**。换 Agent、额度中断或阻塞时，在 Issue 记简短检查点，包括分支、Commit、未提交文件、测试证据与下一步。新 Agent 必须自己核查工作目录。
- **分析与决策**：复杂任务的关键技术决策写进 Issue；长期稳定的架构规则放在 ADR / docs/architecture。其他 Agent 可进行只读评审。
- **安全清理**。只有确认没有未提交/未跟踪成果、独有提交、运行中任务后，才清理旧 Worktree 或任务分支；不用无保护的 reset/clean。

> **临时冲刺规则（2026-10-19）**：当前全部 open Issue 完成前，允许最多 3 条并行 Lane 且以本地快速检查代替 GitHub CI，详见 [AGENTS.md](../../../AGENTS.md)。冲刺结束后恢复本页的严格串行 + Required CI 规则。

## 日常循环

```bash
git status --short --branch
git switch main
git pull --ff-only
git switch -c feat/ISSUE-short-slug

# 修改源码、运行最近的 Nx 检查、提交
git push -u origin feat/ISSUE-short-slug
gh pr create --base main --fill

# PR Required CI 全绿、已合并后
git switch main
git pull --ff-only
```

- 若工作目录仍有未提交更改或前一个 Agent 正在写入，**不要切换分支**；先接管任务并安全保存。
- 任务开发严格串行，但独立 GitHub Runner 可并行执行彼此隔离的测试。
- 各类 CI 门禁以 GitHub Ruleset / 工作流为准；发布流程见 [release-workflow.md](./release-workflow.md)。禁止绕过 PR 直接推送 main。
- 具体 Nx 命令见 [testing.md](./testing.md)，涉及容器/部署的工作见 [local.docker.md](./local.docker.md)。
