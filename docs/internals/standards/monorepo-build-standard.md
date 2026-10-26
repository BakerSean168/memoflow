---
tags:
  - standards
  - build
  - monorepo
  - typescript
description: Monorepo 开发态源码引用与构建态产物引用的统一规范
created: 2026-05-16T00:00:00
updated: 2026-05-16T00:00:00
---

# Monorepo 构建规范

## 核心规则

- 业务代码始终只导入稳定包名，例如 `@memoflow/foo`
- 开发态允许通过 tsconfig / Vite / Vitest alias 解析到 workspace `src`
- 构建态必须通过 package `exports` 或 `dist` 声明消费上游包
- 不允许在业务代码中直接导入其他包的 `src` 真实路径
- 包内路径写法（相对 vs `@/`）见 [import-path-policy.md](./import-path-policy.md)

## 配置分层

- `tsconfig.base.json`
  - 只保留编译器基线
  - 不承载 workspace `src` alias
- `tsconfig.workspace-src.json`
  - 只承载开发态 workspace 源码 alias
- `tsconfig.json`
  - 默认用于开发态、IDE、本地 typecheck
- `tsconfig.build.json`
  - 仅用于库的发布态声明生成

## 库构建分类

### 轻量库

- 适用：叶子库、依赖图浅、入口少
- 构建：`tsup` 负责 JS 与 DTS
- 要求：DTS 生成时必须切断开发态 workspace alias，仅保留包内 alias

### 复杂业务库

- 适用：多入口、多子路径、深依赖图、历史上易触发 DTS OOM 的库
- 构建：`tsup` 只负责 JS；`tsc --emitDeclarationOnly` 单独负责 DTS
- 要求：`tsconfig.build.json` 必须让外部依赖通过 package `exports` / `dist` 解析

## 应用规则

- 应用可保留少量开发态源码白名单，用于深度联调
- 未列入白名单的 workspace 包必须通过 package `exports` / `dist` 解析
- 应用生产构建不得长期依赖 workspace 源码解析
