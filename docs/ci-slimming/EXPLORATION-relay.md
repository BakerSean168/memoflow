# MemoFlow 测试体系与 CI 瘦身：Relay 独立探索

> 探索基线：`5bc516e0228a399b1d6e56ffa4947d0b6b608212`（origin/main）；2026-10-22 任务口径。只读代码、配置、GitHub Issue/CI 证据；不修改测试或 workflow，不创建 PR。
> 本报告为独立调查，未读取另一条探索的结论。工作区进入时已有同名未跟踪报告；未把它作为调查输入，重写前将原内容保存在 Git blob `d0877a13290c54c2d0c86fa770f1c2d51bc0d4de`，可用 `git show <blob>` 恢复。当前任务分支已存在，使用用户允许的 `-r2` 后缀。
> 以下“实测”“静态统计”“建议”“预算假设”分开表达；不把抽样发现冒充全量删除证明。

## 0. 结论先行

1. **源码针对性测试应退出产品测试体系，不能仅改名为 AST 锁继续保留。** 204 个 surface 中，186 个含 readFileSync，另有 7 个退役/反射/弱断言文件可退役，11 个含真实行为应归位。因此原文件处置池 **193 个**；不代表 193 个可以不看混合行为直接 rm。源码断言保留数目标 **0**；11 个行为文件不应因后缀被误杀。
2. 第一轮可定位的删除/迁移池为 **398 个旧 spec 文件**：surface 193 + 其他独立源码锁 14 + e2e 67→8（净减59）+ 组件 spec 162→30（净减132）。这是迁移完成后的处置计划，不是立即删除授权。预留48个行为/合约补测文件后约 **1061** 个；398本身不足以支撑“全仓砍半”。
3. 半量目标建议 **650 个 spec/test**（比1411减53.9%，也低于1324口径的一半662）。还需在其他888个文件中实现 **411 个净合并/删除**，并控制新增文件≤48：**1411−398−411+48=650**。这部分是明确的第二阶段预算，尚未逐项证明；不能把“761个净减少目标”谎报成“已证明761个测试没价值”。禁止只把原断言搬入几个巨型文件来达标。
4. **13个 Web Playwright 配置收敛为4个运行边界**：Web 真链路、Desktop/Sync 原生链路、prod-like 环境、真人 OAuth 验收；UI reference/visual/composer 状态均由一个 Storybook build 承接。真端到端压到 **8个业务场景**，其中7个 Web、1个 Desktop/Sync；不是8个文件里藏100个独立旅程。
5. 最大缺口不是缺 Storybook 软件，而是**现有 Storybook 没有可执行的业务 owner 场景**：68个 story 文件=56个原子组件+12个 app-vue业务文件；现有 glob 重复扫描 ui-vue-shadcn，未指向 app-vue；全仓 story 没有显式 play；TaskPlanForm 的 Default 仅渲染 scaffold 文案。
6. 以用户核验的72 job-minutes全量基准测算，目标 **34.4 job-minutes、PR wall约8–10分钟**。这是带门槛的预算，不是本次已跑出的结果。单靠删204个 surface 不可能拿到这个收益；真正杠杆是 Web/secure-provider 旅程缩减、一次视觉构建、Unit/coverage只执行一次、组件状态覆盖去重。

## 1. 调查方法、口径和已有优化核验

### 1.1 可复算统计

只统计 `git ls-files`，不递归 node_modules、产物、他人工作树。测试名正则：

```python
r'\.(spec|test)\.[cm]?[jt]sx?$'
```

- TS/TSX：**1324**，与任务背景一致。
- 所有扩展名：**1411=1324 .ts + 78 .mjs + 9 .mts**；当前没有额外tsx测试改变这个和。
- canonical `tools/test-system-v2/test-inventory.json` primary：**1413**，比上面多2个Task性能bench；不是测试发现漏掉两个spec。
- surface：**204**；其中186含readFileSync；18不含。
- TS spec中含readFileSync：**216**，并非本SHA的212；所有扩展名237。这个词只说明读文件，**不能推出读源码**。
- 按下节优先级分类，surface之外还有95个读文件候选（readFileSync或readFile调用）；大量读的是运行输出、SQL输入、JSON fixture，不该删除。
- 直接含 `@playwright/test` 的TS/MTS/CTS/TSX源文件96；“Playwright相关106”包含配置/helper等不同口径，不等于106个测试。canonical e2e primary **67**，其中Web56、Desktop11。
- stories **68个文件**，不是68个story export，也不是68条可执行用例。

未使用CodeGraph/nx-mcp：本会话可用工具检索未发现这两个服务；采用tracked路径清单、canonical inventory、project.json与实际脚本降级检查，不声称使用过未暴露的MCP。

### 1.2 不能重复领取的收益

| 历史项 | 当前可见事实 | 本次增量建议 |
|---|---|---|
| #502 | CLOSED；source-lock manifest 34 entries / **60 locks**；另有 **334 AST结构规则** | 373→60不是本次收益。60个剩余文本锁与334个逐实现规则仍需按风险退役；AST不是天然行为测试 |
| #505 | CLOSED；ai-workspace retries=0，failOnFlakyTests=CI | 不再建议“把该配置2改0”；ai-provider/shell/desktop-screenshot仍CI=1，sync=2，非全仓已归零 |
| #506 | CLOSED；web_matrix已动态；target397s−setup97s=300s执行预算；未知/共享改动回退4片 | 不再新增动态shard系统。删减后应更新manifest/spec清单/耗时权重，继续复用原门禁 |
| #508 | CLOSED；prepare-ci-manifest与ci-evidence已有main tree等价证据复用，保留fail-closed全量回退 | 不再把去掉main重复全量作为PR收益；不能删exact-tree、digest、attempt校验 |

### 1.3 实测时间证据

用户提供11.6–28.4分钟wall、约72 job-minutes作为全量规划基准。另独立抽取GitHub API：

- PR run **39615064408**，head `3478af486d71b77a687fdca95f9d924781473947`，created 2026-10-21T14:14:07Z；最后作业至14:29:02Z，约14.9分钟，所有job实际运行时长和 **48.33分钟**（不按计费向上取整）。
- Web四片 **10.60 / 7.45 / 5.53 / 7.87分钟**，合计31.45，占本轮65.1%。Unit第三片跳过，Typecheck与coverage大量命中缓存；不能用这轮较轻Unit推翻全量72分钟基准。
- Web (1/4) 主旅程303秒 + visual52秒 + **secure AI provider169秒**；后者仅在首片串行，解释了LPT主旅程均衡后首片仍落后的原因。
- 字体安装每片13–17秒，本轮合计58秒；视觉比较22–52秒/片，合计157秒；四片仍各自构建同一个visual harness的Web/Desktop产物。搬到单一Storybook lane节省的是重复构建/依赖，不是声称每张截图很慢。
- Web依赖build：本轮scope约56秒，build约173秒，然后Web才开始。优化Web后，build/typecheck可能成为新的关键路径，不能相加所有job时长当wall。

逐文件Unit耗时来源：run **39166760886** 的artifact **12151491361**（delivery-validate-unit-job）；用GitHub API下载ZIP到内存，解析Vitest testResults及slowestSpecs，未写入仓库。取到389条文件结果，**是历史affected子集、不是全仓排名，也不包含每个文件的transform/setup成本**。见第4节。最新轻量run的unit artifact只报告工具项目，不能提供全仓文件耗时。

## 2. 测试存量分类账

### 2.1 canonical执行归属（互斥、合计1413）

| 类别 | 数量 | 代表路径 | 每类典型维护痛点（定性，不假造工时均值） |
|---|---:|---|---|
| Unit |1192|packages/goal/src/server/application/use-cases/commands/__tests__/activate-goal.test.ts|重复fixture、重模块图、跨层断言；200个surface混入unit|
| Integration |53|apps/api/src/__tests__/integration/agent-instance-registry.integration.test.ts|真DB建库/清理；对CAS与事务必要，不应被mock替代|
| Smoke |3|apps/api的smoke collector|引导/构建成本；应限组合根启动与健康路由|
| Boundary IPC |8|apps/desktop/vitest.ipc.config.ts归属文件|桥接协议与authority；其中3个surface不等于行为覆盖|
| Boundary Main |10|apps/desktop/vitest.main.config.ts归属文件|主进程生命周期；其中1个surface|
| E2E |67|apps/web/e2e/goal/goal-crud.spec.ts|账号、DB、浏览器启动、状态屏障；大量UI状态伪装e2e|
| Perf bench |2|packages/task/src/server/domain/performance/task-vnext.performance.bench.ts|噪声与资源争用，应独立于普通PR时延承诺|
| Governance |78|tools/ci-cd-platform/__tests__/ci-check.test.mjs|真实工具契约和workflow文本锁混在一起；不能整类删|

coverage是测量suite，不是新的primary：**579个文件**被coverage collector收集，可能与Unit重复执行，不能再加到1413。

### 2.2 按内容的独立筛选账（合计1411，不含bench）

分类优先级：surface → 其他读文件 → Playwright/e2e → Vue mount/render → 其余。这是复算筛选器，不是静态语义证明。

| 类别 | 数量 | 代表 | 维护代价/建议 |
|---|---:|---|---|
| surface |204|task-plan-ownership.surface.spec.ts|实现字符串/退役记录锁；见附录逐文件|
| 其他读文件候选 |95|label-service.spec.ts、coverage-workflow.test.mjs|有合法fixture/输出读取，也有隐形源码锁；严禁按readFileSync一刀切|
| Playwright/e2e（扣除读文件优先归类项） |62|auth-page-contract.spec.ts|加上前类中的5个Desktop文件即canonical67|
| Vue mount/render候选 |162|GoalDialog.spec.ts|153 app-vue +4 web +3 desktop +2 ui-vue-shadcn；含业务状态机，不全是视觉|
| 其余 |888|Mastra、Goal/Task、contracts等|默认保留，按失败风险而非行数逐owner压缩|

测试量最大的项目：app-vue251、desktop138、ai123、goal112、contracts99、api96、task94、web76；前8个合计989。最小文件（<100行）629个，**小不等于无价值**，例如Account credential authority只有19行却覆盖Closing fail-closed。

## 3. 源码测试：删除、改行为、保留

### 3.1 surface全量处置策略

