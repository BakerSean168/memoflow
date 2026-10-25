---
tags:
  - plan
  - archive
  - web
  - product-review
  - goal
  - task
  - ux
  - accessibility
  - docker
description: 2026-07-29 本机 Docker 产品经理旅程审查记录，以及目标、任务、交互和视觉体验的分阶段优化方案
created: 2026-07-29T00:00:00
updated: 2026-07-31T00:00:00
status: completed
---

# 本机 Docker 核心产品审查与优化方案

> **归档结果（2026-07-31）**：Phase A–E、本文全部验收项、Web/Desktop 共享壳验证和
> 本机 Docker prod-like PM journey 已通过。最终验证使用运行时 profile 的真实端口，
> 镜像 revision、容器健康、HTTP 探针和浏览器 Nginx 命中证据均由仓库验证报告记录；
> 自动化 `pm-phase-*` 数据已清理至 `0 rows`。

## 1. 文档地位

本文记录 2026-07-29 在本机 Docker prod-like 环境中完成的产品经理视角审查，并将发现转化为可执行的产品与工程优化计划。

本文件是本轮优化工作的已完成实施与验收记录，覆盖：

1. 创建目标及关键结果的流程与逻辑。
2. 创建任务模板、生成任务实例和完成任务的流程与逻辑。
3. AI 首页、模块导航、弹窗和状态反馈的交互逻辑。
4. Web/Desktop 共享壳的左右侧栏、右侧面板、专注模式和 AI 空闲态。
5. Web UI 的视觉一致性、对齐、信息密度和无障碍质量。
6. 支撑上述审查的本地部署、Docker 和验证环境基线。

本文不替代以下历史材料，而是在当前本机环境上补充新的基线和问题：

- [`2026-07-15-web-core-product-review.md`](./2026-07-15-web-core-product-review.md)：早期 Web 核心功能审查。
- [`2026-07-16-web-product-design-review.md`](./2026-07-16-web-product-design-review.md)：历史设计复审。
- [`2026-07-27-docker-web-pm-journey-findings.md`](./2026-07-27-docker-web-pm-journey-findings.md)：Docker Web 旅程、i18n、邮箱验证和本地部署问题。
- [`2026-07-17-unified-assistant-agent-host.md`](2026-07-17-unified-assistant-agent-host.md)：统一助手与 Agent Host 主产品能力线。

真值顺序遵循 `AGENT.md`：当前代码、配置和测试优先于本文。

## 2. 审查目标

本轮不只检查页面是否能打开，而是验证 MemoFlow 是否形成清晰、可信、可持续使用的业务闭环：

```text
用户意图
  → 创建目标
  → 定义可衡量的关键结果
  → 创建支持该关键结果的任务
  → 生成当天任务实例
  → 完成任务
  → 更新任务与目标进度
  → 在首页获得一致反馈
```

产品合格不等同于 API 返回成功。每一步还必须满足：

- 用户理解自己正在创建什么。
- 用户知道创建后会发生什么。
- 状态变化在所有相关界面中一致。
- 异常不会导致表单崩溃或数据丢失。
- 主操作在未配置 AI 时仍有可发现的替代路径。
- 中文界面没有残留英文、含混状态或不可访问控件。

## 3. 验证环境与方法

### 3.1 环境

| 项目       | 本轮状态                                                       |
| ---------- | -------------------------------------------------------------- |
| 工作区     | `/home/ubuntu/backups/memoflow-legacy-feature-repository`      |
| Web        | `http://localhost:58080`                                       |
| API        | `http://localhost:53080`                                       |
| PowerSync  | `http://localhost:58081`                                       |
| AI Service | `http://localhost:58100`                                       |
| Postgres   | `127.0.0.1:55432`                                              |
| Redis      | `127.0.0.1:56379`                                              |
| Node       | `v24.18.0`；pnpm `11.12.0`                                     |
| Docker     | Docker Engine `29.6.2`；六个 MemoFlow 服务均 healthy           |
| 浏览器     | Playwright Chromium；1280 × 720、1440 × 900、390 × 844         |
| Desktop    | Electron + Xvfb；900 × 600、1024 × 768、1200 × 800、1440 × 900 |

### 3.2 本地端口纠偏

本轮初期，宿主机曾通过 SSH 将远程开发服务器的 `58080` 转发到本地，导致“访问 localhost”不能证明页面来自本地 Docker。

关闭 SSH 转发后重新验证：

1. `localhost:58080` 一度没有监听者，说明此前页面确有较大概率来自 SSH 隧道。
2. 运行中的 `memoflow-web-1` 保留了 `HostConfig.PortBindings`，但 `NetworkSettings.Ports` 为空。
3. 使用 `.env.production.local` 重新创建 `web` 容器后，端口恢复为 `0.0.0.0:58080->80/tcp`。
4. 浏览器刷新产生的 `/auth`、静态资源和 `/api/v1/auth/oauth/providers` 请求均出现在本地 `memoflow-web-1` Nginx 日志中。

因此，本轮最终入口已确认是本机 Docker 实例。此前为规避端口冲突使用的临时 LAN 入口只用于同一批本地镜像和本地后端的旅程验证，已移除，不作为长期运行方式。

### 3.3 验证方式

- 使用仓库本地部署验证脚本执行 lint、typecheck、test 和 Docker rebuild。
- 使用真实注册流程创建本地测试账号并完成邮箱验证码验证。
- 通过产品 UI 创建目标、关键结果和任务模板。
- 验证任务实例自动生成及完成反馈。
- 在任务创建中启用目标/关键结果关联，观察异常恢复与数据保留行为。
- 在 1280 × 720 视口检查布局、对齐、滚动、文案和控件可访问名称。
- 通过容器健康状态、HTTP 探针和 Nginx 访问日志交叉确认请求链路。

### 3.4 工程验证结果

| 检查项                             | 结果   | 备注                                                                  |
| ---------------------------------- | ------ | --------------------------------------------------------------------- |
| affected lint/typecheck/test/build | 通过   | 37 个项目、137 个目标；lint 仅有既有非阻断 warning                    |
| Task integration / API smoke       | 通过   | `22 passed` / `61 passed`                                             |
| Docker local rebuild               | 通过   | 六个服务 healthy；Web/API/AI 镜像 revision 精确匹配验证 HEAD          |
| Web PM journey                     | 通过   | A–E 共 `7 passed`，覆盖 1280、1440 与移动断点                         |
| Desktop shell / serve              | 通过   | Electron 壳层 `8 passed`；`desktop:serve-safe` 真实启动并正常清理     |
| AI Service typecheck               | 通过   | `0 errors, 0 warnings`                                                |
| AI Service test                    | 通过   | `182 passed`                                                          |
| validation report                  | 通过   | `verdict: pass`、`readyForPr: true`，无 host-tool/code/docker failure |
| 测试数据                           | 已清理 | `pm-phase-*` preview → apply → preview，最终 `0 rows`                 |
| 工作区状态                         | 干净   | 报告、Playwright 产物、日志、缓存与本机 env 均未进入 Git              |

初次验证报告中的 AI 检查失败来自复制工作区后 `.venv` 的 `pytest`、`pyright`
shebang 仍指向旧路径。执行 `uv sync --locked --reinstall` 重建锁定环境后，仓库定义的
Nx 目标均通过。该问题由最终报告分类为宿主工具环境问题，不是业务代码失败。

验证报告：

- `reports/local-deploy-validation/latest.md`
- `reports/local-deploy-validation/latest.json`

最终 `latest` 报告已由仓库 `validate-local-deploy` 工作流重新生成，不再包含旧 uv
失败；机器可读报告同时记录镜像 freshness、容器状态、端口映射和浏览器请求证据。

## 4. 审查摘要

### 4.1 总体结论

MemoFlow 已具备目标和任务的基础数据能力：

- 注册和邮箱验证可完成。
- 可以创建目标和关键结果。
- 可以创建不绑定目标的任务模板。
- 任务模板可以自动生成今日任务实例。
- 今日任务可以标记完成，首页能显示 `1/1`。

但“目标 → 关键结果 → 任务 → 完成 → 进度回写”这一核心差异化闭环仍未成立。任务一旦绑定目标/关键结果，创建面板会发生运行时崩溃，并且错误恢复会丢失全部输入。与此同时，任务模板、任务实例和完成率的概念表达不一致，新建表单还会残留上一轮内容。

当前产品适合内部开发验证，但不应把“任务驱动目标进度”描述为稳定能力。

### 4.2 测试矩阵

| 模块        | 场景                             | 结果       | 产品判断                                           |
| ----------- | -------------------------------- | ---------- | -------------------------------------------------- |
| 账号        | 注册、取码、邮箱验证、进入工作区 | 通过       | 本地完整注册旅程可执行                             |
| 首页        | 未配置模型时进入工作区           | 部分通过   | 能进入，但 AI 主工作区几乎不可操作                 |
| AI 空闲态   | 今日概览位置                     | 失败       | 概览挤占对话初始页，应迁回可切换的右侧面板起始页   |
| 壳层        | Toggle Side Panel                | 失败       | 顶栏缺少右侧面板开关，空闲右栏已被历史实现主动移除 |
| 壳层        | 业务面板专注模式                 | 失败       | 点击专注会强制隐藏左侧栏，两个区域没有独立控制     |
| AI Composer | 未配置模型提示                   | 失败       | 共享组件仍渲染冗长警告，Web/Desktop 预期不一致     |
| 目标        | 创建目标基本信息                 | 通过       | 表单清晰度相对较好                                 |
| 目标        | 创建一个关键结果                 | 通过       | 可用，但嵌套弹窗和术语仍需优化                     |
| 目标        | 目标卡片状态展示                 | 部分通过   | 状态和动作语义不够明确                             |
| 任务        | 创建普通任务模板                 | 通过       | 能成功并生成今日实例                               |
| 任务        | 再次打开新建任务                 | 失败       | 保留上次提交内容                                   |
| 任务        | 关联目标和关键结果               | 阻断       | 面板崩溃并丢失表单                                 |
| 任务        | 完成今日实例                     | 通过       | 今日概览更新为 `1/1`                               |
| 状态一致性  | 完成后模板卡片同步               | 部分通过   | 模板仍显示“进行中 / 完成率 0%”                     |
| 导航        | 从顶部模块胶囊进入目标/任务      | 可用但低效 | 需要二次点击“进入”                                 |
| UI          | 1280 × 720 主视口                | 部分通过   | 基本对齐，但任务弹窗过长、视觉语言不一致           |
| 无障碍      | 任务开关、目标/KR 下拉           | 失败       | 多个控件缺少可访问名称                             |

