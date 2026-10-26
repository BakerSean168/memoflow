---
tags:
  - adr
  - architecture
  - decision
  - ddd
  - domain-driven-design
description: ADR-002 - 采用领域驱动设计(DDD)架构模式
created: 2025-11-23T15:00:00
updated: 2025-11-23T15:00:00
---

# ADR-002: 采用 DDD 架构模式

**状态**: ✅ 已采纳  
**日期**: 2024-08-20  
**决策者**: @BakerSean168

## 背景

MemoFlow 是一个功能丰富的个人效率管理系统，包含目标管理、任务管理、日程调度等多个业务领域。随着项目复杂度增加，我们需要一种能够：

1. 清晰表达业务逻辑
2. 隔离业务逻辑和技术实现
3. 便于长期维护和演进
4. 支持前后端共享领域模型

的架构模式。

### 可选方案

1. **传统三层架构** (Controller/Service/DAO)
2. **MVC模式**
3. **领域驱动设计 (DDD)**
4. **Clean Architecture**

## 决策

选择 **领域驱动设计 (DDD)** 作为项目的核心架构模式。

## 理由

### 为什么选择 DDD？

✅ **业务逻辑清晰**

- 领域模型直接反映业务概念
- Entity、Value Object 等概念与业务语言一致
- 非技术人员也能理解代码结构

✅ **高内聚低耦合**

- 每个领域模块独立
- 通过领域事件进行模块间通信
- 易于单独测试和演进

✅ **前后端共享**

- 领域模型可在前后端复用
- 减少类型不一致问题
- 统一的业务规则

✅ **长期可维护**

- 业务逻辑集中在领域层
- 技术细节隔离在基础设施层
- 重构不影响业务逻辑

### 为什么不选其他方案？

❌ **传统三层架构**

- Service 层容易变成"贫血模型"
- 业务逻辑分散
- 难以应对复杂业务场景

❌ **MVC模式**

- 更适合 CRUD 应用
- 缺少领域概念
- 不适合复杂业务逻辑

❌ **Clean Architecture**

- 过于抽象，学习曲线陡峭
- 对小型团队来说过度设计
- DDD 提供更具体的实践指导

## 实施

### 分层架构

```
Application (apps/api/, apps/web/)
├── Presentation Layer (表示层)
│   ├── Controllers (API) / Components (Web)
│   └── DTOs / View Models
├── Application Layer (应用层)
│   ├── Application Services
│   ├── DTOs
│   └── Mappers
├── Domain Layer (领域层)
│   ├── Entities (实体)
│   ├── Value Objects (值对象)
│   ├── Aggregates (聚合)
│   ├── Domain Services (领域服务)
│   ├── Domain Events (领域事件)
│   └── Repository Interfaces (仓储接口)
└── Infrastructure Layer (基础设施层)
    ├── Repository Implementations
    ├── External Services
    └── Database / API Clients
```

### 核心概念

#### Entity (实体)

具有唯一标识的领域对象。

```typescript
// packages/domain-server/src/goal/entities/goal.entity.ts
export class Goal {
  constructor(
    public readonly uuid: string,
    public title: string,
    public deadline: Date,
    public status: GoalStatus,
  ) {}

  // 业务方法
  complete(): void {
    if (this.status === GoalStatus.COMPLETED) {
      throw new Error('Goal is already completed');
    }
    this.status = GoalStatus.COMPLETED;
  }
}
```

#### Value Object (值对象)

没有唯一标识，通过属性值判断相等性。

```typescript
// packages/domain-server/src/goal/value-objects/deadline.vo.ts
export class Deadline {
  constructor(public readonly date: Date) {
    if (date < new Date()) {
      throw new Error('Deadline cannot be in the past');
    }
  }

  isOverdue(): boolean {
    return this.date < new Date();
  }

  equals(other: Deadline): boolean {
    return this.date.getTime() === other.date.getTime();
  }
}
```

#### Aggregate (聚合)

一组相关实体和值对象的集合，有聚合根。

```typescript
// Goal 是聚合根，包含 KeyResult 实体
export class Goal {
  private keyResults: KeyResult[] = [];

  addKeyResult(keyResult: KeyResult): void {
    // 业务规则：最多 5 个关键结果
    if (this.keyResults.length >= 5) {
      throw new Error('Maximum 5 key results allowed');
    }
    this.keyResults.push(keyResult);
  }
}
```