附录A列出204个确切路径。186个readFileSync文件以保守关键词分为：**B 71 / T 10 / D 105**。这些是可执行分批的**预分流**，不是声称71个全是安全测试或105个均无行为；含身份相关词即优先进入B，减少错删。落地时逐断言清点，混合文件不能整体跳过。

| 组 | 数量 | 处置 | 验收 | 预计PR job-min收益 |
|---|---:|---|---|---:|
| D 退役/实现/文案候选 |105|删除“旧文件仍不存在”“只许这个函数名/文案/class”等锁；混合真实行为迁owner测试|源码重命名/等价重构不再触发；真实可见回归仍被行为测试拦截|与B/T合计0.5–2，不单独相加|
| T 导出/依赖候选 |10|编译解析+实际import/打包smoke+通用依赖约束；不再每个barrel一个spec|坏exports必须在消费者/产物import失败；禁止导入由通用解析规则拒绝|同上|
| B 身份/状态候选 |71|先补/指认越权、重入、CAS、取消、旧快照反例，再删源码断言|删除identity过滤/去掉version条件/重复approve能让测试红|补测可能抵消局部收益，不能承诺71份全省|
| 非读源码弱锁 |7|见下表，删除或把有意义枚举校验合入schema测试|不以测试自己创建的对象证明API接受它|毫秒级执行；主要省发现/维护|
| 非读源码真实行为 |11|保留语义，去surface命名；重复数据表归owner合并|保留负向边界，不为数字删掉|不计删除收益|

需要补行为的典型证据：

- `packages/task/src/server/infrastructure/adapters/prisma/__tests__/task-plan-ownership.surface.spec.ts` 读取port、Prisma、PowerSync、use case、routes、Electron八层源码，验证诸如“where: { id, identityId }”。**字符串存在不能证明请求A读不到B的数据**。替代为Prisma/PowerSync同一隔离契约（A/B分别创建、A获取/分页/更新/批删B均失败且B不变），HTTP与IPC各只保留一次认证上下文传递contract。
- `operations-dist.surface.spec.ts` 的tsup入口字符串与JS内符号文本不是真产物可用性；改为build后从公开export实际import四个schema并parse。不能把这类产物检查直接迁Storybook或以source alias替代。
- `task-goal-contribution-v2.surface.spec.ts` 手写linkOnly再 `as Binding`，断言自己的对象无contribution，**没有调用CreateTaskPlanSchema**。删该伪证明；可选contribution语义由真实schema parse/非法组合表承接。
- `contracts/.../transport-cast-inventory.surface.spec.ts` 一类明确架构禁令宜交统一lint/AST rule；不建立一个“每段旧源码都有AST副本”的334条新兼容层。

18个不含readFileSync的文件已全部打开核读，分歧如下：

| 文件（相对可检索尾路径） | 结论 |
|---|---|
| apps/api/.../get-github-oauth-config.surface.spec.ts |保留行为：e2e mock隔离、host-dev缺secret返回null；生产配置fail-closed|
| apps/desktop/.../desktop-electron-contracts-path.surface.spec.ts |删：existsSync旧目录负锁|
| ai/.../ai-provider-config-barrel.surface.spec.ts |删：旧barrel存在性锁|
| ai/.../ai-conversation-repository.surface.spec.ts |删：反射方法名不是身份隔离测试|
| ai/.../ai-provider-config-repository.surface.spec.ts |删：同上|
| ai/.../tokenize-keep-boundary.surface.spec.ts |保留行为：CJK/ASCII分词、确定性非零向量|
| app-vue/.../desktop-update-service.surface.spec.ts |删：typeof DI key===symbol不证明装配可用|
| app-vue/.../clamp-dual.surface.spec.ts |保留边界行为；合并clamp owner表|
| app-vue/.../format-date-keep-boundary.surface.spec.ts |保留空标签语义，但归time owner，与下一项合并|
| app-vue/.../format-datetime-keep-boundary.surface.spec.ts |同上，重复dash/na无需两个Vue进程|
| app-vue/.../format-time-range-keep-boundary.surface.spec.ts |保留DST/timezone/all-day行为，非源码锁|
| app-vue/.../is-plain-object-keep-boundary.surface.spec.ts |保留IPC sanitize类实例/数组行为，合并sanitize测试|
| app-vue/src/views/dead-surfaces.surface.spec.ts |保留route映射行为，合入已有GoalDeepLinks契约|
| contracts/src/result/ipc-envelope.surface.spec.ts |保留raw/null/domain DTO误识别负例；合入Result owner|
| goal/src/api/__tests__/goal-api-module-gate.surface.spec.ts |保留组合根缺instance/taskBindingReadPort抛错行为|
| goal/.../goal-application-types-barrel.surface.spec.ts |删：已删文件负锁|
| notification/.../notification-metrics-unified.surface.spec.ts |保留真实record→snapshot行为；删“自己造expected数组长度6”弱断言|
| task/.../task-goal-contribution-v2.surface.spec.ts |删原文件：真实schema承接枚举/可选配置，手写对象自证删除|

**与“全删surface”的分歧：只反对按文件后缀杀掉上述11份行为；对源码文本锁归零无分歧。** 保留的是执行实际函数的反例，不保留surface特权目录或文件命名。

### 3.2 surface以外的源码断言

独立源码锁优先处置14个文件（与surface、e2e、组件迁移池不重叠）：

| 集合 | 数量 | 原文件/去向 |
|---|---:|---|
| AI路由 |1|`packages/ai/src/api/routes/ai-provider-onboarding.routes.spec.ts`：HTTP请求probe/commit/replacement、非法body与secret不回显；复用已有API测试|
| Cloud auth出口 |2|`packages/cloud-auth/src/index.spec.ts`、`src/server/public-surface.spec.ts`：入口编译/浏览器打包与真实closure拒绝行为|
| 数据库schema文本 |7|`packages/database/src/schema/` 下 cloud-auth-user-access-projection、goal-description、goal-record-authorship、routine-activated-at、repository-vnext-retirement、scheduler-vnext-retirement、task-plan-canonical-persistence 的spec：删退役词/列间空格/历史迁移锁；有现用字段风险则真DB写读/约束验证|
| Time边界 |2|`packages/time/src/__tests__/runtime-dependency-boundary.spec.ts`、third-party-contract-boundary.spec.ts：前者精确锁依赖版本无必要；后者用通用依赖解析规则，不用字符串扫描from引号|
| CSS精确色值 |1|`packages/ui-core/src/styles/theme.semantic-tokens.spec.ts`：computed style/对比度+Storybook视觉，不锁HSL文本|
| 工程文案 |1|`tools/governance/__tests__/engineering-reference-policy.test.mjs`：ADR状态句/AGENTS原句不属于产品回归；链接正确性交docs-check|

预计合计节省 **0.1–0.5 job-min**，包括移出重复发现的间接开销；不是14×文件平均耗时的伪精确估计。

混合文件只删源码断言，不减整个文件：compose-data-portability.spec.ts:109起、web-origin.spec.ts:124起、repository.handlers.spec.ts:140起、task-plan.dto.test.ts:72起、goal-review-signal-analyzer.spec.ts:25起、setting/.../user-preference-service.spec.ts:256起、time/facade.spec.ts:97起、time/time-context.spec.ts:52起。数据库task-goal-binding-constraint.spec.ts既有SQL文本锁也有runtime控制流；把NULL/NaN/Prompt/Fixed非法组合真正写进Postgres验证，保留初始化幂等/事务失败语义。

**读文件但应保留**：
- label-service.spec.ts读取canonical normalization JSON，是表驱动输入，不是源码；
- agent-instance-registry.integration.test.ts和database/ai-agent-registry.integration.test.ts把迁移SQL实际送入Postgres，校验owner/CAS/重启，不是源码字符串锁；
- Desktop git/profile/import/clear-storage/更新receipt测试读取测试产生的文件、检查凭据不落盘、冲突不丢失，正是不可由Storybook替代的持久化证据；
- ci-check、promotion、artifact-contract、ci-evidence、runtime-closure等构造篡改输入再执行工具，保护交付真值，不能整类删；
- workflow测试中断言yaml里恰好有某段shell文本的部分删/改为解析任务图与执行negative fixture；真实部署/签名/digest脚本输出测试保留。
附录B给出全部95个读文件候选的分流，不把237个readFileSync文件当237个源码锁。

### 3.3 manifest的60文本锁与334结构规则

60 locks不算测试文件，不能把删60锁记成删60 spec。34个entry的准确数量见附录C。

- 文案/图标/class/局部函数名/旧文档锁：直接删；UI意义由stories验证。
- owner行为：例如Goal保存忙态、AI provider onboarding、notification preferences、timezone，先确保行为场景可执行再删；**不要求旧锁每个matcher都等价复刻**。
- 不同包/运行时依赖禁令：只保留少量广义确定性规则及其正反例；删具体symbol清单。
- 334 AST规则也必须审：例如rule-menu-labels-single-track-2仍逐文件要求setI18nLocale/document.documentElement.lang，只是把脆弱文本锁升级成更昂贵的结构锁。目标是删除逐实现规则，而非再建一套新清单。
- audit引擎的负例测试（如architecture-surface.test.mjs）和对真实业务代码的逐行锁不同：前者检测“规则是否会发现绕过”，可以保留通用机制测试；先决定保留哪些政策，再删除已退休政策的fixture。

## 4. 单元测试瘦身：真正的大户和反例

### 4.1 有耗时证据的Top嫌疑，不按文件长度瞎排

以下均是run39166760886历史affected子集的**执行时长**，非当前全量p95。