### 4.3 已确认决策矩阵

| 决策                 | 已确认方案                                             |
| -------------------- | ------------------------------------------------------ |
| 右侧面板空闲态       | 今日概览是 Home surface，不是 BusinessTab              |
| 右侧面板默认与持久化 | 首次默认打开；用户 Toggle 偏好跨重启保存               |
| 关闭最后业务 Tab     | 回到 Home，不关闭右侧面板                              |
| 显式导航             | 模块、深链和“查看全部”可以重新打开右侧面板             |
| Focus                | 只隐藏中央 AI；左侧栏保持独立，AI 实例继续保活         |
| 工作流审批           | 采用上下文感知自动切换；脏表单或用户已关闭面板时只提示 |
| 任务用户术语         | 任务计划 / 待办任务 / 今日任务 / 快速任务              |
| 任务计划完成率       | 最近 30 天已到期实例，显示分子/分母和百分比            |
| KR 整体完成触发      | 只允许有限任务计划，整个计划只贡献一次                 |
| 编辑任务计划         | 同步当前时刻之后的 Pending；进行中和历史不变           |
| 表单草稿             | 首期仅弹窗生命周期内恢复                               |
| 无模型 Composer      | 删除常驻长提示，保留紧凑“配置 AI”入口                  |

以上决策作为本计划实施基线。后续实现不得重新引入并行状态模型或平台分叉；
需要变更时先更新本文的决策与验收标准。

## 5. 做得好的部分

### 5.1 基础目标创建流程可理解

- 目标名称、描述、时间线和关键结果的主结构符合用户心智。
- 目标弹窗相较任务弹窗更简洁，分区层级较清楚。
- 创建后目标卡片能展示关键结果数量和剩余时间。
- 关键结果支持目标值、当前值和类型，为后续任务回写提供了数据基础。

### 5.2 普通任务创建和实例生成已形成基础闭环

- 用户能够创建一个全天、不重复的任务模板。
- 系统能自动生成当天任务实例。
- 完成实例后，今日概览能显示已完成和 `1/1`。
- 这说明模板、调度、实例和完成命令的基础链路已经可用。

### 5.3 AI 与业务面板共存的总体方向成立，但状态模型需要补齐

- 目标和任务可以在不完全离开 AI 工作区的情况下打开。
- 右侧业务面板保留了主工作区上下文。
- “AI 对话 + 右侧业务工作区”的总体结构成立。
- 当前缺少右侧面板独立开关和空闲起始页，今日概览也被错误放进对话欢迎页，
  因此还没有形成稳定的面板状态模型。

### 5.4 主布局基础对齐可用，但专注态存在结构性覆盖

- 左侧导航、中央工作区、右侧业务面板在审查视口下保持稳定。
- 目标创建弹窗的间距和基础对齐总体合格。
- 暗色主题色彩体系已有统一 token 基础。
- 右侧业务面板进入专注态时会强制隐藏左侧栏；这不是视觉错位，而是状态耦合
  导致的交互问题。

## 6. 问题清单与优化方案

## 6.1 P0：任务关联目标/KR 时面板崩溃

### 现象

在“创建任务模板”中：

1. 启用“关键结果关联”。
2. 选择刚创建的目标。
3. 整个任务面板被 ErrorBoundary 替换。
4. 页面显示：`Cannot read properties of null (reading 'focus')`。
5. 点击“重试”后任务面板恢复，但创建弹窗已经关闭，所有输入丢失。

### 产品影响

- 直接阻断任务驱动目标进度的核心业务能力。
- 用户已经填写的大量任务信息无法恢复。
- 错误发生在选择目标这一低风险操作上，会显著降低用户对表单稳定性的信任。
- 产品目前只能创建孤立任务，无法兑现目标与执行联动。

### 当前代码范围

重点排查：

- `packages/app-vue/src/modules/task/components/TaskTemplateForm/sections/KeyResultLinksSection.vue`
  - `loadKeyResults`
  - `handleGoalChange`
  - `updateBinding`
  - `props.modelValue.goalBinding` 深度监听
- `packages/app-vue/src/modules/task/components/dialogs/TaskTemplateDialog.vue`
  - `localTemplate.goalBinding.goalId` 监听
  - `ensureBindingKeyResults`
  - `requestKeyResults`
- `packages/app-vue/src/modules/task/composables/useTaskGoalBindingOptions.ts`
  - 目标与 KR 异步选项加载、缓存和响应顺序
- 任务表单所使用的 Select/Popover 组件
  - 在选项异步刷新或 Select 内容卸载时，对已销毁 trigger/content 执行 `focus()`

当前只能确认崩溃发生在“选择目标 → 异步加载 KR → 响应式更新 Select”链路。`focus()` 未出现在任务业务组件源码中，因此需要结合浏览器完整堆栈和 UI 库内部行为确认最终根因，不能只用空值保护掩盖。

### 优化方案

1. 为目标选择建立单一异步所有者，避免父弹窗与 KR section 同时请求同一目标的关键结果。
2. `handleGoalChange` 只更新选择状态并触发一次请求，不在异步返回前反复重建绑定对象。
3. 加载期间保持 Select trigger 稳定挂载；只切换内容区的 loading/empty/options 状态。
4. 使用请求序号或 `AbortController` 丢弃过期响应，避免快速切换目标时旧响应覆盖新状态。
5. 目标变化时将 KR 选择重置为“待选择”，但保留其他任务字段。
6. ErrorBoundary 不应成为普通表单异常的恢复机制；目标/KR 加载失败应在关联 section 内展示可重试错误。
7. 对未保存表单增加会话内草稿保护。即使发生非预期渲染异常，重新打开后也应恢复用户输入。

### 必需测试

- 组件测试：启用关联后选择目标，不抛异常。
- 组件测试：KR 请求 loading → success 时 Select trigger 始终存在。
- 组件测试：KR 请求失败只显示 section 错误，表单其他字段不丢失。
- 组件测试：快速选择目标 A → B，最终只显示 B 的 KR。
- 组件测试：目标无 KR 时展示明确空态，可取消关联或返回创建 KR。
- E2E：创建目标和 KR → 创建绑定任务 → 完成实例 → KR 进度按规则更新。

### 验收标准

- [x] 连续 20 次启用/关闭关联、切换目标，不出现 console error 或 ErrorBoundary。
- [x] 请求失败、空结果和快速切换均不丢失任务标题、描述、时间、重复和提醒设置。
- [x] 绑定任务保存后，目标名和 KR 名在任务详情中正确显示。
- [x] 完成绑定任务实例后，KR 进度按照 `progressTrigger` 和 `incrementValue` 更新。

## 6.2 P1：新建任务弹窗保留上次提交内容

### 现象

成功创建任务后，再次点击“新建任务模板”，标题和描述仍是上一条任务的内容。

### 根因范围

`TaskTemplateDialog.vue` 的创建态初始化依赖 `props.template` watcher：

```text
props.template 变化
  → createBlankTemplate()
```

创建弹窗关闭再打开时：

- `props.template` 仍为 `undefined`。
- watcher 没有新的依赖变化。
- `localTemplate` 保留上次保存时的对象。

`visible` watcher 目前只加载目标和 KR，没有重置创建态。

### 产品影响

- 容易误创建重复任务。
- 用户无法确定这是“新建”“复制”还是“继续编辑草稿”。
- 对包含提醒、重复、目标绑定的长表单尤其危险。

### 优化方案

明确区分三种意图：

1. **新建**：每次打开均生成全新 `createBlankTemplate()`。
2. **编辑**：从传入模板创建深拷贝，取消时不污染列表数据。
3. **复制**：由显式“复制模板”入口初始化，并清除 ID、运行状态和实例相关字段。

建议在 `visible` 从 `false → true` 时：

- `mode === 'create'`：重置为空模板。
- `mode === 'edit'`：从最新 `props.template` 深拷贝。
- 同步重置 `isValid`、section 本地状态和异步错误。

仅关闭弹窗时不要立即清空，以免退出动画期间出现空白；在下一次打开前完成初始化。

### 必需测试

- 创建并关闭后再次打开，全部字段恢复默认值。
- 取消后再次打开，不保留取消前内容。
- 编辑模板关闭再打开，显示服务端最新值。
- 复制模板保留业务配置但没有原模板 ID。

### 验收标准

- [x] “新建”永远不会静默继承上一条任务。
- [x] 只有显式“复制”操作会预填旧任务内容。
- [x] 表单测试覆盖 create/edit/copy 三种初始化语义。

## 6.3 P1：任务模板与任务实例的概念不清

### 现象

- 顶部入口叫“任务”。
- 主按钮叫“新建任务”或“新建任务模板”。
- 弹窗标题是“创建任务模板”。
- 保存后先生成模板卡片，再异步生成今日任务实例。
- 用户在首次创建前看不到“模板”和“实例”的关系说明。

### 产品影响

用户无法预判：

- 创建的是一次性待办还是可重复规则。
- 今天是否会自动出现一个可完成的任务。
- 编辑模板是否会修改已经生成的实例。
- 删除模板是否会删除历史完成记录。

### 产品模型决策

已确认采用面向用户的产品语言，代码领域名保持不变：

| 领域对象     | 用户可见名称 | 说明                                 |
| ------------ | ------------ | ------------------------------------ |
| TaskTemplate | 任务计划     | 定义标题、时间、重复、提醒和目标关联 |
| TaskInstance | 待办任务     | 某一天真正执行、完成或跳过的任务     |

补充约定：

- “快速任务”：面向简单、一次性或低配置成本的创建入口。
- “今日任务”：实例日期为今天的待办任务集合。
- “待办任务”：不限定日期时对 TaskInstance 的通用用户称呼。
- `TaskTemplate`、`TaskInstance` 仅用于代码、接口、日志和工程文档，不直接暴露
  给普通用户。

