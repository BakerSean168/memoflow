---
tags:
  - plan
  - active
  - data-portability
  - desktop
  - testing
description: Desktop 端 Data Portability 合约测试与 IPC 集成测试方案
created: 2026-06-04T12:30:00
updated: 2026-06-04T12:30:00
---

# Desktop 端 Data Portability 合约测试与 IPC 集成测试方案

## 0. 执行状态

待实施。

## 1. 背景

`feat/user-data-portability-v1` 分支已实现 Desktop 端完整 IPC 路径（electron-entry → IPC handler → PowerSync），且已有两条路径的单元测试覆盖。但 Desktop 端存在以下测试缺口：

1. **`DataPortabilityChannels` 未定义** — channel 名称在 adapter 和 electron-entry 中各写了一遍硬编码字符串，没有共享常量。
2. **preload 白名单未包含 data-portability channels** — `allowed-channels.ts` 中没有 `data-portability:export` 和 `data-portability:import`，IPC 调用可能被 preload 桥拦截。
3. **合约测试未覆盖 data-portability** — `ipc-contracts.spec.ts` 和 `module-handler-contracts.spec.ts` 都没有 data-portability 的条目。
4. **IPC handler ↔ adapter 集成测试缺失** — electron-entry 测试和 IPC adapter 测试各自独立 mock，没有验证 renderer adapter 调用能到达 main 进程的真实 handler。

## 2. 目标

- 定义共享 `DataPortabilityChannels` 常量。
- preload 白名单包含 data-portability channels。
- 合约测试覆盖 data-portability（adapter 只调用已注册 channel，handler 覆盖所有共享 channel）。
- IPC 集成测试验证 renderer adapter → main handler 的完整调用链。
- adapter 和 electron-entry 引用共享常量，消除硬编码。

## 3. 非目标

- 不做 Electron Playwright E2E（投入产出比低）。
- 不改业务逻辑或 import/export 行为。

## 4. 实施方案

### 4.1 定义 DataPortabilityChannels

**文件**: `packages/contracts/src/electron/ipc-channels.ts`

在现有 channel 定义末尾新增：

```ts
export const DataPortabilityChannels = {
  EXPORT: 'data-portability:export',
  IMPORT: 'data-portability:import',
} as const;
```

### 4.2 更新 preload 白名单

**文件**: `apps/desktop/src/preload/allowed-channels.ts`

- 新增 import: `DataPortabilityChannels`
- 在 `ALLOWED_CHANNELS` 数组中添加: `...Object.values(DataPortabilityChannels)`

### 4.3 更新 adapter 引用共享常量

**文件**: `packages/data-portability/src/infrastructure-client/adapters/ipc/data-portability-ipc.adapter.ts`

将硬编码字符串替换为共享常量引用：

```ts
import { DataPortabilityChannels } from '@memoflow/contracts/electron';

// exportUserData:
return this.ipcClient.invoke(DataPortabilityChannels.EXPORT, data);
// importUserData:
return this.ipcClient.invoke(DataPortabilityChannels.IMPORT, data);
```

### 4.4 更新 electron-entry 引用共享常量

**文件**: `packages/data-portability/src/electron-entry/index.ts`

删除本地 `Ch` 常量，替换为：

```ts
import { DataPortabilityChannels } from '@memoflow/contracts/electron';

// register 中:
ipcMain.handle(DataPortabilityChannels.EXPORT, ...);
ipcMain.handle(DataPortabilityChannels.IMPORT, ...);

// destroy 中:
ipcMain.removeHandler(DataPortabilityChannels.EXPORT);
ipcMain.removeHandler(DataPortabilityChannels.IMPORT);
```

### 4.5 合约测试 1：preload 合约（ipc-contracts.spec.ts）

**文件**: `apps/desktop/src/preload/__tests__/ipc-contracts.spec.ts`

新增两个测试（遵循现有 Pattern A + Pattern B）：

**Pattern A — 白名单前缀对齐**:

```ts
it('data-portability channels are registered in the preload allowlist', () => {
  expect(allowedByPrefix('data-portability:')).toEqual(channelSet(DataPortabilityChannels));
});
```

**Pattern B — adapter 调用 channel 合规**:

