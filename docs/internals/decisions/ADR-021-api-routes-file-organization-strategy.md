# ADR-021: API 路由文件组织策略

**Date**: 2026-01-19  
**Status**: Accepted  
**Authors**: Architecture Team  
**Related ADRs**: [ADR-020: API Server Unified Extraction Strategy](./ADR-020-api-server-unified-extraction-strategy.md)

---

## Context

## Implementation note (Residual 619 / 2026-07-22)

Historical route samples used the removed `@memoflow/transport-contracts/result` package. Use `@memoflow/transport-contracts/result` `createHttpResponseBuilder` / `Result` + `expressAdapter` / `RouteRegistrar` instead.

在 ADR-020 中，我们决定将所有业务逻辑从 API 项目迁移到 packages。随之而来的是如何组织 API 中剩余的路由文件的问题。

**现状问题**:

- 单个路由文件变得过大（200-700+ 行）
- 难以并行开发和维护
- 不清楚各部分的职责边界
- 类似 usecase 的拆分模式在应用层使用，但路由层没有应用

**需要的解决方案**:

- 路由文件按功能域拆分
- 每个文件职责单一，便于维护和测试
- 统一的组织规范，易于团队协作
- 保留 Swagger 文档的关联性

---

## Decision

我们采用 **"一个 Router，一个文件"** 的组织策略，类似应用层 usecase 的拆分方式。

### 路由组织规范

#### 1. 文件命名规范

```
modules/[module]/interface/http/
├── index.ts                           # 统一导出聚合器
├── [module]-[feature].routes.ts       # 功能路由文件
└── [module]-[feature].routes.ts
```

**命名示例**:

- `authentication-login.routes.ts` - 登录相关
- `authentication-session.routes.ts` - 会话管理
- `authentication-2fa.routes.ts` - 双因素认证
- `authentication-apikey.routes.ts` - API 密钥管理
- `account-profile.routes.ts` - 个人资料
- `account-deletion.routes.ts` - 账户删除
- `goal-crud.routes.ts` - 基本 CRUD
- `goal-status.routes.ts` - 状态操作
- `goal-keyresult.routes.ts` - 关键结果管理

#### 2. 单个路由文件的结构

```typescript
/**
 * [Module] [Feature] Routes
 * 功能描述: 处理 [具体功能] 的 HTTP 路由
 *
 * 端点:
 * - POST   /path              - 操作描述
 * - GET    /path/:id          - 操作描述
 */

import type { Router } from 'express';
import { Router as ExpressRouter } from 'express';
import type { AuthenticatedRequest } from '../../../../shared/infrastructure/http/middlewares/authMiddleware';
import { authMiddleware } from '../../../../shared/infrastructure/http/middlewares/authMiddleware';
import { SomeApplicationService } from '@memoflow/application-server';
import { createHttpResponseBuilder } from '@memoflow/transport-contracts/result';
import { createLogger } from '@memoflow/utils';

const logger = createLogger('FeatureRoutes');
const responseBuilder = createHttpResponseBuilder();

/**
 * 注册功能路由
 *
 * 用法：
 *   import { registerFeatureRoutes } from './feature.routes';
 *   router.use('/base-path', registerFeatureRoutes());
 */
export function registerFeatureRoutes(): Router {
  const router: Router = ExpressRouter();

  /**
   * @swagger
   * /base-path/endpoint:
   *   post:
   *     tags: [Tag]
   *     summary: 端点描述
   *     responses:
   *       201:
   *         description: 成功
   */
  router.post('/endpoint', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const service = await SomeApplicationService.getInstance();
      const result = await service.method(params);
      res.status(201).json(responseBuilder.success(result, 'Success message'));
    } catch (error) {
      logger.error('Operation failed:', error);
      throw error;
    }
  });

  // 其他端点...

  return router;
}
```

#### 3. 统一导出文件 (index.ts)