### 优化方案

1. 首页和任务面板提供“快速任务”主入口，降低简单待办创建成本。
2. “任务计划”作为重复或高级配置入口。
3. 创建成功反馈明确说明结果：
   - “已创建任务，并加入今天的待办。”
   - “已创建任务计划，首个待办任务将在 7 月 30 日生成。”
4. 编辑模板时说明影响范围：
   - 默认同步当前时刻之后所有尚未开始的待办任务。
   - 进行中和历史待办不受影响。
5. 删除操作分别表达“停用模板”“删除未来计划”“删除单个今日任务”。

已确认编辑传播规则：

- 更新任务计划时同步所有 `Pending` 且 `instanceDate >= effectiveFrom` 的待办任务。
- `InProgress`、`Completed`、`Skipped`、`Expired` 和历史记录保持不变。
- 标题、描述、优先级等属性更新现有 Pending 实例的投影。
- 时间或重复规则变化时，删除并重新生成受影响的 Pending 实例。
- 保存前展示“将更新 N 个尚未开始的待办任务”；没有受影响实例时不显示空确认。
- Prisma 与 PowerSync 必须使用相同事务边界，不能只更新模板后异步补救。

### 验收标准

- [x] 首次用户无需理解数据库模型即可创建一个今天要做的待办。
- [x] 模板卡片和今日任务卡片的名称、状态与操作明显不同。
- [x] 创建、编辑、停用和删除均说明影响范围。

## 6.4 P1：完成状态与完成率反馈不一致

### 现象

完成今日任务后：

- 今日概览显示 `1/1` 和“已完成”。
- 同一视图中的任务模板卡片仍显示“进行中”和“完成率 0%”。

### 已确认的业务规则

任务计划卡片采用“最近 30 天已到期实例完成率”：

```text
最近 30 天  8/10 · 80%
```

统计规则：

- 时间窗口为滚动最近 30 天。
- 只统计 `instanceDate <= now` 的已到期实例，未来预生成实例不进入分母。
- 已完成实例进入分子。
- 已到期但未完成、已跳过和已过期实例进入分母。
- 只生成一次待办的任务计划不显示完成率，只显示对应待办任务的最终状态。
- 没有已到期实例时显示“暂无执行记录”，不显示误导性的 `0%`。

“进行中”只表示模板仍启用，但用户会自然理解为任务未完成，因此仍需改为
“已启用 / 已暂停 / 已结束”。

### 优化方案

- 将模板运行状态命名为“已启用 / 已暂停 / 已结束”，不要使用“进行中”。
- 将实例完成状态保留为“待完成 / 已完成 / 已跳过 / 已过期”。
- 完成率固定显示统计范围和分子/分母，例如“最近 30 天 8/10 · 80%”。
- 完成任务后，统一刷新或乐观更新：
  - 今日概览。
  - 待办任务列表。
  - 模板统计。
  - 关联目标/KR 进度。
- 如果同步存在延迟，显示“正在同步进度”，不要长时间展示冲突状态。

### 验收标准

- [x] 同一时刻不存在互相矛盾的“已完成”和“完成率 0%”。
- [x] 模板启用状态与实例完成状态使用不同词汇和视觉标识。
- [x] 完成率旁明确显示统计范围。

## 6.5 P1：未配置模型时，AI 首屏成为阻塞性空态

### 现象

新用户完成注册后进入“快速对话”，但没有配置模型时：

- 输入框不可用。
- 意图入口和发送按钮不可用。
- 页面只提供“去配置模型”。
- 目标和任务仍可通过顶部图标访问，但对首次用户不明显。

### 产品影响

MemoFlow 的首屏承诺是 AI 工作区，但本地部署和新账号默认没有模型。用户第一次进入产品就面对不可操作的主区域，容易判断产品不可用。

### 优化方案

采用“AI 可选增强，而非入口门禁”的 onboarding：

1. 首屏明确展示两个并列路径：
   - 配置 AI，获得对话式规划能力。
   - 暂不配置，直接创建目标或今日任务。
2. 提供三步引导：
   - 创建第一个目标。
   - 添加一个今天要做的任务。
   - 可选配置 AI Provider。
3. AI 快捷卡在无模型时不应进入失败流程；点击后展示配置说明或 Provider 选择。
4. 本地部署文档提供最短 Provider 配置说明，但产品 UI 不假设用户已阅读部署文档。

### 验收标准

- [x] 未配置模型的新用户在 30 秒内可以创建目标或今日任务。
- [x] 所有禁用 AI 操作都能说明原因和下一步。
- [x] 配置模型是增强路径，不阻断基础目标与任务管理。

## 6.6 P2：模块胶囊需要二次点击“进入”

### 现象

点击“目标”或“任务”胶囊后先打开预览浮层，用户还需要点击“进入”才能打开业务面板。

相关结构：

- `packages/app-vue/src/layouts/shell/WindowHeader.vue`
- `packages/app-vue/src/layouts/shell/useShellRouterSync.ts`

### 产品影响

- 高频模块进入路径多一步。
- 图标本身看起来像导航，却实际是预览触发器。
- 新用户不一定理解预览和完整面板的区别。

### 优化方案

已确认采用以下规则：

- 单击模块胶囊：直接打开或激活业务面板。
- 胶囊上的计数/状态区域或独立小箭头：打开快速预览。
- 已打开模块再次点击：激活，而不是重复创建 tab。
- 提供 tooltip 和稳定的可访问名称，例如“任务，1 个待办”。

不保留当前主点击先预览的两步模式。

### 验收标准

- [x] 从首页进入目标或任务完整面板只需一次主点击。
- [x] 预览与导航具有不同的视觉和无障碍语义。
- [x] 有数量徽标时按钮名称仍包含模块名。

## 6.7 P2：目标创建流程的术语与信息层级

### 发现

- 开始和结束日期主要依靠当前值表达，缺少稳定可见的“开始 / 结束”标签。
- 新建 KR 使用叠加在目标弹窗上的第二个 modal，认知负担较高。
- 中文界面曾显示 `Incremental`。
- “权重 (1–5) 1”表达机械，缺少权重用途说明。
- 目标卡片右侧“完成”语义不明确，可能被理解为状态或动作。

### 优化方案

1. 时间线明确显示“开始日期”和“目标日期”。
2. 第一个 KR 使用目标弹窗内联创建；复杂配置再进入展开面板。
3. 值类型使用用户语言：
   - 累积值。
   - 百分比。
   - 是/否。
   - 里程碑。
4. 权重改为“对目标进度的影响”，提供低/中/高预设；数值作为高级选项。
5. 目标卡片状态使用“未开始 / 进行中 / 已完成 / 已暂停”；动作使用按钮样式和动词，如“记录进度”。

### 验收标准

- [x] 中文界面不出现裸枚举值。
- [x] 所有日期字段有永久可见标签。
- [x] 状态文本与可点击动作在视觉上可区分。
- [x] 用户可以不离开目标主弹窗完成一个基础 KR。

## 6.8 P2：任务表单信息密度过高且视觉语言不一致

### 发现

- 1280 × 720 下只能看到基础信息和部分时间设置。
- 重复、提醒、KR 关联、父任务、颜色和标签均需长距离滚动。
- 任务弹窗使用多张 section card、彩色图标和 emoji，目标弹窗则更简洁。
- 高级字段与首次创建的必要字段处于同一视觉优先级。

### 优化方案

将创建任务拆为渐进披露：

**第一层：快速创建**

- 标题。
- 日期/时间。
- 是否重复。
- 目标/KR 可选关联。
- 保存。

**第二层：高级设置**

- 复杂重复规则。
- 多个提醒。
- 父任务和依赖。
- 颜色、标签和其他元数据。

布局决策：

- 桌面宽屏使用两列，但保持阅读顺序。
- 小视口使用单列和 sticky footer。
- 保存/取消按钮始终可见。
- 移除无业务含义的 emoji，统一使用设计系统图标。
- 目标和任务弹窗共享标题、section、footer、错误提示和间距规范。

### 验收标准

- [x] 1280 × 720 下无需滚动即可完成快速任务创建。
- [x] 高级设置默认收起，但能明确发现。
- [x] 保存按钮始终可见。
- [x] 目标与任务弹窗使用统一的布局和视觉 token。

## 6.9 P2：表单控件无障碍名称不完整

### 发现

DOM 审查中，任务表单至少三个 switch 没有可访问名称；目标和 KR 下拉字段也未稳定关联 label。

### 产品影响

- 读屏用户无法理解控件用途。
- 键盘操作和自动化测试定位不稳定。
- 视觉文字存在不代表控件具备可访问名称。

### 优化方案

- 每个 Switch 使用唯一 `id`，对应 `<Label for>`。
- Select trigger 使用 `aria-labelledby` 或稳定的可访问 label。
- 计数徽标作为描述，不覆盖模块按钮名称。
- 错误信息通过 `aria-describedby` 关联字段。
- 弹窗打开后聚焦标题或第一个可编辑字段；关闭后将焦点返回触发按钮。
- 将 axe 或等价规则加入关键表单组件测试和 PM journey。

### 验收标准

- [x] 关键表单在 axe 自动扫描中无 serious/critical 问题。
- [x] 仅使用键盘可以完成目标和任务创建。
- [x] 所有 switch、combobox、日期和数值输入都有稳定名称。
- [x] 弹窗关闭后焦点回到“新建”按钮。

## 6.10 P1：缺少 Toggle Side Panel 与右侧面板空闲起始页

### 现象

参考 ChatGPT/Codex 桌面端，工作区顶栏右侧应存在独立的 Toggle Side Panel
按钮。当前 MemoFlow：

- `WindowHeader.vue` 只提供左侧栏折叠按钮，没有 `PanelRight` /
  `PanelRightClose` 控件。
- 业务面板只有打开目标、任务等业务 Tab 后才出现。
- 没有业务 Tab 时，用户无法主动打开一个稳定的右侧面板。
- `AIContextPanel.vue` 明确记录“空闲态右栏不再渲染”，只在存在工作流上下文时
  挂载。

