---
tags:
  - adr
  - ai
  - provider
  - secret
  - model
  - capability
  - security
  - vnext
description: ADR-097 - AI Provider Definition/Connection、SecretVault、Model Catalog/Capability 与 capability-aware ModelResolver
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# ADR-097: AI Provider Connection、Secret 与 Model Capability Boundary

**状态：** 已采纳（待实施）
**日期：** 2026-09-09
**影响范围：** AI Provider、Provider Onboarding、Secret Vault、ModelResolver、Mastra/AI SDK execution、Settings AI section、Prisma/PowerSync、HTTP/IPC
**依赖：** ADR-050、ADR-051、ADR-092

## 1. 决策摘要

MemoFlow 将当前过载的 `AIProviderConfig` 拆成五个清晰概念：

```text
AIProviderDefinition
AIProviderConnection
AIProviderSecretVault
AIModelCatalogSnapshot
AIModelCapabilitySnapshot
```

执行时再通过：

```text
AIExecutionRequirement
        +
ProviderConnection
        +
ModelCapabilitySnapshot
        ↓
ModelResolver
        ↓
request-scoped runtime model config
```

核心约束：

> **长期 Provider product state 不再携带 plaintext API key。Secret 只在 execution edge 被 Vault resolve。**
>
> **Workflow 不仅选择 model id，还必须声明最低 capability；不满足 structured output/tool/streaming 要求时 fail closed。**

## 2. 当前问题

当前 `AIProviderConfig` 同时承担：

```text
provider catalog identity
endpoint/account connection
plaintext server DTO credential
default model
available model cache
enabled/default/fallback routing
```

这使两个问题叠加：

1. secret decryption boundary 偏宽；
2. “连接成功”与“适合某 workflow”没有清晰区分。

当前 `toChatExecutionProviderConfig()` 在缺 model 时还有 `gpt-4o-mini` 硬编码 fallback，对 arbitrary OpenAI-compatible endpoint 不可靠。

## 3. Provider Definition

`AIProviderDefinition` 描述 MemoFlow 对一个 provider/protocol 的系统知识，不包含用户 secret：

```ts
interface AIProviderDefinition {
  id: AIProviderDefinitionId;
  displayName: string;
  protocol: 'openai_compatible';
  defaultBaseUrl?: string;
  baseUrlEditable: boolean;
  authKind: 'bearer_api_key';
  capabilities: {
    supportsModelList: boolean;
    manualModelFallback: boolean;
  };
  docsUrl?: string;
  apiKeyUrl?: string;
  recommendedModelIds: string[];
}
```

当前 Provider Catalog V2 可以直接演化为这层。

Custom OpenAI-compatible 不需要独立 runtime；它只是一个可编辑 endpoint 的 Definition/Connection 组合。

## 4. Provider Connection

用户真正拥有的是 connection：

```ts
interface AIProviderConnection {
  id: AIProviderConnectionId;
  identityId: IdentityId;
  name: string;
  providerDefinitionId: AIProviderDefinitionId;
  baseUrl: string;
  credentialRef: AIProviderCredentialRef;
  enabled: boolean;
  isDefault: boolean;
  fallbackOrder: number;
  defaultModelId?: string;
  version: number;
  createdAt: Instant;
  updatedAt: Instant;
  deletedAt?: Instant | null;
}
```

### 4.1 `providerType` 退化为 definition/protocol identity

稳定态不需要同时保存：

```text
providerType
catalogId
protocol
```

三套相近 identity。

迁移应确定一个 canonical provider definition id，再由 definition 提供 protocol metadata。

## 5. Secret Vault boundary

目标持久化：

```text
AIProviderConnection.credentialRef
```

而不是：

```text
AIProviderConnection.apiKey
```

接口：

```ts
interface AIProviderSecretVault {
  store(identityId, credential): Promise<AIProviderCredentialRef>;
  resolve(identityId, credentialRef): Promise<ResolvedProviderCredential>;
  replace(identityId, credentialRef, credential): Promise<void>;
  revoke(identityId, credentialRef): Promise<void>;
}
```

### 5.1 Plaintext lifetime

plaintext credential 只允许存在于：

```text
onboarding probe execution
model verification execution
request-scoped ModelResolver execution
provider API call
```

禁止进入：

- client DTO；
- conversation/workflow snapshot；
- prompt/context；
- domain event；
- execution record；
- error message；
- debug log；
- data portability plain export。

## 6. Provider Onboarding V2 保留并提升为 canonical create/replace flow

当前 onboarding 设计正确，继续使用：

```text
probe credential + endpoint
  -> temporary encrypted onboarding session
  -> model discovery
  -> optional model verification
  -> commit connection
```

规则：

1. onboarding handle opaque；
2. session expiry；
3. one-time consume；
4. replacement session 绑定 target provider connection id；
5. commit 时 credential 写入 Vault，Connection 只保存 `credentialRef`；
6. transport 永远不返回 secret。

不再开放“直接 patch saved provider apiKey/baseUrl”绕过 probe/replace flow。

## 7. Model Catalog Snapshot

可用模型不是 Provider Connection 的永恒 child truth。

目标：

```ts
interface AIModelCatalogSnapshot {
  providerConnectionId: AIProviderConnectionId;
  discoveredAt: Instant;
  source: 'provider_api' | 'manual';
  status: 'available' | 'unsupported' | 'empty';
  models: AIModelInfo[];
}
```

是否持久化取决于真实 UI/offline/cache 需求；即使持久化，也必须是可 refresh 的 cache/projection，而不是 provider connection invariant。

