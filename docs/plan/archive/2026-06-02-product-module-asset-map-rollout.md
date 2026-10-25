---
tags:
  - plan
  - active
  - product
  - documentation
description: 将目标模块功能资产底图样板扩展到其他用户可见模块的详细方案
created: 2026-06-02T00:00:00
updated: 2026-06-02T00:00:00
---

# 用户可见模块功能资产底图扩展方案

## 1. 背景

当前已经以 `goal` 模块建立了第一版功能资产样板：

- `docs/product/modules/goal.md`：目标模块功能说明。
- `docs/product/module-index/goal-files.md`：目标模块代码、接口、数据结构和测试索引。
- `docs/product/feature-map.md`：核心功能地图。

这套样板的价值是把业务功能、用户路径、业务规则、代码落点和改动风险放到同一张底图上。后续做具体业务优化时，可以先确认当前系统边界，再进入设计和实现，避免重复建设、错改边界或遗漏跨模块影响。

本方案用于把 `goal` 样板推广到其他用户可见模块。它只规划文档建设，不直接修改业务代码、API、contracts、schema 或测试。

## 2. 目标

- 为所有用户可见模块补齐轻量功能资产底图。
- 让每个模块都有一份“当前功能说明”和一份“文件索引”。
- 更新全局功能地图，让后续优化前可以快速确认模块边界、业务目标、代码入口和盘点状态。
- 建立统一写法，后续模块优化方案可以直接引用这些文档，而不是重新做基础盘点。

## 3. 覆盖范围

本轮覆盖除 `goal` 外的用户可见模块。`goal` 保持为样板，不重复重写。

| 批次    | 模块                                                 | 覆盖原因                           | 主要关注点                                    |
| ------- | ---------------------------------------------------- | ---------------------------------- | --------------------------------------------- |
| Batch 1 | `task`、`schedule`                                   | 目标之后最核心的执行与时间安排链路 | 目标、任务、日程之间的跨模块依赖              |
| Batch 2 | `reminder`、`notification`、`dashboard`              | 提醒触达、通知承载和状态汇总       | 业务提醒、通知基础设施、Dashboard 读模型边界  |
| Batch 3 | `ai`、`repository`、`editor`                         | AI、知识资源和编辑器链路           | AI 写入边界、资源引用、编辑状态、跨模块上下文 |
| Batch 4 | `account`、`authentication`、`setting`、`governance` | 账户、登录会话、用户偏好和治理入口 | 身份、权限、配置生效路径、用户可见治理能力    |

## 4. 不覆盖范围

以下包不作为本轮“产品功能资产模块”单独盘点：

- 基础契约与共享类型：`contracts`、`domain-shared`。
- 基础设施与运行支撑：`database`、`http-client`、`ipc-client`、`powersync-schema`、`scheduler-server`。
- UI 和资源包：`app-vue`、`app-react`、`ui-core`、`ui-vue-shadcn`、`ui-react-native`、`assets`。
- 工具与测试支撑：`utils`、`patterns`、`test-utils`。

这些包仍会出现在具体模块的文件索引里。例如 `contracts/src/modules/task` 会放入 `task-files.md`，但不会单独写一份 `contracts` 功能资产文档。

`repository` 虽然是 `layer:infra`，但在 `packages/app-vue/src/modules/repository` 中有用户可见工作区，因此纳入本轮产品功能资产盘点。

## 5. 交付物

每个覆盖模块交付两份文档：

- `docs/product/modules/{module}.md`
- `docs/product/module-index/{module}-files.md`

同时更新：

- `docs/product/feature-map.md`
- 必要时更新 `docs/product/README.md` 的当前入口。

不新增 ADR，除非盘点过程中发现需要长期架构决策的事项。当前预期只是资产文档，不是架构决策。

## 6. 模块说明文档模板

每个 `docs/product/modules/{module}.md` 使用与 `goal.md` 一致的结构。

必填章节：

1. 功能定位
2. 当前功能说明
3. 用户路径
4. 业务规则
5. 相关文件索引
6. 当前问题
7. 优化机会
8. 风险点
9. 后续待确认
10. 相关资料

写作规则：

