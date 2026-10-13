---
tags: [plan, ai, chat]
description: 会话创建后的侧栏即时同步与列表刷新竞态修复
created: 2026-10-11T00:00:00Z
updated: 2026-10-11T00:00:00Z
---

# Conversation list sync

创建成功后立即按 ID 合并权威 DTO，不等待推理结束。普通聊天、工作流和本地 Agent 共用此同步路径。活动时间及标题改变即时更新列表；异步加载不得覆盖更新、更晚的加载或删除，也不能因分页/请求失败重置选中会话。核对服务端活动时间更新路径，避免本地排序和刷新结果不一致。

先补最近 composable 回归测试，再修复并运行 UI/运行时必要测试、类型检查、lint、治理及真实浏览器验收。保留当前未提交的 Provider、模型切换和错误提示修复；不添加轮询或另一套聊天存储。

## 完成与验证

- 根因：ensureConversationCreated 仅更新选中 ID，没有合并到响应式列表；流结束只刷新用量。列表加载还会用失败源的空数组覆盖已有内容，并误把第一页中缺少当前会话当成删除。
- 普通聊天、工作流及本地 Agent 使用共同的按 ID 合并路径。创建接口返回已持久化 DTO 后立即展示；即使用户在创建期间取消或切换页面，已成功保存的会话仍可在侧栏找到，而当前选择不被迟到结果改写。
- 接受消息时本地更新活动时间；流结束（含失败、取消）异步校准列表。最新加载代次才可提交；未校准的本地变化及删除标记防止旧请求覆盖新建、标题或删除结果。某一来源失败保留该来源快照。分页列表不再重置当前会话。
- 标题修改成功后直接同步服务返回的 DTO，再校准列表。修改失败不写入错误侧栏标题，并在仍查看该会话时恢复标题；迟到回调按 DTO ID 更新对应会话。
- 服务端新增 owner-scoped recordActivity。Prisma/PowerSync 原子更新 updatedAt，限制身份、未删除及时间递增；不读改写整条记录。Mastra 普通聊天和工作流 start/startDetached/resume 接入，API/Desktop composition 均绑定真实仓库。活动投影失败只记录安全警告，不让回复失败。本地 Agent 仍由自己的会话 owner 管理持久化活动时间。
- UI 回归覆盖创建时推理仍未完成、旧列表返回、请求失败、连续创建、标题同步、工作流、本地 Agent、取消及删除不能复活。核心 session 32 项通过；另有生命周期与 helper 测试通过。
- 40 项真实 Mastra 运行时测试通过，包括活动投影失败仍能回复和下一轮模型切换；内存仓库和真实 SQLite 测试覆盖身份隔离、时间单调、标题保留及已删除会话。API/Desktop compose 测试通过。
- 真实浏览器验收通过：隔离 PostgreSQL + API/Web + Chromium + 本地 HTTPS fixture。第一轮推理请求被暂时拦住时，左侧已出现新会话；释放后两轮跨模型/实例保持同一 conversationId，第二轮服务端 updatedAt 大于第一轮。先前的错误提示和 Composer 布局断言继续通过。
- ai/app-vue/api/desktop 类型检查及改动文件 lint、格式、diff 检查通过。Dev API 已重新加载并通过 healthz。商业模型未主动调用，真实用户数据未修改；隔离 E2E 数据库在 runner finally 中删除。

证据：[回复前已出现会话](../../analysis/evidence/2026-10-11-conversation-list-sync/conversation-created-before-reply.png)。T3 preview 因 AppArmor 不可用，使用仓库已有 Playwright 流程。没有单独运行打包 Desktop UI。

当前 main 工作树未提交；没有 PR、推送或 Staging/生产部署。
