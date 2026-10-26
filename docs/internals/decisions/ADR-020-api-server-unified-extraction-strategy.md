# ADR-020: API Server 统一提取策略（Domain/Application/Infrastructure 层到 Packages）

**Date**: 2026-01-19  
**Status**: ACCEPTED  
**Context**: 为了实现 API 和 Web 的架构一致性，统一的分层代码提取策略

---

## 问题陈述

### 背景

- Web 应用已完成 100% 的架构提取：Domain、Application、Infrastructure 层代码全部移到 `packages/` 中
- API 项目仍然有大量 Application/Infrastructure 层代码散落在 `apps/api/src/modules/` 中
- API 和 Web 之间存在架构不对称：Web 只保留 Presentation（Composables/Components），API 仍然混杂多层代码

### 核心问题

1. **代码重复与不可复用**：API 中的业务逻辑无法在其他应用（Desktop、CLI 等）中直接复用
2. **框架耦合**：应用层服务与 Express.js HTTP 层耦合，减少了可测试性和复用性
3. **架构不一致**：Web 和 API 的分层逻辑完全不同，增加了学习和维护成本
4. **API 项目过重**：API 项目承载了太多与 HTTP 框架无关的业务逻辑

---

## 提议的解决方案：方案 B（统一提取）

### 核心思想

**所有框架无关的代码都应该在 packages 中，apps 只负责框架适配和初始化。**

```
packages/
  ├── domain-server/           ✅ Entities, Aggregates, Validators, DDD 模型
  ├── application-server/      ✅ Use Cases, Application Services, 业务流程编排
  ├── infrastructure-server/   ✅ Repositories, External APIs, DB 访问, DI Containers
  └── contracts/               ✅ Request/Response DTOs, 类型定义

apps/
  ├── api/
  │   └── src/
  │       ├── main.ts                    (初始化 & DI Setup)
  │       ├── middleware/                (HTTP 中间件：验证、错误处理等)
  │       ├── error-handler.ts           (统一错误响应格式)
  │       └── modules/
  │           ├── [module-name]/
  │           │   ├── routes.ts          (仅 HTTP 路由 + 参数解析 + 响应组织)
  │           │   └── types.ts           (Express-specific 类型，如 Request/Response)
  │           └── ...
  │
  ├── desktop/
  │   └── (可直接复用 packages 中的所有代码)
  │
  └── web/
      └── (已完成，纯 presentation 层)
```

### 关键架构决策

#### 1. **Application/Infrastructure 完全迁移到 Packages**

