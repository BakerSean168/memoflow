---
tags:
  - standards
  - imports
  - monorepo
  - typescript
description: Import path policy — @memoflow public seams, relative package-internal, optional @/
created: 2026-07-27T00:00:00
updated: 2026-07-27T00:00:00
---

# Import Path Policy

本文件规定业务与库代码中 **import 路径怎么写**。  
它与 [monorepo-build-standard.md](./monorepo-build-standard.md) 配套：后者管 **跨包解析到 src 还是 dist**；本文件管 **源码里写相对路径、`@/` 还是 `@memoflow/*`**。

配置细节以 `tsconfig*.json`、`eslint.config.ts`、`package.json#exports` 为准；文档与代码冲突时以代码为准。

## 一句话

> **跨包只用 `@memoflow/<pkg>[/<seam>]`；包内默认相对路径；`@/` 仅作包内可选捷径，且不得出现在「会被他包当源码消费」的路径上；禁止仓库根绝对路径与跨包深路径。**

## 优先级（从高到低）

| 优先级 | 写法 | 适用 |
| --- | --- | --- |
| 1 | `@memoflow/<pkg>` / `@memoflow/<pkg>/<seam>` | **所有跨 package 依赖** |
| 2 | `./` / `../` 相对路径 | **包内默认**；库包内部；被多 app 源码 typecheck/bundle 的共享层 |
| 3 | `@/...`（映射到 **本包** `src/*`） | 仅当文件 **确定只在本包** tsc/vite/vitest 上下文中解析，且相对路径过深时可选 |
| 禁止 | `packages/...`、`apps/...`、本机绝对路径 | 业务/库 import |
| 禁止 | 他包内部相对路径、他包 `src/`、他包的 `@/` | 破坏 encapsulation 与构建边界 |

## 规则详解

### 1. 跨包：公开入口 only

```ts
// good
import { createTimeFacade } from '@memoflow/time';
import type { GoalClientDTO } from '@memoflow/contracts/goal';
import { GoalHttpAdapter } from '@memoflow/goal/client';

// bad — 跨包深路径 / 源码路径
import { Goal } from '../../../goal/src/server/domain/aggregates/goal';
import { Goal } from '@memoflow/goal/src/server/...';
```

- 稳定 seam 以各包 `package.json#exports` 与模块收敛约定为准（常见：`root` / `api` / `client` / `electron`、contracts 子路径等）。
- 业务代码不得依赖「开发态碰巧能解析到 workspace `src`」；开发态 alias 是工具配置，不是 API。
- 详见 [monorepo-build-standard.md](./monorepo-build-standard.md)。

### 2. 包内：默认相对路径

```ts
// good — 同目录 / 近邻
import { formatProductDate } from '../utils/product-time';
import { GoalId } from '../../value-objects/goal-id';

// acceptable deep relative when needed
import { rawDataToGoalState } from '../../../infrastructure/adapters/prisma/mappers/goal-state-mapper';
```

**必须用相对路径（或本包公开 re-export）的场景：**

- `packages/contracts`、`packages/time`、以及其它 **可发布 / 被大量依赖的库包** 内部引用。
- 可能被 **另一个 package 的 typecheck / vite / vitest 直接 include 源码** 的模块  
  （典型：`packages/app-vue` 被 `apps/web` / desktop 消费）。  
  此时 `@/` 会解析到 **消费方** 的 `@/*`，而不是文件所属包（ADR-037 product-time CI 已踩坑）。
- surface / dual-registry 类「读源码字符串」的测试所锚定的实现文件，优先保持解析上下文无关。

### 3. 包内 `@/`：可选，不是默认

```ts
// optional — only inside a package that owns this @/* mapping
import type { IGoalRepository } from '@/server/domain/repositories/i-goal-repository';
```

约定：

- `@/*` **永远表示当前 package 的 `src/*`**，不是 monorepo 根，也不是全局命名空间。
- 每个 package 的 tsconfig / vite / vitest 各自配置；**不要假设** 跨项目 typecheck 时 `@/` 仍指向源文件所属包。
- 若跨包测试必须 import 带 `@/` 的内部实现，优先 **消除深依赖**；importer-aware resolver 只是逃生舱，不是目标架构。
- 库包（尤其 contracts）**不应** 使用包内 `@/` 作为内部引用风格。

