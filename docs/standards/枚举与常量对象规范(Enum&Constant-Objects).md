---
created: 2026-01-28T18:52:17
updated: 2026-01-28T18:59:16
tags: [standard, enum]
---

# 枚举与常量对象规范 (Enum & Constant Objects)

## 1. 核心原则 (Core Principles)

- **命名风格**：Key 和 Value 必须统一使用 **PascalCase** (大驼峰命名)。
- **不可变性**：必须使用 `as const` 断言，确保类型收窄为字面量 (Literal Types)。
- **类型导出**：必须导出对应的联合类型 (Union Type)。

## 2. 标准模板 (Standard Template)

在定义枚举类常量时，请严格遵循以下格式：

```typescript
/**
 * 使用 PascalCase 命名 Key 和 Value
 * 必须添加 `as const` 以锁定字面量类型
 */
export const ImportanceLevels = {
  Vital: 'Vital',
  Important: 'Important',
  Moderate: 'Moderate',
  Minor: 'Minor',
  Trivial: 'Trivial',
} as const;

// 提取 Value 类型 (推荐) - 结果: "Vital" | "Important" | ...
export type ImportanceLevel = (typeof ImportanceLevels)[keyof typeof ImportanceLevels];

// 或者提取 Key 类型 (仅当 Key 与 Value 完全一致时使用)
// export type ImportanceLevel = keyof typeof ImportanceLevels;
```

## 3. 正确与错误示例 (Do's & Don'ts)

### ✅ 正确 (Correct)

- 易读，符合类/类型命名习惯。
- 值与键保持一致（除非后端有特殊映射）。

```TypeScript
export const UserStatus = {
  Active: "Active",
  Pending: "Pending",
  Deleted: "Deleted",
} as const;
```

### ❌ 错误 (Incorrect)

**不要使用全大写 (SCREAMING_SNAKE_CASE)**

- _原因_：视觉干扰大，书写繁琐，通常仅用于环境变量或魔法数字。

```TypeScript
// Avoid
export const UserStatus = {
  ACTIVE: "ACTIVE", // ❌ 太吵了
  PENDING: "PENDING",
}
```

**不要使用小驼峰 (camelCase)**

- _原因_：看起来像普通对象属性，缺乏“枚举/类型”的语义暗示。

```TypeScript
// Avoid
export const UserStatus = {
  active: "active", // ❌ 看起来像普通变量
  pending: "pending",
}
```
