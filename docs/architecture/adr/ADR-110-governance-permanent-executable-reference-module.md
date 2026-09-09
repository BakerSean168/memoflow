---
tags: [adr, governance, reference-module, dev-tools, standards]
description: Governance 作为永久可执行参考模块与开发模式编码规范工作台，保留 Rule/RuleRevision 和完整纵向链路
created: 2026-09-09T10:30:00+09:00
updated: 2026-09-09T10:30:00+09:00
---

# ADR-110: Governance as a Permanent Executable Reference Module

**状态：** 已采纳
**日期：** 2026-09-09
**取代：** ADR-109

## Context

`packages/governance` 同时承担两个有意保留的职责：

1. 一个可以真实运行、真实持久化、真实通过 HTTP/IPC/Web/Desktop 使用的“编码规范/架构规范”产品模块；
2. MemoFlow feature package 的长期 executable reference implementation / gold standard。

仓库历史已经长期使用 Governance 先行验证以下架构模式，再推广到 Goal、Task、AI 等真实业务模块：

```text
contracts
    ↓
server/domain
    ↓
server/application
    ↓
server/transport
    ↓
server/infrastructure
    ↓
Prisma / PowerSync
    ↓
HTTP / IPC
    ↓
client
    ↓
Vue surface
```

它的业务语义刻意保持简单，正因为简单，才适合作为完整纵向架构教材。这个“业务虚构”不是需要消除的技术债，而是一个主动的工程资产。

ADR-109 曾提出把 Rule/RuleRevision 迁成 Knowledge Standards 后退休产品 Governance。该方向会同时失去：

- 一套长期可执行的 reference feature；
- 一个真实可操作的开发模式规范工作台；
- Prisma / PowerSync / HTTP / IPC / client / Vue 全链路的标准样板；
- 多个架构 rollout 与 surface test 的稳定示范对象。

因此 ADR-109 被本 ADR 取代。

## Decision

### 1. Governance bounded context 永久保留

以下对象继续是 Governance 自己的 canonical product truth：

```text
GovernanceRule
├── code
├── title
├── description
├── severity
├── lifecycle status
├── tags
├── goodExamples[]
├── badExamples[]
├── liveReferenceLocation?
└── author

GovernanceRuleRevision
├── revisionNumber
├── changedFields
├── previousValues
├── newValues
├── changeType
└── author
```

`Rule / RuleRevision` 不迁入 Knowledge 作为替代数据源，也不进入 retirement queue。

### 2. Governance 必须继续是真实可运行的模块

Governance 不能退化成：

- 纯文档示例；
- compile-only fixture；
- 只在测试里存在的 fake package；
- 没有 persistence / transport / UI 的 architecture skeleton。

最低 reference feature 要继续覆盖：

```text
Rule CRUD/search
Rule lifecycle
revision history
validation
Prisma persistence
PowerSync persistence
HTTP transport
IPC transport
shared application port
Web/Desktop client
Vue list/detail/editor/history
focused tests
transport parity
composition-root tests
```

开发模式必须能够真实打开 Governance UI、创建/编辑规范并查看修订记录。

### 3. Governance 是有意的 Reference Feature

`packages/governance` 的 public seam 和内部结构继续作为新 feature / 重构 feature 的首选参考：

```text
@memoflow/contracts/governance
@memoflow/governance
@memoflow/governance/api
@memoflow/governance/client
@memoflow/governance/electron
```

Reference responsibility 是受保护契约，而不是临时注释。

任何未来对 package shape、composition root、transport parity、contracts placement、Prisma/PowerSync adapter parity 的系统级架构变更，优先在 Governance 上完成一个可执行 vertical slice，再决定是否推广到其他模块。

### 4. Development Standards Workbench 是正式用途

Governance UI 可真实管理：

- 编码规范；
- 架构规范；
- repository conventions；
- good/bad examples；
- live reference locations；
- rule status / severity；
- revision history。

该用途主要面向 development / diagnostic 场景。是否在普通 production navigation 暴露由 surface policy 决定，但“不面向普通用户”不能成为删除 package 的理由。

### 5. Knowledge 可以引用 Governance，但不能取代 Governance

Knowledge 与 Governance 的边界调整为：

```text
Governance
= structured executable standards registry + revisions

Knowledge
= user-owned Git/Vault documents and knowledge projection
```

允许：

- Knowledge 文档链接某个 Governance Rule；
- AI/RAG 读取经过明确投影的 Governance rule content；
- Governance Rule 的 `liveReferenceLocation` 指向 Knowledge / docs / repository path。

禁止：

- 用 KnowledgeDocument 作为 Governance Rule 的第二份 canonical truth；
- 用 Git history 替代 RuleRevision；
- 为了“统一知识”而删除 Governance 的数据库/transport/reference vertical slice。

### 6. Engineering Governance 与 Product Governance 明确分层，但允许显式桥接

```text
Product / Reference Governance
= packages/governance + contracts + UI/API/IPC + Rule/Revision

Engineering Governance
= tools/governance + docs/governance + docs/standards + CI/oracles/registries
```

两者不是同一个 durable state owner。

工程门禁必须保持 deterministic / repository-versioned，不允许 CI 直接依赖某个开发者本地实时数据库状态。

如果未来要让开发模式 Governance 真正驱动检查/报告/自动修复，采用显式发布边界：

```text
Governance Rule
      ↓ explicit publish/export
GovernanceRuleBundle / snapshot
      ↓ committed or otherwise version-pinned
Engineering governance adapter
      ↓
check / report / autofix proposal
```

这样既保留真实管理能力，也保持 CI 可复现性。

### 7. Reference module quality gate

Governance 作为教材必须比普通 feature 更严格，而不是因为“业务虚构”降低标准。

长期至少保护：

- contracts 唯一公共真值；
- no legacy layer-named public seams；
- host-owned composition；
- API/IPC transport parity；
- Prisma/PowerSync behavioral parity；
- Result/failure contract consistency；
- no UI-domain duplicate types；
- exact focused tests for canonical architecture pattern；
- README / QUICK_REFERENCE 与实际 package shape 同步。

## Consequences

### Positive

- MemoFlow 始终拥有一个低业务复杂度、完整可运行的架构样板；
- 新模块/大重构可以先在 reference feature 验证工程模式；
- 开发者可以真实维护编码/架构规范，而不是只编辑散落 Markdown；
- RuleRevision 保留结构化审计能力；
- Knowledge 不需要被迫承担 structured standards workflow；
- Engineering Governance 可以在未来通过显式 snapshot 获得规则输入，而不牺牲 CI 确定性。

### Cost

- 仓库永久维护一套“刻意简单”的产品能力；
- Reference package 必须跟随全局架构升级，不能冻结后腐化；
- Product Governance 与 Engineering Governance 继续共用 Governance 一词，因此文档必须始终标明二者边界。

这是有意接受的成本。

## Explicitly forbidden

- 删除 `packages/governance` 作为“无真实业务价值”的清理动作；
- 将 `packages/governance` 或 `packages/contracts/src/modules/governance` 加入 retirement manifest；
- 把 Rule/RuleRevision 强制迁入 Knowledge；
- 让 CI 直接从开发者本地 Governance DB 动态读取规则；
- 用某个复杂真实业务模块完全取代 Governance 的 reference role；
- 让 reference module 只剩 mock/fixture 而失去真实 API/IPC/persistence/UI。

## Implementation follow-up

系统级实施计划中的 GOV-1901~1904 改为“Reference Governance hardening”，不再执行 Knowledge migration / bounded-context deletion。