```typescript
/**
 * [Module] HTTP Routes
 * 聚合所有 [Module] 模块的 HTTP 路由
 */

import type { Router } from 'express';
import { Router as ExpressRouter } from 'express';
import { registerFeature1Routes } from './[module]-feature1.routes';
import { registerFeature2Routes } from './[module]-feature2.routes';
import { registerFeature3Routes } from './[module]-feature3.routes';

/**
 * 注册 [Module] 所有路由
 *
 * 用法：
 *   import { registerModuleRoutes } from './modules/[module]/interface/http';
 *   api.use('/[base-path]', registerModuleRoutes());
 */
export function registerModuleRoutes(): Router {
  const router: Router = ExpressRouter();

  // 组合所有功能路由
  router.use('/', registerFeature1Routes());
  router.use('/', registerFeature2Routes());
  router.use('/', registerFeature3Routes());

  return router;
}

export default registerModuleRoutes();
```

#### 4. 在 app.ts 中使用

```typescript
import { registerAuthenticationRoutes } from './modules/authentication/interface/http';
import { registerAccountRoutes } from './modules/account/interface/http';
import { registerGoalRoutes } from './modules/goal/interface/http';
// ... 其他模块

const api = express.Router();

// 注册所有模块路由
api.use('/auth', registerAuthenticationRoutes());
api.use('/accounts', registerAccountRoutes());
api.use('/goals', registerGoalRoutes());
// ...

app.use('/api', api);
```

---

## Rationale

### 为什么选择这种方式

1. **单一职责原则**
   - 每个文件只关注一个功能域
   - 易于理解和修改
   - 降低认知负荷

2. **与应用层保持一致**
   - 应用层已使用 usecase 拆分
   - 路由层采用相同的拆分思路
   - 整体架构更加统一

3. **支持并行开发**
   - 不同功能可以独立开发
   - 减少合并冲突
   - 提高团队效率

4. **便于测试**
   - 每个功能路由可独立测试
   - 测试文件组织更清晰
   - 覆盖率更易统计

5. **易于导航**
   - IDE 中快速查找功能
   - 文件名即功能说明
   - 整体结构一目了然

6. **保留文档关联**
   - Swagger 注释紧贴代码
   - 修改代码时自然更新文档
   - 不易产生文档过期问题

---

## Consequences

### 正面影响

✅ **代码质量**

- 文件大小合理（30-100 行）
- 代码更易阅读和维护
- 天然的模块隔离

✅ **开发效率**

- 功能定位快速
- 并行开发友好
- 减少合并冲突

✅ **架构一致性**

- 与应用层拆分方式一致
- 整体模式统一
- 易于团队理解

### 负面影响

⚠️ **文件数量增加**

- 单模块从 1-2 个文件 → 3-8 个文件
- 项目树结构稍微复杂
- 需要 index.ts 来聚合

**缓解方案**: IDE 的快速导航和搜索能有效处理这个问题

---

## Implementation Guidelines

### 如何拆分路由功能

**原则**:

1. 按 HTTP 资源和操作类型分组
2. 相关的功能放在同一文件
3. 避免功能交叉

**示例 - Authentication 模块**:

```
authentication/interface/http/
├── index.ts
├── authentication-login.routes.ts        # 登录/注册/登出
├── authentication-session.routes.ts      # 会话管理 (刷新、撤销等)
├── authentication-2fa.routes.ts          # 双因素认证
├── authentication-apikey.routes.ts       # API 密钥管理
└── authentication-password.routes.ts     # 密码修改、重置
```

**示例 - Account 模块**:

```
account/interface/http/
├── index.ts
├── account-profile.routes.ts             # 个人资料查看和更新
├── account-session.routes.ts             # 会话管理
└── account-deletion.routes.ts            # 账户删除
```

**示例 - Goal 模块**:

```
goal/interface/http/
├── index.ts
├── goal-crud.routes.ts                   # 基本 CRUD
├── goal-status.routes.ts                 # 完成、归档、激活
├── goal-keyresult.routes.ts              # 关键结果管理
├── goal-record.routes.ts                 # 进展记录
├── goal-review.routes.ts                 # 评审
└── goal-search.routes.ts                 # 搜索和统计
```

