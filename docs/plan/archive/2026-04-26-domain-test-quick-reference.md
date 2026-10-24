---
tags:
  - reference
  - quick-start
  - testing
  - cheatsheet
description: 领域层测试执行快速参考卡
created: 2026-04-26T22:16:00
---

# 领域层测试执行快速参考卡

## 🎯 当前进度（2026-04-26）

```
✅ 已完成 (80%+)        ⏳ 进行中 (70-79%)      ⏹️ 待启动 (<70%)
├── account (95%)       ├── schedule (77.93%)   ├── editor (0%)
├── ai (84.72%)         └── reminder (59.73%)   ├── governance (78%)
├── authentication
│   (84.01%)
├── goal (92%)
├── notification (89%)
├── domain-shared (100%)
└── task (86%)

完成度：67% | 进行中：17% | 待启动：17%
```

---

## 🔧 常用命令

### 开发流程

```bash
# 1. 快速反馈（无覆盖率检查，推荐开发时使用）
pnpm nx run <module>:test

# 2. 监听模式（改动文件自动重跑）
pnpm nx run <module>:test:watch

# 3. 完成前验证（检查是否达 80%）
pnpm nx run <module>:test:coverage
```

### 全局检查

```bash
# 查看所有 12 个核心模块覆盖率
pnpm test:coverage:domain

# 查看仅 affected 的模块
pnpm test:coverage:affected
```

### CI 流程

```bash
# 必须通过（否则 CI 失败）
pnpm nx affected -t test:coverage
```

---

## 📊 模块优先级与状态

### 优先级 1（已完成 ✅）

| 模块    | 基线 | 目标 | 实际 | 新增测试数 |
| ------- | ---- | ---- | ---- | ---------- |
| account | 95%  | 80%+ | 95%  | 0          |
| task    | 86%  | 80%+ | 86%  | 0          |
| goal    | 92%  | 80%+ | 92%  | 0          |

### 优先级 2（2 已完成 ✅，2 进行中 ⏳）

| 模块           | 基线 | 目标 | 实际   | 新增测试数 | 状态      |
| -------------- | ---- | ---- | ------ | ---------- | --------- |
| ai             | 52%  | 80%+ | 84.72% | 68         | ✅        |
| authentication | 71%  | 80%+ | 84.01% | 32         | ✅        |
| notification   | 89%  | 80%+ | 89%    | 0          | ✅        |
| schedule       | 58%  | 80%+ | 77.93% | 28         | ⏳ 差 2%  |
| reminder       | 52%  | 80%+ | 59.73% | 0          | ⏳ 差 20% |

### 优先级 3（待启动）

| 模块          | 基线 | 目标 | 缺口 | 状态 |
| ------------- | ---- | ---- | ---- | ---- |
| editor        | 0%   | 80%+ | 80%  | ⏹️   |
| domain-shared | 100% | 80%+ | 0    | ✅   |
| governance    | 78%  | 80%+ | 2%   | ⏹️   |
| setting       | 21%  | 80%+ | 59%  | ⏹️   |

---

## 🧪 TDD 测试模式（可复用）

### 三层结构

```typescript
describe('EntityName', () => {
  // Layer 1: 工厂与初始化
  describe('create()', () => {
    it('should create with valid inputs', () => {});
    it('should validate required fields', () => {});
    it('should set defaults', () => {});
  });

  // Layer 2: 业务操作与状态转换
  describe('state transitions', () => {
    it('should transition from A to B', () => {});
    it('should reject invalid transitions', () => {});
    it('should emit events', () => {});
  });

  // Layer 3: 约束与边界
  describe('constraints', () => {
    it('should enforce business rules', () => {});
    it('should handle edge cases', () => {});
    it('should serialize/deserialize', () => {});
  });
});
```

### 通用测试数量指标

- **聚合根（Aggregate）** → 20-30 个测试
- **实体（Entity）** → 15-25 个测试
- **值对象（Value Object）** → 10-20 个测试
- 总计一个"完整"模块 → 50-100+ 个新用例

---

## 📁 已产出的测试文件（参考）

### AI 模块（68 个新测试 ✅）

```
packages/ai/src/domain-server/
├── aggregates/__tests__/ai-conversation.spec.ts (24 tests)
├── entities/__tests__/message.spec.ts (20 tests)
└── value-objects/__tests__/token-usage.spec.ts (24 tests)
```

### Authentication 模块（32 个新测试 ✅）

```
packages/authentication/src/domain-server/
├── aggregates/__tests__/auth-identity.spec.ts (+7 tests)
└── entities/__tests__/password-credential.spec.ts (25 tests)
```

### Schedule 模块（28 个新测试，差 2% ⏳）

```
packages/schedule/src/domain-server/
└── entities/__tests__/schedule-execution.spec.ts (28 tests)
← 还需补 CalendarEntry aggregate 15-20 个测试
```

---

## 🛠️ 关键技术决策

