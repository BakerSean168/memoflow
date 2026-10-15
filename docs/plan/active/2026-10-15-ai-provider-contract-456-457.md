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

## 第二轮：原生模型偏好的配置/账号上下文

基线 77e087f382c，继续由同一 T3 线程 Codex Team 独占实施。先写回归，再实现：

- 原生身份权威仍是各 Driver 的无推理初始化协议和已有 nativeIdentity；renderer 不从目录、套餐、路径或掩码邮箱猜身份。
- 新增可选、严格格式的 modelVisibilityContext probe 字段。仅在协议提供可信账号身份时，服务端以 SHA-256（含用途/版本分域）组合 driver、executablePath、homePath 和已有 nativeIdentity 摘要；不将原始路径、邮箱、凭据或内部身份摘要输出到 renderer 存储。
- 当前只对确认身份的 Codex ChatGPT / Claude 账号提供上下文；API-key-only、Pi/DSH 或未知身份不臆造上下文。无上下文时明确禁用偏好保存，目录仍正常显示，不套用旧上下文偏好。
- localStorage v2 按 Profile + Instance + probe context 分区；v1 无法证明属于哪个账号，保留但不迁移/复用。相同上下文重启/重探测保留偏好；上下文变更默认显示当前真实目录。
- 保留 renderer revision/storage event 的 Settings ↔ Composer 同步、已有 generation/Profile 失效，以及历史模型 ID/消息。上下文是只读 probe 快照，外部账号改变需重新检查才能观察，不新增轮询或付费探活。
- 校验：可见性/Composer/Settings 回归、DTO/Driver 契约、AI/App-Vue typecheck 与改动 lint；只跑文档/契约必要治理，不扩大历史修复。

### 第二轮证据与验收边界

- 红测捕获旧 v1 复用/未知上下文保存问题（6 项失败）以及 Codex probe 缺少上下文（1 项失败），随后最小实现通过。
- 最终 Native Agent：`pnpm nx run ai:test --skipNxCache -- src/server/local-agent`，11 文件 **88/88**。使用隔离 Native Home、清除测试子进程继承的提供商认证环境变量；协议/推理为假 RPC 子进程和 SDK fixture。身份测试使用临时目录中的合成凭据，验证账号 ID 改变与已识别 OAuth 刷新稳定性，没有访问用户 Native 凭据或真实付费推理。
- Vue：`pnpm nx run app-vue:test --skipNxCache -- AISettings.spec.ts AISettings.provider-onboarding-v2.surface.spec.ts useAIChatView.lifecycle.spec.ts useLocalAssistantChoices.spec.ts native-model-visibility.spec.ts i18n-key-completeness.spec.ts`，6 文件 **66/66**。覆盖 v1 保留且不复用、同上下文重建、Profile/实例隔离、上下文变化/恢复、Settings ↔ Composer 即时同步、storage event、历史 modelId/选择不变、未知上下文的显式降级。
- DTO：`pnpm nx run contracts:test --skipNxCache -- local-agent.dto.test.ts`，**9/9**。只在 ready probe 允许严格格式的 mvc1 SHA-256 摘要；路径/邮箱/任意字符串、失败态和 Connection 配置注入均拒绝。
- `pnpm nx run-many -t typecheck -p ai app-vue --parallel=1` 通过：29 tasks（5 个无关依赖缓存），AI 与 App-Vue 当前类型检查实际运行。
- 所有改动 .ts/.vue 的 `pnpm exec eslint --max-warnings=0` 通过：0 errors / 0 warnings。
- 实施模型维持当前 T3 Codex harness `gpt-6.1-sol`；只使用本线程的只读 Issue 查询、本地文件编辑、pnpm/Nx/Vitest/ESLint 和普通 Git。没有其他 Agent/模型/原生 Agent CLI 重试，没有 push/PR/合并/部署/发布。

当前实现以原生初始化报告的账号及现有会话身份指纹作为上下文来源，不声称账号在线授权、模型额度或真实推理可用。上下文不是权限。API-key-only、Pi/DSH 和缺失账号元数据暂不保存偏好；后续须提供该 Driver 可核验的身份来源后才能接入相同契约，禁止拿 model catalog、套餐或掩码邮箱替代。外部账号/Home 环境在 probe 之间改变时，需重新检查/现有配置刷新才能观察；本轮没有增加后台探活。Windows 安装版、真实多账号/Home 切换、真实 OAuth 刷新及旧会话消息的安装版回归仍待验收。历史消息存储及运行会话绑定没有变更。

