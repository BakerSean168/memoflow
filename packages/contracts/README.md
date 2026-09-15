# @memoflow/contracts

统一契约定义包 - 定义所有模块的类型、接口、枚举和 DTO。

## 📐 Contract Layering Architecture

每个模块采用分层结构确保关注点分离和类型复用：

### 层级定义

| 层级         | 文件夹      | 职责                                            | 导入来源             |
| ------------ | ----------- | ----------------------------------------------- | -------------------- |
| **Protocol** | `protocol/` | RPC/Event 映射表，定义事件键和请求/响应类型关联 | 从 api/ 导入         |
| **API**      | `api/`      | Zod schema、请求/响应类型定义和验证             | 独立定义             |
| **DTOs**     | `dtos/`     | 复杂/组合响应类型（聚合、组合、数据传输对象）   | 组合或引用 api/ 类型 |

### 层级依赖关系

```
protocol/ → api/ ← dtos/
 (引用)      (导出)   (组合)
```

### 模块事件键命名规范

事件键采用 **namespace:action** 格式：

- **Namespace**: 模块名称（小写）。例如：`account`, `task`, `goal`, `notification`
- **Action**: 动作描述（kebab-case）。例如：`login`, `create-task`, `update-goal-status`
- **完整示例**：
  - `account:update-profile`
  - `task:create`
  - `goal:update-status`
  - `notification:send`

### 模块结构示例（以 account 为例）

```
src/modules/account/
├── protocol/
│   ├── account-rpc-map.ts       # RPC 事件映射 (从 api/ 导入类型)
│   ├── account-event-map.ts     # Domain 事件映射 (从 api/ 和 dtos/ 导入)
│   └── index.ts                 # 导出 rpc-map 和 event-map
├── api/
│   ├── profile.ts               # 资料相关 schema 和类型
│   ├── preferences.ts           # 偏好相关 schema 和类型
│   └── index.ts                 # 导出所有 API 类型
├── dtos/
│   ├── account.dto.ts           # Account 聚合响应
│   └── index.ts                 # 导出所有 DTO 类型
└── index.ts                     # 模块统一导出 (protocol + api + dtos)
```

### 实现指引

1. **定义 API Schema**：在 `api/` 下用 Zod 定义请求和响应schema

   ```typescript
   // api/profile.ts
   export const UpdateProfileSchema = z.object({
     name: z.string().min(1),
   });
   export type UpdateProfileReq = z.infer<typeof UpdateProfileSchema>;
   ```

2. **定义 DTOs**：在 `dtos/` 下定义复杂/组合类型

   ```typescript
   // dtos/account.dto.ts
   export interface AccountDTO {
     id: string;
     name: string;
   }
   ```

3. **定义 RPC 映射**：在 `protocol/` 下用 API 类型构建映射

   ```typescript
   // protocol/account-rpc-map.ts
   import type { UpdateProfileReq } from '../api/profile';
   export type AccountRpcMap = {
     'account:update-profile': [UpdateProfileReq, AccountDTO];
   };
   ```

4. **模块导出**：在 `index.ts` 统一导出
   ```typescript
   // src/modules/account/index.ts
   export * from './protocol';
   export * from './api';
   export * from './dtos';
   ```

## 🎨 子路径导出架构

本包采用**子路径导出**模式，支持极致的 Tree-Shaking 和模块隔离。

### 导入方式

```typescript
// ✅ 方式: 从子路径导入完整模块（推荐，极致 Tree-Shaking）
import { GoalServerDTO, GoalClientDTO } from '@memoflow/contracts/goal';
import { TaskPlanServer } from '@memoflow/contracts/task';
import { AccountDTO } from '@memoflow/contracts/account';
```

### 子路径列表

| 子路径                               | 说明           |
| ------------------------------------ | -------------- |
| `@memoflow/contracts/task`           | 任务模块契约   |
| `@memoflow/contracts/goal`           | 目标模块契约   |
| `@memoflow/contracts/reminder`       | 提醒模块契约   |
| `@memoflow/contracts/repository`     | 仓库模块契约   |
| `@memoflow/contracts/account`        | 账户模块契约   |
| `@memoflow/contracts/schedule`       | 调度模块契约   |
| `@memoflow/contracts/setting`        | 设置模块契约   |
| `@memoflow/contracts/notification`   | 通知模块契约   |
| `@memoflow/contracts/ai`             | AI 模块契约    |
| `@memoflow/contracts/dashboard`      | 仪表盘模块契约 |
| `@memoflow/contracts/data-portability` | 数据可移植性契约 |
| `@memoflow/contracts/shared`         | 共享基础类型   |

## 根入口导出内容

根入口 (`@memoflow/contracts`) 导出以下内容：

### 响应系统（Result Pattern）

```typescript
import {
  ResultCode,
  HttpResponseBuilder,
  createHttpResponseBuilder,
  type HttpResponse,
  type Result,
} from '@memoflow/contracts';
// 或更细粒度：
// import { ResultCode, type HttpResponse } from '@memoflow/contracts/result';
```

### 常用枚举

```typescript
import {
  // Goal
  GoalStatus,
  KeyResultValueType,
  ReviewType,
  FolderType,
  // Task
  TaskType,
  TaskPlanStatus,
  TaskOccurrenceStatus,
  TimeType,
  // AI
  AIProvider,
  AIModel,
  ConversationStatus,
  // Account
  AccountStatus,
  SubscriptionPlan,
  // ...更多枚举
} from '@memoflow/contracts';
```

## 最佳实践

### 1. 新代码使用子路径导入

```typescript
// ✅ 推荐：明确的模块边界
import { GoalServerDTO, GoalStatus } from '@memoflow/contracts/goal';
import { TaskPlanServer } from '@memoflow/contracts/task';
```

### 2. 避免命名冲突时使用命名空间

```typescript
// ✅ 当多个模块有同名类型时
import * as GoalContracts from '@memoflow/contracts/goal';
import * as TaskContracts from '@memoflow/contracts/task';

function process(
  goal: GoalContracts.StatusDTO,  // Goal 的状态
  task: TaskContracts.StatusDTO,  // Task 的状态
) { ... }
```

### 3. 类型导入使用 `import type`

```typescript
// ✅ 确保无运行时代码
import type { GoalServerDTO } from '@memoflow/contracts/goal';
import { GoalStatus } from '@memoflow/contracts/goal'; // 枚举是运行时值
```

## 开发

```bash
# 构建
pnpm --filter @memoflow/contracts build

# 监听模式
pnpm --filter @memoflow/contracts dev
```