#### Domain Service (领域服务)

跨多个实体的业务逻辑。

```typescript
// packages/domain-server/src/goal/services/goal-progress.service.ts
export class GoalProgressService {
  calculateProgress(goal: Goal): number {
    const keyResults = goal.getKeyResults();
    const totalWeight = keyResults.reduce((sum, kr) => sum + kr.weight, 0);

    return keyResults.reduce((progress, kr) => {
      return progress + (kr.progress * kr.weight) / totalWeight;
    }, 0);
  }
}
```

#### Repository (仓储)

领域对象的持久化抽象。

```typescript
// packages/domain-client/src/goal/repositories/goal.repository.ts
export interface IGoalRepository {
  findById(uuid: string): Promise<Goal | null>;
  save(goal: Goal): Promise<void>;
  delete(uuid: string): Promise<void>;
}

// apps/web/src/modules/goal/infrastructure/repositories/goal-api.repository.ts
export class GoalApiRepository implements IGoalRepository {
  async findById(uuid: string): Promise<Goal | null> {
    const response = await apiClient.get(`/goals/${uuid}`);
    return GoalMapper.toDomain(response.data);
  }
}
```

#### Domain Event (领域事件)

领域内发生的重要事件。

```typescript
// packages/contracts/src/goal/events.types.ts
export interface GoalCompletedEvent {
  type: 'goal.completed';
  payload: {
    goalUuid: string;
    completedAt: Date;
  };
}

// 使用
goal.complete();
eventBus.publish<GoalCompletedEvent>({
  type: 'goal.completed',
  payload: { goalUuid: goal.uuid, completedAt: new Date() },
});
```

### 包结构（实际项目）

```
packages/
├── contracts/                    # 类型契约层（前后端共享）
│   └── src/{module}/
│       ├── entities/             # DTO 类型定义
│       │   ├── {Entity}Server.ts # ServerDTO - 与数据库/API 对应
│       │   └── {Entity}Client.ts # ClientDTO - 包含计算属性 + Interface
│       ├── requests/             # API 请求类型
│       └── responses/            # API 响应类型
│
├── domain-client/                # 客户端领域层
│   └── src/{module}/
│       ├── entities/             # 领域实体类
│       ├── aggregates/           # 聚合根
│       ├── value-objects/        # 值对象
│       └── index.ts
│
├── domain-server/                # 服务端领域层
│   └── src/{module}/
│       ├── entities/
│       ├── aggregates/
│       ├── value-objects/
│       └── services/             # 领域服务
│
├── application-client/           # 客户端应用层
│   └── src/{module}/
│       └── services/             # Use Cases (每个用例一个文件)
│           ├── create-goal.ts
│           ├── update-goal.ts
│           ├── delete-goal.ts
│           └── index.ts
│
├── application-server/           # 服务端应用层
│   └── src/{module}/
│       ├── services/             # Application Services
│       └── {Module}Container.ts  # 依赖注入容器
│
├── infrastructure-client/        # 客户端基础设施层
│   └── src/
│       ├── {module}/
│       │   ├── adapters/         # API 适配器实现
│       │   │   ├── goal-http.adapter.ts
│       │   │   └── goal-ipc.adapter.ts
│       │   └── ports/            # 端口接口定义
│       │       └── goal-api-client.port.ts
│       ├── di/                   # 依赖注入
│       │   ├── containers/       # DI 容器
│       │   │   ├── DIContainer.ts
│       │   │   └── {Module}Container.ts
│       │   └── composition-roots/  # 组合根
│       │       ├── web.composition-root.ts
│       │       └── desktop.composition-root.ts
│       └── shared/               # 共享基础设施
│
└── infrastructure-server/        # 服务端基础设施层
    └── src/{module}/
        ├── repositories/         # 仓储实现
        └── adapters/             # 外部服务适配器
```

### 依赖方向（核心原则）

```
┌─────────────────────────────────────────────────────────────────┐
│                        依赖规则                                  │
│  外层可以依赖内层，内层不能依赖外层                                │
│  Infrastructure → Application → Domain ← (依赖流向)              │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│   Presentation   │  apps/web, apps/api, apps/desktop
│   (表示层)        │  ↓ 依赖
├──────────────────┤
│  Infrastructure  │  packages/infrastructure-*
│   (基础设施层)    │  ↓ 依赖
├──────────────────┤
│   Application    │  packages/application-*
│    (应用层)       │  ↓ 依赖
├──────────────────┤
│     Domain       │  packages/domain-*
│    (领域层)       │  ↓ 依赖
├──────────────────┤
│    Contracts     │  packages/contracts
│   (契约/类型)     │  (所有层都可依赖)
└──────────────────┘
```