因此该能力不是单纯漏画图标，而是在此前 V2 调整中连同空闲右栏状态一起被
移除了。

### 产品目标

右侧面板应成为与左侧栏对称、可独立控制的工作区容器：

```text
左侧栏：会话和账户导航
中央区：AI 对话
右侧面板：今日概览 / 业务 Tab / 工作流上下文
```

建议右侧面板在没有业务 Tab 时显示“今日概览”起始页：

- 今日待办。
- 今日剩余提醒。
- 活跃目标进度。
- 后续可增加今日计划、风险提示和快速创建入口。

打开目标、任务等模块后，右侧面板切换为业务 Tab；关闭最后一个业务 Tab 时，
应回到“今日概览”而不是让右侧面板能力消失。用户仍可通过顶栏 Toggle 明确
关闭整个右侧面板。

已确认：今日概览是右侧面板在 `activeTabId === null` 时显示的 Home surface，
不是 BusinessTab，也不占用 Tab 上限。关闭最后一个业务 Tab 回到 Home；
只有 Toggle Side Panel 负责隐藏整个右侧面板。

### 当前代码范围

- `packages/app-vue/src/layouts/shell/WindowHeader.vue`
  - 增加右侧面板 Toggle，使用稳定 tooltip、aria-label 和 testid。
- `packages/app-vue/src/layouts/shell/useAppShellStore.ts`
  - 将 `rightPanelOpen` 与 `tabs` 分离；“无 Tab”不再等同于“右侧面板关闭”。
  - 明确默认值与持久化策略。
- `packages/app-vue/src/layouts/shell/AppShell.vue`
  - `showPanel` 由显式开关决定。
  - 没有活动业务 Tab 时渲染面板起始页。
- `packages/app-vue/src/layouts/shell/BusinessPanel.vue`
  - 支持 overview 与 business tabs 两类内容状态。
- `packages/app-vue/src/modules/ai/components/AIContextPanel.vue`
  - 退役独立右栏职责；工作流上下文接入壳层右侧面板唯一容器。

### 已确认交互

1. 顶栏右侧始终显示 Toggle Side Panel。
2. 首次进入工作区默认打开右侧面板并显示今日概览；用户关闭后记住偏好。
3. 点击目标、任务等模块时，必要时自动打开右侧面板并激活对应 Tab。
4. 关闭最后一个业务 Tab 后回到今日概览。
5. 再次点击 Toggle 只改变右侧面板可见性，不清空业务 Tab 和未保存状态。
6. 键盘焦点在关闭/打开后返回 Toggle 或恢复到面板内上次焦点。

以上交互已确认。后台刷新、普通通知和今日概览数据变化不能擅自打开用户已经
关闭的面板；只有用户显式模块导航或需要立即处理的审批上下文可以打开。

### 必需测试

- Store：`rightPanelOpen` 与 `tabs` 可独立变化。
- Shell：无业务 Tab 时打开右侧面板，显示今日概览。
- Shell：关闭最后一个业务 Tab，保留右侧面板并回到概览。
- Shell：Toggle 关闭再打开，业务 Tab 和路由状态仍保留。
- Shell：刷新后按照已确定的持久化规则恢复。
- 可访问性：Toggle 具备“打开/关闭右侧面板”的动态名称和正确 `aria-pressed`
  或等价状态。

### 验收标准

- [x] 顶栏存在稳定、可键盘操作的 Toggle Side Panel。
- [x] 无业务 Tab 时右侧面板有可用起始页，而不是空白。
- [x] 面板隐藏不会销毁业务 Tab、表单草稿或工作流上下文。
- [x] 左侧栏、中央 AI 和右侧面板可以独立组合。

## 6.11 P1：今日概览错误占据 AI 对话初始页

### 现象

当前 `AIChatView.vue` 在空会话且无工作流上下文时设置
`todayOverviewVisible = true`，并把以下组件通过 `AIMessagePanel` slot 渲染在
对话欢迎页：

- `DailyTodoWidget`
- `UpcomingRemindersWidget`
- `GoalProgressWidget`

`AIMessagePanel.vue` 还保留 `ai-today-overview` 专用区域和对应测试。该布局造成：

- 对话欢迎页纵向过长，Composer 被推到更低位置。
- AI 初始意图和日常执行信息争夺同一视觉中心。
- 今日概览只能在空会话出现，一旦开始对话就消失，不能作为稳定工作区。
- 与恢复右侧面板的产品方向重复。

### 优化方案

1. 从 `AIMessagePanel` 删除 `showTodayOverview` prop、slot 和渲染区域。
2. 从 `AIChatView` 删除 `todayOverviewVisible` 及对应 dashboard 拉取 watch。
3. 将三个 widget 组合为独立的右侧面板起始页组件，例如
   `TodayOverviewPanel.vue`。
4. Dashboard 数据加载由起始页自身负责，并在任务完成、提醒变化和目标更新后
   做统一失效刷新。
5. AI 欢迎页只保留：
   - 一句明确的能力说明。
   - 少量高价值对话/创建入口。
   - Composer。
6. 今日概览在有无模型、有无历史消息时都能通过右侧面板访问。

### 验收标准

- [x] AI 对话初始页不再渲染今日待办、提醒和目标进度卡片。
- [x] 今日概览完整迁移到右侧面板起始页。
- [x] 开始对话后今日概览不会消失。
- [x] 1280 × 720 下欢迎页与 Composer 保持紧凑、对齐。

## 6.12 P1：业务面板专注模式强制覆盖左侧栏

### 现象

`AppShell.vue` 当前定义：

```text
showSidebar = shellState !== 'focus' && !sidebarCollapsed
```

因此点击业务面板的 Maximize/Focus 后，不论用户是否主动展开左侧栏，左侧栏都
会被强制隐藏。退出 Focus 后才恢复。

这让右侧面板状态越权修改了左侧栏状态，不符合 ChatGPT/Codex 桌面端中左右
面板独立控制的心智。

### 目标状态

- 左侧栏是否显示只由 `sidebarCollapsed` 决定。
- 右侧面板是否显示只由 `rightPanelOpen` 决定。
- 业务面板是否专注只由 `layout` 决定。
- 专注表示“隐藏中央 AI 列，让业务面板占满剩余工作区”，不是“覆盖整个应用
  并关闭左侧栏”。

布局关系：

```text
左侧栏展开 + 业务专注
  = 左侧栏 + 业务面板占满剩余空间

左侧栏折叠 + 业务专注
  = 业务面板占满整个工作区
```

### 优化方案

1. 将 `showSidebar` 改为只依赖 `!sidebarCollapsed`。
2. Focus 时只隐藏 AI column，不修改或派生左侧栏折叠状态。
3. `workspaceMainWidth`、浮动 Composer 和面板宽度计算使用左侧栏之后的剩余
   工作区，不重复扣减宽度。
4. 视口过窄时可以自动进入业务 focus，但不能自动折叠左侧栏；若三栏无法同时
   容纳，应隐藏中央 AI，而不是覆盖用户的左栏偏好。
5. 左栏和右栏偏好分别持久化。

### 必需测试

- 左栏展开时进入/退出 focus，左栏始终存在。
- 左栏折叠时进入/退出 focus，左栏始终折叠。
- Focus 只改变 AI column 与业务面板宽度。
- 窄视口自动 focus 后恢复宽度，不改变左栏偏好。
- 刷新后左右栏与 focus 状态按各自偏好恢复。

### 验收标准

- [x] 点击业务面板全屏/专注不会改变左侧栏显示状态。
- [x] 左右面板 Toggle 互不覆盖、互不清空状态。
- [x] 业务面板在剩余工作区内正确铺满，无横向溢出。

## 6.13 P1：未配置模型提示仍残留在 Web/Desktop 共享 Composer

### 现象与代码事实

中文文案仍存在于：

```text
packages/app-vue/src/locales/zh-CN/aiAssistant.ts
  emptyModelsHint = 尚未配置可用模型。请先在设置中接入 AI 服务商。
```

`AIFooterComposer.vue` 在 `modelGroups.length === 0` 时同时渲染：

- 带警告图标的“去配置模型”按钮。
- 独立一行 `emptyModelsHint`。

`app-vue` 同时被 Web 和 Desktop 消费，因此这不是“Web 已删除、Desktop 独有”
的两套源码。若两端表现不同，应检查：

- 是否运行了不同 revision/build。
- Desktop 是否仍在使用旧 Vite/Electron 进程。
- Composer density 是否让 Web 隐藏了文字，而 Desktop 进入了
  comfortable/compact 分支。
- 静态资源或 KeepAlive 是否保留旧组件。

### 优化方案

1. 删除 Composer 底部常驻的 `emptyModelsHint` 文本行。
2. 无模型时保留一个尺寸与模型选择器一致的紧凑入口，不使用整行黄色警告。
3. 入口文案优先使用“配置 AI”，详细原因放入 tooltip、Popover 或设置引导。
4. Composer 保持稳定高度，不能因有无模型出现额外一行导致整体跳动。
5. Web/Desktop 使用同一组件测试和视觉快照，不建立平台分叉。
6. 与 6.5 的 onboarding 区分：
   - 欢迎态负责解释“AI 可选增强”和基础业务入口。
   - Composer 只负责紧凑展示当前不可发送状态及配置入口。

### 验收标准

- [x] Web/Desktop 均不再显示“尚未配置可用模型。请先在设置中接入 AI 服务商。”
- [x] 无模型 Composer 不增加额外高度，不破坏按钮、选择器和发送按钮对齐。
- [x] 用户仍能发现配置 AI 的入口。
- [x] Web/Desktop 对相同模型状态渲染一致。

## 7. 已确认的目标体验设计

## 7.1 新用户主旅程

```text
注册并进入工作区
  ├─ 有 AI 模型
  │    → 对话澄清目标
  │    → 审阅结构化目标/KR
  │    → 生成首个任务
  └─ 无 AI 模型
       → 创建第一个目标
       → 添加一个今日任务
       → 可选配置 AI

完成今日任务
  → 今日概览立即更新
  → 模板统计更新
  → 关联 KR 更新
  → 目标进度更新
  → 显示一次统一成功反馈
```

