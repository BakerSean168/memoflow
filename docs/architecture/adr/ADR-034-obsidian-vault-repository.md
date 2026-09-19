---
tags:
  - adr
  - repository
  - editor
  - obsidian
  - github
description: ADR-034 - 本地 Obsidian Vault、可选 GitHub 仓库同步与多端知识笔记边界
created: 2026-07-16T00:00:00
updated: 2026-07-22T00:00:00
---

# ADR-034: 本地 Obsidian Vault 与可选 GitHub 知识仓库

**状态：** 已采纳  
**日期：** 2026-07-16  
**影响范围：** Authentication、Repository、Editor、AI Knowledge、Desktop、Web、Mobile

> 2026-08-28 补充：GitHub App installation 的 durable intent、Setup Gateway、Web/Desktop completion 与 dev/staging/prod routing 由 [ADR-065](./ADR-065-durable-github-installation-intent-gateway.md) 细化；本 ADR 继续拥有知识事实源、GitHub repository 与多端能力边界。

## 1. 背景

MemoFlow（Memory Flow）需要把用户知识资产接入 AI、目标和行动流程，但不应继续维护一套与 Obsidian 重叠的完整 Markdown 编辑器。用户同时需要三种进入产品的方式：账密账号、GitHub 登录和无需注册的访客；笔记应首先保存在本地，用户需要跨设备和 Web 能力时再绑定 GitHub。

本 ADR 取代以下早期假设：

- 不再强制 GitHub-only 登录。
- 不再把 Desktop 自定义“投影上传 API”作为默认笔记同步协议。
- 不再把 Web 永久限定为只读；绑定 GitHub 后，Web 可以安全地快捷创建新笔记。
- 不再为 AI 笔记维护固定收件箱路径设置。

实现状态（相对本 ADR 目标决策，2026-07-22 对齐代码）：

- **已落地**：Desktop profile-owned 本地 Obsidian Vault（选择/扫描/搜索/预览/`obsidian://` 打开/确认后写入）；GitHub 登录与 GitHub App 知识仓库授权解耦；private 仓库连接、首次对账、Git 同步（禁 force-push、冲突暂停）、webhook 投影、Web 确认后新建笔记、AI 确认写入提案契约；旧数据库 Repository/Folder/Resource CRUD 与 `@memoflow/editor` 运行时已从 host 摘除；用户设置不再保留退役的 in-app editor 偏好分类。
- **仍部分 / 外部阻塞**：真实 OAuth/GitHub fixture E2E 与 Mobile 投影浏览仍需要对应外部凭据/产品覆盖；这些不是当前 Knowledge owner/projection cutover 的未完成 active plan。

本 ADR 保留历史决策与外部验证限制；当前实现状态以 `docs/product/modules/repository.md`、ADR-089~091 与 SYS-3003/SYS-3004 evidence 为准。

## 2. 决策

### 2.1 登录方式

产品保留三种入口：

| 入口          | 身份状态                                 | 本地 Vault | GitHub 同步          | Web 笔记       |
| ------------- | ---------------------------------------- | ---------- | -------------------- | -------------- |
| 账密注册/登录 | MemoFlow 在线账号                        | 支持       | 可后续绑定           | 绑定仓库后可用 |
| GitHub 登录   | MemoFlow 在线账号 + GitHub OAuth binding | 支持       | 仍需单独确认仓库授权 | 绑定仓库后可用 |
| 访客          | Desktop 本地 profile                     | 支持       | 不支持，需先升级账号 | 不支持         |

GitHub 登录与 GitHub 笔记仓库授权必须解耦：

- “使用 GitHub 登录”只完成身份认证，不默认创建仓库或申请私有仓库内容权限。
- “连接 GitHub 知识仓库”是独立、明确的同步授权。
- 账密用户可以连接 GitHub 仓库，不必更换登录方式。
- GitHub 登录用户也可以只使用本地 Vault。
- 访客启用同步前必须先升级为账密或 GitHub 在线账号；升级不得移动或重建本地 Vault。

MemoFlow 仍签发自己的 access/refresh session。GitHub 数字 user ID 是 OAuth 稳定 subject，不能用可变用户名或可能隐藏的邮箱作为唯一身份。

### 2.2 本地与远端事实边界

