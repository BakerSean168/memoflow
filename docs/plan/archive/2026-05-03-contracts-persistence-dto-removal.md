# Contracts 层优化：移除 PersistenceDTO、统一值对象、删除展示文本

> 创建时间: 2026-05-03
> 状态: ✅ 已完成
> 归档说明：本轮 contracts 收口已完成，本文仅保留为 PersistenceDTO 清理历史记录。

## 一、背景与目标

contracts 层（`packages/contracts/src/modules/`）当前存在三个架构问题：

1. **PersistenceDTO 定义在 contracts 中**（~92 个接口）— 持久化格式是基础设施层的关注点，Prisma 和 PowerSync 各有不同的映射格式（Date vs string，branded ID vs plain string），不应由共享契约定义
2. **值对象分裂为 Server/Client**（~18 个值对象）— Client 版本仅增加展示文本字段（displayText, statusText 等），造成不必要的类型膨胀
3. **硬编码中文展示文本** — 域层 `toClientDTO()` 方法中嵌入中文字符串（"一次性"、"活跃"、"每天 09:00"），违反 i18n 原则。前端已使用 vue-i18n，这些文本字段无用

**目标**：

1. 从 contracts 删除所有 PersistenceDTO 接口和 PersistenceDate 类型
2. 统一值对象 — 每个值对象保留一个接口（`IFoo`）和一个 DTO（`FooDTO`）
3. 删除所有展示文本属性和 toClientDTO() 方法，消除域层硬编码中文

---

## 二、Phase 1：移除 PersistenceDTO

### 2.1 目标

从 contracts 中删除所有 `*PersistenceDTO` 接口和 `PersistenceDate` 类型。每个基础设施适配器（Prisma/PowerSync）在本地定义自己的持久化类型。域对象上的 `fromPersistenceDTO` 方法全部删除，mapper 直接调用构造函数。

### 2.2 参考模式

`packages/schedule/src/infrastructure-server/adapters/prisma/mappers/prisma-schedule-task-mapper.ts` — 直接从 Prisma 行构造域对象，通过 `ScheduleConfig.fromPersistenceDTO(...)` 等方法，但不依赖 contracts 中的 PersistenceDTO 类型。

### 2.3 域对象 fromPersistenceDTO 处理

**删除所有 `fromPersistenceDTO` 静态方法**。Mapper 直接调用构造函数或 `load()` 构建域对象。对于有验证逻辑的 fromPersistenceDTO（如 `GoalReminderConfig.fromPersistenceDTO`），将逻辑内联到对应的 mapper 中。

### 2.4 模块执行顺序

从简单到复杂，逐模块执行：

**Tier 1 — 简单，无共享 state mapper：**

1. authentication（4 VO，已有 mapper 直接转换）
2. setting（5 PersistenceDTO）
3. notification（7 PersistenceDTO）
4. ai（3 PersistenceDTO）

**Tier 2 — 中等：** 5. account（5 PersistenceDTO，有 fromPersistenceDTO）6. editor（10 PersistenceDTO）7. repository（5 PersistenceDTO）

**Tier 3 — 较复杂：** 8. schedule（6 PersistenceDTO，mapper 已经直接构造）9. task（7 PersistenceDTO）10. reminder（6 PersistenceDTO）

**Tier 4 — 最复杂：** 11. goal（10 PersistenceDTO，有共享 `goal-state-mapper.ts`）

### 2.5 每模块操作步骤

**A. 从 contracts 删除 PersistenceDTO：**

- 删除 `packages/contracts/src/modules/{module}/` 中所有 `*PersistenceDTO` 接口
- 删除不再需要的 `PersistenceDate` 导入
- 更新 barrel 文件（`index.ts`），移除 PersistenceDTO 导出

**B. 基础设施层定义本地类型：**

- Prisma mapper：定义本地 `type PrismaFooRow = ...` 或直接内联在函数签名中
- PowerSync mapper：定义本地类型匹配 SQLite 行格式
- goal 模块共享 state mapper：将 `goal-state-mapper.ts` 移到 `adapters/shared/`，定义本地输入类型

