---
tags: [architecture, mcp, oauth, security, external-agent]
description: OAuth 写 consent 的安全模型评估、scope 映射、consent/审计/吊销要求，以及 #1054 一次开放的实施状态
created: 2026-11-19T00:00:00Z
updated: 2026-11-24T00:00:00Z
---

# External Agent OAuth 写 consent 设计评估

**状态：已实施（2026-11-21，[#1054](https://github.com/BakerSean168/memoflow/issues/1054)）。OAuth 写权限已直接开放，取代本文原“有条件、分阶段、默认关闭”的推荐。** 本文是 [#1033](https://github.com/BakerSean168/memoflow/issues/1033) 的设计评估，其 §2–§8 仍是机制依据；§1、§9、§10、§11 的阶段性结论已被用户决策覆盖，以本节和 #1054 为准。

## 0. 实施状态与决策（2026-11-21）

用户看过本文的分阶段推荐后明确拍板：**直接开放，不按分阶段方案实施。**

- 不以 §10 的 C1–C7 作为开工门槛，不做“一期只开 goals/tasks”的分投，也不把客户端白名单作为上线门槛。客户端仍受 `EAG_OAUTH_CLIENT_IDS` 的既有 allowlist 约束，但该列表不是本次开放的前置条件。
- OAuth 允许集一次扩展到现有 12 个 scope 加 `offline_access`；不新增 scope 名。读不隐含写、写不隐含读，复合条件沿用 PAT 侧规则（如 Task 建/改 binding 需 `goals:write`）。
- 新增全局开关 `EAG_OAUTH_WRITE_ENABLED`（代码默认 `0`，依赖 `EAG_OAUTH_ENABLED=1` 与 `EAG_WRITE_ENABLED=1`）。开关为 `0` 时：写 scope 不可授予、已发 token 的写能力在调用侧立即失效，读与 PAT 完全不受影响。上线置 `1` 是发布动作，不在 #1054。
- 写事务内新增 OAuth authority：`external_agent_connections` 与 `oauthConsent` 行按 `FOR SHARE` 锁定，复核 connection 未撤销/未过期、client 未停用、account 活跃、consent 仍覆盖本次 scope；撤销后写调用即时失效。
- Consent 页面改为按域分组的读写清单，写权限默认不勾选，支持逐域取消与“仅允许只读”降级（provider 的 consent 端点接受原始请求 scope 的子集）。写 scope 明示副作用，主按钮在含写授权时显示“允许写入”。
- Assisted workflow 不再保留 PAT-only 例外：具备 `tasks:write` 的 OAuth 连接同样发布并执行 5 个 assisted 工具。
- 审计：写回执在同一事务写入 `credentialType`、`clientId`、`consentScopes`；transport audit 增加 `credentialType`、`clientId`、`consentScopesHash`，写拒绝保留 `scopeDecision='denied'` 与稳定 `outcome`；consent 授予/拒绝与连接撤销产生 `effect='credential'` 事件。
- §4.3 的每客户端 `allowedScopes`/`writeEnabled` 上限未在本单实现：当前只有全局开关；客户端仍可通过既有 `disabled` 停用。该差异在 #1054 终报中记录。

## 1. 结论摘要

**原推荐（已被 #1054 覆盖）：有条件开放，且当前阶段保持关闭。实际决策：一次开放全部 12 个 scope（见 §0）。**

以下为原评估理由，作为风险与机制的背景保留：

- 变更前：OAuth 只授予 `goals:read`、`tasks:read`（以及显式 `offline_access`），写只走 PAT 签发时预授权。
- 原计划满足 §10 前置条件后，第一阶段只开放 `goals:write` 与 `tasks:write`，按客户端白名单、独立开关、默认 `0`。
- 原计划 `routines:write`、`notifications:write` 和 5 个 assisted workflow 继续只对 PAT 开放。
- 不新增 scope 名称，直接复用现有 12 个 scope；读 scope 与写 scope 互不隐含。这一条在 #1054 中保持不变。

理由：

1. 走默认登录流的 OAuth 客户端（典型如 Codex）是普通用户的主要接入方式；只读会让“整理目标、创建任务、完成任务”这类核心交互必须跳回 PAT 设置页，体验与产品定位不符。
2. PAT 的“签发时一次性预授权”适合个人自动化，但它不绑定客户端、默认 90 天有效，泄漏后的影响面并不比 OAuth 小；OAuth 有客户端绑定、10 分钟 access token、refresh 轮换和 90 天连接上限，具备开放写的技术基础。
3. OAuth 写引入的新风险集中在 **consent phishing、scope 提升和客户端冒充**，而不是 token 本身。先用客户端白名单、逐域 consent、事务内吊销校验和可查审计把这三类风险关住，再开放最小写集，比“永久不开放”更符合真实需求，也比“无条件开放”更可控。

不推荐“无条件开放”：OAuth consent 由客户端发起，用户对写权限的注意力远低于在设置页主动签发 PAT；没有客户端白名单和 consent 分域展示时，一次误点就可能产生持续 30 天的 refresh 写权限。

不推荐“永久不开放”：这会把所有交互式写需求推回手工 PAT，既降低可用性，也会诱导用户签发范围过大、期限过长的 PAT，反而扩大长期凭据面。

## 2. 当前边界与强制点

OAuth 写现在一定失败，不是某一处漏判，而是五处独立约束：

| 层                 | 位置                                                                     | 当前行为                                                                                             |
| ------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 授权服务器 scope   | `packages/cloud-auth/src/server/external-agent-provider.ts:14`           | `EXTERNAL_AGENT_SCOPES = ['goals:read', 'tasks:read']`；OAuth 允许集只加 `offline_access`            |
| Consent 请求校验   | `packages/cloud-auth/src/server/external-agent-oauth.ts:225`             | 请求 scope 不在 `EXTERNAL_AGENT_OAUTH_SCOPES` 内直接 403；token claims 再与 consent 取交集（`:302`） |
| Gateway 发布/调用  | `packages/agent-gateway/src/server/read-gateway.ts:245`                  | 写工具与 assisted 工具要求 `principal.credentialType === 'pat'`，OAuth 返回 404 `DISABLED`           |
| 写事务 authority   | `apps/api/src/modules/agent-gateway/write.port.ts:73`                    | 写事务只接受 `isScopedPatAuthorityCurrent`（PAT 表 + `FOR SHARE`），没有 OAuth authority 适配        |
| AI 权限 checkpoint | `packages/ai/src/server/permissions/gateway-permission-checkpoint.ts:48` | `preAuthorizedWrite` 仅在 `credentialType === 'pat'` 时成立；OAuth 写会进入逐次确认/拒绝路径         |

因此变更前 OAuth 可见工具只有 6 个：`goal_get`、`goal_search`、`task_plan_get`、`task_plan_search`、`task_occurrence_get`、`task_occurrence_list`。PAT 侧另有 16 个只读、13 个写和 5 个 assisted 工具（合计 40 个），其 scope 映射见 §4。该边界在 #1054 中已按 §0 放开。

> 结论：开放 OAuth 写必须同时改动授权集、consent 校验、Gateway 发布门、写事务 authority 与 checkpoint；只改其中一处会得到“能发现工具但调用必失败”或“能调用但绕过事务校验”的半成品。

## 3. PAT 预授权与 OAuth consent 的安全模型对比

| 维度       | PAT 预授权                                                                 | OAuth consent                                                                      |
| ---------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 授权时刻   | 用户在已登录的设置页主动签发；选择 name、scope、期限                       | 客户端发起 `/oauth2/authorize`，用户在浏览器 consent 页同意                        |
| 授权粒度   | 现有 12 个 scope 任选；写 scope 4 个                                       | 当前仅 2 个读 scope + `offline_access`；扩展后按域展示                             |
| 凭据形态   | 高熵 opaque bearer，数据库只存 SHA-256 摘要和前 12 位前缀                  | authorization code + PKCE → JWT access token（600 秒）+ 轮换 refresh（最多 30 天） |
| 客户端绑定 | 不绑定客户端；任何持有者可用                                               | 绑定 `client_id`、redirect URI、resource audience 和 connection                    |
| 写授权语义 | 签发时的 scope 即预授权；AI checkpoint 视为用户已同意该 operation          | 当前不预授权写；开放后仍是“consent 时的 scope 预授权”，不是每次调用逐次确认        |
| 有效期     | 默认 90 天，最长 365 天；续期即重新签发                                    | 连接最长 90 天，access 600 秒，refresh 最长 30 天；刷新不延长连接                  |
| 撤销       | `revokedAt`，每次请求在线校验；写事务 `FOR SHARE` 阻止撤销与写入并发       | 撤销连接 → `revokedAt` + 删除 provider consent/access/refresh；每请求在线校验      |
| 撤销即时性 | 撤销成功后开始的请求被拒绝；已提交事务不回滚                               | 同上；JWT 本地验签不构成授权，必须在线检查 connection/consent/account/client       |
| 审计与回执 | 持久 receipt + transport audit；写成功以 `external_mutation_receipts` 为准 | 当前只有连接级审计，没有写 receipt；开放写必须补齐同一 receipt/audit 口径          |
| 泄漏影响   | 长期 bearer；泄漏后可在有效期内使用全部已授 scope，直到撤销                | access token 短命且绑 audience/client；refresh 可续 30 天，撤销依赖在线检查        |
| 主要威胁   | 凭据泄漏、过度签发、长期不撤销                                             | consent phishing、scope 提升、客户端冒充、恶意 redirect                            |
| 适用场景   | 个人自动化、CI、无人值守 Agent                                             | 交互式第三方客户端、默认登录流、需要用户可见连接的场景                             |

关键判断：

- PAT 不是“更安全”的同义词。它不受客户端绑定保护，且用户为了省事容易签发 365 天、全 scope 的凭据；OAuth 的短 access token 和 refresh 轮换在凭据泄漏维度更好。
- OAuth 也不是“天然安全”。consent 是客户端驱动的，攻击者可以构造一个看起来合理的授权请求；如果允许写，用户的一次误点会变成可写的 refresh 授权。因此 OAuth 写的核心控制是 **客户端身份、consent 可理解性和吊销即时性**，不是再加一个确认弹窗。
- 两者最终都落到同一 owner 事务和 receipt；写语义、幂等、冲突和审计事实不应因凭据类型分叉。

## 4. 若开放：scope 扩展方案

### 4.1 复用现有 12 个 scope

不新增 `goals:readwrite` 之类的复合 scope。写 scope 继续表达“某域可写”，读 scope 单独表达“某域可读”，与现有 PAT 和 owner 校验保持一致。

| Scope                 | 覆盖工具（当前）                                                         | 副作用/数据                                                        | OAuth 一期                         | 说明                                                     |
| --------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------- | -------------------------------------------------------- |
| `goals:read`          | `goal_get`、`goal_search`                                                | Goal/KR 只读投影                                                   | 是                                 | 现有                                                     |
| `tasks:read`          | `task_plan_get/search`、`task_occurrence_get/list`                       | Task 只读投影                                                      | 是                                 | 现有                                                     |
| `relations:read`      | `relation_neighbors`                                                     | 跨域关系，双方可见才返回                                           | 否                                 | 与写无关，按需另评                                       |
| `routines:read`       | `routine_get/list/upcoming`                                              | Routine 定义与 occurrence                                          | 否                                 | 按需另评                                                 |
| `notifications:read`  | `notification_get/list/unread_count/preferences_get`                     | 通知事实与投递偏好                                                 | 否                                 | 按需另评                                                 |
| `schedules:read`      | `schedule_get/list`                                                      | 日历条目                                                           | 否                                 | 托管 API 尚未绑定 Schedule 端口                          |
| `labels:read`         | `label_list`、`label_resolve_names`                                      | 标签注册表                                                         | 否                                 | 标签写仍显式拒绝                                         |
| `ai:read`             | `ai_conversation_list/get/transcript`、`ai_agent_list/get`               | 会话正文、Agent 归档                                               | 否                                 | 内容敏感，不进入 OAuth 一期                              |
| `goals:write`         | `goal_create/update`、`goal_key_result_create/update`                    | 创建/修改 Goal、KR；不自动 activate                                | **是**                             | 需 `goals:read` 才能回读；首期排除整组 KR replacement    |
| `tasks:write`         | `task_plan_create/update`、`task_occurrence_complete`；assisted 5 个工具 | 创建/修改 Task，完成 occurrence；可能按既有 binding 影响 Goal 进度 | **是（仅 3 个 deterministic 写）** | assisted 仍 PAT-only；创建/改 binding 另需 `goals:write` |
| `routines:write`      | `routine_create/update/delete/pause/override`                            | 创建/删除/暂停 Routine；删除不可恢复                               | 否                                 | 二期候选，需调度与删除保护                               |
| `notifications:write` | `notification_mark_read/mark_unread/archive/restore/preferences_update`  | 切换已读、归档/恢复、修改投递偏好；均幂等且无外部发送              | 否                                 | 二期候选，风险最低但需求待验证                           |

OAuth 一期允许集建议为：

```text
goals:read tasks:read goals:write tasks:write offline_access
```

不把 12 个 scope 一次性全部开放。原因：`ai:read` 涉及对话正文；`schedules:read` 在托管 API 尚未绑定端口；`routines:write` 含不可恢复删除；`notifications:write` 需求尚未验证。先开放“目标 + 任务”这一组能覆盖默认登录流最核心的写场景，也最容易把 consent 文案讲清楚。

### 4.2 读写分离与复合条件

- 写不隐含读：`tasks:write` 可以在没有 `tasks:read` 时完成已知 occurrence（complete-only），但列表、搜索和回读需要 `tasks:read`。
- Task 创建/修改 binding 需要 `tasks:write + goals:write`；记录 Prompt measurement 还需要 `goals:read`。这与 PAT 侧一致（`apps/api/src/modules/agent-gateway/write.port.ts:201`）。
- `tasks:write` 的 consent 必须明确说明：完成 Task 会按既有 Goal contribution 配置影响目标进度，但不授权直接更新任意 Goal/KR。
- 危险操作（`routine_delete`、整组 KR replacement）不在 OAuth 一期；`goal_update` 继续排除整组替换字段。

### 4.3 客户端级 scope 上限

仅有全局允许集不够。`#1032` 的 client 注册表需要为每个客户端记录：

- `allowedScopes`：该客户端可请求的 scope 上限；默认只有 `goals:read tasks:read offline_access`。
- `writeEnabled`：独立布尔；默认 `false`。即使全局 `EAG_OAUTH_WRITE_ENABLED=1`，未标记的客户端仍不能请求写 scope。
- `disabled`：管理员停用；停用后所有 token 和 refresh 立即失效（`currentGrant` 已检查 `client.disabled`）。

授权、刷新和 token claims 三处都取 **token scopes ∩ consent scopes ∩ 服务端允许集 ∩ client 允许集**；任何一处不满足即拒绝，不做“先发 token 再在工具层拒绝”。

### 4.4 scope 变更语义

- 已有只读连接请求写 scope：必须重新走 consent；旧 token 不会自动获得写能力。
- 同一 connection 上更新 consent 时，记录 `consentedAt`/`consentVersion`；写事务读取当前版本，避免“撤销/扩权与写入”竞态。
- refresh 请求的 `scope` 只能是原 consent 的子集；不允许通过 refresh 追加 scope（当前 `external-agent-oauth.ts:200-203` 已按 consent 校验，扩展后继续保持）。
- scope 缩减立即生效：下一次请求的 scope 交集失败；已提交的写不回滚。

## 5. Consent 界面形态与粒度

### 5.1 粒度选择

| 方案   | 优点                                                 | 缺点                                                      | 结论     |
| ------ | ---------------------------------------------------- | --------------------------------------------------------- | -------- |
| 全量   | 实现最简单，当前页面即此形态                         | 用户无法区分读/写，无法只给最小权限；写权限容易被顺带授予 | 不采用   |
| 逐域   | 与 12 个 scope 的域边界一致；可读/写分组；文案可解释 | 需要改 consent 请求/响应契约和页面                        | **推荐** |
| 逐工具 | 权限最小                                             | 40 个工具，用户无法理解；scope 与工具映射会漂移           | 不采用   |

推荐“逐域 + 读写分组”：按 Goal、Task、Routine、Notification 分组，每组内分别列出“读取”和“写入”，写组默认不勾选（若客户端请求了写）。用户至少可以整体拒绝；如果 provider 支持部分授权，允许取消某个域。

### 5.2 页面必须展示

- 客户端名称、**精确 host**（不是仅 display name）、`client_id`、当前账户邮箱。
- 请求的每个 scope 对应的人类可读能力；写 scope 必须给出具体副作用：
  - `goals:write`：创建/修改 Goal 和 KR。
  - `tasks:write`：创建/修改/完成任务；完成可能改变 Goal 进度。
  - `routines:write`：创建、暂停或**永久删除** Routine（二期）。
  - `notifications:write`：切换通知已读/未读、归档或恢复，以及修改投递偏好（二期）。
- 有效期：连接最长 90 天，access token 10 分钟，refresh 最长 30 天；随时可在“设置 → 账户与隐私 → 已连接的应用”撤销。
- 与当前授权相比新增的 scope（re-consent diff）高亮显示；不得静默复用旧同意。
- 当客户端请求写时，提供“仅允许只读”降级入口；若 provider 不支持部分授权，则明确告知用户需返回客户端以只读范围重新发起。

### 5.3 反 phishing 要求

- 页面不得被嵌入 iframe：`frame-ancestors 'none'`；consent 不接受 `postMessage` 驱动。
- 展示 host 与名称不一致时给出警告；不把 `client_name` 当作可信身份。
- 文案用“请求访问你的 MemoFlow 数据”，不用“登录以继续”掩盖授权。
- 写权限不使用预勾选、默认全选或“允许全部”作为主按钮；主按钮文案必须包含“允许写入”。
- 失败/拒绝后不自动重试授权；不把 `oauth_query` 写入浏览器持久存储或日志。

当前页面（`apps/web/src/auth/ExternalAgentAuthorizationView.vue`）只渲染 3 个只读条目并明确写“不能创建或修改”；开放写之前必须替换为上述分组结构，不能只加一条 `<li>`。

## 6. 审计与回执

### 6.1 现状

- `external_mutation_receipts` 保存 `id`、`identityId`、`connectionId`、`capability`、`inputDigest`、`resultJson`、`createdAt`；成功写以 receipt 为 durable fact（`packages/database/src/adapters/prisma/external-mutation.ts:93`）。
- transport audit 字段为 `version/effect/receiptId/replayed/scopeDecision/requestId/traceId/credentialId/identityId/tool/outcome/durationMs`（`packages/agent-gateway/src/ports.ts:104`）；当前只写结构化日志（stdout + 14 天轮转文件），没有查询入口（#1031）。
- AI checkpoint 的审计 `agentId` 为 `external-mcp:<credentialId>`，允许和拒绝都记录。

### 6.2 开放写必须补齐

1. **回执元数据**：OAuth 写的 `connectionId` 使用 `external_agent_connections.id`；在同一 receipt 事务中写入 `credentialType='oauth'`、`clientId` 和事件时的 `consentScopes`（或 `consentVersion`）。不回写 owner 完整 read model，继续遵守 240 KiB 上限。
2. **回执身份**：Goal/Task 继续使用 `identityId + capability + idempotencyKey`，使同一用户在同一连接内重试可重放；Routine 继续使用 credential-scoped。OAuth 重新授权会产生新 connection，若旧连接已撤销，credential-scoped 的 Routine 重试会成为新操作——必须在文档和错误文案中说明，不能假装跨授权重放。
3. **transport audit**：增加 `credentialType`、`clientId`、`consentScopesHash`（或 `consentVersion`）；写拒绝（403/404/429）也必须有 `scopeDecision='denied'` 和稳定 `outcome`。不记录 token、参数全文、正文。
4. **credential 审计**：consent 授予/拒绝、连接撤销、client 停用要产生 `effect='credential'` 事件；当前只有 OAuth 管理路由的 list/revoke 审计，缺少 consent 事件。
5. **可查性**：#1031 落地前，至少定义审计保留期、导出方式和事故检索步骤；否则 14 天轮转文件不足以支撑写事件追查。
6. **关联**：`requestId`/`traceId`/`connectionId`/`clientId`/`receiptId` 必须能串起来；写成功的 `receiptId` 与 transport audit 的 `receiptId` 一致。

### 6.3 与现有口径对齐

- 成功写只以 durable receipt 为准；日志丢失不影响业务事实。
- 失败不写 receipt；协议错误、scope 拒绝、限流不伪造 receipt。
- receipt 不过期，账户删除级联清理；OAuth connection 撤销不删除历史 receipt（审计事实保留）。
- 不在 receipt 中保存 client secret、token、consent 全文或请求正文。

## 7. 吊销即时性

当前 OAuth 已在每个请求重查 connection/consent/client/account（`external-agent-oauth.ts:55-77`），并且撤销会删除 provider access/refresh/consent 并设置 `revokedAt`（`:353-367`）。开放写后还需要：

1. **事务内复核**：在 receipt 事务开始前和事务内都复核 OAuth authority；事务内对 `external_agent_connections` 行和对应 `oauthConsent` 行取 `FOR SHARE`（或读取带锁的 `consentVersion`），确保撤销/缩权不会与提交交错。
2. **失败关闭**：connection 缺失、`revokedAt` 非空、过期、client 被禁用、账户不活跃、consent 不含所需 scope，任一条件都拒绝；存储不可用同样拒绝，不做跨请求授权缓存。
3. **语义**：撤销成功返回之后开始的请求必须被拒绝；已经通过校验并提交的事务不回滚（与 PAT 的 `FOR SHARE` 语义一致）。页面/帮助文档要写明“撤销对后续请求立即生效，已提交命令不会回滚”。
4. **refresh 与写分离**：refresh rotation 只证明 token 续期，不证明写授权仍有效；写请求必须重新读当前 consent，不得依赖 refresh 时的 claims 缓存。
5. **assisted workflow**：长任务在每次 apply 前重新检查授权（ADR-118）；OAuth 一期不开放 assisted，避免把“长任务中途撤销”变成新的竞态面。

## 8. 风险清单

| 风险             | 场景                                                    | 影响                                      | 控制                                                               | 残余风险                                         |
| ---------------- | ------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------ |
| Consent phishing | 攻击者构造授权链接，诱导用户登录并点击“允许”            | 获得可写 connection，可创建/修改/完成数据 | 精确 client 白名单、展示 host、写权限不预勾选、短 TTL、可撤销      | 合法客户端被攻破或用户忽略 host 警告时仍可能中招 |
| Scope 提升       | authorize 或 refresh 请求附加写 scope，用户未注意       | 只读连接被升级为可写                      | 四处交集校验、refresh 不得追加、re-consent diff、client scope 上限 | 用户在不看 diff 的情况下继续点击                 |
| 客户端冒充       | 仿冒 CIMD URL/名称，或伪造 metadata                     | 用户把写权限授予错误客户端                | 精确 URL allowlist、CIMD SSRF 防护、管理员种子/停用、DCR 关闭      | CIMD 元数据本身不等于可信背书                    |
| Token 被盗       | access/refresh 被窃取                                   | 10 分钟内可写；refresh 可续 30 天         | audience/client 绑定、轮换、在线撤销、写限流                       | 撤销前的窗口；未上 DPoP                          |
| 混淆代理         | 客户端诱导用户对他人资源写入                            | 越权写                                    | 服务端 identity、owner 归属校验、禁止客户端传 identity/owner/scope | 无                                               |
| 破坏性操作       | `routine_delete`、整组 KR replacement、批量操作         | 不可恢复数据丢失                          | 一期不开放；expectedVersion；单实体命令；consent 明示              | 单条删除仍有风险，二期需额外确认                 |
| 幂等/重授权      | 写入超时后撤销并重新授权，客户端用同 key 重试           | 重复写或误以为已重放                      | 回执身份规则、强制 idempotencyKey、文档化 connection 变化          | 跨连接重试语义仍可能与用户预期不同               |
| 审计缺口         | 只有 14 天轮转日志，无查询入口                          | 事故无法追溯                              | #1031 或明确导出/保留方案；receipt 持久化                          | #1031 未完成前的调查效率                         |
| Consent 疲劳     | 用户为了尽快完成连接连续点击允许                        | 过度授权                                  | 逐域展示、只读降级、写组默认不选、最小 scope 集                    | 无法完全消除                                     |
| Assisted 升级    | `tasks:write` 通过 assisted workflow 间接生成并应用草案 | 用户未逐条审阅即产生多条 Task/Goal 变更   | 一期 assisted 仍 PAT-only；apply 前明确审批事实                    | 二期若开放需独立 approval UX                     |
| 限流/放大        | 写请求频率远高于读，或被用于刷接口                      | owner 事务压力、成本上升                  | 独立写配额、连接/工具级限流、429 Retry-After                       | 多副本下需 Redis/DB 配额一致性                   |
| 回滚不彻底       | 关闭开关后旧 token 仍在有效期内                         | 误以为已完全停写                          | 服务端工具隐藏 + client 停用 + 可选连接撤销；文档说明              | 已签发 token 在工具隐藏后无法写，但连接仍存在    |

## 9. 分步投产与回滚

### 9.1 阶段

| 阶段 | 内容                                                                 | 默认状态 | 退出条件                                            |
| ---- | -------------------------------------------------------------------- | -------- | --------------------------------------------------- |
| P0   | 当前：OAuth 只读，写走 PAT                                           | 已上线   | 本文评审通过                                        |
| P1   | 实现 OAuth 写能力，但所有开关默认 `0`；补 consent v2、audit、receipt | 关闭     | 单测/集成/预发证据；两账户 + 真实 Codex/Claude 验收 |
| P2   | 仅内部/白名单客户端开放 `goals:write`、`tasks:write`                 | 白名单   | 无 P1 级事故；审计可查；撤销/重授权演练通过         |
| P3   | 扩大客户端白名单；其余 scope 仍关闭                                  | 按客户端 | 真实使用数据、phishing 监控、支持成本可接受         |
| P4   | 评估 `routines:write`、`notifications:write`、assisted               | 关闭     | 各自单独设计与审批；不复用 P2 的结论                |

建议新增开关（设计，不在本单实现）：

```text
EAG_OAUTH_WRITE_ENABLED=0                 # OAuth 写总开关，依赖 EAG_WRITE_ENABLED=1
EAG_OAUTH_ROUTINE_WRITE_ENABLED=0         # 二期，默认 0
EAG_OAUTH_NOTIFICATION_WRITE_ENABLED=0    # 二期，默认 0
```

启动校验：`EAG_OAUTH_WRITE_ENABLED=1` 但 client registry 未启用、consent v2 未部署或 `EAG_WRITE_ENABLED=0` 时，启动失败而不是降级为静默可用。每个 client 的 `writeEnabled` 与 `allowedScopes` 仍可进一步收窄。

### 9.2 回滚

1. `EAG_OAUTH_WRITE_ENABLED=0`：写工具不再发布/执行；已有 token 不能写，读不受影响（若读仍开启）。
2. 需要完全停止某客户端：在 #1032 的 registry 设 `disabled=true`；`currentGrant` 会拒绝其所有请求。
3. 需要终止所有既有授权：撤销连接，删除 provider consent/access/refresh；receipt 保留。
4. 不需要数据迁移回滚；consent 行可保留，重新开启时按新 scope 重新 consent。
5. 观察 403/404、consent 拒绝率、写 QPS 和异常率；回滚后确认写工具从 `tools/list` 消失。

## 10. 推荐与触发条件（原分阶段方案，已被 #1054 覆盖）

### 10.1 推荐

**原推荐：有条件开放，分阶段，默认关闭。** 用户 2026-11-21 已决定直接开放全部 12 个 scope；C1–C7 不再作为开工门槛，客户端白名单也不是上线前提。本节其余条件作为风险控制清单保留，不再是发布闸门。

### 10.2 前置条件（全部满足才进入 P1/P2）

- **C1 客户端治理**：#1032 完成 client registry、精确 allowlist、管理员停用、无 DCR；默认客户端只读。
- **C2 Consent v2**：逐域读/写分组、client host、re-consent diff、只读降级、反 iframe/反钓鱼文案；替换当前只读页面。
- **C3 事务内 OAuth authority**：connection + consent + account 的写事务复核与锁语义；失败关闭；不缓存。
- **C4 审计与回执**：receipt 记录 `credentialType/clientId/consentScopes` 或版本；transport audit 补齐字段；#1031 可查或明确导出/保留方案。
- **C5 独立开关与配额**：`EAG_OAUTH_WRITE_ENABLED=0`、client `writeEnabled`、写限流、告警和回滚手册。
- **C6 验收**：两个不同账户；真实 Codex/Claude 走默认登录流完成 create/update/complete；scope 提升被拒；撤销竞态；同 key 重放；开关回滚。
- **C7 安全评审**：consent phishing、client 冒充、redirect 校验、CSRF/clickjacking；事故响应 runbook。

### 10.3 触发与反转条件

- **开始实现**：默认登录流客户端的真实写需求持续存在，且 C1/C4 已具备；不要在 #1032 和审计可查性之前开工。
- **转为“不开放”**：出现 consent phishing 事故且无法通过页面/白名单缓解；provider 不支持可靠的 scope 缩减或撤销；审计无法满足事故追溯；client registry 无法阻止未授权客户端。
- **扩大范围**：DPoP/客户端证明、per-client scope 上限稳定运行、真实写使用数据和事故率支持。

## 11. 对父单 #973 的口径

- #973 清单中的“OAuth 写 consent 决策”原以本文 §1 与 §10 为准；2026-11-21 用户拍板后以 #1054 与 §0 为准。
- 当前结论：**一次开放 12 个 scope + `offline_access`**，由 `EAG_OAUTH_WRITE_ENABLED` 控制；原 P2 的“仅白名单客户端开放 goals/tasks”已取消。
- 本文不代表任何部署开关已翻转；生产是否启用写由发布方设置 `EAG_OAUTH_WRITE_ENABLED=1`，代码默认仍为 `0`。

## 12. 证据索引

| 主题             | 位置                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------- |
| OAuth 允许 scope | `packages/cloud-auth/src/server/external-agent-provider.ts:14`                        |
| Consent 请求校验 | `packages/cloud-auth/src/server/external-agent-oauth.ts:211-235`                      |
| Claims 交集      | `packages/cloud-auth/src/server/external-agent-oauth.ts:294-316`                      |
| 撤销连接         | `packages/cloud-auth/src/server/external-agent-oauth.ts:353-367`                      |
| Gateway 写门     | `packages/agent-gateway/src/server/read-gateway.ts:193-253`                           |
| 写事务 PAT 校验  | `apps/api/src/modules/agent-gateway/write.port.ts:51-88`                              |
| PAT authority 锁 | `packages/cloud-auth/src/server/scoped-pat.ts:219-245`                                |
| AI checkpoint    | `packages/ai/src/server/permissions/gateway-permission-checkpoint.ts:31-61`           |
| Receipt runner   | `packages/database/src/adapters/prisma/external-mutation.ts:43-113`                   |
| Audit 字段       | `packages/agent-gateway/src/ports.ts:104-147`                                         |
| Consent 页面     | `apps/web/src/auth/ExternalAgentAuthorizationView.vue:113-136`                        |
| Scope 契约       | `packages/agent-gateway/src/contracts/index.ts:55-131`                                |
| 授权决策背景     | `docs/internals/decisions/ADR-117-external-agent-authorization-and-credentials.md`    |
| 写事务背景       | `docs/internals/decisions/ADR-118-external-agent-mutations-and-assisted-workflows.md` |