## 7.2 任务创建信息架构

### 快速任务

适合大多数即时输入：

- 做什么。
- 什么时候做。
- 是否加入某个目标。

### 任务计划

适合重复和复杂工作：

- 重复规则。
- 提醒策略。
- 依赖和父任务。
- 目标/KR 回写规则。
- 高级属性。

### 今日任务

只负责执行：

- 完成。
- 跳过。
- 延期。
- 记录结果。
- 查看它来自哪个任务计划和目标。

## 7.3 状态语言规范

| 对象     | 已确认状态                             |
| -------- | -------------------------------------- |
| 目标     | 未开始、进行中、已完成、已暂停、已放弃 |
| 关键结果 | 未开始、推进中、已达成、存在风险       |
| 任务计划 | 已启用、已暂停、已结束                 |
| 今日任务 | 待完成、已完成、已跳过、已过期         |
| 同步     | 正在同步、同步完成、同步失败           |

禁止使用同一个“进行中”同时表达模板启用和实例未完成。

## 8. 实施计划

## 8.1 Phase A：恢复目标—任务核心闭环（P0）

### A1. 固化崩溃回归

- 在 `KeyResultLinksSection` 组件测试中复现 `null.focus`。
- 捕获完整浏览器堆栈，确认 UI 库内部触发点。
- 加入目标有 KR、无 KR、请求失败和快速切换四类 fixture。

### A2. 收敛 KR 异步加载所有权

- 在 dialog/composable/section 三者中确定唯一加载所有者。
- 引入过期请求保护。
- 保持 Select trigger 生命周期稳定。
- 将错误限制在关联 section 内。

### A3. 完成端到端闭环

- 创建目标和 KR。
- 创建绑定任务。
- 生成今日实例。
- 完成实例。
- 断言 KR 与目标进度更新。

### Phase A 出口

- [x] P0 崩溃不可复现。
- [x] 绑定任务可保存、可执行、可回写。
- [x] 错误和空态不会导致表单数据丢失。

### Phase A 实施证据（2026-07-30）

实现：

- `useTaskGoalBindingOptions` 成为目标/KR 选项的唯一异步加载所有者；通过请求代次
  保护丢弃过期结果，并将 loading/error/empty 状态限定在关联 section 内。
- `KeyResultLinksSection` 保持 Select trigger 生命周期稳定；目标有 KR、无 KR、请求
  失败、快速切换和连续 20 次关闭/开启关联均有组件或 Docker E2E 回归。
- 任务卡片和详情通过共享组合式函数解析并展示真实目标与 KR 名称。
- GoalRecord 保存任务来源 correlation；Prisma、PowerSync 与领域仓储共同实施唯一性，
  `PER_INSTANCE` 重复完成不重复贡献，有限任务计划整体完成只贡献一次。
- 完成、撤销、再次完成已贯通共享 application client、HTTP、Electron IPC 和领域事件；
  重复完成按幂等成功处理，不保存实例、不读取模板、不重发事件，非法状态转换仍拒绝。
- 未配置 GitHub App 时，知识笔记只读列表返回正常空态 `200 { notes: [] }`；写入和连接
  能力仍保持不可用。这样正常空态不再给 Phase A 浏览器旅程制造无关的 `503` 错误。

代码事实差异：

- 原计划只要求“完成实例并回写”。实际产品允许重复 HTTP/IPC 提交，因此补充了幂等
  完成、精确撤销和再次完成链路，避免网络重试导致 KR 重复累计。
- Docker 旅程发现未配置 GitHub App 的知识笔记空列表会产生常驻 `503`。该请求与
  目标任务闭环无关，但属于正常首页空态，已在只读边界返回空列表；没有伪造写能力。

自动验证：

- `pnpm nx run-many -t lint,typecheck --projects=task,goal,repository,api,powersync-schema,contracts,database,app-vue,web --parallel=1 --outputStyle=static`：
  47 个目标通过；Web 保留 2 条既有非阻断 lint warning。
- `pnpm nx run-many -t test --projects=task,goal,repository,api,powersync-schema,contracts,database,app-vue,web --parallel=1 --outputStyle=static`：
  9 个项目通过；已打印项目合计 2,896 项测试通过。
- `pnpm nx run api:test:smoke --outputStyle=static`：2 个文件、61 项通过。
- `pnpm nx run-many -t build --projects=task,goal,repository,api,powersync-schema,contracts,database,app-vue,web --parallel=1 --outputStyle=static`：
  9 个项目及其 21 个依赖目标通过。
- `pnpm nx run web:e2e:local-docker`：1 项完整产品旅程通过（41.9 秒）。

Docker 与产品旅程证据：

- 本机六个服务均为 healthy；Web/API/AI/PowerSync/PostgreSQL/Redis 端口分别为
  `58080`/`53080`/`58100`/`58081`/`55432`/`56379`。
- Nginx 日志确认注册、创建目标/KR/绑定任务、读取详情、完成、撤销和再次完成请求
  进入当前本机 Docker，而非 SSH 转发实例。
- E2E 创建两个目标与 KR 后连续 20 次切换关联，标题和描述不丢失且无 `null.focus`；
  卡片与详情显示真实名称。
- 同一实例的 KR/GoalRecord 断言依次为 `1/1`、重复完成后 `1/1`、撤销后 `0/0`、
  再次完成后 `1/1`；全程无 page error 或 console error。
- 本次证据对象：Goal `IGoalId_2b55a5a2-64e5-4ddd-b25b-1d4735f29c87`，
  TaskTemplate `ITaskTemplateId_27bfa91d-82ad-47e3-8d38-39b691fc9a50`，
  TaskInstance `ITaskInstanceId_c8d6548e-a0a5-4235-a846-1f8d45e28474`。

## 8.2 Phase B：修复任务创建状态和产品模型（P1）

### B1. 表单生命周期

- 新建、编辑、复制使用独立初始化函数。
- 弹窗每次打开按 mode 初始化。
- 深拷贝嵌套设置，避免编辑污染。
- 补齐取消、重开和连续创建测试。

### B2. 任务术语和入口

- 按已确认映射统一“任务计划 / 待办任务 / 今日任务 / 快速任务”。
- 提供快速任务入口。
- 创建成功反馈说明实例生成时间。
- 编辑和删除说明影响范围。

### B3. 状态投影一致性

- 定义模板完成率统计口径。
- 完成实例后统一刷新相关 query/store。
- 为目标/KR 回写提供可观察状态。

### Phase B 出口

- [x] 连续新建不会继承旧数据。
- [x] 新用户能解释模板与实例的区别。
- [x] 首页、任务卡片和目标进度状态一致。

### Phase B 实施证据（2026-07-30）

实现：

- `TaskTemplateDialog` 按 create/edit/copy 意图重新初始化完整表单；取消、保存和切换
  意图会结束当前弹窗草稿，嵌套 tags、提醒、重复规则和绑定对象逐层解除 Vue Proxy 后
  深拷贝，复制真实卡片数据不再触发 `structuredClone` 崩溃，也不会反向污染源计划。
- “快速任务”成为任务页唯一主操作，使用独立紧凑弹窗创建今天、全天、一次性、
  `Moderate` 的待办；“新建任务计划”保留为次级完整入口，卡片提供显式复制入口。
- 用户界面统一使用“任务计划 / 待办任务 / 今日任务 / 快速任务”；创建反馈说明是否
  已加入今日待办，编辑前显示会影响多少个未来尚未开始的待办任务。
- canonical `TaskTemplateDTO` 增加最近 30 天已到期实例的 completed/due/percentage 投影；
  重复计划显示“最近 30 天 1/1 · 100%”等分子、分母和百分比，一次性计划只显示
  唯一待办状态，避免“已完成 / 0%”冲突。
- 完成、撤销、开始和跳过实例后按 `templateId` 精确刷新任务计划 store；卡片、详情和
  今日任务复用实例状态语言，目标/KR 回写继续沿用 Phase A 的幂等刷新链路。
- 编辑任务计划只传播到严格晚于保存时刻的 `Pending` 实例；当前日、`InProgress` 和
  历史实例不变。模板更新、未来 Pending 更新和必要的实例重建在 Prisma/PowerSync
  共用事务边界中执行，Prisma 集成测试覆盖中途失败整体回滚。
- 实例生成策略拒绝同一计划同一日的重复实例；`forceGenerate` 回归使用独立聚合夹具，
  与真实调用方“先清理、再强制生成”的契约一致。

代码事实差异：

- 计划曾建议把实例展示字段写入独立投影。当前领域模型以 `TaskTemplate` 作为标题、
  描述等定义信息的唯一真值，实例通过模板关系实时读取；本轮没有冗余复制字段，避免
  编辑传播产生第二套事实来源。
- “编辑只传播未来 Pending”不能仅在 UI 刷新完成；现有写模型同时支持 Prisma 和
  PowerSync，因此传播规则下沉到 application use case，并为两种仓储提供同一事务
  runner，而不是增加平台特判。
- 原有 `forceGenerate` 测试在同一可变聚合上先普通生成再强制生成，和新增同日去重规则
  冲突；测试改为隔离两个聚合，仍断言普通与强制路径均真实生成，没有放宽业务断言。

自动验证：

- `pnpm nx run-many -t lint,typecheck,test,build --projects=contracts,task,app-vue,app-react,web --parallel=3 --outputStyle=static`：
  5 个项目及 22 个依赖目标全部通过；lint 仅保留仓库既有非阻断 warning。
- `pnpm nx run task:test:integration`：4 个文件、22 项通过，包含模板与未来 Pending
  原子更新、失败回滚和 Prisma 查询边界。
- `pnpm nx run api:test:smoke`：2 个文件、61 项通过。
- `pnpm nx run memoflow:governance-check`：通过。
- `pnpm nx run web:e2e:local-docker -- --grep "Local Docker core product Phase B"`：
  1 项真实产品旅程通过（21.0 秒），无 page error 或 console error。

Docker 与产品旅程证据：

