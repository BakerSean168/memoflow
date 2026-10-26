# 契约测试

`apps/web/src/mocks/handlers/*.spec.ts` 用来覆盖 Web adapter、mock handler 和 contracts schema 之间的最小契约闭环。这些用例随 `pnpm nx run web:test` 一起执行，没有单独 target。

## 当前约定

- 先断言 adapter 实际发出的 `URL`、`method`、`query/body` 字段名。
- 再用 contracts 导出的 schema 做 smoke parse，确保关键请求和响应 shape 没漂移。
- 对关键边界额外补 route 或 OpenAPI registry smoke test，直接检查已注册路径和 request schema。
- 共享工具统一放在 [`apps/web/src/mocks/handlers/_shared/contract-test-helpers.ts`](../../../apps/web/src/mocks/handlers/_shared/contract-test-helpers.ts)，避免每个模块重复手写 http spy 和 schema 断言。

## 何时补

- 新增 adapter 或 mock handler
- 修改请求路径、查询参数、请求体字段名
- 调整 contracts schema 或响应 shape
- 需要防止前端 mock 与正式接口注册结果漂移

## 断言优先级

新增接口时至少覆盖下面三类中的两类，关键链路建议三类都补：

- adapter 请求路径和参数拼装正确
- mock handler 路由前缀与正式接口一致
- contracts schema 能接受 adapter 发出的请求，并能解析 mock 或 fixture 响应
- route 注册结果包含预期路径，且 request schema 能拒绝旧字段名或错误 shape