| 决策           | 方案                                   | 效果                     |
| -------------- | -------------------------------------- | ------------------------ |
| **覆盖率配置** | 排除 enum/未实现的 services            | 避免无意义的 0% 拖低数字 |
| **异步工厂**   | 用 async factory，不用 constructor     | 便于 mock 依赖，更易测试 |
| **时间戳测试** | 引入 2ms 延迟确保顺序                  | 解决 Date.now() 精度问题 |
| **聚合根事件** | 验证 aggregateId 与 payload 一致       | 确保事件发射的完整性     |
| **状态约束**   | 在 remove 前检查"至少保留一种登录方式" | 防止用户被锁定           |

---

## ❌ 常见坑位与解决方案

### 坑位 1：时间戳相同导致排序不稳定

```typescript
// ❌ 错误：快速循环创建时间戳相同
for (let i = 0; i < 3; i++) {
  conversation.addMessage(message); // 可能时间戳相同
}

// ✅ 正确：引入延迟
for (let i = 0; i < 3; i++) {
  conversation.addMessage(message);
  await new Promise((r) => setTimeout(r, 2)); // 2ms 延迟
}
```

### 坑位 2：ID 格式验证不通过

```typescript
// ❌ 错误：随意构造 ID
const msg = Message.create({
  conversationId: 'abc', // ← 格式错误
  content: 'hello',
});

// ✅ 正确：使用有效的 ID 前缀
const msg = Message.create({
  conversationId: 'ai-conversation-123', // ✅ 前缀正确
  content: 'hello',
});
```

### 坑位 3：异步工厂忘记 mock

```typescript
// ❌ 错误：直接创建，无法 mock 密码哈希
const cred = new PasswordCredential(email, password);

// ✅ 正确：使用异步工厂与 mock
const mockHasher = { hash: vi.fn().mockResolvedValue('hash') };
const cred = await PasswordCredential.create(email, password, mockHasher);
```

### 坑位 4：OAuth binding 用字符串而非枚举

```typescript
// ❌ 错误
const binding = OAuthBinding.create('github', 'sub123');

// ✅ 正确
const binding = OAuthBinding.create(OAuthProvider.Github, 'sub123');
```

### 坑位 5：移除操作忘记约束检查

```typescript
// ❌ 错误：直接移除，可能导致无登录方式
identity.removeEmailIdentifier();

// ✅ 正确：先检查是否有其他登录方式
if (!identity.canRemoveEmailIdentifier()) {
  throw new RemovalWouldLockoutIdentityError();
}
identity.removeEmailIdentifier();
```

---

## 📈 覆盖率配置优化清单

### vitest.shared.ts 改动

**改动 1：添加 entities 路径**

```typescript
// Line 63
include: [
  // ... existing paths
  'src/domain-server/entities/**', // ← 新增
];
```

效果：一行改动 → 52% → 75%（跳跃 23%）

**改动 2：排除 enum 与未实现的文件**

```typescript
// Lines 83-93
exclude: [
  '**/index.ts',
  '**/*.d.ts',
  '**/*.{test,spec}.ts',
  '**/value-objects/*-status.ts', // Enum files
  '**/value-objects/*-type.ts',
  '**/value-objects/*-role.ts',
  '**/value-objects/*-model.ts',
  '**/value-objects/*-provider.ts',
  '**/value-objects/*-algorithm.ts',
  '**/schedule/src/domain-server/aggregates/schedule.ts', // Re-export
];
```

**改动 3：设置阈值**

```typescript
// Lines 98-102
const GOVERNED_DOMAIN_COVERAGE_THRESHOLDS = {
  statements: 80,
  lines: 80,
  functions: 80,
  branches: 70, // 分支容许略低
};
```

---

## 📋 下周行动清单

### 优先级 1（本周完成）

- [ ] **Schedule 模块** → 补 15-20 个 CalendarEntry 测试 → 77.93% → 80%+ ✅
  - Command: `pnpm nx run schedule:test:coverage`

### 优先级 2（本周末启动）

- [ ] **Reminder 模块** → 补 60-80 个新测试 → 59.73% → 80%+
  - Command: `pnpm nx run reminder:test:coverage`

### 优先级 3（下周）

- [ ] **Editor** (0%) → 补 40-60 个初始测试
- [ ] **Governance** (78%) → 补 2-5 个测试
- [ ] **Setting** (21%) → 补 30-50 个测试

### 验收标准

```bash
# ✅ 所有 12 个模块都通过
$ pnpm test:coverage:domain
# 应看到 12 个 ✅ 和 0 个 ❌
```

---

## 🔗 参考链接

- **完整实现报告** → `docs/plan/active/2026-04-26-domain-test-system-implementation-report.md`
- **基线覆盖率详情** → `docs/plan/active/baseline-report.md`
- **配置文档** → `docs/test/architecture.md`
- **项目治理** → `AGENT.md`

---

**最后更新：** 2026-04-26 22:16  
**下次更新：** 当 schedule 或 reminder 达成 80% 时
