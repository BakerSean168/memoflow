---
tags:
  - analysis
  - desktop
  - electron
  - performance
  - research
description: 基于 MemoFlow 0.16.0 源码、已安装依赖与隔离实验的桌面性能研究，包含资源保留、启动等待、Vault 正确性、优化路线和 Windows 验收设计
created: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

# MemoFlow Electron 桌面性能深入研究

研究日期：2026-10-09。代码基线：`f34eff34f4a5567c57181c4fc5ef0d357a0a8eb1`，MemoFlow `0.16.0`，与用户提供的《MemoFlow Desktop 性能优化总体方案》一致。

本轮完成源码审查、上游资料核验和隔离实验；交付研究与候选实施路线。产品执行逻辑未修改，候选架构未写成已采纳 ADR。源码位置均相对于上述 revision；实验脚本及原始 JSON 随文保存。

后续实施已另行完成，改动与实测结果见[优化实施与验收](./2026-10-09-desktop-performance-implementation.md)。本报告保留优化前的研究基线。

## 1. 结论与证据边界

**保留 Electron / Vue / PowerSync 是合理路线。最先处理的应是资源所有权、重复工作和数据完整性，再处理按需加载与渲染密度。** 当前证据不足以支持更换桌面技术栈，也不能给出整应用内存或启动时间的节省百分比。

附件的大方向成立，但进一步研究改变了几个具体落点：

| 主题 | 本轮新增或收紧的结论 | 建议顺序 |
| --- | --- | --- |
| PowerSync 销毁 | 不仅缺少 `close()`：已安装 SDK 中存在明确的定时器保活链；实测 6 个 Worker 在 disconnect 和 GC 后仍存在。wrapper 还有打开/关闭交叠及跨路径复用反例 | 第一批 |
| Markdown 内存 | `gray-matter` 默认按完整正文做无上限全局缓存；一个文件的 200 个版本在 detach 后仍全部保留 | 第一批 |
| Vault 完整性 | 10,000 篇上限静默截断；第 10,001 篇既搜不到，也可能逃过稳定文档 ID 去重 | 第一批 |
| Vault 切换 | 搜索扫描后重新读取当前 binding，受控交叠可返回 A 库标题与 B 库正文命中 | 第一批 |
| 启动网络 | 主进程激活和 renderer mount 前各有一次云校验等待；只移走第一处 await 不足以恢复本地优先 | 第二批 |
| 搜索规模 | 10,000 篇、每篇 4 KiB 的热查询中位数为 16.27 秒；2N 次 Markdown 读取之外还有 N+1 次 binding 读取 | 第二批 |
| 搜索以外的扫描 | Goal/Task 关联解析和 AI 按 ID 查找也使用全库扫描；K 个关联可形成 K 次全库扫描 | 第二批 |
| 通知窗口 | 首次通知才创建，但随后复用完整 app bootstrap，并保留 100 ms 时钟；应优先利用已有轻量入口模式 | 第二批 |
| 隐藏页面、AI 长历史 | 存在具体的后台失效刷新和全量历史读取路径；已有 Tab 上限、流式节流，不能重复建设 | 后续按剖析排序 |
| 构建与包体 | main 的 tree-shaking 关闭有明确构建故障背景；旧 0.12.0 包不能代表当前 0.16.0，更不能代表 Windows | 独立测量后决定 |

“第一批/第二批”是建议的工程顺序，不是已确认生产事故等级。轻量观测应与第一批修复一起做，不必等完整性能平台建成后才修正已复现的资源或正确性问题。

### 1.1 本文怎样使用“证实”

- **源码事实**：当前仓库或锁定版本依赖存在对应执行路径。
- **真实组件实验**：直接调用当前 Vault 源码或真实 PowerSync SDK，使用合成文件/空数据库。
- **受控边界反例**：保留生产 wrapper，替换外部依赖或控制调用交叠；证明协议缺口，不代表已在 UI 中观察到用户事故。
- **待测收益**：整应用启动、Windows 内存、功耗、帧率、安装包大小及优化后的改善幅度。

实验环境：Linux x64，Node `24.21.0`，Intel Xeon 2.20 GHz，8 个逻辑 CPU，约 32 GiB 内存。没有运行 Windows 正式包，没有采集完整 Electron 进程树。搜索实验未驱逐 OS 文件缓存；五个重复样本报告中位数与范围，**不把它们写成可靠的 p95**。异步查询耗时不等于主线程持续同步阻塞。

依赖基线：Electron `44.4.5`、Vue `3.5.43`、TanStack Vue Query / Query Core `5.103.2`、`@powersync/node 1.1.0`、`@powersync/common 2.3.0`、`@powersync/shared-internals 1.3.0`、`better-sqlite3 13.0.3`、`gray-matter 4.0.3`。上游 latest 文档访问日期为本研究日期；实现细节以这些已安装版本为准。

## 2. PowerSync：资源关闭和并发所有权需要一起修

### 2.1 项目把“断开同步”当成了“销毁数据库”

