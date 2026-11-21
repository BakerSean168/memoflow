---
tags:
  - product
  - module
  - repository
description: Obsidian 知识连接、Desktop 本地确认写入与 Web 只读上下文
created: 2026-06-02T00:00:00
updated: 2026-11-21T00:00:00+08:00
---

# 知识模块

## 定位与边界

知识模块连接用户已有的 Obsidian/Markdown 资产，为 MemoFlow 对话与业务提供上下文，并在 Desktop 完成确认后的本地交付。笔记阅读、日常编辑和文件管理交给 Obsidian，Git 同步交给用户选择的外部工具。

当前权威决策是 [ADR-126](../../decisions/ADR-126-obsidian-knowledge-connection-and-read-only-web.md)。它取代旧方案中的内置文件工作台、Desktop Git 同步和 Web 创建笔记。

| 能力               | Desktop                                               | Web                                    |
| ------------------ | ----------------------------------------------------- | -------------------------------------- |
| 连接知识源         | 选择本地 Vault 文件夹，按 Profile 持有                | 授权已有 GitHub 私有仓库，只读默认分支 |
| 创建笔记           | 用户审核、确认后写入本地 Vault，保留幂等收据          | 不允许，API/AI/workflow 同样禁止       |
| 编辑与管理现有笔记 | 在 Obsidian 中打开                                    | 提供 GitHub 原文入口；MemoFlow 不修改  |
| `@` 上下文         | 查询本地笔记，包括无 MemoFlow 元数据的普通 Markdown   | 查询服务端已有投影，包括普通 Markdown  |
| 同步               | Obsidian Sync、Obsidian Git 或外部 Git 工具由用户配置 | 读取外部工具已推送到 GitHub 的内容     |

## 页面与连接状态

“知识”业务页面直接管理连接；Settings 不再重复展示知识仓库。旧设置深链和 GitHub callback 参数迁移到知识页面。

Desktop 展示当前 Vault 的名称、路径、文件系统健康、打开 Obsidian、重新选择和断开操作。未连接显示中性引导；已选路径 Missing/Unreadable 时保留原绑定并提示检查，不把来源丢失显示成从未连接。

“MemoFlow 写入记录”只展示本地 confirmed-write ledger 对应、仍存在于当前 Vault 的笔记。改名后通过稳定文档 ID 解析现存路径。未保存草稿由原会话持有，用户回到会话继续审核；页面不会伪造待审核总数。

Web 展示仓库、实际默认分支、投影状态、刷新连接状态和断开操作。未配置 GitHub App 是中性能力状态，普通网络/认证故障仍显示失败反馈。安装流程支持回调、轮询、取消等待和失败重试；显式回调优先于旧 sessionStorage intent。

## 上下文与身份

动态补全按输入查询来源，避免只筛选预加载的最近列表。临时引用包含来源类型、绑定、相对路径与内容 hash。宿主在读取时校验归属和版本；变化后要求用户重新选择。客户端的标签仅用于展示，不能替代真实正文或授权。

普通 Markdown 无须补写 `memoflow_id`。Goal/Task 持久关联仍遵循 [ADR-090](../../decisions/ADR-090-stable-knowledge-document-identity.md)，使用稳定 `KnowledgeDocumentId`，不得把路径或临时上下文 ID 当作关系 ID。

Mastra 和 Native Agent 都能读取显式选中的普通笔记；Native 使用 MCP 权限和审计边界，取消读取保持取消终态。所有知识正文按不可信参考资料处理。

## 服务端只读

API 不装配知识写 persistence；Web 不执行 create/adopt、Git commit、Desktop token 颁发、HEAD 确认或旧正文回放。Goal Plan 含知识新建时，在创建其他对象前拒绝；关联已有文档继续支持。旧 capture 草稿可查看和取消，不能继续落库。

GitHub App token 显式降为 Contents/Metadata read。GitHub 登录和知识源安装授权仍分开。连接资格要求 private、非 archived/disabled、installation 可用且能够读取；无需 push 权限。

Webhook 验签、delivery 去重、连接 lease 和投影引擎保持有效。读取使用实际默认分支与当前 HEAD，历史同步 fence 不阻断读取。满足连续版本前提才使用增量；分支变化、乱序、缺失事件或 force push 从当前 HEAD 重建，避免旧内容覆盖当前投影。历史写入 ledger 不再向投影注入正文。

## 迁移与数据

升级后 Desktop 不启动任何知识 Git watcher、scheduler、resume sync 或退出提交。它不会删除 `.git`、重置 Git 配置、丢弃未提交内容、修改远端或解除现有用户文件。

`LocalVaultBinding` 继续由稳定 Desktop Profile 持有，filesystem health 独立观察。云端 `KnowledgeRemoteBinding`、observation、checkpoint、稳定身份注册表与历史 ledger 保留。旧 local/remote pairing 不会自动变成同步关系，Desktop 没有远端 fallback。

默认断开云端来源保留历史派生数据；现有服务端显式清理操作与数据披露能力保持原有身份校验。断开和清理均不删除用户 Vault、Git 历史或 GitHub 仓库。Repository 不加入可导入 portable backup；源文件应从 Vault/GitHub 导出，GitHub 授权不得进入备份。服务端持有数据披露继续包含当前用户的来源元数据、稳定身份、投影、附件缓存、Webhook/历史写入收据及 AI 索引，不含可重放凭据。

## 相关决策

- [ADR-126：Obsidian 连接与 Web 只读](../../decisions/ADR-126-obsidian-knowledge-connection-and-read-only-web.md)
- [ADR-089：来源绑定与健康观察](../../decisions/ADR-089-knowledge-space-source-binding-and-health-boundaries.md)
- [ADR-090：稳定文档身份](../../decisions/ADR-090-stable-knowledge-document-identity.md)
- [ADR-091：投影与 AI 索引 owner](../../decisions/ADR-091-knowledge-projection-index-and-operation-boundaries.md)
- [ADR-124：本地 MCP 宿主与云端边界](../../decisions/ADR-124-local-mcp-host-credentials-and-cloud-boundary.md)
