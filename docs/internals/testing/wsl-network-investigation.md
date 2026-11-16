---
tags: [testing, wsl, networking, mcp, desktop]
description: WSL 镜像网络访问 Windows 宿主 loopback 本地 MCP 的实测环境、逐项连通性证据与绑定策略结论
created: 2026-11-16T00:00:00+08:00
updated: 2026-11-16T00:00:00+08:00
---

# WSL 连 Windows 宿主本地 MCP 的可达性调查

> 结论：本机 WSL 使用 `networkingMode=mirrored`，Windows 侧只绑 `127.0.0.1` 的监听器可从 WSL 用
> `http://127.0.0.1:<port>` 直接访问，无需绑定局域网/尾网地址，也无需薄中继；Host 校验放行
> `127.0.0.1` 与 `localhost` 即可。前提是两个 WSL 配置项（`networkingMode=mirrored`、
> `hostAddressLoopback=true`），以及客户端不要用主机名。
>
> 本文件只记录实测事实与由此得到的绑定/校验约束。ADR-121 把「WSL 跨宿主桥」排除在首批验收范围之外
> 的决策不因本文件改变；这里回答的是「在已开启镜像网络的机器上，WSL 客户端能否到达宿主 loopback 服务」。

## 1. 实测环境

| 项目                | 实测值                                                                          |
| ------------------- | ------------------------------------------------------------------------------- |
| WSL 版本            | 3.0.5.0（内核 6.18.58.1-1，WSLg 1.0.79）                                        |
| 发行版              | Ubuntu 24.04.3 LTS                                                              |
| 网络模式            | `wslinfo --networking-mode` → `mirrored`                                        |
| Windows             | 10.0.26200.9711（`ProductName` 报 Windows 10 Home）                             |
| 宿主 / WSL 共享地址 | `192.168.0.21`（以太网）、`100.67.195.121`（Tailscale）、`172.30.231.102`       |
| WSL 默认路由        | `default via 192.168.0.103 dev eth3 metric 281 onlink`                          |
| resolv.conf         | `nameserver 10.255.255.254`（WSL DNS 代理，不是宿主服务入口）                   |
| Windows 防火墙      | Domain / Private / Public 三个 profile 均 `Enabled=True`，`NotifyOnListen=True` |
| 活动网络分类        | 以太网 = Public，Tailscale = Private，vgate0 = Public                           |
| Tailscale           | 宿主 `forest` = `100.67.195.121`，在线                                          |
| Codex CLI           | `codex-cli 0.166.0`                                                             |

`.wslconfig` 相关片段：

```ini
[wsl2]
networkingMode=mirrored

[experimental]
hostAddressLoopback=true
autoMemoryReclaim=gradual
```

`/etc/wsl.conf`：

```ini
[boot]
systemd=true

[interop]
appendWindowsPath=false

[user]
default=baker
```

镜像网络的关键事实是 **WSL 与 Windows 共享同一组地址**（上面三个地址在两侧同时存在），WSL 侧
`ip route get 127.0.0.1` / `ip route get 192.168.0.21` 都经 `169.254.73.249` 的 `loopback0` 处理。

### 1.1 interop 的两个实测坑

`appendWindowsPath=false` 使 `powershell.exe`、`cmd.exe` 不在 `PATH` 中，必须用绝对路径
`/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe` 调用。

另一个坑更隐蔽：**当前工作目录在 `/home/...`（即 UNC 路径）时，powershell.exe 会静默卡死**
（实测 `Get-CimInstance` 调用 2 分 30 秒无任何输出，需手动终止）；`cmd.exe` 则直接打印
`UNC 路径不支持` 警告后继续执行。把 cwd 切到 `/mnt/c` 后同一条命令立即返回。任何要经 interop
起 Windows 进程的脚本都应先 `cd /mnt/c`。

## 2. 方法

