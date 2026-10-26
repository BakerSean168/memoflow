---
created: 2026-01-27T12:31:41
updated: 2026-01-27T12:31:59
---

你可以完全不使用 Class，不继承任何基类，也不需要 `.value` 属性。仅仅使用一个 **Type (类型别名)**，在 DDD 的概念里，它依然是一个完美的 **值对象 (Value Object)**。

在 TypeScript 的世界里，这不仅是“允许”的，而且对于简单值（如 ID、Email、Code）来说，这是**更推荐、更地道**的做法。

让我们拆解一下为什么：

### 1. 为什么“Type”也是值对象？

DDD 定义值对象，看的是它的**特性**，而不是它的**实现代码**。

值对象的定义有三条，TypeScript 的原生字符串类型完美符合：

1. **没有生命周期 (No Identity)**：

   - 你不需要追踪一个字符串的变化。
   - `IdentityId` 就是一个值，就像数字 `1` 一样。

2. **不可变性 (Immutability)**：

   - 在 JavaScript/TypeScript 中，`string`、`number` 这些原始类型**天然是不可变的**。你无法修改字符串的某一位，你只能替换整个字符串。
   - 不需要 `readonly` 关键字修饰，它天生就是 readonly。

3. **通过值比较相等 (Structural Equality)**：

   - `const a = "id-1"; const b = "id-1";`
   - `a === b` 是 **true**。
   - 它不需要像 Java 那样写 `.equals()` 方法，JS 引擎自动帮你按值比较了。

**结论：**

既然它天生符合 DDD 值对象的所有要求，为什么非要把它包在一个 Class 里呢？直接用 Type 就够了！

### 2. 代码对比：Heavy vs. Light

你现在的思路是从左边转向了右边，这是**化繁为简**的进步。

#### 方案 A：Heavy Weight (类实现，有 .value)

_这是 Java/C# 风格的 DDD，在 TS 里显得笨重。_

TypeScript

```
// 复杂的 Class 包装
class IdentityId extends ValueObject<string> {
   // 你必须通过 .value 或 .props 才能拿到真正的值
   get value(): string { return this.props; }
}

const id = IdentityId.create("123");
console.log(id.value); // 这里的 .value 其实是多余的包装
```

#### 方案 B：Light Weight (类型别名，无 .value) —— 【你现在想要的】

_这是 TypeScript 风格的 DDD。_

TypeScript

```
// 纯粹的类型
export type IdentityId = string & { readonly __brand: unique symbol };

const id: IdentityId = "123" as IdentityId;

// 它本身就是值！不需要 .value
console.log(id); // 输出 "123"
```

### 3. 那逻辑放在哪里？(验证、生成)

既然没有 Class，我就不能写 `id.isValid()` 了，逻辑放哪？

答案是：**函数式编程 (Functional Approach)**。

把逻辑放在一个**模块 (Module)** 或 **伴生对象** 里，把 Type 当作参数传进去。

TypeScript

```
// packages/contracts/src/domain/types/IdentityId.ts

// 1. 定义数据结构 (它就是个带标签的 string)
export type IdentityId = string & { readonly __brand: unique symbol };

// 2. 定义行为逻辑 (作为一个同名的工具对象)
export const IdentityId = {
  // 工厂/验证逻辑
  of(value: string): IdentityId {
    if (!value) throw new Error("ID cannot be empty");
    return value as IdentityId;
  },

  // 其他逻辑
  isTemporary(id: IdentityId): boolean {
    return id.startsWith("temp-");
  }
}
```

**使用时的感觉：**

TypeScript

```
import { IdentityId } from './IdentityId';

// 创建
const userId = IdentityId.of("user-123");

// 使用 (直接当字符串用)
console.log("User ID is: " + userId);

// 调用逻辑 (函数式调用，而不是方法调用)
if (IdentityId.isTemporary(userId)) {
  // ...
}
```

### 4. 总结：什么时候用 Type，什么时候用 Class？

在你的项目中，可以混合使用这两种策略，它们都是值对象：

| **场景**         | **推荐实现方式**                | **例子**                                                                                                           | **理由**                                                           |
| ---------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| **简单包装器**   | **Type (Branded Type)**         | `IdentityId`<br><br> <br><br>`Email`<br><br> <br><br>`PhoneNumber`<br><br> <br><br>`OrderCode`                     | 只有一个属性；主要依赖原生比较 (`===`)；不需要复杂的内部状态变化。 |
| **复杂逻辑组合** | **Class (extends ValueObject)** | `DeviceInfo`<br><br> <br><br>`Money` (金额+币种)<br><br> <br><br>`Address`<br><br> <br><br>`DateRange` (开始+结束) | 有多个属性；需要封装复杂的计算逻辑；可能需要派生出新对象。         |

**回答你的核心疑问：**

- **可以不使用上面两种方法吗？** 可以。
- **就把它当做一个 type？** 是的。
- **一个 type 也可以是一个值对象吗？** 是的，这叫 **Primitive Value Object**。
- **不一定要实现基类，不一定要有 value 属性？** 完全不需要。变量本身就是 Value。