| 文件 | 秒 | 实际读到的内容/决策 |
|---|---:|---|
| app-vue/.../dialogs/GoalDialog.spec.ts |17.742|1971行；:531锁focus-visible:ring-2；:552真实owner双提交与lease；视觉迁stories，lease/旧回调拒绝保留headless行为，不整删|
| app-vue/.../setting/components/AISettings.spec.ts |16.108|1458行；:971键盘切换、:1010附近实native probe→DTO→Tooltip隐私矩阵；将状态/Tooltip迁stories，隐私矩阵留runtime authority，UI仅留一条sanitized DTO渲染|
| tools/governance/.../architecture-surface.test.mjs |13.844|子进程执行audit、临时root正反例，非仅源码toContain；减少已退役政策fixture和重复CLI启动，但保留真正绕过负例|
| app-vue/.../goal/views/GoalDetailView.spec.ts |13.358|6个vi.mock、shallowMount+Select/子对话框stubs；KRs标签/单位/空值迁Storybook；receipt版本推进/锁定与失败恢复保留契约|
| desktop/.../desktop-knowledge-repository-git.runtime.spec.ts |10.576|真实git/file roundtrip、token不落.git/config、冲突保留；慢但价值高，保留，不搬Storybook|
| app-vue/.../GoalDeepLinks.characterization.spec.ts |10.414|真实memory router、Pinia+owner view；直接URL/回退/late response/导航guard。路由装配留少量真实router契约，不能因已有视觉就全删|
| tools/governance/.../public-surface-jsdoc.test.mjs |6.819|lint型规则引擎正反例；归工具target，只在规则变更跑引擎单测，产品改动仅跑audit|
| app-vue/.../CreateScheduleDialog.spec.ts |6.168|组件交互迁stories，时区/业务边界归纯函数；迁移后才删|
| app-vue/.../useAIChatView.lifecycle.spec.ts |5.660|12处vi.mock；服务事件订阅与dispose留一个生命周期契约；渲染状态迁stories，删除组件内部调用顺序断言|
| web/src/mocks/handlers/goal.handlers.spec.ts |5.286|测试mock的成本需单独审；保留mock响应schema自洽，删除与真实owner重复CRUD算法|

反例：2208行useAIChatSession.spec.ts在此样本只 **1.533秒**，1915行useAIGoalWorkflow.spec.ts约 **1.342秒**，KnowledgeRepositorySettings.spec.ts约 **2.037秒**。行数说明维护压力，不足以宣布它们是CI主耗时。useAIChatSession覆盖late list不复活删除、跨消费者reset、terminal flush、cancel竞态等独特风险，不能随视觉迁移消灭。

数量/结构嫌疑：
- 最长：mastra-workflow.runtime2238行、useAIChatSession2208、GoalDialog1971、useAIGoalWorkflow1915、knowledge-repository-projection.service1869；这些只是阅读优先级。
- vi.mock最多：desktop/renderer/bootstrap/app.spec.ts **22**；web/src/bootstrap/app.spec.ts **12**；compose-ai API **11**；NotificationListPage **10**。22个模块替身拼出的bootstrap不证明真实启动，建议一份启动契约+原生e2e的launch断言，保留服务dispose等少量确定性行为。

### 4.2 重复覆盖的抽样实证

1. **Goal状态跨层重复**：activate-goal.test.ts、complete-goal.test.ts都创建Goal+mock repository，反复测NOT_FOUND、DTO name/id、status/时间字段。可以参数化缺失/未授权/冲突的应用层公共表；状态合法性详表只在Goal aggregate测一次。必须留下应用层“不多save、不多version、不多event、CAS传入旧version”这些跨边界语义；complete/activate合法转移不同，不能只留一个happy path。
2. **mapper additional不是全重复**：prisma-goal-mapper.spec.ts测Measurement V3/target pair，additional.spec.ts有null fallback、relations、review/systemContext、number/Date。可合并fixture和roundtrip表，但直接删additional会丢边界；删除“只是为了覆盖率增加”的self-evident属性复制，只能在证明owner roundtrip覆盖之后。
3. **UI字符串/class多层重复**：GoalDialog:531同时断言无障碍行为和Tailwind class。保留blur→错误→修正行为，删class断言；与Goal reference/visual matrix的同样create界面只由一个story运行。不是把原三份断言都拷贝成play。
4. **AI隐私跨层矩阵**：AISettings:1010起真实NativeAgentFlowFixture创建临时目录、逐spawn/stderr/rpc错误跑到Tooltip，重跑运行时安全矩阵。正确分工：runtime测所有敏感错误类别；schema测公开结果结构；UI story测sanitized结果不丢字+一个恶意DTO不回显；一条集成链验证接线。不能全部替换成UI mock后声称安全覆盖还在。
5. **测试mock而不是产品**：GoalDetailView将router/useGoal/useGoalWorkspace/UI/DI/catalog均替换，然后验证子stub发saved。这种“父组件收到假saved会refresh”只需一条；同一UI在browser story验证真实子组件，不重复在每个view单测。

### 4.3 删除与合并判定门槛

- 每份断言回答一个独特失败风险；如果同一输入/同一公共输出/同一owner在另一层已测，保留最近owner的一份。
- mock只放外部I/O边界；mock了被验证的决策、schema或状态机后只验证自己的fixture，删。
- 不测TypeScript接口源码存在；测运行时parse拒绝invalid/null/unknown variant、transport envelope。
- 不以“无mock”作为保留充分条件：巨大fixture跑十遍同一条链仍可减。
- 不删真实DB隔离、unique/CAS、并发幂等、重启恢复、native process cleanup、密钥不落盘。
- 合并收益分开核算：文件发现/模块初始化省时、fixture减少、断言真正减少。合成巨型spec若依旧执行同样场景，不算语义瘦身；并发反而可能变差。

## 5. Storybook承接方案

### 5.1 现有基础的真实覆盖缺口

`packages/ui-vue-shadcn/.storybook/main.ts` 两个glob分别是../src与../../ui-vue-shadcn/src，落在**同一包**，不是app-vue；preview只接UI CSS、controls、autodocs。aliases仍有旧ui-vue、domain-client、contracts路径，需用真实build验证，不应假定可用。
12个业务story只在notification(6)、setting(4)、schedule(1)、task(1)，**Goal、AI workspace、Knowledge、Routine、AppShell/Auth基本缺席**。TaskPlanForm.story只渲染“story scaffold”，NotificationDrawer部分用手写slot模拟内容，不覆盖真实列表装配。现有68个文件不能抵扣162份组件spec的覆盖债。

### 5.2 一个承接入口，不再造四个Vite页面

建议以现有Storybook为唯一组件/页面浏览器测试入口：

- 修复globs只扫一次ui-vue-shadcn并纳入app-vue；挂真实i18n、Pinia、memory router、主题、时区、host能力decorator。
- 在真实DI/service port注入确定性fixture；不要mock useGoal/组件树内部决策。API响应双端共享schema校验，UI不冒充真DB。
- 使用与Storybook10.6兼容的test-runner，执行CSF play与断言。当前没有test-runner/a11y/visual runner依赖或CI target，必须先做一小slice验证版本兼容；不能宣称安装好即自动覆盖。
- Play测试用户可见结果：焦点、键盘、错误恢复、发送/取消、busy、跨导航草稿；持久化/CAS机制本身仍在owner测试。
- 若采用Storybook官方Vitest整合，必须先验证Vue支持与当前版本，再选择；**test-runner与Vitest browser二选一执行同一批story，避免双跑**。不为了追逐T3技术栈切React或Vite+。

### 5.3 迁入分组与缺口验收

| 业务owner | 迁入来源 | 最少状态覆盖 |
|---|---|---|
| Auth |auth-page-contract、登录注册本地校验、WebAuthView|invalid/首次错误focus/Enter/i18n/小屏；真实cookie与session只留e2e|
| Goal |GoalDialog/Detail/List、goal-reference、visual matrix Goal|空/多KR、不同单位、create/edit、busy/conflict/failure、Record/Review、overlay导航|
| Task |TaskPlanForm/Dialog、visual-grammar、TaskManagementView|Recurring/all-day/timed、KR链接、测量、提交错误、忙态、菜单键盘；必须用真实表单，不沿用scaffold|
| Schedule/Routine |presentation-authority、schedule-calendar UI、routine config UI|碰撞/布局、时区/DST显示、拖拽反馈、创建/取消；计算算法留纯函数|
| AI |7个goal-workflow UI、provider-composer-states、AISettings|stream/replay/approval/ask-user/cancel/error/model-switch、空provider、credentials已隐藏|
| Knowledge |note-workspace UI、projection workspace、GitHub connection UI|引用、projection blocked/conflict/recheck、权限不足、guest；git持久化仍runtime测|
| Shell/Notifications/Settings |responsive-sidebar、shell geometry、notification drawer/settings|窄宽布局、focus trap/inert、键盘、长文本/双语、空列表/不可用/保存反馈|

目标第一批业务state story ≥40个有效export，迁移过程中约100个story文件预算（原68+约32），具体export按业务风险定，不用全局story数量当门禁。文件数650指标只指spec/test；必须另报story/play数量，防止通过改扩展名隐藏测试增长。

### 5.4 视觉回归实施边界

- **一个静态build，一次启动，一套Chromium**；现有matrix、composer-footer、scrollbar-gutter以及reference harness转换为story ID。不需要API/PG、每shard多次Vite build。
- 固定Linux镜像/Playwright版本/字体（当前Noto CJK+WenQuanYi需保留环境契约）、deviceScaleFactor、locale、timezone、固定时钟；等fonts.ready与业务就绪信号、关闭动画；不能靠sleep或给大diff阈值。
- PR运行受影响owner的全部交互play，视觉用代表组合：每owner默认宽浅色 +窄深色+中文长文，特定溢出/滚动/overlay状态单独列；不要把host×主题×语言×宽度全部笛卡尔积扩张。完整视觉组合可定期跑，但先去重，不能把原重负载简单转移到nightly。
- 先保留原像素/几何断言作为迁移对照；同一SHA旧harness和story故意引入overflow/focus错误必须同时红，证明承接不是空白截图。
- 若自托管：test-runner postVisit访问story iframe，等待play结束再toHaveScreenshot，review actual/expected/diff；基线更新必须人工审阅差异，普通PR只compare，不能自动更新。
- 平台差异由host decorator模拟产品组件状态；真实Electron窗口、preload、drag-region/原生菜单另归Desktop场景，不宣称Storybook可验证。
- Storybook lane预算 **≤4 job-min**（build+play+selected snapshots合计）；若只是把162份happy-dom换成162次全量页面加载，迁移失败。

## 6. 13个Playwright配置逐个去向

