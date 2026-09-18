---
tags:
  - governance
  - nx
  - targets
description: Target 基线治理：项目分类、必需 target、豁免类型与回收流程
created: 2026-05-23T00:00:00
updated: 2026-05-30T00:00:00
---

# Target 基线治理

## 概述

每个 repo-owned 项目必须按其分类具备对应的 target 基线。未达标且未登记豁免的项目会导致 `target-baseline-check` 失败。

审计范围固定为：

- root `project.json`
- `apps/**/project.json`
- `packages/**/project.json`
- `tools/**/project.json`

除此之外的 `project.json` 不属于 target 基线治理输入。

## 项目分类

| 类别 | 典型项目 | 必需 target |
|------|---------|------------|
| `app` | web, desktop, mobile, api | build, lint, typecheck, test |
| `runtime-lib` | domain 包、infra 包、shared 包（含 patterns、utils） | build, lint, typecheck, test |
| `ui-lib` | app-vue, ui-vue-shadcn, ui-react-native, assets | build, lint, typecheck, test |
| `tooling-lib` | nx-test-system, test-utils | build |
| `meta-project` | memoflow (root) | 无强制要求 |

## 分类规则

分类的唯一权威来源是 `tools/governance/target-baseline-manifest.json` 中的 `projectRules` 字段。以下 tag 规则仅作为分类时的参考指南：

- 有 `type:app` → `app`
- 有 `layer:domain` 或 `layer:infra` 或 `layer:shared` → `runtime-lib`
- 有 `layer:ui` → `ui-lib`
- 有 `type:plugin` 或 `layer:testing` → `tooling-lib`
- 是 workspace root → `meta-project`

新增项目时，必须在 manifest 的 `projectRules` 中显式登记分类。

`projectRules` 中保留失效项目名会导致审计失败；manifest 必须与真实项目集合保持同步。

## 新增项目流程

1. 在 `project.json` 中添加正确的 `scope:*`、`type:*`、`layer:*` tags
2. 在 `tools/governance/target-baseline-manifest.json` 的 `projectRules` 中添加分类
3. 运行 `pnpm nx run memoflow:target-baseline-check` 确认通过
4. 如果某个必需 target 暂时无法添加，必须在 `exemptions` 中登记理由

## 申请豁免

豁免必须满足以下条件：

1. 在 `target-baseline-manifest.json` 的 `exemptions` 数组中添加条目
2. 每条豁免必须包含：
   - `project`：项目名称
   - `target`：豁免的 target 名称
   - `type`：`permanent` 或 `temporary`
   - `reason`：豁免理由（必须说明为什么不需要这个 target）
3. 豁免必须引用：
   - 审计范围内真实存在的项目
   - 该项目所属类别本来就要求的 target
4. `temporary` 豁免还必须包含：
   - `owner`：负责收口该豁免的 owner
   - `targetDate`：目标收口时间（例如 `2026-Q3`）
5. 理由应说明为什么属于永久例外或临时推迟

### 豁免理由示例

- 永久豁免：`"Static asset lib: no source code to lint"`
- 暂时推迟：`"Test infrastructure not yet set up; integration pending"`

### 豁免类型约定

- `permanent`
  - 仅用于平台天然例外、静态资产、无业务行为 schema 等长期不会补齐该 target 的项目
- `temporary`
  - 用于工程欠账、测试基础设施未完成、过渡阶段未补齐的 target
  - 必须始终带 `owner` 与 `targetDate`

如果豁免理由本质上是“现在还没做”，则不应登记为 `permanent`。

## 豁免回收

豁免不是永久通行证。以下情况应回收豁免：

- 项目性质变化（如从纯 asset 变为包含 TypeScript 源码）
- 相关基础设施就绪（如 test runner 集成完成）
- 在 code review 中发现豁免理由已不成立
- 原先登记为 `permanent` 的理由经复核其实属于工程欠账

回收方式：从 `exemptions` 中删除对应条目，然后确保项目已具备该 target。

## 文件位置

- 审计脚本：`tools/governance/target-baseline-audit.mjs`
- 基线清单：`tools/governance/target-baseline-manifest.json`
- 运行命令：`pnpm nx run memoflow:target-baseline-check`
- 作为 `governance-check` 的一部分自动运行