- `pnpm docker:local:up` 重新构建 Web/API/AI 镜像并成功部署；Web、API、AI、
  PowerSync、PostgreSQL、Redis 六个服务均 healthy，端口分别为
  `58080`/`53080`/`58100`/`58081`/`55432`/`56379`。
- 浏览器使用新注册账号进入 `http://127.0.0.1:58080/tasks`；Nginx 日志记录来自该
  Web origin 的任务计划创建、复制、实例完成/撤销、模板查询和 dashboard 请求，证明
  旅程进入本机 Docker API `53080`，不是 SSH 转发或其他实例。
- 在 1280 × 720 中验证：取消后重开为空、连续创建为空、复制保留源值但不修改源计划、
  快速任务弹窗完整落在视口内、创建后立即进入今日待办。
- 快速任务在今日任务完成/撤销后，任务卡片分别投影“已完成”/“待完成”；重复计划完成/
  撤销后完成率分别投影“最近 30 天 1/1 · 100%”/“最近 30 天 0/1 · 0%”。
- 编辑有限重复计划时，保存前展示受影响数量；保存后仅未来 Pending 从 `Moderate`
  更新为 `Important`，当前日 Pending 与未来 `InProgress` 均保持原值和原状态。

## 8.3 Phase C：优化首页和导航（P1/P2）

### C1. 建立左右面板独立状态模型

- 在 store 中分离 `sidebarCollapsed`、`rightPanelOpen` 和 `layout`。
- 顶栏增加 Toggle Side Panel。
- Focus 只隐藏 AI column，不再强制隐藏左侧栏。
- 落实已确认的默认打开、偏好持久化和关闭最后 Tab 回 Home。
- 定义统一的面板脏状态契约，供关闭、切 Tab 和工作流自动切换共同使用。

### C2. 迁移今日概览

- 新建右侧面板空闲起始页。
- 把今日待办、提醒和目标进度从 AI 欢迎页迁入起始页。
- 统一三个 widget 的刷新边界和空态高度。
- 删除 `AIMessagePanel` 的 today overview slot/test contract。

### C3. 无模型 onboarding 与 Composer

- 无模型时展示“配置 AI”和“直接开始”两条路径。
- 增加第一个目标和今日任务引导。
- 禁用项提供原因和下一步。
- 删除 Composer 中常驻的冗长未配置模型提示。
- 保留紧凑、稳定高度的配置入口。

### C4. 模块胶囊

- 主点击直接进入业务面板。
- 预览使用独立命中区域。
- 修复数量徽标覆盖可访问名称。

### Phase C 出口

- [x] 顶栏可独立开关右侧面板。
- [x] 业务 focus 不改变左侧栏状态。
- [x] 今日概览只存在于右侧面板起始页。
- [x] Web/Desktop 的无模型 Composer 一致且整齐。
- [x] 无模型用户可以顺畅使用基础产品。
- [x] 进入目标/任务只需一次主点击。
- [x] 模块导航在键盘和读屏下可区分。

### Phase C 实施证据（2026-07-30）

实现：

- 壳层 store 独立持有 `sidebarCollapsed`、`rightPanelOpen`、`panelSurface`、
  `layout` 和 `surfaceStatus`；右侧面板首次默认打开，用户显式关闭偏好跨重启保存，
  关闭最后一个业务 Tab 回到 Home，模块主点击和深链会重新打开面板。
- Focus 只隐藏中央 AI 列，左侧栏继续响应自己的 Toggle，AI 与 Composer 实例通过
  `v-show`/Teleport 保活；工作流复用唯一右侧容器，自动切换只发生在已打开且 clean
  的 surface，隐藏、dirty 或 busy 时保留上下文并显示提醒。
- 今日待办、提醒和目标进度迁入右侧 Home，AI 欢迎页删除重复概览；无模型欢迎页提供
  “配置 AI / 创建第一个目标 / 添加今日任务”，Composer 只保留固定高度的紧凑入口。
- 模块胶囊把导航和预览拆成两个独立命中区域，主点击直接进入模块；数量进入稳定的
  `aria-label`，预览按钮提供 `aria-expanded`/`aria-controls`。
- 目标、快速任务和任务计划弹窗显式发布 clean/dirty/busy 契约。真实深链复测发现
  `GoalDialog` 初始即为 open 时没有捕获草稿基线；watcher 改为 immediate，并增加
  组件回归测试，首次挂载输入现在也会发布 dirty，隐藏/重开面板后草稿仍在。

代码事实差异：

- 目标和任务表单仍是全局 modal；遮罩按可访问模态语义阻止后台指针输入。Phase C
  Docker 用例直接向壳层关闭/Toggle 控件派发事件来验证跨 surface 的 dirty 确认和
  DOM 保活，不把后台按钮伪装为可点击 UI。普通用户的弹窗关闭、焦点进入/返回和
  键盘旅程在 Phase D 通过前台控件与 axe 单独验证。
- 无图形会话的 Linux 宿主首次启动 Electron 报 `Missing X server or $DISPLAY`；确认
  系统已有 Xvfb 后使用 `xvfb-run -a` 重跑，Desktop 应用真实启动并通过完整矩阵，
  该失败归类为宿主环境而非产品代码。

自动验证：

- `pnpm nx run app-vue:test`：153 个文件、934 项通过，包含新增的深链初始打开
  `GoalDialog` 草稿基线回归。
- `pnpm nx run web:test`：16 个文件、70 项通过；`pnpm nx run desktop:test`：
  67 个文件、361 项通过。
- `pnpm nx run app-vue:typecheck`、`web:typecheck`、`desktop:typecheck`：通过。
- `pnpm nx run app-vue:build`、`web:build`、`desktop:build`：退出码 0；Web/Desktop
  仅保留既有 chunk-size warning，Vite checker 还会输出已由独立 typecheck 排除的
  workspace `rootDir` 诊断，Phase E 将在最终报告中按工具噪声分类。
- `pnpm nx run app-vue:lint`、`web:lint`、`desktop:lint`：0 error，仅既有 warning；
  `pnpm nx run memoflow:governance-check` 与 `git diff --check` 通过。
- `pnpm nx run web:e2e:local-docker -- --grep "Local Docker core product Phase C"`：
  1 项通过（10.6 秒），覆盖 Home、持久化、无模型、导航、dirty 草稿、Focus 和深链。
- `xvfb-run -a pnpm nx run web:e2e:shell`：8 项 Electron 矩阵全部通过（45.9 秒）。

Docker 与产品旅程证据：

- `pnpm docker:local:up` 重新构建并部署；Web、API、AI、PowerSync、PostgreSQL、Redis
  六个服务均 healthy，端口来自运行时 SSOT：`58080`/`53080`/`58100`/`58081`/
  `55432`/`56379`，`.env.local` 不存在且未硬编码测试端口。
- Web/API 探针分别返回 200；Nginx 日志记录宿主 `curl` 和 Playwright 页面请求，三个
  新镜像 revision 均为 `8f1b356545a6c4b62057525dc52584a511934a51-dirty`。
- Electron 截图矩阵覆盖 900×600、1024×768、1200×800 和 1440×900；检查确认
  split/focus、侧栏、右面板、Composer、工具栏无重叠、横向溢出或异常空白。

## 8.4 Phase D：统一表单设计与无障碍（P2）

### D1. 表单设计系统

- 提炼目标/任务共享 Dialog shell。
- 统一 section 标题、间距、错误、loading 和 footer。
- 任务表单实施渐进披露。
- 保存按钮使用 sticky footer。

### D2. 术语和 i18n

- 清除 `Incremental` 等裸枚举。
- 日期、权重、完成率使用用户语言。
- 对状态和动作建立文案表。

### D3. 无障碍

- 完善 label/aria。
- 校验焦点进入和返回。
- 补充键盘和 axe 回归。

### Phase D 出口

- [x] 1280 × 720 下快速创建无需滚动。
- [x] 目标和任务弹窗视觉语言一致。
- [x] 核心创建旅程无 serious/critical 无障碍问题。

### Phase D 实施证据（2026-07-31）

实现：

- 新增共享 `ProductDialogShell`，目标、关键结果、快速任务和任务计划弹窗统一标题、
  描述、宽度、内容滚动区、sticky footer、错误呈现、间距和焦点契约；Web/Desktop
  继续复用同一套 `app-vue` 实现，没有平台分叉。
- 任务计划把提醒、组织信息和依赖收进默认折叠的高级设置；快速任务保留标题与日期的
  低配置路径。目标弹窗可在关键结果页内联创建第一个基础 KR，无需叠加第二个 modal。
- 日期字段使用永久可见的“开始日期 / 目标日期”标签；KR 类型、目标影响、目标类别、
  对话标题和成功动作均使用中英文 i18n 产品语言，不再直接显示裸枚举。
- 所有本轮触及的 switch、combobox、日期和数字字段补齐稳定 label/aria 关联；弹窗打开
  后聚焦声明的首个字段，关闭后返回原触发按钮。Radix FocusScope 在 tabbed form 中会先
  聚焦容器，因此 shell 同时监听既有 open 状态，在 DOM 刷新后的 animation frame 执行
  初始聚焦，并保留 `openAutoFocus` 作为标准路径。
- axe 4.12 发现旧 `radix-vue` RadioGroup 会在表单内把隐藏原生 radio 嵌进
  `button[role=radio]`。共享 RadioGroup 改用仓库已安装的后继 `reka-ui` 实现，消除双重
  交互语义；新增组件回归锁定无嵌套控件且选择行为不变。

代码事实差异：

- 方案只要求“快速任务”在 1280 × 720 无需滚动；完整任务计划包含渐进披露后的基础
  时间配置，允许内容区受控滚动。E2E 因此对快速任务断言 `scrollHeight <= clientHeight`，
  对任务计划断言整个 dialog 与 sticky footer 始终留在视口内。
- Vite declaration checker 仍会打印仓库既有的 workspace `rootDir`/portable type 诊断，
  但独立 Nx typecheck 和所有 build target 均以退出码 0 通过；这些输出在 Phase E 最终
  报告中按工具噪声分类，不作为产品失败。

自动验证：

- `pnpm nx run app-vue:test`：155 个文件、942 项通过；新增共享 dialog focus、内联 KR、
  渐进披露、i18n 和 RadioGroup 无嵌套控件回归。
