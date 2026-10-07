---
tags: [plan, active, mcp]
description: EAG-01 锁定 owner 基线并验证 MCP SDK、Better Auth 和客户端协议组合
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# EAG-01：基线与协议认证试验

状态：SDK/provider fixture 与真实 CLI 授权发起已实现并验证；真实 OAuth journey 与 CLI tools profile 待 EAG-04/05。依赖：无。入口：[总方案](../2026-10-07-external-agent-gateway.md)、[协议研究](../../../analysis/2026-10-07-external-agent-protocol-research.md)。

## 交付行为

得到可重复的 SDK/provider/client 组合与 owner baseline，为真实 Goal slice 提供已确认入口。交付物是 characterization、隔离试验及精确兼容报告，不是公共 Gateway。

## 实施步骤

1. 记录最新 HEAD、dirty state、现有 active workflow 变化；重新定位 GoalApplicationPort、TaskApplicationPort、CloudSessionCapability 和 API bootstrap。
2. 固定 Goal get/search/create+KRs、Task Plan/Occurrence 与 Prompt complete-only、第一方 auth 的 characterization。复用已有测试，缺失的行为才补。
3. 在隔离 fixture 中锁定 SDK v2 的 server/client/Node/Express 版本，验证当前 Node/Zod/Express 兼容性与单 POST Streamable HTTP。
4. 用官方 Better Auth MCP/CIMD/jwt 组合验证 provider 能力；不同时注册 mcp() 和 oauthProvider()。核实 `1.7.6` 与候选版本的 schema 和 session/device 共存。
5. 测试 2026 request metadata 与 SDK legacy profile，记录 Codex/Claude Code 精确版本和 callback；依据实测决定兼容开关。不要自建旧协议 shim。
6. 写一份 `docs/analysis/YYYY-MM-DD-eag-01-compatibility-evidence.md`，包含依赖矩阵、命令、结果、未覆盖项；更新 ADR 中 provider/兼容选择。

## 保护契约

不全量升级 tech stack，不接生产账户，不为验证创建虚构业务模块。fixture 可以用官方示例验证协议，但最终必须定位真实 Goal read port。不能因为协议 stateless 而删除业务持久化。

## 验收与验证

- 精确版本、注册策略、resource URI、metadata route、撤销 grant 标识都能重现。
- 非法 metadata/header、unsupported revision、Origin、PKCE/redirect 拒绝有 evidence。
- 现有 Web session/Desktop bearer/device characterization 通过。
- 新增行为测试运行最近 `cloud-auth`/`api`/`contracts` targets；纯试验结果标记为非生产证明。

完成 EAC-01 的协议基线部分。不能把模拟客户端成功当作 EAC-04。

## 回退与移交

fixture 独立可删除；生产配置保持关闭。下一项 EAG-02 使用已锁定 SDK 与真实 Goal port。若 provider 缺少必要能力，记录具体阻塞并选择已验证 provider，不能降低 audience/PKCE 要求。

## 实施证据

见 [精确兼容报告](../../../analysis/2026-10-07-eag-01-compatibility-evidence.md)。保持现有 Better Auth 1.7.6；SDK/client 2.3.1，Node 2.1.1，Express adapter 2.0.2。fixture 默认 strict 2026；不把未完成的真实登录同意与 tools 调用写成通过。下一步 EAG-02 先补 Goal 数据库分页，再做 scoped PAT 纵向链路。
