---
tags: [standard, domain/shared]
---

# Domain Shared 开发规范：值对象与通用逻辑

**版本**: 1.1 (Updated)
**适用范围**: `packages/domain-shared`
**读者**: 开发人员, AI 助手

## 1. 核心设计理念

`domain-shared` 是前后端共用的**通用领域内核**。它不仅承载了数据校验，还承担了**数据形态转换**的核心职责，实现了逻辑的高度内聚。

**核心原则**:

1. **Isomorphic (同构)**: 代码必须能在 Browser、Node.js、Electron 主进程/渲染进程中无缝运行。
2. **Pure Logic (纯逻辑)**: 仅包含数据校验、格式化、计算逻辑、类型转换逻辑。
3. **No Side Effects (无副作用)**: 禁止 I/O 操作（无数据库连接、无 API 请求、无文件读写）。
4. **Immutability (不可变性)**: 值对象一旦创建，内部状态不可修改。任何变更都必须返回新的实例。
5. **Logic Push-down (逻辑下沉)**: 将所有“如何生成默认值”和“如何转换为数据库格式”的逻辑封装在值对象内部，减轻 Server Entity 的负担。

---

## 2. 依赖规则

为了保证同构性，同时支持逻辑下沉，依赖规则如下：

- ✅ **允许依赖**:
- `@memoflow/utils` (ValueObject 基类)
- `@memoflow/contracts` (DTO 接口, **包含 `PersistenceDTO` 纯类型定义**)
- 自身目录内的其他文件 (其他 ValueObject, Enums)
- 纯 JS/TS 内置对象 (`Date`, `Math`, `RegExp`)

- ❌ **禁止依赖**:
- 具体业务域包中的运行时实现代码（禁止！防止引入 Entity/ORM/框架耦合）
- 任何客户端 UI 模块实现（禁止！防止循环依赖）
- Node.js 原生模块 (`fs`, `crypto`, `path`)
- 浏览器特有 API (`window`, `document`, `localStorage`)
- **包含运行时逻辑**的后端库 (如 `typeorm`, `prisma` Client 实例) —— 仅允许引用纯 Type/Interface。

---

## 3. 代码结构规范：Class Value Object

值对象（Class 类型）必须遵循以下结构。

### 3.1 继承与定义

- 必须继承自 `ValueObject<DTO>`。
- 泛型 `DTO` 必须来自 `contracts` 包。

```typescript
import { ValueObject } from '@memoflow/utils';
import type { MoneyDTO } from '@memoflow/contracts/finance';

export class Money extends ValueObject<MoneyDTO> { ... }

```

### 3.2 构造函数与工厂

- **构造函数**: 必须为 `private`。
- **Static create(props)**: 通用工厂。用于创建新对象，**必须包含校验逻辑**。
- **Static createDefault(...args)**: **[新增]** 默认工厂。用于生成业务上的“初始默认状态”（如新用户的默认设置）。
- **Static fromDTO(dto)**: 恢复工厂。用于从 API 或 Client DTO 还原对象。

### 3.3 校验逻辑 (Validation)

- 所有的校验规则（Regex, 长度, 数值范围）都必须写在这里。
- **目的**: 保证前端表单校验和后端 API 入参校验使用同一套规则。

### 3.4 行为方法 (Mutators)

- 命名: `updateXxx()`, `changeXxx()`, `setXxx()`。
- **实现**: 必须返回 `new ClassName(...)` 或 `this`。**严禁修改 `this.props**`。
- 必须确保变更后的数据依然符合校验规则。

### 3.5 序列化与转换 (Serialization)

- **toDTO()**: 返回 `ClientDTO` (或通用 DTO)，用于 API 传输或前端展示。
- **toPersistence()**: **[新增]** 返回 `PersistenceDTO`。
- **职责**: 负责将内部状态（如 `Date` 对象、复杂嵌套结构）转换为数据库存储所需的格式（如 `number` 时间戳、Flatten 结构）。

---

## 4. 代码模板 (AI 参照标准)

