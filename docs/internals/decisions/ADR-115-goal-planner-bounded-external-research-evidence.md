---
tags: [adr, ai, goal, research, web-search, evidence, provenance]
description: Goal Planner 以 bounded two-pass research 接入公开 Web 证据，Research Port 与 owner truth 分离
created: 2026-10-05T12:20:00+08:00
updated: 2026-10-05T12:20:00+08:00
---

# ADR-115: Goal Planner Bounded External Research Evidence

**状态：** 已采纳并实施（AIC-5001）
**日期：** 2026-10-05
**关联：** ADR-050、ADR-052、ADR-098、ADR-099、ADR-112

## Context

Goal 创建已经由 Mastra durable workflow + owner-native Goal surface 承担。剩余缺口是：当目标依赖当前公开事实时，例如升学/考试/申请/证书的资格、官方时间节点、规则与权威资料，Planner 只有用户输入与个人 Knowledge，容易把过时常识当成当前事实。

主流 AI 产品已经把 Web Search / Research 作为基础能力，但“模型能搜索”不能替代产品级 evidence contract：

- provider-native search 的协议、返回引用与可用模型并不一致；
- MemoFlow 支持 OpenAI-compatible / router / custom ProviderConnection，不能假设 provider-defined tool 一定透传；
- external Web 内容是 untrusted data，不能获得 workflow instruction 或 owner authority；
- Goal/Task owner 仍必须是最终业务真相，Research 不应创建第二套 Goal editor 或第二套任务系统。

本仓库当前 `@mastra/core` 已提供 `webSearchTool`，但 MemoFlow 的 BYOK model transport 使用 `@ai-sdk/openai-compatible`；该 transport 会丢弃 provider-defined tools。因此把 `webSearchTool` 直接挂到 Goal Planner 会使搜索能力依赖 transport 细节，并可能让不支持 tool calling 的模型破坏原本可工作的 Goal path。

## Product pattern evidence

本决策参考了当前生产力/Agent 产品的共同业务模式，而不是把“能联网”本身当成产品能力：

- **Notion Research Mode**：Research 先选择 Workspace / connected apps / Web 等 source scope，研究结果保留 sources，并允许把整理后的结果写回 workspace。可复用的核心不是“浏览器”，而是 **bounded source selection -> evidence -> workspace artifact**。
- **Motion AI Project Manager**：AI 把目标/文档转换为 stage、task、duration、deadline 等结构化工作，最终仍进入同一套 canonical project/task/scheduling engine；AI 不维护第二套任务真相。
- **Reclaim**：自动规划围绕 canonical priority、due date、availability 与 calendar context 持续重排；Research/AI 只帮助形成更好的输入，真正的执行和重排由调度 owner 负责。
- **OpenAI / Gemini / OpenRouter hosted search**：搜索已成为 provider/server-hosted primitive，但调用协议、引用返回和计费边界不同。因此产品层仍需要自己的 evidence contract，而不能把 provider tool result 直接当成业务对象。

对 MemoFlow 的直接推论是：**Web Research 应提供可追踪证据，Goal/Task/Schedule owner 继续负责业务事实与执行。** 因此 AIC-5001 不创建 Browser Agent，也不让搜索结果直接创建/修改 Goal。

## Decision

### 1. Research 是 MemoFlow capability，不是 Goal owner，也不是通用 browser Agent

引入只读 `IAIWebResearchPort`：

```text
Goal Planner
    ↓ needs_research (0..3 focused requests)
MemoFlow Web Research Port
    ↓ provider-hosted search
bounded external evidence + citations
    ↓
Goal Planner final decision
    ↓
Durable Goal workflow
    ↓
Owner-native Goal review
```

Research 只能补证据，不能拥有 Goal/Task/Knowledge mutation。

### 2. Goal Planner 使用 bounded two-pass planning，而不是 function-tool dependency

普通目标一次模型调用即可完成。

只有当第一次 structured planning 判断“当前公开事实会实质影响规划”时，才允许返回：

```text
needs_research
  - requirements
  - timeline
  - resources
```

