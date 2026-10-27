---
created: 2026-02-02
updated: 2026-02-02
tags: [standard, architecture, config, constant]
---

# Configs vs Constants 规范

## 核心区别

### 📁 **configs/** - 配置常量（可配置的业务参数）

**定义：** 影响业务逻辑行为的可配置参数，可能在不同环境或场景下需要调整。

**特征：**

- ✅ 影响业务行为（如批次大小、阈值、默认值）
- ✅ 可能需要根据环境或需求调整
- ✅ 通常是数字、字符串等具体值
- ✅ 使用 `SCREAMING_SNAKE_CASE` 命名
- ✅ 必须添加 `as const` 断言

**放置位置：** `packages/contracts/src/modules/{module}/configs/config.ts`

### 📁 **constants/** - 常量文件夹（已废弃）

**结论：** `constants/` 文件夹在当前架构中**不应使用**，应该被移除。

**原因：**

1. 所有"枚举类"常量已经归入 `value-objects/`
2. 配置类常量已经归入 `configs/`
3. 避免命名混淆和重复概念

---

## 📂 当前模块结构

```
modules/{module}/
├── aggregates/       # 聚合根（有 ID 的领域对象）
├── entities/         # 子实体（有 ID 但不是聚合根）
├── value-objects/    # 值对象（无 ID，不可变）+ 枚举类常量
├── configs/          # 配置常量（业务参数）
├── protocol/         # 模块间通信（EventMap, RpcMap）
├── api/              # REST API 定义
├── dtos/             # 特殊 DTO（统计、报表）
└── index.ts          # 模块导出
```

---

## 🎯 使用规范

### 1️⃣ **Value Objects**（值对象 + 枚举）

**内容：**

- 枚举类常量（状态、类型、模式等）
- 复杂值对象（带验证逻辑）
- 简单值对象（不可变数据结构）

**命名规范：**

- 对象名：`PascalCase`（如 `TaskInstanceStatus`）
- Key/Value：`PascalCase`（如 `Pending: 'Pending'`）
- 类型：`PascalCase`（如 `type TaskInstanceStatus`）

**示例：**

```typescript
// modules/task/value-objects/task-instance-status.ts

/**
 * 任务实例状态
 */
export const TaskInstanceStatus = {
  Pending: 'Pending',
  InProgress: 'InProgress',
  Completed: 'Completed',
  Skipped: 'Skipped',
} as const;

export type TaskInstanceStatus = (typeof TaskInstanceStatus)[keyof typeof TaskInstanceStatus];
```

**使用场景：**

- ✅ 状态枚举（Status、Mode、Type）
- ✅ 固定选项集合（Priority、Channel、Format）
- ✅ 业务领域概念（不会频繁变化的值）

---

### 2️⃣ **Configs**（配置常量）

**内容：**

- 业务规则参数（阈值、限制、默认值）
- 系统行为配置（批次大小、超时时间）
- 验证规则（最大长度、最小值）

**命名规范：**

- 配置对象：`SCREAMING_SNAKE_CASE`（如 `TASK_INSTANCE_GENERATION_CONFIG`）
- 配置项：`SCREAMING_SNAKE_CASE`（如 `DEFAULT_BATCH_SIZE`）
- 分组清晰，每组配置一个对象

**示例：**

```typescript
// modules/task/configs/config.ts

/**
 * 任务实例生成配置
 */
export const TASK_INSTANCE_GENERATION_CONFIG = {
  /**
   * 目标提前生成天数
   */
  TARGET_GENERATE_AHEAD_DAYS: 100,

  /**
   * 补充阈值（天）
   */
  REFILL_THRESHOLD_DAYS: 100,

  /**
   * 批量操作的批次大小
   */
  BATCH_SIZE: 50,
} as const;

/**
 * 任务验证配置
 */
export const TASK_VALIDATION_CONFIG = {
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 256,
  MAX_SUBTASKS: 100,
} as const;
```

**使用场景：**