| 当前apps/web配置 | 真实用途/当前执行入口 | 决策与用例去向 | 预计PR job-min收益（非独立可加） |
|---|---|---|---:|
| playwright.config.ts |28个canonical Web specs；真API/Web/PG+mock OpenAI；CI动态shards|保留入口，缩为7个Web场景；状态/布局迁stories，重复CRUD删|Web整体34→8–9，含下列条目|
| playwright.audit.config.ts |base扩展，5个nightly补充owner specs|删独立配置：account/profile真实持久化并入Auth场景；appearance/command palette迁story；性能归perf|当前PR0；减nightly维护|
| playwright.ai-workspace.config.ts |7个goal-workflow specs，SSE多数由fixture mock；与required全集重叠，Windows外部runner兼容|删配置/重复runner，绝大多数迁stories；一个**不mock内部workflow HTTP/SSE**的AI真链路进主入口|历史权重7份350.96秒；不能与Web总减重复加|
| playwright.ai-provider.config.ts |secure runner管理服务；首片额外执行onboarding/composer states，CI retry1|删独立配置：wizard/空态/recheck迁stories；credential roundtrip/rotation简版并入AI真链路；安全矩阵归API/runtime|本轮169秒大部分可移除，预算省1.5–2.5|
| playwright.goal-reference.config.ts |生产组件+service doubles，无DB，独立Vite build，6个reference之一|删；Goal story+play+snapshot|当前PR未直接执行此配置，0直接收益|
| playwright.task-visual-grammar.config.ts |生产组件+service doubles，无DB，独立Vite build|删；Task stories|当前PR0直接收益|
| playwright.schedule-presentation-authority.config.ts |3个schedule reference spec，独立Vite build|删；碰撞算法纯函数+UI stories，不留假e2e|当前PR0直接收益|
| playwright.visual-regression.config.ts |matrix/composer-footer/scrollbar-gutter；Web与Desktop各build，CI每片执行|删应用级visual入口，Storybook唯一visual runner；已有基线有证据再迁|本轮157秒比较+58秒字体+重复build部分；迁入Storybook后净收益另计|
| playwright.shell.config.ts |Electron guest无API，globalSetup；geometry/keyboard|合并到Desktop/Sync配置，几何迁story；原生窗口/快捷键保留场景8|当前普通PR0，Desktop条件lane才有收益|
| playwright.desktop-screenshot.config.ts |thesis截图与layout artifact，Electron build+API；不是全部带像素基线断言|删测试配置；可复现截图导出作为文档工具，不进质量门禁；真实UI状态迁stories|当前PR0，不把论文截图当e2e覆盖|
| playwright.sync.config.ts |API+Web+PowerSync+Desktop，真实跨端，CI retry2|保留为Desktop/Sync owner配置，合并shell/native/packaged验证项目，重置retry0并治理状态隔离|不承诺删跨端机制；普通Web PR0|
| playwright.local-docker.config.ts |真实已启动prod-like环境，auth/goal与phase-a…e重复；无webServer|保留环境边界；复用7个Web业务场景，不另养phase副本；按部署/运行时改动触发|普通PR0；节省本地与发布重复维护|
| playwright.oauth-real.config.ts |真实GitHub、已有host-dev callback、headed人工授权|保留显式人工验收，不作为无凭据PR门禁；复用Auth场景变体，不额外扩展旅程|普通PR0|

最终4个应用运行配置，Storybook test-runner自己的必要配置不算新增应用e2e配置。也可以把local-docker做主配置环境project进一步收为3个，但不为少一个文件混淆“谁启动/销毁服务”的所有权。**配置合并本身不省时间，删除执行/重复启动才省。**

### 6.1 28个required文件的具体分流

| 原spec（apps/web/e2e下） | 去向 |
|---|---|
| ai/goal-workflow/checkpoint-identity |持久化/owner隔离放runtime integration；草稿恢复UI story；AI场景只留一次真实reload|
| ai/goal-workflow/sse-budget |重放/ready/预算契约归client/runtime；可见stream states story；不重复真实登录|
| ai/goal-workflow/multi-session |事件乱序/晚list归composable；真跨端归场景8，UI session变体story|
| ai/goal-workflow/workspace-shell |root route smoke并Auth启动断言；mobile切屏/引用保留stories|
| ai/goal-workflow/goal-agent-approval |UI卡片story；审批提交真实Goal写入并场景6|
| ai/goal-workflow/task-create-approval |UI卡片story；Task workflow runtime契约；不再每种owner重跑浏览器审批全链|
| ai/goal-workflow/knowledge |引用UI story；真实落盘/读回归场景5或runtime|
| ai/multi-engine-host |引擎切换规则runtime；model selector story；场景6验证选中实例的真实调度|
| authentication/auth-flow |场景1主线骨架|
| authentication/auth-login |错误/表单本地状态story；cookie/session刷新并场景1|
| authentication/auth-password |API token/过期/密码拒绝契约；场景1一次session失效，不做重复注册|
| authentication/auth-register |注册验证本地状态story；真注册保留场景1|
| authentication/auth-oauth |mock OAuth API契约；真实provider只manual验收|
| authentication/auth-page-contract |几乎全迁Auth stories；最后验证码网络动作并场景1|
| goal/goal-crud |场景2只留create→KR→record→reload可见→删除；过滤/文案/布局story|
| note/legacy-note-mutation-boundary |退役通道不存在由API路由行为/通用治理保证，删浏览器负锁|
| note/note-workspace |引用/树/编辑UI story；真实note持久化场景5|
| notification/notification-center |列表/交互UI story；真实delivery/read一条并场景3|
| notification/notification-inbox-loop |与场景3合并，可靠投递矩阵在DB integration|
| routine/routine-configuration |配置UI story；激活持久化并场景4|
| schedule/schedule-calendar |calendar渲染/过滤story；真实Planner保存读取并场景4|
| schedule/planner-task-revert |纯owner写入/回退契约；场景4一个真实revert动作|
| shell/responsive-sidebar |全部story；真实host差异场景8|
| task/task-plan-crud |场景3create plan→complete occurrence，不再全字段重复CRUD|
| task/task-completion-loop |与场景3合并，task→goal贡献/通知outbox真实观察|
| user-settings/notifications |表单story；preferences API持久化契约|
| user-settings/persistence |一个重启/刷新持久化断言并Auth或相应owner；显示设置story|
| user-settings/data-portability |保留场景7真实export/import结果，其余格式/失败矩阵归service/API|

### 6.2 保留的8个真端到端业务场景

| 场景 | 保留证明 | 不再覆盖 |
|---|---|---|
| 1 Auth与启动 |真实register/verify/login→cookie→刷新仍可读账户→logout后401；共享一次身份准备|每个输入校验/双语文案/全部密码异常|
| 2 Goal闭环 |真实Goal+KR→Record→刷新后轨迹/进度→删除|每个KR方法全套UI、每种状态CRUD|
| 3 Task贡献与通知 |真实plan→occurrence完成→Goal贡献/notification可读→read状态持久化|每种优先级/过滤/批量按钮|
| 4 Planner/Routine |真实routine激活→planner操作/撤销→刷新验证结果；不等五分钟真实时钟|布局/碰撞排列组合/DST算法|
| 5 Knowledge闭环 |真实note写入/读取/引用投影结果；不可只route.fulfill|每个空态/菜单/全部GitHub故障|
| 6 AI安全dispatch→审批 |真实保存credentials（上游provider可mock）、选Agent→HTTP/SSE→审批→真实owner写入→reload状态；一次rotation验证旧key不可用|内部workflow API不能mock；每种错误和所有workflow kind不再重跑浏览器|
| 7 数据可携带性 |真实导出→导入隔离profile/identity→读回关键数据；校验无重复副作用|全部schema错误/每种冲突矩阵|
| 8 Desktop/Sync |真实Electron/preload/IPC、local profile、离线写→重连同步、对端可见；native launch/restart/cleanup作为同场景release变体|不能用普通网页storybook模拟原生能力|

目标7个Web场景在2片执行，每片含setup **≤4–4.5分钟**，场景8由Desktop/Sync改动/发布门禁执行。全量PR涉及Desktop时允许预算例外但必须单列，不能承诺任何跨平台release也≤10分钟。OAuth真人验收是场景1的环境变体，packaged runtime是场景8的交付变体，不增加九条常驻产品旅程。

“8”不是安全豁免：若场景3等待通知真实scheduler数分钟，应通过测试时钟/直接受控job触发保持真实outbox消费，而不是改成fixture假通知。每条旅程给出实际持久化观察点，不能仅UI visible即通过。

## 7. 数字预算、增量收益和不可伪装之处

### 7.1 文件数量：可定位池与半量目标分开

| 动作 | 旧文件净处置预算 | 证据程度 |
|---|---:|---|
| surface186源码候选+7弱锁，保留11行为 |193|全量路径存在；非源码18已逐一读，186为保守分流，混合行为待逐断言确认|
| 14个其他独立源码锁 |14|源码读取/断言已检查；需runtime替代的先补|
| canonical67 e2e→8场景文件 |59|collector/config/用途核验；详细场景需实现与验收|
| 162组件候选→30必要headless/lifecycle spec，UI迁story |132|按内容筛选；Top实读；并非162全量逐断言已审|
| 小计旧spec处置 |**398**|是迁移池，不是无条件删除总数|
| 新增行为/contract spec预留 |**+48**|保守预算，包括source锁替代；stories另计|
| 第一轮结束 |**1061**|1411−398+48；距离砍半还很远|

余下888个“其他”文件的**第二轮净减411目标**：

| 互斥组（先排除surface、读文件、e2e、mount/render候选） | 现数 | 目标 | 净减 | 合并方式/门槛 |
|---|---:|---:|---:|---|
| contracts |70|25|45|schema表按业务边界合并；类型源码/enum自证删；每个运行时invalid/null分支仍需独特反例|
| app-vue其余 |91|40|51|store/composable按状态机owner表驱动；晚响应/取消/卸载不删；纯UI状态已在story不再重测|
| desktop其余 |91|45|46|bootstrap/compose重复装配表收敛；文件/进程/权限真实机制不删|
| server/application/use-cases |88|22|66|每owner命令/查询契约表；common NOT_FOUND等合并，不丢独特事务策略|
| server/infrastructure/adapters |96|32|64|memory/Prisma/PowerSync适用的共享port contract，mapper roundtrip表；每adapter仍真实执行|
| 余下 |452|313|139|按owner风险逐批盘点；Mastra/Goal/Task/persistence优先保留状态机、并发/恢复，删cross-layer重复|
| 合计 |888|477|411|**预算，不是已证实冗余数量**|