Windows 侧用一次性 `TcpListener`（PowerShell 脚本，单进程、带自超时、测完即停并核对端口无残留），
分别绑定 `127.0.0.1`、局域网 IP、Tailscale IP、`0.0.0.0`，每次只起一个监听器；WSL 侧用
`curl -sS --max-time 3` 逐条探测，记录 HTTP 状态码、耗时与本地源地址。监听器回应固定文本并打印
每条连接的 `remote`，因此可以同时确认「Windows 收到了连接」以及「Windows 看到的来源地址」。

命令形态：

```bash
# Windows 侧（cd /mnt/c 后）
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\...\wsl985-listen.ps1' \
  -BindIp 127.0.0.1 -Port 18471 -Seconds 300 -Label loopback

# WSL 侧
curl -sS --max-time 3 -o - -w '\nHTTP_CODE=%{http_code} src=%{local_ip}\n' http://127.0.0.1:18471/
```

每个监听器用完即 `Stop` 并复查 `Get-NetTCPConnection -LocalPort <p> -State Listen` 为空，未留下常驻进程。

## 3. 逐项实测结果

### 3.1 连通性矩阵

| Windows 监听地址       | WSL→`127.0.0.1` | WSL→`192.168.0.21` | WSL→`100.67.195.121` |
| ---------------------- | --------------- | ------------------ | -------------------- |
| `127.0.0.1:18471`      | 通（200）       | 不通（拒绝）       | 不通（拒绝）         |
| `192.168.0.21:18472`   | 不通（拒绝）    | 通（200）          | 不通（拒绝）         |
| `100.67.195.121:18473` | 不通（拒绝）    | 不通（拒绝）       | 通（200）            |
| `0.0.0.0:18474`        | 通（200）       | 通（200）          | 通（200）            |

每条「不通」都是 `curl: (7) Failed to connect ... Couldn't connect to server`，耗时 0 ms；每条「通」
都是 `HTTP_CODE=200`，耗时 6–105 ms。另测 `10.255.255.254`（`resolv.conf` 里的 nameserver）在任何
绑定下都 0 ms 拒绝：它是 WSL 自己的 DNS 代理，不是宿主服务入口，不能当作「宿主地址」使用。

### 3.2 原始证据

绑定 `127.0.0.1:18471`：

```text
--- target=127.0.0.1:18471 ---
label=loopback bound=127.0.0.1:18471
HTTP_CODE=200 time=0.068154s src=127.0.0.1
--- target=192.168.0.21:18471 ---
curl: (7) Failed to connect to 192.168.0.21 port 18471 after 0 ms: Couldn't connect to server
--- target=100.67.195.121:18471 ---
curl: (7) Failed to connect to 100.67.195.121 port 18471 after 0 ms: Couldn't connect to server
```

绑定 `192.168.0.21:18472`：

```text
--- target=127.0.0.1:18472 ---
curl: (7) Failed to connect to 127.0.0.1 port 18472 after 0 ms: Couldn't connect to server
--- target=192.168.0.21:18472 ---
label=lan bound=192.168.0.21:18472
HTTP_CODE=200 time=0.087980s src=192.168.0.21
--- target=100.67.195.121:18472 ---
curl: (7) Failed to connect to 100.67.195.121 port 18472 after 0 ms: Couldn't connect to server
```

绑定 `100.67.195.121:18473`：

```text
--- target=127.0.0.1:18473 ---
curl: (7) Failed to connect to 127.0.0.1 port 18473 after 0 ms: Couldn't connect to server
--- target=192.168.0.21:18473 ---
curl: (7) Failed to connect to 192.168.0.21 port 18473 after 0 ms: Couldn't connect to server
--- target=100.67.195.121:18473 ---
label=tailscale bound=100.67.195.121:18473
HTTP_CODE=200 time=0.077602s src=100.67.195.121
```

绑定 `0.0.0.0:18474` 时三条路径全部 200，且 Windows 侧接受日志保留真实来源：

