---
tags:
  - product
  - module
  - editor
description: 编辑器模块退役后的安全预览、Obsidian 外部编辑与 Web 快捷创建边界
created: 2026-06-02T00:00:00
updated: 2026-07-22T00:00:00
---

# 编辑器模块说明

> **ADR-111 cutover policy (2026-09-09):** 当前没有需要保留的 MemoFlow 旧业务数据，也不要求兼容旧客户端/旧备份。本文历史推演中仅为旧数据保存设计的 migration/backfill/compatibility window 不再执行；目标模型和真实行为不变量继续有效。实施采用 direct canonical cutover + old-surface deletion + reset/reseed。

> **2026-09-09 retirement closure:** ADR-107 决定不再存在 vNext Editor bounded context；当前 `editor_*` Prisma/PowerSync/Data Portability 只属于待直接删除的 residue；ADR-111 明确无需兼容导入。

## 1. 功能定位

根据 [ADR-034](../../architecture/adr/ADR-034-obsidian-vault-repository.md)，编辑器职责已经收缩为安全预览、知识关系、Web 新笔记确认和 Obsidian 外部编辑。数据库 Resource 不再作为跨端 Markdown 编辑真值源。

## 2. 当前实现

- Web `/repository` 只挂载 GitHub default-branch 投影工作区；不存在 `/note/:id` 已有笔记编辑路由。
- Desktop `/repository` 只挂载本地 Vault 浏览、安全预览和 Obsidian 打开入口；主进程不再注册 Editor Electron runtime。
- API host 不再注册 Editor API module，也不挂载旧 Repository/Folder/Resource CRUD；Desktop Repository IPC 只保留本地 Vault 与 GitHub knowledge connection/sync 能力。
- Mobile 已移除数据库 Repository、文件夹和 note editor 路由，等待后续基于服务端投影实现只读能力。
- 旧 Repository/Folder/Resource 与 Editor workspace 数据仅为可重新导入业务数据备份保留，不再构成运行时编辑通道。
- 服务端持有数据披露（`memoflow.server-held-data-disclosure`）与业务备份分离：Web 可下、Desktop 明确不支持、不可导入；`editor_*` portable 备份只走 `memoflow.user-data-export` 导入通道。
- `@memoflow/editor` 包与 `packages/app-vue/src/modules/editor` 已删除；知识呈现入口在 repository 工作区与 `safe-markdown` 工具。
- app-vue 顶层 `editor` locale 与设置页退役 Editor 分组文案已删除；用户 preferences 中残留的 `editor` schema 也直接删除，不再保留 portable 兼容。
- Web 与 Desktop 预览统一使用关闭原始 HTML 并经过 sanitizer 的安全 Markdown 渲染边界。

## 3. 已采纳目标态

### 保留

- Markdown 安全预览、properties、内部链接、嵌入和附件。
- 反链、链接图、搜索命中和 AI 引用跳转。
- Desktop AI/普通新笔记写入前的内容与路径确认。
- Web 新笔记和 AI 草稿的 path/title/frontmatter/content 确认界面。

### 收缩或退役

- Desktop 通用重编辑、自保存、多标签和分屏工作区。
- Web 已有笔记全文编辑与保存。
- 与 Vault/Git 重复的上传、批量导入和自包含导出。
- AI 固定默认目录设置。

### Desktop 主操作

使用经过编码的 `obsidian://open?path=<absolute-path>`，必要时回退到 `vault + file`。Obsidian CLI 只作为可选增强；协议不可用时提供“在文件管理器中显示”和“复制路径”。

### Web 创建

Web 不直接修改 read model。用户确认新笔记后，Repository 服务通过 GitHub App 创建唯一文件和 commit。已有文件编辑等需要 base commit/blob SHA 与冲突 UI 的能力延期。

## 4. 业务规则

- Editor 不直接管理 GitHub token 或 Git 操作，通过 Repository port 协作。
- 未连接 GitHub 的账号和访客不在 Web 展示笔记工作区。
- Web 新建必须基于用户确认的完整 Agent 写入提案创建 Git commit。
- Agent 上下文不能关闭确认、执行代码、扩大授权或允许 Vault 外路径。
- Markdown 输出必须经过 sanitizer；附件使用受认证 URL。
- Web/Mobile 不执行 Dataview、Tasks 查询、主题、CSS snippets 或社区插件代码。

## 5. 当前差距

- Mobile 尚未实现基于服务端 GitHub 投影的浏览、搜索和预览。
- 统一 Agent Host 的完整 Capability、Context、Tool Policy 与 Proposal contract 由 ADR-035 及对应 active plan 继续收口。
- 真实 GitHub fixture E2E 与完整 Web/Desktop prod-like 验收仍受外部凭据和当前 Docker 存储容量限制。

## 6. 风险点

- Web 和 Desktop 同时创建或未来编辑时存在 Git HEAD 竞争。
- 原始 HTML、危险 URL、SVG/iframe 和递归嵌入可能造成 XSS。
- Obsidian 插件语法无法在独立 Web renderer 中完全复刻。
- 删除旧编辑器前必须保留路径/内容确认、预览和引用跳转能力。

## 7. 相关资料

- [ADR-034: 本地 Obsidian Vault 与可选 GitHub 知识仓库](../../architecture/adr/ADR-034-obsidian-vault-repository.md)
- [Obsidian Vault 与 GitHub 知识仓库后续优化方案](../../plan/archive/2026-07-16-obsidian-vault-repository-optimization.md)
- [资源库模块说明](./repository.md)
- [编辑器模块文件索引](../module-index/editor-files.md)
