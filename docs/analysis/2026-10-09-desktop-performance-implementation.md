---
tags:
  - analysis
  - desktop
  - performance
  - validation
description: Electron 性能优化的实际改动、前后对比、回归验证与适用范围
created: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

# Electron 性能优化实施与验收

本轮落实了[性能研究](./2026-10-09-desktop-performance-research.md)中有源码和实验支持的优化：释放 Profile 数据库资源，减少 Vault 重复读取与列表挂载，将云校验移出本地启动关键路径，并限制通知及隐藏页面的工作量。实验基线为 `f34eff34f4a5567c57181c4fc5ef0d357a0a8eb1`，初始实现快照由下文源文件哈希清单记录。

实施、工程复审、完整本地验证及 Linux Electron 解包产物运行检查已完成。下文将 Linux 源码实验与 Electron 正式包体验分开记录；没有测量 Windows 启动时间、整应用内存或耗电改善。

## 实际改动

### Profile 与 PowerSync 生命周期

[PowerSync wrapper](../../apps/desktop/src/main/database/powersync.ts)区分打开、连接、断开与关闭。离线或取消云连接保留本地数据库；锁定、切换和退出通过 SDK `close()` 释放实例及变更监听。相同规范化路径合并打开，不同路径不能共享实例，打开期间关闭也不能重新发布旧实例。关闭失败保留 owner 并允许重试，不调用清库操作。

SDK 的 `connect()` 可能直到取消连接才返回，因此取消先中止 connector 并启动 `disconnect()`，再排空连接任务。凭据请求设 5 秒截止，CRUD 请求设 15 秒截止，关闭不再排队等待一个只能由断开终止的连接。最终源码已通过真实 SDK 和真实 Worker 实验。

[Profile runtime](../../apps/desktop/src/main/profile/desktop-profile-runtime-manager.ts)在持久化 flush 成功后撤销 active 访问；flush 失败仍可否决锁定。准备、激活与关闭有明确所有权：锁定等待已开始的准备，后续准备在实际拆卸前等待当前激活，准备中途失败也清理已打开的数据库。失败关闭不重新暴露 prepared runtime，重试不重复销毁模块。

### Vault 搜索与读取

[LocalVaultRuntime](../../packages/repository/src/electron/local-vault-runtime.ts)保留 Markdown 事实源，新增可丢弃的当前版本缓存。缓存以路径、文件身份、大小和修改时间失效；解析时显式绕过 `gray-matter` 的进程全局全文缓存。缓存预算为 **128 MiB 核算载荷**，计算包含两倍序列化大小与条目开销，不能解释为 RSS 上限。公开 DTO 不共享可变缓存对象。

冷搜索每篇正文读取一次；重复搜索复用正文；修改一篇时只重读该篇。扫描以 8 个并发读取为一批，同次目录工作可共享。稳定文档 ID 查找复用目录投影，Relation 与 AI 知识适配器不再为每次定位重复全量解析。

每次操作固定 Vault 绑定、根目录与代次，切库、解绑、销毁取消旧读取，写入串行排空。空查询也会取消该 renderer 的旧 IPC 搜索。扫描预算为 100,000 个目录条目；超过预算或身份校验不完整时不能据此认定 ID 不存在。重复稳定 ID 拒绝写入，不再在 10,000 篇处静默丢弃目录。保留 NFKC、多词 AND、中文短词和字面符号语义，Unicode 命中映射回原文，长行截取包含实际命中。

**剩余成本：**每次新扫描或搜索仍遍历文件元数据；本轮没有持久索引、文件系统 watcher 或 FTS 分词迁移。

### 本地启动与云校验

[Cloud manager](../../apps/desktop/src/main/profile/desktop-cloud-connection-manager.ts)的本地状态读取不发网络请求。保存过但尚未远端确认的会话显示 `CHECKING`，本地 shell 可挂载，云能力仍关闭。显式后台刷新合并同一在途校验，并为请求和响应体设置 5 秒截止。远端数据经 schema 验证，结果还须属于当前 Profile、账号和 token。

认证、恢复与退出登录由同一 owner 协调；旧校验不能覆盖新会话，退出先取消并排空已开始的保存，再删除本地 session。远端撤销在本地退出后执行。临时认证信号只拥有未完成的认证；认证提交后，长期同步凭据归当前 Profile 和 PowerSync，取消已完成的登录尝试不会破坏被 flush 否决锁定的 Profile。

### 通知与页面工作量

