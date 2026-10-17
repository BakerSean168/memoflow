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

| 阶段 | 源码审计                                                 | 当前验收状态                                                 |
| ---- | -------------------------------------------------------- | ------------------------------------------------------------ |
| S0   | 原生 detach、capability/epoch 失效、pending owner 防重复 | 单元与 Chromium 通过                                         |
| S1   | 安全错误分类、单处中断、租约失权冻结并重新核验           | 单元与 Chromium 通过；远端 release 故障为注入验证            |
| S2   | 人工草稿的新 Run、revision、新 lease、迟到响应防护       | 单元与 Chromium 通过                                         |
| S3   | PG trigger/outbox、LibSQL 同事务事件、SSE/IPC            | 真实 PG、LibSQL、PowerSync、独立进程 HTTP、IPC 通过          |
| S4   | Goal 增量投影、共享订阅、cursor 恢复、业务轮询移除       | 恢复范围 60/60、Chromium 通过                                |
| S5   | Attention 事务事件、revision/seenRevision、共享订阅      | 单元、真实 PG/PowerSync、Chromium 通过                       |
| S6   | Conversation 版本、tombstone、精确同步、有界恢复         | 双独立认证浏览器同步及无完整列表重复读取通过                 |
| S7   | 身份作用域、IndexedDB CAS、稳定 createId、回执核验       | Chromium、真实 Linux Electron 重启通过；本轮补修恢复校准竞态 |

没有发现尚未实施的切片。完整 Chromium `accepted-browser.log` 为 17/17；其后 S7 校准修复的当前候选验证以正式报告及后续定向日志为准。

## A01–A23 证据矩阵

下表的 PASS 指明实际执行层级；跨平台实机和真实 provider 不由受控 workflow 测试替代。
最终候选工程检查与 Docker 门禁以官方 `latest.json` 绑定 HEAD，不能以此前日志代替。

| 验收项 | 实现 / 验收范围                                  | 当前结果与本地证据                                                |
| ------ | ------------------------------------------------ | ----------------------------------------------------------------- |
| A01    | failed 后 mounted 原生人工字段保留               | PASS：App-Vue、Chromium                                           |
| A02    | detach 后 owner Save/Cancel，不调用旧 workflow   | PASS：App-Vue、Chromium                                           |
| A03    | capability、epoch、旧异步响应防护                | PASS：App-Vue、恢复 60/60                                         |
| A04    | 主动 handoff owner Save + approve                | PASS：App-Vue、Chromium                                           |
| A05    | pending/submitted/receipt 冻结与读回             | PASS：App-Vue、Chromium；补充 checkpoint 校准回归                 |
| A06    | release 与 TTL、停止续租                         | PASS：`lease-release.log` 4/4（故障注入）；未执行真实远端断网故障 |
| A07    | 单处稳定中断消息                                 | PASS：App-Vue、Chromium                                           |
| A08    | 安全分类与 hint                                  | PASS：AI 工程单元测试                                             |
| A09    | 当前 sourceDraft、新 Run、新授权与 revision      | PASS：App-Vue、Chromium                                           |
| A10    | pending owner、prior receipt、稳定意图防重复     | PASS：App-Vue、Chromium                                           |
| A11    | 事件身份过滤与真实 A→B→A 恢复隔离                | PASS：HTTP/IPC、Chromium `accepted-browser.log`                   |
| A12    | PG/LibSQL 回滚及独立进程 HTTP 事件               | PASS：`postgres.log`、`durable-streams.log`                       |
| A13    | workflow snapshot 事务与安全投影                 | PASS：真实 PG/LibSQL、AI 单元测试                                 |
| A14    | 旧版本、乱序、迟到 ACK                           | PASS：`recovery-final-candidate.log` 60/60                        |
| A15    | 分页、晚提交、水位、有界版本元数据               | PASS：真实持久化、恢复回归                                        |
| A16    | reset 丢 cursor、拒绝不 ACK、late-join           | PASS：恢复回归；补充 S7 校准拒绝回归                              |
| A17    | 健康连接无 Goal/Attention 业务轮询               | PASS：单元、Chromium 请求预算                                     |
| A18    | 合并并发读取、ready 后权威新快照                 | PASS：恢复回归、Chromium                                          |
| A19    | Conversation 版本与 tombstone、双独立浏览器      | PASS：`s6-final.log`、完整 Chromium 17/17                         |
| A20    | strict HTTP/IPC 契约、ACK 与 lease 隔离          | PASS：AI、Desktop IPC 52/52、真实 HTTP                            |
| A21    | Web 刷新/登录、真实 Electron 重启、不提前 create | PASS：Chromium、`electron-candidate.log` 1/1                      |
| A22    | 双窗口 CAS、稳定 ID、API 成功但响应丢失          | PASS：App-Vue、Chromium                                           |
| A23    | 未确认失权冻结、旧投影停止、校准前禁止 create    | PASS：App-Vue、Chromium；S7 并发校准补修                          |

## 本轮确认并修复的缺陷

- Conversation/Attention 吞掉重连快照失败，导致共享 cursor / IPC ACK 提前推进。
- Conversation 复用 SSE 水位之前发起的列表请求，可能漏掉该时间窗内的创建。
- 投影拒绝后移除消费者，以及 synthetic ready 失败被吞掉，导致无法自动重新校准。
- Conversation 的版本/tombstone 集合无界。采用 512 项上限、新 live/snapshot 边界与成功后压缩；
  快照合并忽略边界前已确认的旧 pending，旧连接回调失效，列表维持 24 项发现窗口。
