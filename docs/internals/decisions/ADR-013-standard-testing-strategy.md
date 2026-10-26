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

- **Domain:** 80% (Core logic must be solid).
- **Application:** 70%.
- **Critical Paths:** 90%.

## Consequences

- **Positive:** Confidence in refactoring; Documentation of code behavior via tests.
- **Negative:** Maintaining mocks can be time-consuming if interfaces change frequently.