每轮最多 3 个 focused query。Research 完成后，同一个 Planner 以 canonical context 中的 external evidence 进行第二次、也是最后一次 planning。第二次不允许再次请求 Research。

这样不要求 Goal planning model 具备 tool-calling capability，也不会让 Web Search 成为 Goal 创建的新前置条件。

### 3. Research intents 固定为三个业务意图

- `requirements`：资格、官方要求、规则、考试/申请条件；
- `timeline`：报名、考试、申请、截止日期等时效节点；
- `resources`：官方大纲、项目/专业说明、权威指南与准备资料。

通用自我提升、生产力建议、日常习惯等不应触发搜索。

### 4. Research availability 由产品策略与 Provider capability 双重决定

Goal Research 的允许范围是显式产品策略，而不是通过“是否注入了 Research Port”隐式表达：

```text
GoalResearchPolicy
  enabled = true
  scope   = requirements | timeline | resources
  maxRequestsPerPlan  = 3
  maxSourcesPerRequest = 6
```

当前产品策略默认开启以上三个受限意图，不为每次 Goal 创建增加联网确认弹窗。未来若产品需要关闭或缩小 Research 范围，应修改产品策略，而不是移除 composition root 中的 port。

技术能力由 `IAIWebResearchPort.supports(...)` 独立判定。只有产品策略允许且当前实际 ProviderConnection 拥有明确 hosted-search contract 时，Planner 第一轮 schema 才暴露 `needs_research`。因此不支持搜索的 Provider 保持原本 one-pass planning，不会先请求 Research 再降级。若用户明确要求核验当前或官方公开事实，且 canonical external evidence 缺失或不足，则支持搜索的 Planner 必须先返回 `needs_research`，不能用模型记忆替代这次核验。

当前支持的 hosted-search contract：

- OpenRouter：`openrouter:web_search` server tool；
- OpenAI：Responses API `web_search`；
- Gemini：Interactions API `google_search`。

DeepSeek/custom OpenAI-compatible/LiteLLM 等没有明确 hosted-search contract 的连接 fail closed，不猜测私有扩展，也不静默切换到另一条付费 ProviderConnection。

后续新增搜索厂商或 provider-native adapter 时，只扩展 `IAIWebResearchPort` capability/adapter contract，Goal workflow 不改变。

### 5. Goal Plan structured output 以应用侧 canonical schema 为最终边界

GoalPlanDraft 的 canonical Zod contract 包含 transform、custom refinement 和多层 union。真实 Gemini 2.5 smoke 证明，将完整 contract 直接下发为 provider-native `response_format/json_schema` 会因 schema state complexity 被拒绝；同时部分 Zod custom/transform 在通用 JSON Schema 投影中会退化，不能把 provider-native schema 当成 owner contract。

因此 Goal Planner 使用：

```text
compact provider wire instructions
        ↓
prompt-injected JSON generation
        ↓
lossless wire canonicalization
        ↓
canonical Zod validation
        ↓
最多一次 typed repair
        ↓
canonical Zod validation
```

canonicalization 只能处理**无语义歧义**的 wire-shape 差异。目前唯一允许的是将模型偶发生成的 GoalTimeframe-style day wrapper：

```json
{ "kind": "day", "date": "2026-10-20" }
```

在 Task `schedule.date/startDate/Until.end.date` 位置解包为 canonical YMD：

```json
"2026-10-20"
```

它不会推断日期、重写计划、修复业务值，也不会放松最终 Zod gate。其它 contract 偏差最多触发一次重新生成；第二次仍不合法则失败，避免无限 repair loop。

compact instructions 还避免每轮把大型 JSON Schema 完整注入 prompt，降低 token/latency，同时保持 Provider 与 MemoFlow owner contract 解耦。

### 6. External evidence 有独立 trust/provenance，永不升级为 owner truth

Canonical research evidence 必须满足：

```text
trust      = external_untrusted
provenance = external
```

优先级规则：

```text
workflow/system invariant
> owner-domain facts
> explicit user input
> retrieved personal Knowledge / external Web evidence
```

