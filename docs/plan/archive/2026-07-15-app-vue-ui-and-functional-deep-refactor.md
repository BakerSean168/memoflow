---
tags:
  - plan
  - archive
  - app-vue
description: App Vue UI 深度重构与功能性修复（已完成并合入 main #187）
created: 2026-07-15T00:00:00
updated: 2026-07-18T06:50:00
---

> **归档说明（2026-07-18）**：实施与验收已完成；`fbdc83b1b` 已合入 `main`（PR #187）。后续仅保留历史参考。

# App Vue 前端 UI 深度重构与功能性修复执行方案

## 文档地位

本文是本轮 App Vue 前端重构与功能修复的 canonical 执行文档。后续实施顺序、范围、验收和完成状态以本文为准。

本文整合以下输入材料：

- [Web 登录与注册页面后续优化](./2026-07-15-web-auth-page-optimization.md)
- [Web 登录后主要功能内部产品审查](./2026-07-15-web-core-product-review.md)
- [UI Shell 诊断后续方案](../archive/2026-07-14-ui-shell-diagnostic-followup.md)
- 2026-07-15 关于 BusinessPanel 双重标题、重复主操作和单页面容器响应式模型的产品决策

输入材料继续保留审查事实和历史背景，但不再各自驱动实施，不重复维护平行执行顺序。

## 当前事实状态（2026-07-16）

本节记录当前代码、配置、测试、容器和 Git 托管状态，优先级高于下文最初编写时的待实施描述。下文原阶段设计继续保留，用于解释实施边界和决策；后续工作以本节的剩余清单为准，不重新执行已经完成的阶段。

### 版本与交付状态