第二轮必要治理：`node tools/docs/check-docs-config.mjs` 与 `node tools/governance/public-surface-audit.mjs` 均通过；`git diff --check` 通过。没有重跑或扩大主治理门禁，测试文件集合未变。

## 第四轮：Registry 到 Native Send 的跨层回归

基线 `d9c358857ac4e25916a9dbbb3b425ad5d3113310`，同一 T3 线程、同一工作树，当前 Codex Team / gpt-6.1-sol 独占实施。第三轮的限额观测及草稿保护保持原实现。

原有生命周期测试替换了 Session，Session 测试替换了 Runtime，Runtime 测试替换了 Driver；它们分别覆盖了默认物化、首次默认加载和发送，却没有证明这些模块接起来后真正抵达 Codex turn/start。本轮在现有生命周期 spec 中增加两个跨层场景，通过 `@memoflow/ai/testing` 提供 Node 专用夹具，避免跨项目导入内部源码。真实执行的模块包括 Vue View/Session/初始化与选择逻辑、三个 IPC Client 及其 DTO 校验、AgentInstanceRegistry、SQLite Repository、LocalAgentRuntime、CodexDriver 和 NativeRpcTransport；Electron 投递与外部 Codex JSON-RPC 进程是假实现，外围业务 Workflow 投影沿用原测试桩。

- 隐式默认 Codex：Registry 中 enabled、探测目录 ready；读 Registry、探测和挂载不写 Connection、不执行 turn/start。显式选择后只物化一个 Connection，选择原生目录模型，经 Composer 的 v-model/send 事件发送，断言实际 RPC 的模型及用户文本和持久化会话选择。
- 已保存默认 Codex：显式保存默认选择后重新挂载，真实初始化自动加载该 Connection/模型；无需重新配置即可从 Composer 发送，读初始化不再物化 Connection。
- 注入假原生 RPC 429/insufficient_quota：Conversation 与 Composer 显示安全限额结果，恢复原草稿，保留 Connection/模型；完成目录复查后仍可显式重试，RPC 计数证明没有自动重试。
- 模拟 Desktop Profile 切换：卸载旧 View、dispose 旧 Profile Runtime，保留同一 SQLite 的身份分区并挂载新 View。新 Profile 看不到旧连接、会话或限额；重新选择后独立物化并发送，获得新账号摘要。旧 Profile 的模型及两条用户消息保留。此项覆盖重挂载路径，不等同于 Electron 实机 Profile 切换验收。

本轮没有复现当前源码中的“已发现 Codex 目录而新会话仍报 AI 未配置”，因此没有再次修改默认物化、首次加载或其他生产行为。测试开发中发现的是夹具断言边界：Native prompt 会附带当前 Goal 引用、保存默认选择会更新 defaultModelId、原生目录复查包含异步进程 I/O。断言已分别按现有契约和真实终态等待修正；这些不是业务修复，也不作为已修复故障计功。

最终校验：

- `pnpm nx run ai:test --skipNxCache -- src/server/local-agent src/server/application/agent-instance/agent-instance.registry.spec.ts src/client/runtime-assistant.spec.ts`：13 文件 **122/122**。
- `pnpm nx run app-vue:test --skipNxCache -- src/modules/ai/composables/useAIChatSession.spec.ts src/modules/ai/composables/error.spec.ts src/modules/ai/composables/useLocalAssistantChoices.spec.ts src/modules/setting/components/AISettings.spec.ts src/modules/setting/components/AISettings.provider-onboarding-v2.surface.spec.ts src/modules/ai/composables/useAIChatView.lifecycle.spec.ts src/modules/ai/composables/native-model-visibility.spec.ts src/locales/i18n-key-completeness.spec.ts`：8 文件 **134/134**。包含原草稿、新编辑草稿、部分回复、历史选择、可见性与身份隔离回归。
- `pnpm nx run-many -t typecheck -p ai app-vue --parallel=1`：通过，29 tasks；AI/App-Vue 当前类型检查实际运行，25 个无关依赖构建命中缓存。
- 改动 TypeScript/配置定向 ESLint、public-surface 审计和差异检查通过；保持现有 spec 文件集合，不扩大测试清单或全仓治理。记录补充后另运行 docs-config 检查。