### 类型层次结构（三层 DTO 体系）

```typescript
// 1. ServerDTO - 与数据库/API 完全对应的纯数据
// packages/contracts/src/goal/entities/GoalServer.ts
export interface GoalServerDTO {
  uuid: string;
  title: string;
  deadline: number; // timestamp
  status: GoalStatus;
  createdAt: number;
  updatedAt: number;
}

// 2. ClientDTO - 包含 UI 所需的计算属性
// packages/contracts/src/goal/entities/GoalClient.ts
export interface GoalClientDTO extends GoalServerDTO {
  // 计算属性
  isOverdue: boolean;
  daysRemaining: number;
  progressPercentage: number;
}

// 3. Interface - 实体的公共 API 契约（包含方法签名）
export interface GoalClient extends GoalClientDTO {
  // 业务方法
  complete(): void;
  pause(): void;

  // DTO 转换
  toClientDTO(): GoalClientDTO;
  toServerDTO(): GoalServerDTO;
}

// 4. Entity Class - 领域层实现
// packages/domain-client/src/goal/entities/Goal.ts
export class Goal implements GoalClient {
  // 私有属性
  private _uuid: string;
  private _title: string;
  // ...

  // 静态工厂方法
  static fromServerDTO(dto: GoalServerDTO): Goal {
    /* ... */
  }
  static fromClientDTO(dto: GoalClientDTO): Goal {
    /* ... */
  }

  // 业务方法实现
  complete(): void {
    if (this._status === GoalStatus.COMPLETED) {
      throw new DomainError('Goal is already completed');
    }
    this._status = GoalStatus.COMPLETED;
  }
}
```

### 依赖注入与 Container

#### Container 属于 Infrastructure 层

```
┌─────────────────────────────────────────────────────────────┐
│                  Infrastructure Layer                        │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  DIContainer (核心容器)                               │    │
│  │    ├─ register<T>(key, dependency)                   │    │
│  │    ├─ resolve<T>(key): T                             │    │
│  │    └─ has(key): boolean                              │    │
│  └─────────────────────────────────────────────────────┘    │
│                           ↑                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Module Assembly                                     │    │
│  │    ├─ module factories                               │    │
│  │    ├─ repository adapters                            │    │
│  │    ├─ runtime contributions                          │    │
│  │    └─ ...                                            │    │
│  └─────────────────────────────────────────────────────┘    │
│                           ↑                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Composition Root (组合根)                            │    │
│  │    ├─ web.composition-root.ts    → HTTP Adapters     │    │
│  │    └─ desktop.composition-root.ts → IPC Adapters     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

#### 当前建议

当前实现不再推荐通过全局 Container 管理客户端适配器或仓储。
更推荐在 composition root 中显式创建 adapter / repository / module instance，并通过构造参数传递依赖。

### Application Service (Use Case) 写法

#### 推荐模式：构造函数注入

```typescript
// packages/application-client/src/goal/services/create-goal.ts
import type { IGoalApiClient } from '@memoflow/infrastructure-client';
import type { CreateGoalRequest } from '@memoflow/goal-contracts';
import { Goal } from '@memoflow/domain-client/goal';

export class CreateGoal {
  // 构造函数注入 - 便于测试
  constructor(private readonly apiClient: IGoalApiClient) {}

  // 执行用例
  async execute(input: CreateGoalRequest): Promise<Goal> {
    const goalData = await this.apiClient.createGoal(input);
    return Goal.fromClientDTO(goalData);
  }
}

// 便捷函数
export const createGoal = (input: CreateGoalRequest): Promise<Goal> =>
  CreateGoal.fromContainer().execute(input);
