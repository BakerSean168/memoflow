# ADR-013: Standard - Testing Strategy

## Status

Accepted

## Date

2026-01-15

## Context

Undefined testing structures lead to "flaky" tests or implementation-detail testing that breaks on every refactor.

## Decision

We define a standard hierarchy and structure for tests.

### 1. Test Organization

Tests sit alongside code or in `__tests__` folders（新代码优先同目录，已有 `__tests__/` 保留不迁移）。

- `*.test.ts` / `*.spec.ts`：快测试（TDD 默认），mock 依赖。
- `*.integration.test.ts`：集成测试（Real DB/Modules）。

详见 [测试文档](../testing/README.md) 的类型总览和目录约定。

### 2. Pattern: AAA

All tests must follow **Arrange, Act, Assert**.

```typescript
it('should create task', async () => {
   // Arrange
   const input = { ... };
   mockRepo.save.mockResolvedValue(...);

   // Act
   const res = await service.create(input);

   // Assert
   expect(res.ok).toBe(true);
});
```

### 3. Mocking

- Reset mocks `beforeEach`.
- Mock interfaces, not classes, where possible.

### 4. Coverage Goals

Coverage is **measurement, not a gate**（2026-10-25 起）：不再维护固定百分比硬门禁；PR/Main CI 不做覆盖率仪表化，Nightly Audit 每日独立测量并上传报告，百分比只用于观察回归趋势。质量由测试行为断言和各 lane 的 fail-closed 保证。

## Consequences

- **Positive:** Confidence in refactoring; Documentation of code behavior via tests.
- **Negative:** Maintaining mocks can be time-consuming if interfaces change frequently.
