# MemoFlow Storybook Browser Mode：最终测试架构与 #610 验收

> 2026-10-24，WSL `/home/baker/projects/memoflow`，接续基线 `88d452338`。本地验收与 GitHub CI 执行证据分开记录；网络调查见 [WSL 网络调查](wsl-network-investigation.md)。

## 实施结论

Storybook 10.6.3 与 `@storybook/addon-vitest@10.6.3` 在 MemoFlow 已完成 Browser Mode 迁移。仍使用 Vitest 4.1.11、Vite 8.3.1，无需升级 Storybook 11 Alpha。

- **单一 Storybook 测试 Owner**：`ui-storybook:test:interaction` 调用 `tools/test/run-storybook-browser.mjs`；旧 `@storybook/test-runner`、Jest 专用配置和测试入口已退休。
- **真实 Chromium**：`apps/storybook/vitest.config.ts` 使用 `@storybook/addon-vitest/vitest-plugin` + `@vitest/browser-playwright`。现有 GoalDialog 3、TaskPlanForm 3、BrowserInteraction 6，合计 **3 个 Story 文件、12 个交互用例**。
- **防回退门禁**：Node Runner 核对 Vitest JSON 回执：3 个测试文件、12 个通过、0 失败、0 skipped、0 todo、12 个可关联 Storybook Story ID；不允许减少测试数量来制造绿色验收。
- **组件与前端集成边界**：`BrowserInteractionFixture.vue` 与六个 `BrowserInteraction.stories.ts` 是组件状态的唯一来源；原 `apps/web/e2e/goal/reference/goal-business-panel.spec.ts` 仍以 Playwright 执行实际原生键盘和前端浏览器 History，属于浏览器组件/前端路由集成，而不是真实后端 E2E。

## 直接触发因素：WSL 镜像接口反复重配置

迁移前的 Vitest Browser Mode 经常卡在 Storybook/Vite 初始化，或在加载 Story 时失败：`Failed to fetch dynamically imported module`。初看是 Vite 8/Rolldown 依赖优化。

本轮对浏览器网络请求与 WSL 的 Netlink 地址/路由变更同时取证：

- Chromium 原测试运行时出现 **约 406 次 `net::ERR_NETWORK_CHANGED`**，多在大量生产组件模块加载时，且 Vite HTTP 没有对应的 4xx/5xx 响应。
- `ip -ts monitor link address route` 在 **无 Vitest 进程的 12 秒监控窗口内**仍记录到 `eth1` IPv4 地址反复删除、重新添加 **5 次**。例：`172.30.231.102/32` 在 19:57:48、19:57:50、19:57:55、19:57:57 等时间重复配置，间隔约 2 秒。
- 改为 `127.0.0.1:63315`（而非 `localhost`）不解决问题；单独添加 `@testing-library/dom` 也不能阻止 WSL 网络事件。
- **无须更改宿主机网卡、DNS、Tailscale 或 WSL 网络模式。** 在用户级 Linux 网络命名空间（`unshare -Urn`）中启动 Vitest/Vite/Chromium，只打开内部 `lo`，相同 Storybook 配置第一条测试约 6.4 秒通过、0 网络变化错误；全量 12 条约 7.4 秒通过。
- 这证明主要阻断在当前 WSL 网络环境。Vite 8 预优化的启动耗时问题可能共存，因此保留精确优化项 `storybook/test`、`@testing-library/dom`，没有粗暴禁用优化器。