- `pnpm nx run web:test`：16 个文件、70 项通过；`pnpm nx run desktop:test`：67 个文件、
  361 项通过。
- `ui-vue-shadcn`、`app-vue`、`web`、`desktop` 的 lint、typecheck 和 build 通过；lint
  仅保留仓库既有 warning，Web/Desktop build 仅保留既有 chunk-size/tooling 输出。
- `pnpm nx run web:e2e:local-docker -- --grep "Local Docker core product Phase D"`：1 项
  真实键盘与无障碍旅程通过（22.0 秒），全程无 page error 或 console error。

Docker 与产品旅程证据：

- `pnpm docker:local:up` 重新构建并部署 Web/API/AI；六个服务均 healthy，端口来自
  local-docker 运行时 SSOT。三个本地镜像 revision 均为
  `2c0a1168693f5bc9d27bc12223c14e656e969597-dirty`。
- 1280 × 720 Chromium 中仅用键盘完成目标、首个内联 KR 和任务计划创建；快速任务弹窗
  无内部滚动，所有弹窗 footer 可见，焦点进入首字段并在保存/Escape 后返回触发按钮。
- 同一旅程对目标、快速任务和任务计划 dialog 执行 axe 扫描，无 serious/critical 问题；
  Nginx 日志记录目标、任务计划及关联查询请求来自 `http://127.0.0.1:58080`，证明浏览器
  使用当前本机 Docker Web/API，而不是 SSH 转发或其他实例。

## 8.5 Phase E：发布级 PM journey 与工程加固

- 将本轮旅程固化为可重复 e2e。
- 在运行旅程前检测 `58080` 的监听进程和容器端口映射。
- 检查运行中镜像 revision 是否等于当前 Git revision。
- 报告中区分宿主工具失败、代码失败和 Docker 部署失败。
- 测试数据使用固定前缀并提供显式清理脚本。
- 发布前在 1280 × 720、1440 × 900 和移动断点执行视觉回归。

### Phase E 出口

- [x] 同一脚本能证明浏览器请求来自当前本机容器。
- [x] PM journey 覆盖目标、KR、绑定任务、完成和进度回写。
- [x] 验证报告不会把宿主工具损坏误判为业务代码失败。

### Phase E 实施证据（2026-07-31）

实现：

- `local-docker-evidence.mjs` 统一验证当前 Git revision、容器状态、health、宿主监听者、
  Compose host/target 端口映射和 Web/API/AI 镜像 revision；`VCS_REF` 不再允许用外部值
  掩盖真实 HEAD。
- local-docker Playwright runner 在每次旅程前生成唯一浏览器 token，请求 Web 根页面并
  要求 token 出现在当前 Web Nginx 日志；机器可读 evidence 同时保存 HEAD、runtime
  比对、日志命中行和 Playwright exit code。
- validation workflow 将失败分类为 `host-tool`、`code` 或 `docker-deploy`；损坏的 Python
  虚拟环境不会再被描述为产品代码失败，任何必需门禁失败仍会阻断 `readyForPr`。
- A–D 旅程整合为同一 local-docker target；Phase E 增加已配置模型审批工作流、脏表单
  延迟切换、用户主动关闭面板和移动断点验证，覆盖 1280 × 720、1440 × 900、390 × 844。
- 测试身份统一使用 `pm-phase-*`，清理工具从身份根开始处理级联依赖，支持 preview、
  显式 `--apply` 和清理后复核；数据库凭据只在 Postgres 容器内解析，不复制到宿主参数。
- Desktop 通过共享 renderer 运行同一壳层实现；`desktop:serve-safe` 在 Xvfb 中真实启动
  Electron，shell matrix 覆盖 split、focus、设置、主题、语言和 900–1440 宽度。

代码事实差异：

- 业务 Tab 采用 KeepAlive。Phase A/B 旅程完成后不能假定 Home 自动成为活动 surface，
  测试改为显式关闭/切换业务 Tab 再检查今日概览，保持“关闭最后 Tab 回 Home”的产品
  决策，而不是为测试引入第二套可见性状态。
- Phase D 把复杂配置收进默认折叠的“高级设置”。E2E 在编辑完整任务计划前先按用户
  操作展开该 section，不把渐进披露误判为字段缺失。
- 初次 affected 验证的 `ai-service:test/typecheck` 失败来自复制的 `.venv` entrypoint
  shebang 指向旧工作区。执行锁定重装后 `182 passed`、Pyright `0 errors`；最终报告中
  `host-tool/code/docker-deploy` failure 均为 0。

自动验证：

- `pnpm nx affected -t lint,typecheck,test,build --base=main --parallel=3 --outputStyle=static`：
  37 个项目、137 个目标全部通过；133 个目标命中缓存，实际重跑目标也全部成功。
- `pnpm nx run task:test:integration`：4 个文件、22 项通过；
  `pnpm nx run api:test:smoke`：2 个文件、61 项通过。
- `pnpm nx run ai-service:test`：182 项通过；`pnpm nx run ai-service:typecheck`：
  `0 errors, 0 warnings`。
- `pnpm nx run memoflow:governance-check`、`git diff --check`：通过。
- `pnpm nx run web:e2e:local-docker`：A–E 共 7 项真实浏览器旅程通过（2.1 分钟）。
- `xvfb-run -a pnpm nx run web:e2e:shell`：Electron 壳层矩阵 8 项通过；
  `xvfb-run -a pnpm nx run desktop:serve-safe` 真实显示登录窗口并在人工停止后完成清理。

Docker、报告与数据证据：

- `pnpm runtime:preflight:local-docker` 从 profile 解析 Web/API/AI/PowerSync/Postgres/Redis
  端口 `58080`/`53080`/`58100`/`58081`/`55432`/`56379`，六个监听者均为 Docker
  published port；仓库没有 `.env.local`，测试没有硬编码本机端口。
- `pnpm docker:local:up` 与最终 validation rebuild 均成功，六服务 healthy；Web/API/AI
  镜像 revision 与验证 HEAD 精确相等，HTTP 探针全部返回 200。
- `reports/local-deploy-validation/local-docker-playwright-evidence.json` 为 `ok: true`，
  唯一浏览器 token 命中当前 Web Nginx 日志；`latest.json` 为 `verdict: pass`、
  `readyForPr: true`，无 blocking issue、warning 或失败分类。
- 清理工具按 preview → apply → preview 执行；最终 `pm-phase-*` identity 及级联产品数据
  为 `0 rows`。归档提交后按相同流程对最终 revision 再次重建、重跑旅程和生成报告。

## 9. 建议切片与验证目标

| 切片                     | 主要文件                                                  | 最小验证                              |
| ------------------------ | --------------------------------------------------------- | ------------------------------------- |
| S1 KR 关联崩溃测试       | `KeyResultLinksSection.vue`、对应新 spec                  | `pnpm nx run app-vue:test` 的定向用例 |
| S2 KR 加载所有权修复     | `TaskTemplateDialog.vue`、`useTaskGoalBindingOptions.ts`  | app-vue test + typecheck              |
| S3 目标任务闭环 E2E      | `apps/web/e2e`                                            | Docker local + focused e2e            |
| S4 新建状态重置          | `TaskTemplateDialog.vue`、`TaskManagementView.vue`        | create/edit/copy 组件测试             |
| S5 状态口径              | task store/query/card/widget                              | task tests + dashboard tests          |
| S6 无模型 onboarding     | AI 首页与 locale                                          | app-vue test + 浏览器 smoke           |
| S7 模块导航              | `WindowHeader.vue`、`useShellRouterSync.ts`               | shell tests + keyboard smoke          |
| S8 表单视觉统一          | Goal/Task dialogs、UI primitives                          | Storybook/视觉检查 + axe              |
| S9 右侧面板状态模型      | `useAppShellStore.ts`、`AppShell.vue`、`WindowHeader.vue` | store/shell tests + geometry e2e      |
| S10 今日概览迁移         | `AIChatView.vue`、`AIMessagePanel.vue`、新 overview panel | app-vue test + 1280 × 720 visual      |
| S11 Focus/左栏解耦       | `AppShell.vue`、panel geometry                            | shell geometry e2e                    |
| S12 无模型 Composer 收敛 | `AIFooterComposer.vue`、locale                            | Web/Desktop shared component test     |

每个切片都应：

1. 先增加能失败的回归。
2. 做根因修复，不加临时 shim。
3. 运行最近的 Nx lint、typecheck 和 test。
4. 涉及 Docker 行为时运行 `pnpm docker:local:up`。
5. 触及治理或文档结构时运行 `pnpm nx run memoflow:governance-check`。

## 10. 完整验收清单

### 环境与部署

- [x] `pnpm docker:local:up` 成功。
- [x] 六个服务均 healthy。
- [x] `localhost:58080` 的请求能在当前 `memoflow-web-1` 日志中确认。
- [x] 运行中镜像 revision 与当前验证 revision 一致。
- [x] validation report 无宿主 uv/Node 工具噪声。
- [x] Web/API/AI/PowerSync HTTP 探针均返回 200，端口映射来自 runtime profile。
- [x] 自动化测试身份和级联数据已通过固定前缀清理至 `0 rows`。

### 目标

- [x] 可以创建包含一个 KR 的目标。
- [x] 日期字段标签清晰。
- [x] KR 类型和权重全部使用当前语言。
- [x] 目标卡片状态与动作语义明确。

### 任务

- [x] 新建弹窗每次打开均为空白默认状态。
- [x] 编辑与复制有独立、可预测的初始化语义。
- [x] 可以关联目标和 KR，不崩溃、不丢数据。
- [x] KR 加载失败和空态可恢复。
- [x] 普通用户可以通过“快速任务”创建低配置待办。
- [x] 创建成功反馈说明实例何时生成。

### 执行与进度

- [x] 今日任务可以完成。
- [x] 今日概览、任务列表和模板统计同步更新。
- [x] 完成率显示统计范围。
- [x] 绑定任务完成后 KR 和目标进度正确回写。
- [x] 不出现“已完成”与“完成率 0%”冲突。

### 首页与导航