最终 **1061−411=650**，净减761。若411中只有250被证明可合并，实际就是811，**验收不通过**，不能把所有保留case拼一个文件或关闭collector来“达标”。这份探索没有证据保证139份余项一定冗余；半量文件目标的风险应诚实交给下一阶段，而不是凭目标倒推“都该删”。

### 7.2 CI耗时预算（全量基准72 job-min）

| 作业组 | 当前规划基准 | 瘦身后预算 | 净省 | 依赖 |
|---|---:|---:|---:|---|
| Web（含visual/provider） |34.0|8.0|26.0|只7条Web真旅程，2片，每片≤4分钟，内含简化provider|
| 新Storybook lane |0|4.0|−4.0|一个build、一次play+代表视觉；不再双跑旧harness|
| Unit |16.5|7.0|9.5|2片、收敛组件与重复初始化；不能用扩大cache命中率冒充删测收益|
| Verification Children |9.3|4.0|5.3|Unit与coverage一次执行产多份证据；affected DB integration保留；不能只拆并行号称runner省时|
| Governance |2.8|2.0|0.8|退役局部源码锁；同一audit结果不重复运行；引擎正反例只随工具影响范围运行|
| 其余scope/build/typecheck/lint/oracle等 |9.4|9.4|0|不预支未证明的优化|
| 合计 |**72.0**|**34.4**|**37.6（52.2%）**|所有预算成立才达标|

这不是说每一轮PR都会省52.2%。最新48.33分钟的轻量缓存run若要“同比砍半”需≤24.17；34.4预算并不能证明它达标。必须按相同changed-project集合、cache冷热、runner、重跑次数对比。预期通常PR约26–34.4 job-min；更轻PR应因affected下降而更低，不承诺无测量的固定百分比。

wall按DAG而非runner相加：scope约0.9 + build约2.9 + Web≤4–4.5 + final oracle约0.3 = **8.1–8.6分钟**；冷依赖/调度预留后 **约8–10分钟**。Storybook与build并行，Verification≤4分钟也不能卡后续。若7条真Web的执行总耗时超过2×(240−97)=286秒，则8.1分钟预测失效，不能再靠加shard把job-min吹低。

落地验收必须拿uncached同scope全量样本：≥5次，p50/p95都报，PR p95 wall≤10分钟、runner实际时长和≤36分钟（72基准）；失败重试仍计。release/全平台Desktop单列，不得藏到“其他”。按月统计PR+main+nightly+release总job-min，防止把同样的工作转nightly假装减半。

### 7.3 Verification/coverage的关键边界

当前workflow中boundary、integration、coverage、performance在一个runner依次执行，coverage再次收集579个文件。改善应优先：
1. Unit执行时收集受治理domain coverage，生成Unit与coverage引用同一execution receipt；不再无条件跑第二遍同样579份。
2. 即使复用，同一SHA、collector、scope、report digest、阈值必须校验，不能把“普通Unit通过”当coverage通过。
3. 真DB integration按owner隔离，与coverage并行只影响wall，不自动减少job-min；要省runner只能去掉重复DB初始化/冗余fixture。
4. perf实验与常规PR确定性回归分开，改变perf owner时仍需有可追溯证据，不以取消门禁解决性能问题。
5. 多个Oracle只汇总同一份结果，低成本；不要先删除exact-head聚合证据换0.5分钟而放弃fail-closed。

## 8. 与T3 Code的对照

读取了 `pingdotgg/t3code` 的main，查询commit为 `680152e27b2a961686389ca69a1557cbb2c55f08`；ci.yml与apps/web/vite.config.ts/测试树使用GitHub API。远端main随时变动，以下是这次观察，不把用户给出的4.3分钟均值冒充在此SHA重测的数据。

- 排除vendored `.repos/` 后，匹配同一spec/test正则 **1478文件**：server407、web330、desktop102、client-runtime117等。含.repos会误报5242。**T3并不是靠只留几百个测试才做到快。**
- 当前CI server **8片** Blacksmith4vCPU，其它大部分8vCPU；MemoFlow默认GitHub hosted/ubuntu，CPU/执行图不同，4.3分钟不能直接当MemoFlow的等价预算，也不代表T3 job-min更低。
- Web的DOM测试显式命名browser.test.tsx，用Vite+ browser project+Playwright headless Chromium测试编译后的真实组件；普通Unit不碰DOM。借鉴的是**测试边界**，不是“Playwright本身都该删”。
- 依赖任务无必要排序时parallel执行；server按历史耗时分片，保留单机串行隔离。MemoFlow已经有LPT，不该再重写调度器。
- 缓存Chromium、仅缺系统库时安装、Electron只给需要的job；lint/build/test按changed scope；同时保留聚合Check防止取消/skip假绿。
- 对MemoFlow的启示：优先把“组件状态需要整套API/PG”的错误分层修正、削掉多次build/setup，而不是以总测试文件少于T3作为成败指标。Storybook是本项目用户选择的UI owner入口，T3用browser Vitest并不意味着本项目再加第二套UI执行器。

## 9. 分阶段顺序、验收与停止条件

| 阶段 | 工作包（下一步应分别建Issue，报告本身不实施） | 必须产出的证据 |
|---|---|---|
| 0 基线与风险映射 |固定head与统计脚本；建立spec→风险→唯一owner→当前耗时表；核对已有Issue最新决定 |保留本报告1324/1411/1413差异；至少5次同scope冷热基准；准确execution receipts；禁止拿无权限/未跑的数据填数|
| 1 无效源码锁退役 |先弱锁7与可直接删除D；按B/T补owner行为再删；60文本/334AST同时审，不做改名搬家 |每批diff附保留风险与替代路径；等价重构不红；identity/CAS/secret负例能红；不关闭真实collector|
| 2 Storybook vertical slice |先Goal真实组件（已有reference+17.7s Dialog）→再Task验证模式可迁移；修glob/play/host/i18n |两个真实owner的完整play与视觉；故意overflow/focus错误被捕获；单build无API/DB；核验现有scaffold被真实组件替换|
| 3 UI批量迁移 |将162组件候选分类迁移，保留≤30必要headless/lifecycle；迁reference/visual；最后删旧harness/config |迁移期同SHA双跑仅作短期对照，迁完停止双跑；story完成/失败不可被截图成功掩盖；CI story≤4分钟|
| 4 真e2e缩为8 |先新7条Web+1Desktop真链路跑通，再删67的冗余覆盖与9个配置；更新manifest与计时 |实际DB/文件/IPC观察；不mock内部owner HTTP；唯一spec收据、空套件/缺片/重跑attempt负例仍有效；Web2片≤8 job-min|
| 5 Unit/coverage合并 |按888→477预算逐owner批次；共同应用/adapter契约，Unit一次测量coverage |不使用行覆盖率下降证明等价；保留transaction/CAS/取消/恢复反例；每批测净新增文件；若只能拼大文件不算达标|
| 6 exact-head验收 |同scope uncached lint/typecheck/test/governance、prod-like runtime验证、PR必需聚合证据 |≤650 specs、source断言0、≤8真旅程；72→≤36 job-min；PR p95 wall≤10；≥5次+月度总量；不达标如实回报|

删测试/改workflow必须走独立实施Issue与本地fast checks/项目现行CI规则，本报告不创建实施事实。复杂任务阶段checkpoint写回各实施Issue；本次只commit/push报告，不创建PR。

### 不可削掉的工程护栏

- 身份/授权在API、IPC、repository真实边界，Storybook无权充当安全权威。
- schema/runtime contract与持久化事务/CAS是数据权威；前端story仅验证投影与交互。
- credential redaction在source runtime验证；UI验证公开DTO不泄露，不复刻秘密处理算法。
- e2e上游第三方可控模拟，但应用内部写路径、事件流与数据库不能全部route.fulfill后仍叫“真e2e”。
- 交付证据沿用现有tree→execution→artifact digest，不删PR/main复用的fail-closed与attempt绑定；#580刚修过重跑收据，不能为瘦身回退。
- 本次未运行完整产品测试/容器/Storybook，所有砍后数字均预测；文档验证结果在报告末尾记录。

## 附录A：204个surface路径的可执行分批清单

D/T/B含义见3.1；它们是186份源码读取候选的保守分流，**不是批量删除授权**。R的18份已逐一打开，具体保留/删结论见3.1表。B先负例再删源码，T复用类型/产物/通用依赖门禁，D删局部实现锁且保全混合行为。该清单固定于基线SHA。