- S7 恢复草稿的旧 running 查询吞掉并发终态；ready/reset 未校准且错误被吞掉。串行处理新边界与终态，失败保留冻结并拒绝 ACK，Goal 回执不可见时重新核验。
- Attention 已读版本缓存随可见会话裁剪，避免跨会话持续增长。
- S6 E2E 请求使用不同 Cookie hostname，且初始列表计数早于校准完成；改为同源代理并等待校准响应。

RED 证据：`conversation-red.log`（2 项预期失败）、`attention-red.log`（1 项预期失败）。
GREEN：`recovery-final-candidate.log`（4 文件 / 60 项通过）、`attention-bounded.log`（6 项通过）。
S7 RED：`checkpoint-calibration-red.log`（4 项预期失败）；GREEN：`checkpoint-calibration-final.log`（GoalDialog 全量 53/53）。独立只读复核确认原阻塞闭合，未发现新增并发阻塞。
真实登录恢复与完整浏览器：`accepted-browser.log`（17/17）。

## 工程和交付门禁

已执行：`affected-engineering.log` 41 个项目、146 个任务通过（App-Vue 296 文件/2000 项，AI 576 项通过/4 项既有跳过；PG 跳过项已另行实测）；`governance-final.log` 与格式检查通过。
真实存储：`postgres.log` 3/3；`durable-streams.log` 7/7（LibSQL、PowerSync、HTTP）。
Desktop：`desktop-ipc-main.log` IPC 52/52、main 204/204；`electron-candidate.log` 真实 Linux Electron + Keyring 重启/保存 1/1。
S7 补修后按受影响范围重验，最终候选由官方报告绑定；不将中间提交的测试冒充当前候选。

交付状态：尚未推送本轮提交；PR #451 的新 HEAD CI、合并、main candidate 发布与 staging 尚待执行。
Docker 服务已更新本轮实现，仍需最终 HEAD 构建、运行、浏览器 revision 完全一致，并取得正式 PASS。
Windows/macOS 实机及真实 provider 推理不在本机 Chromium/受控 workflow 测试的通过范围内。
未确认生产 rollout，不将 prod-like 或 main 合并描述为生产上线。

## 2026-10-16 Windows IPC 实机增量审计

`main@331bdb0f7d549d11b1ad7632cabf1a5a22385886` 的 Windows Electron 真实 IPC/Conversation event 订阅、ACK、重放、Guest 身份隔离已通过（见 `04-acceptance.md`）；同版本 Windows NSIS / Linux AppImage 更新测试通过。此次新增自动化 `apps/desktop/e2e/workspace-ipc.spec.mts` 与 Windows Workflow 门禁，目的是让后续 exact-SHA 候选持续复验上述已经观察的行为。

仍保持 Goal/Attention Windows 事件端到端、实际可用 non-Codex provider 上游 429/quota、中断后原生 Goal 草稿 handoff 与重复保存防护为**未完全验收**。尚未获得这些真实证据，不关闭 #454 / #456 / #457，不声明正式发布。

## 2026-10-17 · 版本发布冻结后的增量审计边界

**当前冻结对象**：main@90bd7caa73e2522351e4acfef351f51d26debd36 / source 0.20.1。Latest Published 仍为 v0.19.0，v0.20.0 是未公开 Draft，v0.20.1 尚未发布。此文件早期 S0–S7 的结果属于当时源码与环境，不能自动推断新源码已完成所有产品验收。

本轮在**实质性 Native Windows 验收代码 PR** 中补充 #454/#456/#457 的 Release 候选实测链路：

1. 默认 CI：安装版 N→N+1、installedExecutableSha256 跨步骤一致性、安装后空 Codex Home 登录/模型/连接副作用防护，及原 AGY 离线 Composer；不使用真实认证。
2. 操作员显式同意的私有检查：同 SHA/版本/哈希已安装 Electron、真实 Windows Codex 账号 A→空 B→A；只查询账号和模型、明确选择 Agent，**0 次推理**。
3. 另需**单独明确授权**的安装版 DSH 真实 Send，检查流式终态和持久聊天；本轮绝不默认触发。
4. 真实上游 429 不可通过耗尽额度制造；已有注入 429/quota 只能证明应用内部分类、Attention、草稿和重复保存，不能描述为上游 429 实测。

**代码、类型检查、CI 成功**与**Windows 实机、签名安装候选、真实账号验收**分别记账；CI 离线夹具不等同于正式签名客户端。完整证据见 04-acceptance.md 同期增量记录。新分支 Windows CI、操作员证据须逐项核对后才更新完成状态。发版必须等待全部 Issue DoD、精确版本 SHA、Windows/其他平台及项目级 Go/No-Go 验收一致，**保持 #454/#456/#457 Open，禁止发布**。

## 2026-10-17 · Installed Workspace evidence must bind final SHA

The baseline main@c444ca3937bc passed main CI/Coverage, and PR #473 (c7c3f5290ae) completed isolated Windows NSIS/ Linux AppImage N→N+1 checks. However the former is **not itself an installed build receipt**, and the latter is **not** the same SHA as current main. The remaining installed-client evidence must therefore come from the final product candidate **after all implementation is merged**, through exactly one Windows installation/update workflow, not repeated builds on each partial PR.

The new test-only change routes existing Workspace Goal/Conversation and six synthetic DSH/AGY Attention failures through the same already-installed executable used by the AGY Composer and empty Codex tests, checking executable SHA/version/provenance and installed preload in every case. Only a future successful **exact final main SHA** Windows job can justify marking that coverage PASS. Synthetic faults do not prove a real provider-issued 429. Explicit real-account Codex and optional billable signed-installer Send remain separate approvals, and may not be silently claimed as completed from offline testing.

No change to release governance: all three publishing workflows remain disabled, #454/#456/#457 stay open pending full DoD, and no production rollout occurs before Go/No-Go.
