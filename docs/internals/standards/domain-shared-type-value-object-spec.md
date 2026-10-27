---
tags: [standard, domain/shared]
---

# Domain Shared 开发规范：Type 类型值对象 (Enums & Primitives)

**版本**: 1.0
**适用范围**: `packages/domain-shared` 中基于 Type 实现的值对象
**读者**: 开发人员, AI 助手

## 1. 核心概念

对于**枚举 (Enums)**、**标识符 (IDs)** 或 **简单包装器 (Wrappers)**，使用 Class 可能会带来不必要的运行时开销和序列化复杂性。
因此，我们采用 **Branded Type (品牌类型)** + **Companion Object (伴生对象)** 模式。

**优势**:

- **Runtime**: 运行时就是原生 `string` 或 `number`，序列化/反序列化成本为 0。
- **Compile-time**: 具有严格的类型区分（`UserId` 不能赋值给 `AccountId`）。
- **Behavior**: 通过同名对象提供类似 Class 的静态方法和行为。

**ID 命名与语义约束**:

- 标识符类型命名必须使用 `xxId`（如 `IdentityId`, `GoalId`），禁止 `xxUuid` 命名。
- DTO 与实体中的标识符字段命名必须使用 `*Id` 后缀，禁止 `*Uuid` 字段。
- 当前项目中 `account` 与 `identity` 聚合根的主标识均应为 `identityId`。

---

## 2. 代码结构规范

### 2.1 类型定义 (The Type)

- 使用 `type` 关键字。
- 必须交叉合并 `readonly __brand: unique symbol`。
- 原始类型应来自 `contracts` 包。

```typescript
import type { OrderStatusDTO } from '@memoflow/contracts/order';

// 定义
export type OrderStatus = OrderStatusDTO & { readonly __brand: unique symbol };
```

### 2.2 伴生对象 (The Companion Object)

- 必须定义一个与 type **同名**的 `const` 对象。
- 充当该类型的“静态类”。

### 2.3 必须包含的方法

1. **Constants**: 如果是枚举，必须列出所有可用值。
2. **`of(value: primitive): Type`**: 严格的工厂方法，必须包含校验逻辑。
3. **`isValid(value: primitive): value is Type`**: 类型守卫，用于运行时检查。
4. **`getAll(): Type[]`**: (仅枚举) 返回所有合法值的数组，用于 UI 遍历。

### 2.4 行为方法

- 由于 Type 不是 Class，没有 `this`。
- **约定**: 所有行为方法的**第一个参数**必须是该 Type 的实例。
- _示例_: `isFinished(status: OrderStatus): boolean`

---

## 3. 代码模板 (AI 参照标准)

请 AI 在生成枚举或简单值对象时严格参照以下模板：

```typescript
// 1. 引入 Contract 定义
import type { ThemeModeDTO } from '@memoflow/setting-contracts';

// 2. 定义 Branded Type
export type ThemeMode = ThemeModeDTO & { readonly __brand: unique symbol };

// 3. 定义合法值集合 (Single Source of Truth)
const VALUES: ThemeModeDTO[] = ['light', 'dark', 'system'];

// 4. 定义伴生对象
export const ThemeMode = {
  // 预定义常量
  LIGHT: 'light' as ThemeMode,
  DARK: 'dark' as ThemeMode,
  SYSTEM: 'system' as ThemeMode,

  /**
   * 🏭 工厂方法
   */
  of(value: string): ThemeMode {
    if (!this.isValid(value)) {
      throw new Error(`Invalid ThemeMode: ${value}`);
    }
    return value;
  },

  /**
   * 🛡️ 类型守卫
   */
  isValid(value: string): value is ThemeMode {
    return VALUES.includes(value as ThemeModeDTO);
  },

  /**
   * 📋 获取所有选项 (UI 数据源)
   */
  getAll(): ThemeMode[] {
    return VALUES as ThemeMode[];
  },

  // ================= 行为方法 (State Logic) =================

  /**
   * 是否需要根据系统设置自动切换
   */
  isAuto(mode: ThemeMode): boolean {
    return mode === this.SYSTEM;
  },

  /**
   * 获取 UI 显示名称
   */
  getLabel(mode: ThemeMode): string {
    switch (mode) {
      case this.LIGHT:
        return '浅色模式';
      case this.DARK:
        return '深色模式';
      case this.SYSTEM:
        return '跟随系统';
    }
  },
};
```

---

## 4. Class vs Type 选择指南

在 `domain-shared` 中，什么时候用 `class`，什么时候用 `type`？

| 特性         | Class Value Object (e.g., Email, Money) | Type Value Object (e.g., Status, ID, Enum) |
| ------------ | --------------------------------------- | ------------------------------------------ |
| **内部结构** | 复杂对象，有多个属性                    | 简单原始值 (string, number)                |
| **校验逻辑** | 复杂 (Regex, 组合校验)                  | 简单 (枚举值检查, 长度检查)                |
| **序列化**   | 需要 `toDTO()`                          | **不需要** (自身就是 DTO)                  |
| **内存开销** | 有实例化开销                            | **零开销**                                 |
| **使用场景** | **Email, Address, Money, Profile**      | **Gender, Status, CurrencyCode, UserId**   |

---

## 5. 常见误区检查清单

- [ ] **是否忘记了 `__brand`？** (没有 brand 就失去了类型安全)。
- [ ] **是否实现了 `isValid` 类型守卫？** (用于 API 输入验证)。
- [ ] **行为方法的第一个参数是否是实例？** (不能用 `this` 访问数据)。
- [ ] **是否硬编码了字符串？** (应尽量复用 Contract 或内部常量)。
- [ ] **ID 是否全部采用 `xxId` 命名？** (禁止出现 `xxUuid` 类型或字段命名)。
