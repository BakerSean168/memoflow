# ADR-007: API 接口一致性规范

## 状态

提议中 (Proposed)

## 背景

在 MemoFlow 项目中，我们有三个应用层（API/Web/Desktop）需要保持 API 接口的一致性。当前存在以下问题：

### 1. 方法命名不一致

| 场景         | contracts/infrastructure-client | Desktop 调用    | Web 调用            |
| ------------ | ------------------------------- | --------------- | ------------------- |
| 获取单个目标 | `getGoalById(uuid)`             | `getGoal(uuid)` | `getGoalById(uuid)` |
| 查询参数     | `dirUuid`                       | `folderUuid`    | `dirUuid`           |

### 2. 类型定义不匹配

```typescript
// 错误示例 1: TaskType 枚举
// contracts 定义: ONE_TIME, RECURRING
// Desktop 使用: HABIT, EVENT, DEADLINE, GENERAL (不存在)

// 错误示例 2: 请求参数
// contracts: CreateReminderTemplateRequest (无 accountUuid)
// Desktop: { ...data, accountUuid } (错误)

// 错误示例 3: 时间类型
// contracts: startTime: number (timestamp)
// Desktop: startTime: string | Date (不一致)
```

### 3. 服务层方法缺失

Desktop 的 `GoalApplicationService` 缺少 Review 相关方法：

- `getReviews()`
- `getReview()`
- `createReview()`
- `updateReview()`
- `deleteReview()`

## 决策

### 架构原则：单一事实来源 (Single Source of Truth)

```
┌─────────────────────────────────────────────────────────────────┐
│                    旧聚合契约包（已退役）                           │
│  ┌───────────────┐  ┌──────────────────┐  ┌─────────────────┐   │
│  │    Enums      │  │      DTOs        │  │    Requests     │   │
│  │  (TaskType)   │  │ (GoalClientDTO)  │  │ (CreateGoal...) │   │
│  └───────────────┘  └──────────────────┘  └─────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              API Client Interface                           ││
│  │              (IGoalApiClient, etc.)                         ││
│  └─────────────────────────────────────────────────────────────┘│
└──────────────────────────────┬──────────────────────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │   API App   │     │   Web App   │     │ Desktop App │
    │  (Server)   │     │  (Browser)  │     │ (Electron)  │
    └─────────────┘     └─────────────┘     └─────────────┘
```

### 命名规范

#### 1. API Client 方法命名

```typescript
// 标准命名模式
interface IEntityApiClient {
  // 创建
  createEntity(request: CreateEntityRequest): Promise<EntityDTO>;

  // 读取单个 - 使用 getEntityById 而非 getEntity
  getEntityById(uuid: string): Promise<EntityDTO>;

  // 读取列表
  getEntities(params?: QueryParams): Promise<EntitiesResponse>;

  // 更新
  updateEntity(uuid: string, request: UpdateEntityRequest): Promise<EntityDTO>;

  // 删除
  deleteEntity(uuid: string): Promise<void>;

  // 状态变更 - 动词 + Entity
  activateEntity(uuid: string): Promise<EntityDTO>;
  archiveEntity(uuid: string): Promise<EntityDTO>;
}
```

#### 2. 请求/响应 DTO 命名

```typescript
// 请求类型命名
type CreateXxxRequest = { ... };      // 创建请求
type UpdateXxxRequest = { ... };      // 更新请求
type QueryXxxRequest = { ... };       // 查询参数

// 响应类型命名
type XxxDTO = { ... };                // 单个实体
type XxxListResponse = {              // 列表响应
  items: XxxDTO[];
  total: number;
  page?: number;
  limit?: number;
};

// 不要使用
type XxxInput = { ... };              // ❌ 改用 Request
type XxxsResponse = { ... };          // ❌ 改用 XxxListResponse
```

#### 3. 字段命名统一

```typescript
// 统一使用
uuid: string; // 实体唯一标识
folderUuid: string; // 关联文件夹（不用 dirUuid）
parentUuid: string; // 父级关联
createdAt: number; // 创建时间 (timestamp)
updatedAt: number; // 更新时间 (timestamp)
startTime: number; // 开始时间 (timestamp)
endTime: number; // 结束时间 (timestamp)
```

### 实现最佳实践

#### 1. 组件类型使用规范：直接使用 contracts 类型

**核心原则**：TSX 组件中不应自定义数据类型，必须直接使用 contracts 包中的类型。