| 路径 | 分组 |
|---|---|
| `apps/api/src/bootstrap-module-names.surface.spec.ts` | B |
| `apps/api/src/modules/powersync/parse-json-like-string-keep-boundary.surface.spec.ts` | D |
| `apps/api/src/modules/powersync/powersync-schema-result-envelope.surface.spec.ts` | D |
| `apps/api/src/modules/powersync/user-preference-sync.surface.spec.ts` | B |
| `apps/api/src/runtime/compose-account.surface.spec.ts` | B |
| `apps/api/src/runtime/compose-ai.surface.spec.ts` | D |
| `apps/api/src/runtime/compose-data-portability.surface.spec.ts` | D |
| `apps/api/src/runtime/compose-goal.surface.spec.ts` | B |
| `apps/api/src/runtime/compose-notification.surface.spec.ts` | D |
| `apps/api/src/runtime/compose-repository.surface.spec.ts` | D |
| `apps/api/src/runtime/compose-routine.surface.spec.ts` | D |
| `apps/api/src/runtime/compose-schedule.surface.spec.ts` | D |
| `apps/api/src/runtime/compose-setting.surface.spec.ts` | D |
| `apps/api/src/runtime/compose-task.surface.spec.ts` | D |
| `apps/api/src/runtime/goal-reminder-fire.surface.spec.ts` | D |
| `apps/api/src/shared/contracts/api-module.surface.spec.ts` | D |
| `apps/api/src/shared/infrastructure/config/get-cors-origins-keep-boundary.surface.spec.ts` | D |
| `apps/api/src/shared/infrastructure/config/get-github-oauth-config.surface.spec.ts` | R |
| `apps/api/src/shared/infrastructure/http/controllers/info-result-envelope.surface.spec.ts` | D |
| `apps/api/src/shared/infrastructure/http/controllers/logs-result-envelope.surface.spec.ts` | D |
| `apps/api/src/shared/infrastructure/http/controllers/metrics-result-envelope.surface.spec.ts` | D |
| `apps/api/src/shared/infrastructure/load-workspace-env-keep-boundary.surface.spec.ts` | D |
| `apps/api/src/shared/infrastructure/middleware/error-result-envelope.surface.spec.ts` | D |
| `apps/desktop/src/main/desktop-bootstrapper-access.surface.spec.ts` | D |
| `apps/desktop/src/main/desktop-electron-contracts-path.surface.spec.ts` | R |
| `apps/desktop/src/main/desktop-shared-ipc-channels-dual.surface.spec.ts` | T |
| `apps/desktop/src/main/desktop-update-shell-ownership.surface.spec.ts` | B |
| `apps/desktop/src/main/ipc/system-handlers.surface.spec.ts` | D |
| `apps/desktop/src/main/lifecycle/window-manager.surface.spec.ts` | D |
| `apps/desktop/src/main/modules/ai/stable-knowledge-note-ref-boundary.surface.spec.ts` | B |
| `apps/desktop/src/main/runtime/compose-goal.surface.spec.ts` | B |
| `apps/desktop/src/main/runtime/compose-modules.surface.spec.ts` | D |
| `apps/desktop/src/main/runtime/compose-task.surface.spec.ts` | D |
| `apps/desktop/src/main/runtime/goal-reminder-fire.surface.spec.ts` | D |
| `apps/desktop/src/main/services/custom-notification.manager.surface.spec.ts` | D |
| `apps/desktop/src/main/services/desktop-notification-preference-wiring.surface.spec.ts` | B |
| `apps/desktop/src/main/services/notification.service.surface.spec.ts` | D |
| `apps/desktop/src/main/utils/ipc-cache.surface.spec.ts` | D |
| `apps/desktop/src/main/utils/memory-monitor.surface.spec.ts` | D |
| `apps/desktop/src/renderer/custom-notification-electron-bridge-dual.surface.spec.ts` | B |
| `apps/desktop/src/renderer/desktop-electron-bridge-window.surface.spec.ts` | D |
| `apps/desktop/src/renderer/host-electron-bridge-helper-dual.surface.spec.ts` | B |
| `apps/desktop/src/renderer/intervention-window/intervention-window-entry.surface.spec.ts` | D |
| `apps/desktop/src/renderer/platform/desktop-update-di.surface.spec.ts` | D |
| `apps/web/src/e2e-helpers/desktop-build-global-setup-dual.surface.spec.ts` | D |
| `apps/web/src/e2e-helpers/normalize-origin-dual.surface.spec.ts` | D |
| `apps/web/src/platform/read-json-keep-boundary.surface.spec.ts` | B |
| `packages/account/src/api/account-void-success-envelope.surface.spec.ts` | D |
| `packages/account/src/application-client/services/account-client-port-mapping-dual.surface.spec.ts` | B |
| `packages/account/src/electron/account-electron.surface.spec.ts` | D |
| `packages/account/src/server/infrastructure/__tests__/account-repositories.surface.spec.ts` | B |
| `packages/account/src/server/infrastructure/adapters/powersync/mappers/account-powersync-parse-json-keep-boundary.surface.spec.ts` | D |
| `packages/account/src/server/infrastructure/adapters/prisma/__tests__/account-auth-email-retirement.surface.spec.ts` | B |
| `packages/account/src/server/infrastructure/adapters/prisma/__tests__/account-clock-version-retirement.surface.spec.ts` | D |
| `packages/account/src/server/infrastructure/adapters/prisma/__tests__/account-ownership.surface.spec.ts` | B |
| `packages/account/src/server/infrastructure/adapters/prisma/__tests__/account-phone-retirement.surface.spec.ts` | D |
| `packages/ai/src/api/routes/ai-void-success-envelope.surface.spec.ts` | D |
| `packages/ai/src/electron/ai-electron.surface.spec.ts` | D |
| `packages/ai/src/infrastructure-client/adapters/__tests__/ai-provider-list-envelope.surface.spec.ts` | D |
| `packages/ai/src/infrastructure-client/adapters/__tests__/ai-transport-types.surface.spec.ts` | D |
| `packages/ai/src/infrastructure-client/adapters/read-string-keep-boundary.surface.spec.ts` | D |
| `packages/ai/src/server/application/ai-application-capabilities.surface.spec.ts` | B |
| `packages/ai/src/server/application/ports/knowledge-source-note.surface.spec.ts` | B |
| `packages/ai/src/server/domain/ai-provider-config-barrel.surface.spec.ts` | R |
| `packages/ai/src/server/infrastructure/__tests__/ai-provider-secret-ownership.surface.spec.ts` | B |
| `packages/ai/src/server/infrastructure/__tests__/ai-repositories.surface.spec.ts` | B |
| `packages/ai/src/server/infrastructure/adapters/__tests__/ai-conversation-repository.surface.spec.ts` | R |
| `packages/ai/src/server/infrastructure/adapters/__tests__/ai-provider-config-repository.surface.spec.ts` | R |
| `packages/ai/src/server/infrastructure/adapters/dual-registry.surface.spec.ts` | B |
| `packages/ai/src/server/infrastructure/adapters/fs/ai-evaluation-report-wire.surface.spec.ts` | B |
| `packages/ai/src/server/infrastructure/adapters/prisma/__tests__/ai-provider-config-ownership.surface.spec.ts` | B |
| `packages/ai/src/server/infrastructure/adapters/prisma/to-prisma-json-keep-boundary.surface.spec.ts` | B |
| `packages/ai/src/server/infrastructure/adapters/tokenize-keep-boundary.surface.spec.ts` | R |
| `packages/ai/src/server/mastra/ai-vnext-no-legacy.surface.spec.ts` | D |
| `packages/ai/src/server/mastra/mastra-vnext-architecture.surface.spec.ts` | D |
| `packages/ai/src/server/mastra/tools/owner-contracts.surface.spec.ts` | D |
| `packages/app-vue/src/di/__tests__/desktop-update-service.surface.spec.ts` | R |
| `packages/app-vue/src/layouts/shell/clamp-dual.surface.spec.ts` | R |
| `packages/app-vue/src/shared/utils/format-date-keep-boundary.surface.spec.ts` | R |
| `packages/app-vue/src/shared/utils/format-datetime-keep-boundary.surface.spec.ts` | R |
| `packages/app-vue/src/shared/utils/format-time-range-keep-boundary.surface.spec.ts` | R |
| `packages/app-vue/src/shared/utils/ipc/is-plain-object-keep-boundary.surface.spec.ts` | R |
| `packages/app-vue/src/views/dead-surfaces.surface.spec.ts` | R |
| `packages/contracts/src/electron/ipc-channels.renderer-events.surface.spec.ts` | T |
| `packages/contracts/src/modules/account/api/dual-registry.surface.spec.ts` | B |
| `packages/contracts/src/modules/account/empty-dual-barrel.surface.spec.ts` | T |
| `packages/contracts/src/modules/account/entities/account-entities-dual.surface.spec.ts` | D |
| `packages/contracts/src/modules/ai/api/dual-registry.surface.spec.ts` | B |
| `packages/contracts/src/modules/goal/api/dual-registry.surface.spec.ts` | B |
| `packages/contracts/src/modules/goal/protocol/goal-rpc-map.surface.spec.ts` | B |
| `packages/contracts/src/modules/goal/value-objects/dual-registry.surface.spec.ts` | B |
| `packages/contracts/src/modules/notification/api/dual-registry.surface.spec.ts` | T |
| `packages/contracts/src/modules/notification/protocol/asset-image-key-dual.surface.spec.ts` | B |
| `packages/contracts/src/modules/notification/protocol/notification-rpc-map.surface.spec.ts` | B |
| `packages/contracts/src/modules/notification/value-objects/dual-registry.surface.spec.ts` | B |
| `packages/contracts/src/modules/operations/operations-dist.surface.spec.ts` | D |
| `packages/contracts/src/modules/repository/aggregates/dual-registry.surface.spec.ts` | B |
| `packages/contracts/src/modules/repository/api/dual-registry.surface.spec.ts` | B |
| `packages/contracts/src/modules/schedule/api/dual-registry.surface.spec.ts` | T |
| `packages/contracts/src/modules/setting/legacy-deletion.surface.spec.ts` | D |
| `packages/contracts/src/modules/setting/preferences/product-feature-map-public.surface.spec.ts` | B |
| `packages/contracts/src/modules/setting/preferences/product-module-index-paths.surface.spec.ts` | B |
| `packages/contracts/src/modules/task/api/dual-registry.surface.spec.ts` | B |
| `packages/contracts/src/modules/task/protocol/task-rpc-map.surface.spec.ts` | B |
| `packages/contracts/src/modules/transport-cast-inventory.surface.spec.ts` | B |
| `packages/contracts/src/result/action-result-dual.surface.spec.ts` | D |
| `packages/contracts/src/result/ipc-envelope.surface.spec.ts` | R |
| `packages/contracts/src/result/is-record-keep-boundary.surface.spec.ts` | D |
| `packages/contracts/src/result/result-adr-alignment.surface.spec.ts` | D |
| `packages/contracts/src/shared/dtos/shared-dtos-dual.surface.spec.ts` | D |
| `packages/contracts/src/shared/dual-registry.surface.spec.ts` | B |
| `packages/data-portability/src/application-client/data-portability-client-port-dual.surface.spec.ts` | D |
| `packages/data-portability/src/application-client/ports/data-portability-api-client-port.surface.spec.ts` | D |
| `packages/data-portability/src/server/application/use-cases/__tests__/editor-persistence-retirement.surface.spec.ts` | D |
| `packages/data-portability/src/server/application/use-cases/__tests__/editor-portability-retirement.surface.spec.ts` | D |
| `packages/data-portability/src/server/application/use-cases/__tests__/portable-boundary-re-lock.surface.spec.ts` | B |
| `packages/data-portability/src/server/application/use-cases/__tests__/server-held-disclosure-not-importable.surface.spec.ts` | T |
| `packages/goal/src/__tests__/dual-registry.surface.spec.ts` | T |
| `packages/goal/src/api/__tests__/goal-api-module-gate.surface.spec.ts` | R |
| `packages/goal/src/api/routes/goal-parse-number-string-array-keep-boundary.surface.spec.ts` | D |
| `packages/goal/src/api/routes/goal-void-success-envelope.surface.spec.ts` | D |
| `packages/goal/src/api/routes/parse-boolean-dual.surface.spec.ts` | D |
| `packages/goal/src/application-client/goal-client-port-facade-dual.surface.spec.ts` | D |
| `packages/goal/src/electron/goal-electron.surface.spec.ts` | B |
| `packages/goal/src/infrastructure-client/adapters/ipc/goal-ipc-channels.surface.spec.ts` | T |
| `packages/goal/src/infrastructure-client/adapters/ipc/goal-ipc.adapter.surface.spec.ts` | D |
| `packages/goal/src/server/application/goal-application-types-barrel.surface.spec.ts` | R |
| `packages/goal/src/server/infrastructure/__tests__/goal-repositories.surface.spec.ts` | B |
| `packages/goal/src/server/infrastructure/__tests__/schedule-source-ownership.surface.spec.ts` | B |
| `packages/goal/src/server/infrastructure/adapters/prisma/__tests__/goal-ownership.surface.spec.ts` | B |
| `packages/goal/src/server/infrastructure/adapters/prisma/__tests__/goal-schema-projection.surface.spec.ts` | B |
| `packages/goal/src/server/infrastructure/adapters/prisma/__tests__/weight-snapshot-ownership.surface.spec.ts` | B |
| `packages/goal/src/server/infrastructure/build-task-name-keep-boundary.surface.spec.ts` | D |
| `packages/http-client/src/__tests__/result-http-client-interface.surface.spec.ts` | D |
| `packages/http-client/src/__tests__/result-http-envelope.surface.spec.ts` | B |
| `packages/ipc-client/src/__tests__/ipc-client-envelope.surface.spec.ts` | D |
| `packages/ipc-client/src/__tests__/result-ipc-client-interface.surface.spec.ts` | D |
| `packages/label/src/__tests__/label-registry-ownership.surface.spec.ts` | B |
| `packages/notification/src/api/notification-void-success-envelope.surface.spec.ts` | D |
| `packages/notification/src/application-client/notification-client-port-dual.surface.spec.ts` | D |
| `packages/notification/src/electron/notification-electron.surface.spec.ts` | D |
| `packages/notification/src/infrastructure-client/adapters/ipc/notification-ipc.adapter.surface.spec.ts` | D |
| `packages/notification/src/server/domain/services/notification-metrics-unified.surface.spec.ts` | R |
| `packages/notification/src/server/infrastructure/__tests__/notification-repositories.surface.spec.ts` | D |
| `packages/notification/src/server/infrastructure/adapters/prisma/__tests__/notification-ownership.surface.spec.ts` | B |
| `packages/notification/src/server/infrastructure/adapters/prisma/__tests__/notification-preference-ownership.surface.spec.ts` | B |
| `packages/notification/src/server/infrastructure/adapters/prisma/__tests__/notification-preference-schema-migration.surface.spec.ts` | D |
| `packages/notification/src/server/transport/notification-usecases-export.surface.spec.ts` | T |
| `packages/patterns/src/events/create-event-bus-adapter-dual.surface.spec.ts` | B |
| `packages/patterns/src/operations/operations-dist.surface.spec.ts` | D |
| `packages/repository/src/api/routes/knowledge-disconnect-void-envelope.surface.spec.ts` | D |
| `packages/repository/src/application-client/knowledge-write-request-ledger-contract.surface.spec.ts` | D |
| `packages/repository/src/application-client/repository-client-port-dual.surface.spec.ts` | D |
| `packages/repository/src/electron/repository-electron.surface.spec.ts` | D |
| `packages/repository/src/electron/vault-fs-guards-dual.surface.spec.ts` | B |
| `packages/repository/src/infrastructure-client/adapters/ipc/repository-ipc.adapter.surface.spec.ts` | D |
| `packages/repository/src/server/application/services/knowledge-projection-engine.surface.spec.ts` | D |
| `packages/repository/src/server/application/services/repository-note-mutation.surface.spec.ts` | D |
| `packages/repository/src/server/infrastructure/__tests__/repository-repositories.surface.spec.ts` | B |
| `packages/repository/src/server/infrastructure/adapters/prisma/__tests__/controlled-note-write-boundary.surface.spec.ts` | D |
| `packages/repository/src/server/infrastructure/adapters/prisma/__tests__/github-webhook-delivery-ownership.surface.spec.ts` | B |
| `packages/repository/src/server/infrastructure/adapters/prisma/__tests__/knowledge-remote-binding-ownership.surface.spec.ts` | B |
| `packages/repository/src/server/infrastructure/adapters/prisma/__tests__/knowledge-write-request-ownership.surface.spec.ts` | B |
| `packages/repository/src/server/infrastructure/adapters/prisma/__tests__/legacy-editor-repository-runtime.surface.spec.ts` | B |
| `packages/schedule/src/api/schedule-route-parsers-keep-boundary.surface.spec.ts` | B |
| `packages/schedule/src/api/schedule-void-success-envelope.surface.spec.ts` | D |
| `packages/schedule/src/application-client/schedule-client-port-facade-dual.surface.spec.ts` | B |
| `packages/schedule/src/electron/schedule-electron.surface.spec.ts` | D |
| `packages/schedule/src/infrastructure-client/adapters/ipc/schedule-ipc.adapter.surface.spec.ts` | D |
| `packages/schedule/src/server/infrastructure/__tests__/schedule-repositories.surface.spec.ts` | B |
| `packages/schedule/src/server/infrastructure/adapters/prisma/__tests__/schedule-event-ownership.surface.spec.ts` | B |
| `packages/scheduler/src/api/scheduler-route-parsers.surface.spec.ts` | B |
| `packages/scheduler/src/electron/scheduler-electron.surface.spec.ts` | D |
| `packages/scheduler/src/infrastructure-client/adapters/ipc/scheduler-ipc.adapter.surface.spec.ts` | D |
| `packages/scheduler/src/server/application/scheduler/patterns-scheduler-dual.surface.spec.ts` | D |
| `packages/scheduler/src/server/infrastructure/__tests__/scheduler-repositories.surface.spec.ts` | B |
| `packages/setting/src/application-client/ports/setting-api-client-port.surface.spec.ts` | D |
| `packages/setting/src/application-client/setting-client-port-dual.surface.spec.ts` | D |
| `packages/setting/src/electron/setting-electron.surface.spec.ts` | D |
| `packages/setting/src/infrastructure-client/adapters/ipc/setting-ipc.adapter.surface.spec.ts` | D |
| `packages/setting/src/server/infrastructure/__tests__/setting-repositories.surface.spec.ts` | D |
| `packages/task/src/api/routes/get-first-query-value-dual.surface.spec.ts` | D |
| `packages/task/src/api/routes/task-void-success-envelope.surface.spec.ts` | D |
| `packages/task/src/client/task-client-browser-boundary.surface.spec.ts` | D |
| `packages/task/src/electron/task-electron.surface.spec.ts` | D |
| `packages/task/src/server/domain/task-domain-events-barrel.surface.spec.ts` | T |
| `packages/task/src/server/domain/task-domain-simplification.surface.spec.ts` | B |
| `packages/task/src/server/domain/task-goal-contribution-v2.surface.spec.ts` | R |
| `packages/task/src/server/domain/task-occurrence-vnext.surface.spec.ts` | D |
| `packages/task/src/server/infrastructure/__tests__/task-repositories.surface.spec.ts` | B |
| `packages/task/src/server/infrastructure/adapters/prisma/__tests__/task-occurrence-ownership.surface.spec.ts` | B |
| `packages/task/src/server/infrastructure/adapters/prisma/__tests__/task-plan-ownership.surface.spec.ts` | B |
| `packages/task/src/server/infrastructure/normalize-runtime-contributions-dual.surface.spec.ts` | D |
| `packages/task/src/server/infrastructure/schedule-source-ownership.surface.spec.ts` | B |
| `packages/task/src/testing/an-identity-id-dual.surface.spec.ts` | B |
| `packages/utils/src/frontend/delay-dual.surface.spec.ts` | D |
| `packages/utils/src/frontend/format-file-size-keep-boundary.surface.spec.ts` | D |
| `packages/utils/src/result/default-extract-context-keep-boundary.surface.spec.ts` | B |
| `packages/utils/src/result/format-zod-errors-dual.surface.spec.ts` | D |
| `packages/utils/src/result/openapi-response-helpers-dual.surface.spec.ts` | D |
| `packages/utils/src/shared/dual-registry.surface.spec.ts` | B |
| `packages/utils/src/shared/format-date-to-input-keep-boundary.surface.spec.ts` | D |
| `packages/utils/src/shared/generate-uuid-keep-boundary.surface.spec.ts` | D |
| `packages/utils/src/shared/new-id-keep-boundary.surface.spec.ts` | D |