所有 Native 推理均为本机 Node 假进程，测试显式使用空临时 CODEX_HOME 并移除继承的提供商认证环境变量；未读取真实 Native Home、未执行真实 Codex CLI、未调用付费模型、未切换模型渠道。未修改品牌图标，未 push/PR/合并/部署/发布。

剩余门禁：Windows Desktop 安装包必须在本轮提交的 exact SHA 上验证实际 Registry/IPC/Preload、npm launcher、真实账号/Home/Profile 切换、Composer 键盘/点击发送及布局；mock 通过不替代该证据。此前 #456 缺少已验证会话身份的早期失败投影、执行结果的持久化与完整权威状态契约也未在本轮扩展。目录 ready 仍不证明授权、余额或真实模型可执行。

## 第六轮：原生失败状态 / Tooltip 隐私回归收口

基线 `f030e3bdee6`。上轮 Codex 因上游 Team 工作空间余额耗尽停止，留下 7 个已实现未提交测试文件；本轮 T3 线程（WindHub GLM-5.3）复核保留原成果、不重构不重写，仅串行收口验证并提交。

- 夹具增量（`@memoflow/ai/testing`）：`createNativeAgentFlowFixture` 新增 `NativeProbeFailure` 与 `setProbeFailure`，可注入 spawn ENOENT（临时目录内虚构路径）、stderr 诊断、RPC 错误码（401/503/-32603）三类探针失败；其余行为不变，原 Registry → Composer 发送集成不受影响。
- 回归断言：Claude/Dsh/Pi driver spec 用合成 stderr（`PRIVATE_*_FIXTURE` 标记的虚构 Home/账号/密钥）验证探针失败先归一化为固定文案再发布状态 DTO；transport 最终公共边界对被污染的 `LocalAgentError`/未知异常重映射为固定 code+message；`AISettings.spec.ts` 通过真实 Runtime/Registry/RpcTransport 夹具断言 Runtime → DTO → Tooltip → detail 全链路无 `PRIVATE_` 泄漏（结果 JSON、DOM、console 日志），且失败探针不触发 `turn/start`。
- 脱敏权威边界：源端归一化（driver probe 分类 + transport 边界重映射 + renderer 固定 fallback 文案）是唯一脱敏点；`LocalAgentStatusSchema`/IPC DTO 仅校验形状与长度上限，**不做自动文本清洗** —— 若未来源端路径漏归一化，DTO 校验不会兜底，必须依赖上述 driver/transport 回归守住。真实 IPC client 解析 DTO 只代表形状可信，不代表文本已脱敏。
- 本轮串行验证（`--no-file-parallelism`，环境注入临时 `CODEX_HOME`）：`pnpm nx run ai:test --skipNxCache -- src/server/local-agent src/server/transport/ai-controller-errors.spec.ts src/server/application/agent-instance/agent-instance.registry.spec.ts src/client/runtime-assistant.spec.ts`：14 文件 **147/147**，含脱敏新用例与原有 Registry/发送集成。`pnpm nx run app-vue:test --skipNxCache -- src/modules/setting/components/AISettings.spec.ts`：**36/36**（上轮并发压力下曾超时，串行模式稳定通过）。`git diff --check` 通过。App-Vue/AI typecheck 与变更 ESLint 由本轮前段交接完成并报告通过，本次收口未重复执行全量治理。
- 测试全程仅用模拟启动 stderr、虚构路径与假 RPC 子进程；未读取私有本机 Native Home、未使用环境密钥、未发起真实服务请求。未改品牌图标，未 cherry-pick 其他工作树提交，未 push/PR/合并/部署。


## 第七轮：双模型整合、治理验收与 Windows 发布门槛

此节是此前历史里程碑的后续结果，不应把早期“图标未落地”“只有 Codex 编写”等陈述解释为最新状态。2026-10-15 的实施实际分成独立 T3 Code 工作线：Codex Team/Codex 完成 #456 请求失败状态与草稿保护、跨层集成、#457 Tooltip 回归；其工作空间额度耗尽后，WindHub Direct/GLM-5.3 经 ZCode 接续第六轮隐私测试并独立完成品牌图标。两个工作树分别写入，最终由调度者逐个提交并 cherry-pick 到 `feat/ai-provider-contract-456-457-20261014`，无交叉覆盖。

### 已整合的结果

