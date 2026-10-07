---
tags: [plan, active, mcp, goal, reliability]
description: EAG-06 以 Goal create/update 验证外部写入幂等、原子回执与版本冲突
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# EAG-06：Goal 可靠写入

状态：待实施。依赖：EAG-05。入口：[总方案](../2026-10-07-external-agent-gateway.md)、[ADR-118](../../../architecture/adr/ADR-118-external-agent-mutations-and-assisted-workflows.md)。

## 交付行为

用户显式授予 goals:write 后，可通过 goal_create 一次创建 Goal 与 initial KRs，通过 goal_update 修改允许字段。重试返回原 receipt，并发旧版本更新不覆盖新事实。

## 实施步骤

1. 增加 write scope consent 与独立 write feature flag；读连接没有自动升级，客户端 approved 字段一律不接受。
2. 为两工具声明 strict schema：隐藏 caller-supplied entity IDs，显式 idempotencyKey；update 保留 expectedVersion，首版排除整组 keyResults replacement。
3. 以具体 Goal operation 完成 request normalization/fingerprint、connection namespace 和 receipt 存储；稳定 ID 从该受控调用派生，不从 HTTP requestId 派生。
4. 扩展 Goal-owned transaction seam，让业务 mutation、outbox（若该操作需要）与 receipt 在同一 commit 中完成。对现有 create 的“同 ID 返回当前对象”行为先 characterization，不把它当作完整 fingerprint replay。
5. 同 key 异 body 返回冲突；commit 后断连返回原 receipt；权限/账户撤销后先拒绝再考虑 replay；结果过期 tombstone 不重新执行。
6. 用实际 Web/owner query 检查创建结果与 update version；确认不存在隐式 activate、多 owner 创建或 LLM 调用。

## 保护契约

Gateway 不得到 Goal repository/Prisma handle。将最小授权/receipt context 通过 application seam 注入，不能让 Goal domain import MCP/OAuth。已有 deterministic IDs 的 workflow 行为保留并与新的 ingress key 区分。

## 验收与验证

- 一个真实 PostgreSQL transaction：注入 receipt 写失败，Goal/KR/outbox 均回滚。
- commit 完成后丢弃 HTTP 响应，重启后同 key 返回相同 IDs、版本与原 receipt；对象随后更新不会改变该 receipt。
- 同 key 多并发只有一个 effect；同 key 异输入、无 scope、他人 ID、过期版本均无额外写。
- create+KRs owner 规则、label ownership、timeframe 校验、update 可清空/未提供语义保持。
- Goal integration、api/contracts/cloud-auth 最近 targets、prod-like 与治理通过；完成 EAC-06～08 的 Goal 证据。

## 回退与移交

关闭 write flag，保留 receipt 的唯一性和原业务数据。Goal 模式通过后 EAG-07 验证第二 owner；此时仍不提取通用 transaction framework。
