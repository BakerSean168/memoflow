# ADR-024: ApplicationService 框架解耦方案

**状态：** 已接受 (2025-01-18)  
**决策者：** Architecture Team + AI Code Review  
**影响范围：** 所有 Web 应用模块的 ApplicationService 层

---

## 问题

### 当前状态

Web 应用中的 ApplicationService 存在严重的框架耦合问题：

1. **Store 直接耦合** - Services 直接导入并调用 Pinia/Zustand stores

   ```typescript
   // ❌ 当前做法
   import { useAuthenticationStore } from '../../presentation/stores/authenticationStore';

   export class AuthenticationService {
     async login(request: LoginRequest) {
       const response = await this.apiClient.login(request);
       const store = useAuthenticationStore(); // ← 框架耦合
       store.setToken(response.tokens.accessToken);
     }
   }
   ```

2. **无法提取到 Packages** - 这样的 Services 无法在 Packages 中重用
3. **职责混乱** - Services 既处理业务逻辑又处理 UI 状态
4. **难以测试** - Store 依赖导致难以进行单元测试

### 影响

- ✗ 8 个模块受影响（account, ai, authentication, goal, reminder, task, setting）
- ✗ 22+ 个 Services 有框架依赖
- ✗ 代码无法在 Desktop/Server 环境中重用
- ✗ 20% 的代码提取工作停滞

---

## 决策

### 核心方案

**ApplicationService 只负责业务逻辑和数据获取，不负责 Store 管理。**

具体做法：

1. **Service 层** - 只处理业务逻辑，返回纯数据对象
2. **Composables 层** - 调用 Service，管理 Pinia/Zustand stores
3. **分离关注点** - 清晰划分业务逻辑和 UI 协调

### 代码变更示例

#### ✅ 修改前

```typescript
// ❌ 有框架耦合的 Service
export class AuthenticationService {
  async login(request: LoginRequest) {
    const response = await this.apiClient.login(request);

    // ❌ 直接操作 Store
    const store = useAuthenticationStore();
    store.setTokens(response.tokens);
    store.setUser(response.user);
    store.setIsAuthenticated(true);

    return response;
  }
}
```

#### ✅ 修改后

```typescript
// ✅ 框架无关的 Service
export class AuthenticationService {
  async login(request: LoginRequest): Promise<LoginResponse> {
    // ✅ 只做业务逻辑 + 返回数据
    return await this.apiClient.login(request);
  }

  async logout(userId: string): Promise<void> {
    // ✅ 只做业务逻辑
    return await this.apiClient.logout(userId);
  }

  async refreshToken(token: string): Promise<AuthTokens> {
    // ✅ 只做业务逻辑
    return await this.apiClient.refreshToken(token);
  }
}
```

#### ✅ Composables 处理 Store

```typescript
// ✅ Composables 负责 Store 管理
export function useAuthentication() {
  const authStore = useAuthenticationStore();
  const authService = new AuthenticationService(authApiClient);

  async function login(request: LoginRequest) {
    try {
      // ✅ 调用 Service 获取数据
      const response = await authService.login(request);

      // ✅ Composables 负责 Store 更新
      authStore.setTokens(response.tokens);
      authStore.setUser(response.user);
      authStore.setIsAuthenticated(true);

      return response;
    } catch (error) {
      authStore.setError(error.message);
      throw error;
    }
  }

  async function logout() {
    try {
      const userId = authStore.user?.id;
      if (userId) {
        await authService.logout(userId); // ← 业务逻辑
      }
      authStore.clearAuth(); // ← Store 操作
    } catch (error) {
      authStore.setError(error.message);
      throw error;
    }
  }

  return {
    login,
    logout,
    isAuthenticated: computed(() => authStore.isAuthenticated),
    user: computed(() => authStore.user),
    error: computed(() => authStore.error),
  };
}
```

---

## 理由

### 为什么选择这个方案？

| 因素               | 说明                                           |
| ------------------ | ---------------------------------------------- |
| **清晰的职责分工** | Service = 业务逻辑，Composables = UI 协调      |
| **框架无关性**     | Services 可以提取到 Packages，在任何环境中运行 |
| **易于测试**       | Service 无副作用，只需测试数据转换             |
| **实施简单**       | 只需删除 Store 操作，添加 return 语句          |
| **改动最小**       | 对现有功能影响最小                             |
| **标准架构**       | 符合分层架构最佳实践                           |

### 对比其他方案

**方案 A: 事件驱动**

- ✓ 框架无关
- ✗ 需要创建事件总线和事件定义
- ✗ 流程不够直观

**方案 B: 依赖注入**

- ✓ 框架无关
- ✗ 需要定义接口和实现
- ✗ 实施复杂度高