- #456 请求限额/额度耗尽投影与草稿恢复：`d9c358857ac`；跨 Registry/IPC/Composer/真实 fake RPC 的发送闭环回归：`0e437bc94b0`；#457 状态 Tooltip 键盘聚焦/单行固定 80px 回归：`f030e3bdee6`。
- WindHub 接续模拟 Native 错误脱敏的 7 个测试/夹具文件，追加计划证据：`3bd88861400`。仅模拟 ENOENT/stderr/RPC、注入虚构路径与认证标记，不触达用户 Home、真实密钥或付费推理。
- GLM 原品牌分支 `83f606f60f8`、`2c59b362c59` 提供五个 Driver 的可追溯 SVG 字形、fallback、尺寸数学回归与来源证明；分别以 `06997ffa53b`、`25a7b653f84` 整合。第三方 MIT 声明 `48b5b8f8a80`，Pi Press Kit 版权署名更正 `a0f6d30f0d4`。
- 治理测试清单增加 AgentDriverIcon spec：`1f1c0076085`；`agentBrandGlyphs.ts` 依仓库文件名规则改为 `agent-brand-glyphs.ts`，同步 import 与许可引用：`36b75d22d91`。
- 以上在最后本地治理时均位于同一特性分支，`origin/main` 的最新提交 `8ea3c78ee87` 是其祖先（merge-base 与 origin/main 一致，`origin/main...HEAD` 为 0 落后、20 领先），无须再次合并基线。

### 最终本地测试证据

- 第六轮 Native Agent + Registry + Transport：14 文件 **147/147**，Vue AISettings：**36/36**；两个测试由 WindHub 接续后以隔离环境串行通过。
- 整合后的相关 Vue UI 与 Composer：4 文件 **65/65**（图标/Settings/Tooltip/Composer）；重命名后再跑 **65/65**。
- AI/App-Vue typecheck 与重命名后的 App-Vue typecheck 通过；相关 Vue/TS 变更 ESLint 零错误。
- `pnpm test:inventory` 更新到 unit 1225，新增 spec 已入账；`pnpm nx run memoflow:governance-check --parallel=1` 在修复 kebab-case 文件名后整套 **退出 0**，包括文件命名、公开接口、架构边界、测试治理等审计。Nx 报告 test-system-v2:test 先前存在 flaky 记录，此次最终治理未失败。
- `git diff --check` 通过，用户真实 Provider/Auth/聊天数据与其他仓库未改动，未运行真正 Native 推理。自动生成的 `.zcode/` 已加入本机 Git info/exclude（不入库）。

### 尚未完成，不能宣称发布完成

1. **Windows exact-SHA 安装包验证**：需在干净隔离 Profile 中覆盖 Registry -> Probe -> Select -> Connection -> Compose -> Send、Windows npm launcher、初次加载、重启、账号/Native Home/Profile 切换和历史消息完整性；模拟 Native RPC 通过不等同于真实渠道额度/认证验收。该操作须避免读取或改写实际用户登录资料。
2. **界面实际几何验收**：840/1280/1600px，固定列表行高、Tooltip/焦点、详情面板与深浅主题；现有 Vue/happy-dom 单测不是实际浏览器或 Windows 截图证据。
3. **PR exact-SHA CI**：本地绿测不替代 GitHub CI；保持 Draft PR 直至 CI 和实机门槛通过。不得因为发布流水线存在而自动晋升 `staging-latest` 或发布生产版本。
4. **真实额度状态**：已观察到 Codex Team 这个 T3 实施工作空间提示 out of credits，不能将其概括为所有 Codex 账号/渠道不可用。WindHub/ZCode 可用于后续独立验证/开发；昆友本轮不参与。

Windows 工作站（WSL `forest`）在此轮确认可由 Agent Fabric 连通；Windows 11 已安装 Desktop 0.19.0 且未运行。安装版仍是旧构建，不能以其结果冒充此分支 exact-SHA。Windows Node 24.12.0 可用，但 pnpm 尚未安装；如准备隔离构建应先核对工作区、磁盘、CLI 和数据目录的隔离性，不直接覆盖当前安装。


## 第八轮：Draft PR 458 CI 与 Windows 打包版验收