- 只描述当前系统事实和合理的优化前观察，不写详细 PRD。
- 当前功能说明使用用户能理解的业务能力表达，不按文件名堆砌。
- 业务规则只写已经能从代码、contracts、schema、测试或现有文档确认的规则。
- 当前问题和优化机会可以是初步观察，但必须避免写成已经确认的产品决策。
- 待确认事项用于承接后续业务优化访谈。

## 7. 文件索引文档模板

每个 `docs/product/module-index/{module}-files.md` 使用与 `goal-files.md` 一致的结构，并按实际模块裁剪。

优先使用这些分组：

- 前端页面与路由
- 前端状态、组合函数与组件
- 移动端入口
- API、控制器与适配器
- 领域、用例与仓储
- Contracts 与数据结构
- 跨模块或 AI 相关入口
- 测试入口
- 需要重点关注的改动风险

文件索引规则：

- 每个链接必须指向真实存在的文件。
- 优先索引入口文件、组合根、路由、用例、聚合、DTO、schema、store、composables、关键组件和测试入口。
- 不追求列出所有文件；每个分组保留会帮助后续优化定位的高价值文件。
- 如果某个分组不存在，例如移动端没有对应入口，则省略该分组或标注“当前未发现独立入口”。
- 同一职责如果有 HTTP 和 IPC 两类适配器，需要同时列出。
- Prisma schema 使用 `packages/database/prisma/schema/{module}.prisma` 或对应真实文件名。

## 8. 批次实施细节

## Batch 1：任务与日程

### task

模块说明重点：

- 任务模板、任务实例、任务依赖、任务完成、任务跳过、任务归档。
- 任务与目标绑定、KR 关联、DAG 可视化、关键路径。
- 任务在日程中的来源和执行关系。

文件索引重点：

- `packages/task`
- `packages/app-vue/src/modules/task`
- `apps/mobile/src/app/tasks`
- `packages/contracts/src/modules/task`
- `packages/database/prisma/schema/task.prisma`
- `apps/web/e2e/task`

风险重点：

- 模板和实例的生命周期边界。
- 任务依赖变更对 DAG、关键路径、日程执行的影响。
- 任务与目标绑定对目标进度和用户行动闭环的影响。

### schedule

模块说明重点：

- 日程任务、周视图、日历视图、日程执行、暂停、恢复、取消、完成。
- 冲突检测、冲突解决、调度队列。
- 来自目标、任务、提醒等模块的 source 关系。

文件索引重点：

- `packages/schedule`
- `packages/app-vue/src/modules/schedule`
- `apps/mobile/src/app/schedule`
- `packages/contracts/src/modules/schedule`
- `packages/database/prisma/schema/schedule.prisma`
- `apps/web/e2e/schedule`

风险重点：

- 调度状态流转和执行记录。
- 跨模块 source 元数据一致性。
- 冲突检测规则变更对用户日历展示和执行计划的影响。

## Batch 2：提醒、通知与 Dashboard

### reminder

模块说明重点：

- 提醒模板、提醒分组、用户提醒偏好、触发配置、响应记录。
- 提醒与任务、日程、通知的关系。
- 提醒生命周期：启用、暂停、移动、删除、触发。

文件索引重点：

- `packages/reminder`
- `packages/app-vue/src/modules/reminder`
- `packages/contracts/src/modules/reminder`
- `packages/database/prisma/schema/reminder.prisma`
- `apps/web/e2e/reminder`

风险重点：

- 提醒规则和实际触达之间的边界。
- 提醒分组控制模式对模板行为的影响。
- 与通知模块的职责重叠。

### notification

模块说明重点：

- 通知中心、通知偏好、通知模板、通知状态、通知渠道。
- 桌面通知、应用内通知、SSE 监控。
- 通知作为基础触达能力和业务事件承载能力的边界。

文件索引重点：

- `packages/notification`
- `packages/app-vue/src/modules/notification`
- `packages/contracts/src/modules/notification`
- `packages/database/prisma/schema/notification.prisma`
- `apps/web/e2e/notification`

风险重点：

- 用户偏好、免打扰、渠道状态对实际发送的影响。
- 通知模板与业务事件之间的映射。
- 提醒模块和通知模块的职责边界。

### dashboard

模块说明重点：

