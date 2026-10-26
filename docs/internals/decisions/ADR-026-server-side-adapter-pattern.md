---
tags:
  - adr
  - architecture
  - adapter-pattern
  - clean-architecture
description: ADR-026 - Server-Side Adapter Pattern for Express/IPC Transport Layers
created: 2026-02-19
updated: 2026-02-19
---

# ADR-026: Server-Side Adapter Pattern

**状态**: ✅ 已采纳  
**日期**: 2026-02-19

## 背景

Client 侧已完整实现适配器模式（HTTP/IPC Adapter → Port Interface → Application Service），但 Server 侧（Routes 层）存在以下问题：

1. **重复代码过多**：每个路由都有重复的 try-catch、Zod 验证和错误格式化逻辑
2. **缺少统一 Controller 层**：验证和业务调用直接写在 routes.ts 中
3. **IPC/HTTP 路由逻辑分离**：两个传输层独立维护，验证可能不一致

### 可选方案

1. **方案 A：轻量级适配器函数** — 创建 `expressAdapter` / `ipcAdapter` 包装函数，保持现有结构
2. **方案 B：完整 Controller 层** — 在每个模块引入 Controller，将验证逻辑下沉
3. **方案 C：两阶段迁移** — 先实施方案 A 减少样板代码，再逐步引入 Controller 层

## 决策

选择 **方案 C：两阶段迁移**

### 第一阶段：适配器函数（本 ADR 覆盖范围）

创建通用的传输层适配器：

- `expressAdapter<T>` — 将 Controller 函数适配为 Express 路由处理器
- `expressAdapterWithValidation<T, S>` — 带 Zod 验证的 Express 适配器
- `ipcAdapter<T>` — 将 Controller 函数适配为 IPC 处理器
- `ipcAdapterWithValidation<T, S>` — 带 Zod 验证的 IPC 适配器

### 第二阶段：Controller 层（后续逐步迁移）

为每个模块创建 Controller 类，封装验证逻辑，使 HTTP 和 IPC 共享相同的业务调用路径。

## 理由

### 为什么选择这个方案？

1. **渐进式改进**：不需要一次性重构所有模块
2. **即时收益**：适配器函数立即减少 50%+ 的路由样板代码
3. **向后兼容**：现有路由可以逐步迁移
4. **关注点分离**：Routes 层只负责路由映射，适配器负责协议转换

### 为什么不选其他方案？

- **方案 A**：缺少 Controller 层的长期规划
- **方案 B**：一次性重构风险高、工作量大

## 实施

### 适配器位置

```
packages/utils/src/result/
├── express-adapter.ts   — Express 适配器函数
├── ipc-adapter.ts       — IPC 适配器函数
└── index.ts             — 统一导出
```

### 使用方式

```typescript
// Before (重复代码)
router.post('/', auth, async (req, res) => {
  const parsed = CreateGoalSchema.safeParse(req.body);
  if (!parsed.success) {
    /* 5+ lines of error handling */
  }
  const identityId = getIdentityId(req);
  if (!identityId) {
    /* 3+ lines */
  }
  const result = await handlers.createGoal.execute(parsed.data, { identityId });
  respondWithResult(res, result, 201);
});

// After (简洁、统一)
router.post(
  '/',
  auth,
  expressAdapterWithValidation(
    CreateGoalSchema,
    (data, ctx) => handlers.createGoal.execute(data, ctx),
    { successStatus: 201 },
  ),
);
```

## 影响

### 正面影响

- 减少 Routes 层 50%+ 的样板代码
- 统一错误处理和验证逻辑
- 为 HTTP/IPC 共享 Controller 奠定基础
- 更容易编写测试

### 负面影响

- 增加一层间接调用（可忽略的性能影响）
- 需要学习适配器 API

## 相关决策

- ADR-008: API Response Format — 定义了统一的 HttpResponse 格式
- ADR-012: Error Handling — 定义了 Result Pattern 和错误处理规范
- ADR-021: API Routes File Organization — 定义了路由文件组织方式
- ADR-024: ApplicationService Framework Decoupling — 框架解耦原则
- ADR-025: Module Composition Pattern — 模块组合模式

## 参考资料

- [Clean Architecture - Uncle Bob](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Adapter Pattern](https://refactoring.guru/design-patterns/adapter)

---

**教训**: 适配器模式不仅适用于客户端，服务端同样需要统一的传输层适配来减少重复代码和保持一致性。