[通知入口](../../apps/desktop/src/renderer/bootstrap/custom-notification.ts)只启动通知视图，不装载主应用路由、Pinia、完整依赖注入或云启动流程。窗口恢复后台节流；只有可见且非空的通知列表运行 250 ms 展示时钟。计时器、声音、尺寸更新与窗口销毁均有清理路径。

通知窗口最多展示 5 条，主进程待展示队列最多 32 条，renderer 就绪等待最多 10 秒。溢出只移除展示，保留持久化未读语义；点击使用主进程保存的载荷并校验发送窗口。Profile 停用清理展示，进程 capability 最终销毁时再移除 IPC handler。

[Vault 页面](../../packages/app-vue/src/modules/repository/views/LocalVaultWorkspaceView.vue)改用虚拟列表，普通行 56 px、搜索行 100 px，额外渲染 6 行。键盘导航基于完整逻辑目录，滚动渲染后再聚焦，可到达第 10,000 条。笔记、目录与结果使用浅响应引用；过期读取、搜索和错误不再覆盖新状态。KeepAlive 恢复时先读绑定与健康状态，覆盖同库刷新、A→B、未绑定→绑定、解绑和目录丢失。

Goal 隐藏时只记失效状态，重新显示合并刷新，保留草稿。性能 E2E 的 FCP、LCP、heap 缺失不再静默视为通过。

## 实测对比

### Vault 重复搜索

同一 Linux x64 环境，Node `24.21.0`，每篇约 4 KiB 的合成 Markdown，各取 5 次重复查询的中位数。计时与 I/O 计数分开运行；未清操作系统页缓存，前后不是同时运行，宿主机存在其他负载。因此以下是该实验观察值，不是 Windows 用户体验承诺。

| 笔记数量 | 优化前中位数 | 优化后中位数 | 时间减少 |
| -------- | -----------: | -----------: | -------: |
| 100      |       238 ms |        54 ms |    77.2% |
| 1,000    |     1,605 ms |       504 ms |    68.6% |
| 10,000   |    16,274 ms |     4,229 ms |    74.0% |

10,000 篇时，单次重复搜索的正文读取从 **20,000 次降至 0 次**，绑定文件读取从 **10,001 次降至 1 次**；修改一篇后正文只读 1 次。冷搜索正文读取由 `2N` 降为 `N`。

首次查询并非所有规模都更快：100 篇为 288→497 ms，1,000 篇为 1,741→2,151 ms，10,000 篇为 23,796→12,274 ms。当前方案增加了缓存维护和正确性检查，小规模冷查询没有稳定加速证据。万篇热搜索仍约 4.2 秒，后续索引优化仍有空间。

其他实测断言：10,001 篇完整返回且末篇可搜索；重复稳定 ID 被拒绝；受控的读中切库不会发布混合结果。单篇 64 KiB 笔记连续 200 个版本后，解析器全局缓存条目仍为 0，替代原先随版本保留全文的行为。

证据：[基线结果](./evidence/2026-10-09-desktop-performance/local-vault-results.json)、[优化后结果](./evidence/2026-10-09-desktop-performance/local-vault-after-results.json)、[优化后复现脚本](./evidence/2026-10-09-desktop-performance/local-vault-after.mjs)。

### PowerSync 资源回收

最终 wrapper 源码不作逻辑替换，仅转译后接入已安装的 PowerSync Node SDK `1.1.0`、真实 schema、临时数据库和真实 Worker；Electron 窗口列表使用空列表。

| 场景                 | 实际 Worker 数 | 行为                       |
| -------------------- | -------------: | -------------------------- |
| 打开本地数据库       |              6 | 本地可用                   |
| 禁用云同步           |              6 | 本地数据库继续可用         |
| 关闭 Profile         |              0 | 实例已释放                 |
| 重新打开             |              6 | 先前写入的行仍存在         |
| 3 轮切换后的每次关闭 |              0 | 峰值为 6，没有累积         |
| 打开中关闭           |              0 | 原打开结果被取消           |
| 凭据请求挂起时断开   |              6 | 连接取消，本地数据库保留   |
| 凭据请求挂起时关闭   |              0 | 连接取消，所有 Worker 退出 |

证据：[最终源码实验结果及 SHA-256](./evidence/2026-10-09-desktop-performance/powersync-wrapper-final-results.json)、[复现脚本](./evidence/2026-10-09-desktop-performance/powersync-wrapper-after.mjs)。目录内其他 `after` 结果是中间版本，最终结论以 `final-results` 为准。

## 验证记录

