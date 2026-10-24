# WSL mirrored 网络调查与 Storybook 验证

2026-10-24，接续 #610，工作树 `/home/baker/projects/memoflow`，起点 `88d452338`。本记录区分观测、源码机制与尚待证明的归因；没有变更主机网卡、WSL 模式、VPN、DNS 或系统服务。

## 已确认

- Windows 11 `10.0.26200.9711`，WSL 包 `3.0.3.0`，发行版运行于 **WSL 2**，内核 `6.18.54.1-microsoft-standard-WSL2`。WSL 包版本 3 不表示存在“WSL 3”运行架构。
- `.wslconfig`：`networkingMode=mirrored`、`hostAddressLoopback=true`；`/etc/wsl.conf` 开启 systemd。
- Linux `eth1` 的 VMBus parentdev 与 Windows `vgate0` 的 InterfaceGuid 均为 `57D7B15A-AF86-46F3-8F0D-E15A0AF58027`。Windows ifIndex 38，驱动 `wintun.sys` 0.14.0，描述 `Rust Wintun Tunnel Tunnel`，IPv4 `172.30.231.102/32`。这是该 Windows 适配器的镜像，不是普通 DHCP 网卡。
- `eth2` 对应物理以太网/default route；`eth3` 对应 Tailscale。Tailscale CLI 状态 Running。不能将 eth1 的变化直接归因于 Tailscale。
- NetworkManager/systemd-networkd 均 inactive、相关 journal 无记录；netplan 和 systemd/network 目录为空，检查的 systemd timer/cron 未发现两秒配置任务。这降低 Linux 网络管理器竞争的可能性，不构成全进程排除证明。

## 同步观测

命令 `timeout 36 ip -ts monitor address route link` 在 20:54:48.580456 至 20:55:22.304650 捕获 **16 次同一 IPv4 删除并立即重新添加**。相邻间隔均值 2.248s、最小 1.187s、最大 2.462s。没有观察到地址换成不同值，不能称为“不断获取新 IP”。同时涉及 IPv6 link-local 地址和 local/table 128 路由恢复；采样中未见物理默认路由或 Tailscale 地址同样循环重建。

先前独立采样片段（当地时间 UTC+8）：

```text
20:53:39.871935 Deleted eth1 inet 172.30.231.102/32
20:53:39.872196         eth1 inet 172.30.231.102/32
20:53:42.126369 Deleted eth1 inet 172.30.231.102/32
20:53:42.126685         eth1 inet 172.30.231.102/32
```

Windows 使用 `iphlpapi!NotifyUnicastIpAddressChange(AF_UNSPEC)` 注册回调（返回 0），32 秒窗口未收到通知；另一次 `NotifyIpInterfaceChange` 32 秒窗口也未收到通知。地址监听窗口与上述 Linux 采样重叠；接口监听是之后的独立窗口。此结果支持“Windows 地址稳定，WSL 重复应用配置”，但不能排除未采集的路由、HNS 状态或通知链问题。没有以定时 Get-NetIPAddress 快照冒充完整事件跟踪。

## 机制与证据边界

