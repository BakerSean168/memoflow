---
tags: [adr, mcp, desktop, security, networking, cloud]
description: 本地外部 MCP 宿主的主进程内形态、per-run 与持久令牌双轨、WSL 绑定策略、跨机关闭结论及与云端 MCP 的分工
created: 2026-11-19T00:00:00Z
updated: 2026-11-19T00:00:00Z
---

# ADR-124: 本地 MCP 宿主形态、凭据双轨与云端分工

**状态：** 已采纳（#1036）；跨端并发规则见 [ADR-125](./ADR-125-powersync-uplink-row-version-guard.md)

**日期：** 2026-11-19

**依赖：** [ADR-121](./ADR-121-desktop-local-agent-host-and-tool-bridge.md)（宿主与会话模型）

**关联：** ADR-004、ADR-006、ADR-029、ADR-045、ADR-046、ADR-105、ADR-116～118、ADR-123；一期 WSL 实测 [#985](https://github.com/BakerSean168/memoflow/issues/985)、[调查记录](../testing/wsl-network-investigation.md)

> 本文细化 ADR-121 第 5 节的本地 MCP 通道，修订其中「WSL 跨宿主桥不计入首批范围」与「凭据仅按会话/运行发放」两处表述；第 5 节的 Host/Origin 校验、委托元数据由宿主生成、不复制用户全局 MCP 配置等原则继续有效。业务授权仍由 ADR-123 的统一检查点裁决。

## Context

ADR-121 的本地 MCP 通道最初只服务内置本地 Agent 的 run：由宿主在会话注入时签发一次凭据，run 结束即失效。二期增加了面向用户自有 MCP 客户端（如 WSL 里的 Codex）的持久连接，设置页可创建、查看和撤销；两套凭据共用同一个 loopback 端点、同一套工具定义和同一条审计路径。三期需要把宿主形态、凭据模型、WSL 绑定、跨机取舍以及和云端 Hosted MCP 的分工固定下来，避免文档与实现各说一套。

## Decision

### 1. 宿主就是 Electron 主进程，不是独立进程

本地 MCP 宿主由 `LocalAgentToolBridge`（`packages/ai/src/server/local-agent/local-tool-bridge.ts`）在 Desktop 主进程中实现，随活动 Profile 启停。它不新起守护进程、不开第二套运行时，也不把工具执行下沉到 renderer。

- 单个 loopback HTTP 服务，`listen(0)` 随机端口，只接受 `POST /mcp`；其他路径返回 405，`Origin` 存在即 403，`Host` 必须严格等于实际绑定地址与端口。
- 无长连接会话：每个请求重新校验凭据、Profile 活跃状态和连接/客户端记录，用完即弃。
- 有界资源：请求体 ≤ 256 KiB，请求期限 30 秒，并发请求 ≤ 8，连接数 ≤ 16，活跃 per-run grant ≤ 4。
- 端点通过 `0600` 发现文件发布（URL、pid、配置提示），发现文件只提供便利，不构成授权。

**硬约束是 PowerSync 本地库单进程单开。** 本地写路径不是「调用一个 API」，而是在持有 Profile 数据库句柄的进程内开启 owner 事务：`authority.authorize(tx)`、expectedVersion/CAS、本地幂等回执与业务写入同属一次 `writeTransaction`（见 `packages/*/src/server/infrastructure/**/*-agent-mutations.ts`）。独立进程既无法安全地第二次打开同一个 SQLite，也无法共享这条事务与回执边界；加上 Profile 锁定/切换/teardown 由主进程拥有，跨进程宿主只能退化成代理回主进程，没有解耦收益。因此「独立 MCP 宿主进程」在本架构中不可行，不列为备选。

**代价**：Desktop 未运行或 Profile 未激活时本地 MCP 不可用；不承诺后台常驻、开机自启或退出后继续执行。外部客户端必须把连接失败当作正常状态处理，而不是无限重试。

### 2. 凭据双轨：per-run 授权与持久令牌

两条轨道共用同一个端点，但生命周期、授权语义和适用面不同，不能互换。

| 维度   | 内置 per-run 授权                                                                | 外部持久令牌                                                |
| ------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 签发者 | 宿主在 run 打开时自动签发                                                        | 用户在「设置 → 外部 MCP 客户端」显式创建                    |
| 形态   | 32 字节随机 bearer，仅存进程内存                                                 | 32 字节随机 bearer，明文只展示一次                          |
| 存储   | 不落盘；`grants` map                                                             | 本地 Profile 表存 SHA-256 摘要 + 8 字符前缀                 |
| 绑定   | Profile、connection、conversation、run、revision、writeScopes 快照               | owner、名称、writeScopes（`goals:write` / `tasks:write`）   |
| 失效   | run 结束/取消、Profile 锁定或切换、连接 revision 变化、显式撤销；另有 6 小时上限 | 显式撤销即时生效（索引删除 + 每次调用重读记录）；无到期时间 |
| 数量   | 同时最多 4 个                                                                    | 不设上限，可多客户端分别持有                                |
| 授权   | ADR-123 交互审批（用户禁止 > 询问 > 允许 > 档位默认）                            | scope 即预授权，显式禁止与只读档位仍优先                    |
| 适用面 | MemoFlow 自己启动的本地 Agent 会话（Codex/Claude/Pi）                            | 用户自己的 MCP 客户端长期连接（含 WSL 客户端）              |

共同约束：

- 两者都不使用云端 PAT/OAuth，不读写云端连接记录；令牌值不进入 PowerSync、数据导出、日志、审计或会话展示。
- 每次 `tools/list` 与 `tools/call` 都重新校验当前 Profile、记录存在性、撤销状态与写 scope；`tools/list` 不因「曾经授权」而放宽。
- 审计只记录工具名、来源（`run` / `client`）、允许/拒绝、有界结果码和耗时，不记录参数与结果正文。
- 两份凭据都不扩大 Agent 原生命令/文件权限；本地业务授权不替代 Agent 自身沙箱。

**持久令牌不设到期时间**是有意取舍：它只在本机回环可达、可随时撤销、每次调用都重读记录，因此用「用户可见的设置管理 + 即时撤销」替代 TTL。代价是泄露窗口依赖用户主动撤销；scope 不能原地修改，轮换方式是「新建 + 撤销旧的」。

### 3. WSL 与跨机绑定：只绑 loopback，直连即可

一期实测（#985、[调查记录](../testing/wsl-network-investigation.md)）在真机上确认：`networkingMode=mirrored` 且 `hostAddressLoopback=true` 时，WSL 内用 `http://127.0.0.1:<port>` 可直接访问 Windows 侧只绑 `127.0.0.1` 的监听器，来源显示为 `127.0.0.1`，Host 头原样透传。

据此固定绑定策略：

1. 只绑 `127.0.0.1` + 随机端口；产品组装不暴露 `bindHost` 配置，也不绑 `0.0.0.0`、局域网地址或 Tailscale 地址。
2. `Host` 校验按实际绑定值严格匹配；当前实现只接受 `127.0.0.1:<port>`。客户端必须写字面量 `127.0.0.1`，不要用主机名，也不要依赖 `localhost`（WSL 的 `localhost` 优先解析 `::1`，且当前 Host 校验会拒绝 `localhost:<port>`）。
3. 不需要薄中继、不需要端口转发、不需要为 WSL 增加来源 IP 特判。
4. 前置条件是用户的 WSL 配置，不是产品代码；NAT 模式 WSL、IPv6 与 macOS 不在已验证范围。

### 4. 跨机（Tailscale）方向：关闭

结论：**三期关闭跨机远程访问方向，不实现、不预留开关。**

理由：

- 已知跨机场景是「同一台机器的 WSL 访问宿主」，已由 loopback 直连覆盖；一期实测与现有 issue 均无「第二台物理设备访问本机宿主」的真实需求证据。
- 实测显示绑定 Tailscale IP 会丢掉 loopback 路径（WSL 反而只能走该地址），等于既扩大暴露面又不提升通用性。
- 绑非 loopback 加持久 bearer，等于把 Profile 本地数据（含未同步数据）的读写面暴露到可路由网络；要成立至少需要 TLS、设备身份、令牌与设备绑定、速率限制与远程审计，实质是重建第二个 Hosted Gateway，与本项目的单一治理运行时冲突。
- PowerSync 单进程约束不会因远程访问而改变，远程宿主仍要把请求转回同一进程，没有架构收益。

重新开启的触发条件（必须同时具备，并以实测/工单证据为准，而非「以后可能需要」）：

1. 出现真实的第二设备场景，且「在该设备上运行 Desktop 本地宿主」不可行；
2. 安全方案覆盖 TLS、设备身份、令牌绑定、即时撤销与远程审计；
3. 有证据表明 loopback-only 无法满足该场景。

届时新立 ADR 修订本文；本文的默认绑定与关闭结论在此之前保持有效。

### 5. 与云端 MCP 的分工

云端 Hosted MCP（ADR-116～118，`docs/internals/external-agent-gateway.md`）与本地 MCP 是同一协议下的两个入口，服务不同数据面。边界如下：

| 维度     | 云端 MCP                                                                 | 本地 MCP                                                                  |
| -------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 数据面   | 已同步到服务端的数据（PostgreSQL 为真值）                                | 当前 Profile 的本地库，含未上传改动与 `localOnly` 表                      |
| 在场条件 | 服务端在线；设备可不在场                                                 | Desktop 运行且 Profile 激活；离线也可读写本地                             |
| 凭据     | OAuth / PAT（audience、scope、expiry、撤销）                             | per-run 授权 / 本地持久令牌                                               |
| 写路径   | 服务端 owner command + PostgreSQL 事务回执 + expectedVersion             | 本地 owner mutation（PowerSync SQLite 事务）+ 本地回执，随 PowerSync 上传 |
| 审批     | scope 内按 ADR-123 预授权；无交互通道，询问/禁止返回 `PERMISSION_DENIED` | per-run 走交互审批；持久令牌按 scope 预授权                               |
| 工具面   | R1～R3、W1、A1；Schedule 仅在绑定 owner 端口的宿主可见                   | 复用同一批 descriptors，另有本地 Agent panel 与 Knowledge 工具            |
| 不具备   | 未同步的本地数据、桌面在场操作                                           | 服务端多实例能力、跨设备一致性保证                                        |

规则：

- 一个客户端可以同时连接两者，但不得把两边结果拼成同一个事务或同一次幂等域；写操作归它实际进入的入口所有。
- 云端不代理本地工具，本地不缓存或转发云端凭据；同名工具不因另一端存在而改变 effect 或 scope 语义。
- 工具语义（输入/输出契约、失败码、幂等键）尽量共享；执行所有权、事务边界和授权判定各自独立。

### 6. 跨端冲突规则：以 ADR-125 为准

[#1035](https://github.com/BakerSean168/memoflow/issues/1035) 已定案并落为 [ADR-125](./ADR-125-powersync-uplink-row-version-guard.md)：`goals` / `task_plans` 的 PowerSync 上行以 `version` 乐观锁拒绝过期上传，服务端返回 409 `row_version_conflict`，客户端留证后不重试该笔；云端 owner 命令继续使用 `expectedVersion` CAS。两个入口共享同一权威事实——PostgreSQL 中的 `version`——不再存在「整行后写覆盖」的默认路径。

本文 §5 的写路径与入口分工不变；冲突语义、拒绝码与客户端处理一律以 ADR-125 为准，本节不再保留第二套口径。本文定稿前的「现行 LWW、不承诺跨端冲突检测」表述自 ADR-125 起失效，界面、文档与工具回执可以声明该冲突会被检测。

## Considered Options

- **独立进程 / 常驻守护宿主**：被 PowerSync 单进程单开与 owner 事务边界否决，见 §1。
- **绑 `0.0.0.0` 或 Tailscale IP 以「顺便」支持远程**：收益为零（loopback 已覆盖 WSL），暴露面与凭据风险显著上升，见 §3、§4。
- **只保留 per-run 凭据**：无法支持用户自己的客户端长期连接，每次使用都要手工搬运短期令牌。
- **只保留持久令牌**：内置 Agent 会获得超出单次 run 的长期能力，违背最小授权；且持久令牌没有逐次审批语义。
- **本地复用云端 PAT**：把服务端凭据带进设备进程，扩大泄露面，且本地数据面并不在服务端授权范围内。

## Consequences

- 本地 MCP 的可用性绑定 Desktop 进程生命周期；这是单进程约束的直接结果，不作为缺陷修复。
- 持久令牌无到期时间，安全性依赖可见的撤销入口与每次调用重读记录；后续若要加 TTL 或设备绑定，须另立决策。
- 跨机方向关闭后，文档与代码都不应再出现「远程/尾网访问本地 MCP」的配置项或预留分支。
- 未验证项继续挂在一期记录中：NAT 模式 WSL、IPv6、真实对端入站、Electron 进程首次监听时的防火墙提示、macOS。实现与文档不一致处（例如 Host 校验对 `localhost` 的实际行为）以实现为准，并在修订对应文档时修正。
