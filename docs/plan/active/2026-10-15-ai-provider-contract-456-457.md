---
tags: [plan, ai, native-agent, provider]
description: AI Provider 456/457 六处既有变更复核与原生版本、空目录状态契约里程碑。
created: 2026-10-15T00:00:00Z
updated: 2026-10-15T00:00:00Z
---

# AI Provider #456 / #457 本地里程碑

本轮仅由当前 T3 线程的 Codex Team 实施 Agent 独占工作树，基线 `9e2af7a9fb5`。
接管时已有 Claude/DSH/Pi driver 与 spec 六个未提交文件；先复核、保留并在此基础上修复，不将既有成果计作新实现。

## 执行计划

1. 复核六个 diff、当前单测、Issue #456/#457 和现有 DTO/UI 状态来源。
2. 先补失败用例：真实版本/未知版本、非法版本、空目录不等于未登录或可执行；用最小实现闭合。
3. 原生版本以当前 connection.executablePath 为源，复用 Windows 安全 executable resolver；只执行 --version，限制时间/输出，不经过 shell，不发推理、不读认证文件。未知版本不影响目录发现。
4. LocalAgentStatusSchema 保持现有形态；ready 仅表示原生目录发现成功，不证明模型推理权限/余额。原生认证错误仍由协议返回判定，不从模型数量猜测身份/套餐。无新增账号缓存或持久化。
5. 串行运行最近 Nx test/typecheck/lint，重跑 AISettings 两文件；版本输出仅接受单行版本格式，不将诊断输出传到 UI。检查差异后本地 commit。

## 本轮不宣称完成

#456 的默认实例显式选择物化、首次加载默认选择和 Profile 探测失效，以及 #457 的逐模型可见性、Codex 脱敏账号/能力与单行错误均已有基线实现，本轮不重复计功。Settings/Composer 仍有各自探测投影；统一状态/最后执行结果的完整契约，以及 Windows 安装版 exact-SHA 发送、账号/Home/Profile 切换和 UI 宽度/视觉验收仍缺本轮证据。品牌许可/完整资产和模型偏好在 Home/账号变化时的作用域需继续审计。UI 固定行高/单行状态维持现有实现并重跑组件测试。

## 本轮完成与校验

- 复核并吸收交接六个 dirty 文件：保留 Claude/Pi 不使用伪版本，以及 DSH 从 ACP agentInfo 取版本的方向。
- 本轮增量：Claude/Pi 以当前实例 executablePath 的 --version 获取真实版本，复用 Windows npm launcher resolver，2 秒/4 KiB/SIGKILL/无 shell；版本失败或不识别不影响目录发现。版本和诊断没有缓存、账号摘要或持久化副作用。
- DSH 仅接受版本 token；协议名、诊断、多行/Unicode 分行和超长元数据被忽略。
- Claude 空目录不再 ready，Pi 空目录不再被推断为需登录；显式原生认证错误继续返回 login_required。DSH 防御分支同样不按目录数量推断认证。
- 初始红测：空目录 2 项失败，随后 20/20 通过；版本来源/非法元数据 4 项失败，随后修复。
- 最终 `pnpm nx run ai:test --skipNxCache -- src/server/local-agent`：11 文件，85/85。测试使用隔离 CODEX_HOME、CLAUDE_CONFIG_DIR、PI_CODING_AGENT_DIR、DSH_HOME；假 SDK/原生 RPC 子进程与版本命令 mock，不读取个人 Native Home 或发起真实推理。
- `pnpm nx run app-vue:test --skipNxCache -- AISettings.spec.ts AISettings.provider-onboarding-v2.surface.spec.ts useAIChatView.lifecycle.spec.ts useLocalAssistantChoices.spec.ts native-model-visibility.spec.ts`：5 文件，52/52，包含当前 AISettings 两文件以及首次默认选择、显式物化、Profile 和隐藏模型回归。
- `pnpm nx run ai:typecheck --skipNxCache`：通过（含 10 个依赖任务）。
- `pnpm nx run ai:lint --skipNxCache`：通过，0 errors；6 个 warning 均位于本轮未修改文件。
- UI 模板/布局未改，仅更新可见性模块命名对应的 import；组件测试不能代替实机布局测量。实际 CLI 版本命令、Windows npm launcher 和账号/Home/Profile 的安装版联调仍待验收。空目录目前归入 unavailable，尚无独立 catalog_empty DTO。

## 后续优先级

1. #456：统一配置意愿、安装/登录、目录和最后一次执行失败的状态/失效契约；现有 ready 仅表示发现目录，不能证明余额或所有模型可执行。补 Windows exact-SHA 的 Registry → Probe → Select → Connection → Compose → Send 验收。
2. #457：模型偏好当前以 Profile + Instance + Model 为键；同实例 Home/账号改变后的失效边界仍需处理。补版本未知/失败状态保留、真实账号摘要的跨实例验收。
3. #457：当前 AgentDriverIcon 仍是通用 Lucide 图标，官方品牌许可与资产未完成；补 840/1280/1600px 实机布局、Tooltip/键盘和单行错误不抖动证据。

## 治理清单修复

首次 governance-check 未通过：基线清单遗漏了前序已提交的 native-model-visibility、useLocalAssistantChoices 和 ai-provider-instance-sort 三个 spec；并发运行的 test-system-v2 中 Playwright --list 达到 30 秒超时。独立生成并比较清单后，仅更新上述三个既有相关测试及计数（unit 1221 → 1224）；没有新增无关文件。随后串行重跑治理门禁，最终结果另记。

串行重跑后所有治理依赖通过，主门禁发现前序 native-model-visibility.ts 不符合 composable camelCase 命名规则。本轮只重命名为 nativeModelVisibility.ts 并更新四处 import/mock 引用，行为不变；复跑受影响 Vue 测试、typecheck 和 lint。

重命名后五个 Vue 测试文件再次 **52/52** 通过；`pnpm nx run app-vue:typecheck` 通过（28 tasks，当前 Vue 类型检查与 ai build 实际执行，25 个无关依赖构建命中本地缓存）。

最终 `pnpm nx run memoflow:governance-check --parallel=1` **通过**：7 tasks，4 个无关依赖命中缓存；主治理审计、测试清单检查与治理工具测试实际执行。Nx 仍提示此前 test-system-v2:test 的 flaky 历史，本次退出 0。五个改动 Vue 文件的定向 ESLint 通过，0 errors / 0 warnings。提交范围含既有六处复核成果、版本/空目录修复、前序测试清单与 composable 命名修正；仅本地提交，未 push/发布或发起真实模型调用。
