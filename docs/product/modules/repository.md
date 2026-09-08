---
tags:
  - product
  - module
  - repository
description: 资源库模块当前实现、本地 Vault、可选 GitHub 同步与跨端边界
created: 2026-06-02T00:00:00
updated: 2026-09-08T21:25:00+08:00
---

# 资源库模块说明

## 1. 功能定位

资源库模块负责把用户的 Markdown 知识资产接入 MemoFlow 的浏览、搜索、引用、AI 和跨端流程。长期定位不是独立知识编辑器，而是本地 Obsidian Vault、可选 GitHub private repository 和 Memory Flow 业务能力之间的边界。

[ADR-034](../../architecture/adr/ADR-034-obsidian-vault-repository.md) 已采纳：本地 Vault 优先；GitHub 登录与仓库授权解耦；用户需要同步时再连接 GitHub；绑定后 Web 可以安全地快捷创建新笔记。

## 1.1 vNext 已采纳建模方向（待实施）

2026-09-08 已完成 Repository/Knowledge vNext 建模冻结，但当前代码仍以本文件“当前实现”和 current-system map 为准。vNext 不恢复旧 Repository/Folder/Resource Aggregate，而是收敛为：

```text
KnowledgeSpace
├── LocalVaultBinding + LocalVaultHealth
├── KnowledgeRemoteBinding + RemoteRepositoryObservation
├── RemoteHistoryFence
├── KnowledgeProjectionCheckpoint
├── Stable KnowledgeDocumentId
├── Document/Asset Projection
└── KnowledgeCommitOperation
```

同时明确：

- `KnowledgeDocumentId` 与 path 分离，跨模块 Goal/Task Relation 不得引用 path-derived projection id；
- AI 独占 knowledge index state，Repository projection 不再长期保存 `indexStatus` 双真值；
- Web confirmed commit、Webhook 与 reconciliation 最终共用单一 `KnowledgeProjectionEngine`；
- Local Vault ownership 从 online identity 收敛到 Local Profile / KnowledgeSpace 语义；
- 现有 GitHub InstallationIntent、local-first Git、no-force-push、conflict pause、webhook dedup、lease、confirmed-write idempotency 等作为 protected assets。

权威设计包：

- [Knowledge Repository vNext](../knowledge-repository-vnext.md)
- [Current System Map](../../analysis/2026-09-08-knowledge-repository-vnext-current-system-map.md)
- [ADR-089](../../architecture/adr/ADR-089-knowledge-space-source-binding-and-health-boundaries.md)
- [ADR-090](../../architecture/adr/ADR-090-stable-knowledge-document-identity.md)
- [ADR-091](../../architecture/adr/ADR-091-knowledge-projection-index-and-operation-boundaries.md)

**这些文档只冻结目标模型，不表示生产实现已经迁移。**

## 2. 当前实现

- Desktop 已支持 profile-owned 本地 Vault 选择、扫描、搜索、安全预览、Obsidian 打开和确认后写入；未连接 GitHub
  时不上传 Vault 内容。
- GitHub 登录与 GitHub App 仓库授权使用独立 contract、token 和 UI；只允许连接明确选择的 private、active、admin
  repository。
- Desktop 已实现首次对账、真实 Git commit/fetch/pull-rebase/push、冲突暂停、离线 pending commit 和 profile-scoped
  自动同步。
- 服务端已实现 GitHub webhook、default branch reconciliation、Markdown/附件投影、链接关系、受认证附件读取、短期附件
  cache、Web 幂等新建笔记和 RAG 自动索引。
- Web 设置页可下载独立、不可导入的服务端持有数据披露，覆盖 retained connection metadata、投影、附件缓存字节、
  Webhook/write history 与 RAG index，不包含 MemoFlow 管理的可重放 GitHub 授权。
