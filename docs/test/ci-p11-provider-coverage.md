# P1.1 CI 测试归属与 Provider 覆盖

实施决议以 [Issue #628](https://github.com/BakerSean168/memoflow/issues/628) 顶部
2026-10-26 P1.1 为准。本文说明当前配置中的执行归属；运行耗时、SHA 和验收结果写在 Issue/PR。

## PR/Main 执行归属

Lint 全量且与 Changes 并行。Changes 使用 Nx task inputs 选择实际任务；Main 选择完整常规验证。
单个 Build + Typecheck Job 将精确的 project:target 合入一个 Nx 23.3 task graph，由一个
scheduler 并行执行，并保留 `^build`、Prisma 生成依赖和唯一构建节点。不会将项目集合与
目标集合做笛卡尔积，也不会启动两个争用相同输出的 Nx scheduler。每个 primary task 的
receipt 同时记录实际调度命令及自身 Nx 结果；失败、跳过或结果缺失均不能通过 Check。
`ci-build-artifacts`、Main source identity 和 artifact digest 契约继续保留。

| 家族                    | 已有 Nx Project / suite                                               | 资源                                        |
| ----------------------- | --------------------------------------------------------------------- | ------------------------------------------- |
| Test                    | Desktop Unit、混合业务 ai/task/goal 等、跨端共享包                    | Node，保留现有三路分片权重                  |
| Test Web Unit           | app-vue:test 的互斥 1/2、2/2；web:test                                | Node/happy-dom，无 Postgres/后端 build 依赖 |
| Test Web Browser/Visual | ui-storybook:test:interaction；Web/Renderer Visual                    | Chromium，Visual 保留当前 PR 代表集         |
| Test Server Unit        | api:test、database:test、migrator:test（仅选择存在且受影响的 target） | Node，无 Postgres服务                       |
| Test Server 集成        | API/DB/HTTP、Desktop IPC/Main boundary                                | 原三分片，每个 runner 一次 Postgres 准备    |
| Test Contracts          | contracts:test:contract                                               | 唯一 primary，不重复执行 contracts:test     |

业务包中的 client/server/electron 仍是混合 Nx Project，本轮不猜测目录语义、不拆业务项目，
不修改 Oracle2 consumer switch 或 Host Runtime 的生产源码。通用 Test 的权重调优另行评估。
`ci-dispatch-v2` 明确记录当前归属并由 Check 重算，旧 dispatch 版本不能充当新运行证据。

## Provider Playwright 行为映射

完整跨 UI/进程旅程仍保留在 Nightly Audit 的
[provider-onboarding.spec.ts](../../apps/web/e2e/ai/provider-onboarding.spec.ts)，包括外部 OpenRouter
opt-in 用例。日常 PR/Main 不执行 `web:e2e:ai-provider`，也没有它专属的 backend build/artifact Job。
以下较低层验证继续留在必需任务中，覆盖核心行为，不能用仅检查文件名存在替代行为断言。

| 原旅程行为                                                                         | 日常必需覆盖                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 无凭据创建 Agent、向导校验、默认实例、单一 Switch                                  | [AISettings.spec.ts](../../packages/app-vue/src/modules/setting/components/AISettings.spec.ts)                                                                                                                                                                                                        |
| Endpoint/Key 验证、替换、清空输入、保存后重试绑定                                  | 同一 AISettings suite；[onboarding 用例](../../packages/ai/src/server/application/use-cases/commands/commit-ai-provider-onboarding.use-case.spec.ts)、[replacement 用例](../../packages/ai/src/server/application/use-cases/commands/commit-ai-provider-replacement.use-case.spec.ts)                 |
| HTTP probe 到 commit、显式模型、一次性句柄、Owner、密钥不泄露                      | 新增 [Provider HTTP/Postgres suite](../../packages/ai/src/api/routes/provider-onboarding.http.integration.spec.ts)：真实 route/controller/use-case/Prisma；只替代外部 Provider catalog，probe 不创建 Provider，commit 消耗句柄                                                                        |
| 已有 Provider 替换、旧 Key 撤销、无重复 Provider、刷新使用新 Key、重建仓储后持久化 | 同一新增 HTTP/Postgres suite；外部 catalog 返回固定模型，验证收到的是替换 Key；数据库/HTTP 不做 mock                                                                                                                                                                                                  |
| Owner/Revision CAS、不同 Agent 共用会话、重启后选择、删除保护                      | [API Prisma registry 集成](../../apps/api/src/__tests__/integration/agent-instance-registry.integration.test.ts) 与 [registry suite](../../packages/ai/src/server/application/agent-instance/agent-instance.registry.spec.ts)                                                                         |
| SSE HTTP 鉴权、拒绝伪造 Owner/Desktop 命令、传递选定 Agent/Model、帧顺序、错误脱敏 | 新增 [Assistant SSE HTTP suite](../../packages/ai/src/api/routes/assistant-sse.http.spec.ts)，以受控 runtime port 测传输边界；不声称它验证模型推理                                                                                                                                                    |
| 实际 runtime 的双模型/实例、同一线程上下文、失败后恢复                             | [Mastra runtime suite](../../packages/ai/src/server/mastra/runtime/mastra-workflow.runtime.spec.ts)；[Postgres history](../../packages/ai/src/server/mastra/runtime/assistant-history.postgres.integration.spec.ts) 验证跨重启顺序与终态                                                              |
| 同挂载 Composer、模型选择/禁用/收藏/草稿、可读失败反馈                             | [AIComposerControls](../../packages/app-vue/src/modules/ai/components/AIComposerControls.spec.ts)、[useAIChatSession](../../packages/app-vue/src/modules/ai/composables/useAIChatSession.spec.ts)、[useAssistantStream](../../packages/app-vue/src/modules/ai/composables/useAssistantStream.spec.ts) |
| 响应式/主题/布局与完整跨进程旅程                                                   | PR Visual/Storybook 保留；完整 Provider 浏览器旅程保留 Nightly，不宣称所有浏览器几何断言均可由 Unit 替代                                                                                                                                                                                              |

Nightly Audit 独立配置 Postgres/schema、Chromium、完整 Web lane manifest/input。
[build-api.ts](../../apps/web/e2e/helpers/build-api.ts) 在没有 `E2E_PREBUILT_ARTIFACT=1` 的情况下
实际调用 `nx run api:build`；契约测试以独立工作目录执行该 helper，验证其自建分支。
Nightly 上传 audit/provider 两份报告；本轮不触发真实 Nightly Release、Stable 或 Production，
也不更改旧 Main CD 入口。P2–P4 仍待完成。
