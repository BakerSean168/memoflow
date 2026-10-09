---
tags:
  - plan
  - desktop
  - performance
  - research
description: 基于 0.16.0 当前代码复核 Electron 性能参考方案，形成可验证的优化研究
created: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

# Desktop 性能研究

## 范围与交付

用户要求参考附件，深入研究 MemoFlow 的优化问题，重点为 Electron 桌面端。本轮交付研究、可复现实验和建议路线；不把候选架构写成已采纳 ADR，不修改产品执行逻辑。

基准：`f34eff34f4a5567c57181c4fc5ef0d357a0a8eb1` / `0.16.0`。开始时工作区干净。代码、配置和测试优先于附件及历史文档。

## 步骤

1. 核对附件、版本、项目规则和已有优化。
2. 审查启动、Profile/PowerSync 生命周期、辅助窗口、IPC/query、Local Vault、AI、后台任务与构建依赖。
3. 核对 Electron、PowerSync、SQLite、Vue 等官方资料；执行有边界的隔离实验，不使用真实用户数据。
4. 在 `docs/analysis/2026-10-09-desktop-performance-research.md` 汇总证据、优先级、可执行纵切和验收矩阵。
5. 运行 `pnpm nx run memoflow:governance-check` 与必要文档检查，归档本研究计划。

## 工程边界

- Markdown 文件仍为 Local Vault 正文事实源；PowerSync 本地数据库仍为既有业务事实源；索引只能是可重建派生数据。
- Shell、Profile、窗口、订阅、后台任务与数据库各自的 owner 不因性能建议改变；云恢复及索引任务需考虑切换代次、取消与退出。
- IPC 输入验证、权限、身份隔离、持久化、提醒落盘及更新退出协议均需保留。
- 区分静态证据、隔离实验、性能假设与 Windows 正式包验收；不把 Linux 微基准或历史产物写成 Windows 当前运行指标。
- 当前会话未暴露 CodeGraph / nx-mcp 工具，按仓库当前文件、符号引用和 Nx CLI 核验；工具缺口不形成第二套项目事实。

## 进度

- [x] 附件与当前版本核对。
- [x] 代码审查与官方资料核验。
- [x] 隔离实验与证据整理。
- [x] 报告、文档检查与研究计划归档。

## 研究结果

已完成[深入研究报告](../../analysis/2026-10-09-desktop-performance-research.md)，并保留三组复现脚本、原始 JSON 与实验数据交互摘要。新增证据包括 PowerSync 的 Worker/定时器保留及 wrapper 时序反例、gray-matter 全文历史缓存、Vault 10k 截断对身份唯一性的影响、在途搜索切换 binding 混合数据，以及 renderer mount 前的第二处云校验等待。

现有 Repository focused tests 15/15、Desktop focused tests 15/15 通过；三个隔离实验成功退出；脚本语法、JSON 和报告本地链接检查通过；`pnpm nx run memoflow:governance-check`（包含文档检查）与 `git diff --check` 通过，归档后已用同一入口复核。

仅研究交付完成。报告中的产品优化纵切仍是待实施建议，没有修改产品执行逻辑、采纳新 ADR 或宣称 Windows 整应用性能收益。
