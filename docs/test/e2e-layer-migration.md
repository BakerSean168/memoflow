# E2E 下沉与重复清理（Issue #625）

基线为 `main@5f9e5852314803d2b3c3ff05ddfaa50d94a9e83f`。本次迁移不包含尚未合入的 #602（API 认证前置）和 #624（Coverage 合并 / Web Build 解耦），也不复制根工作区未提交的 T1/T2 审计文件。

## 第一批断言去向

- `authentication/auth-flow.spec.ts` 三条注册、登出再登录、错误密码旅程删除。`auth-login.spec.ts` 的两个真实认证旅程包含这些步骤，并额外验证 session 存在、不持久化 bearer 凭据；错误密码后仍确认登录表单可见。独立邮箱验证继续由 `auth-register.spec.ts` 负责。
- `authentication/auth-page-contract.spec.ts` 五条页面契约下沉到 `apps/web/src/auth/WebAuthView.stories.ts`：品牌主题不覆盖用户偏好、唯一主标题/表单/法律链接、全部注册字段与长度校验、提交后聚焦第一错误及修正清除、稳定错误随语言重译、登录焦点、360×640 可达性和无水平溢出。`auth-login.spec.ts` 的表单来回切换也并入该组件契约。真实生产组件、composable、翻译与输入控件在 Chromium 中执行，只替换外部认证服务响应。真实注册/邮件/错误密码服务端行为保留在认证 E2E。
- `user-settings/notifications.spec.ts` 三条卡片可见、owner PUT 成功/切换、刷新可见断言由 `user-settings/persistence.spec.ts` 既有刷新持久化旅程承接，且保留跨标签页测试。
- `notification/notification-center.spec.ts` 从五例合并为两例：三个薄用例的独有断言并入独立新账号空收件箱测试，保留两种筛选切换、空态、禁用 mark-all 和真实布局拖拽/焦点信号。不是用“没有未读”和“没有通知”互相替代。
- `task/task-plan-crud.spec.ts` 从七例合并为五例：列表/入口菜单断言并入创建旅程，空标题禁用 save 在实际创建前检查。保留后端创建、编辑/刷新、删除、checklist 持久化、面板拖拽等行为。
- `user-settings/data-portability.spec.ts` 从七例缩为一例：保留页面通知偏好写入后，通过真实 session 导出完整运行时注册的 V3 capability 集合。其余六例迁到 `apps/api/src/runtime/data-portability-http.integration.test.ts`：过滤、敏感字段排除、dry-run/apply round-trip、dry-run 不写入、旧版本/披露拒绝、身份字段拒绝。替代测试通过生产 ApiBootstrapper、owner composer、Prisma 与 PostgreSQL 执行，认证解析器使用独立测试 principal，额外检查三个迁移端点未认证时均为 401。它不宣称验证真实 Cookie 登录；此信号仍由保留的全栈导出和认证 E2E 提供。
- `note/legacy-note-mutation-boundary.spec.ts` 的五个退休端点 404 断言迁到 `apps/api/src/runtime/repository-http.integration.test.ts`。使用生产 Repository composer 与 ApiBootstrapper，同时检查当前 owner 路由确实安装且执行认证，防止漏注册整个模块导致所有 404 假绿。
- 删除 `testHelpers.ts` 中没有调用者的 Task 创建/清理及 Command Palette 打开/搜索/关闭辅助函数，不触碰专门的认证 fixture。

第一批 Web Flow 收集结果为 **24 文件 / 60 用例**，基线为 28 / 84；减少 24 条浏览器用例（28.6%）。Component Browser 增加五个 Story，形成 **4 文件 / 17 条交互**；API integration 增加两个文件 / 八例（含新增未认证控制）。这不是删除 24 条业务信号，也不代表整轮 CI 墙钟减少 28.6%。

## 第二批：按用户要求激进收缩

用户明确接受删除低价值整系统验证、以后按实际缺陷补回。本批不再以“每个真实 owner 必须有 E2E CRUD”为默认要求，也不为了逐条复制旧浏览器断言而新增另一套长测试。

Provider lane 另外退休 `provider-composer-states.spec.ts` 两条加载/空态/重置场景，由 AIComposerControls、AISettings 和 Registry 下层测试负责；provider-onboarding 的凭据持久化与 owner 安全验收继续保留。

