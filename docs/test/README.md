# 测试文档

`docs/test` 只保留薄文档，回答下面几件事：

- 仓库里有哪些测试类型
- 每类测试从哪个 Nx target 进入
- 什么时候应该跑哪一类测试
- 相关配置、setup、helper 在哪里
- 文档和代码注释各自负责什么

详细实现、历史背景、alias 细节、fixture 设计理由，优先写回配置文件和测试辅助代码注释，不再在这里重复展开。

默认开发路径是 TDD：先写失败的快测试，再补实现；只有改动跨越数据库、HTTP 装配、IPC 或真实浏览器流程边界时，才升级到更慢的测试层。

## 测试类型总览

| 类型                 | 主要位置                                                              | 常用入口                                                                                                                         |
| -------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 快测试（TDD 默认）   | 与源码同目录的 `*.test.ts` / `*.spec.ts`，或 `__tests__/` 子目录      | `pnpm nx run <project>:test`、`pnpm nx run <project>:test:watch`                                                                 |
| 覆盖率门禁           | 领域包与 `domain-shared` 的快测试集合                                 | `pnpm nx run <project>:test:coverage`、`pnpm test:coverage:domain`、`pnpm test:coverage:affected`                                |
| 集成测试             | `packages/{task,goal,schedule,reminder}/src/**/*.integration.test.ts` | `pnpm test:integration`、`pnpm nx run <project>:test:integration`                                                                |
| API 冒烟测试         | `apps/api/src/__tests__/smoke/**`                                     | `pnpm nx run api:test:smoke`                                                                                                     |
| Web 契约测试         | `apps/web/src/mocks/handlers/*.spec.ts`                               | `pnpm nx run web:test`                                                                                                           |
| Web E2E              | `apps/web/e2e/**`（默认入口仅核心 flow oracle）                       | `pnpm nx run web:e2e`                                                                                                            |
| Web 同步回归 E2E     | `apps/web/e2e/sync/**`                                                | `pnpm nx run web:e2e:sync`                                                                                                       |
| Desktop 论文截图 E2E | `apps/web/e2e/desktop-screenshots/**`                                 | `pnpm nx run web:e2e:desktop-screenshots`                                                                                        |
| Desktop 专项测试     | `apps/desktop`、`apps/desktop/src/main/**`                            | `pnpm nx run desktop:test`、`pnpm nx run desktop:test:ipc`、`pnpm nx run desktop:test:main`、`pnpm nx run desktop:test:boundary` |
| 性能 / Budget        | `packages/task/**/**/*.bench.ts`                                      | `pnpm nx run task:test:perf`                                                                                                     |

## 文档索引

- [test-system-v2.md](./test-system-v2.md)：当前测试系统的唯一归属、Nx 契约、CI Oracle 与验收预算
- [architecture.md](./architecture.md)：测试分层、职责边界、何时补哪类测试
- [running-tests.md](./running-tests.md)：日常开发、回归排查、CI 对应命令
- [configuration.md](./configuration.md)：测试配置、setup、helper 的入口位置
- [contract-tests.md](./contract-tests.md)：Web mock handler 契约测试约定
- [ci-validation.md](./ci-validation.md)：PR 测试拓扑、required checks、本地 clean-source 入口与性能快照

## 覆盖率策略

覆盖率是**测量手段，不是门禁**（2026-10-25 起取代旧的 80/70/90 固定百分比目标）：

- PR/Main CI 不做覆盖率仪表化，也不存在因百分比导致的失败。
- `nightly-audit.yml` 每日独立运行全量 `test:coverage`，上传报告；百分比只用于观察趋势，不因数值失败。
- 质量仍由测试行为断言与 CI 各 lane 的 fail-closed 保证；不允许以删除真实测试来交换覆盖率数字。

详见 [ADR-013: Standard Testing Strategy](../architecture/adr/ADR-013-standard-testing-strategy.md)。

## 测试目录约定

新代码优先使用与源码同目录的 `*.test.ts` / `*.spec.ts`。已有的 `__tests__/` 子目录继续保留，不要求迁移。两种方式都仍受 `@nx/enforce-module-boundaries` 约束：豁免仅限根配置 `moduleBoundaryOptions.allow` 中的 `@memoflow/test-utils`，测试不能以相对路径导入其他 Nx 项目根之外的文件。

## 使用原则

- 运行测试时统一优先走 `pnpm nx ...`，不要把底层 `vitest` / `playwright` 命令写成主文档入口。
- `test` 只承担快反馈测试；真实数据库、HTTP 装配、IPC、浏览器流程都应进入专门 target。
- `test:coverage` 只承担 Nightly Audit 的覆盖率测量，不作为默认本地循环命令。
- 文档不再硬编码测试数量、文件数量、历史统计。
- 具体实现理由应写在对应配置文件、setup 文件、fixture、helper 注释中。
- 如果文档与代码冲突，以当前 `project.json`、测试配置文件和测试目录为准。