本轮延续上述 #456 / #457 目标，继续维持 PR [#458](https://github.com/BakerSean168/memoflow/pull/458) 的 **Draft** 与非发布状态。首个 PR HEAD `824949be7dd` 的 CI run `38722844360` 中，所有类型检查、主构建、Governance、Unit 与三个 Web 分片通过，Web Flow Shard 1/4 的 Secure AI Provider acceptance 因过时的右侧启停按钮断言失败；这是 #457 已明确移除右侧重复开关后未同步 Playwright 脚本，并非恢复该按钮的理由。WindHub GLM-5.3/ZCode 在 T3 Code 中将 `apps/web/e2e/ai/provider-onboarding.spec.ts` 的该断言修为 `toHaveCount(0)`、保留左侧启停可见断言；`b58ae40871e` 已推送。其 exact-SHA CI run [38727267014](https://github.com/BakerSean168/memoflow/actions/runs/38727267014) **全绿**（包括 Secure AI Provider、4 个 Web 分片、Unit、Governance、Typecheck、Build、所有相关 Oracle）。

### Windows 实机证据与严格边界

- Windows 工作站 `forest` 上使用 **D 盘隔离目录** `D:\AgentValidation\MemoFlow-PR458-824949be`，取源码 SHA `824949be7dd5943bf191adaf41f088ab84d3fe4b`，原有 MemoFlow 0.19.0 安装与正常用户 Profile 未更改；原 WSL main 也未改。Windows Node 24.12.0、pnpm 11.20.0（临时调用、未全局安装）。
- `desktop:build --skipNxCache` 与 31 个依赖任务在 Windows 原生 **通过**；`desktop:package` 长任务被取消，不宣称整条 target 成功。产生的 `win-unpacked/memoflow.exe` 和 `resources/app.asar` 由 `verify-packaged-runtime-deps.mjs` **独立通过**，核验 80 个运行时依赖包与关键 archive entry/integrity。
- `apps/desktop/e2e/packaged-runtime/packaged-runtime.spec.ts` 对上述实际 Win unpacked 运行了启动/Renderer、Provider 创建与删除、模拟缺失 CLI、重启持久化和快捷键冒烟。新增 `provider-layout-window.spec.ts` 在 840/1280/1600px × dark/light 六个场景中实际断言：五个 Driver 顺序、每行 80px、无横向溢出、宽屏横向详情/窄屏上下、右侧无重复启停 Switch、键盘聚焦 Tooltip 的 `data-state`/`aria-describedby`/portal DOM 可见及 Escape 恢复焦点。
- 第二阶段收敛了安全性：**只隔离 MemoFlow Profile 不会隔离本机 Native Codex Home**；首轮 Windows 应用曾只读探测本地真实 Codex 模型目录和脱敏账号状态（未推理、未输出或改写凭据）。现新增共享 `isolated-native-env.ts`，两项 packaged E2E 都显式设置临时 CODEX_HOME / CLAUDE_CONFIG_DIR / PI_CODING_AGENT_DIR / DSH_HOME，并移除 inherited secret/auth/key 与相关 Provider API 端点环境字段。后续 Windows 复测 **2/2 通过，共 11.2 秒**，退出后无 MemoFlow 进程残留；新增视觉回归也断言没有显示真实账号认证摘要。
- 新 Windows Playwright spec 按仓库测试治理声明 `tools/test-system-v2/e2e-ownership.json`（desktop lane、packaged-runtime surface、supplemental role），更新测试清单（1411 个测试文件、E2E 51 个），避免“unowned spec”治理失败。测试仅在 Windows 平台执行，非 Windows 运行时明确 skip。

**精确版本说明**：上述 Windows App 二进制由 `824949be7dd` 的产品源码生成；后续 `b58ae40871e` 只修改 Web E2E 测试，Desktop / AI / Vue / Contracts 产品源码与构建版本相同。因此 Windows 实测证明这些产品源码在该平台运行有效，但不冒充新版 PR 测试 commit 的 exact-SHA 安装版出厂证据。

### 仍不能解除的门槛

1. Windows **最终发布 SHA 的正式安装包**、真实 Profile / Home / 多账号切换及旧会话迁移实测仍未完成（当前验证的是隔离的 unpacked 程序，而非 NSIS 安装版）。
2. 本轮完全不执行真实 Codex Team / WindHub 推理、额度/429 验证；目录就绪不代表推理授权或余额充足。跨 Registry/IPC/Composer 到 Fake Native RPC 的代码集成已测，但本轮未完成真实 Agent turn/start 的无风险渠道验收。
3. 即使当前代码和 PR CI 绿灯，也保持 Draft，不因工作树提交/PR push 自动合并 `main`、晋升 `staging-latest` 或部署 Prod-like / Production；必须先对最终提交重新核对 CI 与安全发布证据。
