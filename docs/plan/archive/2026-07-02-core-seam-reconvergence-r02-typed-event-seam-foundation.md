---
tags:
  - plan
  - archive
  - architecture
  - refactor
  - rounds
  - r02
description: R02 执行文档，建立 typed publisher/subscriber seam，并先在 task runtime 与删除实例 use-case 落地
created: 2026-07-02T00:00:00+08:00
updated: 2026-07-02T20:45:00+08:00
---

# R02 Typed Event Seam Foundation

## 1. Objective

把事件总线访问从 `string + unknown + cast` 收敛成真正的 typed seam：

- `Publisher<EventMap>`
- `Subscriber<EventMap>`
- 全局 `eventBus` 退回 infrastructure adapter

## 2. Why This Round Exists

后续要抽离 runtime ownership 和引入 orchestration，就必须先让事件访问成为可组合、可测试、可验证的稳定 seam。

## 3. Entry Conditions

- `R01` 已完成
- 只需要触碰 shared utils 与 task 中最具代表性的两类场景
- 不追求一轮切完全仓所有 event bus cast

## 4. In Scope

- `packages/utils/src/domain`
- `packages/task/src/api/runtime.ts`
- `packages/task/src/application-server/use-cases/commands/delete-task-instance.use-case.ts`
- 对应 tests

## 5. Out Of Scope

- schedule projection ownership 迁移
- controller seam 统一
- strict ID contract

## 6. Must Delete In This Round

- 被本轮触碰文件中的 `eventBus as unknown as ...`
- 任何新引入的 cast helper

## 7. Suggested Execution Slices

1. 定义 typed publisher/subscriber contract 与工厂
2. 为 shared seam 补契约级 tests
3. 先在 task runtime 上切一个真实订阅场景
4. 再在删除实例 use-case 上切一个真实发送场景
5. 删除旧 cast，确保新 seam 成为唯一入口

## 8. Suggested Commit Slices

1. shared typed event port
2. runtime 订阅侧切换
3. use-case 发送侧切换
4. tests 与导出收尾

## 9. Verification

- Preferred:
  - `pnpm nx run task:typecheck`
  - `pnpm nx run task:test`
- Known local fallback:
  - `.\node_modules\.bin\nx.cmd run task:typecheck`
  - `.\node_modules\.bin\nx.cmd run task:test`

## 10. Exit Criteria

- task runtime 不再 cast event bus
- 至少一个写路径 use-case 不再 cast event bus
- 没有新增“统一 cast helper”之类的假抽象

## 11. Handoff

`R03` 可以直接复用 typed subscriber，把 task 的 schedule projection runtime owner 从 feature 包内抽出来。

## 12. Status Note

- Date: 2026-07-02
- Status: done
- What changed: 在 `packages/utils` 新增 `typed-event-port.ts`；`packages/task/src/api/runtime.ts` 改为 typed subscriber；`delete-task-instance.use-case.ts` 改为 typed publisher；补了 `runtime.spec.ts` 和删除实例 use-case 的事件发布测试。
- Old path deleted: 上述 task 运行时和 use-case 中原有的 `eventBus as unknown as ...` 路径。
- Verification: `.\node_modules\.bin\nx.cmd run task:typecheck` 通过；`.\node_modules\.bin\nx.cmd run task:test` 通过。
- Remaining follow-up: 进入 `R03`，继续把 schedule projection 里的系统级 ownership 从 task 包中挪出去。