第二批结束时 canonical Web Flow 是 **11 文件 / 15 用例**：相对第一批 24/60，再减少 13 文件 /45 用例；相对原始 28/84，减少 17 文件 /69 用例（82.1%）。

- 整体退休 Goal CRUD、Task CRUD、Calendar、Planner 拖拽回滚、Routine、Notification Center 布局、Notes 空态、响应式 Sidebar、Task→Goal 完成闭环、剩余 Data Portability UI smoke、OAuth 按钮 smoke、AI multi-engine-host 与 workspace-shell。
- Goal/Task CRUD 和 Goal 四态转换改由 `apps/api/src/runtime/goal-task-http.integration.test.ts` 的生产 HTTP→composer→owner→Prisma 契约承接；增加版本冲突、身份隔离、非法输入不写入、Task checklist 和数据库直接读回。身份解析器用测试 principal；不声称替代真实登录 Cookie 验收。
- GoalDialog/GoalDetail、TaskForm/TaskDetail、Calendar mutation/cache、Routine view、NotificationListPage、AppShell、KnowledgeProjectionWorkspace、AI model selection/ChatSession/AssistantStream 等现有下层测试直接承担各自业务/状态责任。本地定向执行 14 文件：279 passed /1 expected fail；后者是既有显式预期失败，不能计作普通 PASS。
- Goal 审批 3→1、Task 审批 4→1、Knowledge 5→1，仅留跨刷新恢复代表。保留 checkpoint 跨身份/重登录、双会话收敛、SSE 30秒无轮询窗口、真实认证/密码/邮箱、通知读写闭环和设置刷新/跨标签一致性。
- 接受的缺口：不再逐个验证所有业务页面的实际指针拖拽、几何布局、整页导航、真实 UI CRUD 落库，以及 mocked-provider 整页流式性能组合。组件/单元测试仍验证其可控状态，但不宣称与每条旧 E2E 完全等价。已退休文件在 `e2e-retirement.json` 保留原 SHA、下层路径和明确的 coverageDisposition；不是绕过或禁用缺失测试门禁。

core floor 从十个文件缩为三个：auth-login、notification-inbox-loop、goal-agent-approval（共四例）。owner 扩展和 unknown/shared/root 的全集选择继续保留。fallback 只扩大 spec 集合，不再硬占四台 runner；按现有保守历史权重，目前全集规划为两片。没有伪造删减后的时长权重。

## 第三批：移除审批、审阅、SSE 窗口与通知整系统旅程

用户进一步明确：Goal/Task 审批刷新、Knowledge 审阅刷新、SSE 30 秒不轮询、通知创建/已读/计数闭环均不再需要 E2E。本批直接退休这五个文件五条用例；不为逐条复刻 E2E 新建另一套测试链，也不再保留真实时间的 30 秒等待。

- Goal/Task 的恢复、打开原生审阅和审批责任落在既有 `useAIGoalWorkflow.spec.ts`、`useAITaskWorkflow.spec.ts` 与服务端 `goal-create.workflow.spec.ts`、`task-create.workflow.spec.ts`。服务端已有跨 restart/review/approve 契约。
- Knowledge 恢复与重新打开审阅由既有 `useAIKnowledgeCapture.spec.ts` 覆盖。
- SSE 订阅由既有 `useGoalWorkflowEvents.spec.ts`、`useAIGoalWorkflow.spec.ts` 和 `workspace-sse.http.spec.ts` 负责。前两者已使用虚拟时钟推进 30 秒并断言只读一次，无需浏览器实际等待 30 秒。
- 通知点击、筛选和计数显示由 `NotificationListPage.spec.ts` 负责；创建、已读、全部已读及未读查询由 Notification 的既有应用服务/用例测试负责。接受不再把页面点击、真实 Cookie、数据库和计数 UI 拼成一条 E2E。
- 接受的信号缺口：整页真实 reload 后的审批/审阅拼装、真实浏览器 SSE 连接上的 30 秒网络观察、通知 UI→真实后端闭环。上述下层测试不声称逐条等价。

最终 Web Flow 为 **6 文件 /10 用例**，相对原始 28/84 减少 22 文件 /74 用例（88.1%）。保留 checkpoint 身份隔离两例、多会话收敛一例、登录两例、密码重置一例、注册一例、设置持久化/跨标签三例。Provider onboarding、视觉、nightly 和 Desktop 专门 lane 未计入这十例。

