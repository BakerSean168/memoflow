---
tags: [adr, ai, permissions, mastra, mcp]
description: Agent 业务操作统一授权检查点、四档预设与原生审批及云端 scope 边界
created: 2026-10-31T00:00:00Z
updated: 2026-10-31T00:00:00Z
---

# ADR-123: Unified Agent Business Permission Checkpoint

**状态：** 已采纳（#757、#759、#761；设置和确认 UI 由 #760 交付）

**日期：** 2026-10-31

**关联：** ADR-050、ADR-118、ADR-120、ADR-121

## Context

Agent 原生命令/文件权限不能约束 MemoFlow 业务数据。此前内置助手使用固定工具 allow/ask 列表，云端 MCP 仅检查 token scope，本地桥又有自己的授权规则。用户已经授权的操作仍逐次询问，而未分类的业务写入可能绕过确认。

本决策替换 ADR-118「授权写入与逐操作审批分开」及 ADR-121 第 6 节中的逐次业务审批方案；两者的凭据、owner 归属、并发版本、事务回执和幂等约束继续有效。不得增加第二个审批工作流或把模型提供的 `approved: true` 当成授权。

## Decision

### 同一个业务检查点

所有 Agent 入口使用 AI 所有的操作目录、`authorize()` 和 `executeAuthorized()`。规则以 Agent × 对象 × 操作为粒度，按用户禁止 > 询问 > 允许 > 档位默认值判定。全局、每 Agent 和本次对话规则叠加；会话临时调高权限不能覆盖用户禁止。未登记的操作和修改 AI 权限设置的操作始终禁止。

| 操作                     | 只读 | 每次确认 | 按需授权（默认） | 完全自动 |
| ------------------------ | ---- | -------- | ---------------- | -------- |
| 读取                     | 允许 | 允许     | 允许             | 允许     |
| 新增                     | 禁止 | 询问     | 允许             | 允许     |
| 修改、删除               | 禁止 | 询问     | 询问             | 允许     |
| 永久删除、批量、对外发送 | 禁止 | 询问     | 询问             | 允许     |
| 修改 AI 权限             | 禁止 | 禁止     | 禁止             | 禁止     |

用户本人在界面保存不经过 Agent 检查点。Agent 原生权限与 MemoFlow 业务权限分开表达；业务完全自动不扩大命令、文件系统或沙箱权限。

### 内置助手使用 Mastra 原生暂停

每次工具调用的原生审批 predicate 先运行 `authorize()`：允许直接执行，询问进入 Mastra 原生暂停审批，禁止由原生 gate 直接拒绝。Session 的 yolo、category grant 和历史工具 grant 不能扩大业务权限。工具执行前再次检查规则，避免暂停期间的撤销被旧批准绕过。恢复持久化暂停时恢复其对话档位和 Agent 身份，并重新判权；缺少有效档位的旧快照保守按只读恢复。

内置助手使用实际 `agentInstanceId`；无显式实例时使用 `builtin-mastra`。`supervised` 是旧运行时名称，使用已保存的业务档位，无设置时按需授权；`read-only`、`confirm-each`、`on-demand` 和 `auto-approve` 分别对应四档，仅限当前对话。以后允许/撤销仍属于权限规则仓库，不由 Mastra category grant 保存。

### 云端 MCP：scope 是上限

Gateway 保留当前凭据、token scope、调用时撤销检查和 owner 事务内 authority 校验；scope 范围内再调用统一业务检查点。Gateway 通过 host 注入的 checkpoint port 调用 AI，避免 Gateway 和 AI 形成循环依赖。每个凭据以 `external-mcp:<credentialId>` 标识独立 Agent；客户端不能在模型参数中指定另一个身份。

云端没有可信 MemoFlow 交互审批通道。询问和禁止均返回工具错误 `PERMISSION_DENIED`；附中文「请在 MemoFlow 设置 → AI 权限里授权」和英文 Settings → AI Permissions 提示，不执行 owner mutation、不创建审批 intent。允许的新增可在 scope 内直接执行。未登记的 assisted 操作保持禁止，未来开放必须先登记实际业务语义。

### 存储、审计与部署

Desktop 内置助手复用 #759 的 `PermissionLocalRepository`，使用当前 Profile 的本地 SQLite 表，不上传用户规则。API 内置助手和云端 MCP 使用 `PermissionPrismaRepository`，通过现有 Prisma `ai_permission_settings`、`ai_permission_rules`、`ai_permission_audit` 表按认证 owner 查询；不尝试读取客户端本地表，也不增加隐式规则同步或第二份规则真值。

服务端没有用户规则时使用默认按需授权。表尚未部署时，统一检查点仅对明确的缺表错误回退默认档位并容忍审计缺表，不能把网络故障、损坏数据或其他数据库错误当成缺少授权。表可用时记录判定及执行状态；缺表期间仍保留现有 Gateway scope/outcome 日志，不能宣称这些日志已同步到 Desktop 活动列表。

生产 API 只在正式 release 后由用户手动部署。本变更不触发部署、不连接生产数据库、不要求先升级服务端才能使用 Desktop 本地权限。桌面设置不会立即改变尚无同步通道的云端规则；将来新增云端管理或同步入口须明确 owner、撤销和部署语义。

## Consequences

- 新增在默认档位下自动执行；修改、删除及高风险操作询问；四档下用户禁止与权限设置锁始终有效。
- Mastra 继续拥有暂停、批准/拒绝和恢复状态，MemoFlow 只拥有业务策略及审计。
- scope 外即使业务允许也拒绝，scope 内若业务询问也不执行；幂等回执不构成授权凭据。
- Desktop 与云端规则暂不跨端同步。缺表回退保证分批部署可用，不代表云端具备 Desktop 设置页中的全部授权。
- 删除/批量工具后续在 #762 登记和验证；本次不发布额外破坏性工具。