**方案 C: 服务只返回数据（本方案）** ✅

- ✓ 框架无关
- ✓ 最简单直接
- ✓ 职责最清晰
- ✓ 改动最小

---

## 架构影响

### 分层图

```
┌──────────────────────────────────────────────┐
│ Packages (Framework-Agnostic)                │
├──────────────────────────────────────────────┤
│ ApplicationService                            │
│  ✓ 业务逻辑                                  │
│  ✓ API 调用                                  │
│  ✓ DTO → Entity 转换                        │
│  ✓ 返回纯数据对象                            │
│  ✓ 可提取到 Web/Desktop/Server               │
└──────────────────────────────────────────────┘
           ↓ 返回纯数据 ↓
┌──────────────────────────────────────────────┐
│ Web Application (Framework-Aware)            │
├──────────────────────────────────────────────┤
│ Composables (Vue 特有)                       │
│  ✓ 调用 Service 获取数据                     │
│  ✓ 管理 Pinia/Zustand stores                 │
│  ✓ 错误处理 + 响应式状态                     │
│  ✓ UI 协调逻辑                               │
└──────────────────────────────────────────────┘
           ↓ 状态驱动 UI ↓
┌──────────────────────────────────────────────┐
│ Vue Components                                │
└──────────────────────────────────────────────┘
```

### 提取目标

- ✅ Services 从 Web 提取到 Packages
- ✅ Composables 保留在 Web（因为依赖 Vue）
- ✅ 实现真正的框架无关业务逻辑层

---

## 实施方案

### Pilot with Simple Modules (account)

**修改范围：**

- `apps/web/src/modules/account/application/services/AccountProfileApplicationService.ts`
- `apps/web/src/modules/account/application/services/AccountSubscriptionApplicationService.ts`

**步骤：**

1. 删除 Store 导入
2. 删除 Store 操作
3. 修改方法返回类型
4. 添加返回语句

**验证：**

- 类型检查通过
- 单元测试通过
- 功能测试通过

### Roll Out to Remaining Modules

**优先级顺序：**

1. Authentication（7 个 Services）- 最影响核心功能
2. Goal（GoalSyncApplicationService）- 作为中等复杂度
3. 其他模块（Reminder, Task, Setting等）

### Extract to Packages

**验证清单：**

- [ ] Service 中没有 Vue/Vuetify/Zustand 导入
- [ ] Service 返回纯数据对象
- [ ] 所有依赖来自 contracts 或 infrastructure
- [ ] 复制到 Packages 后功能完全相同
- [ ] Web 中的 Composables 正确调用

---

## 受影响的部分

### 需要修改的代码

| 模块           | Services | 优先级    |
| -------------- | -------- | --------- |
| account        | 2        | P0 (试点) |
| authentication | 7        | P1        |
| goal           | 1        | P1        |
| ai             | 4        | P2        |
| reminder       | 4        | P2        |
| task           | 2        | P2        |
| setting        | 1        | P2        |

### 需要创建/修改的 Composables

- 为每个修改的 Service 对应的功能创建或修改 Composables
- 确保原有功能不变

---

## 迁移清单

### 对于每个 Service

- [ ] 删除所有 Store 相关导入
- [ ] 删除所有 Store 操作代码
- [ ] 修改返回类型为具体的数据对象
- [ ] 添加 return 语句返回数据

### 对于每个 Composables

- [ ] 创建或修改 Composables 调用 Service
- [ ] 在 Composables 中处理 Store 更新
- [ ] 保持原有的组件 API 不变

### 测试

- [ ] 单元测试 (Service 数据转换)
- [ ] 集成测试 (Composables Store 更新)
- [ ] 功能测试 (UI 表现正常)
- [ ] 类型检查 (tsc --noEmit)

---

## 后续步骤

1. **立即执行** - 修改 account 模块作为试点
2. **验证成功** - 功能正常 + 类型正确
3. **总结经验** - 形成标准化流程
4. **推广执行** - 应用到其他模块
5. **最终提取** - 将 Services 正式移到 Packages

---

## 相关文档

- [EXTRACTION-FIX-PLAN.md](../../_bmad-output/EXTRACTION-FIX-PLAN.md) - 具体实施细节
- [AUDIT-FINAL-SUMMARY.md](../../_bmad-output/AUDIT-FINAL-SUMMARY.md) - 问题分析
- [COMPLETE-EXTRACTION-AUDIT.md](../../_bmad-output/COMPLETE-EXTRACTION-AUDIT.md) - 完整审计

---

## 记录历史

| 日期       | 状态   | 备注                             |
| ---------- | ------ | -------------------------------- |
| 2025-01-18 | 已接受 | 初始决策 - 开始实施 account 模块 |
