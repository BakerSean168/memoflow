# E2E 下沉与重复清理（Issue #625）

基线为 `main@5f9e5852314803d2b3c3ff05ddfaa50d94a9e83f`。本次迁移不包含尚未合入的 #602（API 认证前置）和 #624（Coverage 合并 / Web Build 解耦），也不复制根工作区未提交的 T1/T2 审计文件。

## 断言去向

- `authentication/auth-flow.spec.ts` 三条注册、登出再登录、错误密码旅程删除。`auth-login.spec.ts` 的两个真实认证旅程包含这些步骤，并额外验证 session 存在、不持久化 bearer 凭据；错误密码后仍确认登录表单可见。独立邮箱验证继续由 `auth-register.spec.ts` 负责。
- `authentication/auth-page-contract.spec.ts` 五条页面契约下沉到 `apps/web/src/auth/WebAuthView.stories.ts`：品牌主题不覆盖用户偏好、唯一主标题/表单/法律链接、全部注册字段与长度校验、提交后聚焦第一错误及修正清除、稳定错误随语言重译、登录焦点、360×640 可达性和无水平溢出。`auth-login.spec.ts` 的表单来回切换也并入该组件契约。真实生产组件、composable、翻译与输入控件在 Chromium 中执行，只替换外部认证服务响应。真实注册/邮件/错误密码服务端行为保留在认证 E2E。
- `user-settings/notifications.spec.ts` 三条卡片可见、owner PUT 成功/切换、刷新可见断言由 `user-settings/persistence.spec.ts` 既有刷新持久化旅程承接，且保留跨标签页测试。
- `notification/notification-center.spec.ts` 从五例合并为两例：三个薄用例的独有断言并入独立新账号空收件箱测试，保留两种筛选切换、空态、禁用 mark-all 和真实布局拖拽/焦点信号。不是用“没有未读”和“没有通知”互相替代。
- `task/task-plan-crud.spec.ts` 从七例合并为五例：列表/入口菜单断言并入创建旅程，空标题禁用 save 在实际创建前检查。保留后端创建、编辑/刷新、删除、checklist 持久化、面板拖拽等行为。
- `user-settings/data-portability.spec.ts` 从七例缩为一例：保留页面通知偏好写入后，通过真实 session 导出完整运行时注册的 V3 capability 集合。其余六例迁到 `apps/api/src/runtime/data-portability-http.integration.test.ts`：过滤、敏感字段排除、dry-run/apply round-trip、dry-run 不写入、旧版本/披露拒绝、身份字段拒绝。替代测试通过生产 ApiBootstrapper、owner composer、Prisma 与 PostgreSQL 执行，认证解析器使用独立测试 principal，额外检查三个迁移端点未认证时均为 401。它不宣称验证真实 Cookie 登录；此信号仍由保留的全栈导出和认证 E2E 提供。
- `note/legacy-note-mutation-boundary.spec.ts` 的五个退休端点 404 断言迁到 `apps/api/src/runtime/repository-http.integration.test.ts`。使用生产 Repository composer 与 ApiBootstrapper，同时检查当前 owner 路由确实安装且执行认证，防止漏注册整个模块导致所有 404 假绿。
- 删除 `testHelpers.ts` 中没有调用者的 Task 创建/清理及 Command Palette 打开/搜索/关闭辅助函数，不触碰专门的认证 fixture。

Web Flow 收集结果为 **24 文件 / 60 用例**，基线为 28 / 84；减少 24 条浏览器用例（28.6%）。Component Browser 增加五个 Story，形成 **4 文件 / 17 条交互**；API integration 增加两个文件 / 八例（含新增未认证控制）。这不是删除 24 条业务信号，也不代表整轮 CI 墙钟减少 28.6%。

## 执行与选择契约

Component Browser 不再在 job 内运行 `build --all`。Storybook 为缺失的 `domain-shared` 两个导出增加源码别名，新 worktree 无预先生产构建时已实际跑通。它不依赖 API、数据库、Web 生产包或在线 provider。主题契约使用显式 light 浏览器环境；小屏由 Storybook Vitest 插件设置真实 iframe viewport。

迁移必须同时保护调度：修改 Story、Web Auth 源码、App-Vue/UI 控件源码，或 Nx 判断影响 `ui-storybook` 的传递依赖，均要求 Component Browser。否则“把 E2E 删了、生产组件改动时却不跑替代测试”会丢失门禁。Manifest 回归测试覆盖这些情况和无关 backend 反例；现有 CI Check 在 required producer 跳过时仍判失败。收据继续使用 `storybook-results.json`，要求 17 条全部成功、零 skipped/todo，Story ID 唯一。

普通 PR 已经按 changed files / Nx affected 选择项目和 Web spec，非每次全量。Web owner 变更保留十个 core spec 地板，再加 owner 扩展；Goal/Task/Repository 还有 AI/Schedule 消费者扩展。只改 canonical spec 则只选择对应文件。未知、共享、root 改动扩大到完整集合；main、手动 full 和 nightly 仍承担更广验证。此次保持 core 地板，仅将退休 auth-flow 改为 auth-login；data-portability 地板现在只执行一条全栈 smoke。后续是否缩小 core 必须单独证明跨 owner 影响范围，不把目录名当作完整依赖图。

## 实测与边界

- 本地 WSL，真实 Chromium：新增五条认证页面 Story 加原有十二条交互，17/17 成功，首次成功整套 10.56 秒（测试体 3.06 秒），随后 17/17 成功。不是 CI 耗时。
- `playwright --list`：24 文件 / 60 用例，仅收集、未执行，不冒充 E2E PASS。
- 最终提交的 affected 自检、治理和 CI 执行凭证记录在 Issue #625 / 对应 PR。API integration 的成功必须来自真实 PostgreSQL 执行，不能用收集结果代替。
- 旧 `web-spec-durations.json` 只删除已退休文件的历史条目，不给剩余缩短后的文件编造新时长；真实 CI report 可用于后续刷新、重配平和墙钟比较。
- 保留 SSE 30 秒无轮询、刷新恢复、跨身份、多会话收敛、真实指针拖拽和真实持久化路径。没有把这些仅凭组件单测数量就删除。

## T3 Code 对照核实

核实公开上游 `pingdotgg/t3code@a0e0f8a80ae4caa6c32d3306a10a284e252c88d3`（提交时间 2026-10-24，UTC-07）。这是固定版本结论，不推断私有测试或未来版本。

此版本有 **59 个 `*.browser.test.ts(x)` 文件**，没有发现单独的 Playwright E2E config / e2e 目录。准确说法是：没有 MemoFlow 这种专门的整套产品 UI 旅程 E2E lane；不能将它概括成“完全没有真实浏览器或集成测试”。Server 侧例如 `ServerBrowserPage.test.ts` 直接启动 Chromium 验证浏览器服务，其他 server integration 也提供真实边界信号。

[Test Web job](https://github.com/pingdotgg/t3code/blob/a0e0f8a80ae4caa6c32d3306a10a284e252c88d3/.github/workflows/ci.yml) 只依赖 Changes，安装 Chromium 后运行 Web test；[Web Vite 配置](https://github.com/pingdotgg/t3code/blob/a0e0f8a80ae4caa6c32d3306a10a284e252c88d3/apps/web/vite.config.ts) 的 Browser project 直接收集源码，由 Vite 转译加载和 Playwright 启动真实浏览器。因此不需要先得到生产 dist。Build/Typecheck 在另一个 job；这不等于浏览器测试已经证明生产打包或发布产物行为。
