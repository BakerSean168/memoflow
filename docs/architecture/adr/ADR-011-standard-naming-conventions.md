# ADR-011: Standard - Naming Conventions

## Status

Accepted

## Date

2026-01-15

## Context

仓库内同时存在 TypeScript、Vue、React、Expo Router 和 Python。此前 ADR-011 把“所有文件统一 kebab-case”作为单一规则，但实际工程中：

- 普通 TS 模块多数已经是 `kebab-case`
- Vue 组件文件大量采用 `PascalCase`
- hooks / composables 既有 `camelCase`，也有 `kebab-case`
- Expo Router 与 Python 本身存在框架/语言约定

继续强推单一文件命名规则，只会制造无意义 churn，并让规范与真实代码结构长期背离。

## Decision

命名规范改为按文件职责分层，而不是按“所有文件一刀切”。

### 1. File & Directory Naming

- **Directories:** `kebab-case`
- **Ordinary TS / JS modules:** `kebab-case`
- **UI components / views / screens / dialogs / cards / widgets / page objects:** `PascalCase`
- **Hooks / composables:** `camelCase`，并与主导导出保持一致，例如 `useTaskService.ts`
- **Framework-reserved files:** 保留框架要求的命名，例如 `_layout.tsx`、`[id].tsx`
- **Python source and tests:** `snake_case`

### 2. Code Symbol Naming

- **Classes / Interfaces / Types:** `PascalCase`
- **Variables / Functions / Methods:** `camelCase`
- **Constants:** 全局共享常量优先 `UPPER_SNAKE_CASE`，局部简单常量保持 `camelCase`
- **Boolean vars:** 使用 `is`、`has`、`can`、`should` 前缀

### 3. Specific Patterns

- **DTOs:** 以 `Request`、`Response` 或 `DTO` 结尾
- **Hooks / composables:** 以 `use` 前缀命名，文件名镜像导出符号
- **Component exports:** 导出符号与文件名都使用 `PascalCase`
- **Class-heavy business modules:** 文件名仍使用 `kebab-case`，类名体现在导出符号中

### 4. Explicit Exceptions

以下路径或文件类型不按本 ADR 做统一重命名：

- 生成物与 vendored 输出
- 构建产物目录
- 文档资产、截图、论文材料、归档文件
- 框架强约束文件名

## Examples

- Ordinary module: `goal-service.ts`
- Component file: `GoalDialog.vue`
- Hook file: `useTaskService.ts`
- Expo Router file: `_layout.tsx`
- Python module: `goal_planning_service.py`

## Consequences

- **Positive:** 规范与技术栈现实一致；减少无意义重命名；让组件、hooks 和普通模块各自遵循最自然的命名方式。
- **Negative:** 需要一次性收敛当前混用的 hooks / composables 和少量普通 TS 模块命名；治理脚本需要识别文件职责而非只看一种 casing。