- Web 已收缩为投影浏览、搜索、安全 Markdown 预览、关系查看和确认后创建新 Markdown 文件，不开放已有笔记全文编辑。
- 旧数据库 Repository/Folder/Resource CRUD、Editor content API、Desktop legacy IPC、Vue `/note/:id` 与 Mobile
  Repository/note-editor 路由均已从 host 运行时移除；旧数据只保留在可重新导入备份边界内。
- 断开仓库默认保留可重建云端数据；用户可显式选择永久清理 MemoFlow 投影/cache/ledger/RAG，且两种模式都不删除
  本地 Vault 或 GitHub repository。
- 真实 Git 服务边界验收已覆盖；真实 GitHub fixture E2E 仍需在具备受控 GitHub App 凭据的环境执行。

## 3. 已采纳目标态

### 本地 Desktop

- 账密用户、GitHub 用户和访客都可以选择本地 Obsidian Vault。
- 未连接 GitHub 时，所有笔记和附件只存在本地。
- Desktop 扫描、监听、预览、搜索，并使用 `obsidian://` 外部编辑。
- Agent 根据运行时可用上下文、知识库结构和用户当前指令提出路径和内容，用户确认后写入 Vault。

### GitHub 同步

- 登录方式和知识仓库授权分开。
- 账密或 GitHub 在线账号可创建/连接一个 private repository。
- Desktop 将 Vault 作为 Git working tree，批量 commit、pull/rebase 和 push。
- GitHub App webhook 驱动服务端 read model、链接索引和 RAG。
- GitHub 故障或撤销授权不影响本地 Vault。

### Web 与 Mobile

- 未连接仓库时提示去 Desktop 连接同步。
- 连接后支持浏览、搜索、预览、反链和 RAG。
- Web 首期支持创建唯一的新 Markdown 文件和确认 AI 草稿入库。
- 已有笔记编辑、移动、重命名、删除和冲突解决暂不开放。
- 所有 Web 写入先创建 Git commit，不能只写服务端数据库。

## 4. 核心数据流

```text
Local Obsidian Vault
  <-> Desktop Git runtime
  <-> GitHub private repository
       -> verified webhook
       -> server read model + RAG
       -> Web/Mobile

Web create
  -> MemoFlow API
  -> GitHub App commit
  -> webhook/read model
  -> Desktop pull
```

## 5. 目标用户路径

- 访客：进入 Desktop → 选择 Vault → 本地浏览与 Obsidian 编辑。
- 在线但未同步：登录 → 选择 Vault → 保持仅本地，或主动连接 GitHub。
- 创建仓库：连接 GitHub → 确认 private repo → 安装 App 到该仓库 → 首次 push。
- 连接已有仓库：授权指定 repo → 选择空目录 clone，或显式处理本地/远端差异。
- Web 快捷创建：Agent 生成完整写入提案 → 用户确认 → Git commit → Desktop pull。
- 访客升级：注册/登录 → 保留原 Vault → 再决定是否连接 GitHub。

## 6. 业务规则

- GitHub 登录不自动授权知识仓库；账密用户同样可以绑定 GitHub。
- 未绑定 GitHub 时不上传 Vault 内容。
- 新建 GitHub 仓库默认 private，GitHub App 安装范围限定到该仓库。
- 本地和远端都非空时不得自动覆盖或静默合并。
- Desktop 不 force push；冲突时暂停并保留双方内容。
- Web 创建按 repository 串行提交，以 request ID 和 commit SHA 幂等。
- 服务端投影可以从 default branch 重建，不是可独立编辑的数据源。
- Agent 写入提案包含 path、title、frontmatter、content 和 reason；写入始终需要用户确认。
- Agent 上下文、Capability、Tool Policy 和 Proposal revision 遵循 ADR-035；不预先规定固定 Vault 指令文件。
- 移除 AI 固定默认目录设置；无指令时由用户确认提议路径。
- 仓库改为 public 时告警并暂停新的 RAG ingestion。

## 7. 断开与导出

