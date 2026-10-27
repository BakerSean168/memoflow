---
created: 2026-01-27T12:37:06
updated: 2026-01-27T12:37:23
tags:
  - standards
---

这是一个非常好的工程化问题。你当然不应该在每个 Type 的伴生对象里重复写 `import { v4 } from 'uuid'`。

在 Monorepo 和 DDD 架构中，解决这个问题的标准做法是：**“封装变化”**。

我们需要把“ID 是如何生成的（UUID vs NanoID）”与“ID 类型的定义”分离开。这里有两种优雅的方案，从简单到高级供你选择。

---

### 方案一：中央生成器 (The Central Generator Pattern) —— 【最推荐】

这种方式最直观。你创建一个公用的工具函数，所有的 ID 伴生对象都调用它。

#### 1. 定义生成策略 (Infrastructure / Shared)

在你的 `domain-shared` 或 `contracts` 包里，定义唯一的 ID 生成源。

TypeScript

```
// libs/domain-shared/src/utils/IdGenerator.ts
import { v4 as uuidv4 } from 'uuid';
import { customAlphabet } from 'nanoid';

// 集中管理：如果以后想把 UUID 换成 NanoID，只改这一行代码！
export const IdGenerator = {
  // 生成标准 UUID
  uuid(): string {
    return uuidv4();
  },

  // 生成短 ID (例如给对外的分享链接用)
  nano(length = 21): string {
    const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', length);
    return nanoid();
  }
};
```

#### 2. 在各个 Type 定义中使用

TypeScript

```
// libs/contracts/src/domain/types/UserId.ts
import { IdGenerator } from '@memoflow/utils/domain';

// 1. 类型定义
export type UserId = string & { readonly __brand: unique symbol };

// 2. 伴生对象
export const UserId = {
  // 生成新 ID
  create(): UserId {
    // ✅ 调用中央生成器
    return IdGenerator.uuid() as UserId;
  },

  // 从已有字符串还原 (比如从数据库读出来)
  of(value: string): UserId {
    return value as UserId;
  }
};
```

**优点：** 逻辑清晰，每个 ID 类型依然有自己的文件，方便以后给 `UserId` 单独加校验逻辑（比如 `UserId` 必须以 `u_` 开头）。

---

### 方案二：泛型工厂 (The Generic Factory Pattern) —— 【最省代码】

如果你非常讨厌写重复的 `create` 代码，我们可以写一个高阶函数，**自动生成伴生对象**。

#### 1. 定义工厂函数

TypeScript

```
// libs/domain-shared/src/utils/createIdType.ts
import { IdGenerator } from './IdGenerator';

/**
 * 这是一个高阶函数，它返回一个现成的伴生对象。
 * T: 你的 Branded Type
 */
export function createIdType<T extends string>() {
  return {
    // 自动获得 generate 能力
    generate(): T {
      return IdGenerator.uuid() as T;
    },

    // 自动获得还原能力
    of(value: string): T {
      if (!value) throw new Error("ID cannot be empty");
      return value as T;
    },

    // 自动获得比较能力
    equals(a: T, b: T): boolean {
      return a === b;
    }
  };
}
```

#### 2. 极速定义 ID

现在，你定义一个新的 ID 只需要两行代码：

TypeScript

```
// libs/contracts/src/domain/types/SessionId.ts
import { createIdType } from '@memoflow/utils/domain';

// 1. 定义类型
export type SessionId = string & { readonly __brand: unique symbol };

// 2. 生成伴生对象 (一行代码搞定实现！)
export const SessionId = createIdType<SessionId>();
```

#### 3. 使用

TypeScript

```
import { SessionId } from './types/SessionId';

const id = SessionId.generate(); // 自动生成的 UUID
const fromDb = SessionId.of("sess_123");
```

**优点：** 极度 DRY (Don't Repeat Yourself)，增加新 ID 没有任何心理负担。

---

### 进阶建议：加上前缀 (Stripe Style)

既然你已经在封装 ID 生成逻辑了，我强烈建议你考虑 **Prefix（前缀）** 策略。这是 Stripe、GitHub 等大厂的最佳实践。

- `UserId`: `usr_1a2b3c...`
- `SessionId`: `sess_xyz789...`
- `DeviceId`: `dev_999...`

**为什么？**

在日志、调试、或者数据库查询出错时，当你看到一个裸露的 UUID `550e8400...`，你不知道它是 User 还是 Order。但如果你看到 `usr_550e...`，你一秒钟就知道这是什么。

**如何改造方案二来实现？**

TypeScript

```
// 改造工厂函数，接收一个前缀
export function createIdType<T extends string>(prefix: string) {
  return {
    generate(): T {
      // 自动拼装前缀
      return `${prefix}_${IdGenerator.uuid()}` as T;
    },

    of(value: string): T {
      // 自动校验前缀 (可选，增加安全性)
      if (!value.startsWith(prefix + '_')) {
        console.warn(`ID ${value} does not start with expected prefix ${prefix}`);
      }
      return value as T;
    }
  };
}
```

**使用：**

TypeScript

```
// 定义 SessionId
export const SessionId = createIdType<SessionId>('sess');

// 结果
console.log(SessionId.generate()); // 输出: "sess_d2839a-...."
```

### 总结

1. **不要在每个文件里调 UUID 库**。
2. 如果不介意一点点模板代码，用 **方案一**（调用 `IdGenerator`），灵活性最高。
3. 如果 ID 很多且逻辑完全一样，用 **方案二**（`createIdType` 工厂），代码最干净。
4. **强烈建议加前缀**，这对后期的运维和 Debug 有巨大的帮助。