```text
LISTENING label=anyaddr bind=0.0.0.0:18474 pid=6336
ACCEPT label=anyaddr bind=0.0.0.0:18474 remote=127.0.0.1:33760
ACCEPT label=anyaddr bind=0.0.0.0:18474 remote=192.168.0.21:37420
ACCEPT label=anyaddr bind=0.0.0.0:18474 remote=100.67.195.121:37484
```

对照：Windows 侧本地客户端访问 `127.0.0.1:18478` 返回 `WIN_CLIENT status=200`，证明监听器本身正常，
上面的通/不通来自网络路径差异而不是脚本问题。

### 3.3 主机名路径不可用

```text
$ curl http://forest:18474/
curl: (7) Failed to connect to forest port 18474 after 0 ms: Couldn't connect to server
$ curl -4 http://forest:18474/
curl: (7) Failed to connect to forest port 18474 after 0 ms: Couldn't connect to server
$ getent ahostsv4 forest
127.0.1.1       STREAM forest.localdomain
$ getent hosts forest
fe80::eceb:b058:14ff:95d8 forest
fd7a:115c:a1e0::da01:c388 forest
```

`/etc/hosts` 里 WSL 生成的 `127.0.1.1 forest` 指向 WSL 自己，`getent hosts` 又优先返回 IPv6
链路本地/尾网地址；两者都不是 Windows 的 `127.0.0.1`，因此主机名无法到达宿主监听器。

### 3.4 Host 头原样透传

用打印请求行的监听器验证真实 MCP 形态的请求：

```text
label=echo remote=127.0.0.1:35902 head=[POST /mcp HTTP/1.1 | Host: localhost:18477]
label=echo remote=127.0.0.1:35906 head=[GET /mcp HTTP/1.1 | Host: evil.example]
```

WSL 侧写的 Host 值原封不动到达 Windows（包括非 loopback 的伪造 Host），中间没有任何一层替客户端
改写或拦截。Host/Origin 校验必须在服务端自己做。

## 4. Windows 防火墙的实际表现

- 全部实测过程中 **未出现防火墙弹窗，也没有连接被拦截**。
- 但这次结果不能直接外推到产品进程：`Get-NetFirewallRule` 显示已存在两条程序级入站 Allow 规则
  （`Windows PowerShell`，`program=...\powershell.exe`，`proto=TCP/UDP`，`localport=Any`，
  profile=`Private, Public`），测试用的 `powershell.exe` 本来就在放行名单里。
- 为区分「防火墙放行」与「路径本身不过防火墙」，把 `powershell.exe` 复制成
  `%TEMP%\wsl985-nofw.exe`（不同路径即不同程序实体，不受该规则匹配）再监听：
  - 绑 `192.168.0.21:18475`，WSL 访问 `192.168.0.21:18475` → `HTTP_CODE=200`；
  - 绑 `127.0.0.1:18476`，WSL 访问 `127.0.0.1` / `localhost` → 均 `HTTP_CODE=200`。
    说明镜像网络下 WSL 与宿主之间的这条路径**按本机流量处理，没有进入入站程序规则匹配**，与
    「哪个程序在监听」无关。
- 未验证的部分（不要在文档或评审中当成已测通）：
  - **真实对端入站**：局域网其他主机或尾网其他节点访问该监听端口是否被拦截。本次只有一台机器，
    没有第二条真实链路，记为「未验证」；若日后改为绑非 loopback 地址，需要另一台设备实测。
  - **MemoFlow Desktop（Electron）进程首次监听**是否触发 `NotifyOnListen` 弹窗。现有规则是按程序
    路径匹配的，Electron 不在名单内；本次只用改名副本做了一次性验证，没有用应用进程实测，故记为
    「需用户操作」：真机首次由应用监听非 loopback 端口时，留意是否出现「Windows 安全警报」并记录
    用户点击结果。
  - 未改动任何防火墙规则，也未开启防火墙日志。

## 5. 绑定与校验策略结论

1. **默认绑 `127.0.0.1` + 随机端口即可覆盖 WSL 客户端。** 在镜像网络下 WSL 直连宿主 loopback，
   与 Windows 本机客户端使用同一个入口；不需要绑定局域网/尾网地址来「让 WSL 能连」。