- 当前工作分支为 `refactor/app-vue-p0-reliability`，本轮实现已整理为跨端可靠性、AI live eval 和计划证据三个提交并推送；最新远程 head 以 [PR #187](https://github.com/BakerSean168/memoflow/pull/187) 为准。
- GitHub `main` 仍为 `552471a41ac662601f005d5f4616313cd5496c02`。
- 功能分支已推送并创建非 Draft PR #187；PR 当前 mergeable，Performance check 已通过，CI Validate 与 Boundary Tests 正在运行，改动尚未合入 `main`。
- 当前 `/opt/memoflow` 主机上的 Web、API、AI Service 容器均带有目标 HEAD 的 OCI revision 标签并保持健康。
- 最新本地部署验证结果为 `pass` 且 `Ready for PR: yes`：[`reports/local-deploy-validation/latest.md`](../../../reports/local-deploy-validation/latest.md)。
- 最终 prod-like 验证覆盖 affected lint 37 个项目、typecheck 35 个项目、test 31 个项目和无缓存 `docker:local:rebuild`；API、Web、AI Service、PowerSync 及其依赖服务均为 healthy，本地镜像 revision 为 `1f9de5b40fef47b7c32df0455e6ed548e46b91ba-dirty`。
- 目标 HEAD 已完成 Web E2E 67/67 和 Shell E2E 8/8，均无失败、flaky 或跳过；该轮 Web E2E 使用 `http://localhost:58080` 与 `http://localhost:53080/api/v1`。
- 认证态 Web/Desktop PowerSync 回归通过 3/3，覆盖 Desktop→Web 与 Web→Desktop 的 Goal 创建、编辑、删除，以及 Desktop 冷重启后的账号恢复与数据持久性；测试使用隔离的 `postgres-test` 与 `powersync-test` 逻辑复制车道。
- Desktop 全量测试通过 26 个文件、227 项测试，Desktop typecheck 通过；其中包括 PowerSync 表变更订阅归一化，以及 Editor `IPC → application use case → PowerSync repository` 12 路并发回归。
- 当前代码重新执行的 Task、Notification、Editor、AI、App Vue、Web、API、Database 测试通过；App Vue/Web lint 与 typecheck、AI Service 182 项测试、AI Service lint/typecheck、Goal workflow deterministic eval 7/7、Agent runtime deterministic eval 4/4 和治理检查通过。
- Google AI Studio [live eval 报告](../../../reports/apps/ai-service/evals/goal-workflow-live-latest.json)于 2026-07-16T08:12:02Z 使用 `gemini-2.5-flash` 通过 2/2、pass rate 100%、quality gate passed；两个 case 相对真实 live baseline 均保持 1.0 score，无 regression 或 new failure。完整 workflow 与生产 `goal.create` runtime 均识别 success criteria、timeline 和 scope，最多三问且未提前产生副作用。
- 本轮新增的 Task、Notification、Knowledge 三条真实 Web E2E 已在 Playwright 托管的 Web/API/AI Service 与确定性 OpenAI-compatible provider 上合并通过 3/3；Editor 真实 PostgreSQL 并发集成测试、Desktop IPC/PowerSync 并发测试、Editor 全量 108 项测试和类型检查通过。

### 基线记录

| 基线面            | 当前可追溯事实                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 本地 Git          | 分支 `refactor/app-vue-p0-reliability`，工作区已整理为可审查提交；最终 head 与远程 PR 分支保持一致                                               |
| 远程 Git          | `origin/main` 为 `552471a41ac662601f005d5f4616313cd5496c02`；远程功能分支与 PR #187 已创建，等待 CI 与合并                                       |
| prod-like runtime | Web `58080`、API `53080`、AI Service `58100`、PowerSync `58081`；最终验证由 clean PR head 构建三个本地应用镜像，必需服务 healthy                 |
| E2E runtime       | 标准 Playwright lane 使用 Web `5173`、API `3000`、PostgreSQL `5433`；认证态同步另用隔离 PowerSync `58082` 与 `postgres-test` logical replication |
| 测试身份          | Web/业务 E2E 按用例创建隔离账号；Desktop sync profile 在成功时清理、失败时保留诊断，不依赖共享长期测试账号                                       |

| 历史 P0 / 产品观察   | 原始失败签名                                                                 | 当前区分证据                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Task 完成闭环        | 无 body 完成请求与输入 Schema 不一致，实例无法完成                           | HTTP/IPC 共享控制器与 Schema 回归；真实 E2E 验证 `0/1 → 1/1` 和 Goal `0% → 10%`                                 |
| Notification 读取    | mapper 将 Notification ID 当作 Channel ID，未读数存在但列表读取失败          | 不同 ID 前缀 mapper 回归；真实提醒触发、列表读取、单条/全部已读和徽标归零闭环                                   |
| Knowledge 索引       | 容器数据库缺少 pgvector、`retrieval_vector` 或索引，查询在用户请求时失败     | 启动链 bootstrap + 强制 smoke；新笔记 `indexed`，知识查询返回路径与原文引用                                     |
| Editor 初始化        | query-then-create 并发触发 `project_path` 唯一约束，调用方得到不一致 ID      | PostgreSQL 与 Desktop IPC/PowerSync 各 12 路 create-or-get 回归，所有调用方得到同一持久化 ID                    |
| Dashboard / Reminder | Dashboard 已退役但旧测试仍锁定不存在页面；提醒信息优先级与过期规则需重新确认 | `/dashboard → /` 保留，性能测试转为 AI 工作区；Reminder 展示触发、下一次触发、重复和状态                        |
| Goal Agent           | 长度启发式可能跳过澄清，问题固定，语言可能与 UI 不一致                       | 生产 graph 使用 Provider clarification；deterministic workflow 7/7、runtime 4/4，Google AI Studio live gate 2/2 |

### 阶段状态

| 阶段                    | 当前事实                                                                                                                 | 状态     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------- |
| 阶段 0：基线            | 本地/远程 Git、运行时车道、镜像 revision、测试身份策略和历史故障签名均已形成可追溯记录                                   | 完成     |
| 阶段 1：四个 P0         | 四个根因均已实现正式修复；Task、Notification、Knowledge 和 Editor 都已有真实闭环自动化证据                               | 完成     |
| 阶段 2：Goal 参考切片   | 单工具栏、唯一创建入口、同一页面 DOM、容器响应式和状态保持测试已落地                                                     | 完成     |
| 阶段 3：业务模块推广    | Task、Note、Reminder、Notification、Schedule 已采用单页面 DOM 和容器响应式；Web、Shell 与 Desktop 回归已通过             | 完成     |
| 阶段 4：Web 认证        | 固定品牌主题、真实表单、字段反馈、首错聚焦、稳定错误对象、语言即时切换和共享注册 Schema 已落地；密码找回已有独立承接计划 | 完成     |
| 阶段 5：AI 与产品完成度 | 产品完成度项目、生产 Provider clarification、deterministic eval 与 Google AI Studio live eval 2/2 均已收口               | 完成     |
| 阶段 6：部署与验收      | 本地与跨端验收完成，分支已推送并创建 PR #187；等待 CI、合并与标准发布                                                    | 部分完成 |

### 已确认落地

- Task 完成与跳过请求的共享 Schema 已把缺省输入规范化为空对象，HTTP/IPC 共用控制器也覆盖无 body 场景。
- Task 闭环 E2E 通过真实 HTTP 无 body 完成今日实例，并断言首页 `0/1 → 1/1`、进度条、统计和关联 Goal `0% → 10%` 同步刷新。
- Notification Channel mapper 已使用 Channel 行自身 ID，并有不同 ID 前缀回归。
- Notification 闭环 E2E 由同一账号创建并实际触发两个 Reminder，随后验证通知列表、未读数、单条/全部已读和 WindowHeader 徽标归零。
- API 容器启动链已在 Prisma schema reconciliation 前准备 pgvector，并在其后强制执行知识索引 bootstrap 与 `--require-pgvector` smoke。实际数据库已确认扩展、`retrieval_vector` 字段和相关索引存在；现有 E2E 新建笔记已经产生 `indexed` 记录。
- Knowledge 闭环 E2E 已等待新建笔记保存并显示 `knowledge-index-ready`，强制重建返回 `indexed`，真实知识查询命中新资源并返回包含该文件路径和原文摘录的引用；测试运行时使用本地 AI Service 和确定性 OpenAI-compatible provider，不再依赖浏览器路由 mock。
- Editor Workspace 已建立 `(identityId, projectPath)` 自然键，Prisma 使用自然键 upsert 返回真实持久化对象，PowerSync 使用写事务串行 create-or-get，客户端同仓库初始化也会合并并发调用。
- Editor 已增加真实 PostgreSQL 12 路并发 create-or-get 集成回归，以及 Desktop `IPC → application use case → PowerSync repository` 12 路并发回归；所有调用方获得同一个持久化 ID。
- Desktop PowerSync 现在显式订阅共享 Schema 的所有表，并将 PowerSync 内部表名归一化为业务表名；认证态双向同步与冷重启回归已通过 3/3。
- Goal、Task、Note、Reminder、Notification、Schedule 已删除只为窄档/宽档双结构存在的主要分支，主创建入口统一由页面工具栏持有。
- Web 认证页不再显示访客、忘记密码或未准备好的法律入口；当前隐藏行为符合本轮非目标边界。
- Web 注册校验直接复用 `RegisterByEmailSchema`，字段提示由共享 Schema issue 派生，并覆盖密码 100 字符上限；密码找回并入 [`2026-07-17-auth-account-security-closure.md`](./2026-07-17-auth-account-security-closure.md)（Phase A/B1；旧独立计划已归档），当前入口继续隐藏。
- 任务创建反馈会区分是否生成今日实例；Note 新建后进入编辑并显示保存/索引生命周期；Reminder 优先展示触发、下一次触发、重复和状态；Dashboard 性能回归已改为 AI 工作区回归。
- 中文界面残留的 `d`、`min`、`h`、`m`、`KR` 和 `Unknown KR` 已改为 locale-aware 时长格式或翻译键；Goal 剩余天数、关键结果数量、未知关键结果和权重推荐均有中英文展示契约。
- Goal live eval 已包含两条互补路径：完整 workflow case 强制期望 `clarification → draft → confirm → result`，生产 `goal.create` runtime case 强制停在 `waiting_clarification` 且不得提前生成草稿或待执行动作；两者都要求不超过三问并分别覆盖成功标准与时间范围，质量门槛为 100% 通过、必需 case 存在且不允许新增失败。
- 生产 `goal.create` Agent graph 不再在有 Provider 配置时依赖输入长度和固定问题：它调用 `GoalPlanningService.clarify` 识别具体缺失信息，将已有 category/timeframe 一并提供给模型，保留澄清 token usage，并在用户回答后才进入草稿与审批；无 Provider 的离线测试运行时继续使用确定性 fallback。
- Agent runtime deterministic eval 新增真实 graph 澄清 case，要求长但欠明确的输入停在 `waiting_clarification`，问题分别覆盖 success 与 timeline，且草稿和待执行动作保持为空；当前 4/4 通过。
- Google AI Studio live eval 使用稳定且低成本的 `gemini-2.5-flash`；完整 workflow 依次经过 `clarification → draft → confirm → result` 并提交 `create_goal + create_key_result`，生产 runtime 停在 `waiting_clarification` 且草稿、待执行动作为空，两条 case 均为 1.0 score。
- Google OpenAI-compatible 函数调用使用扁平、无 `$defs/$ref/anyOf/default` 的参数 Schema，最终参数继续由 Pydantic 严格校验；live completion budget 可通过 `AI_SERVICE_EVAL_MAX_TOKENS` 配置，默认 4096，以容纳 Gemini thinking 与可见结构化输出。
- Live eval 仅对 429、500、502、503、504 上游瞬时错误执行最多三次指数退避重试；结构化输出错误、质量检查失败和非瞬时 4xx 不重试，因此稳定性处理不会掩盖模型回归。

### 剩余阻塞项

以下项目完成前，本文继续保留在 `active`：

1. 等待 PR #187 CI 全部通过并完成审查、合并，再通过标准发布主线推进；不得把当前主机的本地镜像替代正式发布。

### 剩余执行顺序

1. 跟进 PR #187 CI 与审查，修复真实失败后合并到 `main`。
2. 合并并完成标准发布后，再依据完成定义将本文移入 archive。

## 摘要

本轮工作分成两条内容主线，但使用同一条实施链路：

1. 前端 UI 继续深度重构：收敛 App Vue 的页面结构、标题所有权、主操作入口和响应式模型，使 Web 与 Desktop 共用同一套稳定界面。
2. 功能性重构：优先恢复任务、通知、知识索引和编辑器工作区四个核心闭环，再处理认证、AI Agent、任务概念、笔记效率、提醒信息和本地化等完成度问题。

实施顺序固定为：

1. 锁定代码、容器、数据库和测试基线。
2. 修复四个 P0 核心闭环并建立回归。
3. 以 Goal 完成单页面响应式参考切片。
4. 将统一模型推广到 Task、Note、Reminder、Notification、Schedule。
5. 收敛 Web 认证入口。
6. 改进 Goal Agent、本地化、概念表达和次级效率问题。
7. 完成本地 prod-like 与远程 `58080` 实机验收。

## 问题陈述

### UI 结构问题

现有 App Vue 已经建立 BusinessPanel、多业务 Tab、AI 常驻工作区和容器宽度感知，但业务模块仍然同时保留多层页面结构：

- BusinessPanel Tab 条表达一次模块上下文。
- 模块布局再次渲染侧栏或窄档切换栏。
- 列表页面继续渲染完整标题栏。
- 空状态、侧栏、切换栏和列表标题栏可能重复提供同一主操作。

Goal 是当前最清晰的例子：面板窄时出现视图切换栏和列表标题栏，两行都提供“创建目标”；面板宽时侧栏和列表标题栏也都提供创建入口；空状态还可能再提供一次创建入口。

旧 UI Shell 诊断已经发现 BusinessPanel 内部的页面壳重复问题，并曾将相关阶段标记为完成。当前事实说明原验收没有覆盖“同一主操作可见次数”和“连续标题工具栏层数”，或者后续改动重新引入了结构重复。

### 响应式模型问题

当前部分模块通过 `isNarrow` 等状态在两棵组件树之间切换。该方式带来以下成本：

- 同一个页面被实现成窄档和宽档两个产品形态。
- 两套组件分别拥有按钮、菜单、测试契约和事件接线。
- 面板拖动越过阈值时会更换组件树，存在状态、焦点和滚动位置变化风险。
- 模块被迫理解 split、focus、narrow、wide 等壳层概念。
- 新功能需要在两套入口中重复实现和测试。

响应式应是页面的布局能力，不应成为用户心智或模块架构。

### 核心功能问题

远程产品审查确认四条核心路径仍不可靠：

- 今日任务实例可以生成，但完成请求因缺省请求体与校验契约不一致而失败。
- 通知未读数量存在，但通知 Channel ID 映射错误使列表无法读取。
- 笔记可以保存，但知识索引查询依赖的 `retrieval_vector` 没有进入容器数据库初始化链路。
- 新账号并发确保编辑器工作区时，查询后创建流程与 `project_path` 唯一约束冲突。

这些问题阻断任务执行、通知触达和知识使用，应早于大规模 UI 铺开处理。

### 产品完成度问题

审查还发现以下方向：

- Goal Agent 可能跳过澄清，结构化产物与当前界面语言不一致。
- 任务模板与今日任务实例对新用户缺少清晰区分。
- 笔记创建入口重复、默认命名不自然、新建后不能立即编辑。
- 提醒列表没有优先展示触发时间、下一次触发和状态。
- 导航数量徽标可能覆盖模块的可访问名称。
- Dashboard 页面已经退役，但旧性能测试和远程落点仍需收口。
- Web 登录注册缺少字段级反馈、稳定错误码驱动的国际化、真实表单语义和法律入口。

## 已确认决策

| 主题         | 决策                                                                                 |
| ------------ | ------------------------------------------------------------------------------------ |
| 前端范围     | 主要重构 `packages/app-vue`，Web 与 Desktop 一起受益并一起回归；Mobile 不纳入本轮    |
| 测试宿主     | 以 Web 作为主要自动化和远程验收宿主，同时补 Desktop 关键壳层与窗口行为回归           |
| UI 模型      | Goal、Task、Note、Reminder、Notification、Schedule 全部采用统一单页面模型            |
| 响应式       | 依据 BusinessPanel 内容容器宽度调整同一页面的布局和密度，不切换两套页面架构          |
| 壳层状态     | 模块不感知 split、focus、narrow、wide 等产品状态；这些只属于壳层布局或 CSS 实现细节  |
| 标题所有权   | BusinessPanel Tab 条是唯一模块标题层；页面内部只表达当前视图、对象、过滤、统计和操作 |
| 主操作所有权 | 每个页面只能有一个主要创建入口，固定由页面工具栏持有                                 |
| 空状态       | 空状态不重复主要创建按钮，只提供说明和必要的次级方向                                 |
| 实施顺序     | 先修四个 P0 并建立回归，再开始全量 UI 铺开                                           |
| 参考切片     | Goal 先落地，验证单页面模型后推广其他业务模块                                        |
| 认证入口     | 纳入统一文档；密码找回完整流程作为后续独立阶段                                       |
| Goal Agent   | 先强化输入约束和中英文评测；评测仍失败时才增加输出校验和自动重试                     |
| 兼容策略     | 项目处于活跃开发期，不保留旧 UI 双轨、shim 或长期 feature flag                       |

## 目标

### UI 目标

- Web 与 Desktop 使用同一套 App Vue 业务页面。
- BusinessPanel 内每个模块只有一套稳定 DOM 和状态模型。
- 面板宽度变化只改变布局、密度、换行、显隐和列数，不更换页面架构。
- 任意时刻，每个业务页面最多存在一个可见的主要创建入口。
- BusinessPanel Tab 与页面内容不重复表达模块标题。
- 页面在面板拖动、窗口缩放和 split/focus 切换时不丢失输入、焦点、滚动和编辑状态。
- 响应式行为由现有容器查询和原生 CSS 承担，尽量减少 JavaScript 阈值判断。
- 键盘、读屏、焦点和可访问名称成为基础验收，不作为后补工作。

### 功能目标

- 今日任务可以完成并可靠更新首页进度和统计。
- 通知数量、列表、已读状态和徽标保持一致。
- 笔记保存与知识索引状态可区分，知识问答可以命中新建内容。
- 编辑器工作区初始化在并发进入时保持幂等。
- 登录注册提供可行动、可翻译、字段就近的错误反馈。
- Goal Agent 先澄清再产出，并使用当前界面语言生成结构化结果。
- 任务、笔记和提醒的概念及主要信息符合首次使用者预期。

## 非目标

- 不重构 Mobile 或 `packages/app-react`。
- 不引入新的通用响应式框架、页面 DSL 或布局配置系统。
- 不保留旧窄档/宽档页面实现与新实现长期并存。
- 不删除仍被 AI 工作区和预览使用的 Dashboard 数据与统计能力。
- 不在本轮临时编写法律文本并直接上线。
- 不在真实邮件和持久验证码基础设施完成前开放忘记密码入口。
- 不把本地或远程开发环境验收直接当作生产发布。

## 统一 UI 架构

### 页面层级

所有业务模块统一为以下层级：

1. WindowHeader：窗口、全局导航和胶囊入口。
2. BusinessPanel Tab：模块图标、模块名、多业务上下文切换和面板控制。
3. 页面工具栏：当前视图或对象、数量、搜索、过滤、唯一主操作和更多菜单。
4. 页面内容：列表、详情、编辑器、时间线、空状态、加载和错误反馈。

模块页面不得再额外包装完整页面级壳，不得再次显示与 BusinessPanel Tab 同义的模块标题。

### 单页面响应式原则

- 每个路由只维护一套页面状态和主要 DOM。
- BusinessPanel 已提供命名容器，模块优先使用 CSS container query。
- 容器变小时允许：工具栏换行、按钮文字隐藏、搜索折叠、次级操作进入菜单、列表减少列数。
- 容器变大时允许：搜索展开、统计常显、按钮显示完整文字、列表增加列数。
- 响应式不得复制创建按钮、复制过滤状态或维护第二份组件事件协议。
- 不因越过某个宽度阈值卸载页面、切换路由组件或重建编辑器。
- 仅真正需要测量的交互几何继续使用 JavaScript，例如面板拖拽边界；普通排版不使用 JavaScript 档位。

### 标题与操作所有权

- BusinessPanel Tab 只显示模块上下文，例如“目标”“任务”“笔记”。
- 页面工具栏显示具体上下文，例如“进行中 · 12”“今天 · 4”“收件箱 · 1 未读”。
- 详情页可以显示对象标题，但不再重复模块名。
- 页面工具栏拥有唯一主要操作，例如“创建目标”“新建任务”“新建笔记”。
- 导航、视图选择器、侧栏和空状态不得提供第二个同等级主操作。
- 空状态可以提供 AI、导入、查看示例等次级入口，但不能与固定工具栏竞争主操作。

### Goal 参考切片

Goal 先完成以下收敛：

- 移除依据面板档位切换两套布局组件的结构分支。
- 将系统视图、文件夹、专注入口、搜索、数量、创建目标和更多操作收敛到一个页面工具栏。
- 列表页不再渲染第二个完整标题栏。
- 创建目标固定为唯一入口。
- 空状态删除重复创建按钮，保留说明和 AI 次级入口。
- 容器宽度只控制工具栏排列、标签文字、搜索展开和列表列数。
- 详情、对比和专注路由继续使用各自内容结构，但遵循同一标题所有权。

### 其他模块推广方向

| 模块         | 当前重点                               | 目标                                                       |
| ------------ | -------------------------------------- | ---------------------------------------------------------- |
| Task         | 页面壳、过滤栏和任务模板概念拥挤       | 单工具栏；模板库、今日实例和过滤关系清晰；极窄宽度不裁切   |
| Note         | 多个新建入口、树与编辑器层级复杂       | 唯一新建入口；新建后立即进入编辑；树、搜索和编辑器连续响应 |
| Reminder     | 列表优先级错误、创建入口与过滤可能重复 | 唯一工具栏；优先展示触发时间、下一次触发、重复和状态       |
| Notification | Tab、列表页壳、未读工具栏语义重叠      | 保留收件箱工具栏；数量、列表和已读状态一致                 |
| Schedule     | 日历工具栏与 BusinessPanel 上下文重复  | 单日历工具栏；视图切换、日期导航和创建日程连续响应         |
| Governance   | 已并入 Note 的规范上下文               | 不恢复独立模块壳；作为 Note 内部视图遵循相同规则           |

## 功能性重构方向

### P0：任务实例完成闭环

根因是客户端和应用端把完成参数定义为可选，但共享传输校验要求收到对象。无请求体时被通用校验错误拦截。

实施要求：

- 在 HTTP 与 IPC 共用的边界把缺省输入规范化为空对象。
- 同时检查完成和跳过两个具有相同契约形态的操作。
- 不在具体按钮调用处增加临时空对象补丁。
- 服务端保留稳定错误码，前端不展示原始内部信息。

验收：

- 创建今日任务实例后可以完成。
- 首页从 `0/1` 更新为 `1/1`。
- 统计和关联目标进度按现有契约刷新。
- 无 body、有可选反馈字段、重复完成均有自动化覆盖。

### P0：通知读取闭环

根因是通知 Channel 持久化映射把 Notification ID 当作 NotificationChannel ID 解析。

实施要求：

- 修复根 mapper，使用 Channel 行自身 ID。
- 增加包含不同 ID 前缀的 mapper 回归。
- 不增加跳过坏记录或兼容旧错误映射的长期分支。

验收：

- 提醒触发后，通知列表显示对应通知。
- 未读数量与可读取列表一致。
- 标记已读后列表状态更新且徽标归零。

### P0：知识索引 Schema 闭环

根因是知识索引 bootstrap 和 smoke 已经存在，但 API 容器启动只运行 Prisma migrate 或 db push，没有创建 pgvector 扩展、`retrieval_vector` 字段和索引。

实施要求：

- 将知识索引 bootstrap 接入容器数据库初始化主线。
- 启动后强制执行 pgvector smoke；缺少必需结构时服务不得静默健康。
- 保持 Markdown 保存与知识索引失败解耦。
- 后续增加可见索引状态和重试入口。

验收：

- 新建笔记后索引任务成功完成。
- 知识问答可以命中新建笔记并返回引用。
- Schema 缺失会在启动或健康验证阶段暴露，不等到用户请求时才失败。

### P0：编辑器工作区幂等初始化

根因是客户端采用查询后创建，并发调用会生成不同工作区 ID，但数据库只允许一个 `project_path`。

实施要求：

- 明确工作区自然键为账号与项目路径组合。
- 持久化层提供原子 create-or-get，不依赖客户端先查后建避免冲突。
- 创建用例返回实际持久化的工作区，而不是并发失败一方生成的临时 ID。
- Web 与 Desktop 共同使用同一语义。

验收：

- 同账号并发进入笔记模块只产生一个工作区。
- 所有调用方得到同一个真实工作区 ID。
- 后续 session、group、tab 初始化不再引用不存在的工作区。

### 认证入口

本轮包含：

- Web 不展示访客模式入口，并清理 Web 残留文案。
- 登录与注册使用 `main`、唯一 `h1`、真实 `form` 和提交语义。
- 注册复用现有注册 Schema 做本地校验。
- 字段错误就近显示、首错聚焦、修正后清除。
- 页面状态保存稳定错误码或错误对象，渲染时按当前语言翻译。
- 登录页固定品牌深色主题，不覆盖工作区主题偏好。
- 服务条款和隐私政策只有在正式内容准备后接入真实链接。

忘记密码完整流程单独排期，需要先完成：

- 真实邮件发送适配器。
- Redis 或持久化验证码存储。
- 有效期、消费、发送频率、尝试次数和账号枚举保护。
- 注册、修改密码和重置密码的一致密码规则。
- 重置成功后的旧会话失效。

### Goal Agent

- 当前界面语言作为 Agent 输入契约的一部分。
- 第一轮只识别缺失信息并提出不超过三个高价值问题。
- 澄清、生成、审批、执行、取消和失败阶段清晰可见。
- 对话正文保持简洁，详细计划放在结构化产物区域。
- 结构化目标、KR、任务和提醒使用当前界面语言。
- 先增加中文、英文和混合输入 eval；仅在评测证明必要时增加语言校验与自动重试。

### 任务概念

- 明确区分任务模板和今日任务实例。
- 创建入口文案说明创建的是一次性待办还是可重复模板。
- 创建成功反馈说明是否同时生成今日实例。
- 分值、完成率和关联 KR 不显示无法理解的孤立数字。

### 笔记效率

- 页面只保留一个主新建入口。
- 新建后立即进入编辑状态并聚焦标题或正文。
- 支持可预测的标题与文件名关系。
- Markdown 保存成功与知识索引成功分别反馈。

### 提醒体验

- 重新验证当前源码对已过固定时间的处理；当前实现若已从下一周期开始，不重复修改。
- 列表优先展示触发时间、下一次触发、重复规则和启用状态。
- 分组和控制来源降为次级信息。
- 即将触发、已错过、暂停和失败使用明确状态。

### 可访问性、本地化与反馈

- 导航按钮名称始终包含模块名；数量只作为补充。
- 主按钮、图标按钮和菜单拥有稳定可访问名称。
- 错误、成功、取消和加载状态不使用相互矛盾的文案。
- 中文界面清理残留英文时间、单位和 KR 缩写。
- 语言切换后，当前错误和状态文本即时更新。

### Dashboard 退役收口

- 保留 `/dashboard` 到 `/` 的兼容跳转。
- 不恢复独立 Dashboard 页面或导航入口。
- 保留被 AI 工作区和胶囊预览消费的统计能力。
- 将旧 Dashboard 性能测试改为 AI 工作区性能测试，删除不存在控件的断言。

## 实施阶段与小提交计划

每个提交都必须保持代码库可构建、相关测试可运行。不得提交红测试、半迁移组件或需要下一个提交才能恢复的双轨状态。

### 阶段 0：基线

当前状态：**完成**。本文“基线记录”已固化本地/远程 Git revision、dirty 状态、运行时车道、三个应用镜像标签、测试身份策略，以及四个 P0、Dashboard、Reminder 和 Goal Agent 的历史失败签名与当前区分证据。

1. 记录本地与远程 Git revision、dirty 状态和三个项目镜像标签。
2. 记录远程四个 P0 的最小复现、日志签名和测试账号状态。
3. 固化当前 Dashboard、提醒和 Goal Agent 行为，区分当前缺陷与历史观察。

### 阶段 1：四个 P0

当前状态：**完成**。四个根因修复和真实闭环自动化均已落地：Task、Notification、Knowledge 使用真实 Web/API/调度/索引运行时，Editor 覆盖真实 PostgreSQL 与 Desktop IPC/PowerSync 并发路径。

1. 规范化任务实例完成与跳过的缺省输入，并增加传输边界测试。
2. 增加今日任务完成后的首页进度回归。
3. 修复通知 Channel ID 映射，并增加 mapper 测试。
4. 增加提醒触发到通知已读的闭环回归。
5. 将知识索引 bootstrap 接入容器初始化，并保留幂等性。
6. 将强制 pgvector smoke 接入启动验证。
7. 调整编辑器工作区自然键和生成的数据库客户端。
8. 增加持久化层原子 create-or-get。
9. 让创建用例返回真实持久化工作区，并补并发回归。
10. 在本地 prod-like 环境执行四条闭环回归。

### 阶段 2：Goal 单页面参考切片

当前状态：**完成**。Goal 已采用单工具栏和同一页面 DOM，删除窄档/宽档双结构与重复创建入口，Web 组件和 E2E 回归通过。

1. 建立 Goal 唯一页面工具栏，先保持现有功能不变。
2. 将系统视图、文件夹、专注、搜索、数量和更多操作迁入工具栏。
3. 将创建目标收敛为工具栏唯一主入口。
4. 删除列表页重复标题栏和空状态重复创建按钮。
5. 用容器查询完成工具栏换行、文字显隐、搜索折叠和列表列数响应。
6. 删除窄档/宽档结构分支以及只为双结构存在的组件。
7. 增加拖动面板时状态、焦点、滚动不重置的组件与 E2E 回归。
8. 增加任意代表性宽度下主要创建入口可见数量不超过一个的断言。

### 阶段 3：业务模块推广

当前状态：**完成**。五个模块均已完成单页面结构迁移；Web 67/67、Shell 8/8、Desktop 227/227 与认证态 PowerSync 双向同步/冷重启 3/3 回归通过。

按 Task、Note、Reminder、Notification、Schedule 顺序推进。每个模块独立完成以下提交序列后再进入下一个模块：

1. 建立单一页面工具栏并迁移现有操作。
2. 删除重复模块标题、页面壳和主操作。
3. 使用容器查询完成连续响应式布局。
4. 保留并验证模块特有的编辑、过滤、拖拽或日历状态。
5. 增加唯一主操作、无溢出、键盘和可访问名称回归。

模块之间不建立新的通用页面 DSL；只有第二个模块明确重复且稳定的纯视图模式，才允许提取小型共享组件。

### 阶段 4：Web 认证入口

当前状态：**完成**。界面、错误反馈、共享注册 Schema 和密码找回承接边界均已落地；密码找回入口保持隐藏，完整实现由独立 active plan 承接。

1. 固定品牌主题并移除主题选择，不改工作区偏好。
2. 建立标题、表单、字段和错误区域语义。
3. 增加注册本地校验、首错聚焦和错误清除。
4. 将认证错误状态改为稳定错误对象并支持语言即时切换。
5. 清理 Web 访客文案与不可操作的密码找回提示。
6. 法律内容准备后接入真实多语言链接。
7. 补齐登录、注册、键盘、语言和可访问性 E2E。

### 阶段 5：AI 与产品完成度

当前状态：**完成**。任务、笔记、提醒、可访问名称、Dashboard 和本地化已经收口；生产 `goal.create` graph 已接入 Provider clarification，Goal workflow deterministic eval 7/7、Agent runtime deterministic eval 4/4 与 Google AI Studio `gemini-2.5-flash` live eval 2/2 全部通过。live lane 同时覆盖完整 workflow 和生产 runtime，并验证强制澄清、具体缺失信息、最多三问、不得提前产出与语言一致性。

1. 将 locale 传入 Goal Agent 并本地化澄清问题与结构化产物。
2. 增加先澄清、最多三问、中英文一致性的 eval。
3. 收敛任务模板与实例文案及创建反馈。
4. 改进笔记创建、命名、立即编辑和索引状态。
5. 重排提醒列表信息并确认已过时间规则。
6. 修复胶囊可访问名称、重复反馈和残留英文。
7. 重命名或重写 Dashboard 性能测试。

### 阶段 6：部署与验收

当前状态：**部分完成**。最终 prod-like 验证、目标 revision 容器、当前主机 `58080` Web E2E、Shell、Desktop 与认证态 PowerSync 回归已通过；分支已推送并创建 PR #187，本地验证报告为 `Ready for PR: yes`。Performance check 已通过，等待其余 CI、审查、合并与标准发布。

1. 运行离改动最近的 Nx lint、typecheck、test 和 E2E target。
2. 使用 `pnpm docker:local:up` 构建带 revision 标签的本地 prod-like 镜像。
3. 确认 API、Web、AI Service、PowerSync 健康。
4. 提交、发起 PR，并按仓库发布主线推进。
5. 在远程 `/opt/memoflow` 确认目标 revision 后重新构建开发环境。
6. 使用远程 `58080` 完成 Web 实机验收。
7. 使用 Desktop 完成窗口、BusinessPanel、编辑器和关键业务回归。

## 测试决策

### 测试原则

- 测试外部行为和稳定契约，不锁死 Tailwind class、内部组件名或实现阈值。
- 响应式测试使用若干代表性容器宽度，但断言的是无重复、无溢出、操作可达和状态不丢失。
- 一条根因修复至少留下一个能在回归时失败的自动化检查。
- 真实 Provider、通知调度、知识索引和远程环境不能完全由 mock 结果替代。

### UI 回归

- BusinessPanel Tab 与内部页面不重复模块标题。
- 每个模块任一时刻最多一个可见主创建入口。
- 面板连续拖动时不卸载当前路由页面。
- 工具栏在代表性容器宽度下无非预期水平溢出。
- 输入、编辑器、选择、滚动和焦点在布局变化后保持。
- Web 与 Desktop 共享页面产生一致业务结果。

### 功能回归

- 今日任务创建、完成、进度和统计。
- 提醒触发、通知读取、已读和徽标。
- 笔记创建、保存、索引和知识问答引用。
- 新账号并发编辑器工作区初始化。
- 登录、注册、字段错误、错误语言和主题。
- Goal Agent 澄清、审批、执行、取消和语言。
- Dashboard 兼容跳转与 AI 工作区统计。

### 推荐验证目标

- `pnpm nx run task:test`
- `pnpm nx run notification:test`
- `pnpm nx run editor:test`
- `pnpm nx run ai:test`
- `pnpm nx run app-vue:test`
- `pnpm nx run app-vue:typecheck`
- `pnpm nx run app-vue:lint`
- `pnpm nx run web:test`
- `pnpm nx run web:typecheck`
- `pnpm nx run web:lint`
- `pnpm nx run ai-service:test`
- `pnpm nx run ai-service:goal-workflow-eval`
- `pnpm nx run ai-service:goal-workflow-eval-live`
- `pnpm nx run desktop:test`
- `pnpm nx run desktop:typecheck`
- `pnpm nx run web:e2e`
- `pnpm nx run web:e2e:shell`
- `pnpm nx run web:e2e:sync`
- `pnpm nx run memoflow:governance-check`

## 风险与控制

### UI 范围扩散

控制方式：按模块纵向完成，不同时拆开所有模块；Goal 参考切片通过后再推广。

### 重新引入双轨

控制方式：新页面完成后立即删除旧结构，不保留长期 feature flag 或窄档/宽档两套组件。

### 响应式测试过度绑定实现

控制方式：断言可见操作数量、可达性、溢出和状态保持，不断言内部断点名称。

### UI 重构掩盖功能缺陷

控制方式：四个 P0 先完成；每个模块迁移前后使用同一业务回归验证行为未改变。

### 远程版本不可追溯

控制方式：本地构建入口写入 OCI revision 与 build time；dirty 工作区使用 `-dirty` 后缀；远程验收记录 checkout revision 和镜像标签。

### 外部依赖未准备

控制方式：法律文案、真实邮件和密码找回基础设施未准备时，不用占位内容伪装完成。

## 完成定义

本文只有在同时满足以下条件后才能移入 archive。勾选状态以 2026-07-16 事实审计为准：

- [x] 四个 P0 核心闭环全部修复并有自动化回归。
- [x] Goal、Task、Note、Reminder、Notification、Schedule 全部采用统一单页面响应式模型。
- [x] 上述业务模块不存在重复模块标题和重复主要创建入口。
- [x] Web 与 Desktop 关键业务和壳层回归通过。Web 67/67、Shell 8/8、Desktop 227/227、认证态双向同步与冷重启 3/3 均通过。
- [x] Web 认证入口第一阶段全部完成；未实施的密码找回已有独立承接计划且入口保持隐藏。
- [x] Goal Agent 澄清与中英文评测达到约定策略。生产 graph 使用 Provider 识别具体缺失信息，Goal workflow 7/7、Agent runtime 4/4 deterministic eval 与 Google AI Studio live eval 2/2 均通过；live gate 同时覆盖完整 workflow 和生产 runtime，并验证最多三问、不得提前产出和语言一致。
- [x] 本地 prod-like 容器验证通过。
- [x] 当前 `/opt/memoflow` 主机的 `58080` Web E2E 通过，并记录了可追溯 revision。
- [x] Dashboard 退役、提醒规则、知识索引和旧测试已完成收口。
