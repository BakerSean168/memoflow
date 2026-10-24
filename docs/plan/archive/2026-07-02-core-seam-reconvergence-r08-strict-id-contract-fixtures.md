---
tags:
  - plan
  - archive
  - architecture
  - refactor
  - rounds
  - r08
description: R08 执行文档，收紧 strict ID contract，并统一 task、schedule、api-smoke 相关 fixture 体系
created: 2026-07-02T00:00:00+08:00
updated: 2026-07-03T20:54:00+08:00
---

# R08 Strict ID Contract Fixtures

## 1. Objective

把 ID 契约从“warning but pass”收敛成统一、强约束、可验证的底层设施，同时回收高噪声测试 fixture。

## 2. Why This Round Exists

如果 happy-path 继续依赖非法 ID fixture，测试就会一边通过、一边输出 warning，既掩盖问题，也阻碍后续回归定位。

更重要的是，生产代码和测试代码会开始生活在两套世界里：

- 生产代码相信 branded ID contract
- 测试代码假装裸字符串也算“正常输入”

`R08` 的目标就是把这两套世界重新并成一套。

## 3. Entry Conditions

- `R07` 已 done
- transport seam 已统一
- 当前 warning 主要集中在 task/schedule/api-smoke 这一层

## 4. In Scope

- shared ID generator/builders
- `packages/task/src/testing/*`
- task/schedule mapper specs
- API smoke tests
- 本轮触碰到的同类 fixture

## 5. Out Of Scope

- 新的架构抽象
- projection/runtime 逻辑调整
- host-level direct tests

## 6. Must Delete In This Round

- 被触碰目录中的非法 ID happy-path fixture
- 依赖 warning 才能通过的测试数据
- “顺手兼容” 裸字符串 ID 的 helper

## 7. Target Shape

### 7.1 统一合法 fixture builder

最终所有 happy-path fixture 都应该来自共享 builder，例如：

```ts
anIdentityId();
aTaskTemplateId();
aScheduleTaskId();
```

名字可调整，但原则不能变：

- 不再手写 `identity-1`、`task-1`、`template-1`
- 不再在不同模块各自发明 ID 常量

### 7.2 invalid-ID 只存在于显式错误测试

只有在“故意验证非法输入”时，才允许写非法字符串，并明确断言失败行为。

### 7.3 `Id.of()` / `parse()` 成为真正强约束入口

不要继续接受“warning 后继续运行”的默认 happy-path。

## 8. File Checklist

- `packages/task/src/testing/*`
- `packages/task/src/infrastructure-server/adapters/prisma/mappers/*.spec.ts`
- `packages/schedule/src/infrastructure-server/adapters/prisma/mappers/*.spec.ts`
- `apps/api` smoke test fixtures
- shared ID contract / builder 入口

## 9. Suggested Execution Slices

1. 定义共享合法 ID builder
2. 先清 task/schedule/api-smoke 的高噪声 fixture
3. 收紧 `Id.of()` 或 `parse()` 的行为
4. 为 invalid-ID 场景补显式失败测试
5. 清理 stderr warning 与文档说明

## 10. Suggested Commit Slices

1. shared builders
2. task fixtures
3. schedule fixtures
4. api-smoke fixtures
5. invalid-ID tests 与收尾

## 11. Do Not Do

- 不要保留“兼容旧 fixture 的宽松 parse”
- 不要在业务代码和测试代码分别维护两套 builder
- 不要把 warning 当作“以后再处理”的无害噪声
- 不要在本轮顺手推进 unrelated 架构改动

## 12. Verification

### Preferred

- `pnpm nx run task:test`
- `pnpm nx run schedule:test`
- `pnpm nx run api:test:smoke`

### Known local fallback when `pnpm` hits `ERR_PNPM_IGNORED_BUILDS`

- `.\node_modules\.bin\nx.cmd run task:test`
- `.\node_modules\.bin\nx.cmd run schedule:test`
- `.\node_modules\.bin\nx.cmd run api:test:smoke`

### Additional success condition

修复后需要人工确认相关命令输出中不再出现 branded ID warning。

## 13. Exit Criteria

- 核心 smoke/mapper/runtime tests 无 ID warning
- happy-path fixture 全部使用合法 branded ID
- invalid ID 只存在于显式错误场景测试
- 生产代码与测试代码共用同一套 ID contract

## 14. Handoff

`R09` 可以在更干净的测试基座上补宿主启动链和 runtime 直达测试。

## 15. Status Note

- Date: 2026-07-03
- Status: done
- What changed: 在 `@memoflow/test-utils/fixtures` 新增共享合法 ID builder（`aUuid`、`aPrefixedUuid`）；task smoke app、task/schedule/goal 的高噪声 Prisma mapper specs 已切到合法 branded ID fixture；API automation executor 测试 mock 也已对齐新的 plain function port。
- Old path deleted: 本轮触碰到的 task/schedule/goal happy-path 非法 ID 常量与 ad hoc fixture 字面量；`IdentityId_smoke-user-0001` 等不合法 smoke fixture 已移除。
- Verification: `.\node_modules\.bin\nx.cmd run task:test`、`schedule:test`、`goal:test`、`api:test:smoke` 通过；相关输出中未再出现本轮目标范围内的 branded ID warning。
- Remaining follow-up: 已由 `R09` 一并收口；desktop auth `SessionManager` 与 remembered-account 相关 fixture 已切到合法 branded ID，`desktop:test` 与 `desktop:test:main` 均已通过。