2. **不需要薄中继。** 中继只在 WSL 无法触达宿主 loopback 时才需要；本次实测否定了这个前提。
3. **不要绑 `0.0.0.0`。** 它虽然让三条路径都通，但同时把服务暴露给局域网与尾网，收益为零
   （loopback 已够用），风险与 ADR-121「本机监听本身不构成授权」的约束相反。
4. **不要绑局域网 IP 或 Tailscale IP。** 实测这两类绑定都会丢掉 `127.0.0.1` 路径，WSL 侧反而
   只能用该地址访问，等于既扩大暴露面又降低通用性。
5. **Host 校验放行 `127.0.0.1:<port>` 与 `localhost:<port>`。** 由于 Host 头原样透传，任何针对
   Host/Origin 的既有校验继续有效；把这两个来源列入允许集合即可覆盖 WSL，不需要为 WSL 开后门，
   也不需要按来源 IP 特判（虽然 `remote` 能区分三条路径，但没有必要用它做授权）。
6. **客户端使用字面 `127.0.0.1`，不要用主机名。** 主机名会命中 WSL 自己的 `/etc/hosts` 或 IPv6
   链路本地地址；`localhost` 也可用，但 WSL 的 `localhost` 优先解析到 `::1`，若服务端只绑 IPv4 会
   先失败再回退，显式写 `127.0.0.1` 更确定。
7. **前置条件是 WSL 配置，不是产品代码。** 结论依赖 `networkingMode=mirrored` 与
   `hostAddressLoopback=true`；默认 NAT 模式的 WSL 不在本结论范围内（见下）。
8. **IPv6 未验证。** 本次只测 IPv4；若将来绑 `::1` 或双栈，需要单独补测。

### 5.1 未确认项

| 项目                                    | 状态       | 原因 / 需要的动作                                                                     |
| --------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| NAT 模式 WSL 的等价路径                 | 未验证     | 需要改 `.wslconfig` 去掉 mirrored 后 `wsl --shutdown`，会中断当前会话；**需用户操作** |
| 真实对端（LAN / 尾网）入站              | 未验证     | 需要第二台设备实测，本次只有单机                                                      |
| Electron 进程监听是否弹窗               | 需用户操作 | 首次由应用绑定非 loopback 端口时，留意「Windows 安全警报」并记录点击结果              |
| IPv6（`::1` / 双栈）                    | 未验证     | 本次只覆盖 IPv4                                                                       |
| 非镜像但启用 hostAddressLoopback 的组合 | 未验证     | 该选项已在 `[experimental]` 且当前生效，未做关闭对照                                  |

## 6. WSL 侧 Codex 的 MCP 配置形态

本机 `~/.codex/config.toml` 与 `~/.codex/anyrouter.config.toml` 目前只有 stdio 形态的 MCP 条目
（`command` + `args`，如 `mnemosyne`、`figma`），没有任何 streamable HTTP 条目。接入宿主本地 MCP 的
目标写法如下（`codex-cli 0.166.0` 实测可解析）：

```toml
[mcp_servers.memoflow_local]
url = "http://127.0.0.1:43117/mcp"
bearer_token_env_var = "MEMOFLOW_LOCAL_MCP_TOKEN"
startup_timeout_sec = 20
tool_timeout_sec = 60
```

校验方式（不触碰真实用户配置）：

```bash
mkdir -p /tmp/codex985 && $EDITOR /tmp/codex985/config.toml
CODEX_HOME=/tmp/codex985 codex mcp list
# Name            Url                         Bearer Token Env Var      Status   Auth
# memoflow_local  http://127.0.0.1:43117/mcp  MEMOFLOW_LOCAL_MCP_TOKEN  enabled  Bearer token
```

端口与凭据值应来自宿主实际发放的会话范围，不写死在仓库里；`url` 必须用 `127.0.0.1` 字面量
（理由见第 5 节第 6 条）。