## 附录B：95个非surface读文件候选分流

K=保留运行输出/fixture/SQL输入的行为测试；M=混合文件，仅删除源文本/工作流布局断言、保留执行/解析负例；D=3.2所列14个独立源码锁原文件退役（必要行为先承接）。该表不把每次readFile都认作源码锁。

| 路径 | 处置 |
|---|---|
| `apps/api/src/__tests__/integration/agent-instance-registry.integration.test.ts` | K |
| `apps/api/src/runtime/compose-data-portability.spec.ts` | M |
| `apps/api/src/scripts/database-startup-chain.test.ts` | M |
| `apps/api/src/shared/infrastructure/config/web-origin.spec.ts` | M |
| `apps/desktop/e2e/antigravity-composer.spec.mts` | K |
| `apps/desktop/e2e/antigravity-login.spec.mts` | K |
| `apps/desktop/e2e/authentication/desktop-auth-flow.spec.mts` | K |
| `apps/desktop/e2e/packaged-runtime/packaged-runtime.spec.ts` | K |
| `apps/desktop/e2e/workspace-attention.spec.mts` | K |
| `apps/desktop/src/main/ipc/__tests__/system-handlers.spec.ts` | K |
| `apps/desktop/src/main/modules/ai/local-agent-knowledge.spec.ts` | K |
| `apps/desktop/src/main/modules/desktop-update/infrastructure/update-install-receipt.store.spec.ts` | K |
| `apps/desktop/src/main/modules/desktop-update/runtime/desktop-update-e2e-harness.spec.ts` | K |
| `apps/desktop/src/main/modules/repository/desktop-knowledge-repository-git.runtime.spec.ts` | K |
| `apps/desktop/src/main/modules/repository/desktop-knowledge-repository-sync.acceptance.spec.ts` | K |
| `apps/desktop/src/main/paths/clear-storage-cache.spec.ts` | K |
| `apps/desktop/src/main/paths/native-file-dialogs.spec.ts` | K |
| `apps/desktop/src/main/profile/ProfileSnapshotService.spec.ts` | K |
| `apps/desktop/src/main/profile/desktop-profile-import-service.spec.ts` | K |
| `apps/desktop/src/main/profile/profile-cleanup.spec.ts` | K |
| `apps/desktop/src/main/services/desktop-notification-preference.store.spec.ts` | K |
| `apps/web/src/mocks/handlers/repository.handlers.spec.ts` | M |
| `packages/ai/src/api/routes/ai-provider-onboarding.routes.spec.ts` | D |
| `packages/ai/src/server/local-agent/antigravity-login-process.spec.ts` | K |
| `packages/ai/src/server/local-agent/local-agent-runtime.spec.ts` | K |
| `packages/ai/src/server/mastra/runtime/mastra-workflow.runtime.spec.ts` | K |
| `packages/cloud-auth/src/index.spec.ts` | D |
| `packages/cloud-auth/src/server/public-surface.spec.ts` | D |
| `packages/contracts/src/modules/task/api/task-plan.dto.test.ts` | M |
| `packages/database/src/schema/ai-agent-registry.integration.test.ts` | K |
| `packages/database/src/schema/cloud-auth-user-access-projection.spec.ts` | D |
| `packages/database/src/schema/goal-description.spec.ts` | D |
| `packages/database/src/schema/goal-record-authorship.spec.ts` | D |
| `packages/database/src/schema/repository-vnext-retirement.spec.ts` | D |
| `packages/database/src/schema/routine-activated-at.spec.ts` | D |
| `packages/database/src/schema/scheduler-vnext-retirement.spec.ts` | D |
| `packages/database/src/schema/task-goal-binding-constraint.spec.ts` | M |
| `packages/database/src/schema/task-plan-canonical-persistence.spec.ts` | D |
| `packages/database/src/schema/task-shared-label-migration.spec.ts` | K |
| `packages/goal/src/server/application/services/goal-review-signal-analyzer.spec.ts` | M |
| `packages/label/src/__tests__/label-service.spec.ts` | K |
| `packages/reminder/src/__tests__/package-root-owner-surface.spec.ts` | M |
| `packages/repository/src/electron/local-vault-runtime.spec.ts` | K |
| `packages/scheduler/src/scheduling/__tests__/scheduling-contracts.spec.ts` | M |
| `packages/setting/src/server/preferences/user-preference-service.spec.ts` | M |
| `packages/time/src/__tests__/facade.spec.ts` | M |
| `packages/time/src/__tests__/runtime-dependency-boundary.spec.ts` | D |
| `packages/time/src/__tests__/third-party-contract-boundary.spec.ts` | D |
| `packages/time/src/__tests__/time-context.spec.ts` | M |
| `packages/ui-core/src/styles/theme.semantic-tokens.spec.ts` | D |
| `tools/ci-cd-platform/__tests__/affected-shadow.test.mjs` | K |
| `tools/ci-cd-platform/__tests__/artifact-contract.test.mjs` | K |
| `tools/ci-cd-platform/__tests__/cache-policy.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/candidate-workflow.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/ci-check.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/ci-evidence.test.mjs` | K |
| `tools/ci-cd-platform/__tests__/contracts.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/coverage-workflow.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/curate-oci-index.test.mjs` | K |
| `tools/ci-cd-platform/__tests__/desktop-update-feed-publication.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/desktop-update-metadata.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/desktop-update-rollout.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/esm-entrypoint.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/macos-signing.test.mjs` | K |
| `tools/ci-cd-platform/__tests__/manifest.test.mjs` | K |
| `tools/ci-cd-platform/__tests__/nightly-audit-failure.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/nx-task-contract.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/observe-lane.test.mjs` | K |
| `tools/ci-cd-platform/__tests__/observe-run.test.mjs` | K |
| `tools/ci-cd-platform/__tests__/oracle2-compose-candidate.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/prepare-shared-lanes.test.mjs` | K |
| `tools/ci-cd-platform/__tests__/production-oauth-compose.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/production-watcher.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/production-workflow.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/promotion.test.mjs` | K |
| `tools/ci-cd-platform/__tests__/quality-shadow.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/release-tooling.test.mjs` | K |
| `tools/ci-cd-platform/__tests__/release-workflows.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/runtime-closure.test.mjs` | K |
| `tools/ci-cd-platform/__tests__/scope-ground-truth.test.mjs` | K |
| `tools/ci-cd-platform/__tests__/staging-watcher.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/visual-font-workflow.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/workflow-history-contract.test.mjs` | M |
| `tools/ci-cd-platform/__tests__/workspace-receipt.test.mjs` | K |
| `tools/docker/local-compose.env-shadow.spec.mjs` | M |
| `tools/governance/__tests__/architecture-surface.test.mjs` | M |
| `tools/governance/__tests__/engineering-input-independence.test.mjs` | M |
| `tools/governance/__tests__/engineering-reference-policy.test.mjs` | D |
| `tools/governance/__tests__/engineering-rule-source.test.mjs` | K |
| `tools/governance/__tests__/i18n-key-completeness.test.mjs` | M |
| `tools/governance/__tests__/local-docker-product-validation.test.mjs` | M |
| `tools/governance/__tests__/public-surface-jsdoc.test.mjs` | K |
| `tools/test-system-v2/__tests__/e2e-governance.test.mjs` | M |
| `tools/test-system-v2/__tests__/failure-classification.test.mjs` | K |
| `tools/test-system-v2/__tests__/web-shards.test.mjs` | M |