```

#### 为什么这样设计？

| 特性              | 好处                                |
| ----------------- | ----------------------------------- |
| **构造函数注入**  | 依赖显式声明，易于单元测试          |
| **静态工厂方法**  | 生产环境使用方便，自动获取依赖      |
| **便捷函数导出**  | 简化调用：`await createGoal({...})` |
| **Use Case 分离** | 每个用例一个类，职责单一            |

### Ports & Adapters (端口与适配器)

```
┌─────────────────────────────────────────────────────────────┐
│                      Application Core                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   Application Layer                    │  │
│  │     CreateGoal ─────────────────────────────────────   │  │
│  │         │                                          │   │  │
│  │         ▼                                          │   │  │
│  │   ┌──────────────┐                                 │   │  │
│  │   │ Port (接口)   │  IGoalApiClient                │   │  │
│  │   └──────────────┘                                 │   │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │ implements
┌───────────────────────────▼─────────────────────────────────┐
│                   Infrastructure Layer                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Adapters (适配器)                     ││
│  │  ┌──────────────────┐    ┌──────────────────┐          ││
│  │  │ GoalHttpAdapter  │    │ GoalIpcAdapter   │          ││
│  │  │  (Web 环境)       │    │  (Desktop 环境)  │          ││
│  │  └──────────────────┘    └──────────────────┘          ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

```typescript
// Port 定义 (packages/infrastructure-client/src/goal/ports/)
export interface IGoalApiClient {
  createGoal(request: CreateGoalRequest): Promise<GoalClientDTO>;
  getGoal(uuid: string): Promise<GoalClientDTO>;
  updateGoal(uuid: string, request: UpdateGoalRequest): Promise<GoalClientDTO>;
  deleteGoal(uuid: string): Promise<void>;
}

// HTTP Adapter 实现 (Web 环境)
export class GoalHttpAdapter implements IGoalApiClient {
  constructor(private readonly httpClient: HttpClient) {}

  async createGoal(request: CreateGoalRequest): Promise<GoalClientDTO> {
    const response = await this.httpClient.post('/api/goals', request);
    return response.data;
  }
}

// IPC Adapter 实现 (Desktop 环境)
export class GoalIpcAdapter implements IGoalApiClient {
  constructor(private readonly electronApi: ElectronApi) {}

  async createGoal(request: CreateGoalRequest): Promise<GoalClientDTO> {
    return this.electronApi.invoke('goal:create', request);
  }
}
```

## 影响

### 正面影响

✅ **代码质量提升**

- 业务逻辑集中，易于理解
- 类型安全，减少 bug
- 测试覆盖率提高 35%

✅ **开发效率提升**

- 新功能开发更快（模块独立）
- 重构成本降低 40%
- 代码复用率提高

✅ **团队协作改善**

- 统一的业务语言
- 清晰的模块边界
- 并行开发不冲突

### 负面影响

⚠️ **学习成本**

- 团队需要学习 DDD 概念
- 初期开发速度较慢
- 需要更多的前期设计

⚠️ **代码量增加**

- 更多的抽象层
- 更多的接口定义
- 约 20% 的代码增量

⚠️ **过度设计风险**

- 简单 CRUD 可能过度设计
- 需要权衡复杂度

## 最佳实践

### DO ✅

1. **从核心领域开始** - 目标、任务等核心模块使用完整 DDD
2. **使用通用语言** - 代码命名与业务语言一致
3. **小聚合** - 聚合尽可能小，减少事务范围
4. **领域事件通信** - 模块间通过事件解耦
5. **富领域模型** - 业务逻辑放在实体中，避免贫血模型
6. **构造函数注入** - Use Case 通过构造函数接收依赖，便于测试
7. **静态工厂方法** - 提供 `fromContainer()` 简化生产环境使用

### DON'T ❌

1. **简单 CRUD 不要过度设计** - 如用户设置等简单模块
2. **不要泄露领域对象** - API 返回 DTO 而非实体
3. **不要在实体中依赖基础设施** - 保持领域层纯净
4. **不要忽视边界上下文** - 不同模块的相同概念可以不同
5. **不要过早抽象** - 根据需求演进，不要一开始就全部抽象
6. **Domain 层不要引用 Container** - 依赖注入是技术细节
7. **Application 层避免直接 new 依赖** - 使用注入或工厂方法

## 与主流项目对比

### 主流 DDD 项目参考