**C. 删除域对象 fromPersistenceDTO，mapper 直接构造：**

- 删除值对象的 `fromPersistenceDTO` 静态方法
- Mapper 中改为直接调用构造函数或 load()，内联原有的验证/转换逻辑
- 移除从 contracts 导入 `FooPersistenceDTO`

**D. 最终清理 — 删除 PersistenceDate：**

- 所有模块迁移后，删除 `packages/contracts/src/primitives/persistence-date.ts`
- 从 `packages/contracts/src/primitives/index.ts` 移除导出

### 2.6 关键文件

| 文件                                                                                                 | 角色                                                          |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/goal/src/infrastructure-server/adapters/prisma/mappers/goal-state-mapper.ts`               | 共享 state mapper，需移到 adapters/shared/ 并定义本地输入类型 |
| `packages/goal/src/infrastructure-server/adapters/powersync/mappers/powersync-goal.mapper.ts`        | 依赖 GoalPersistenceDTO，需同时更新                           |
| `packages/schedule/src/infrastructure-server/adapters/prisma/mappers/prisma-schedule-task-mapper.ts` | 参考模式                                                      |
| `packages/contracts/src/primitives/persistence-date.ts`                                              | 最终删除                                                      |

---

## 三、Phase 2：统一值对象（移除 Server/Client 分裂）

### 3.1 目标

每个值对象保留一个接口（`IFoo`）和一个 DTO（`FooDTO`），删除 Client 变体。命名约定：`IFooServer` → `IFoo`，`FooServerDTO` → `FooDTO`。

### 3.2 分类处理

**Category A — 空分裂（Client 与 Server 完全相同）：**

- editor：SessionLayout, WorkspaceLayout, WorkspaceSettings, TabViewState, ResourceMetadata（5 个）
- setting：ValidationRule, UIConfig（2 个）
- 操作：删除 IFooClient + FooClientDTO，重命名 IFooServer → IFoo，FooServerDTO → FooDTO

**Category B — Client 仅增加展示文本字段：**

- reminder：TriggerConfig（displayText）、ActiveHoursConfig（displayText）、ActiveTimeConfig（displayText）、NotificationConfig（channelsText）、GroupStats（templateCountText, activeStatusText）、ResponseMetrics（displayText）、FrequencyAdjustment（displayText, changeRateText, statusText）— 7 个
- schedule：ExecutionInfo, RetryPolicy, ScheduleConfig, TaskMetadata — 4 个
- repository：RepositoryConfig（searchEngineText, gitStatusText, syncStatusText）
- notification：notification-template-client.ts（单独文件）
- 操作：删除 Client 接口和 ClientDTO，删除 displayText/text 属性，重命名去掉 Server 后缀

**Category C — 聚合根 ClientDTO（有子实体加载和计算字段）：**

- GoalClientDTO（totalKeyResults, completedKeyResults, overallProgress）
- ReminderTemplateClientDTO（history 子实体 + UI 标记）
- ReminderGroupClientDTO, TaskTemplateClientDTO, TaskInstanceClientDTO 等
- 操作：
  1. 将有用的计算字段（如 totalKeyResults）合并到 ServerDTO
  2. 将子实体加载逻辑合并到 `toServerDTO(includeChildren)` 中
  3. 删除 ClientDTO 和 `toClientDTO()` 方法
  4. 删除所有硬编码中文字符串

### 3.3 模块执行顺序

1. editor（5 个空分裂）— 最简单
2. setting（2 个空分裂）
3. repository（1 个有文本的 VO）
4. schedule（4 个有文本的 VO）
5. reminder（7 个有文本的 VO + 已有 i18n presentation 函数）
6. notification — 删除 notification-template-client.ts
7. 聚合根（goal, task, reminder, editor, schedule, notification, repository, account, ai）

### 3.4 每模块操作步骤

**A. 合约层：**

- 删除 `IFooClient` 接口和 `FooClientDTO` 类型
- `IFooServer` → `IFoo`，`FooServerDTO` → `FooDTO`
- 删除 `FooClient` 类型别名
- 更新 barrel 文件

**B. 域层：**

- 删除 `toClientDTO()` 方法
- 删除值对象中的 `displayText` getter 和展示文本逻辑
- 删除聚合根中的硬编码中文映射表（statusTextMap, typeTextMap 等）

**C. 前端（确保 i18n 替代已存在）：**

- reminder 和 task — 已有 presentation 函数，直接切换
- schedule — 新增 `schedulePresentation.ts`
- repository — 新增 `repositoryPresentation.ts`

**D. 应用层：**

- API 端点返回 DTO（原 ServerDTO）而非 ClientDTO

---

## 四、Phase 3：清理展示文本

Phase 2 已经删除了 ClientDTO 和 toClientDTO()，展示文本自然消失。本阶段确保清理完整。

### 4.1 确认已删除的硬编码中文

以下文件中的 `toClientDTO()` 方法和中文映射在 Phase 2 中已被删除：

- `packages/reminder/src/domain-server/aggregates/reminder-template.ts`（第 800-914 行：typeText, statusText, importanceText 等）
- `packages/reminder/src/domain-server/aggregates/reminder-group.ts`（第 298-342 行：controlModeText, statusText 等）
- `packages/repository/src/domain-server/aggregates/repository.ts`（第 299-348 行：statusTextMap, typeTextMap）
- `packages/reminder/src/domain-shared/value-objects/trigger-config.ts`（第 103-116 行：displayText getter）

### 4.2 确保前端 i18n 替代完整

已有 i18n presentation 函数的模块：

- reminder：`packages/app-vue/src/modules/reminder/presentation/lifecyclePresentation.ts`（12 个函数）
- task：`packages/app-vue/src/modules/task/utils/taskTemplatePresentation.ts`

需要新增的：

- schedule：`schedulePresentation.ts`
- repository：`repositoryPresentation.ts`

### 4.3 验证

```bash
# 确保域层无中文残留
grep -rn '[\x{4e00}-\x{9fff}]' packages/contracts/src/ packages/*/src/domain-server/
```

---

## 五、验证策略

### 每模块完成后

```bash
npx nx run {package}:build    # 单包构建验证
```

### 每个 Phase 结束后

```bash
npx nx run contracts:build              # contracts 构建
npx nx run-many --target=build          # 全量构建
npx nx run-many --target=test           # 全量测试
```

### Phase 1 验证 — 无残留 PersistenceDTO

```bash
grep -rn "PersistenceDTO" packages/contracts/src/
grep -rn "PersistenceDate" packages/contracts/src/
```

### Phase 2 验证 — 无残留 Client 类型

```bash
grep -rn "ClientDTO" packages/contracts/src/
grep -rn "IFooClient\|toClientDTO" packages/
```

### Phase 3 验证 — 无硬编码中文

```bash
grep -rn '[\x{4e00}-\x{9fff}]' packages/contracts/src/ packages/*/src/domain-server/
```

---

## 六、风险评估

| 风险                                                  | 严重性 | 缓解措施                                                                                    |
| ----------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| 破坏 API 契约（ServerDTO 变更）                       | 高     | Phase 1 不改动 ServerDTO；Phase 2 仅在 Category C 中将计算字段合并到 ServerDTO，单独 commit |
| fromPersistenceDTO 删除后 mapper 遗漏                 | 中     | 迁移前 grep 所有调用点，逐个替换                                                            |
| 共享 state mapper（goal）同时破坏 Prisma 和 PowerSync | 中     | 同一个 commit 中更新 state mapper 和两个调用方                                              |
| 前端依赖 ClientDTO 文本字段                           | 中     | 迁移前审计所有 ClientDTO 使用，确保 presentation 函数已存在                                 |
| 域对象 displayText getter 有复杂逻辑                  | 低     | 将逻辑移到前端 presentation 函数中                                                          |
