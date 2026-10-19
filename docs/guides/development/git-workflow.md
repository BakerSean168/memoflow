---
tags: [guide, development, git, workflow]
description: 单人多 Agent 多 Lane 并行 Issue / PR 工作流
updated: 2026-10-19
---

# Git 工作流：Issue-only / Lane Worktrees

## 最小规则

- **任务真源：GitHub Issue**。需求、方案、约束、验收、阻塞只在 Issue 中维护。
- **代码真源：Git**。最多 3 条并行 Lane，每条 Lane 一个独立 Worktree、一个短期分支、一个 Writer；不同 Lane 的 Issue 不得修改相同文件。`.github/`、`tools/ci*`、`nx.json` 等根级配置、lockfile、Playwright/CI 配置只归 CI Lane。其他 Agent 只能基于固定 SHA 只读审查。
- **验收真源：PR + Required CI**。每次从最新 main 创建短期任务分支；完成定向本地测试，提交 PR。合并前分支必须与 main 同步（`gh pr update-branch`，禁止 force-push）且 `CI Check` 通过；合并串行进行，同一 Lane 内上一条 Issue 合并后才启动下一条。
- **交接：按需**。换 Agent、额度中断或阻塞时，在 Issue 记简短检查点，包括分支、Commit、未提交文件、测试证据与下一步。新 Agent 必须自己核查工作目录。
- **分析与决策**：复杂任务的关键技术决策写进 Issue；长期稳定的架构规则放在 ADR / docs/architecture。其他 Agent 可进行只读评审。
- **安全清理**。只有确认没有未提交/未跟踪成果、独有提交、运行中任务后，才清理旧 Worktree 或任务分支；不用无保护的 reset/clean。

## 日常循环

```bash
git status --short --branch
git fetch origin
git worktree add -b feat/ISSUE-short-slug ../memoflow-<lane> origin/main
cd ../memoflow-<lane>

# 修改源码、运行最近的 Nx 检查、提交
git push -u origin feat/ISSUE-short-slug
gh pr create --base main --fill

# PR Required CI 全绿、已合并后
git switch main
git pull --ff-only
```

- 若工作目录仍有未提交更改或前一个 Agent 正在写入，**不要切换分支**；先接管任务并安全保存。
- Lane 之间并行开发，Lane 内串行；合并串行，合并前同步 main 并重新通过 `CI Check`。
- 各类 CI 门禁以 GitHub Ruleset / 工作流为准；发布流程见 [release-workflow.md](./release-workflow.md)。禁止绕过 PR 直接推送 main。
- 具体 Nx 命令见 [testing.md](./testing.md)，涉及容器/部署的工作见 [local.docker.md](./local.docker.md)。