| 项目                                                                      | Stars | 特点                            |
| ------------------------------------------------------------------------- | ----- | ------------------------------- |
| [domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon) | 14k+  | NestJS + 六边形架构，完整 CQRS  |
| [ddd-forum](https://github.com/stemmlerjs/ddd-forum)                      | 2k+   | TypeScript + Clean Architecture |
| [IDDD_Samples](https://github.com/VaughnVernon/IDDD_Samples)              | 4k+   | Java 参考实现，Event Sourcing   |

### MemoFlow 的架构选择

| 方面                   | 主流方案                  | MemoFlow 选择                      | 理由                   |
| ---------------------- | ------------------------- | ---------------------------------- | ---------------------- |
| **DI 框架**            | TSyringe/InversifyJS      | 自定义 DIContainer                 | 轻量、无装饰器依赖     |
| **CQRS**               | 完全分离 Commands/Queries | 暂未分离                           | 复杂度权衡，后续可演进 |
| **Domain Events**      | 完整实现                  | 基础实现                           | 按需引入               |
| **Ports 位置**         | Application 层            | Infrastructure 层                  | 简化依赖关系           |
| **Client/Server 分离** | 通常不分                  | 分离 (domain-client/domain-server) | 支持多端共享           |

### Vertical Slicing vs Horizontal Layering

```
# Horizontal Layering (传统分层 - 不推荐)
src/
├── controllers/     ← 所有 Controller
├── services/        ← 所有 Service
├── repositories/    ← 所有 Repository
└── entities/        ← 所有 Entity

# Vertical Slicing (垂直切片 - MemoFlow 采用)
packages/
├── domain-client/src/
│   ├── goal/        ← Goal 模块完整领域
│   ├── task/        ← Task 模块完整领域
│   └── schedule/    ← Schedule 模块完整领域
├── application-client/src/
│   ├── goal/        ← Goal 模块所有 Use Cases
│   ├── task/
│   └── schedule/
└── infrastructure-client/src/
    ├── goal/        ← Goal 模块 Adapters
    ├── task/
    └── schedule/
```

**优势**: 相关代码放在一起，修改某个功能时只需关注一个目录。

## 相关决策

- [ADR-001: 使用 Nx Monorepo](./ADR-001-use-nx-monorepo.md) - Monorepo 支持包的清晰分层
- [ADR-003: 事件驱动架构](./ADR-003-event-driven-architecture.md) - 领域事件是 DDD 的关键部分

## 未来演进方向

### 可考虑的改进

1. **引入 CQRS** - 将读写操作分离，复杂查询直接访问数据库
2. **完善 Domain Events** - 添加事件总线，实现跨模块解耦
3. **Ports 移到 Application 层** - 更严格的依赖反转
4. **引入成熟 DI 框架** - 如 TSyringe/Brandi，支持装饰器注入

### 演进示例：CQRS 分离

```typescript
// 当前：Use Case 同时处理读写
export class GetGoal {
  async execute(uuid: string): Promise<Goal> {
    /* ... */
  }
}

export class CreateGoal {
  async execute(input: CreateGoalRequest): Promise<Goal> {
    /* ... */
  }
}

// 未来：Commands 和 Queries 分离
// commands/
export class CreateGoalCommand {
  constructor(public readonly input: CreateGoalRequest) {}
}

export class CreateGoalHandler implements ICommandHandler<CreateGoalCommand> {
  async execute(command: CreateGoalCommand): Promise<Goal> {
    // 走完整 Domain 逻辑
  }
}

// queries/
export class GetGoalQuery {
  constructor(public readonly uuid: string) {}
}

export class GetGoalHandler implements IQueryHandler<GetGoalQuery> {
  async execute(query: GetGoalQuery): Promise<GoalReadModel> {
    // 可直接查数据库，不经过 Domain
  }
}
```

## 参考资料

- [Domain-Driven Design (Eric Evans)](https://www.domainlanguage.com/ddd/)
- [Implementing Domain-Driven Design (Vaughn Vernon)](https://vaughnvernon.com/)
- [DDD Reference](https://www.domainlanguage.com/ddd/reference/)
- [domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon) - TypeScript DDD 参考实现
- [ddd-forum](https://github.com/stemmlerjs/ddd-forum) - Clean Architecture + DDD
- [[ddd-patterns|DDD 模式指南]] - 项目内 DDD 实践

---

**教训**: DDD 不是银弹，但对于复杂业务系统是正确选择。关键是找到合适的应用边界，不要过度设计简单模块。Container 属于 Infrastructure 层，Domain 和 Application 层应通过构造函数注入依赖，保持对 DI 实现的无知。