### 文件大小建议

- **最小**: 20 行 (至少包含一个路由)
- **理想**: 30-80 行 (3-8 个相关端点)
- **最大**: 100 行 (超过则考虑拆分)

### 导出约定

- 每个功能文件导出 `register[Feature]Routes()` 函数
- index.ts 聚合所有功能文件
- 功能文件中 **不暴露 router 实例**，仅导出工厂函数

```typescript
// ✅ 正确
export function registerFeatureRoutes(): Router {
  const router = Router();
  // 添加路由
  return router;
}

// ❌ 不正确
export const router = Router();
router.post('/path', handler);
export default router;
```

---

## Examples

### 完整示例 - Authentication 模块

**authentication-login.routes.ts** (65 行):

```typescript
/**
 * Authentication Login Routes
 * 处理登录、注册、登出相关的 HTTP 路由
 *
 * 端点:
 * - POST /auth/register       - 用户注册
 * - POST /auth/login          - 用户登录
 * - POST /auth/logout         - 用户登出
 */

import type { Router } from 'express';
import { Router as ExpressRouter } from 'express';
import type { AuthenticatedRequest } from '../../../../shared/infrastructure/http/middlewares/authMiddleware';
import {
  authMiddleware,
  deviceInfoMiddleware,
} from '../../../../shared/infrastructure/http/middlewares/index';
import {
  AuthenticationApplicationService,
  AccountApplicationService,
} from '@memoflow/application-server';
import { createHttpResponseBuilder } from '@memoflow/transport-contracts/result';
import { createLogger } from '@memoflow/utils';

const logger = createLogger('AuthenticationLoginRoutes');
const responseBuilder = createHttpResponseBuilder();

export function registerLoginRoutes(): Router {
  const router: Router = ExpressRouter();

  /**
   * @swagger
   * /api/auth/register:
   *   post:
   *     tags: [Authentication]
   *     summary: 用户注册
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [username, email, password]
   */
  router.post('/register', deviceInfoMiddleware, async (req, res) => {
    try {
      const { username, email, password, profile } = req.body;
      const result = await AccountApplicationService.register({
        username,
        email,
        password,
        profile,
      });
      res.status(201).json(responseBuilder.success(result, 'Registration successful'));
    } catch (error) {
      logger.error('Register failed:', error);
      throw error;
    }
  });

  /**
   * @swagger
   * /api/auth/login:
   *   post:
   *     tags: [Authentication]
   *     summary: 用户登录
   */
  router.post('/login', deviceInfoMiddleware, async (req, res) => {
    try {
      const { identifier, password, deviceInfo, ipAddress, location } = req.body;
      const result = await AuthenticationApplicationService.login({
        identifier,
        password,
        deviceInfo,
        ipAddress,
        location,
      });
      res.json(responseBuilder.success(result, 'Login successful'));
    } catch (error) {
      logger.error('Login failed:', error);
      throw error;
    }
  });

  /**
   * @swagger
   * /api/auth/logout:
   *   post:
   *     tags: [Authentication]
   *     summary: 用户登出
   *     security: [bearerAuth: []]
   */
  router.post('/logout', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      await AuthenticationApplicationService.logout(req.user.sessionId);
      res.json(responseBuilder.success(null, 'Logout successful'));
    } catch (error) {
      logger.error('Logout failed:', error);
      throw error;
    }
  });

  return router;
}
```

**authentication-session.routes.ts** (60 行):