本表计数：D 14、M 39、K 42（合计95）。M不等于删除整个文件，K的源码审计引擎以fixture作为输入，亦不能按读文件API删除。未逐用例审计的工具文件在实施Issue中复核，不能把本表当免审批准。

## 附录C：剩余60个文本锁（34 entries）

全部文本锁最终退出；下表是原锁去向，不是新建一套同等规模的AST清单。原AST334规则另按3.3退休。

| entry ID | locks | 去向 |
|---|---:|---|
| `format-duration-keep-boundary` | 1 | 删退役/实现/文案锁；现存行为归owner，不补同名结构锁 |
| `get-status-label-keep-boundary` | 1 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `ai-knowledge-note-terminology` | 2 | 删退役/实现/文案锁；现存行为归owner，不补同名结构锁 |
| `legacy-note-surface-docs` | 6 | 删退役/实现/文案锁；现存行为归owner，不补同名结构锁 |
| `password-toast-only-keep-boundary` | 1 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `theme-sync-desktop-api-dual` | 2 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `desktop-bridge-electron-bridge-dual` | 1 | 删退役/实现/文案锁；现存行为归owner，不补同名结构锁 |
| `desktop-auth-api-key-dual` | 1 | 删退役/实现/文案锁；现存行为归owner，不补同名结构锁 |
| `desktop-update-service` | 1 | 删退役/实现/文案锁；现存行为归owner，不补同名结构锁 |
| `clamp-dual` | 2 | 删退役/实现/文案锁；现存行为归owner，不补同名结构锁 |
| `unverified-email-banner` | 2 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `AIChatView` | 4 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `goal-operations-keep-boundary` | 1 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `GoalListView` | 1 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `schedulePanelAdaptation` | 1 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `AISettings.provider-onboarding-v2` | 2 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `notification-settings-preference` | 2 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `use-data-portability` | 1 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `UserSettingsView` | 2 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `settingsPanelAdaptation` | 1 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `task-vnext-ui` | 2 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `TaskManagementView` | 2 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `ProductEditorFrame` | 1 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `product-surface-polish` | 3 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `use-desktop-window-controls` | 2 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `combine-date-and-time-keep-boundary` | 1 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `format-date-keep-boundary` | 1 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `format-message-time-keep-boundary` | 2 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `format-time-range-keep-boundary` | 2 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `to-time-input-keep-boundary` | 2 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `key-result-calculation-presentation` | 1 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `CapsulePreviewShell` | 1 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |
| `schedule-router-single-track` | 4 | 删退役/实现/文案锁；现存行为归owner，不补同名结构锁 |
| `use-ai-chat-host-dispatch` | 1 | UI/日期/事件行为归对应owner或Storybook；通用host边界归已有治理；补反例后删文本锁 |

## 本次验证记录

- 已完成tracked inventory交叉核对、13份配置完整读取、18份非读源码surface逐一读取、Unit/E2E/Storybook/治理关键实现抽样与GitHub实测证据检查。
- 未执行产品测试、E2E、Docker或Storybook构建；本次没有实施这些改动，不能提供砍后真实运行证据。
- 文档最小治理检查：`NX_DAEMON=false pnpm nx run memoflow:governance-check` **通过**，50.3秒；7个任务中5个缓存命中，主governance-check与governance-tools:test实际执行。该结果只验证报告所在仓库治理，不验证未来瘦身方案。
- `git diff --check` 通过；提交只允许包含本报告。未修改测试、workflow、inventory、lockfile或其他源码。

### 证据复查入口

- MemoFlow PR运行：[39615064408](https://github.com/BakerSean168/memoflow/actions/runs/39615064408)。`gh api repos/BakerSean168/memoflow/actions/runs/39615064408/jobs --paginate` 可复算job起止时间与Web首片secure-provider瓶颈。
- Unit逐文件历史样本：[39166760886](https://github.com/BakerSean168/memoflow/actions/runs/39166760886)，artifact ID `12151491361`；下载ZIP后读取Vitest JSON `testResults[].endTime-startTime`，不要把该子集当全仓排名。artifact会过期，报告中的样本数字与归属保留供复核。
- 本地静态真源：`tools/test-system-v2/test-inventory.json`、`web-spec-durations.json`、`tools/ci-cd-platform/unit-test-durations.json`、`apps/web/web-flow-specs.mjs`、`apps/web/web-audit-specs.mjs`、13份`apps/web/playwright*.config.ts`及`.github/workflows/ci.yml`。