- Dashboard 投影、组件注册、Overview、Widgets。
- 今日任务、目标时间线、汇总指标。
- Dashboard 作为跨模块读模型，不应承载写业务数据职责。

文件索引重点：

- `packages/dashboard`
- `packages/app-vue/src/modules/dashboard`
- `apps/api/src/modules/dashboard`
- `apps/desktop/src/main/ipc/dashboard-handler.ts`
- `apps/web/e2e/dashboard`

风险重点：

- 跨模块读模型依赖不清导致展示不稳定。
- Dashboard 指标和业务模块真实状态不一致。
- Widget 注册和数据来源之间的边界。

## Batch 3：AI、资源库与编辑器

### ai

模块说明重点：

- AI Chat、目标生成、目标自动化、知识笔记、模型选择、workflow persistence。
- AI 服务、provider runtime、internal workflow transport。
- AI 产出结构化中间态，真实业务写入仍由业务模块完成。

文件索引重点：

- `packages/ai`
- `packages/app-vue/src/modules/ai`
- `apps/ai-service`
- `apps/api/src/modules/ai`
- `packages/contracts/src/modules/ai`
- `packages/database/prisma/schema/ai.prisma`
- `apps/web/e2e/ai`

风险重点：

- AI 直接写业务数据的边界必须清晰。
- provider capability、workflow command、response contract 的一致性。
- Goal workflow、Knowledge workflow 与业务模块之间的耦合。

### repository

模块说明重点：

- 资源工作区、文件树、资源列表、标签、收藏、搜索、上传、批量导入。
- 资源与编辑器、AI 知识生成、知识检索之间的关系。
- 用户文件和系统资源的边界。

文件索引重点：

- `packages/repository`
- `packages/app-vue/src/modules/repository`
- `packages/contracts/src/modules/repository`
- `packages/database/prisma/schema/repository.prisma`
- `apps/desktop/src/main/modules/repository`

风险重点：

- 文件系统、数据库资源和前端树状态的一致性。
- 资源引用被编辑器或 AI 使用时的失效处理。
- 上传、批量导入、搜索索引的边界。

### editor

模块说明重点：

- Markdown 编辑器、资源插入、链接建议、引用修复、导出、自保存、未保存变更保护。
- 编辑器工作区、标签页、分栏、预览。
- 编辑器与 repository 的资源引用关系。

文件索引重点：

- `packages/editor`
- `packages/app-vue/src/modules/editor`
- `packages/contracts/src/modules/editor`
- `packages/database/prisma/schema/editor.prisma`

风险重点：

- 编辑状态、自动保存和未保存变更保护。
- 资源引用和链接索引失效。
- 编辑器 UI 状态与真实文档内容不一致。

## Batch 4：账户、认证、设置与治理

### account

模块说明重点：

- 账户中心、用户资料、账户管理、Profile 展示与编辑。
- 账户数据与认证身份的关系。

文件索引重点：

- `packages/account`
- `packages/app-vue/src/modules/account`
- `packages/contracts/src/modules/account`
- `packages/database/prisma/schema/account.prisma`
- `apps/web/e2e/account`

风险重点：

- 账户资料和认证身份混淆。
- 多账户或桌面 profile 场景下的数据归属。

### authentication

模块说明重点：

- 登录、注册、密码、短信验证码倒计时、游客模式、会话状态、记住账号。
- Web、Desktop 和 API 认证链路。

文件索引重点：

- `packages/authentication`
- `packages/app-vue/src/modules/authentication`
- `packages/contracts/src/modules/authentication`
- `packages/database/prisma/schema/auth.prisma`
- `apps/desktop/src/main/modules/authentication`
- `apps/web/e2e/authentication`

风险重点：

- 会话恢复、离线认证、token 刷新和桌面 profile 之间的边界。
- 认证状态对所有 requiresAuth 页面和模块入口的影响。

### setting

模块说明重点：

- 外观、语言、通知、隐私、快捷键、用户文件路径、AI 设置、实验设置。
- 设置持久化、偏好同步和启动时 bootstrap。

文件索引重点：

- `packages/setting`
- `packages/app-vue/src/modules/setting`
- `packages/contracts/src/modules/setting`
- `packages/database/prisma/schema/setting.prisma`
- `apps/web/e2e/setting`
- `apps/web/e2e/user-settings`

