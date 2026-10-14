---
tags: [plan, acceptance, ai, goal, events]
status: in-progress
created: 2026-10-14T00:00:00Z
updated: 2026-10-14T00:00:00Z
description: S0–S7 接管审计、当前候选验收矩阵和交付证据
---

# 最终接管审计

接管基线 `20b4c81a440`，PR #451 的接管时远端 HEAD 为 `18210ad0f9f`。
历史日志不能证明最终候选通过；本轮证据保存在 `reports/s0s7-final/`，正式容器报告在
`reports/local-deploy-validation/`。报告为本地验收产物，不提交原始日志、认证数据或浏览器 trace。
候选身份由官方报告 `latest.json.headSha` 和 browser evidence 的 `headRevision` 绑定。

## 实施矩阵

| 阶段 | 源码审计                                                         | 当前验收状态                                           |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| S0   | 原生 detach、capability/epoch 失效、pending owner 防重复已实现   | 已有定向测试，最终候选工程验收待完成                   |
| S1   | 安全错误分类、单处中断、租约失权冻结并重新核验已实现             | 已有定向测试；Desktop 产品场景待实际执行               |
| S2   | 当前人工草稿的新 Run、revision 和新 lease、防迟到响应已实现      | 已有定向测试，最终候选工程验收待完成                   |
| S3   | PG trigger/outbox 提交后排序、LibSQL 同事务事件及 SSE/IPC 已实现 | 当前候选真实持久化与 HTTP/IPC 验收待执行               |
| S4   | Goal 增量投影、共享订阅、游标恢复及三处业务轮询移除已实现        | 本轮恢复范围 59/59；完整工程与浏览器验收待完成         |
| S5   | Attention 事务事件、revision/seenRevision 和轮询移除已实现       | 本轮修复严格校准与合并并发读取；真实存储验收待执行     |
| S6   | Conversation 版本投影、删除 tombstone、双 BrowserContext 已实现  | 本轮修复水位竞态和有界恢复；完整浏览器验收待完成       |
| S7   | 身份作用域、IndexedDB CAS、稳定 createId、owner 回执核验已实现   | 本轮真实 A→B→A 登录恢复已通过；Electron 重启场景待执行 |

没有发现尚未实施的切片。源码存在不等于正式验收完成。

## A01–A23 证据矩阵

下表列出当前实现及应复核的仓库测试；“待最终执行”不计为本轮 PASS。

| 验收项 | 实现 / 仓库测试                                                    | 当前结果                               |
| ------ | ------------------------------------------------------------------ | -------------------------------------- |
| A01    | GoalDialog / useAIGoalWorkflow：failed 后保留 mounted 人工字段     | 待最终执行                             |
| A02    | 原生 detach 后直接 owner Save/Cancel，不调旧 workflow              | 待最终执行                             |
| A03    | capability 撤销、projection epoch、旧 async 响应拒绝               | 待最终执行                             |
| A04    | 主动 handoff 的 owner Save + approve                               | 待最终执行                             |
| A05    | busy/pending/submitted/receipt 冻结及 owner 读回                   | 待最终执行                             |
| A06    | authority/lease release 与 TTL；未实测远端 release 故障            | 部分证据，网络故障验收缺口             |
| A07    | AIMessagePanel / useAIGoalWorkflow：稳定单处中断消息               | 待最终执行                             |
| A08    | ai-public-failure / provider mapping / error.spec：安全分类与 hint | 待最终执行                             |
| A09    | sourceDraft、新 Run、当前 draft revision、旧 Run 禁止 resume       | 待最终执行                             |
| A10    | pending owner / prior receipt / stable intention 防重复            | 待最终执行                             |
| A11    | workspace-sse.http、PG/LibSQL、IPC 身份过滤；浏览器 A→B→A          | 登录隔离已通过，其他待最终执行         |
| A12    | PG rollback/late commit、LibSQL rollback、HTTP 独立进程写入        | 待最终执行                             |
| A13    | workflow snapshot trigger 与安全投影 persistence/runtime tests     | 待最终执行                             |
| A14    | Goal/Conversation/Attention 旧版本、乱序、迟到 ACK 回归            | 恢复联动范围通过，其他待最终执行       |
| A15    | 100 条分页、晚提交、初始水位；512 项后新边界压缩元数据             | 本轮相关恢复回归通过，持久化待最终执行 |
| A16    | reset 丢旧 cursor、拒绝不 ACK、保留失败/late-join listener         | 本轮相关恢复回归通过                   |
| A17    | Goal/Attention 30 秒业务请求预算，Goal 字段事件直接投影            | 定向回归通过，完整浏览器待完成         |
| A18    | Conversation/Attention 合并并发校准，新 ready 后权威快照           | 定向回归通过，浏览器请求计数待完成     |
| A19    | 服务端版本、删除 tombstone、双独立认证浏览器请求计数               | 待完整浏览器执行                       |
| A20    | strict Workspace contracts、HTTP/IPC 相同事件、ACK 和 lease 隔离   | 待最终执行                             |
| A21    | Web 刷新/真实重新登录、Electron 重启恢复；不提前 create            | Web 重新登录通过，其他待最终执行       |
| A22    | 双窗口 CAS、稳定 createId、实际 API 成功后丢响应                   | 待完整浏览器执行                       |
| A23    | 未确认终止失权只读、停止旧投影、校准前禁止 create                  | 待最终执行                             |

## 本轮确认并修复的缺陷

- Conversation/Attention 吞掉重连快照失败，导致共享 cursor / IPC ACK 提前推进。
- Conversation 复用 SSE 水位之前发起的列表请求，可能漏掉该时间窗内的创建。
- 投影拒绝后移除消费者，以及 synthetic ready 失败被吞掉，导致无法自动重新校准。
- Conversation 的版本/tombstone 集合无界。采用 512 项上限、新 live/snapshot 边界与成功后压缩；
  快照合并忽略边界前已确认的旧 pending，旧连接回调失效，列表维持 24 项发现窗口。
- S6 E2E 请求使用不同 Cookie hostname，且初始列表计数早于校准完成；改为同源代理并等待校准响应。

RED 证据：`conversation-red.log`（2 项预期失败）、`attention-red.log`（1 项预期失败）。
GREEN：`recovery-reviewed.log`（4 文件 / 59 项通过），`attention-complete.log`（6 项通过）。
真实登录恢复：`targeted-browser.log`；最终完整报告将以最终候选重新生成。

## 工程和交付门禁

待完成：官方 affected lint/typecheck/test、governance、真实 PG/LibSQL/PowerSync、Desktop IPC/main/Electron、
完整 AI Workspace Chromium、Docker Revision 一致性及正式 PASS、推送 PR、当前 HEAD CI、合并与 staging 交付。
Windows/macOS 实机及真实 provider 推理不在本机 Chromium/受控 workflow 测试的通过范围内。
未确认生产 rollout，不将 prod-like 或 main 合并描述为生产上线。
