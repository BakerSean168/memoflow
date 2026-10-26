---
tags:
  - governance
  - configuration
description: 配置治理规则
created: 2026-04-26T00:00:00
updated: 2026-04-26T00:00:00
---

# 配置治理

这篇文档只回答“哪些配置是仓库真值、哪些局部配置是允许的例外”。

## 根配置真值

以下文件是仓库级基线：

- `nx.json`
- `project.json`
- `package.json`
- `eslint.config.ts`
- `tsconfig.base.json`
- `tsconfig.workspace-src.json`
- `.prettierrc`
- `.editorconfig`

默认先继承这些文件，不再在多处复制同一套规则。

## 允许局部配置的场景

- 构建器差异：例如 `vite.config.ts`、`tsup.config.ts`
- 测试环境差异：例如 `vitest.config.ts`、`playwright.config.ts`
- 运行时差异：例如 Electron、Python 服务、React Native
- 极少数项目级 lint 例外

## 局部配置约束

- 局部 `eslint` 配置必须以根 `eslint.config.ts` 为基线
- 只保留最小例外，不复制整套平行规范
- 例外要尽量写在配置旁边，而不是额外写一份总览文档
- 如果某个局部配置已经没有差异价值，应直接回收

## 项目标签约定

- app / package 项目至少包含一个 `scope:*`
- app / package 项目至少包含一个 `type:*`
- app / package 项目至少包含一个 `layer:*`
- `platform:*` 只作为补充维度，不替代上面三类标签

## 变更策略

- 新增规则优先落到根配置或治理脚本
- 只有确实存在项目差异时才引入局部配置
- 配置与文档冲突时，以配置本身和检查脚本为准