风险重点：

- 设置项生效时机和持久化路径。
- 平台差异设置，例如桌面路径、快捷键、通知权限。
- 设置与其他模块运行时配置的边界。

### governance

模块说明重点：

- 规则列表、规则详情、规则编辑、修订历史、治理状态。
- 作为用户可见治理入口和仓库治理文档之间的区别。

文件索引重点：

- `packages/governance`
- `packages/app-vue/src/modules/governance`
- `packages/database/prisma/schema/governance.prisma`
- `docs/governance`

风险重点：

- 产品内治理功能和仓库级治理规范不要混淆。
- 规则编辑、修订历史和真实生效规则之间的边界。

## 9. 功能地图更新规则

`docs/product/feature-map.md` 需要在执行完成后覆盖全部用户可见模块。

状态建议：

- `样板已盘点`：仅用于 `goal`。
- `已盘点`：模块说明和文件索引都已完成。
- `批次中`：当前批次正在生成或校验。
- `待确认`：代码入口能确认，但业务语义需要用户进一步确认。
- `不纳入功能资产`：仅用于解释基础设施或共享包不单独盘点的情况。

模块条目需要包含：

- 模块名。
- 功能点。
- 业务目标。
- 当前状态。
- 相关代码入口。
- 备注，链接到模块说明和文件索引。

## 10. 执行方法

每个模块按同一流程执行：

1. 读取模块入口：`packages/{module}`、`packages/app-vue/src/modules/{module}`、`packages/contracts/src/modules/{module}`、对应 Prisma schema 和 e2e 目录。
2. 查找路由、views、stores、composables、components、controllers、routes、use-cases、aggregates、repositories、adapters、tests。
3. 从代码和测试中提炼当前功能、用户路径和业务规则。
4. 生成模块说明文档。
5. 生成文件索引文档。
6. 检查 Markdown 链接存在性。
7. 更新功能地图状态。

优先使用 `rg --files` 和 `rg` 查找，不做代码生成，不跑格式化改写。

## 11. 验证计划

每个批次完成后运行：

```powershell
$env:NX_DAEMON='false'; pnpm nx run memoflow:docs-check
$env:NX_DAEMON='false'; pnpm nx run memoflow:governance-check
```

同时执行一次面向 `docs/product` 的链接存在性检查，确保新增模块文档中的 Markdown 链接都指向真实文件。

不要求运行业务测试，因为本方案和后续批次都只改文档。如果执行过程中发现某个模块文档需要引用真实测试状态，可以只读检查对应测试文件，不运行测试。

## 12. 验收标准

- 覆盖范围内 12 个模块均有模块说明文档和文件索引文档。
- `docs/product/feature-map.md` 覆盖 `goal` 和 12 个新增模块，并能链接到对应文档。
- 所有新增文档遵循 `goal` 样板章节结构。
- 所有 Markdown 链接存在。
- 文档不引入新的业务规则、API 约定、schema 变更或实现承诺。
- `docs-check` 和 `governance-check` 通过。

## 13. 主要风险与控制

- 风险：模块数量多，第一版容易写成流水账。控制：每个模块只保留能帮助后续优化定位的功能点和文件入口。
- 风险：业务问题被误写成确定结论。控制：不确定内容放到“后续待确认”。
- 风险：文件索引过细导致维护成本过高。控制：优先入口、用例、聚合、适配器、DTO、schema、测试，不列所有组件。
- 风险：跨模块边界混乱。控制：在每个模块的风险点中单独标注跨模块依赖。
- 风险：历史文档与当前代码不一致。控制：以当前代码、配置和测试为准，旧文档只作为参考链接。

## 14. 推荐提交切分

1. Batch 1：新增 `task`、`schedule` 模块说明和文件索引，更新功能地图。
2. Batch 2：新增 `reminder`、`notification`、`dashboard` 模块说明和文件索引，更新功能地图。
3. Batch 3：新增 `ai`、`repository`、`editor` 模块说明和文件索引，更新功能地图。
4. Batch 4：新增 `account`、`authentication`、`setting`、`governance` 模块说明和文件索引，更新功能地图。
5. Final：统一检查文档链接、状态词、导航和治理检查结果。

每个提交都应保持文档检查通过。
