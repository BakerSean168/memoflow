---
tags:
  - guide
  - development
  - testing
description: MemoFlow 测试快速指南
created: 2025-11-23T16:10:00
updated: 2026-04-13T00:00:00
---

# 测试快速指南

开发时先跑离改动最近、成本最低的测试，统一从 Nx target 进入。默认采用 TDD 路径：先写失败的快测试，再补实现；只有边界变化时才升级到更慢的专项测试。

```bash
pnpm nx run task:test
pnpm nx run task:test:watch
pnpm nx run api:test
pnpm nx run api:test:watch
pnpm nx run web:test
pnpm nx run web:test:watch
pnpm nx run desktop:test
pnpm nx run desktop:test:watch
```

如果改动跨越边界，再补跑对应专项测试：

- 数据库 / Prisma：`pnpm test:integration` 或 `pnpm nx run <project>:test:integration`
- API 路由 / middleware：`pnpm nx run api:test:smoke`
- Web 真实流程：`pnpm nx run web:e2e`
- 本机 e2e 前建议：pnpm runtime:preflight:e2e（pnpm e2e 已内置 preflight）
- 同步回归：`pnpm nx run web:e2e:sync`
- Electron IPC / main：`pnpm nx run desktop:test:ipc`、`pnpm nx run desktop:test:main`
- 性能验证：`pnpm nx run task:test:perf`

## 文档入口

- [`docs/test/README.md`](../../test/README.md)：测试类型总览
- [`docs/test/running-tests.md`](../../test/running-tests.md)：命令索引和运行约束
- [`docs/test/architecture.md`](../../test/architecture.md)：分层与职责边界
- [`docs/test/configuration.md`](../../test/configuration.md)：配置、setup、helper 入口
- [`docs/test/contract-tests.md`](../../test/contract-tests.md)：Web 契约测试约定

## 维护约定

- 文档只保留入口、边界和约束，不再展开底层实现。
- `pnpm nx affected -t test` 只负责快测试，不默认替代 integration / smoke / E2E。
- 共享 `postgres-test` 的 integration suite 必须顺序运行；默认使用 `pnpm test:integration`。
- 具体实现理由应写在测试配置、setup、fixture 和 helper 注释中。
- 如果文档与当前 `project.json`、测试配置或目录结构冲突，以代码为准。

### Web Flow 动态分片

Scope Detector 将选中的 canonical Web spec、估计总时长、片数与逐片列表写入 delivery manifest，
并通过 `web_matrix` job output 驱动矩阵。仅修改 canonical spec 文件时缩小集合；共享代码、
配置或无法判定的范围保守使用全集和默认片数。完整审计对全集计算动态片数，零 spec 不启动 Web runner。

调参唯一入口为 `tools/test-system-v2/lib/web-shards.mjs` 的 `WEB_SHARD_POLICY`：
测试预算等于 wall-clock 预算减固定 setup 成本，片数按测试总时长除以测试预算向上取整，
再限制在配置上限与 spec 数量内。缺失或无效时长使用已知时长中位数。
runner 只执行 manifest 指定列表，并在其他 Playwright suite 覆盖报告前保存实际执行证据；
CI Check 校验片数、manifest digest、执行状态及每个 spec 恰好归属一片，缺片、多片、漏执行和重复均失败。