1. **本地 Obsidian Vault 是 Desktop 上的可写事实源和工作副本。**
2. 未绑定 GitHub 时，所有 Markdown 和附件只存在本地，Desktop 浏览、搜索、预览和 Obsidian 外部编辑完整可用。
3. 绑定后，Vault 成为一个 Git working tree，GitHub private repository 是跨设备共享提交日志和远端副本。
4. 服务端从 GitHub commit/webhook 构建可重建 read model 和 RAG 索引；服务端数据库不是第三个可编辑事实源。
5. Web 创建笔记必须生成 Git commit；不能只写服务端快照后等待回灌。
6. GitHub 同步撤销、离线或故障不得锁住 Desktop 本地 Vault。

### 2.3 GitHub App 与仓库授权

使用 GitHub App，不使用申请广泛 `repo` scope 的普通 OAuth App作为长期仓库通道。

绑定流程：

1. 用户从 Desktop/Web 主动选择“连接 GitHub 知识仓库”。
2. 用户选择创建新的 private repository，或连接已有 private repository。
3. 新建仓库默认 `private: true`，建议名为 `memory-flow-notes`，关闭不必要的 Issues、Projects 和 Wiki。
4. 用户把 GitHub App 安装范围限定到这个仓库。
5. 服务端保存 GitHub user/repository/installation ID，不以仓库名作为稳定主键。
6. 长期仓库操作使用短期 installation token；用户 access token 只在确需代表用户执行创建/授权时使用并安全轮换。

仓库初始化至少包含：

```text
README.md
.gitignore
.memory-flow/repository.json
```

默认忽略 `.obsidian/workspace.json`、`.obsidian/workspaces.json`、回收站、系统临时文件；插件目录和插件数据首期默认不提交，避免隐私或凭据泄漏。

### 2.4 Desktop Git 同步

Desktop 对 Vault 文件变化去抖并批量提交，不按每次按键 commit：

```text
Obsidian/Vault change
  -> file stability check
  -> Git working tree
  -> batched local commit
  -> fetch + pull/rebase
  -> push GitHub
```

要求：

- 断网时本地 commit 充当可靠待上传队列，恢复后继续 push。
- push 前获取远端最新 HEAD；非 fast-forward 时先安全 pull/rebase。
- 自动合并失败时停止同步并显示冲突，不静默覆盖或丢弃任一版本。
- 应用启动、网络恢复、系统唤醒、手动同步和退出前均可触发同步检查。
- 同一 Vault 不建议同时由 MemoFlow 和 Obsidian Git 社区插件管理自动同步；检测 Git lock 或并发操作时退让并提示。
- Git 令牌不得出现在命令行参数、日志或仓库 remote URL 中。

### 2.5 Desktop 与 Obsidian 协作

Desktop 笔记详情以预览、关系和 AI 上下文为主，重编辑交给 Obsidian。优先使用：

```text
obsidian://open?path=<percent-encoded-absolute-file-path>
```

必要时回退到 `vault + file`。Obsidian CLI 只作为可选健康检查、打开、搜索或反链增强，不是基础依赖。协议不可用时提供“在文件管理器中显示”和“复制路径”。本机绝对路径不得上传。

### 2.6 Web/Mobile 能力

未连接 GitHub 知识仓库时，Web/Mobile 不存在可访问的笔记远端副本，应提示用户在 Desktop 连接同步，而不是展示虚假的空知识库。

连接后：

| 能力                  | Web      | Mobile     | Desktop/Obsidian |
| --------------------- | -------- | ---------- | ---------------- |
| 浏览、搜索、预览、RAG | 支持     | 支持       | 支持             |
| 快捷创建新笔记        | 支持     | 可后续支持 | 支持             |
| AI 草稿确认入库       | 支持     | 可后续支持 | 支持             |
| 编辑已有笔记          | 后续评估 | 不支持     | Obsidian 主入口  |
| 移动、重命名、删除    | 不支持   | 不支持     | Obsidian/Git     |
| 冲突解决              | 不支持   | 不支持     | Desktop 明确处理 |

Web 快捷创建必须：

- 通过 MemoFlow API 调用 GitHub App，不把 GitHub token 发给浏览器。
- 创建唯一的新文件，避免与 Desktop 同名冲突。
- 由服务端按仓库串行提交，并使用 request ID 和 Git commit SHA 保证幂等。
- commit 成功后由 webhook/read model 更新 Web 与 RAG。
- 首期不开放已有笔记全文编辑，避免同时引入 base SHA、三方合并和冲突 UI。

### 2.7 服务端投影与 RAG

