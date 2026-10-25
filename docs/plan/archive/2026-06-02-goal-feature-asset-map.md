---
tags:
  - plan
  - active
  - product
  - goal
description: 目标模块功能资产底图建设计划
created: 2026-06-02T00:00:00
updated: 2026-06-02T00:00:00
---

# 目标模块功能资产底图建设计划

## 目标

以 `goal` 模块为样板，建立一套轻量的当前功能资产文档。第一版只回答“当前系统有什么、用户怎么用、代码落点在哪里、后续优化要注意什么”，不进入具体业务优化实现。

## 范围

- 新增 `docs/product` 作为长期业务功能资产入口。
- 新增全局功能地图，先覆盖核心业务模块并标注盘点状态。
- 新增目标模块说明，描述当前功能、用户路径、业务规则、问题、优化机会和风险点。
- 新增目标模块文件索引，连接前端、移动端、API、领域包、contracts、数据结构和测试。
- 复用现有 AI Goal workflow 开发说明，不重复维护平行长文。
- 更新 README 和治理入口，让 `docs/product` 成为正式文档导航的一部分。

## 不做

- 不修改业务代码、API、contracts、schema 或测试。
- 不写完整 PRD。
- 不把当前问题直接转成优化实现方案。
- 不为所有模块一次性补齐同等深度文档。

## 实施步骤

1. 创建 `docs/product` 目录和入口文档。
2. 创建 `feature-map.md`，用目标模块作为样板条目。
3. 创建 `modules/goal.md`，沉淀目标模块当前业务资产。
4. 创建 `module-index/goal-files.md`，沉淀目标模块代码与测试索引。
5. 更新 README 和治理文档导航。
6. 运行文档治理检查。

## 验收标准

- 目标模块资产文档可以让后续优化前快速确认功能边界、入口、代码落点和风险点。
- README 与治理入口能找到 `docs/product`。
- `pnpm nx run memoflow:docs-check` 通过。
- `pnpm nx run memoflow:governance-check` 通过。