[powersync.ts:435](../../apps/desktop/src/main/database/powersync.ts#L435) 的 `shutdownPowerSync()` 停止变更广播后只调用 `disconnect()`，最终清空 DB、路径和 openingPromise；[Profile deactivate:366](../../apps/desktop/src/main/profile/desktop-profile-runtime-manager.ts#L366) 和 prepared runtime 清理会调用它。

这里必须保留两个不同合同：

| 操作 | 正确含义 | 资源预期 |
| --- | --- | --- |
| 关闭云同步，继续使用当前本地 Profile | 当前 `disablePowerSyncSyncMode()` 使用 disconnect 合理 | 本地连接池继续存在 |
| 销毁 Profile runtime / 应用退出 | 完成现有持久化与停止协议后，关闭该实例 | DB 连接、Worker、订阅和内部计时器被释放 |
| `disconnectAndClear()` | 清理同步/本地数据，具体取决于参数 | **不是**释放连接池的替代 API |

SDK 的 `disconnectAndClear()` 默认 `clearLocal: true, soft: false`；不能为“省内存”改用清库操作。关闭完成的数据库实例不能再次使用，之后应创建新实例。

### 2.2 为什么丢弃引用也没有释放

当前 `@powersync/node` 默认使用 `WorkerConnectionPool`，一个 writer 加五个 reader。项目 [createPowerSyncDatabase:86](../../apps/desktop/src/main/database/powersync.ts#L86) 没有覆盖 reader 数量，所以默认是一实例六个 Node Worker，**不是六个操作系统子进程**。

已安装源码的释放链：

1. `BasePowerSyncDatabase.close()` 先断开同步并释放 trigger manager。
2. `WorkerConnectionPool.close()` 等待并关闭 writer 和所有 reader。
3. `RemoteConnection.close()` 关闭远端数据库、释放 Comlink proxy，然后 `await worker.terminate()`。
4. 远端 `BlockingAsyncDatabase.close()` 关闭 better-sqlite3 连接。

明确的保活链是：

```text
Node timer
  → TriggerManagerImpl.cleanupCallback
  → TriggerManagerImpl.options.db
  → PowerSync database / connection pool
  → Worker connections
```

构造数据库时 trigger manager 收到 `db: this`，设置每 120 秒重排的清理计时器；disconnect 不 dispose 它。Comlink 中存在 FinalizationRegistry，并不能打断这条强引用链，也不等价于 PowerSync close。

依赖源码定位：`node_modules/@powersync/node/src/db/WorkerConnectionPool.ts:26,135,145`、`RemoteConnection.ts:88`、`BetterSqliteWorker.ts:16`；`node_modules/@powersync/shared-internals/src/client/BasePowerSyncDatabase.ts:206,450,489`、`triggers/TriggerManagerImpl.ts:82,110,134,154`。接口合同见 `node_modules/@powersync/common/src/client/CommonPowerSyncDatabase.ts:222,229,261`。

### 2.3 真实 SDK 实验

使用空 Schema、临时数据库和公开 openWorker factory；没有 connector 或网络。计数器仅保留 Worker 的 WeakRef，第二阶段也仅保留数据库 WeakRef，避免测试器自己制造保活。

| 检查点 | 活跃 Worker |
| --- | ---: |
| 第一个 DB init 后 | 6 |
| disconnect 后 | 6 |
| close 后 | 0 |
| 第二个 DB init、disconnect，丢弃业务强引用后 | 6 |
| 20 次 GC，每次相隔 50 ms，再等待 100 ms | 6，DB WeakRef 仍可取回 |
| 显式 close 后 | 0 |

[复现脚本](./evidence/2026-10-09-desktop-performance/powersync-sdk-experiment.mjs) · [原始结果](./evidence/2026-10-09-desktop-performance/powersync-sdk-results.json)。

这证实了当前 SDK 的资源释放机制，与项目遗漏 close 的调用链一致；尚未测得真实 Profile 每次切换保留多少 MB，也未测同步繁忙时 close 的耗时。不要把默认读 Worker 从 5 减到 1 当成首要修复：并发吞吐、内存和关闭正确性是不同问题。

### 2.4 只加 close 仍不足以解决 wrapper 协议

[openPowerSyncLocalOnly:355](../../apps/desktop/src/main/database/powersync.ts#L355) 只有一个全局 openingPromise。路径兼容检查依赖已经发布的 DB；shutdown 又在 DB 尚未发布时直接返回。

用未改动生产文件转译后运行，外部 Electron/DB 使用 fake，控制 ready 时刻得到：

| 顺序 | 结果 |
| --- | --- |
| open(A) 尚未 ready → shutdown 返回 → A ready | shutdown 后旧 DB 仍被发布；disconnect/close 调用均为 0 |
| open(A) 尚未 ready → open(B) → A ready | 仅创建一个 DB，两位调用者都得到 A 路径 |

[边界脚本](./evidence/2026-10-09-desktop-performance/powersync-wrapper-experiment.mjs) · [原始结果与源码 SHA-256](./evidence/2026-10-09-desktop-performance/powersync-wrapper-results.json)。这些是 wrapper 层反例；本轮没有证明 UI 一定触发同样交叠。

建议由现有 Profile runtime owner 管理打开、启用同步、关闭的串行状态，至少保证：

- 正在打开时就绑定规范化路径及 Profile generation；不同路径不能共享同一承诺。
- 关闭要处理 opening 和已打开实例；较老异步结果不能在关闭后重新发布。
- 在途查询/后台任务与关闭顺序明确，失败不会通过清空引用伪装成释放成功。
- 常规退出的 flush veto、更新退出协议、原生库/Worker 打包路径保持原有合同。

最小纵切是“Profile A 打开 → 本地操作 → 关闭 → Profile B 打开”，同时覆盖准备失败、关闭失败和迟到打开。此时再决定是否调整 reader 数量。

## 3. 启动：主进程和 renderer 各有一个网络等待点

### 3.1 可核验调用链

```text
handleAppReady
  → activateStartupProfile
    → bootstrap.init
    → afterActivation
      → cloudConnection.restore
        → getState → fetch /api/auth/get-session
      → Focus / Intervention 恢复
  → transitionToMainWindow

bootstrapMainApp
  → await readDesktopAccessSnapshot
    → GET_SNAPSHOT IPC
      → await cloudConnection.getState → 再次 fetch
  → 本地 session / account hydration
  → app.mount
```

证据：[app-lifecycle.ts:45](../../apps/desktop/src/main/lifecycle/app-lifecycle.ts#L45)、[Profile activation:305](../../apps/desktop/src/main/profile/desktop-profile-runtime-manager.ts#L305)、[main.ts:841](../../apps/desktop/src/main/main.ts#L841)、[cloud manager:19](../../apps/desktop/src/main/profile/desktop-cloud-connection-manager.ts#L19)、[renderer bootstrap:53](../../apps/desktop/src/renderer/bootstrap/app.ts#L53)、[GET_SNAPSHOT:31](../../apps/desktop/src/main/profile/profile-access-ipc.ts#L31)。

仅有 cloudBinding 且存在未过期保存会话时才会进入网络路径；guest、未绑定、缺失/过期会话会提前返回。请求没有应用层 timeout/AbortSignal，这意味着本地就绪受网络等待策略支配；不能把它写成“必然无限挂起”。无 PIN 启动在主窗口创建前等待；有 PIN 场景需单独测解锁后的激活路径。

另外，[di-app.ts:124](../../apps/desktop/src/renderer/platform/di-app.ts#L124) 又异步请求 snapshot，可能发起第三次校验，但它不是同样的 mount 前 awaited barrier。[cloud-auth-ipc.ts:21](../../apps/desktop/src/main/profile/cloud-auth-ipc.ts#L21) 的 SESSION 读取的是本地 session，不能误算成另一轮网络验证。

### 3.2 最小改造边界

本地 unlock/access snapshot 应从已知本地状态得出；cloudState 由现有 cloud connection owner 异步刷新，同一 Profile 同时最多一个校验请求，具有超时、取消及 generation 验证。renderer 可以先获得本地能力，云能力在验证后再更新；**缓存云状态不能变成绕过服务端授权的凭据**。

同时移走两处非必要网络等待，合并冗余校验；否则只在 main.ts 去掉 await，首屏仍会卡在 GET_SNAPSHOT。Focus/Intervention 的本地恢复也不应排在无关云校验之后。

需保留首次 Profile snapshot hydration 的必要性：[prepareDescriptor:449](../../apps/desktop/src/main/profile/desktop-profile-runtime-manager.ts#L449) 与 [profile-snapshot-service.ts](../../apps/desktop/src/main/profile/profile-snapshot-service.ts) 是不同阶段，不能为提速跳过建立本地事实所必需的准备。

Repository auto-sync 启动中存在 awaited refresh，但当前注入的 token getter 读取 active Profile，而 bootstrap 阶段 active 尚未设置；本轮不把它列成“无条件第三个启动网络阻塞”。模块启动并行化同样要服从实际依赖，不能把全部 init 改成 Promise.all。

验收应分别记录：窗口出现、本地内容可读写、云同步就绪。对已有本地数据注入缓慢/永不成功的云请求，前两者应继续完成；Profile 已切换或锁定后，旧请求不得改变当前能力或连接。

## 4. Local Vault：不仅搜索慢，还存在缓存和完整性问题

### 4.1 一次查询实际做了什么

[LocalVaultRuntime:317](../../packages/repository/src/electron/local-vault-runtime.ts#L317) 的 scan 按目录排序，逐篇读 Markdown，解析 frontmatter、摘要、标签与链接。[searchVault:365](../../packages/repository/src/electron/local-vault-runtime.ts#L365) 先扫描，再对每个摘要调用公开 readNote，重新验证 binding/路径、读取正文、构造 note 投影、归一化和打分；最后才排序并应用结果 limit。

因此 limit=50 或 100 不限制上游扫描量。单次查询的基本成本是：

```text
N 篇扫描读文件 + N 篇搜索再读文件
+ N+1 次读取 binding.json
+ 每篇路径、可访问性、大小校验
+ 全文归一化与匹配、所有命中排序
```

binding 重读来自 [requireAvailableBinding:617](../../packages/repository/src/electron/local-vault-runtime.ts#L617) 与 [loadBinding:705](../../packages/repository/src/electron/local-vault-runtime.ts#L705)。不能直接删除安全校验；应在一次操作内固定 scope，减少重复准备，并保留实际文件访问时的路径边界。

附件说“重复读取并解析”大体准确，但 `gray-matter` 默认缓存可能使第二次调用跳过 YAML 解析。**两次 Markdown 读取和 note 投影处理确定存在；不能把两次 YAML parse 都当成实测事实。**

### 4.2 真实源码实验：热查询仍随数据量增长

直接通过 tsx 导入当前 runtime；每篇文件 4,096 bytes，查询 needlealpha。每种规模先查询一次，再执行 5 次未插桩重复查询；另跑一次插桩查询统计 fs.promises 调用。文件刚生成，未驱逐 OS cache；“首次查询”也不是严格冷磁盘基准。

| 笔记数 | 重复查询中位数 | 5 次范围 | 每次 Markdown 读取 | 每次 binding 读取 |
| --- | ---: | ---: | ---: | ---: |
| 100 | 237.96 ms | 187.86–261.84 ms | 200 | 101 |
| 1,000 | 1,605.26 ms | 1,537.42–2,029.79 ms | 2,000 | 1,001 |
| 10,000 | 16,273.97 ms | 14,164.44–18,302.51 ms | 20,000 | 10,001 |

首次查询分别为 288.31 ms、1,741.11 ms、23,795.88 ms。10,000 篇时一次查询累计读取 Markdown **78.125 MiB**，并产生 30,001 次 readFile、30,001 次 stat、40,001 次 realpath、10,001 次 access、51 次 readdir。这里计数的是 API 调用和读取字节，不等于底层物理磁盘 IOPS/流量。

[源码实验脚本](./evidence/2026-10-09-desktop-performance/local-vault-experiment.mjs) · [所有样本和计数](./evidence/2026-10-09-desktop-performance/local-vault-results.json)。

这是 Linux/Node 下真实 runtime 的端到端搜索耗时，未包括 IPC、renderer、DOM 或 Windows 文件系统。**16.27 秒不是“Electron 主线程同步阻塞了 16.27 秒”**；异步 I/O 等待与同步解析/排序必须在后续 trace 中分开。它已经足以说明单靠输入防抖或虚拟列表无法解决核心成本。

### 4.3 新发现：解析器把旧正文长期留在主进程

[readNoteFromBinding:666](../../packages/repository/src/electron/local-vault-runtime.ts#L666) 调用 `matter(contentMarkdown)`；确认写入时也使用默认调用。[gray-matter 4.0.3](https://github.com/jonschlinkert/gray-matter/blob/master/index.js) 的已安装 `index.js:29–49` 在没有 options 时，以完整输入字符串为 key 写入进程级 `matter.cache`，不设置数量/字节上限。条目还持有解析结果及原文 Buffer。一个文件每次内容变化都会形成新的 key，不是替换按路径缓存。

项目 apps/packages 中没有对应 clearCache 或缓存生命周期管理。缓存属于模块实例，并不属于 LocalVaultRuntime，因此 detach 或丢弃 runtime 不能释放这些条目。

实验使用**同一个 64 KiB 文件的 200 个不同版本**，每个版本读入一次，采样前执行 GC：

| 检查点 | 缓存条目 |
| --- | ---: |
| 开始前 | 0 |
| 50 / 100 / 150 / 200 个版本后 | 50 / 100 / 150 / 200 |
| detach Vault 后 | 200 |
| 测试器显式 clearCache 后 | 0 |
| 200 次传入显式空 options 的对照调用 | 0 |

从开始到 200 版本，heapUsed 增加约 **12.68 MiB**，external 增加约 **12.50 MiB**；清除后两者回到接近起点。arrayBuffers 已包含在 external 中，不应再次相加。这个进程先做过大库实验，RSS 保留了分配器高水位；不能把约 660 MB 的实验 RSS 宣称为 MemoFlow 空闲内存，也不能保证清缓存会立即降低 OS 工作集。

最小候选修复是让相关 parse/stringify 路径显式控制 options，绕开默认全局全文缓存，验证 frontmatter、换行和 stringify 行为。不要用定时 global clearCache 代替正确所有权；若确需复用解析，应由当前 Vault 的有界投影缓存负责，并在编辑/切换/关闭时失效。

### 4.4 新发现：10,000 篇上限会影响结果正确性

当前 `MAX_SCAN_NOTES = 10_000`，单篇读取上限 2 MiB，确认写入上限 1 MiB，搜索结果上限 200。后几个是输入/输出预算；扫描上限却也被后续身份判断使用。

实验在 10,000 篇之后增加一篇排序最后、含唯一关键词和稳定 memoflow_id 的 sentinel：

- 输入 10,001 篇，scan 返回 10,000 篇。
- 响应只有 binding、health、notes、scannedAt，没有完整性/截断字段，health 仍为 Available。
- sentinel 的唯一正文词搜索结果为 0。
- 用 sentinel 的相同稳定 ID 在另一个路径确认写入，**实际创建成功**。原因是 [writeConfirmedNote:518](../../packages/repository/src/electron/local-vault-runtime.ts#L518) 的去重依赖同一个有上限 scan。

这已经超出“支持大库更流畅”：系统把不完整扫描当成了身份不存在的依据。应分离展示数量上限、可取消扫描预算与完整身份校验。即使使用索引，索引过期/尚未建完也不能被当作“不存在”；需要明确的完整性状态、重核验或可解释的暂不可写结果。

也不应只是删除 MAX_SCAN_NOTES：那会把保护性预算变成无限工作。候选设计应支持分批遍历、进度、取消、完整性，以及同一 Vault 内的写入序列化。外部编辑器可以修改文件，文件系统无法提供跨应用全局事务；必须定义检测冲突和索引补偿的边界，不能承诺仅靠内存 Map 完成永久唯一性。

### 4.5 新发现：在途搜索可以混合两个 Vault

search 使用 scan 得到 A 库摘要，却在循环里通过公开 readNote 重新读取“当前 binding”。受控实验在扫描结束、单篇 readNote 之前选中 B 库；两个库各有 same.md。

结果为：摘要标题 **Title from A**，命中行 **from-vault-b-only**。这是实际 runtime 的交叠反例，只有切换时刻由测试器控制；没有把它写成已观察到的 UI 事故。

renderer 侧 [useLocalVault.ts:95](../../packages/app-vue/src/modules/repository/composables/useLocalVault.ts#L95) 的扫描、打开、搜索同样缺少请求代次防护；共享 loading 布尔值也不能表达重叠请求。[LocalVaultWorkspaceView.vue:343](../../packages/app-vue/src/modules/repository/views/LocalVaultWorkspaceView.vue#L343) 的 220 ms 防抖只延迟发起，不能取消在途工作。

需要同时保证：

1. runtime 操作捕获 Profile + Vault binding + generation，整个操作使用一致 scope。
2. 切换/解绑/锁定取消旧工作；无法中断的底层步骤完成后检查代次，不再发布旧结果。
3. renderer 只接收当前查询和当前 binding 的结果；open/scan/select/detach 也有相同规则。
4. 真实取消减少后台工作；仅“丢弃旧响应”只修显示正确性，不会省掉扫描。

### 4.6 扫描成本还被 Goal、Task 和 AI 放大

两个 Local Vault relation resolver 为单个稳定 ID 执行 scan：[document-ref resolver:18](../../apps/desktop/src/main/modules/relation/local-vault-knowledge-document-ref.resolver.ts#L18)、[workspace resolver:18](../../apps/desktop/src/main/modules/relation/local-vault-knowledge-workspace.resolver.ts#L18)。

Goal workspace 对关联边做 Promise.all，再逐项 resolve（[goal-workspace-query.service.ts:132](../../packages/goal/src/server/application/services/goal-workspace-query.service.ts#L132)、[:191](../../packages/goal/src/server/application/services/goal-workspace-query.service.ts#L191)）；Task 有相同模式（[task-workspace-query.service.ts:54](../../packages/task/src/server/application/services/task-workspace-query.service.ts#L54)）。K 个 Vault 文档关联可能形成 K 次全库扫描，文件读取量约 O(KN)，并发只改变重叠方式，没有消除重复工作。

[DesktopKnowledgeSourceAdapter](../../apps/desktop/src/main/modules/ai/desktop-knowledge-source.adapter.ts#L18) 的搜索、listIndexable、getNoteById 与 hydrate 也依赖 scan/重读。因而共享的 Vault 身份/元数据投影比只重写搜索框更有价值；复用应留在现有 Repository/Vault owner，其他模块通过既有端口访问。

这里是调用链复杂度分析，没有测得真实 Goal/AI 页面延迟，也没有推断所有关联都来自本地 Vault。

## 5. 搜索设计：先消除重复工作，再选索引

### 5.1 最小可交付路径

建议以 Local Vault 为第一个真实 owner，分两步建立可验证的边界：

1. 固定 binding/generation，关闭隐式全文缓存；一次读取生成正文匹配所需投影和摘要，避免 search→scan→readNote 的双遍历。提供共享的稳定 ID→路径/摘要 lookup，并明确完整性。
2. 在上述合同稳定后，维护可重建的元数据/归一化文本索引；首次扫描、文件增删改/重命名、外部修改、目录重新挂载按增量更新。查询返回分页摘要，打开笔记时才取正文。

Markdown 仍是正文事实源，索引不得写回改造用户原文；索引属于 Profile/Vault，而非云会话或 Git repository binding。未连接 Git 的本地 Vault 也必须可用。索引版本、binding、重建代次、损坏恢复和取消状态要明确。

SQLite 是值得先验证的候选，因为持久化元数据可以同时服务 ID 解析和搜索；但完整全文、词项与索引会增加磁盘和写放大。小库可先比较有界内存投影与 SQLite。不要一开始引入跨业务搜索平台，也不要让每个 renderer 各维护一份全库。

文件 watcher 是提示，不是完整事实源：事件合并/丢失、编辑器原子替换、休眠唤醒、移动目录都需要有界重扫或重建。处理批次应有 backpressure，同一代次的重复变化合并；初次索引不能阻止本地已知内容的基本使用。

### 5.2 中文、Unicode 和排序必须写进合同

当前搜索是 NFKC + 大小写归一化、多词 AND（最多 8 词），标题/路径有权重，正文返回最多 5 行命中；结果在打分后截断。索引替换要保留或明确修订这些行为，而非仅证明 SQL 更快。

[SQLite FTS5 官方文档](https://www.sqlite.org/fts5.html#tokenizers) 明确了几个限制：

- unicode61 不是通用中文分词，不能等价替换任意中文子串 includes。
- trigram 的 MATCH 查询少于三个 Unicode 字符不会命中；一字、二字查询需要单独且完整的回退路径。
- trigram 对 LIKE/GLOB 的优化有配置和模式限制，LIKE 带 ESCAPE 时不能使用该优化。
- 普通 B-tree 通常无法优化以通配符开头的 `LIKE '%词%'`；“换成 SQL”不等于建立了有效搜索索引。

NFKC 会改变字符形式甚至长度，归一化后的索引位置不能直接当原文高亮偏移。当前代码已有这种偏移使用方式；本轮没有追加 Unicode UI 实验，应在行为测试中固定预期，避免索引迁移固化错误。SQLite 内建 LIKE 的非 ASCII 大小写规则也不等价于现有 JS 归一化。

最小语义数据集应覆盖：中文一/二/多字、词中片段、多词 AND、全角/半角、组合字符、emoji、字面百分号/下划线/引号/括号、标题与路径权重、同分顺序、命中行和原文偏移。候选集不能先任意截短再做 JS post-filter，否则可能丢掉真正高分结果。

外部 content FTS 表需要初始回填和一致更新。对短查询保留可测的完整回退，并记录执行计划、读行数、索引大小、更新和重建成本。先在 Vault 搜索与 ID lookup 验证，再让第二个消费 owner 复用；至少两个稳定用例之后再考虑提升公共抽象。

### 5.3 虚拟列表须与键盘导航一起实现

[LocalVaultWorkspaceView.vue:155](../../packages/app-vue/src/modules/repository/views/LocalVaultWorkspaceView.vue#L155) 对所有条目生成 Vue 行。虚拟列表能约束 DOM，但不能降低前面的全库读取、解析、IPC 复制和数组持有。

当前 [keyboard/list-adapter.ts:30](../../packages/app-vue/src/shared/keyboard/list-adapter.ts#L30) 通过已渲染 DOM 和 getComputedStyle 枚举可见项目。若直接替换 v-for，键盘只能在已经渲染的窗口内导航。需要让导航基于逻辑 ID/索引，移动到未渲染项时先滚入视口再恢复焦点，保留选中项、过滤后定位和 Page/Home/End 等合同。

分页/增量数据与虚拟 DOM 应一起测；shallowRef 只在数据确实按不可变根引用更新时采用，不能机械替换所有深响应状态。

## 6. 通知窗口：入口太重，隐藏后的工作没有独立收束

[renderer/main.ts](../../apps/desktop/src/renderer/main.ts) 已为 auth、Focus、Intervention 分别选择 bootstrap，custom-notification 则落入完整 bootstrapMainApp。其路由虽然使用空布局，仍先加载 app 服务、auth/account hydration、router、Pinia、Query runtime 和平台初始化；第 3 节的 snapshot 网络等待也会延迟通知 renderer ready。

[CustomNotificationManager](../../apps/desktop/src/main/services/custom-notification.manager.ts#L45) 在首次 dispatch 时懒创建窗口，此后复用。**不是每次启动必然先创建通知窗口**。窗口设置了 contextIsolation、关闭 nodeIntegration，但 sandbox=false、backgroundThrottling=false。

[CustomNotificationView.vue:176](../../apps/desktop/src/renderer/CustomNotificationView.vue#L176) 每 100 ms 更新时钟，只在 unmount 清理。manager 在内容高度归零时 hide，隐藏不等于卸载。因此首次通知后，隐藏状态仍保留回调；本轮未测得它造成多少 CPU，也不能说整个页面每秒一定完整渲染十次。

队列还有独立边界：renderer 未 ready 时持续排队，没有数量上限或 ready deadline；manager 没有完整显式 destroy 合同。通常提醒流量下不一定明显，但启动失败/重载/持续事件会放大保留。

建议采用已有的轻量 bootstrap 模式，让通知只持有主题、展示数据和必要 IPC。再定义：

- 仅有可见 toast 时运行倒计时/进度更新，清空时停止；native show/hide 状态由窗口 owner 明确传递。
- 空闲后回收与短时复用做实测取舍，给窗口、IPC listener、计时器一个可重复调用的 dispose。
- renderer ready 有时限，瞬时展示队列有上限/合并策略；通知事实仍由持久化 inbox 保留，不能为降低内存丢弃业务提醒记录。
- Profile 切换清理旧展示，点击动作绑定原 scope 并由主进程重新验证权限，迟到事件不得误作用于新 Profile。

Electron 官方指出 backgroundThrottling=false 会使 hidden/minimized 页仍报告 visible，因此只添加 visibilitychange 监听不够。关闭该选项也需验证通知展示与倒计时，而不能把可靠投递依赖 renderer 时钟。sandbox/IPC 能力收敛可以同边界审查，但它属于安全设计，不是已测得的性能收益。

## 7. KeepAlive 与失效刷新：保留草稿不必保留全部后台工作

现有 Shell 已限制最多 8 个业务 Tab（[useAppShellStore.ts:28](../../packages/app-vue/src/layouts/shell/useAppShellStore.ts#L28)、[AppShell.vue:1078](../../packages/app-vue/src/layouts/shell/AppShell.vue#L1078)）。保留实例用于草稿、流式状态和滚动位置，有业务价值，不应为降低一个内存截图而破坏它。

问题在于 Vue KeepAlive deactivated 不是 unmounted。已安装 TanStack Vue Query 的 useBaseQuery 在 onScopeDispose 才退订，并不会自动在 deactivated 时停止 observer；Query Core 的 active 表示至少有 enabled observer，不等于当前页面可见。gcTime 对仍持有 observer 的缓存也不负责清理。

项目存在两个需要分别核验的事件路径：

1. [invalidation-dispatcher.ts:166](../../packages/app-vue/src/platform/server-state/invalidation-dispatcher.ts#L166) 仅通过 queueMicrotask 合并当前批次，随后顺序 await active queries 的 invalidate/refetch；它不是跨多个 IPC delivery 的时间窗口合并器。
2. [desktop server-state.ts:78](../../apps/desktop/src/renderer/platform/server-state.ts#L78) 当前只把 notifications/task_plans 映射给 dispatcher；其他表在 [electron.ts:105](../../apps/desktop/src/renderer/platform/electron.ts#L105) 还有 Pinia 失效与 DOM db:tables-changed 广播。

具体例子：[GoalModuleLayout.vue:188](../../packages/app-vue/src/modules/goal/views/GoalModuleLayout.vue#L188) 在 db:tables-changed 含 goal 时直接 fetchGoals，只在 onUnmounted 移除 listener。这个组件虽已有 surfaceActive 来保护原生草稿/路由处理，该 DB listener 却没有同样门槛；KeepAlive 页面因此仍可能刷新。

建议先在 Goal owner 验证“隐藏时标脏、激活时补一次刷新”；草稿与查询视图采用各自生命周期，不能停掉 owner 的持久化、全局提醒或用户正在进行的 AI run。再在 Task 等第二个 owner 验证复用。事件频率高时，按 scope/table 合并有界失效意图，测量实际 refetch 次数、查询耗时和结果发布代次，而非一律扩大 debounce。

需要修正几种常见推断：

- 当前已有 refetchOnWindowFocus=false、retry=false；desktop networkMode=always 适用于本地 IPC。不能照搬 Web 在线策略。
- 本轮在 app-vue 未找到 refetchInterval 用例，不能说所有隐藏查询都在轮询。这里主要风险是显式失效/事件监听。
- 增大 staleTime 不会抵消显式 invalidation；降低 gcTime 不会销毁仍有 observer 的数据。
- KeepAlive、窗口 hidden 和业务 owner 后台任务是三种不同状态，需要独立定义。

## 8. AI：保留已有流式优化，收束历史与索引读取

现有实现已有 48 ms 流式 buffer flush（[useAssistantStream.ts:11](../../packages/app-vue/src/modules/ai/composables/useAssistantStream.ts#L11)）、120 ms Markdown 渲染节流（[AIMessageContent.vue:13](../../packages/app-vue/src/modules/ai/components/AIMessageContent.vue#L13)）与接近底部才自动滚动。stream 完成路径主要刷新 usage，没有每个 token/每轮强制回拉全历史；这些优化应该保留。

新的规模问题来自另一条链：

- [assistant-history.service.ts:129](../../packages/ai/src/server/mastra/runtime/assistant-history.service.ts#L129) 使用 memory.recall({perPage:false})，读取、映射并排序整个历史。
- [useConversationProjection.ts:99](../../packages/app-vue/src/modules/ai/composables/useConversationProjection.ts#L99) 在加载/切回会话时替换完整 timeline。
- [AIMessagePanel.vue:16](../../packages/app-vue/src/modules/ai/components/AIMessagePanel.vue#L16) 对消息全量 v-for。
- Mastra 的 lastMessages=40 是模型上下文配置，不是 UI 历史页大小上限。

应测量 100 / 1,000 / 5,000 条消息下的 recall、IPC payload、状态投影、Markdown/DOM 分段成本，再决定游标历史 + 稳定消息 identity + 锚定滚动。正在流式更新的最后一项和历史页需分开，加载旧页不能替换或复制正在运行的消息。工具审批、原生 review 与离开保护也属于验收合同。

AI 的 Vault 检索还会受第 4.6 节的扫描放大影响，先复用 Vault lookup/index。当前 Mastra dispose 已 abort 运行、等待 memory flush 并关闭 storage（[mastra-ai.runtime.ts:214](../../packages/ai/src/server/mastra/runtime/mastra-ai.runtime.ts#L214)）；本轮没有证据把它也归为“缺少关闭的存储泄漏”。

## 9. 主进程与安装包：先区分加载、执行和落盘成本

### 9.1 可以剖析的入口

main 静态导入多个业务模块及 composeAI；[compose-ai.ts:103](../../apps/desktop/src/main/runtime/compose-ai.ts#L103) 创建 Mastra，模块 start 等待 init。[AI storage.ts](../../packages/ai/src/server/mastra/runtime/storage.ts) 同时静态导入 LibSQLStore 与 PostgresStore，而 desktop 选择 libsql。宿主专用导入/按需加载值得验证，但尚未量化它们在主 bundle 或启动中的实际占比。

延迟激活应以 capability 为单位、由现有 owner 持有单次初始化及取消：本地 access、持久化、到期提醒等不能随页面进入才启动；大型编辑器、图表、非首屏 AI UI 等可先通过模块 trace 判断。减少传输和重复投影常比单纯把整个模块挪到另一个进程更直接。

[vite.config.mts:169](../../apps/desktop/vite.config.mts#L169) 只关闭 **main** 的 tree-shaking，注释记录了 pinned Rolldown 1.2.9 对 Mastra filesystem reexport 的 panic。不能直接打开后只跑 typecheck；需要在兼容版本/最小复现中确认问题，再过 main build、依赖闭包和正式包 smoke。

PowerSync 本身已经把 SQLite 执行放到 Node Workers。剩余主线程瓶颈可能在解析、normalization、数组映射、排序和 IPC 序列化；先用事件循环/CPU trace 定位。Worker 适合独立 CPU 工作；utilityProcess 适合需要额外故障隔离和生命周期的服务，但增加进程及通信成本，不保证总内存下降。

### 9.2 本地历史产物不能充当当前包体基线

工作区曾留有 dist-electron 9,767,244 bytes / 39 files，dist-renderer 11,406,423 bytes / 89 files；没有可验证的 SHA 归属，因此仅说明产物存在。已有 Linux app.asar 为 568,565,201 bytes（约 542 MiB），属于 **0.12.0**，不是本轮 0.16.0 当前包，更不是 Windows 安装包。

当前源文件 [profile1.png](../../packages/assets/src/images/avatars/profile1.png) 为 4,082,230 bytes、1920×1080，确实偏大；但本轮未找到 app-vue 直接使用，export/emitted 不代表用户路径加载了它。先验证引用与网络/解码轨迹，再决定压缩、替换或删除。

当前 runtime packaging 已有依赖闭包、Winston、native module 与 PowerSync Worker 校验，应复用。包体审计至少分别给出：下载安装包、解压安装目录、app.asar、原生 unpacked 文件、运行时实际加载模块。native 二进制/引擎不可只看名字就删；冷启动和平台 ABI 必须在相同 revision 正式包验证。

## 10. 如何补上可信的桌面性能基线

### 10.1 当前观测存在两个容易“假绿”的缺口

[AI Web 性能测试](../../apps/web/e2e/performance/ai-workspace-performance.spec.ts#L81) 中 FCP/LCP 缺失时超时返回 0，而断言只在数值大于 0 时执行。意味着指标未采到也可能通过。应让“metric 缺失/场景未完成”明确失败或标记不可比较，不能计为 0 ms。

[Desktop packaged runtime 测试:81](../../apps/desktop/e2e/packaged-runtime/packaged-runtime.spec.ts#L81) 使用 --disable-gpu 和 --disable-dev-shm-usage，Linux 另带 no-sandbox。它是有价值的运行正确性 smoke，但不能沿用来证明正式 GPU 渲染性能；性能车道需真实默认启动参数，并记录任何诊断开关。

开发态 [memory-monitor.ts:103](../../apps/desktop/src/main/utils/memory-monitor.ts#L103) 的 process.memoryUsage 也不代表整应用：RSS 覆盖当前进程，heapUsed 等字段仅反映调用线程；不能覆盖各 renderer 与各 Worker JS heap。

### 10.2 必须记录的指标及口径

| 层次 | 指标 | 用途 |
| --- | --- | --- |
| 启动 | main entry、DB ready、local runtime ready、window visible、首屏可读写、cloud ready | 区分壳层出现与真正可操作 |
| 进程 | app.getAppMetrics 的 pid + creationTime、类型、CPU、workingSetSize、Windows privateBytes | 覆盖 main/renderer/GPU/utility，避免 PID 复用误判 |
| 线程/资源 | Worker 创建和 exit、打开 DB、订阅、timer、query observer、owner scope | 用资源计数解释残留，进程数不能代替 Worker 数 |
| 主线程 | event loop delay、长任务、CPU profile、GC | 区分异步等待与同步阻塞 |
| 数据路径 | 文件读取次数/字节、解析数、查询行数、索引更新量、IPC bytes、refetch 数 | 找到数据规模放大的阶段 |
| 交互 | 输入至结果、列表滚动、Tab/会话切换、流式响应、后台恢复 | 衡量用户实际路径 |
| 持续运行 | 空闲/隐藏/最小化 CPU、重复循环后资源平台、恢复后提醒正确性 | 区分合理缓存与持续保留 |

Electron ProcessMetric 的 CPU 是前后采样之间的平均值，内存字段单位 KB；Node memoryUsage 单位 byte。Windows privateBytes 与 working set 含义不同，后者不能简单相加当作完全独占物理内存。Linux RSS 不下降可能含分配器碎片，不能单靠 RSS 判泄漏；Worker 的 RSS 也不能逐线程相加。

### 10.3 Windows 正式包验收矩阵

以下是后续实施的设计，**本轮未执行**：

| 场景 | 数据/条件 | 硬性行为验收与测量 |
| --- | --- | --- |
| 本地启动 | guest；已缓存 cloud Profile；有/无 PIN；无网/弱网/会话过期 | 本地内容可操作不依赖云请求完成，云失败状态正确 |
| 启动分层 | 安装首次；新进程重启；系统重启后启动 | 分别记录文件缓存条件，不能把新进程都叫冷启动 |
| Profile 生命周期 | A/B 反复切换 20 轮；打开未完成时锁定；关闭失败注入 | 旧代次不复活，非活动 DB Worker 为 0，当前活动实例数量稳定 |
| Vault 规模 | 100 / 1k / 10k / 超过 10k；大小文件混合 | 完整性显式，重复 ID 被正确处理，索引前后结果一致 |
| Vault 变化 | 外部修改、rename/delete、解绑重绑、权限失败、休眠恢复 | 索引可恢复，在途结果不串库，不把不完整扫描当否定事实 |
| 通知 | 从未通知；首次显示；隐藏；连续到达；renderer 失败 | 隐藏时无不必要时钟、展示队列有界、持久化提醒不丢 |
| 页面缓存 | 8 个 Tab，包含草稿/原生 review；DB 高频失效 | 非可见页面刷新有界，激活补刷新，草稿/审批继续正确 |
| 长会话 | 100 / 1k / 5k 条消息，带 Markdown/工具结果/正在流式项 | IPC/DOM 有界，旧页加载保持锚点和活跃消息 |
| 整机稳态 | visible/hidden/minimized；空闲与到期提醒；电源场景分组 | CPU、唤醒、进程内存和资源计数，恢复后交互正确 |
| 正式包 | 相同 SHA、构建配置、签名和默认启动参数 | 依赖/Worker/native/更新关闭合同无回归 |

固定 OS、CPU、内存、磁盘、缩放、电源模式、杀毒软件状态与数据集摘要。先做少量试运行排除场景错误，再收集足够重复样本，例如每关键场景至少 30 次并保留全部原始数据；尾部噪声大时增加样本。对比同机同数据的变更前后，不在共享 CI 单次跑分上设苛刻门槛。

### 10.4 可执行门槛与探索目标分开

可立即作为确定性门槛的包括：关闭完成后该实例 Worker=0；旧 generation 发布=0；空 toast 的周期 timer=0；索引不完整时不能宣称 ID 不存在；缺失性能 metric 不计为成功；与搜索规模无关的重复 binding 读取被消除。

附件的“10,000 篇热索引普通查询 p95 200 ms”可保留为**探索目标**，需单列中文短词回退、索引构建中和冷启动场景。后台平均 CPU <1% 也只能在明确硬件、统计口径和无业务任务条件下评估。启动/内存收益先建立 Windows 同机基线，再定相对回归门槛；本报告不承诺某个绝对 MB 或节省比例。

## 11. 建议的资源归属与实施纵切

### 11.1 不新增全能的性能管理器

这些优化可以落在现有 owner；性能观测只记录事实，不负责接管业务状态。

| 资源/工作 | 应有 owner | 停止或失效边界 |
| --- | --- | --- |
| PowerSync DB、连接池、广播 | Profile runtime / database lifecycle | prepared 失败、deactivate、quit；先完成既有停止协议 |
| 云校验、同步连接恢复 | CloudConnectionManager，绑定 Profile generation | 切换、锁定、注销、超时；迟到结果不得发布 |
| Vault lookup/index、文件变更队列 | 当前 Profile 的 LocalVaultRuntime 或其内部模块 | binding 更换、detach、Profile 关闭；派生数据可重建 |
| 搜索/打开/扫描请求 | 发起操作及其 scope | 新请求、scope 变化、取消；worker/后台批次也停止 |
| 通知窗口、展示队列、计时器 | 设备通知能力 / window manager | toast 清空、窗口回收、Profile 变化、应用关闭 |
| 页面 query/DOM listener | 对应业务 surface | deactivated 暂停工作，activated 补刷新，unmounted 释放 |
| AI run / 历史页面 | AI runtime / conversation projection 各持其职责 | run 依业务终止，历史按 cursor 释放；切页面不随意取消用户 run |
| 持久化 Scheduler / Routine 提醒 | 原有后台 owner | 依到期/取消/退出合同运行，不跟随页面可见性停止 |

### 11.2 可拆成独立审查的工作包

| 顺序 | 最小纵切与依赖 | 验收证据 | 主要反效果与防护 |
| --- | --- | --- | --- |
| A0 轻量观测 | 启动阶段、Worker create/exit、关键请求读取计数；修 metric 缺失可假绿 | 确定性场景能采到非伪造指标；日志带 revision/scope，正文与凭据不落日志 | 采样本身有开销，默认低频，诊断开关可关闭 |
| A1 DB 生命周期 | Profile 打开→本地操作→切换/退出；补打开/关闭及路径合同 | 真实 SDK 资源计数回零、wrapper 时序回归、Profile/更新退出既有测试 | 不能通过清库、吞关闭失败或跳过 flush 来提速 |
| A2 Vault 正确性 | parse 缓存、binding/generation、扫描完整性与 ID 校验 | 单文件多版本缓存有界；10,001 篇重复 ID；A/B 切换反例不再成立 | 禁用解析缓存后 CPU 可能增加，用一次投影/owner 缓存消除重复 |
| B1 本地启动 | 同时拆 main 和 GET_SNAPSHOT 两个等待点；复用 cloud owner | 断网/延迟云请求下本地可编辑；只一个校验；旧 Profile 不恢复同步 | 不跳过初次本地准备，不把缓存会话当云授权 |
| B2 轻量通知 | 独立 bootstrap、空闲 timer/窗口、队列/ready 生命周期 | 首次与热通知、隐藏、失败恢复；持久化 inbox 与点击导航正确 | 过短回收导致反复创建；用实测决定复用窗口 |
| C1 Vault lookup/index | A2 后先完成 Repository/Vault；Goal/Task 为后续消费验证 | 全量与索引结果对照、中文短查询、变更/重建、O(KN) 放大消失 | watcher 不可靠、索引过期、短词退化；显式完整性与恢复 |
| C2 Vault 视图 | C1 后分页/摘要 + 虚拟列表/逻辑键盘导航 | 10k 列表 DOM 有界，焦点、选中、Home/End、过滤与滚动正确 | 只改 DOM 会留下 I/O；键盘不能只看当前渲染行 |
| D1 页面/AI | 先 Goal 隐藏刷新，再第二 owner；AI 历史另做纵切 | Tab 草稿保持、refetch 有界、长会话分页/流式锚点 | 不能为省资源卸载未保存草稿或中断审批 |
| D2 主进程/包体 | A0 数据 + 当前 SHA Windows 包；只改实测大项 | bundle/模块加载证据、native/Worker/依赖闭包、默认 GPU smoke | tree-shaking panic、动态导入仍被打包、错误删运行时文件 |

这些是研究建议，不是已授权且完成的产品任务列表。实施时先写行为 characterization/contract tests，再在最小真实 owner 上验证；至少第二个稳定用例后才提升抽象。不要把本轮研究计划的归档误读为这些工作包已经实施。

## 12. 上游一手资料怎样支持这些选择

资料提供机制与可迁移经验，不提供 MemoFlow 的实测收益。以下均在本轮核验；SDK 版本实现细节另见第 2 节的已安装源码。

| 来源 | 直接支持的事实/经验 | 对本项目的适用边界 |
| --- | --- | --- |
| [Electron Performance](https://www.electronjs.org/docs/latest/tutorial/performance) | 先剖析，避免主进程长任务，减少过早加载 | 分阶段记录启动/解析/数据库/渲染，不因 async 名称误认为离开主线程 |
| [Electron WebPreferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences) / [Page Visibility](https://www.electronjs.org/docs/latest/api/browser-window#page-visibility) | backgroundThrottling 会影响计时器与页面可见性 | 通知 native hidden 状态和页面刷新要一起设计 |
| [ProcessMetric](https://www.electronjs.org/docs/latest/api/structures/process-metric) / [MemoryInfo](https://www.electronjs.org/docs/latest/api/structures/memory-info) | 进程 CPU/内存、KB 单位与 Windows private bytes | 不用 main heap 或单 renderer 指标代表整应用 |
| [Node memoryUsage](https://nodejs.org/api/process.html#processmemoryusage) / [Worker threads](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html) | Worker 内存口径、CPU 工作与异步 I/O 区别 | 先量化重复读取/解析，再决定迁移计算 |
| [Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process) | 独立 Node 子进程、MessagePort、serviceName | 用于必要隔离，不当作总内存下降保证 |
| [Vue KeepAlive](https://vuejs.org/guide/built-ins/keep-alive.html) / [Vue Performance](https://vuejs.org/guide/best-practices/performance.html) | deactivated 生命周期、列表虚拟化与浅响应边界 | 保留草稿，按页面暂停刷新；先限制数据，再限制 DOM |
| [TanStack Query defaults](https://tanstack.com/query/v5/docs/framework/vue/guides/important-defaults) / [focus](https://tanstack.com/query/latest/docs/framework/vue/guides/window-focus-refetching) | query 缓存、失效与焦点模型 | 结合已安装 useBaseQuery/Query Core，active 不等于可见 |
| [SQLite FTS5](https://www.sqlite.org/fts5.html) / [LIKE optimization](https://www.sqlite.org/optoverview.html#the_like_optimization) / [SQL expressions](https://www.sqlite.org/lang_expr.html#the_like_glob_regexp_match_and_extract_operators) | 分词、trigram、短词与 LIKE 限制 | 保留中文子串、字面符号、排序和完整性，验证执行计划 |
| [Unicode UAX #15](https://www.unicode.org/reports/tr15/) | Unicode normalization 的语义 | 索引与查询一致归一化，原文和高亮偏移单独处理 |
| [gray-matter source](https://github.com/jonschlinkert/gray-matter/blob/master/index.js) | 默认完整内容缓存及 clearCache | 具体结论以安装的 4.0.3 源码与本轮缓存实验为准 |
| [Slack incremental boot，2016](https://slack.engineering/getting-to-slack-faster-with-incremental-boot/) | content visible 与 fully loaded 分开衡量 | 首屏出现和本地可操作分别验收，不迁移历史秒数 |
| [Slack memory，2017](https://slack.engineering/reducing-slacks-memory-footprint/) | 后台只保留必要业务工作；卸载 DOM 不一定够 | 通知/草稿/提醒和隐藏页面计算分开，不照搬旧多 webview 架构 |
| [VS Code sandbox，2022](https://code.visualstudio.com/blogs/2022/11/28/vscode-sandbox) | 重工作隔离、MessagePort 与通信路径 | 按需求选择进程，旧 AMD/shared-window/cache 技术不原样搬到 Electron 44 |
| [Notion faster page load，2021](https://www.notion.com/blog/faster-page-load-navigation) | 本地 SQLite、缓存和代码拆分共同改善用户路径 | 本项目已有 SQLite，关键仍是本地读取能否绕开无关网络和全量模型 |

## 13. 可复现证据与本轮验证

### 13.1 保存在仓库的实验

全部使用随机临时目录中的合成数据，正常完成后清理；不访问真实用户 Profile/Vault，不建立同步网络连接。JSON 是本轮结果快照，脚本默认向 stdout 输出；传入输出文件时使用 exclusive create，避免覆盖已存证据。

从仓库根目录、当前依赖已安装且 Node native ABI 匹配时运行：

```bash
node --expose-gc docs/analysis/evidence/2026-10-09-desktop-performance/powersync-sdk-experiment.mjs
node docs/analysis/evidence/2026-10-09-desktop-performance/powersync-wrapper-experiment.mjs
node --expose-gc --import tsx docs/analysis/evidence/2026-10-09-desktop-performance/local-vault-experiment.mjs
```

这是独立诊断脚本，不是新的生产 benchmark framework，也不替代 Nx 回归测试。Vault 脚本含多轮 10k 扫描，运行需数分钟；源码变化后的结果应另存并记录 revision，不能覆盖本轮基线再声称是同一实验。

| 证据 | 本轮结果 | 解释范围 |
| --- | --- | --- |
| PowerSync SDK probe | exit 0；6→6→0，GC 后仍 6，最终关闭 0 | 真实 SDK 生命周期，不是整应用内存曲线 |
| PowerSync wrapper probe | exit 0；两个并发反例成立 | 真实 wrapper + fake 依赖，非 UI 事故 |
| Local Vault probe | exit 0；3 档读取计数、缓存/截断/切换反例完成 | 当前源码 + 合成文件；未包括 renderer/Windows |
| repository 现有 focused tests | 1 文件，15/15 通过 | 固定既有 Vault 基本行为，不代表新发现已修复 |
| desktop 现有 focused tests | 2 文件，15/15 通过 | CloudConnectionManager / ProfileRuntimeManager 既有合同 |
| governance/docs 与 diff | governance-check 通过（含文档检查），diff --check 通过 | 研究文件和归档索引的仓库一致性 |

已执行的现有测试命令：

```bash
pnpm nx run repository:test --args='src/electron/local-vault-runtime.spec.ts'
pnpm nx run desktop:test --args='apps/desktop/src/main/profile/desktop-cloud-connection-manager.spec.ts apps/desktop/src/main/profile/DesktopProfileRuntimeManager.spec.ts'
```

本轮没有执行产品 build/deploy，也未运行 Windows 安装包性能测试；研究结论没有宣称修复已发布。会话未暴露 CodeGraph / nx-mcp，采用仓库源文件、符号引用与 Nx CLI 核验；不另建项目事实源。

[研究执行记录](../plan/archive/2026-10-09-desktop-performance-research.md) · [实验数据交互摘要](./evidence/2026-10-09-desktop-performance/experiment-summary.html)。