- **packages/application-server/**：所有 Use Cases、Application Services、Business Logic
- **packages/infrastructure-server/**：所有 Repositories、DI Containers、External Integrations
- **packages/domain-server/**：所有 Entities、Aggregates、Domain Services、Value Objects

#### 2. **API 项目只保留 HTTP 适配层**

```typescript
// apps/api/src/modules/goal/routes.ts（极简示例）
export const goalRoutes = (router: Router, container: DIContainer) => {
  const goalService = container.getGoalApplicationService();

  // 创建目标
  router.post('/goals', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await goalService.createGoal(
        req.user.accountUuid,
        req.body, // 已通过中间件验证
      );
      res.json(ResponseBuilder.success(result));
    } catch (error) {
      throw error; // 由全局错误处理器处理
    }
  });

  // 获取目标列表
  router.get('/goals', async (req: AuthenticatedRequest, res: Response) => {
    const goals = await goalService.listGoals(req.user.accountUuid, req.query);
    res.json(ResponseBuilder.success(goals));
  });
};
```

#### 3. **不需要"中间层"（如 Handler/Orchestrator）**

- API Controller 很薄（50-80 行），直接调用 Application Service
- Web Composables 存在的理由：适配 Vue + Pinia 框架
- API 不需要这种适配，直接使用 Application Services

```typescript
// ❌ 不需要这样的中间层
class CreateGoalHandler {
  async execute(request: CreateGoalRequest) { ... }
}

// ✅ 直接使用 Application Service
const goal = await applicationService.createGoal(accountUuid, data);
```

#### 4. **Composition Root 在 Module / Runtime 中**

当前做法是显式的 module factory / composition root，而不是通过单例 `GoalContainer` 提供服务定位。

---

## 优缺点分析

### ✅ 优势

| 优势               | 说明                                                  |
| ------------------ | ----------------------------------------------------- |
| **最大化代码复用** | 所有业务逻辑在 packages，Desktop/CLI 等可直接导入使用 |
| **架构简洁**       | API 项目只有框架适配，无沉重的应用逻辑                |
| **易于测试**       | Application Services 完全框架无关，易单元测试         |
| **Web/API 对称**   | 两个应用使用完全相同的业务逻辑分层                    |
| **清晰职责边界**   | Packages 负责业务，Apps 负责框架                      |

### ⚠️ 潜在挑战

| 挑战               | 解决方案                                            |
| ------------------ | --------------------------------------------------- |
| **依赖装配复杂性** | 通过 composition root 显式管理，避免服务定位器      |
| **参数验证重复**   | 中间件统一验证（Zod/class-validator），DTO 类型保证 |
| **错误处理分散**   | 全局 Express 错误处理器，统一映射异常               |
| **异步事件处理**   | Event Emitter 在 packages，App 订阅即可             |

---

## 实现步骤

### Create Base Infrastructure（同步进行）

1. ✅ 检查现有 packages 结构
2. ⏳ 创建统一 module composition root 装配模式
3. ⏳ 定义 HTTP routes 文件结构规范

### Incremental Module Extraction（优先级：复杂 → 简单）

**优先级顺序**:

1. **Authentication** - 核心认证，其他模块依赖
2. **Account** - 账户管理基础服务
3. **AI** - 最复杂的模块，多个 adapters
4. **Goal** - 目标管理
5. **Task** - 任务管理
6. **Reminder/Schedule** - 定时任务
7. **Dashboard/Repository/Setting** - 辅助模块
8. **Notification** - 通知系统
9. **Editor** - 编辑器（如果有）

### Verification & Cleanup

- 运行完整测试套件
- 验证 TypeScript 编译零错误
- 删除 API 项目中所有 application/ 和 infrastructure/ 文件夹

---

## 对比：旧方案 vs 新方案

### 旧方案（错误的方向）：在 API 引入 Handler/Orchestrator 中间层

```typescript
// ❌ 旧方案：API 也引入中间层（Web 的 Composables 思路）
Controller → Handler/Orchestrator → Services → Domain
│          └─ 验证、多服务编排、响应组织
└─ 只做 HTTP 解析

问题：
- API 无需框架适配（没有 Vue/Pinia），多了无谓的中间层
- Services 仍然与 Express 耦合
- 代码在 API 项目中，无法复用到 Desktop/CLI
```

### 新方案（方案 B）：完全提取到 Packages

```typescript
// ✅ 新方案：所有业务逻辑到 packages
Packages (可复用)
  ├── Application Services ← 编排多个 Use Cases
  └── Use Cases/Services   ← 单一职责
  └── Domain Models        ← 纯业务规则

API App (只做框架适配)
  ├── routes.ts ← HTTP 路由 + 参数解析
  └── middleware/ ← 验证、错误处理

好处：
- 所有业务逻辑在 packages，Desktop/CLI 可直接复用
- API 项目超简洁（99% 代码删除）
- 完全与 Express 解耦
```

---

## 代码示例

### 提取前（API 项目中混杂多层）

```typescript
// ❌ apps/api/src/modules/goal/application/services/GoalApplicationService.ts
export class GoalApplicationService {
  createGoal(...) { ... }
  updateGoal(...) { ... }
  deleteGoal(...) { ... }
  listGoals(...) { ... }
}

// ❌ apps/api/src/modules/goal/interface/http/GoalController.ts
export class GoalController {
  static async createGoal(req, res) {
    const service = goalModule.api;
    const result = await service.createGoal(...);
    res.json(result);
  }
}
```

### 提取后（分层清晰）

```typescript
// ✅ packages/application-server/src/goal/services/goal-application.service.ts
export class GoalApplicationService {
  createGoal(...) { ... }
  updateGoal(...) { ... }
  deleteGoal(...) { ... }
  listGoals(...) { ... }
}

// ✅ apps/api/src/modules/goal/routes.ts（极简）
export const goalRoutes = (router: Router) => {
  const goalModule = createGoalModule(...);

  router.post('/goals', async (req: AuthenticatedRequest, res: Response) => {
    const goal = await goalModule.api.createGoal(
      req.user.accountUuid,
      req.body
    );
    res.json(ResponseBuilder.success(goal));
  });
};

// ✅ apps/api/src/main.ts
const router = express.Router();
goalRoutes(router);
app.use('/api/goals', router);
```

---

## 关键约定

### 1. Routes 文件名约定

- 文件：`apps/api/src/modules/[module]/routes.ts`
- 导出：`export const [moduleName]Routes(router: Router, container?: DIContainer)`

### 2. 错误处理

- 所有异常在 packages 中定义（CustomErrors）
- API 有全局错误处理器，映射到 HTTP 状态码

### 3. 验证策略

- DTOs 在 `packages/contracts` 中定义
- 中间件使用 Zod/class-validator 进行 HTTP 请求验证
- Application Services 假设输入已验证

### 4. 依赖注入

- DI Container 在 `packages/infrastructure-server` 中
- API 启动时初始化容器，传递给 routes 函数

---

## 预期成果

### 文件数量变化

| 位置                              | 变化                                       |
| --------------------------------- | ------------------------------------------ |
| `apps/api/src/modules/`           | ~50 files → ~20 files（仅 routes + types） |
| `packages/application-server/`    | 新增 200+ files（所有 Services）           |
| `packages/infrastructure-server/` | 新增 150+ files（所有 Repositories + DI）  |

### 代码行数变化

| 区域         | 变化                                   |
| ------------ | -------------------------------------- |
| API 项目     | 删除 ~15,000 行业务逻辑代码            |
| Packages     | 新增 ~15,000 行（移动，非新增）        |
| **总体影响** | 可复用代码量 ↑ 30%，API 项目体积 ↓ 70% |

---

## 相关 ADR

- [ADR-018: Smart Container + Application Service Pattern](./ADR-018-smart-container-application-service-pattern.md)
- [ADR-009: Standard Clean Architecture Layers](./ADR-009-standard-clean-architecture-layers.md)
- [ADR-016: Apps as Containers](./ADR-016-apps-as-containers.md)

---

## 批准人

- Architecture Team: _待批准_
- Tech Lead: _待批准_

---

## 历史

- **2026-01-19**: 初稿，基于 Web 应用提取经验和 API 架构分析