请 AI 在生成 `domain-shared` 代码时严格参照以下模板：

```typescript
import { ValueObject } from '@memoflow/utils';
// 1. 引入 Contracts 中的 DTO 和 PersistenceDTO
import type { AccountProfileDTO, AccountProfilePersistenceDTO } from '@memoflow/contracts/account';
import { GenderType } from './gender-type';

export class AccountProfile extends ValueObject<AccountProfileDTO> {
  // ================= 构造函数 =================
  private constructor(props: AccountProfileDTO) {
    super(props);
  }

  // ================= 工厂方法 1: 标准创建 =================
  public static create(props: AccountProfileDTO): AccountProfile {
    this.validate(props);
    return new AccountProfile(props);
  }

  // ================= 工厂方法 2: 创建默认值 (新增) =================
  /**
   * 生成业务默认状态
   * 场景: 用户注册时，生成默认的 Profile
   */
  public static createDefault(email: string): AccountProfile {
    // 逻辑下沉: 默认昵称生成规则在这里
    const defaultNickname = email.split('@')[0].slice(0, 10);

    return new AccountProfile({
      nickname: defaultNickname,
      gender: GenderType.PREFER_NOT_TO_SAY,
      realName: undefined,
      avatarUrl: undefined,
      bio: undefined,
      birthday: undefined,
    });
  }

  // ================= 工厂方法 3: 恢复 =================
  public static fromDTO(dto: AccountProfileDTO): AccountProfile {
    // 如果 PersistenceDTO 和 ClientDTO 结构差异巨大
    // 也可以定义 fromPersistence(dto)
    return new AccountProfile(dto);
  }

  // ================= 校验逻辑 =================
  private static validate(props: AccountProfileDTO): void {
    if (props.nickname.length > 20) throw new Error('Nickname too long');
    GenderType.of(props.gender);
  }

  // ================= 行为 (不可变) =================
  public updateNickname(nickname: string): AccountProfile {
    const newProps = { ...this.props, nickname };
    AccountProfile.validate(newProps); // 变更时校验
    return new AccountProfile(newProps);
  }

  public setBirthday(date: number): AccountProfile {
    // 可以在这里做业务校验，比如不能早于 1900 年
    return new AccountProfile({ ...this.props, birthday: date });
  }

  // ================= 计算属性 =================
  public get age(): number | null {
    if (!this.props.birthday) return null;
    const year = new Date(this.props.birthday).getFullYear();
    return new Date().getFullYear() - year;
  }

  // ================= 序列化: API / Client =================
  public toDTO(): AccountProfileDTO {
    return { ...this.props };
  }

  // ================= 序列化: Persistence (新增) =================
  /**
   * 转换为持久化格式
   * 职责: 处理 Date -> timestamp, Enum -> string 等转换
   * Server Entity 直接调用此方法，无需关心转换细节
   */
  public toPersistence(): AccountProfilePersistenceDTO {
    return {
      nickname: this.props.nickname,
      realName: this.props.realName,
      avatarUrl: this.props.avatarUrl,
      bio: this.props.bio,
      gender: this.props.gender,
      // 逻辑下沉: 假设内部存 timestamp (number)，数据库存 Date 对象
      // 或者反过来，这里负责这种 mapping
      birthday: this.props.birthday ? new Date(this.props.birthday) : undefined,
    };
  }
}
```

---

## 5. 常见误区检查清单 (Checklist)

在编写 `domain-shared` 时，请检查：

- [ ] **是否实现了 `createDefault`？** (对于有初始状态的值对象，这是必须的)。
- [ ] **是否实现了 `toPersistence`？** (Server 端 Entity 需要用它来落库)。
- [ ] **`toPersistence` 的返回值是否匹配 `PersistenceDTO`？** (确保类型安全)。
- [ ] **是否修改了 `this.props`？** (禁止！必须返回新实例)。
- [ ] **校验逻辑是否完备？** (Create 和 Update 都需要经过校验)。
- [ ] **依赖是否纯净？** (Contracts 引用是否仅为 `import type`，确保不引入后端运行时)。
