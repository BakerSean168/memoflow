---
tags: [guide, development, git, workflow]
description: 单人多 Agent 并行 Issue / PR 工作流
updated: 2026-10-19
---

# Git 工作流：Issue / PR 并行工作流

## 最小规则

- **任务真源：GitHub Issue**。需求、方案、约束、验收、阻塞只在 Issue 中维护。
- **代码真源：Git**。每条 Issue 一个独立 Worktree + 短期分支 + 唯一 Writer，多条 Lane 可并行；其他 Agent 可基于固定 SHA 只读审查。
- **验收真源：PR + CI**。每次从创建时的最新 main 切短期任务分支；完成定向本地测试后提交 PR。各 PR 独立推进，互不等待；合并前不要求与 main 同步重跑（strict 关闭），有冲突时在本分支解决并重跑受影响检查。
- **交接：按需**。换 Agent、额度中断或阻塞时，在 Issue 记简短检查点，包括分支、Commit、未提交文件、测试证据与下一步。新 Agent 必须自己核查工作目录。
- **分析与决策**：复杂任务的关键技术决策写进 Issue；长期稳定的架构规则放在 ADR / docs/architecture。其他 Agent 可进行只读评审。
- **安全清理**。只有确认没有未提交/未跟踪成果、独有提交、运行中任务后，才清理旧 Worktree 或任务分支；不用无保护的 reset/clean。

> 并行 Lane、本地分级验证与小 PR 的完整约定见 [AGENTS.md](../../../AGENTS.md)。

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
- 任务开发可并行；main 上的 CI 按提交 SHA 各自独立运行，可重叠，不排队互等。
- 各类 CI 门禁以 GitHub Ruleset / 工作流为准；发布流程见 [release-workflow.md](./release-workflow.md)。禁止绕过 PR 直接推送 main。
- 具体 Nx 命令见 [testing.md](./testing.md)，涉及容器/部署的工作见 [local.docker.md](./local.docker.md)。
