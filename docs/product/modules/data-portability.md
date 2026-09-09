---
tags: [product, module, data-portability]
description: Data Portability 当前 V2 与 owner-driven V3 目标边界
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-09T00:31:00+08:00
---

# Data Portability 模块说明

> **ADR-111 cutover policy (2026-09-09):** 当前没有需要保留的 MemoFlow 旧业务数据，也不要求兼容旧客户端/旧备份。本文历史推演中仅为旧数据保存设计的 migration/backfill/compatibility window 不再执行；目标模型和真实行为不变量继续有效。实施采用 direct canonical cutover + old-surface deletion + reset/reseed。

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

Owner module 对自己的 V3 portable schema、validation 和 apply 负责；Data Portability 对 orchestration、reference resolution、安全和版本控制负责。本轮不实现 V1/V2 legacy migrator。

相关：

- [Current system map](../../analysis/2026-09-09-data-portability-current-system-map.md)
- [ADR-106](../../architecture/adr/ADR-106-owner-driven-data-portability-v3.md)
- [System-wide implementation plan](../../plan/active/2026-09-09-system-wide-vnext-model-convergence-implementation.md)