```typescript
// ❌ 错误做法：组件中自定义类型
// components/ReminderTemplateDialog.tsx
export interface ReminderTemplateFormData {
  // ❌ 不允许
  title: string;
  description: string;
  triggerType: TriggerType;
  fixedTime: string;
  // ...扁平化字段
}

// ✅ 正确做法：直接使用 contracts 类型
// components/ReminderTemplateDialog.tsx
import type {
  CreateReminderTemplateRequest,
  UpdateReminderTemplateRequest,
} from '@memoflow/routine-contracts';

interface ReminderTemplateDialogProps {
  onSave: (data: CreateReminderTemplateRequest, isEdit: boolean) => Promise<void>;
  // 使用 contracts 的类型作为回调参数
}

// 组件内部负责将表单 UI 状态转换为 Request 类型
function ReminderTemplateDialog({ onSave }: ReminderTemplateDialogProps) {
  // 表单 UI 状态可以使用简单类型
  const [title, setTitle] = useState('');
  const [triggerType, setTriggerType] = useState<TriggerType>(TriggerType.FIXED_TIME);

  const handleSubmit = () => {
    // 在提交时构建符合 contracts 的请求对象
    const request: CreateReminderTemplateRequest = {
      title,
      type: ReminderType.CUSTOM,
      trigger: {
        type: triggerType,
        fixedTime: triggerType === TriggerType.FIXED_TIME ? { time: fixedTime } : null,
        interval: triggerType === TriggerType.INTERVAL ? { minutes: intervalMinutes } : null,
      },
      // ...其他字段
    };
    onSave(request, isEdit);
  };
}
```

**优势**：

- 前后端类型完全一致
- 编译时即可发现类型不匹配
- 重构时自动检测所有影响点
- 减少类型定义重复

#### 2. 在 contracts 包中定义完整的 API Client 接口

```typescript
// packages/goal-contracts/src/api-client.interface.ts
export interface IGoalApiClient {
  // 明确定义所有方法签名
  createGoal(request: CreateGoalRequest): Promise<GoalClientDTO>;
  getGoalById(uuid: string): Promise<GoalClientDTO>;
  getGoals(params?: QueryGoalsRequest): Promise<GoalListResponse>;
  updateGoal(uuid: string, request: UpdateGoalRequest): Promise<GoalClientDTO>;
  deleteGoal(uuid: string): Promise<void>;

  // Review 相关 - 全部定义
  createGoalReview(
    goalUuid: string,
    request: CreateGoalReviewRequest,
  ): Promise<GoalReviewClientDTO>;
  getGoalReviewById(goalUuid: string, reviewUuid: string): Promise<GoalReviewClientDTO>;
  getGoalReviews(goalUuid: string): Promise<GoalReviewListResponse>;
  updateGoalReview(
    goalUuid: string,
    reviewUuid: string,
    request: UpdateGoalReviewRequest,
  ): Promise<GoalReviewClientDTO>;
  deleteGoalReview(goalUuid: string, reviewUuid: string): Promise<void>;
}
```

#### 2. 使用 TypeScript 严格类型检查

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
  },
}
```

#### 3. 自动生成 API Client 类型

考虑使用 OpenAPI/Swagger 自动生成：

```typescript
// 从 API 项目生成 OpenAPI spec
// 使用 openapi-typescript 生成类型
// 所有应用使用相同的生成类型
```

#### 4. 运行时验证

```typescript
// 使用 zod 进行运行时验证
import { z } from 'zod';

export const CreateGoalRequestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  status: z.nativeEnum(GoalStatus).default(GoalStatus.ACTIVE),
  folderUuid: z.string().uuid().optional(),
  // ...
});

export type CreateGoalRequest = z.infer<typeof CreateGoalRequestSchema>;

// API 端验证
app.post('/goals', async (req, res) => {
  const validated = CreateGoalRequestSchema.parse(req.body);
  // ...
});

// Client 端验证
async function createGoal(request: CreateGoalRequest) {
  const validated = CreateGoalRequestSchema.parse(request);
  return apiClient.post('/goals', validated);
}
```

### 迁移步骤

#### Unify Contracts Definitions (Week 1)

1. 审查所有模块的 API Client 接口
2. 统一命名规范
3. 添加缺失的方法定义
4. 导出完整的接口类型

#### Update infrastructure-client (Week 2)

1. 从 contracts 导入接口定义
2. 实现所有方法
3. 统一参数和返回类型

#### Update Application Layer (Week 3)

1. Desktop: 更新调用方式匹配接口
2. Web: 更新调用方式匹配接口
3. API: 确保 Controller 实现匹配接口

#### Add Automated Checks (Week 4)

1. 添加 TypeScript 编译检查到 CI
2. 添加接口一致性测试
3. 文档化 API 规范

## 后果

### 正面

- API 调用方式在所有应用中一致
- 类型安全，编译时发现错误
- 更容易维护和重构
- 新开发者更容易理解

### 负面

- 需要一次性迁移成本
- 需要更新大量文件
- contracts 包变更影响所有应用

## 相关决策

- ADR-001: 项目结构
- ADR-002: 分层架构
- ADR-005: 共享包策略