上游参考：[Vite #23030](https://github.com/vitejs/vite/issues/23030)（Vite 8 + CJS interop 的优化项修复）；[Storybook #33067](https://github.com/storybookjs/storybook/issues/33067) 与 [#33347](https://github.com/storybookjs/storybook/issues/33347)（优化与浏览器导入失败）；[官方 Vitest Addon 配置](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon/)。

## 本地与 CI 的执行方式

从仓库根目录，**统一使用已经迁移的 Nx Target**：

```bash
pnpm nx run ui-storybook:test:interaction --skip-nx-cache --outputStyle=static
```

等价地运行测试脚本：

```bash
node tools/test/run-storybook-browser.mjs
```

Runner 自动检测 WSL（`os.release()` 中包含 Microsoft）：WSL 使用非特权用户/网络命名空间以规避宿主地址变化；GitHub Linux Runner 和其他非 WSL 主机直接调用正常 Vitest + Playwright Provider。没有把 WSL 网络命名空间写入 GitHub Actions，也没有同时运行旧的 Test Runner。

`MEMOFLOW_STORYBOOK_NETNS=on` 强制使用命名空间，`=off` 显式关闭（使用宿主网络，需要外部服务时也可选择）。WSL 非特权 userns 被限制时会失败并给出具体错误，不会默默退化到不稳定的宿主 Chromium。测试只依赖同一命名空间内的 localhost；运行时无需外网。

测试产物：`test-results/storybook-results.json`。命令在 CI 非零退出或用例计数、Story ID 不符合期望时 fail-closed。

### Storybook 可视化

Storybook 的正式 `@storybook/addon-vitest` 已注册，六条通用交互场景位于 `Quality/Browser Interaction Contracts`。`pnpm nx run ui-storybook:serve` 使用相同的 `MEMOFLOW_STORYBOOK_NETNS=auto|on|off` 选择。WSL 默认在命名空间内启动服务，通过权限 0600 的独立 Unix socket 将 4402 端口转发至宿主 localhost；已验证 Windows 与 WSL 均可读取 `/index.json`。此模式没有外网；需要在线资源时选择 `off`。**本地命令行验收通过，不自动等于 Storybook UI 内的交互式 Vitest 控制面已可从隔离网络命名空间被访问**；对此以实际连通性测试为准，不能虚报。

## #610 验收证据

| 检查                                        | 证据                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 独立 Chromium 单例试验                      | 1/1 PASS，无网络变化请求失败                                                             |
| 完整 Storybook Browser Mode                 | 3/3 Story 文件、12/12 用例 PASS，约 7.44 秒                                              |
| Nx 官方 `ui-storybook:test:interaction`     | 3/3、12/12、0 skipped，约 9 秒                                                           |
| 旧 Jest + Playwright Storybook Test Runner  | 依赖、旧 Jest 配置、旧 Nx 执行命令已退休                                                 |
| Storybook 构建、lint 与测试生命周期         | 本轮构建/lint/退出码/取消清理通过；类型和全仓治理状态见网络调查的实际验证，不冒充远端 CI |
| 真正原生键盘和 History 的原 Playwright 测试 | 保留 8 条，不合并为无效模拟事件；Goal KR Scroll 偶发性见 #609                            |

注意：`storybook/test` 的 Testing Library `userEvent` 与 `vitest/browser` 的真实浏览器驱动 `userEvent` **不是同一个实现**。已用独立 Chromium 探针确认，后者 Tab 键盘事件的 `isTrusted === true` 并发生真实焦点转移。Storybook test-addon 虽执行于真实 Chromium，六条 Story 的 `play()` 仍使用 Testing Library 包装 API；严格 native 焦点回归仍由 Playwright 测试保护。

## 后续限制

- 依赖准备、完整测试、TS Build/静态治理均先在 WSL 本地运行；远端 GitHub Workflow 在代码提交后才有可信的目标 SHA Run 收据。
- WSL 宿主 `eth1` 的频繁重配仍存在，未修改网络系统配置；此工作仅隔离测试环境。若其他 WSL Chromium 测试也发生 `ERR_NETWORK_CHANGED`，需分别评估。
- 生产 API、数据库、PowerSync、Windows 安装版和第三方 AI Provider 不属于 Storybook Browser Mode；不能因为这里绿色就认定其 E2E 通过。

## 接续修正与 CI 契约

- Runner 保留已有 CI artifact 路径 `test-results/storybook-results.json`；现有 CI 的 build/preview 仍验证静态 Storybook，测试本身只执行一次 Browser Mode，不需要预览服务来加载测试。
- 测试及开发适配层在 Linux 管理整个子进程组，转发 SIGINT/SIGTERM、两秒后强制结束、退出时清理后代；保留测试实际退出码。开发桥先绑定端口，端口被占用时不启动孤儿服务；每次使用独立临时 socket 目录，退出时清理连接和目录。
- `auto` 按 WSL 身份选择隔离，不以短时“无变化”监控推断长期稳定；userns 或 `ip` 不可用时直接报错，无自动降级或重试。普通 Linux/CI 使用宿主网络。
- 本轮新验收：热启动 7.59s、清空 sb-vitest 缓存冷启动 10.60s，均 3/3、12/12、0 skipped/todo；当前没有目标 SHA 的真实 GitHub CI 收据。