Web 页面中的文本永远是 data，不是 instruction。它不能修改 tool availability、approval、identity、owner authority 或覆盖用户明确输入。

### 7. Evidence 有硬预算

- 每个 planner invocation：最多 3 个 research request；独立 request 并发执行，避免把三个 20 秒 provider timeout 串成约 60 秒 wall-clock；
- 每个 request：最多 6 个 sources；OpenRouter 同时设置 `max_results` / `max_total_results` 到该 source budget；
- 单个 summary：最多 6000 chars；
- durable workflow：最多保留 8 组 research evidence；
- external context section：单组 768-token budget，并受全局 AI context budget 继续裁剪；
- provider request：20 秒 timeout。

### 8. Research failure 不阻塞 Goal workflow

`429`、provider unavailable、unsupported、无引用、网络错误等都投影为 bounded unavailable reason。Planner 随后必须继续使用用户/owner facts 生成安全草稿，并在影响实质规划时写 warning。

Research 失败不得把 Goal workflow 挂起为 recovery，也不得要求用户处理隐藏 approval。

### 9. Research evidence 属于 workflow durable state，不属于 Goal aggregate

成功 evidence 会进入 Goal workflow state，并在 clarification/revise/restart 后继续可用。它可以随 suspension 投影到 supporting context UI 展示来源，但不会写进 Goal/KR owner fields。

如果 Planner 提议创建一篇 Knowledge note，并实际使用了外部研究，允许把明确引用过的 URL 写入该 note 的 `sourceRefs`；不得持久化 raw provider/tool payload。

### 10. 用户必须能看到来源

Goal supporting context 显示：

- research intent；
- query；
- bounded summary；
- 可点击 source title / URL；
- “external evidence 不覆盖用户输入/Goal facts”的明确提示。

该 surface 是 evidence/detail view，不是第二套 Goal editor。

## Consequences

### Positive

- 当前事实可以进入 Goal 规划，同时维持 owner truth；
- 普通 Goal 不承担搜索延迟/成本；
- 不依赖模型 tool-calling 能力；
- Router/provider 差异被隔离在一个 read port；
- 搜索失败不会破坏原有 Goal 创建；
- citations 可以跨 durable workflow restart 保留并被用户审查。

### Cost

- 需要维护少量 provider-specific hosted-search adapter；
- 需要第二次模型调用的 research-sensitive Goal 会增加延迟与 token；
- custom provider 若无显式 search contract 只能降级，而不是猜测其扩展能力。

## Explicitly forbidden

- 为 AIC-5001 新建通用浏览器 Agent 或 DOM automation；
- 把 external Web data 标为 owner/domain truth；
- 因搜索不可用而阻塞 Goal 创建；
- 为搜索偷偷切换到用户另一条可能计费的 ProviderConnection；
- 将 raw Web/tool/provider payload 持久化到 Goal aggregate 或 telemetry；
- 让 external evidence 覆盖用户明确提供的院校、日期、约束等事实。

## Acceptance

- generic Goal path 不触发 Research；
- Research permission 由显式 Goal Research product policy 表达，不能用 port presence 代替；
- unsupported provider 不暴露 `needs_research` schema，并保持 one-pass planning；
- Goal Plan provider wire 使用 compact instructions，最终仍由 canonical Zod contract 验收；
- wire canonicalization 只允许无损 Task YMD day-wrapper 解包，不推断业务值；
- structured-output validation 最多触发一次 typed repair，第二次失败即终止；
- research-sensitive path 最多 3 个 request，并在同一 planner invocation 内最多一次 research phase；
- OpenRouter/OpenAI/Gemini adapter 返回 bounded citations；
- 429/unsupported/network failure 后仍能返回最终 Goal planning decision；
- research evidence 跨 clarification/restart 保留；
- owner draft 不包含 `researchEvidence`；
- source URL 只接受无 embedded credentials 的 HTTP(S)；
- Web/API/Desktop composition 使用同一 `IAIWebResearchPort` contract。