```text
GitHub push
  -> verified GitHub App webhook
  -> background repository ingestion
  -> changed Markdown/attachments
  -> server read model
  -> link graph + RAG index
  -> Web/Mobile API
```

- webhook 以 delivery ID 和 commit SHA 幂等。
- 服务端按 before/after commit 获取变化文件；定期对账 default branch HEAD，修复 webhook 漏失。
- `contentHash` 未变化时复用索引；删除 commit 必须清理向量和引用缓存。
- Web 正文更新不等待 RAG；索引状态独立显示 `pending/indexed/failed`。
- 仓库改名、归档、删除、App 卸载或授权缩减必须形成明确产品状态。
- 仓库被改为 public 时立即告警并暂停新的知识索引；未经用户确认不得擅自改回 private。

### 2.8 AI 笔记写入采用提案与确认

移除“AI 生成笔记默认目录”设置和固定 `00-inbox/` 约定。Agent 根据未来 Agent runtime 提供的上下文、当前知识库结构和用户当前指令生成写入提案：

```text
path
title
frontmatter
content
reason
```

用户在 Desktop/Web 明确确认路径与内容后，才允许写文件或创建 Git commit。

约束：

- 本 ADR 不预先规定 Agent 上下文保存在文件、设置、MCP、数据库还是对话中，也不规定固定文件名、目录继承或版本字段。
- 所有路径必须规范化并保持在 Vault 根目录内，禁止绝对路径和 `..` 穿越。
- 上下文不足或规则冲突时，Agent 应让用户选择或补充信息；不使用隐藏的固定目录兜底。
- 所有写入必须展示最终 `path/title/frontmatter/content/reason`，并在用户确认后才允许 Desktop 写文件或 Web 创建 Git commit。
- Agent 上下文不能覆盖系统权限、安全策略和用户确认要求，也不能触发任意命令、访问 Vault 外路径或扩大数据授权范围。
- Agent runtime、上下文注入、Capability、Tool Policy、Proposal revision 和跨端执行边界由 [ADR-035](./ADR-035-unified-assistant-agent-host.md) 统一规定；本 ADR 只保留知识仓库特有的路径、Vault 和 Git commit 约束。

### 2.9 Markdown 安全渲染

Web/Mobile 自行渲染 GitHub read model，不调用 Obsidian 插件 API。首期支持 CommonMark、GFM、properties、wiki link、heading/block link、附件/笔记 embed、callout、highlight 和 comments；Dataview、Tasks 查询、Excalidraw、Canvas、主题和插件代码不执行。

所有输出必须经过严格 sanitizer。默认不执行任意原始 HTML；禁止脚本、事件属性、危险 URL、任意 iframe、Vault CSS 和插件 JavaScript。附件通过受认证 URL 加载，不能暴露本机路径或永久公开地址。当前 `EditorPreview.vue` 的 `v-html + html: true` 必须在真实仓库内容进入 Web 前收口。

### 2.10 断开、云端保留与导出边界

断开 GitHub 知识仓库必须让用户明确选择服务端派生数据的处理方式：

- 默认断开只撤销同步连接，保留可从 GitHub default branch 重建的笔记投影、附件投影与短期缓存、Webhook
  处理记录、Web 写入幂等流水和 RAG 索引，以便重新连接后继续使用。
- 用户明确选择“删除云端数据”时，服务端必须再次校验 `identityId + connectionId` ownership，并在同一数据库事务内
  删除独立 AI 索引和连接记录；连接外键级联统一清理笔记/附件投影、附件缓存、Webhook delivery 和 write ledger。
- 两种模式都不得删除或改写 Desktop 本地 Vault、本地 Git 历史或 GitHub repository。
- 清理失败必须整体失败，不能只删除 connection cascade 而遗留无外键的 AI 索引，也不能只删索引后保留半套连接数据。

导出语义分为两个互不兼容的产品契约：

1. `memoflow.user-data-export` 是可重新导入的业务数据备份，采用 append-create-like 语义。其 `repository` section
   只包含旧 Repository/Folder/Resource DTO，不包含本地 Vault 文件、GitHub App 授权、GitHub 派生投影、附件缓存或 RAG
   索引。权威知识文件应直接从本地 Vault 或 GitHub repository 导出/clone。