### 4. 禁止项

| 禁止 | 原因 |
| --- | --- |
| `from 'packages/foo/src/...'` / `from 'apps/web/src/...'` | 绑死 monorepo 布局；破坏 package 边界 |
| 本机绝对路径 import | 不可移植 |
| 跨包使用对方的 `@/` | `@/` 不是公共 API |
| 在「可被他包源码消费」的文件中新增 `@/` | typecheck/bundle 解析错根 |

## 按包类型的默认

| 类型 | 包内默认 | `@/` | 跨包 |
| --- | --- | --- | --- |
| 库 / 叶子（`contracts`, `time`, `utils`, …） | 相对路径 | 避免 | `@memoflow/*` |
| 领域包（`goal`, `task`, …） | 相对路径 | 深树可选 | 仅公开 seam |
| 组合 UI（`app-vue`, `app-react`） | 相对路径 | 避免（多 app 源码消费） | `@memoflow/*` |
| 应用（`apps/web`, `apps/api`, …） | 相对 或 本 app `@/` | 可保留 **本 app** `@/*` | `@memoflow/*` |
| UI kit（`ui-vue-shadcn` 等） | 相对优先 | 历史 `@/` 可逐步收敛 | 最少跨包 |

## 与工具链的关系

- **TypeScript**：各包 `paths["@/*"]` 仅服务本包；应用 typecheck 的 `@/*` 指向 **该应用** `src`。
- **Vite / Vitest**：`@` → 当前 project `src`；跨包测若失败，先查是否深引了带 `@/` 的实现。
- **ESLint**：跨 feature / 跨 scope 由 `@nx/enforce-module-boundaries` 约束；`@memoflow/utils` 根导入等由 `no-restricted-imports` 约束。
  本政策的「包内相对优先」目前以 **约定 + code review** 为主，不以全量 ban `@/` 为硬闸（避免一次改爆历史债务）。
- **发布 / DTS**：不得把消费者无法解析的 `@/` 或 workspace src 路径泄漏进公开类型；见 monorepo-build-standard。

## 决策简表

```
需要另一个 package 的东西？
  ├─ 是 → 只用 @memoflow/... 公开入口
  └─ 否（本包内）
        ├─ 该文件可能被他包源码消费 / 是库包内部？ → 相对路径
        ├─ 同目录或 ≤2 层邻居？ → 相对路径
        └─ 仅本包构建图 + 深路径痛苦？ → 可用 @/
```

## 现状与迁移方向（非硬闸）

**已是默认的部分：**

- 跨包依赖文化与规范已是 `@memoflow/*`（见 monorepo-build-standard + Nx boundaries）。
- 业务/库 **源码** 中包内 `@/` import 已收敛为相对路径（含 `goal` / `task` / `authentication` / `ui-vue-shadcn` 等；见 plan `2026-07-27-import-path-elegance`）。
- `contracts`、`app-vue`、`ai`、`account`、`repository`、`time`、`utils` 等库包本就接近纯相对路径。

**仍保留的兼容层（非源码写法）：**

- 多数 package 的 `tsconfig` / 部分 vitest·vite 仍配置 `@/*` → 本包 `src`（便于 shadcn CLI、逃生舱与历史脚本）。
- `ui-vue-shadcn/components.json` 仍声明 shadcn 生成别名（`@/components`、`@/lib/utils`）；**生成后的源码应继续落相对路径**。
- ESLint **未** 全局 ban `@/`；约定 + review 为主，硬闸可 follow-up。

**迁移建议（保持）：**

1. 新代码：严格按本文件优先级写；包内默认相对路径。
2. 被多 app 源码消费的路径（`app-vue` shared 等）：禁止新增 `@/`。
3. 库包 / 领域包内部：禁止新增 `@/`。
4. 应用层（`apps/*`）可保留 **本 app** `@/*`，但跨包仍只用 `@memoflow/*`。
5. 需要短路径时，优先 **包内 barrel / 子路径 exports**，而不是扩散 `@/`。

## 相关文档

- [monorepo-build-standard.md](./monorepo-build-standard.md) — 开发态 src alias vs 构建态 dist
- [architecture.md](./architecture.md) — 分层与依赖方向
- [contract-module-development-spec.md](./contract-module-development-spec.md) — contracts 结构
- AGENT.md — 协作入口与真值顺序
