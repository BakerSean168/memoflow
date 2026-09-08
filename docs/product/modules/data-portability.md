---
tags: [product, module, data-portability]
description: Data Portability 当前 V2 与 owner-driven V3 目标边界
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-09T00:31:00+08:00
---

# Data Portability 模块说明

> ADR-106 已采纳 owner-driven V3；当前生产实现仍是 schemaVersion 2。

## 定位

Data Portability 是跨模块 **备份/恢复 orchestrator**，不是业务事实 owner，也不应该形成自己的 Goal/Task/Reminder/Repository/AI 第二模型。

当前值得保留的能力：

- user business backup 与 server-held disclosure 分离；
- host-owned identity；
- secret/id blacklist；
- dry-run；
- import receipt/warning；
- Web/API 与 Desktop/PowerSync parity。

V3 目标：

```text
PortableBackupEnvelopeV3
  -> PortableCapabilityRegistry
      -> Goal capability
      -> Task capability
      -> Routine capability
      -> Knowledge capability
      -> Preferences capability
      -> ...
```

Owner module 对自己的 portable schema、migration 和 apply 负责；Data Portability 对 orchestration、reference resolution、安全和版本迁移负责。

相关：

- [Current system map](../../analysis/2026-09-09-data-portability-current-system-map.md)
- [ADR-106](../../architecture/adr/ADR-106-owner-driven-data-portability-v3.md)
- [System-wide implementation plan](../../plan/active/2026-09-09-system-wide-vnext-model-convergence-implementation.md)
