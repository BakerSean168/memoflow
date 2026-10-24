# MemoFlow Agent Guide

本文件是 MemoFlow 的项目级 Agent 协作规范；其他平台入口仅引用本文件或补充平台特有约定。

## 真值顺序

1. 当前代码、配置和测试
2. 根配置与项目配置：`nx.json`、`project.json`、`package.json`、`eslint.config.ts`、`tsconfig.base.json`、`tsconfig.workspace-src.json`
3. `docs/` 下的正式文档
4. 历史说明、背景材料和归档计划

文档与代码冲突时，以当前代码、配置和测试为准，然后回收或修正文档。

## 工作方式

- 先读代码和配置，再修改。
- 日常代码探索优先使用 CodeGraph 查询符号、入口、调用链和影响范围；确认具体文件后再读取实现。
- 涉及 Nx workspace、project、target、affected 或任务依赖时使用 nx-mcp。
- 写简历、README、项目介绍或面试材料时，优先用 Repomix 生成阶段性项目快照；不要把 Repomix 当作日常开发的主探索方式。
- 优先使用 `pnpm` 而非 `npm`
- 开发服务统一直接调用 Nx target：
  `pnpm nx run <project>:<target>`；多个项目使用 `pnpm nx run-many ...`。
  不要为开发启动新增根级 `dev:*` 包装脚本，也不要在维护中文档中混用
  `pnpm nx <target> <project>` 或 `pnpm nx dev <project>` 等简写/推断格式。
- Desktop 开发的安全默认入口是 `pnpm nx run desktop:serve-safe`；只有确认
  依赖构建和 Electron 原生模块 ABI 已准备好时才使用
  `pnpm nx run desktop:serve`。
- 需要 build、lint、test、e2e 时，优先运行离改动最近的 Nx target。
- 涉及 Docker、运行时、env 注入、部署链路或生产镜像的改动，不再默认本地 prod-like 全套验证：PR CI 的 build lane 即为证据；只有「只在容器里能复现」的问题才用 `docker-compose.local.yml` 定向复现，用完即 down 并清理本地镜像。开发机上只保留一套 host-dev 运行面，不常驻 prod-like / staging / test 多套 compose。
- **任务真源（SSOT）**：GitHub Issue 承载需求、技术方案、关键决策、验收条件与阻塞；Git Commit 记录实现，PR/CI 记录交付证据。
- **并行开发（常态）**：每条 Issue 一个独立 Worktree + 短期分支 + 唯一 Writer；多条 Lane 可并行，互不等待对方 PR 合并。分支从创建时的最新 main 切出即可，合并前不要求与 main 同步重跑（Ruleset strict 关闭）；若 GitHub 提示冲突，在本分支解决冲突后只重跑受影响检查。其他 Agent 可基于固定 SHA 只读评审。禁止 force-push、禁止直推 main。开发机上同时存在的 Worktree 建议不超过 3 个，任务结束即清理。
- **小 PR**：一个 PR 只解决一个独立问题；大改动先在 Issue 里拆成可独立合并的切片。根级共享文件（`nx.json`、lockfile、`.github/`、`tools/ci*`、Playwright 配置）可以改，但须在 PR 描述中单独标注，并尽量与业务改动分开成独立 PR，降低互相冲突概率，不再设「专属 Lane」。
- **接手与规划**：接手前读取 Issue 及最新评论，核对真实 Git 状态、提交、PR 和 CI；复杂任务先分析，持久化的技术决策写回 Issue。
- **阶段性 Checkpoint**：复杂任务每完成一个可验证阶段，先 Commit、Push，再在对应 Issue 评论记录分支、Commit、已完成事项、实际测试、剩余工作和下一步。Agent 切换或阻塞时同样记录；小修改无需逐 Commit 留言。若突然中断来不及记录，接手 Agent 从最新远端提交及实际工作区恢复。

## 本地验证与发布主线