core floor 只剩 `auth-login.spec.ts` 一文件两例；通知、scheduler、reminder owner 无专属 Web 扩展。unknown/shared/root 仍选全部六文件；按保留的原历史时长预算，全集现规划为一片，而非硬占四台 runner。不据此声称整轮 CI 已缩短。

## 执行与选择契约

Component Browser 不再在 job 内运行 `build --all`。Storybook 为缺失的 `domain-shared` 两个导出增加源码别名，新 worktree 无预先生产构建时已实际跑通。它不依赖 API、数据库、Web 生产包或在线 provider。主题契约使用显式 light 浏览器环境；小屏由 Storybook Vitest 插件设置真实 iframe viewport。

迁移必须同时保护调度：修改 Story、Web Auth 源码、App-Vue/UI 控件源码，或 Nx 判断影响 `ui-storybook` 的传递依赖，均要求 Component Browser。否则“把 E2E 删了、生产组件改动时却不跑替代测试”会丢失门禁。Manifest 回归测试覆盖这些情况和无关 backend 反例；现有 CI Check 在 required producer 跳过时仍判失败。收据继续使用 `storybook-results.json`，要求 17 条全部成功、零 skipped/todo，Story ID 唯一。

普通 PR 已经按 changed files / Nx affected 选择项目和 Web spec，非每次全量。Web owner 变更保留登录一个 core spec 地板，再加 owner 扩展；Goal/Task/Repository 还有 AI/Schedule 消费者扩展。只改 canonical spec 则只选择对应文件。未知、共享、root 改动扩大到完整集合；main、手动 full 和 nightly 仍承担更广验证。第二、三批已移除普通 CRUD、审批与通知的跨 owner 地板，风险收缩由用户明确接受；真实 owner 的下层验证仍由 affected targets 承担。

## 实测与边界

- 本地 WSL，真实 Chromium：新增五条认证页面 Story 加原有十二条交互，17/17 成功，首次成功整套 10.56 秒（测试体 3.06 秒），随后 17/17 成功。不是 CI 耗时。
- `playwright --list`：第一批24文件/60用例；第二批11文件/15用例；第三批6文件/10用例。这里只是收集，不冒充 E2E PASS。
- 最终提交的 affected 自检、治理和 CI 执行凭证记录在 Issue #625 / 对应 PR。API integration 的成功必须来自真实 PostgreSQL 执行，不能用收集结果代替。
- 旧 `web-spec-durations.json` 只删除已退休文件的历史条目，不给剩余缩短后的文件编造新时长；真实 CI report 可用于后续刷新、重配平和墙钟比较。
- 第二批保留的审批/审阅刷新、SSE 30 秒窗口和通知闭环在第三批继续退休；跨身份和多会话收敛仍保留。

## T3 Code 对照核实

核实公开上游 `pingdotgg/t3code@a0e0f8a80ae4caa6c32d3306a10a284e252c88d3`（提交时间 2026-10-24，UTC-07）。这是固定版本结论，不推断私有测试或未来版本。

此版本有 **59 个 `*.browser.test.ts(x)` 文件**，没有发现单独的 Playwright E2E config / e2e 目录。准确说法是：没有 MemoFlow 这种专门的整套产品 UI 旅程 E2E lane；不能将它概括成“完全没有真实浏览器或集成测试”。Server 侧例如 `ServerBrowserPage.test.ts` 直接启动 Chromium 验证浏览器服务，其他 server integration 也提供真实边界信号。

[Test Web job](https://github.com/pingdotgg/t3code/blob/a0e0f8a80ae4caa6c32d3306a10a284e252c88d3/.github/workflows/ci.yml) 只依赖 Changes，安装 Chromium 后运行 Web test；[Web Vite 配置](https://github.com/pingdotgg/t3code/blob/a0e0f8a80ae4caa6c32d3306a10a284e252c88d3/apps/web/vite.config.ts) 的 Browser project 直接收集源码，由 Vite 转译加载和 Playwright 启动真实浏览器。因此不需要先得到生产 dist。Build/Typecheck 在另一个 job；这不等于浏览器测试已经证明生产打包或发布产物行为。