```typescript
/**
 * Authentication Session Routes
 * 处理会话管理相关的 HTTP 路由
 *
 * 端点:
 * - POST /auth/refresh        - 刷新 Token
 * - GET  /auth/sessions       - 获取活跃会话
 * - DELETE /auth/sessions/:id - 撤销会话
 * - POST /auth/logout-all     - 全设备登出
 */

import type { Router } from 'express';
import { Router as ExpressRouter } from 'express';
import type { AuthenticatedRequest } from '../../../../shared/infrastructure/http/middlewares/authMiddleware';
import { authMiddleware } from '../../../../shared/infrastructure/http/middlewares/authMiddleware';
import { SessionManagementApplicationService } from '@memoflow/application-server';
import { createHttpResponseBuilder } from '@memoflow/transport-contracts/result';
import { createLogger } from '@memoflow/utils';

const logger = createLogger('AuthenticationSessionRoutes');
const responseBuilder = createHttpResponseBuilder();

export function registerSessionRoutes(): Router {
  const router: Router = ExpressRouter();

  /**
   * @swagger
   * /api/auth/refresh:
   *   post:
   *     tags: [Authentication]
   *     summary: 刷新访问令牌
   */
  router.post('/refresh', async (req, res) => {
    try {
      const { refreshToken } = req.body;
      const result = await SessionManagementApplicationService.refreshSession(refreshToken);
      res.json(responseBuilder.success(result, 'Session refreshed successfully'));
    } catch (error) {
      logger.error('Refresh token failed:', error);
      throw error;
    }
  });

  /**
   * @swagger
   * /api/auth/sessions:
   *   get:
   *     tags: [Authentication]
   *     summary: 获取活跃会话列表
   *     security: [bearerAuth: []]
   */
  router.get('/sessions', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const sessions = await SessionManagementApplicationService.getActiveSessions(
        req.user.accountUuid,
      );
      res.json(responseBuilder.success(sessions, 'Active sessions retrieved'));
    } catch (error) {
      logger.error('Get active sessions failed:', error);
      throw error;
    }
  });

  /**
   * @swagger
   * /api/auth/sessions/{sessionUuid}:
   *   delete:
   *     tags: [Authentication]
   *     summary: 撤销特定会话
   *     security: [bearerAuth: []]
   */
  router.delete(
    '/sessions/:sessionUuid',
    authMiddleware,
    async (req: AuthenticatedRequest, res) => {
      try {
        await SessionManagementApplicationService.revokeSession(
          req.params.sessionUuid,
          req.user.accountUuid,
        );
        res.json(responseBuilder.success(null, 'Session revoked'));
      } catch (error) {
        logger.error('Revoke session failed:', error);
        throw error;
      }
    },
  );

  /**
   * @swagger
   * /api/auth/logout-all:
   *   post:
   *     tags: [Authentication]
   *     summary: 全设备登出
   *     security: [bearerAuth: []]
   */
  router.post('/logout-all', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      await SessionManagementApplicationService.logoutAll(req.user.accountUuid);
      res.json(responseBuilder.success(null, 'Logout all devices successful'));
    } catch (error) {
      logger.error('Logout all failed:', error);
      throw error;
    }
  });

  return router;
}
```

**index.ts** (20 行):

```typescript
import type { Router } from 'express';
import { Router as ExpressRouter } from 'express';
import { registerLoginRoutes } from './authentication-login.routes';
import { registerSessionRoutes } from './authentication-session.routes';
import { registerTwoFactorRoutes } from './authentication-2fa.routes';
import { registerApiKeyRoutes } from './authentication-apikey.routes';
import { registerPasswordRoutes } from './authentication-password.routes';

export function registerAuthenticationRoutes(): Router {
  const router: Router = ExpressRouter();

  router.use('/', registerLoginRoutes());
  router.use('/', registerSessionRoutes());
  router.use('/', registerTwoFactorRoutes());
  router.use('/', registerApiKeyRoutes());
  router.use('/', registerPasswordRoutes());

  return router;
}

export default registerAuthenticationRoutes();
```

---

## Related Decisions

- **ADR-020**: API Server Unified Extraction Strategy
- **ADR-009**: Standard Clean Architecture Layers

---

## References

- Express.js Router Documentation
- Module organization best practices
- Single Responsibility Principle

---

**Decision**: ✅ Approved  
**Review Date**: 2026-01-19  
**Implementation Target**: All API modules
