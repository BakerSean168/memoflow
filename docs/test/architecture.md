# 测试分层与职责边界

这个仓库不再用“单一模块的三层模型”描述全部测试，而是按职责划分不同层次。原则很简单：先用最便宜的测试证明问题，只有跨数据库、跨协议、跨进程或真实用户流程时才升级测试层级。

默认顺序是：

1. 写失败的 `test`
2. 最小实现让 `test` 通过
3. 在领域包需要质量门禁时，跑 `test:coverage`
4. 只有边界发生变化时，再补 `test:smoke`、`test:integration`、`test:ipc`、`test:main` 或 `e2e`

## 当前测试层次

| 类型             | 主要验证内容                                             | 典型位置                                                                                         | 何时使用                                    |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| 快测试           | 业务规则、状态流转、映射、纯函数、组件局部行为、契约测试 | `packages/*/src/**`、`apps/*/src/**`                                                             | 默认首选，也是 TDD 主路径                   |
| 领域覆盖率门禁   | 领域包与 `domain-shared` 的快测试覆盖率与结构完整性      | 受治理的 `layer:domain` 包与 `packages/domain-shared` 的 aggregate / service / value object 子树 | 提交前质量门禁、CI 覆盖率校验               |
| 集成测试         | 数据库访问、Prisma 映射、事务、持久化边界                | `packages/task/src/**/*.integration.test.ts`                                                     | 触及真实数据库或仓储实现时                  |
| API 冒烟测试     | 路由、middleware、序列化、HTTP 状态码、控制器装配        | `apps/api/src/__tests__/smoke/**`                                                                | 需要验证 HTTP 闭环但不想上完整 E2E 时       |
| Web 契约测试     | adapter、mock handler、contracts schema 是否一致         | `apps/web/src/mocks/handlers/*.spec.ts`                                                          | 新增接口或修改请求/响应 shape 时            |
| Web E2E          | 浏览器中的真实用户流程                                   | `apps/web/e2e/**`                                                                                | 页面交互、跨模块流程、关键回归              |
| Web 同步回归 E2E | Web 与 API/desktop 相关同步链路                          | `apps/web/e2e/sync/**`                                                                           | 同步、回写、跨端回归                        |
| Desktop 专项测试 | Electron renderer、IPC、main 进程行为                    | `apps/desktop/**`、`apps/desktop/src/main/**`                                                    | 触及 preload、IPC、main/database 相关逻辑时 |
| 性能 / Bench     | 明确的性能假设或退化风险                                 | `packages/task/**/**/*.bench.ts`                                                                 | 排查性能回归或验证优化收益时                |

## 选择规则

- 纯业务逻辑、数据变换、组件局部行为，优先补快测试。
- 领域包在补完快测试后，还要满足 `test:coverage` 的 coverage threshold 与 aggregate / service / value object 结构门禁。
- `test:coverage` 的 coverage 作用域只包含受治理子树：默认检查 `src/domain-server/aggregates/**`、`src/domain-server/services/**`、`src/domain-server/value-objects/**`、`src/domain-shared/value-objects/**`；`packages/domain-shared` 额外检查 `src/shared/**`。
- 触及 Prisma、SQL、事务、数据库清理策略时，补集成测试。
- 触及路由、请求校验、HTTP 状态码或控制器装配时，补 API 冒烟测试。
- 触及 Web adapter、mock handler 或 contracts schema 时，补契约测试。
- 触及真实浏览器流程、跨页面状态或关键用户路径时，补 Web E2E。
- 触及同步链路、跨端写入回读或 desktop-web 联动时，补 `e2e:sync`。
- 触及 Electron main/IPC 边界时，优先看 `desktop:test:ipc` 和 `desktop:test:main`。
- 只有在性能本身是需求或风险点时，才补 bench；它不是默认回归入口。
- `pnpm nx affected -t test` 只应承担快测试；慢测试通过专门 target 按边界补跑。
- `pnpm nx affected -t test:coverage` 只承担领域覆盖率门禁，不替代默认 TDD 回路。

## 文档与代码的边界

- 本页只描述“测什么”和“何时补”。
- 配置为什么这样写，去看对应 `vitest.config.ts`、`playwright.config.ts`、global setup、fixture 和 helper 注释。
- 如果某一类测试的职责变化，应先改配置和测试目录，再回头同步本页，不要在文档里单独维护一套架构描述。
