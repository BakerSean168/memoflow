---
created: 2026-01-27T10:31:48
updated: 2026-01-27T10:33:25
---

DTO 对象的定义中不要使用 enum

原因如下：

1. **JSON 只有字符串**：Contracts 包定义的 DTO 最终会变成 JSON 在网络传输。JSON 里只有 `'DESKTOP'` 字符串，没有 `Enum` 对象。使用 `enum` 会导致前端/后端在序列化和反序列化时出现不必要的类型转换问题（比如 `DeviceType.DESKTOP` 到底传的是 `0` 还是 `"DESKTOP"`？）。
2. **构建体积**：TS 的 `enum` 会编译成额外的 JavaScript 对象代码（IIFE），而 **字面量联合类型** (`type = 'A' | 'B'`) 在编译成 JS 后会**完全消失**，零运行时开销。
3. **扩展性**：如果后端增加了一个新类型 `'VR_HEADSET'`，而前端用的是旧的 `enum` 定义，严格的 Enum 检查可能会导致运行时错误。而字符串字面量通常更宽容。

**最佳实践（在 contracts 包中）：**

使用 **`const object as const`** 配合 **`typeof`**。

```TypeScript
// packages/contracts/src/enums/DeviceType.ts

// 1. 定义常量对象 (运行时用，方便引用)
export const DeviceType = {
  BROWSER: 'BROWSER',
  DESKTOP: 'DESKTOP',
  MOBILE: 'MOBILE',
  TABLET: 'TABLET',
  API: 'API',
  UNKNOWN: 'UNKNOWN',
} as const;

// 2. 导出类型 (编译时用，相当于 'BROWSER' | 'DESKTOP' | ...)
export type DeviceType = typeof DeviceType[keyof typeof DeviceType];
```
