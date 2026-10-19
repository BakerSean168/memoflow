---
tags:
  - guide
  - development
  - testing
  - desktop
description: Desktop Keyboard-first 与自动更新的跨平台人工验收步骤（#493 / #494）
created: 2026-10-19T00:00:00
updated: 2026-10-20T00:00:00
---

# Desktop 跨平台验收（#493 / #494）

本文件只定义**在 Linux 上无法自动执行、必须由人真机执行**的验收步骤，以及每一步的精确命令、点击路径和预期结果。自动化已经覆盖的行为不在这里重复，直接看对应 spec。

规则：

- 不接受“看代码推断通过”作为平台验收证据，也不接受把 Linux/Chromium 的结果写成 Windows/macOS 结果。
- 每个平台每一条都要记录：执行日期、构建来源（tag 或 commit SHA）、操作系统版本、结果、失败时的截图或日志路径。
- 缺少 Apple 签名凭据、Authenticode 证书或真机时，结论写 `Blocked`，不要写 `Pass`。

## 1. 平台矩阵

| 验收面                      | Linux（可自动）                       | Windows（人工） | macOS（人工）  |
| --------------------------- | ------------------------------------- | --------------- | -------------- |
| 快捷键冲突 / 保留键规则     | 自动：`keymap.spec.ts`                | 规则级自动      | 规则级自动     |
| 焦点 / 模态 / 列表作用域    | 自动：`runtime.spec.ts` 等            | 规则级自动      | 规则级自动     |
| IME / AltGraph 真实输入     | 规则级自动（真实输入需 Chromium E2E） | W-1（人工）     | W-1（人工）    |
| OS 级组合键拦截             | 规则级自动                            | W-2（人工）     | W-2（人工）    |
| 会话内 Profile 切换注册清理 | 自动（controller 级 + reload E2E）    | W-3（人工）     | W-3（人工）    |
| 专注 / 干预窗口键盘可达性   | 自动（本 PR 新增）                    | W-4（人工）     | W-4（人工）    |
| Windows NSIS N→N+1          | 无（脚本仅 Windows）                  | U-1（人工）     | 无             |
| Linux AppImage N→N+1        | 已实跑 PASS（`U-3`，见记录）          | 无              | 无             |
| macOS 更新 feed / 可信安装  | 无                                    | 无              | U-4（Blocked） |
| 安装回执清理 / 失败恢复     | 自动（adapter 与 receipt 单测）       | U-1 内验证      | U-4（Blocked） |

## 2. 通用准备

要求 Node `>=22.13.0`、pnpm `>=11.0.0`（以根 `package.json` 为准）。

```bash
git fetch origin
git checkout <release-tag-or-commit-sha>
pnpm install --frozen-lockfile
```

开发模式只用于交互检查，不作为安装/更新证据：

```bash
pnpm nx run desktop:serve-safe
```

安装/更新证据必须使用 `desktop:dist` 产物或 GitHub Release 上的安装包。

## 3. Keyboard-first（#494）

### W-1 Windows IME / AltGraph

构建：Release 安装包（NSIS）或 `pnpm nx run desktop:serve-safe`；推荐用安装包，避免 DevTools 抢焦点。

1. 打开 MemoFlow，进入 `目标` 页面，点 `新建目标` 打开长表单。
2. 光标放进标题输入框，切换到微软拼音，输入 `nihao` 进入组词态（候选窗出现）。
3. 在组词态依次按 `1`、`J`、`K`、`Enter`。
   预期：字符进入候选/输入框；**不出现**模块预览，列表选择不移动，页面不跳转。
4. 完成组词后（候选窗关闭、光标仍在标题），按 `Ctrl+A` 清空，再按 `1`。
   预期：出现 Goal 预览（`goal-capsule-preview`）。
5. 切换到西班牙语/法语布局，在标题输入框按 `Ctrl+Alt+E`（`€`）或 `Ctrl+Alt+2`（`@`）。
   预期：只输入字符，不触发任何应用快捷键、不打开预览。
6. 打开 `设置 → 快捷键`，点 `录制：进入目标`，按 `Ctrl+Alt+K`。
   预期：拒绝保存并提示 `Ctrl+Alt 可能是 AltGraph`。

记录：Windows 版本、输入法版本、每步是否通过。

### W-2 OS 级组合键

Windows（安装版）：

1. 按 `Win`、`Win+D`。预期：由系统处理；MemoFlow 不响应，也不崩溃。
2. 按 `Ctrl+Shift+D`。预期：MemoFlow 主窗口显示/隐藏（全局快捷键）。
3. 打开 `设置 → 快捷键`，录制 `Meta+K`（或 `Win+K`）。预期：提示 Windows 键由操作系统保留，无法保存。
4. 录制 `Alt+F4`。预期：提示系统保留，无法保存。