- [x] 顶栏存在 Toggle Side Panel，动态名称和状态正确。
- [x] 无业务 Tab 时右侧面板显示今日概览起始页。
- [x] AI 对话欢迎页不再显示今日概览卡片。
- [x] 关闭再打开右侧面板不会清空业务 Tab 或草稿。
- [x] 业务面板 focus 不强制隐藏左侧栏。
- [x] 左侧栏、右侧面板和 focus 可以独立组合并恢复。
- [x] 未配置模型时基础目标和任务能力仍可发现、可操作。
- [x] Web/Desktop 均不显示冗长的未配置模型常驻提示。
- [x] 无模型 Composer 高度、控件和发送按钮保持对齐。
- [x] 进入目标或任务只需一次主点击。
- [x] 数量徽标不会覆盖模块可访问名称。
- [x] 已配置模型时，clean Home/业务 surface 可按上下文自动切换到审批工作流。
- [x] 脏表单、busy surface 或用户主动关闭面板时只提示，不擅自打开或切换。
- [x] 390 × 844 移动断点下显式 Toggle 与工作流注意徽标可操作。

### UI 与无障碍

- [x] 1280 × 720 下快速任务表单无需滚动。
- [x] 保存和取消始终可见。
- [x] 目标和任务弹窗视觉语言一致。
- [x] 所有 switch、combobox、日期和数字字段有可访问名称。
- [x] 仅键盘可完成目标、KR 和任务创建。
- [x] axe 无 serious/critical 问题。
- [x] 中文界面无裸英文枚举和混排。

### Desktop 与共享实现

- [x] Desktop 开发环境可真实启动，Electron renderer/main/zygote/GPU 进程正常。
- [x] Web/Desktop 复用同一 `app-vue` 壳层、表单和 Composer 实现，没有平台分叉。
- [x] Electron 900 × 600、1024 × 768、1200 × 800、1440 × 900 壳层矩阵通过。
- [x] Desktop split/focus、侧栏、右面板、设置、主题和语言行为与 Web 契约一致。

## 11. 风险与决策点

### 11.1 任务术语需要产品决策

已确认 canonical terminology：

| 工程领域名               | 用户界面术语 |
| ------------------------ | ------------ |
| `TaskTemplate`           | 任务计划     |
| `TaskInstance`           | 待办任务     |
| 当日 `TaskInstance` 集合 | 今日任务     |
| 低配置创建入口           | 快速任务     |

实施时必须统一路由标题、按钮、弹窗、成功反馈、空态和帮助文案，不能只改局部
标题。工程日志和接口继续使用领域名，避免为了 UI 文案重命名领域对象。

### 11.2 完成率需要领域定义

已确认：

- 任务计划使用最近 30 天滚动窗口。
- 只统计已到期实例，未来实例不进入分母。
- 完成进入分子；未完成、跳过和过期进入分母。
- 只生成一次待办的任务计划不显示完成率。
- 无已到期记录时显示“暂无执行记录”。

实现不能只修 UI 标签；Prisma 和 PowerSync 的 `getTemplateStats` 必须使用同一
查询边界，并由共享领域测试锁定统计公式。

### 11.3 KR 回写规则需要防重复

代码现状：

- `PER_INSTANCE`：每次实例完成都会创建一条 GoalRecord。
- `ALL_INSTANCES_COMPLETED`：当前实现检查“截至当前实例日期的兄弟实例是否都
  完成”，并不是真正的模板全部实例完成。
- GoalRecord 没有保存来源 `taskInstanceId`，无法建立数据库唯一约束。
- 已有 `TaskUncompletedEvent` 契约，但没有完整的撤销回写链路。

已确认的工程规则：

- GoalRecord 增加来源类型、来源 ID 或等价 correlation key。
- `PER_INSTANCE` 使用 `taskInstanceId` 作为唯一来源，同一实例重复完成不能
  累计两次。
- 撤销完成必须撤销该实例产生的精确贡献，不能只增加一条含混的负数记录。
- 完成、重复提交、撤销、再次完成都由领域测试和 Prisma/PowerSync 集成测试
  锁定。

已确认 `ALL_INSTANCES_COMPLETED` 采用有限计划语义：

- 只允许具有明确结束日期或最大执行次数的有限任务计划选择。
- 计划范围内所有实例完成后，只创建一次 KR 贡献。
- 无限重复计划不能选择该触发器，只能使用 `PER_INSTANCE`。
- UI 用户文案使用“完成整个任务计划时更新一次”，不暴露枚举名。
- 后端校验不能只依赖 UI；创建和更新任务计划时都必须拒绝非法组合。
- correlation key 以任务计划及该次有限执行范围为基础，保证只贡献一次。

### 11.4 表单草稿保护范围

已确认首期只做弹窗生命周期内草稿：

- 意外的 section 错误或 ErrorBoundary 恢复后保留当前表单。
- 用户明确取消、创建成功或切换 create/edit/copy 意图时清除。
- 页面刷新和应用重启后不恢复。
- 草稿包含当前弹窗内已经编辑的全部字段，不能只保护标题。
- 暂不引入 localStorage、服务端或跨设备草稿。

### 11.4.1 编辑任务计划的传播范围

已确认：

- 同步当前时刻之后所有 `Pending` 待办任务。
- 不修改 `InProgress` 和任何终态/历史任务。
- 时间或重复规则变化时重建受影响的未来 Pending 实例。
- 保存前展示受影响数量。
- 更新模板、删除旧 Pending 和生成新 Pending 应采用一致的事务/幂等边界。

### 11.5 右侧面板默认状态与关闭语义

已确认：

- 首次进入工作区默认打开右侧面板并显示今日概览。
- 用户通过 Toggle 主动关闭后，跨应用重启记住关闭状态。
- 今日概览是无活动业务 Tab 时的 Home surface，不是固定 Tab。
- 关闭最后一个业务 Tab 回到 Home，不关闭右侧面板。
- 用户显式点击模块、业务深链或“查看全部”时可以重新打开面板。
- 后台刷新、普通通知和概览数据变化不能擅自打开面板。

### 11.6 工作流上下文与壳层右侧面板的关系

`AIContextPanel` 与 `BusinessPanel` 都可能占据右侧。必须选择一个 canonical
容器，避免出现两个右栏和两套 Toggle。

已确认把壳层右侧面板作为唯一容器：

- 空闲时显示今日概览。
- 业务导航时显示业务 Tabs。
- AI 工作流产生待审批产物时增加临时“工作流”Tab 或明确的上下文 surface。
- 采用上下文感知自动切换：
  - 当前对话由用户主动发起工作流，且右侧面板处于 Home 时，自动切到工作流。
  - 当前业务 Tab 没有未保存状态时，可以自动切到工作流，并保存返回 Tab。
  - 用户已关闭右侧面板、业务 Tab 有脏表单或正在执行阻塞性操作时，不打开、
    不切换，只显示徽标与非阻塞通知。
  - 点击通知后再打开对应工作流，并保留返回原业务 Tab 的路径。

面板脏状态采用统一契约，不由壳层猜测 DOM：

```text
clean
dirty
busy
```

- `dirty`：存在未保存编辑，切换前必须确认或保存草稿。
- `busy`：正在提交、导入或执行不可安全中断的操作，不允许自动切换。
- 未实现脏状态契约的业务 surface 默认按 `clean`，但关键表单必须接入后才能
  允许工作流自动切换。

### 11.7 Focus 是否等于“无 AI 模式”

用户期望点击右侧面板 Focus 后隐藏中央 AI，恢复传统业务应用形态；但左侧栏
仍由用户自己决定。

已确认将 Focus 定义为“业务面板占满中央剩余工作区”，不是窗口全屏，也不是
关闭 AI。左侧栏只响应自己的 Toggle；AI 实例继续保活，退出 Focus 后恢复
对话和流式状态。

### 11.8 无模型提示的最小信息量

需要区分“删除冗长常驻句子”和“完全移除配置入口”。完全没有入口会让发送按钮
失效原因不可发现。

已确认删除常驻句子，保留与模型选择器同尺寸的“配置 AI”紧凑按钮；详细说明
只在点击后的 Popover/设置引导中出现。

## 12. 非目标

本计划当前不包含：

- 重做整个 MemoFlow 信息架构。
- 改变统一助手或 Agent Host 的整体架构。
- 新增第三方 AI Provider。
- 大规模重写目标或任务领域模型。
- 为历史兼容保留两套任务创建流程。
- 删除不属于固定 PM 测试前缀的任意本地或生产数据；自动化 fixture 只由显式清理
  工具按 `pm-phase-*` 身份根处理。

## 13. 本轮测试数据

初次人工审查曾使用以下历史 fixture：

- 测试账号：`pm-review-live-1785322038450@example.com`
- 目标：`完成 MemoFlow 产品测试闭环`
- 关键结果：`完成四项核心流程审查`
- 任务模板：`整理产品审查问题并分级`
- 今日任务实例：已完成

最终自动化旅程不再依赖上述固定账号，而是每次创建唯一 `pm-phase-*` 身份。归档前已
执行显式清理工具；`pm-phase-*` preview 为 `0 rows`，历史 `pm-review-live-*` 查询也为
`0 rows`。测试账号密码从未写入文档，任何本地 fixture 都不得迁移到生产环境。

## 14. 完成与归档

满足以下条件后，本计划才可标记完成并移动到 `docs/plan/archive`：

1. Phase A–D 的出口条件全部完成。
2. 核心 PM journey 在本机 Docker 环境稳定通过。
3. 目标/KR/任务/完成/回写全链路有自动化回归。
4. 无模型 onboarding、导航和表单无障碍达到验收标准。
5. 左右面板、Focus、今日概览和无模型 Composer 的共享 Web/Desktop 壳行为
   达到验收标准。
6. 最终 validation report 为通过，且浏览器请求来源可证明。

若只完成部分切片，应在本文追加 residual 状态，不得以“基础创建可用”替代核心目标—任务闭环的完成定义。

归档结论：以上 6 项条件与第 10 节清单均已满足，无 residual 或未完成切片。本文件随
最终交付从 `docs/plan/active` 移入 `docs/plan/archive`。
