---
tags:
  - plan
  - archive
  - testing
  - nx
description: 从旧计划目录迁移的 TDD 测试系统 rollout 计划
created: 2026-04-26T00:00:00
updated: 2026-04-26T00:00:00
status: archived
source: legacy-plan-workspace/tdd-test-system-rollout.md
---

# TDD Test System Rollout

## Archive Note

这份计划从旧的辅助计划目录迁移而来。该 rollout 在原计划中已标记为完成，保留在归档目录中作为测试治理历史记录。

## Goal

Build a fast-feedback, Nx-first testing system for the monorepo so day-to-day work follows a clear TDD path:

1. Write a failing fast test.
2. Make the smallest change to pass it.
3. Escalate only when the changed boundary requires slower suites.

## Core Constraints

- All test entry points go through `pnpm nx ...`.
- `test` / `test:watch` stay fast and must not require real DB, browser, or cross-process setup.
- Vitest owns unit, integration, smoke, contract, IPC, main-process, and bench suites.
- Playwright owns browser E2E and sync-regression flows.
- CI gates fast suites with `affected`, then selectively runs slow suites by change boundary.

## Completion Summary

1. API fast feedback restored via app-local `vitest.config.ts`
2. Root Vitest config thinned into registry/shared infra shape
3. Shared test harness consolidated into `@memoflow/test-utils`
4. Nx-native automation added for test target normalization

## Final Ownership Model

| Boundary changed                                                        | Primary target                            | Owner project           |
| ----------------------------------------------------------------------- | ----------------------------------------- | ----------------------- |
| Domain logic, mapping, local component behavior, contract checks        | `<project>:test` / `<project>:test:watch` | current changed project |
| Real DB / Prisma / transaction boundary                                 | `task:test:integration`                   | `task`                  |
| HTTP route wiring / middleware / serialization / controller composition | `api:test:smoke`                          | `api`                   |
| Electron preload / IPC handlers                                         | `desktop:test:ipc`                        | `desktop`               |
| Electron main-process logic                                             | `desktop:test:main`                       | `desktop`               |
| Browser end-user critical flows                                         | `web:e2e`                                 | `web`                   |
| Cross-end sync regression                                               | `web:e2e:sync`                            | `web`                   |
| Explicit perf verification                                              | `task:test:bench`                         | `task`                  |

## Status Snapshot

- Phase 1 baseline alignment: done
- Phase 2 core target normalization: done
- Phase 3 Vitest config consolidation: done
- Phase 4 test utilities consolidation: done
- Phase 5 CI restructure: done
- Phase 6 governance and automation: done

## Validation Notes

- `pnpm test:targets:check` passed after the automation changes.
- Earlier rollout verification included `pnpm nx run api:test` and `pnpm nx run app-vue:test`.
- Some final Nx re-runs were blocked by sandbox/plugin worker environment limits during the original execution context, not by a known implementation regression.
