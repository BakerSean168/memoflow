---
tags:
  - guide
  - development
  - coding-standards
description: 开发代码规范入口
created: 2025-11-23T16:00:00
updated: 2026-04-13T00:00:00
---

# 代码规范

这篇文档只保留开发入口，不再维护框架级长教程、风格示例大全或和代码配置重复的实现细节。

## 先看哪里

- 通用架构规则：[`../../standards/architecture.md`](../../standards/architecture.md)
- 契约模块约束：[`../../standards/contract-module-development-spec.md`](../../standards/contract-module-development-spec.md)
- domain 相关规则：
  - [`../../standards/domain-client-spec.md`](../../standards/domain-client-spec.md)
  - [`../../standards/domain-server-spec.md`](../../standards/domain-server-spec.md)
  - [`../../standards/domain-event-spec.md`](../../standards/domain-event-spec.md)
- 值对象与类型约束：
  - [`../../standards/domain-shared-class-value-object-spec.md`](../../standards/domain-shared-class-value-object-spec.md)
  - [`../../standards/domain-shared-type-value-object-spec.md`](../../standards/domain-shared-type-value-object-spec.md)
  - [`../../standards/types-undefined-or-null-spec.md`](../../standards/types-undefined-or-null-spec.md)
  - [`../../standards/值对象可以是type.md`](../../standards/值对象可以是type.md)
  - [`../../standards/值对象里的时间使用number时间戳-毫秒.md`](../../standards/值对象里的时间使用number时间戳-毫秒.md)
- config / constant / enum 规则：
  - [`../../standards/configs-vs-constants规范.md`](../../standards/configs-vs-constants规范.md)
  - [`../../standards/枚举与常量对象规范(Enum&Constant-Objects).md`](<../../standards/枚举与常量对象规范(Enum&Constant-Objects).md>)
  - [`../../standards/枚举类型在数据库中改为string.md`](../../standards/枚举类型在数据库中改为string.md)
  - [`../../standards/enum写法.md`](../../standards/enum写法.md)
  - [`../../standards/id值对象生成id的实现.md`](../../standards/id值对象生成id的实现.md)

## 日常约定

- 新代码优先遵守现有 `eslint`、`prettier`、`tsconfig`、Nx target 和测试配置，不在文档里重复抄配置。
- 共享类型、边界、fixture、helper、composition root 的实现理由优先写在代码和配置注释中。
- 如果某条规范已经能从代码结构、测试和配置直接看懂，文档保持短，不再补长示例。
- 文档与代码冲突时，以当前代码、配置和测试为准，然后再回收或修正文档。