```ts
it('data-portability adapter only invokes registered desktop data-portability channels', async () => {
  const recorder = createIpcRecorder();
  const adapter = new DataPortabilityIpcAdapter(recorder as never);

  await adapter.exportUserData({} as never);
  await adapter.importUserData({} as never);

  expectChannelsRegistered(recorder.channels(), channelSet(DataPortabilityChannels));
});
```

### 4.6 合约测试 2：handler 合约（module-handler-contracts.spec.ts）

**文件**: `apps/desktop/src/main/ipc/__tests__/module-handler-contracts.spec.ts`

新增一个测试（遵循现有 source-text 检查模式）：

```ts
it('data-portability electron entry covers all shared data-portability channels', () => {
  const source = readWorkspaceFile('packages/data-portability/src/electron-entry/index.ts');
  expectChannelsInSource(source, DataPortabilityChannels);
});
```

### 4.7 IPC 集成测试：handler ↔ adapter 完整调用链

**新建文件**: `apps/desktop/src/main/ipc/__tests__/data-portability-handler.spec.ts`

**测试目标**: 验证 `DataPortabilityElectronModule.register()` 注册的 handler 能被正确调用，且返回的 Result 结构符合预期。使用 `FakePowerSyncDb`（从 round-trip test 复用模式）模拟 PowerSync 数据库。

**测试用例**:

1. **register 注册了 export 和 import handler**
   - 调用 `DataPortabilityElectronModule.register(context)`
   - 断言 `ipcMain.handle` 被调用两次，channel 分别为 `DataPortabilityChannels.EXPORT` 和 `DataPortabilityChannels.IMPORT`

2. **export handler 返回有效 envelope**
   - 提取 export handler
   - 调用 `handler({}, { include: ['settings'] })`
   - 断言返回 `{ ok: true, data: { fileName, content, summary } }`
   - 解析 content，断言 `kind === 'memoflow.user-data-export'`

3. **import handler 成功导入并返回正确计数**
   - 先调用 export 获取 content
   - 调用 `handler({}, { content, dryRun: false })`
   - 断言返回 `{ ok: true, data: { batchId, dryRun: false, created, ... } }`

4. **import handler 拒绝含敏感字段的 content**
   - 构造含 `identityId` 的 content
   - 断言返回 `{ ok: false, error: { code: 'VALIDATION_ERROR' } }`

5. **destroy 移除所有 handler**
   - 调用 `DataPortabilityElectronModule.destroy()`
   - 断言 `ipcMain.removeHandler` 被调用两次

**复用模式**: 使用 `apps/desktop/src/main/ipc/__tests__/setup.ts` 的全局 Electron mock 和 `test-helpers.ts` 的 `createHandlerCapture()`。FakePowerSyncDb 从 `packages/data-portability/src/infrastructure-server/powersync/__tests__/powersync-round-trip.test.ts` 中提取为共享 fixture。

## 5. 需要修改的文件

| 文件                                                                                                   | 操作                                    |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `packages/contracts/src/electron/ipc-channels.ts`                                                      | 新增 `DataPortabilityChannels`          |
| `packages/contracts/src/electron/index.ts`                                                             | 确认 re-export                          |
| `apps/desktop/src/preload/allowed-channels.ts`                                                         | 添加 `DataPortabilityChannels` 到白名单 |
| `packages/data-portability/src/infrastructure-client/adapters/ipc/data-portability-ipc.adapter.ts`     | 引用共享常量                            |
| `packages/data-portability/src/electron-entry/index.ts`                                                | 引用共享常量                            |
| `apps/desktop/src/preload/__tests__/ipc-contracts.spec.ts`                                             | 新增 2 个测试                           |
| `apps/desktop/src/main/ipc/__tests__/module-handler-contracts.spec.ts`                                 | 新增 1 个测试                           |
| `apps/desktop/src/main/ipc/__tests__/data-portability-handler.spec.ts`                                 | 新建，5 个测试                          |
| `packages/data-portability/src/infrastructure-server/powersync/__tests__/powersync-round-trip.test.ts` | 提取 `FakePowerSyncDb` 为可复用 fixture |

## 6. 验证

```bash
# 合约测试
pnpm nx run desktop:test:ipc

# data-portability 包测试（确认 adapter/electron-entry 改动不破坏）
pnpm nx run data-portability:test

# 全量构建确认
pnpm nx build api
pnpm nx build desktop
```
