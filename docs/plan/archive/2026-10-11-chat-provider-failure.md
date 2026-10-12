---
tags: [plan, ai, chat]
description: 模型切换后推理失败的诊断与安全错误提示
created: 2026-10-11T00:00:00Z
updated: 2026-10-11T00:00:00Z
---

# Chat Provider Failure

目标：核对 Dev 执行记录，区分选择/运行时错误与上游推理失败；用稳定错误码呈现本地化提示，保留安全诊断证据。

步骤：先查日志与执行记录；用真实流式事件和公共错误边界回归测试复现提示缺失；补齐明确上游状态的分类及安全诊断；验证最近测试、类型和 lint。

证据：切换后的 gemini-3-flash-preview 已启动，在 provider_inference 阶段失败；同一会话随后 gemini-2.5-flash 和 flash-lite 成功。历史记录仅保留 AI_RUNTIME_TRANSPORT_ERROR，没有原始上游状态，不能宣称具体供应商根因已确定。

边界：不主动消耗真实模型额度、不读取/记录提示词和凭据、不自动重试或新建会话；不把未知错误假定为模型不存在。

## 完成与验证

- 确认展示根因：assistant.run.failed 的前端事件处理直接复制英文 message，绕过本地化错误码映射。已统一使用 getAIErrorMessage，补齐运行时、模型不可用、Provider 访问拒绝和能力配置错误的中英文提示。
- 公共边界保留领域错误码优先级，识别明确的上游 401/403、404、429、408/504、5xx，以及 TimeoutError/ETIMEDOUT。SDK cause/lastError 最多检查五层并防止循环；未知 400 不推断为模型不存在。
- AssistantTurnSession 在 native error 事件及发送异常边界记录安全诊断：请求/会话/实例/模型编号、公共错误码、状态码和超时标记。绝不复制错误正文、响应体、请求体、headers、URL 或堆栈。执行记录继续使用稳定分类。
- Dev 中失败请求的模型是 gemini-3-flash-preview；运行时启动成功，在 provider_inference 阶段失败（441ms），之后同一会话 gemini-2.5-flash 和 gemini-2.5-flash-lite 成功。只能确认选择已生效且推理失败；当时未保存上游状态，不能追溯具体供应商故障或排除历史工具上下文兼容性。
- 96 项相关测试通过：34 项 UI/错误本地化、40 项真实 Mastra 运行时、22 项公共错误边界/流式客户端。真实 controller 的 503 流式错误被安全分类，模型切换后失败仍释放会话；前端失败后的下一轮复用同一个 conversationId。
- 隔离 PostgreSQL、真实 API/Web、Chromium 和本地 HTTPS 模型 fixture 的浏览器用例通过。真实两轮跨实例/模型回复保持同一会话；注入第三轮失败后显示中文，保留已有回复并能继续选择模型。测试数据库已删除，未调用商业模型。
- ai/app-vue 类型检查、修改文件 ESLint、Prettier、git diff --check、治理检查通过。Dev API 已重新加载并通过 healthz。

界面证据：[中文失败提示](../../analysis/evidence/2026-10-11-chat-provider-failure/localized-provider-failure.png)。T3 preview 因 AppArmor 明确不可用，界面验收使用仓库已有 Playwright 流程。

当前 main 工作树未提交；没有创建 PR、推送或发布。本轮没有修复尚未获得具体证据的上游模型故障。