- 本地容器验证入口：[`docs/guides/development/local.docker.md`](docs/guides/development/local.docker.md)
- 本机运行时车道 / 端口契约：[`docs/guides/development/runtime-lanes.md`](docs/guides/development/runtime-lanes.md)
- 标准发布链路入口：[`docs/guides/development/release-workflow.md`](docs/guides/development/release-workflow.md)
- 默认顺序固定为：
  1. 本地按「最小验证」分级自检（单文件测试 + `pnpm check:changed`）；不跑全仓、不默认起容器
  2. 发起 PR，合并到 `main`
  3. 到达发布里程碑时手工运行 `Prepare Release`，由 release-please 更新或创建 release PR
  4. 合并 release PR，并等待该 **exact SHA** 的 `CI` 成功
  5. `Release Publish` 创建 Draft/tag，直接调用 Desktop assets 与 `publish-images.yml` 两条 release lane
  6. 两条 lane 与 release evidence 全部通过后才公开 GitHub Release；生产服务器 rollout 仍是独立运维步骤
- 不把“手工替换生产镜像 tag”“手工改生产 compose”“直接在生产机试错”当成默认开发流程；这些只属于例外的 rollout、回滚或故障处理动作。

## 变更策略

- 项目处于活跃开发期，不要求向后兼容。
- 不需要数据迁移路径。
- 优先做根因修复，不引入临时 shim、补丁层或双轨兼容。
- 如果更干净的结构性重构可行，优先于局部修补。
- 保持实现直接、明确、易读。

## 架构试点规则（真实业务 owner）

ADR-113 已退休虚构的 Product Governance Runtime。`Governance` 在当前仓库中仅指 Engineering Governance：`tools/governance`、`docs/governance`、`docs/standards` 与 CI architecture gates；它不再是产品 bounded context，也不存在 `packages/governance` reference module。

进行较大的系统性重构 / 架构优化时，使用**真实业务 owner vertical slice** 验证：

1. 选择能覆盖目标问题的**最小真实 owner**（如 Goal、Task、Schedule、Knowledge、Notification）；
2. 先补 characterization / contract tests，固定已有业务语义；
3. 在该 owner 上完成实现与端到端验证；
4. 再选择第二个真实 owner 验证模式是否可迁移；
5. 只有至少两个真实 owner 出现稳定重复后，才提升共享 abstraction / framework；
6. 不为了“做样板”而创建或扩展虚构业务、虚构持久化模型或虚构 UI。

Engineering Governance 负责把已经确定的结构约束编码成 deterministic audit；它验证架构，不承载产品业务。

## 配置与文档边界

- 规则入口看 [`docs/standards/README.md`](docs/standards/README.md)。
- 开发流程入口看 [`docs/guides/development/README.md`](docs/guides/development/README.md)。
- 治理入口看 [`docs/governance/README.md`](docs/governance/README.md)。
- 不在多个文件重复抄同一套配置；配置细节以配置文件本身为准。
- 局部配置允许存在，但必须继承根配置并只保留最小例外。

## 协作入口约定

- `AGENTS.md`：唯一维护中的协作规范（Codex 自动发现）。
- `CLAUDE.md`：仅使用原生 @AGENTS.md 导入本文件。
- `.github/copilot-instructions.md`：只补 GitHub/Copilot 特有约束，不复制仓库规范。
- `.github/prompts/*.md`：只保留轻量入口，引用 canonical docs，不维护过时项目结构说明。

## Repository Skills

- 项目专属 agent skills 统一放在 `tools/agent-skills/`。
- 当前本地部署验证 skill 位于 `tools/agent-skills/validate-local-deploy/`。
- 需要给其他开发者或 agent 安装时，从仓库内 skill 目录复制或软链接到本机 `$CODEX_HOME/skills`；若未设置 `CODEX_HOME`，则使用 `~/.codex/skills`。
- 安装示例与目录约定见 `tools/agent-skills/README.md`。

## 最小验证

- 迭代时只跑改动文件旁边的测试，单文件直跑是正式入口：`pnpm exec vitest run <path/to/file.test.ts>`（或 `pnpm test:file <path>`），或最近的 Nx target：`pnpm nx run <project>:test`。
- Push 前跑一次统一自检：`pnpm check:changed`（对 affected 项目跑 lint + typecheck + 快测试）。
- 不在本地跑全仓：不跑 `pnpm test` / `pnpm lint` / `pnpm typecheck`（--all），不在本地跑 integration / coverage / Web E2E 全量；全量验证归 PR CI 与 Nightly Audit。
- Bug 修复要带针对该 bug 的回归测试；纯视觉调整用改动前后截图作为证据，不机械加测试。
- 文档和治理相关改动至少运行 `pnpm nx run memoflow:governance-check`。

桌面端在 Windows 开发模式下的日志目录：
`%LOCALAPPDATA%\MemoFlow-Dev\state\logs`