- ✅ 业务规则参数（默认优先级、默认排序）
- ✅ 数量限制（最大页大小、批次大小）
- ✅ 时间配置（提前天数、超时时长）
- ✅ 验证规则（长度限制、数值范围）

---

## 🔍 判断标准

### 问自己：

| 问题                                       | 答案是「是」→        | 答案是「否」→ |
| ------------------------------------------ | -------------------- | ------------- |
| 这是一个固定的业务概念（如状态、类型）吗？ | `value-objects/`     | ⬇️            |
| 这个值可能需要根据需求调整吗？             | `configs/`           | ⬇️            |
| 这是一个纯粹的魔法数字或字符串吗？         | 放在使用它的文件内部 | -             |

### 示例判断：

```typescript
// ❓ TaskInstanceStatus.Pending
// ✅ value-objects/ - 固定的业务状态

// ❓ DEFAULT_PAGE_SIZE: 20
// ✅ configs/ - 可能需要调整的配置

// ❓ const MAX_RETRIES = 3
// ✅ 文件内部常量 - 仅在一个地方使用

// ❓ const API_VERSION = 'v1'
// ✅ api/endpoints.ts - API 相关常量放在 API 层
```

---

## 📋 迁移检查清单

### 清理 `constants/` 文件夹

1. **检查现有 `constants/` 内容**

   ```bash
   # 查找所有 constants 文件夹
   find packages/contracts/src/modules -type d -name "constants"
   ```

2. **分类迁移**
   - 枚举类 → `value-objects/`
   - 配置类 → `configs/`
   - 仅在一处使用的 → 移到使用它的文件内部

3. **删除空文件夹**

   ```bash
   # 删除空的 constants 文件夹
   rmdir packages/contracts/src/modules/*/constants
   ```

4. **更新导入语句**
   - 搜索并替换所有 `from './constants'` 导入
   - 更新为正确的路径

---

## ✅ 最佳实践

### DO（正确做法）

```typescript
// ✅ 枚举放在 value-objects/
export const TaskStatus = {
  Draft: 'Draft',
  Active: 'Active',
} as const;

// ✅ 配置放在 configs/
export const TASK_CONFIG = {
  DEFAULT_PRIORITY: 5,
  MAX_TITLE_LENGTH: 256,
} as const;

// ✅ 简单工具函数的常量放在文件内部
const DEBOUNCE_DELAY = 300; // 仅在这个文件使用

// ✅ API 相关常量放在 api/
export const TASK_API_PREFIX = '/api/tasks';
```

### DON'T（错误做法）

```typescript
// ❌ 不要创建 constants/ 文件夹
modules / task / constants / status.ts;

// ❌ 不要在 configs/ 放枚举
export const TASK_STATUSES = {
  Draft: 'Draft',
  Active: 'Active',
} as const;

// ❌ 不要在 value-objects/ 放配置数字
export const DEFAULT_PAGE_SIZE = 20;

// ❌ 不要混用命名风格
export const taskStatus = {
  // ❌ camelCase
  DRAFT: 'DRAFT', // ❌ SCREAMING_SNAKE_CASE value
};
```

---

## 📖 参考文档

- [枚举与常量对象规范](<./枚举与常量对象规范(Enum&Constant-Objects).md>)
- [enum 写法规范](./enum写法.md)
- Example Module - [packages/example-contracts/src/](../../packages/example-contracts/src/)

---

## 🎓 总结

| 概念     | 文件夹           | 命名风格             | 用途         | 示例                |
| -------- | ---------------- | -------------------- | ------------ | ------------------- |
| **枚举** | `value-objects/` | PascalCase           | 固定业务概念 | `TaskStatus.Active` |
| **配置** | `configs/`       | SCREAMING_SNAKE_CASE | 可调整参数   | `BATCH_SIZE: 50`    |
| **废弃** | ~~`constants/`~~ | -                    | 不再使用     | -                   |

**记住：**

- 业务语义 → `value-objects/`
- 业务参数 → `configs/`
- 局部使用 → 文件内部
- 没有 `constants/` 文件夹！
