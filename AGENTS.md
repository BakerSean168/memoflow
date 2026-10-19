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
- 涉及 Docker、运行时、env 注入、部署链路或生产镜像的改动，默认先用 `docker-compose.local.yml` 做本地 prod-like 验证，再进入 PR。
- **任务真源（SSOT）**：GitHub Issue 承载需求、技术方案、关键决策、验收条件与阻塞；Git Commit 记录实现，PR/CI 记录交付证据。
- **严格串行**：仓库使用一个 Worktree，同一时刻一个 Writer。从最新 main 创建短期任务分支，通过 PR 必需 CI 并合并后，才启动下一条 Issue 的编码。其他 Agent 可基于固定 SHA 只读评审。
- **⚠️ 临时冲刺规则（2026-10-19 起，仅在当前全部 open Issue 完成前有效）**：允许最多 3 条并行 Lane，每条 Lane 独立 Worktree + 短期分支 + 唯一 Writer；不同 Lane 的 Issue 不得修改相同文件；`.github/`、`tools/ci*`、`nx.json` 等根级配置、lockfile、Playwright/CI 配置只归 CI Lane。冲刺期间 GitHub CI 停用、Ruleset 不要求 `CI Check`：合并前分支须与 main 同步（`gh pr update-branch`，禁止 force-push），仅运行本地快速检查（ci-cd-platform 工具测试、改动项目的 lint/typecheck、governance-check）后串行合并；CI 工具类 PR 须注明“真实 CI 验证待冲刺结束”。冲刺结束后由编排者恢复 Ruleset 与 CI，并恢复上面的严格串行 + 必需 CI 规则，同时删除本条。
- **接手与规划**：接手前读取 Issue 及最新评论，核对真实 Git 状态、提交、PR 和 CI；复杂任务先分析，持久化的技术决策写回 Issue。
- **阶段性 Checkpoint**：复杂任务每完成一个可验证阶段，先 Commit、Push，再在对应 Issue 评论记录分支、Commit、已完成事项、实际测试、剩余工作和下一步。Agent 切换或阻塞时同样记录；小修改无需逐 Commit 留言。若突然中断来不及记录，接手 Agent 从最新远端提交及实际工作区恢复。

## 本地验证与发布主线

- 本地容器验证入口：[`docs/guides/development/local.docker.md`](docs/guides/development/local.docker.md)
- 本机运行时车道 / 端口契约：[`docs/guides/development/runtime-lanes.md`](docs/guides/development/runtime-lanes.md)
- 标准发布链路入口：[`docs/guides/development/release-workflow.md`](docs/guides/development/release-workflow.md)
- 默认顺序固定为：
  1. 本地用 `pnpm docker:local:up` 验证；该入口会注入当前 Git revision 与构建时间到本地镜像标签
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

- 文档和治理相关改动至少运行 `pnpm nx run memoflow:governance-check`。
- 代码和配置改动再补离改动最近的 `lint`、`typecheck`、`test` 或其他相关 target。

桌面端在 Windows 开发模式下的日志目录：
`%LOCALAPPDATA%\MemoFlow-Dev\state\logs`
