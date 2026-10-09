---
tags:
  - plan
  - desktop
  - profile
description: 独立 Profile、多账户与访客复制导入的研究和系列文档计划
created: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

# Desktop Profile 研究与设计文档

**状态：研究与系列文档交付完成，2026-10-09 归档。** [系列入口](../../product/desktop-profiles/README.md)；后续 [功能实施计划](../active/2026-10-09-desktop-independent-profiles.md) 保持未开始。

## 范围

根据用户提供的账户体系讨论，核实当前实现与官方参考，交付详细系列文档。本轮不实现功能、不改认证和用户数据、不部署或创建 PR。

目标原则：添加云端账户打开独立 Profile；仅在云端无业务数据且本机存在可导入访客数据时主动提供一次可选复制导入；源 Profile 默认保留。

## 步骤

- [x] 读取 Profile、Cloud Auth、Data Portability V3、PowerSync 和 UI 的当前实现、测试与既有 ADR。
- [x] 核实 Better Auth、PowerSync 与成熟产品的官方资料。
- [x] 编写现状证据、提议 ADR、产品交互、导入与核验协议、实施和验收计划。
- [x] 更新导航与词汇表，校验引用和状态，运行文档治理检查。
- [x] 研究完成后归档本计划；后续功能实施保持未开始状态。

## 约束与验证

- 现有未提交代码和其他计划属于既有工作，保留原样。
- 当前代码优先于附件中的历史判断；设计提议不能写成已实施事实。
- 仅文档变更，至少运行 `pnpm nx run memoflow:governance-check`。
- 记录未执行的运行时验证和实施前需确认的技术问题。

## 结果

交付七篇核心文档（含导航）、项目词汇表补充与相关索引；ADR-119 提议中，实施计划包含 28 项验收场景。研究修正了 AccountView 解析、AI 导入重试、笔记/消息覆盖和删除证据等假设，并提出服务端 apply 的候选方案。

文档检查与治理主检查通过；完整治理命令被既有新增测试引起的 inventory stale 阻断，未更改其他工作的生成清单。命令与限制见[验证记录](../active/2026-10-09-desktop-independent-profiles.md#8-本轮文档验证)。
