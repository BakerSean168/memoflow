---
tags: [product, module, data-portability]
description: Data Portability 当前 V2 与 owner-driven V3 目标边界
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-10T21:18:00+08:00
---

# Data Portability 模块说明

> **ADR-111 cutover policy (2026-09-09):** 当前没有需要保留的 MemoFlow 旧业务数据，也不要求兼容旧客户端/旧备份。本文历史推演中仅为旧数据保存设计的 migration/backfill/compatibility window 不再执行；目标模型和真实行为不变量继续有效。实施采用 direct canonical cutover + old-surface deletion + reset/reseed。

> ADR-106 已采纳 owner-driven V3。当前**用户可见** export/import 路由仍是 schemaVersion 2；V3 envelope/registry/coordinator 已实现，并已在 API/Desktop 生产组合根注册首批稳定 owner capability，但尚未切换产品入口。

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

## 当前 V3 实施 checkpoint（2026-09-10）

当前 API 与 Desktop 宿主已经把两个 owner capability 注册进 Data Portability 自有的 `PortableCapabilityRegistry`：

- `preferences@3`：Setting owner，仅包含 canonical presentation/regional preferences；
- `notification-delivery-preferences@3`：Notification owner，仅包含稳定的 `globalChannels + workflowOverrides` 用户 delivery choice。

Notification capability **不**导出 identity/id/version/timestamp、Desktop device presentation/sound，也暂不导出当前 `doNotDisturb/rateLimit`。后两者仍受 ADR-088 的 QuietHours / SystemDeliveryGuard 最终模型收敛约束，不能在模型未冻结前固化成 V3 协议。

这一步只是 production registry wiring；当前 V2 full-backup path 仍承担产品备份覆盖。只有剩余 surviving owners 都提供最终-model capability 后，V3 coordinator 才能接管产品 export/import，并在同一 destructive cutover 中删除 V2。

相关：

- [Current system map](../../analysis/2026-09-09-data-portability-current-system-map.md)
- [ADR-106](../../architecture/adr/ADR-106-owner-driven-data-portability-v3.md)
- [System-wide implementation plan](../../plan/active/2026-09-09-system-wide-vnext-model-convergence-implementation.md)
