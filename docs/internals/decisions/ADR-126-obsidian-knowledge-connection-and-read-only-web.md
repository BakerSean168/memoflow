---
tags:
  - adr
  - knowledge
  - obsidian
  - desktop
  - web
description: 知识模块作为 Obsidian 连接和上下文边界，Desktop 本地确认写入，Web 严格只读
created: 2026-11-21T00:00:00+08:00
updated: 2026-11-21T00:00:00+08:00
---

# ADR-126: Obsidian Knowledge Connection and Read-only Web

**状态：** 已采纳（[#1051](https://github.com/BakerSean168/memoflow/issues/1051)）

**日期：** 2026-11-21

**取代范围：** ADR-034 的 MemoFlow 笔记浏览/预览、Desktop 内置 Git 与 Web confirmed-create；ADR-065 的 Desktop 安装入口与 Contents write 要求；ADR-089/091 中依赖 Desktop 同步 fence 的云端读取和写入回放。ADR-090 的稳定文档身份和现有历史数据保留。

## Context

Obsidian 是笔记阅读、编辑和文件管理的核心。MemoFlow 重复实现文件浏览和 Git 同步，会让用户难以理解本地与远端谁负责内容，且可能与 Obsidian Git 或外部 Git 工具竞争。用户进一步明确：Web 不创建或编辑知识笔记，只有 Desktop 能交付本地写入。

## Decision

### 1. 一个宿主只有一个知识来源职责

| 宿主    | 来源                          | MemoFlow 允许的操作                                               | 内容编辑与同步                                            |
| ------- | ----------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| Desktop | 当前 Profile 选择的本地 Vault | 连接、健康检查、只读上下文查询、Obsidian 跳转、确认后的新笔记写入 | 日常编辑和文件管理交给 Obsidian；同步由用户的外部工具负责 |
| Web/API | GitHub 私有仓库默认分支投影   | 授权连接、断开、读取、上下文引用、派生投影刷新                    | 不创建、编辑、adopt 元数据或提交 Git 内容                 |

Desktop 不装配远端连接、首次对账、Git worker、自动提交、fetch/pull/rebase/push、resume/exit flush。升级不修改用户 Git 配置、历史、未提交变更或远端。旧服务端 binding 和收据可保留，但不能成为 Desktop 的隐式 fallback。

Web 的只读是宿主能力边界，不依赖按钮、请求 surface 或客户端标识。笔记写入/adoption/token/head-confirmation/reconciliation/replay HTTP 入口退出路由，application facade 对旧调用拒绝。API AI 不装配 knowledge persistence；`knowledge.capture` 新建与继续写入拒绝，旧草稿仍可取消。Goal Plan 含 create-note 时必须在任何 Goal/Task/label mutation 前拒绝；linkExisting 继续可用。

GitHub installation token 显式请求 `contents: read` 和 `metadata: read`，即使旧 App installation 授予 write，也不继承写权限。App 管理后台的授权声明由部署者单独降权；代码不会冒充已修改外部 App 配置。

### 2. 知识页面负责连接与交付信息

知识页面移除全文预览、正文搜索框、文件树和文件管理，Settings 不再有独立知识仓库分类。旧 `/settings?tab=repository` 保留为到 `/repository` 的重定向，并保留安装回调参数。

Desktop 页面展示绑定与健康、打开 Obsidian、重新选择/断开，以及当前 Vault 的 MemoFlow 成功写入记录。历史记录来自 confirmed-write ledger，按稳定文档 ID 解析现存路径，不能把整个 Vault 的最近文件冒充为 MemoFlow 写入。未保存草稿继续由原会话的审核流程持有。

Web 页面展示只读仓库连接与投影状态。已有笔记深链解析后提供 GitHub 原文链接，不重新引入正文预览。未连接或部署尚未配置 GitHub App 是中性可用性状态；认证失败、网络失败和已连接来源失效有各自可操作反馈。

### 3. 临时上下文与稳定业务关系分开

`@` 在用户输入期间查询整个知识来源，不在预载的最近二十条中筛选。Desktop 在一次补全交互内复用只读扫描，关闭后释放；Web 查询服务端投影，查询变化取消旧请求，过期响应不能覆盖新结果。

普通 Markdown 无需 `memoflow_id` 即可作为上下文。临时引用包含：

- `kind`: `local_vault` 或 `github_projection`；
- 宿主绑定 `bindingId`；
- 源内 `relativePath`；
- 选择时内容的 SHA-256 `contentHash`。

宿主重新验证来源归属、绑定有效性、路径与版本后读取正文。客户端不能提交身份或正文代替真实来源；相对路径不是写权限。文件变化、移动、删除或切换来源后，引用失效，提示重新选择。普通文件的历史 Obsidian 链接同时携带绑定 ID，不能在新 Vault 中误打开同名文件。

Mastra 在调用模型前装配知识证据；Native Agent 通过同一 MCP 知识读取权限、审计和运行存活边界装配，明确 deny 不能被显式 @ 绕过。知识正文仍是非可信资料，不变成系统指令。

Goal/Task 的持久关系继续要求 ADR-090 稳定身份；临时引用不转换成持久业务关系，扫描不会自动 adopt 或改写 frontmatter。

### 4. 云端投影跟随当前默认分支

历史 `RemoteHistoryFence` 不再决定只读来源是否可用。已验签 webhook 使用 payload 默认分支筛选入队；worker 再读取 live repository/HEAD。

只有同分支、checkpoint Ready、checkpoint SHA 等于 delivery before SHA，且 delivery after SHA 等于当前 HEAD 时，才应用增量。分支变化、漏事件、乱序、force push 使用当前 HEAD 的完整快照；同 SHA 换分支也必须更新 checkpoint。已经投影到当前分支和 HEAD 的旧 delivery 只确认完成。

历史 write ledger 的 Markdown payload 不再自动或手动注入投影。收据可查询，内容恢复始终从当前远端来源重建，避免旧分支正文复活。

## Consequences

- 本地尚未由外部同步工具推送的更改不会出现在 Web；页面明确表达这一边界。
- Desktop 可离线使用本地 Vault，云端连接故障不影响本地交付。
- 既有 Markdown、Git 仓库、历史收据和持久关系不做破坏性迁移。
- MemoFlow 继续承担安全读取、上下文编排、草稿审核和幂等交付；Obsidian 承担笔记工作台。
- 本决策不扩展 Mobile 知识能力，也不新增 AI 自动写入权限。