## 8. Model Capability Snapshot

模型名称存在不代表满足 workflow execution contract。

目标：

```ts
interface AIModelCapabilitySnapshot {
  providerConnectionId: AIProviderConnectionId;
  modelId: string;
  verifiedAt: Instant;
  provenance: Array<'provider_catalog' | 'provider_api' | 'runtime_probe'>;
  capabilities: {
    chat: 'verified' | 'unknown' | 'unsupported';
    streaming: 'verified' | 'unknown' | 'unsupported';
    structuredOutput: 'verified' | 'unknown' | 'unsupported';
    toolCalling: 'verified' | 'unknown' | 'unsupported';
    vision: 'verified' | 'unknown' | 'unsupported';
  };
}
```

本 ADR 不要求一次性探测所有能力；只要求 execution 不再把“model id 可调用”误当成“所有能力都支持”。

## 9. Execution Requirement

Agent/Workflow 声明最小需求：

```ts
interface AIExecutionRequirement {
  streaming?: 'required' | 'optional' | 'none';
  structuredOutput?: 'required' | 'optional' | 'none';
  toolCalling?: 'required' | 'optional' | 'none';
  vision?: 'required' | 'optional' | 'none';
}
```

典型：

```text
Assistant
  streaming = required
  toolCalling = required when tools enabled

goal.create planner
  structuredOutput = required

task.create planner
  structuredOutput = required

knowledge.capture planner
  structuredOutput = required
```

## 10. ModelResolver

目标 resolution：

```text
explicit selected connection/model
    or
conversation/default selection
        ↓
owner check
        ↓
connection enabled check
        ↓
credentialRef resolve
        ↓
model catalog/capability validation
        ↓
AIExecutionRequirement validation
        ↓
runtime model config
```

### 10.1 Fail-closed conditions

以下直接返回稳定公开 failure：

- provider connection 不属于当前 identity；
- connection disabled/deleted；
- credential missing/revoked；
- selected model 不可用且没有通过 manual verification；
- required capability 明确 unsupported；
- required capability 尚未验证且当前 workflow policy 要求 verified；
- endpoint/base URL 不通过 canonical validation。

### 10.2 删除 magic model fallback

稳定态禁止：

```text
if no model -> gpt-4o-mini
```

正确行为：

```text
no executable verified model
-> provider/model configuration required
```

## 11. Default / fallback policy

本轮只保留当前真实产品需要的简单 policy：

```text
explicit user selection
-> default enabled connection
-> fallbackOrder among enabled connections, only if caller allows fallback
```

不提前自建复杂：

- latency-aware routing；
- price auction；
- model benchmark scheduler；
- multi-provider hedging；
- LiteLLM mandatory proxy。

如果 workflow 明确要求 deterministic selected provider/model，fallback 应关闭。

## 12. Settings UI boundary

Settings Hub 只组合 AI owner capability：

```text
Provider catalog
Provider connection list
Onboarding / replacement
Default connection/model
Model refresh/test
```

Settings 不复制 provider config 进 User Preferences。

## 13. Persistence migration

当前：

```text
ai_provider_configs
  api_key_encrypted
  available_models
```

目标至少逻辑上分离：

```text
ai_provider_connections
  credential_ref

secret vault storage

optional model catalog/capability cache
```

如果当前部署继续复用同一 DB 表承载加密 secret blob，仍必须在 application/domain contract 上体现 `credentialRef`，不能因为物理共库而重新把 secret 暴露给普通 DTO。

## 14. PowerSync / Desktop rule

Desktop local-only credential 继续使用本地 secure/encrypted vault，不把 plaintext secret 放进 PowerSync upload queue。

如果云端 Provider Connection 需要跨设备同步，credential material 的 sync/encryption policy 必须单独明确；本 ADR 不把“connection metadata 可同步”自动等价为“secret 必须同步”。

## 15. Observability

Execution telemetry 只记录：

```text
providerConnectionId
modelId
capability/profile metadata if safe
usage
latency
sanitized error
```

不记录：

```text
apiKey
Authorization
full provider request
secret-bearing query/header
```

## 16. Protected contracts

1. Provider Onboarding V2 opaque session flow；
2. encrypted at-rest credential；
3. no secret client exposure；
4. authenticated owner check；
5. Web/Desktop provider transport parity；
6. current explicit per-conversation model selection UX 可继续存在；
7. Mastra/AI SDK 是执行 runtime，不引入第二 provider runtime；
8. provider replacement 必须经过 probe/verify；
9. no hard-coded model fallback；
10. no secret in portability/log/event/snapshot。

## 17. 明确拒绝

本 ADR 拒绝：

- `AIProviderConfigServerDTO.apiKey` 作为长期 domain contract；
- Provider aggregate 长期持有 `availableModels[]` child truth；
- 只 ping `/models` 成功就视为 structured output/tool calling 可用；
- 为未来可能性创建 universal ModelGateway；
- BYOK 单机阶段强制 LiteLLM；
- client 自己选择未验证 arbitrary model 并让关键 workflow 静默尝试。

## 18. Acceptance target

实现完成后可以证明：

```text
saved provider load
 -> returns credentialRef, never plaintext apiKey

start goal.create with selected model
 -> ModelResolver validates structuredOutput capability
 -> resolves secret at execution edge
 -> secret never appears in event/snapshot/log
```

以及：

```text
provider has no verified executable model
```

时 UI/runtime 明确要求用户配置/验证，而不是自动使用 `gpt-4o-mini` 猜测。
