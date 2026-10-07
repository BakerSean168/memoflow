---
tags: [analysis, mcp, task, verification]
description: EAG-03 PAT 六个只读工具的实现与验证证据
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# EAG-03 Task 只读证据

当前状态：用户授权的 PAT + 六个只读工具已实现并验证。官方 SDK、真实 PostgreSQL、审查修正后的完整 affected 检查、最终 prod-like 镜像和实际 PAT 六工具 journey 全部通过。OAuth 明确延期；不代表 EAG-01～10 全部完成。

基线 HEAD：`3664f8da6a95174d24ae8f443f2d12b3ce223e33`；分支 `feat/external-agent-gateway-20261007`，root worktree，未提交变更。OAuth 与真实 Codex/Claude OAuth 验收由用户明确延期。写入及 EAG-06～10 不属于本次交付。

## 已实现行为

| 工具 | Scope | 输入与投影 |
| --- | --- | --- |
| goal_get | goals:read | Goal ID；最小 Goal/KR 投影 |
| goal_search | goals:read | query、limit、cursor；有界 Goal 页 |
| task_plan_get | tasks:read | TaskPlan ID；定义、schedule、状态、version，不伪造统计 |
| task_plan_search | tasks:read | query、limit、cursor；createdAt DESC/id DESC |
| task_occurrence_get | tasks:read | TaskOccurrence ID；已有事实、dueAt、isOverdue、version |
| task_occurrence_list | tasks:read | startDate/endDate epoch-ms、includeOverdueOpen、limit、cursor；scheduleDate ASC/id ASC |

所有工具都验证当前凭据、scope、账户及资源归属。PAT 默认仅 goals:read，tasks:read 必须显式授予；旧凭据不自动扩权。发现过滤之外还有调用时校验和 owner 前重新认证。读工具不调用 Assistant、LLM 或浏览器，不产生 Occurrence、outbox 或业务变更。

Task owner 使用有界 query factory，RepeatableRead、限时事务、SQL statement_timeout、limit+1 和 UTF-8 聚合 preflight；领域 mapper 与 canonical `toClientDTOAt` 提供业务投影。账户时区通过 Setting owner 的独立有界 Product Time port 读取。Gateway 不访问 Task 或 Setting 表。

范围最多 31×24 小时，转换为当前账户 IANA 时区 inclusive Ymd。epoch-ms 输入限定 `[0, 253402214400000]`，保证任意 IANA 时区的四位年份日期。Occurrence cursor 固定 asOf、绑定时区/账户/工具/筛选/页大小；时区变化拒绝旧 cursor。过期未完成项只包含开始日期前已有 Pending/InProgress，不创建 upcoming 实例。

复用仅限 SDK 无关 descriptor、响应预算与 transport 机制。实际 Mastra/MCP 共用操作 parity 延期至 EAG-09；不能把 descriptor 注册当成 EAC-10 完成。

## 已取得证据

- `/tmp/eag03-api-final.log`：真实 PostgreSQL、PAT 与官方 SDK 集成，2 files / 4 tests 通过；modern pinned profile 和 legacy default client 都发现六工具并读取 Task。
- `/tmp/eag03-owner-final.log`：Task 真实数据库测试 2 项通过；同排序键、多页、双账户、字面量搜索、DST、overdue、时区改变、无 upcoming materialization、大字段与 Task 表锁超时取消。
- `/tmp/eag03-gateway-final.log`：Gateway 8 项测试通过，调用时 scope、scope 撤销、非法输入、未知工具、分页/预算与审计。
- `/tmp/eag03-nearest.log`：contracts、agent-gateway、task、cloud-auth、api、goal、account 最近 lint/typecheck 共 41 targets 通过。
- 完整第一次测试发现 API PAT mint 单测仍期待旧输入；更新为显式默认 goals:read，同时保持严格输入与认证断言。该轮 API 347/348 通过，其余 6 个 package targets 通过；修正后完整复跑与最终 affected test 全部通过。

## 审查修正与最终验证

日期超界 red test：`/tmp/eag03-date-red.log` 记录 MAX_SAFE_INTEGER 原来被接受；修复后 owner/MCP 共用边界。Gateway 另断言该输入不调用 Task owner。

Setting preference SQL 也纳入 Task deadline。API integration 增加真实 `user_preference_records` exclusive lock 测试，检查超时返回后 pg_stat_activity 没有遗留锁等待查询。

