---
tags: [product, module, data-portability]
description: Data Portability 当前 V2 与 owner-driven V3 目标边界
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-18T00:00:00+08:00
---

# Data Portability 模块说明

> **ADR-111 cutover policy (2026-09-09):** 当前没有需要保留的 MemoFlow 旧业务数据，也不要求兼容旧客户端/旧备份。本文历史推演中仅为旧数据保存设计的 migration/backfill/compatibility window 不再执行；目标模型和真实行为不变量继续有效。实施采用 direct canonical cutover + old-surface deletion + reset/reseed。

> ADR-106 已采纳 owner-driven V3。当前**用户可见** export/import 路由仍是 schemaVersion 2；V3 envelope/registry/coordinator 已实现，并已在 API/Desktop 生产组合根注册稳定 owner capability（包括 AI Conversation shell `ai-conversations@3`），但尚未切换产品入口。

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
      -> Account account-profile@3
      -> Setting preferences@3
      -> Notification notification-delivery-preferences@3
      -> ...
```

Owner module 对自己的 V3 portable schema、validation 和 apply 负责；Data Portability 对 orchestration、reference resolution、安全和版本控制负责。本轮不实现 V1/V2 legacy migrator。

## 当前 V3 实施 checkpoint（2026-09-18）

当前 API 与 Desktop 宿主已经把 owner capability 注册进 Data Portability 自有的 `PortableCapabilityRegistry`：

- `account-profile@3`：Account owner，仅包含用户拥有的六个资料字段：`nickname`、`realName`、`avatarUrl`、`bio`、`gender`、`birthday`；
- `preferences@3`：Setting owner，仅包含 canonical presentation/regional preferences；
- `notification-delivery-preferences@3`：Notification owner，仅包含稳定的 `globalChannels + workflowOverrides` 用户 delivery choice。
- `ai-conversations@3`：AI owner，仅包含产品 Conversation shell 的 `ref`、`name` 与 canonical `status`；Mastra transcript/history/workflow runtime、provider connection/secret、execution record、model evidence 与 Knowledge index/cache 不属于该 capability。

`account-profile@3` 的边界是刻意收窄的：portable payload 不包含 host identity、Account 记录、auth 状态、lifecycle 状态、版本/时间戳或任何凭据。导入只能应用到已经存在的 host Account；它不会从 portable payload 创建 Account 或恢复身份、认证、生命周期、时间戳和凭据。

Notification capability **不**导出 identity/id/version/timestamp、Desktop device presentation/sound，也暂不导出当前 `doNotDisturb/rateLimit`。后两者仍受 ADR-088 的 QuietHours / SystemDeliveryGuard 最终模型收敛约束，不能在模型未冻结前固化成 V3 协议。

这一步只是 production registry wiring；当前 V2 full-backup path 仍承担产品备份覆盖，并暂时重复携带 Conversation shell metadata。AI Conversation shell 的 Stage A owner coverage 现已补齐；V2 只保留到 PORT-1611 切除产品 surface，V3 coordinator 尚未接管产品入口，PORT-1611 也不因本 capability 完成而视为 done。

相关：

- [Current system map](../../analysis/2026-09-09-data-portability-current-system-map.md)
- [ADR-106](../../architecture/adr/ADR-106-owner-driven-data-portability-v3.md)
- [System-wide implementation plan](../../plan/active/2026-09-09-system-wide-vnext-model-convergence-implementation.md)