- 默认断开是可恢复撤销：停止同步并隐藏连接，但保留服务端可重建投影和索引。
- 勾选“删除 MemoFlow 云端投影与 AI 索引”后，服务端按当前 identity 在单事务中永久清理连接及所有派生数据。
- 本地 Vault、本地 Git 历史和 GitHub repository 在两种模式下都保留。
- 设置页“导出可重新导入的数据”生成 `memoflow.user-data-export` JSON，只用于业务数据 append-create-like
  导入；它不是 Vault/GitHub 导出，也不是服务端持有数据披露。
- GitHub authorization、installation token 和派生投影不得进入可导入文件。权威 Markdown/附件应从 Vault 或 GitHub
  repository 导出/clone。
- Web 的“服务端持有数据披露”生成 `memoflow.server-held-data-disclosure` JSON；它按认证 identity 包含 repository
  connection metadata（含不可重放 installation identifier）、Markdown/附件投影、附件 cache bytes、Webhook delivery、
  Web write ledger 与 AI knowledge index。该 artifact 没有 import route，并明确排除本地 Vault/Git history、GitHub
  repository history、worker lease、数据库内部 retrieval vector 及所有 MemoFlow 管理的可重放授权材料。Markdown、
  frontmatter 和 cache bytes 属于用户仓库内容，按原样进入披露文件。

## 8. 当前差距

除以下已知交付差距外，Repository/Knowledge vNext 的模型迁移尚未开始；不得把 ADR-089~091 的目标态描述成当前代码事实。

- 真实 GitHub App fixture E2E 仍依赖外部凭据与受控 private repository。
- Mobile 尚未接入服务端 GitHub 投影的只读浏览、搜索与预览。
- 统一 Agent Host 的完整 proposal/capability/tool-policy 协议由 ADR-035 和对应 active plan 继续收口。

## 9. 风险点

- GitHub private repository 不是对 GitHub/MemoFlow 服务端不可见的 E2E 加密。
- Git 冲突、仓库体积、大附件和 Git LFS 会增加 Desktop 复杂度。
- GitHub App 撤销、仓库删除/公开、账号限制会影响跨端能力。
- 同时使用 Obsidian Git 插件与 MemoFlow 自动 Git 可能产生 lock 和竞态。
- Agent 读取的知识内容不可信，必须防止路径穿越、命令执行和提示注入越权。
- Web 创建和 Desktop push 并发时必须通过远端 HEAD 和串行提交控制。

## 10. 相关资料

- [ADR-034: 本地 Obsidian Vault 与可选 GitHub 知识仓库](../../architecture/adr/ADR-034-obsidian-vault-repository.md)
- [Knowledge Repository vNext](../knowledge-repository-vnext.md)
- [ADR-089: KnowledgeSpace、Source Binding 与 Health/Observation Boundary](../../architecture/adr/ADR-089-knowledge-space-source-binding-and-health-boundaries.md)
- [ADR-090: Stable KnowledgeDocument Identity](../../architecture/adr/ADR-090-stable-knowledge-document-identity.md)
- [ADR-091: Knowledge Projection、AI Index 与 Operation Boundary](../../architecture/adr/ADR-091-knowledge-projection-index-and-operation-boundaries.md)
- [Knowledge Repository vNext Current System Map](../../analysis/2026-09-08-knowledge-repository-vnext-current-system-map.md)
- [ADR-035: 统一助手与可插拔 Agent Host](../../architecture/adr/ADR-035-unified-assistant-agent-host.md)
- [统一助手与可插拔 Agent Host 实施方案](../../plan/archive/2026-07-17-unified-assistant-agent-host.md)
- [Obsidian Vault 与 GitHub 知识仓库后续优化方案](../../plan/archive/2026-07-16-obsidian-vault-repository-optimization.md)
- [编辑器模块说明](./editor.md)
- [AI 模块说明](./ai.md)
- [资源库模块文件索引](../module-index/repository-files.md)