| 检查                                              | 当前结果                                                      |
| ------------------------------------------------- | ------------------------------------------------------------- |
| Profile、云连接、DeviceAuth 与 PowerSync 回归     | 13 文件、103 项通过                                           |
| Desktop IPC 与主进程 boundary                     | 17 文件、84 项通过                                            |
| Vault workspace，包括 10,000 条键盘导航和绑定切换 | 11 项通过                                                     |
| Goal 隐藏事件合并                                 | 20 个隐藏 DB 事件产生 0 次读取，重新显示 1 次；相关 17 项通过 |
| affected lint、typecheck、test                    | 分别覆盖 36、33、33 个项目，全部通过                          |
| Desktop production build 与 package               | 通过；Linux x64，79 个运行时包依赖校验通过                    |
| Linux Electron 解包产物运行检查                   | 1/1 通过：真实密钥环、主界面、设置页及正常退出                |
| prod-like Docker                                  | 通过；API、Web、PowerSync 健康，运行镜像修订与工作区一致      |
| governance 与文档检查                             | 通过；保留 1 项 Nx flaky 提示                                 |

第一轮整体检查暴露的 `Intl.Segmenter` 类型库缺失和通知 bridge 的过期源码断言已经修正；测试清单由仓库生成器更新。最终 [local-deploy 证据](./evidence/2026-10-09-desktop-performance/local-deploy-final.json)为 `pass`，没有阻断项，镜像与运行容器均匹配工作区修订 `f34eff34f4a5567c57181c4fc5ef0d357a0a8eb1-dirty-a56283ff37ae`；migrator 正常 `exited 0`。

本轮未运行发布级 Web 产品旅程或 AI 性能 E2E。仓库原始 local-deploy 报告附带的旧 browser evidence 属于其他修订，已从本轮验收证据中排除；容器检查的结论限于本次构建、健康、端口与镜像身份。

[Desktop 产物与运行证据](./evidence/2026-10-09-desktop-performance/desktop-package-final.json)保存 `main.cjs`、`app.asar` 的 SHA-256 和 Playwright 结果；ASAR 内主入口与本次构建完全匹配。运行检查使用临时用户目录、独立 Secret Service 和 Xvfb，覆盖真实 Electron `44.4.5` 产物；打包后恢复本机原生模块，并验证 Node 的 SQLite 与 argon2 仍能正常运行。

[验证汇总](./evidence/2026-10-09-desktop-performance/implementation-verification.json)与[源文件哈希清单](./evidence/2026-10-09-desktop-performance/implementation-source-manifest.json)对应初始实现快照。治理命令退出码为 0；Nx 将 `test-system-v2:test:governance` 标记为 flaky，此前有一次测试清单过期失败，生成清单后本次检查通过。保留该提示，不将成功检查降级为失败。

PR 整理以 `2561a35be42` 为主线基线，保留已合入的快捷键 IPC 与共享样式修复。初始清单的 54 个文件中，52 个内容不变；renderer 入口同时保留生产样式加载和轻量通知分流，测试清单重新生成以包含两次改动的新测试。原始实验、包与容器证据保留原修订，PR 的精确提交由其 CI 单独验证。

## 工程复审

### Standards

最终剩余意见 **0**。已关闭 prepared runtime 失败关闭后仍可访问、登录写入与退出删除竞态、临时认证信号越过提交点影响长期凭据等意见。准备失败清理、排队准备与激活、锁定排空以及失效 Vault 投影均已复核。

### Spec

最终剩余阻塞意见 **0**。已关闭 SDK 连接无法被排队断开取消、旧校验覆盖新会话、Vault 绑定缺失状态遗漏、锁定遗漏正在准备的数据库及两次选择之间的准备／激活交叠等意见。对应回归先重现失败再修复；保持 flush veto、本地数据耐久性与明确的异步 scope。

两轴均为只读复审；以上记录对应实施阶段的审查结果。

## 后续范围

- **Windows 正式包：**仍需实际记录冷启动到可操作、空闲 CPU、进程及 Worker 数、私有内存，覆盖连续切换／锁定、离线重开、万篇搜索与通知突发。当前没有这些收益数值。
- **AI 历史分页：**本轮没有实现。当前 Mastra Memory 是消息事实源，完整历史接口须连同查询游标、HTTP／IPC 合同、时间线合并与“加载更早消息”交互一起调整；没有通过截断历史降低内存。
- **主进程拆分、reader 数量、FTS 和工具链：**未改动。需要实际剖析或兼容证据后再决定，不能从包大小或框架标签推断收益。

[实施计划](../plan/archive/2026-10-09-desktop-performance-implementation.md) · [可交互实测对比](./evidence/2026-10-09-desktop-performance/implementation-comparison.html)