在 [WSL 3.0.3 NetworkManager::ModifyAddress](https://github.com/microsoft/WSL/blob/3.0.3/src/linux/init/NetworkManager.cpp) 中，Update 会保存路由、修改地址并恢复接口路由。[GnsEngine](https://github.com/microsoft/WSL/blob/3.0.3/src/linux/init/GnsEngine.cpp) 将宿主的 GNS 请求分发至该方法。

[WslMirroredNetworking.cpp](https://github.com/microsoft/WSL/blob/3.0.3/src/windows/service/exe/WslMirroredNetworking.cpp) 的 `SyncIpStateWithLinux` 在接口更新或地址待同步时发送地址更新；同步失败时 `UpdateAllEndpointsImpl` 启动重试。[同版本头文件](https://github.com/microsoft/WSL/blob/3.0.3/src/windows/service/exe/WslMirroredNetworking.h) 设置退避 100ms 起、上限 **2000ms**。

**当前判断：WSL mirrored/GNS 对 vgate0 的同步重试是优先候选。** 源码路径、周期和同地址重建形态相符，尚不能证明本机触发的具体 HRESULT、失败地址/loopback route 或写入 PID。没有拿到本机 GNS/ETW 记录，不应把“hostAddressLoopback 与 Wintun 组合缺陷”写成已证实根因。O+Connect 日志枚举了 vgate0，但枚举并不证明它创建或持续修改该接口。

本机 `sudo -n true` 返回需要密码；Windows 日志枚举也出现访问 Security 日志未授权。没有绕过权限限制、启用高权限跟踪或停止网络组件。

## Chromium 控制实验

临时探针在 localhost HTTP 服务上持续动态 import 模块 12 秒，30 个并发请求，模块响应延迟 80ms；Chromium、服务器及探针均按相同代码运行：

- 宿主网络：1021 次请求，**126 次 `net::ERR_NETWORK_CHANGED`**。
- `unshare -Urn` 内打开 lo：841 次请求，**0 请求失败**。

请求数不同，因此不作吞吐比较；该实验独立于 Storybook，支持宿主网络事件是浏览器导入失败的触发因素。完整原始采样、探针及运行日志暂存 `/tmp/memoflow-wsl-investigation/`，临时目录不是持久交付凭据；关键结论同时记录在 #610。

## 安全修复范围与后续系统验证

本次修复测试执行适配层，详见 [Browser Mode 架构](test-architecture-storybook-browser.md)。宿主 eth1 抖动仍在，隔离不是系统根因修复。

下一步应在有权限的独立维护窗口采集 Microsoft 官方 [WSL 网络诊断](https://github.com/microsoft/WSL/tree/master/diagnostics)，关联上述 GUID 的 `SendAddressRequestToGns`、`SendLoopbackRequestToGns`、`RetryLinuxIpStateSyncTimerCallback`、HRESULT/linuxResultCode 与 Windows 路由通知。先确认失败项，再决定更新 WSL、调整具体隧道配置或验证 hostAddressLoopback；未核实某个官方修复版本对本机适用。

任何模式切换/WSL 重启前都应备份 `.wslconfig`，保存恢复命令，并准备独立 Windows 控制台。先记录 LAN、Tailscale、SSH、Windows↔WSL、DNS、互联网和 localhost 的基线；变更后重复同一采样及 Chromium/Storybook 测试。不在当前 Agent 连接内直接停止隧道或执行 `wsl --shutdown`。

## 实际验证（本轮）

- `pnpm nx run ui-storybook:test:interaction --skip-nx-cache --outputStyle=static`：基线 9.77s，修正后热启动 7.59s、移走 sb-vitest 优化缓存后冷启动 10.60s；每次 **3 文件、12 用例通过，0 skipped/todo**。均为本地收据。
- `node --test tools/test-system-v2/__tests__/vitest-reporting.test.mjs`：3/3，通过真实失败退出 7、ENOENT 和 SIGTERM→143、忽略 SIGTERM 的浏览器后代清理验证。
- `pnpm nx run ui-storybook:build --skip-nx-cache --outputStyle=static`：通过，Nx 5.8s；`ui-storybook:lint` 通过。
- `pnpm nx run ui-storybook:serve --excludeTaskDependencies`：WSL 和 Windows curl 均可读取 `http://127.0.0.1:4402/index.json`。随后 SIGTERM 结束服务，4402/63315 无监听、无本轮 Storybook/Vitest 孤儿进程、临时 socket 目录已清理。这只证明开发桥 HTTP 连通，未验证 UI 点击 Run Tests 的全部控制面。
- 全仓 `memoflow:governance-check` 已执行：依赖的 ci-cd-platform 工具测试 34/34、Test System V2 测试 122/122 和 Inventory/Architecture 通过；最终被两个 9 月遗留的 ignored Desktop dist-electron chunk 中 NotificationTemplate 词汇阻断。未降低门禁或删除这些既有产物。
- 首轮 `ui-storybook:typecheck` 被 relation/data-portability 依赖构建声明缺失阻断；直接执行 target 也发现 relation/client 声明缺失。随后 `pnpm nx run relation:build --skip-nx-cache` 成功，重跑 `ui-storybook:typecheck --excludeTaskDependencies --skip-nx-cache` **通过，6.2s**；没有为此改动产品源码或增加类型 shim。
- 显式 `MEMOFLOW_STORYBOOK_NETNS=off` 的标准执行路径在外层已隔离的命名空间内通过 3/3、12/12（7.50s），runner 本身未创建命名空间；这验证分支行为，但不是实际普通 Linux 主机或 GitHub Actions 运行，不能宣称 CI 已通过。现有 CI artifact 路径保持，测试配置没有 WSL 逻辑。
