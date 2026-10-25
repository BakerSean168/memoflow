---
created: 2026-01-27T11:39:14
updated: 2026-01-27T11:41:27
---

## 不能使用 Date 的原因

这是一个非常经典且在工程实践中“必须这么做”的设计决策，主要基于以下 **3 个核心原因**：

### 1. 序列化与网络传输 (Serialization Safety)

这是最直接的原因：**JSON 标准不支持 Date 类型。**

- **现状**：当你把一个对象通过 API 发送给前端，或者存入数据库（如 MongoDB/PostgreSQL 的 JSONB 字段）时，它最终都会被 `JSON.stringify()` 转换。
- **问题**：如果你存的是 `Date` 对象，`JSON.stringify` 会自动调用它的 `.toISOString()` 方法把它变成字符串。
- **契约精神**：作为 DTO（数据传输对象），必须明确地告诉使用者“我传输的是一个字符串”。如果你定义为 `Date` 类型，但传输过去的是字符串，这就造成了**类型欺骗**。前端 TypeScript 以为拿到的是 `Date` 对象，直接调用 `.getFullYear()`，结果报错 `TypeError: .getFullYear is not a function`。

**结论**：在 **DTO / Contract** 层，时间永远是 `string` (ISO 8601 格式)。

### 2. 不可变性 (Immutability) —— DDD 的核心要求

**值对象（Value Object）要求必须是不可变的**。但在 JavaScript/TypeScript 中，`Date` 对象是 **可变（Mutable）** 的引用类型。

看看这个危险的例子：

```
// 假设你的 Value Object 内部存的是 Date 对象
class BadDeviceInfo {
  constructor(public readonly createdAt: Date) {}
}

const now = new Date();
const device = new BadDeviceInfo(now);

// 外部代码修改了原始的 now 对象
now.setFullYear(2000);

// 灾难：值对象内部的时间也被“偷偷”改了！
// 因为它们指向同一个内存地址
console.log(device.createdAt.getFullYear()); // 变成了 2000！违反了不可变性
```

**如果存的是 String：**

字符串是**原始类型（Primitive Type）**，是按值传递的，天然不可变。

TypeScript

```
class GoodDeviceInfo {
  constructor(public readonly createdAt: string) {}
}

const nowStr = new Date().toISOString();
const device = new GoodDeviceInfo(nowStr);

// 字符串无法被“修改”，只能被“替换”
// device.createdAt 完全安全
```

### 3. 时区一致性 (Timezone Truth)

`Date` 对象在 JavaScript 中非常容易因为运行环境（浏览器 vs Node 服务器）的时区设置不同而产生混淆。

- **`new Date().toISOString()`**：强一致性。它永远返回 **UTC 时间 (Zulu Time)**，格式如 `2023-10-27T10:00:00.000Z`。
- **消除歧义**：当你看到这个字符串，你知道它是绝对时间。而如果你传递一个 `Date` 对象，或者非标准的字符串，接收方解析时可能会加上“本地时区偏移”，导致时间错乱。

---

### 最佳实践模式：存储字符串，计算转对象

在你的 `DeviceInfo` 值对象中，推荐采用 **“内部存 String，计算转 Date”** 的模式：

```TypeScript
export class DeviceInfo extends ValueObject<DeviceInfoDTO> {

  // 1. 内部状态 (Props)：存 string，保证序列化安全和不可变性
  // props.firstSeenAt 是 string

  // 2. 访问器 (Getter)：如果你外部确实需要 Date 对象来操作
  // 每次都返回一个新的 Date 实例，防止外部修改影响内部
  get firstSeenAtDate(): Date {
    return new Date(this.props.firstSeenAt);
  }

  // 3. 领域计算：在内部转成 Date 进行计算
  public isRecentlyActive(): boolean {
    const lastSeen = new Date(this.props.lastSeenAt).getTime(); // 转 Date
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    return (now - lastSeen) < fiveMinutes;
  }
}
```

**总结：**

用 `string` (ISO) 是为了 **JSON 兼容**、**不可变安全性** 和 **跨端时区一致性**。只有在需要进行加减运算时，才临时转为 `Date` 对象。

## 使用 number 原因

全栈 TypeScript 环境（Node + Browser）都原生使用毫秒，一致性很高，且能节省带宽和内存。

### 注意点

- 统一使用 13 位毫秒
- 数据库中（persistenceDTO）转为 Date 来存储