未知异常经内部 observer 保留原始 cause；MCP 仅安全 INTERNAL_ERROR，audit 不包含 cause。宿主诊断日志记录关联 ID、分类、源位置和 causeRef，不输出 provider message、token 或输入。

最终 lint/typecheck/test、数据库、治理、docs、API bundle boundary 与本地部署报告均已通过；本次 Task 部署由下方新镜像与六工具 journey 证明。

两项审查（Spec 与 Standards）于修正后只读复核通过：日期输入界限、Setting 有界读取、诊断 cause seam 均解决原发现。复核本身不代替执行测试。


审查修正后执行结果：`/tmp/eag03-review-tests.log` 的 contracts/agent-gateway/setting/time/api 五项目测试全部通过；`/tmp/eag03-review-checks.log` 六项目最近 lint/typecheck（39 targets）通过；`/tmp/eag03-review-db.log` 真实数据库 3 tests 通过（包含 Preference 锁取消）；`/tmp/eag03-gateway-reviewed.log` Gateway lint/typecheck/test 通过；`/tmp/eag03-diagnostic-test.log` 2 项 audit/诊断脱敏测试通过。`/tmp/eag03-api-build.log` API 构建通过，永久产物断言确认 main/server 共用外部 logger package。日期 red→green 与新增诊断测试没有删减原有保护行为。

## 最终 prod-like 验收

仓库原有 validate-local-deploy helper 由独立用户 systemd unit 执行，2026-10-07T11:42:35Z 完成，verdict=pass、readyForPr=true、blockingIssues=[]、warnings=[]。affected lint/typecheck/test 和 `pnpm docker:local:rebuild` 全部 exit 0。未删测试或弱化认证；未发布生产。

- 报告：[latest.md](../../reports/local-deploy-validation/latest.md)、[latest.json](../../reports/local-deploy-validation/latest.json)。reports 为本机验证产物；本页保留可版本化的结论与 provenance。
- 冻结源码 revision：`3664f8da6a95174d24ae8f443f2d12b3ce223e33-dirty-e28ff26819be`。API/Web 镜像标签、OCI revision、实际运行容器与源码一致，均 healthy。
- API image ID：`sha256:05476e7b1c5eb0375e68118ae346e7684edc32b241f5f467dfa10b21983a5d9c`。本机 image ID 不冒充 registry manifest digest。
- 真实容器官方 SDK journey：run `d215ed28`、两账户、27 assertions 全部通过；真实注册/邮箱验证/登录、PAT create/list/revoke、六工具、两页 Goal/Plan/Occurrence、跨账户 cursor/ID 拒绝、第一方 parity、默认 Goal-only scope 不自动扩权、直接 Task call 403、modern pinned 与 legacy SDK、撤销后 401。证据 `reports/local-deploy-validation/eag03-pat-six-journey.json`；临时执行脚本 `/tmp/eag-nx/prod-pat-six-journey.mjs` 不含持久凭据。
- 所有 3 个验收 PAT 都在 finally 撤销；本地测试账户/业务 fixtures 保留，不触及生产或其他 worktree。
- 实际容器 34 条 info audit：全部六工具及 PAT 生命周期；OK 17、INVALID_CREDENTIAL 2、PROTOCOL_OK 8、INVALID_CURSOR 2、NOT_FOUND 3、INSUFFICIENT_SCOPE 1、METHOD_NOT_ALLOWED 1。最小字段 requestId/traceId/credentialId/identityId/tool/scopeDecision/outcome/durationMs/version/effect 齐全，未包含 credential/body/provider message。仅持久化脱敏统计 `reports/local-deploy-validation/eag03-audit-summary.json`，不保存原始日志。

## 完成边界与连接

本次 PAT 六工具交付已实现并验证；[连接指南](../guides/development/external-agent-pat.md) 说明管理 API、scope、环境变量与 Codex Bearer 配置。本机可调用地址 `http://127.0.0.1:20201/mcp`。没有真实 Codex/Claude OAuth 完整旅程的交付声明；实际 OAuth、Mastra 共用操作 parity、写入、其他 owner 与 durable workflows 均按总方案后续推进。

交接：当前分支/HEAD 如上，代码未提交、未推送。源码冻结后的最近检查与新镜像验收均通过；最终文档回填后的 `pnpm nx run memoflow:governance-check`、`pnpm nx run memoflow:docs-check`、`git diff --check` 均通过（日志 `/tmp/eag03-governance-final.log`、`/tmp/eag03-docs-closed.log`）。本次 PAT 六工具无需继续等待任何授权或凭据。继续后续阶段时先读总方案与所需工作项，不重新规划架构。