macOS（安装版）：

1. 按 `Cmd+K`、`Cmd+B`、`Cmd+\`。预期：命令面板、侧栏、业务面板按默认绑定切换。
2. 按 `Option+1`、`Option+J`、`Option+K`。预期：`Option` 使用物理键位；德语/法语布局下即使 `Option+1` 产生 `¡` 也进入 Goal 预览/切换 Tab。
3. 打开 `设置 → 快捷键`，录制 `Cmd+Q`、`Cmd+Space`。预期：提示系统保留，无法保存。
4. 按 `Ctrl+Shift+D`，记录实际结果（显示/隐藏，或被系统快捷键吃掉）。这是待确认项，不预设通过。

### W-3 Profile 切换（同一次会话内）

1. Profile A 中打开 `设置 → 快捷键`，录制 `进入目标 = Alt+G` 并保存，确认状态显示已保存。
2. 回到侧栏头像菜单 → `切换账户`，选择 Profile B（B 没有覆盖）。
3. 不重启应用，直接按 `Alt+G`。预期：不进入目标（A 的覆盖已失效）。
4. 按 `Alt+1`。预期：进入目标（B 使用默认绑定）。
5. 切回 Profile A，按 `Alt+G`。预期：进入目标（A 的覆盖仍在）。
6. 检查 per-profile 文件：`设置 → 数据` 里暴露的 Profile 目录下 `keyboard-keymap.json` 只包含对应 Profile 的覆盖。

### W-4 专注 / 干预窗口键盘可达性

本 PR 为两个二级窗口补了最小可访问基线：`Escape` 触发窗口已有的隐藏/忽略命令，Tab 走原生焦点顺序。

1. 从 `例程` 启动一个专注会话，等专注窗口出现。
2. 不点击任何按钮，直接按 `Escape`。预期：窗口隐藏，会话状态不被结束。
3. 再次唤起窗口，按 `Tab` 依次聚焦折叠、置顶、隐藏按钮，每次 `Enter` 触发对应按钮。
4. 启动一个带休息提示的例程，等干预窗口出现，按 `Escape`。预期：窗口按 `dismiss` 关闭；`Done`/`Snooze 5 min` 不被触发。
5. 干预窗口没有活动投影时按 `Escape`。预期：无命令发送。

## 4. 自动更新（#493）

### U-1 Windows NSIS N→N+1（本地 feed，推荐）

前置：Windows 10/11 x64、Node/pnpm、Python 3（脚本用 `python -m http.server`）。

1. 在基线 commit 上构建 N（版本取 `apps/desktop/package.json`，当前为 `0.20.1`）：

   ```powershell
   pnpm install --frozen-lockfile
   pnpm nx run desktop:dist --configuration=windows
   Copy-Item apps/desktop/dist-package "$env:TEMP\memoflow-n" -Recurse
   ```

2. 把 `apps/desktop/package.json` 的 `version` 改为 `0.20.2`，构建候选并复制：

   ```powershell
   pnpm nx run desktop:dist --configuration=windows
   Copy-Item apps/desktop/dist-package "$env:TEMP\memoflow-n1" -Recurse
   git checkout -- apps/desktop/package.json
   ```

3. 确认候选目录里恰好一个 `MemoFlow-Windows-0.20.2-Setup.exe` 和 `latest.yml`。
4. 运行仓库自带验收脚本：

   ```powershell
   pwsh -File apps/desktop/scripts/run-windows-update-e2e.ps1 `
     -BaseInstaller "$env:TEMP\memoflow-n\MemoFlow-Windows-0.20.1-Setup.exe" `
     -CandidateFeedDir "$env:TEMP\memoflow-n1" `
     -ExpectedVersion "0.20.2" `
     -ReportPath "$env:TEMP\memoflow-update-report.json"
   ```

5. 预期：脚本依次打印 `candidate-verified`、安装 N+1，最后打印 `PASS`，report 中
   `result = "passed"`，且满足：
   - `receiptCleared = true`，`%MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT%\state\update\install-receipts\install-receipt.json` 不存在；
   - `profileRegistrySemanticSha256Before` 与 `profileRegistrySemanticSha256After` 相等；
   - `preservationSentinelSha256Before` 与 `preservationSentinelSha256After` 相等；
   - 安装后的 `memoflow.exe` `ProductVersion` 以 `0.20.2` 开头。
6. 若失败：保留 `%TEMP%\memoflow-update-e2e-*\failure-diagnostics.json` 与窗口截图，不要手工改报告。

### U-2 Windows 真实 GitHub feed（可选交叉验证）

1. 安装上一个公开 release 的 `MemoFlow-Windows-<N>-Setup.exe`。
2. `设置 → 关于/更新`，点 `检查更新`，确认状态卡显示可用版本与主操作按钮。
3. 点主按钮下载，观察进度条；完成后点 `重启并安装`。
4. 预期：重启后版本为 N+1，`%LOCALAPPDATA%\MemoFlow\state\update\install-receipts\` 为空。
5. 若使用预发布 channel，确认选择的是 beta/canary 而不是 stable。

### U-3 Linux AppImage N→N+1

前置：Linux x64，`xvfb-run`、`dbus-run-session`、`gnome-keyring-daemon`、`gdbus`、`secret-tool`、`node`
（与 `desktop-update-e2e.yml` 的 `linux-appimage-update` job 相同依赖）。

1. 构建（与 CI job 同序）：

   ```bash
   pnpm nx run desktop:build:production --outputStyle=static
   node apps/desktop/scripts/rebuild-native-dependencies.mjs --workspace-root "$PWD" --platform linux --arch x64
   ```

   然后把 `apps/desktop/package.json` 的 `version` 临时改为 N（低于当前版本，例如 `0.20.0`），在 `apps/desktop` 下执行
   `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder --linux AppImage --x64 --publish never --config electron-builder.json5`，
   把 `dist-package/MemoFlow-Linux-<N>.AppImage` 复制到 `update-e2e-fixtures/base/`；恢复 `version` 为 N+1 再打一次包，把
   `MemoFlow-Linux-<N+1>.AppImage` 与 `latest-linux.yml` 复制到 `update-e2e-fixtures/candidate/`（该目录必须恰好一个 AppImage）。
   注意：CI 内联脚本给每次 electron-builder 设了 600 s 上限；在负载较高的开发机上 asar 打包可能超过 10 分钟，本地请直接运行上面的命令。

2. 通过 keyring 包装脚本运行（不要直接 `xvfb-run node …`：packaged 启动需要 Secret Service 会话）：

   ```bash
   D=$PWD/apps/desktop
   APPIMAGE_EXTRACT_AND_RUN=1 MEMOFLOW_CI_KEYRING_TIMEOUT_SECONDS=390 \
   MEMOFLOW_PACKAGED_EXECUTABLE=$D/update-e2e-fixtures/base/MemoFlow-Linux-0.20.0.AppImage \
   MEMOFLOW_LINUX_APPIMAGE_UPDATE_E2E_BASE=$D/update-e2e-fixtures/base/MemoFlow-Linux-0.20.0.AppImage \
   MEMOFLOW_LINUX_APPIMAGE_UPDATE_E2E_FEED=$D/update-e2e-fixtures/candidate \
   MEMOFLOW_LINUX_APPIMAGE_UPDATE_E2E_VERSION=0.20.1 \
   MEMOFLOW_LINUX_APPIMAGE_UPDATE_E2E_REPORT=/tmp/u3/desktop-update-installed-e2e.json \
   MEMOFLOW_LINUX_APPIMAGE_UPDATE_E2E_RUNTIME=/tmp/u3/runtime \
     apps/desktop/scripts/run-linux-packaged-smoke-with-keyring.sh
   ```

3. 预期：输出 `phase=checking current=<N>` → `phase=install-requested` → `phase=candidate-verified current=<N+1>` → `PASS`；
   report 中 `kind = "desktop-update-installed-e2e"`、`platform = "linux-appimage"`、`result = "passed"`、`installedSha256`
   等于候选 AppImage 的 SHA256、`receiptCleared = true`、`profileRegistrySemanticSha256Before/After` 相等、
   `preservationSentinelSha256Before/After` 相等。可用 CI job「Verify Linux AppImage updater evidence」中的断言复核。
4. deb/rpm 不在本项范围：它们由包管理器拥有，不具备 self-install 权限，不应宣称支持自动更新。

**已执行记录（真实运行，Linux）**：2026-10-20 02:54 CST，gcp-dev（Linux x64，Xvfb + GNOME Keyring 会话），commit
`4887af4589c`（本 PR 分支；updater 代码与合并 main 后一致），N=`0.20.0`（AppImage SHA256 `701d00a1…e878`）→ N+1=`0.20.1`
（SHA256 `ea8f7acd92b45e072a9ae69d7310cf37a3065920466a8f228db3c30b8f093b28`），本地 HTTP feed。结果 `PASS`：`installedSha256`
等于候选 SHA256，`receiptCleared = true`，Profile registry 语义哈希 `7960163e…ae2b` 前后一致，sentinel 哈希 `bcdc7986…afbb`
前后一致；CI 校验断言全部通过。Windows（U-1）与 macOS（U-4）仍需真机。

### U-4 macOS（当前 Blocked）

现状（代码事实）：`collectDesktopInstallationEvidence` 把 `macosTrust` 固定为 `unknown`；`detectDesktopInstallationOwner` 因此返回 `unsupported / untrusted-macos`，能力全为 `false`。所以即使手工构建 DMG/ZIP，更新入口也应当显示不可用。

1. 用公开 release 的 DMG 安装到 `/Applications`，启动后打开 `设置 → 更新`。
2. 预期：显示更新不可用/不受信任安装来源，不出现“检查更新”可执行按钮，不发起网络更新请求。
3. 记录实际文案与截图。
4. 要转为可验收，需要同时具备：Developer ID 签名 + notarization 凭据、可验证的安装来源证明（`macosTrust = signed-notarized`），以及 `latest-mac.yml`/ZIP 产物。缺任意一项都保持 `Blocked`。

### U-5 安装回执跨版本路径（#487 之后）

- 本仓库当前（含 #487）写入 `<stateRoot>/update/install-receipts/install-receipt.json`。
- v0.20.1 及更早写入 `<userData>/shared/update/install-receipt.json`。
- 因此 `v0.20.1 → 下一个版本` 的升级**不会**被新版本识别上一次待验证回执：这是有意的存储职责迁移，不是新缺陷，但也意味着不能用 0.20.1 作为 N 来验证“回执自动清理”。U-1/U-3 的 N 必须从包含 #487 的 commit 构建。
- 若要验证真实历史升级，只能接受“回执不被读取、旧文件保留”的结果，并在 issue 记录。

### U-6 失败恢复注入（Windows 或 Linux 安装版）

1. 下载进行到一半时断开网络。预期：状态进入 failed/可重试，重试后继续，不残留半下载。
2. 把 feed 中 `latest.yml` 的 SHA512 改错后重启应用。预期：校验失败，保留旧版本，错误可见。
3. 更新检查进行中再点一次检查/安装。预期：不会重复安装或重复关闭应用。
4. 更新安装请求后 10 秒内关闭应用两次。预期：只有一个 shutdown 协调者执行，第二条请求被合并。

## 5. 发布可信度（v0.20.1 证据）

以下状态均可用 `gh run view <id>` 复核（2026-10-19 查询）：

| 运行                                       | 时间（UTC）      | 结论    | 说明                                       |
| ------------------------------------------ | ---------------- | ------- | ------------------------------------------ |
| Release Publish `39047267651`              | 2026-10-17 15:56 | failure | `Create or validate draft release and tag` |
| Release Publish `39045745476`              | 2026-10-17 15:35 | failure | 同上                                       |
| Release Assets `39047625515`               | 2026-10-17 16:01 | failure | Windows 更新 gate 失败                     |
| Release Assets `39088705384`               | 2026-10-18 02:03 | success | `Upload Draft Release Assets` 被跳过       |
| Desktop Update Installed E2E `39095093825` | 2026-10-18 03:51 | success | 仅 windows，单独 dispatch                  |
| Desktop Update Installed E2E `39039153773` | 2026-10-17 14:03 | success | 双 lane 同时 dispatch                      |

Release Publish 失败根因（日志原文）：
`HttpError: Resource not accessible by personal access token`。失败步骤使用
`secrets.RELEASE_PLEASE_TOKEN` 调用 Releases API；该 PAT 缺少创建/校验 draft 与 tag 的
`Contents: write` 权限，而该 job 的 `permissions: { contents: write }` 只对
`github.token` 生效，对 PAT 不生效。

v0.20.1 最终资产在 2026-10-18 02:23–02:24 出现，但没有任何成功的上传 job 记录；
这说明资产是在工作流之外补传的。该发布不能作为“发布链路可重复”的证据。

建议的 CI lane 改动（本 PR 不修改 `.github/`，交由 CI lane 实施）：

1. `prepare` job 改用 `github.token`（job 已有 `contents: write`），或给
   `RELEASE_PLEASE_TOKEN` 补 `Contents: Read and write`。
2. 在 `release-assets.yml` 上传 draft 资产前校验：当前 tag 存在成功的
   `Release Publish` run，且 run 的 `head_sha` 等于 tag 指向的 SHA；失败则拒绝上传。
3. 记录上传 run id 到 `desktop-release-manifest.json`；发布后由 release-health 校验
   manifest 中的 run id 与 tag SHA 一致。
4. Draft 资产只允许通过 `Release Assets` 工作流写入；禁止手工 `gh release upload`
   补传后直接公开 Release。

## 6. 记录模板

```text
issue: #493 / #494
平台: Windows 11 23H2 / macOS 14.5 arm64
构建: v0.20.2 (commit <sha>) / 本地 N+1
步骤: W-1 / U-1 ...
结果: Pass / Fail / Blocked
证据: <录屏或截图路径> / <report.json 路径>
备注: 与预期不一致的原文
```