2. `memoflow.server-held-data-disclosure` 是独立、明确不可导入的服务端持有数据披露。它按当前认证 identity 披露
   GitHub connection metadata（包括不可重放的 installation identifier）、Markdown/附件投影、附件缓存字节、Webhook
   delivery、Web 写入幂等流水和 AI knowledge index。它不包含本地 Vault、本地 Git/GitHub repository 历史、worker
   lease 或数据库内部 retrieval vector，也不得包含 OAuth token、installation access token、GitHub App private key 等任何
   MemoFlow 管理的可重放授权材料。用户写入 Markdown/frontmatter/附件的内容按原样披露；若用户自行把 secret 写入仓库，
   它仍属于被披露的 repository content。

第二类文件只通过独立的受认证服务端 endpoint 生成；Desktop 本地 IPC export 不得伪装成服务端披露，普通 import
入口必须因 artifact kind 不匹配而拒绝它。

UI 不得把第一类文件称为“全部数据导出”，也不得暗示它是完整的服务端数据披露。

## 3. 不采用的方案

### 3.1 强制 GitHub-only 登录

不采用。它会排除无 GitHub 账号的用户，并把本地知识管理不必要地绑定到代码托管身份。

### 3.2 普通 OAuth App 申请 `repo` scope

不采用。该 scope 对用户全部可访问私有仓库权限过宽。GitHub App 的细粒度权限和单仓库安装更符合最小授权原则。

### 3.3 Desktop 自定义正文投影上传作为默认同步

不采用。Git 已经提供本地提交、增量传输、版本历史和多设备同步基础；平行维护文件 Outbox 会重复建设且产生双同步语义。

### 3.4 Web 只写服务端数据库

不采用。Web 写入必须先成为 Git commit，否则服务端会变成与 Vault/GitHub 竞争的第二写源。

### 3.5 固定 AI 收件箱路径

不采用。路径属于用户知识组织策略，应由 Agent 结合可用上下文提出并由用户逐次确认，不应在设置页维护另一套隐式规则。

## 4. 影响与风险

### 正面影响

- 同时支持普通账号、GitHub 用户和无需注册的本地访客。
- 本地优先，不绑定 GitHub 也能完整使用 Desktop 笔记。
- GitHub 提供版本历史、远端备份和跨设备基础。
- Web 创建和 AI 入库统一为可审计 Git commit。
- 移除自定义文件上传协议与 AI 固定路径设置。

### 需要承担的成本

- 认证入口仍有三种，产品复杂度不会像 GitHub-only 那样大幅下降。
- 需持续维护 GitHub App、安装授权、短期 token、webhook 和 Git 冲突状态（主体已实现；fixture E2E 仍外部阻塞）。
- private repository 不是对 GitHub 或 MemoFlow 服务端不可见的端到端加密，必须明确告知。
- GitHub 故障、账号受限、仓库删除或授权撤销会影响跨端能力，但不能影响本地 Vault。
- 大附件、仓库体积、Git LFS 和多设备冲突需要单独约束。

## 5. 验收标准

- 账密、GitHub 登录和访客三种入口均可建立正确 profile。
- GitHub 登录不会自动申请仓库内容权限或创建仓库。
- 账密用户和 GitHub 用户均可独立绑定一个 private GitHub 知识仓库。
- 访客本地使用不上传数据，升级账号后 Vault 路径与内容保持不变。
- 未绑定 GitHub 时 Desktop 本地笔记完整可用，Web 明确提示未连接。
- 绑定后 Desktop commit/pull/push、webhook、read model 和 RAG 最终一致。
- Web 可以创建唯一新笔记并产生 Git commit，不能无冲突控制地编辑已有笔记。
- Git 冲突不会被静默覆盖，用户可以在 Desktop 看到并处理。
- AI 没有固定目录设置，写入前必须展示完整提案并获得用户确认。
- 恶意 Markdown 或 Agent 上下文不能执行脚本、逃逸 Vault、扩大授权或绕过确认。

## 6. 相关资料

- [Obsidian Vault 与 GitHub 知识仓库后续优化方案](../../plan/archive/2026-07-16-obsidian-vault-repository-optimization.md)
- [ADR-035: 统一助手与可插拔 Agent Host](./ADR-035-unified-assistant-agent-host.md)
- [资源库模块说明](../../product/modules/repository.md)
- [编辑器模块说明](../../product/modules/editor.md)
- [Obsidian URI](https://obsidian.md/help/uri)
- [Obsidian CLI](https://obsidian.md/help/cli)
- [GitHub App 与 OAuth App 的区别](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)
- [GitHub OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
- [Create a repository for the authenticated user](https://docs.github.com/en/rest/repos/repos#create-a-repository-for-the-authenticated-user)
