---
tags:
  - plan
  - active
description: 修复桌面快捷键 IPC、共享视觉样式及生产 GitHub OAuth 部署缺口
created: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

# Desktop parity and production OAuth repair

## Scope and acceptance

用户授权实施 2026-10-09 诊断出的三项修复。基线为 v0.16.0 / f34eff34f4a。

- [x] Keyboard：Renderer 经真实 Preload 白名单访问 Main 设备键位存储；读取、修改、禁用、重启恢复通过。未知 IPC 通道仍拒绝。
- [x] Styles：Web/Desktop 消费同一共享全局入口，Desktop 只保留宿主窗口规则；同状态视觉回归覆盖两端入口。
- [x] Packaged gate：现有 packaged-runtime smoke 增加键位持久化验证，实际运行打包产物。
- [x] OAuth：复核 v0.16.0 Published release 证据，通过 Deploy Production 选择该版本，验证生产运行身份及 github capability/授权跳转；真实用户授权需登录会话。
- [ ] Validation：最近的 Nx targets、视觉/打包回归、仓库 validate-local-deploy；记录真实结果，不以源码通过替代产物交付。

## Execution

1. 先补可失败回归，再补 KeyboardChannels 白名单。
2. 将 Web 已有基础样式移动到 app-vue 共享入口，保留 Tailwind 各宿主扫描范围；复用视觉矩阵比较同一 fixture 的 Web/Desktop 样式。
3. 扩展打包 smoke 的键位闭环，在已有发布 gate 中执行。
4. 生产恢复可独立使用已经发布、包含 OAuth Compose 修复的 v0.16.0，无需等待桌面新版本。
5. 验证并记录源代码、打包产物、生产运行状态三种证据。

## Initial evidence

- 本轮 GET https://memoflow.bakersean.top/api/auth/capabilities 返回 providers.github=false。
- v0.16.0 已于 2026-10-08T16:13:21Z 公开；最近 Deploy Production 为 2026-10-08T03:35:03Z。
- apps/desktop/src/preload/allowed-channels.ts 未包含 KeyboardChannels。
- Desktop 未加载 base-styles.css、priority-colors.css、settings-animations.css。

## Validation and delivery

- Keyboard bridge regression: `pnpm nx run desktop:test -- src/preload/keyboard-bridge.spec.ts` 修复前因 `desktop:keyboard:keymap:get is not allowed` 失败；加入白名单后与 Store tests 合计 3/3 通过。
- 确认第二个桌面视觉根因：Vite 库构建输出 `packages/app-vue/dist/app-vue.css`，旧 Desktop Renderer 无 `.workspace-content-well[...]` 等组件规则。生产 Renderer 现于挂载前显式加载该 CSS；开发仍使用 Vue source styles。
- `pnpm nx run web:e2e:visual-regression`：57/57 通过，Web/Desktop 各 27 截图与同一组基线比较，零基线更新；另有三项交互断言。
- Production Deploy run [37885323511](https://github.com/BakerSean168/memoflow/actions/runs/37885323511)：成功。
- 生产 watcher 已记录 `DEPLOYED v0.16.0 / f34eff34f4a5567c57181c4fc5ef0d357a0a8eb1`，API OCI revision 同值；Client ID/Secret 均非空（只输出存在性，未记录值）。
- 生产 `/api/auth/capabilities` 返回 `providers.github=true`；真实登录页按钮可见，点击打开 GitHub `/login/oauth/authorize`，回调为 `https://memoflow.bakersean.top/api/auth/callback/github`。用户 GitHub 登录/同意及回调建会话仍需真人验收。
- `pnpm nx run desktop:package`：通过；最终 ASAR 的 Main/Preload 与构建输出字节一致。
- `NX_DAEMON=false MEMOFLOW_PACKAGED_EXECUTABLE=... bash apps/desktop/scripts/run-linux-packaged-smoke-with-keyring.sh`：1/1 通过（25.1 秒），包括组件样式、窗口拖动、键位修改/禁用、进程重启恢复及真实按键行为。Linux 打包验收不替代 Windows/macOS 实机验收。
- `pnpm nx run web:typecheck:visual-regression`：通过。
- 第一次本地打包与另一项检查重建同一目录发生竞争，ASAR 与构建输出字节不一致，启动 gate 拒绝；已在输出稳定后重新打包并通过，失败产物未发布。
- 完整 affected typecheck/test 通过；Desktop lint 在将库 CSS 通过宿主 `components.css` 加载后通过，避免 Nx 将整个 app-vue 误识别为动态库。
- `pnpm nx run memoflow:governance-check`：通过；公开组件 CSS 入口已纳入现有 export whitelist。
- 本地生产式 Docker 构建和服务健康通过；首次验收期间修改了计划文档，导致工作树指纹变化，最终验收会对固定提交重新运行。以 `reports/local-deploy-validation/latest.json` / `latest.md` 为最终验证状态（包含 lint/typecheck/test、运行镜像身份与服务健康）。
- 本计划保留到修复合并、新 Desktop release 与 Windows/macOS 实机验收完成。
- 源码修复尚未进入新的公开 Desktop release；不得把生产 OAuth 恢复或本地打包等同于用户 Windows 安装包已更新。
