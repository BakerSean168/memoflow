/**
 * Data Portability API composition root spec.
 * 数据导出导入 API 组合根测试。
 *
 * Verifies composeDataPortability():
 * - assembles data-portability in the mandated plan §3.3 order
 *   (export dependency set → import store → server-held disclosure port →
 *   module instance → API module)
 * - passes the assembled instance and the disclosure port into the API module
 * - returns an already-bound IApiModule-compatible handle
 * - mounts /data-portability and starts the owned instance when registered
 *
 * 验证 composeDataPortability()：
 * - 按计划 §3.3 顺序装配数据导出导入（导出依赖集合 → import store →
 *   server-held disclosure port → module instance → API module）
 * - 把已装配实例与 disclosure port 传入 API module
 * - 返回已绑定 instance 的、兼容 IApiModule 的 handle
 * - register() 挂载 /data-portability 并启动所属实例
 *
 * The ingredient factories are wrapped in vi.fn() so the spec can assert assembly
 * order, while delegating to the real implementations so the structural
 * registration test runs against genuine factories with a fake db.
 *
 * ingredient 工厂被包成 vi.fn() 以便断言装配顺序，同时委托真实实现，
 * 使结构注册测试用真实工厂 + fake db 运行。
 */

import type { Express, Router } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { PrismaClient } from '@memoflow/database';
import type { DataPortabilityApiModuleContext } from '@memoflow/data-portability/api';

vi.mock('@memoflow/data-portability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/data-portability')>();
  return {
    ...actual,
    createDataPortabilityModule: vi.fn(actual.createDataPortabilityModule),
    createPrismaDataPortabilityDependencies: vi.fn(actual.createPrismaDataPortabilityDependencies),
    createPrismaDataPortabilityImportStore: vi.fn(actual.createPrismaDataPortabilityImportStore),
    createPrismaServerHeldDataDisclosureApplicationPort: vi.fn(
      actual.createPrismaServerHeldDataDisclosureApplicationPort,
    ),
  };
});

vi.mock('@memoflow/data-portability/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/data-portability/api')>();
  return {
    ...actual,
    createDataPortabilityApiModule: vi.fn(actual.createDataPortabilityApiModule),
  };
});

import { composeDataPortability } from './compose-data-portability';
import {
  createDataPortabilityModule,
  createPrismaDataPortabilityDependencies,
  createPrismaDataPortabilityImportStore,
  createPrismaServerHeldDataDisclosureApplicationPort,
} from '@memoflow/data-portability';
import { createDataPortabilityApiModule } from '@memoflow/data-portability/api';

const fakeDb = {} as unknown as PrismaClient;

const portableReceipt = { created: 0, updated: 0, skipped: 1, warnings: [] } as const;
const portableCapabilities = [
  {
    key: 'preferences',
    schemaVersion: 3,
    payloadSchema: z.object({}).strict(),
    export: vi.fn(async () => ({})),
    dryRun: vi.fn(async () => portableReceipt),
    apply: vi.fn(async () => portableReceipt),
  },
  {
    key: 'notification-delivery-preferences',
    schemaVersion: 3,
    payloadSchema: z.object({}).strict(),
    export: vi.fn(async () => ({})),
    dryRun: vi.fn(async () => portableReceipt),
    apply: vi.fn(async () => portableReceipt),
  },
] as const;

describe('composeDataPortability assembly order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assembles in plan §3.3 order: dependencies → import store → disclosure port → module → api module', () => {
    composeDataPortability({ db: fakeDb });

    const depsOrder = createPrismaDataPortabilityDependencies.mock.invocationCallOrder[0];
    const storeOrder = createPrismaDataPortabilityImportStore.mock.invocationCallOrder[0];
    const disclosureOrder =
      createPrismaServerHeldDataDisclosureApplicationPort.mock.invocationCallOrder[0];
    const moduleOrder = createDataPortabilityModule.mock.invocationCallOrder[0];
    const apiModuleOrder = createDataPortabilityApiModule.mock.invocationCallOrder[0];

    expect(depsOrder).toBeLessThan(storeOrder);
    expect(storeOrder).toBeLessThan(disclosureOrder);
    expect(disclosureOrder).toBeLessThan(moduleOrder);
    expect(moduleOrder).toBeLessThan(apiModuleOrder);
  });

  it('passes the fake db into every Prisma ingredient factory', () => {
    composeDataPortability({ db: fakeDb });

    expect(createPrismaDataPortabilityDependencies).toHaveBeenCalledWith(fakeDb);
    expect(createPrismaDataPortabilityImportStore).toHaveBeenCalledWith(fakeDb);
    expect(createPrismaServerHeldDataDisclosureApplicationPort).toHaveBeenCalledWith(fakeDb);
  });

  it('passes the assembled instance and the disclosure port into the api module', () => {
    composeDataPortability({ db: fakeDb });

    const moduleCall = createDataPortabilityModule.mock.calls[0][0];
    expect(moduleCall).toMatchObject({
      exportDependencies: createPrismaDataPortabilityDependencies.mock.results[0].value,
      importStore: createPrismaDataPortabilityImportStore.mock.results[0].value,
    });

    const instance = createDataPortabilityModule.mock.results[0].value;
    const disclosurePort =
      createPrismaServerHeldDataDisclosureApplicationPort.mock.results[0].value;
    expect(createDataPortabilityApiModule).toHaveBeenCalledWith({
      instance,
      serverHeldDataDisclosureApi: disclosurePort,
    });
  });

  it('registers owner-provided V3 capabilities in the module-owned registry', () => {
    composeDataPortability({ db: fakeDb, portableCapabilities });

    const moduleCall = createDataPortabilityModule.mock.calls[0][0];
    expect(moduleCall.portableCapabilities).toBe(portableCapabilities);

    const instance = createDataPortabilityModule.mock.results[0].value;
    expect(
      instance.portableCapabilityRegistry.list().map((capability) => ({
        key: capability.key,
        schemaVersion: capability.schemaVersion,
      })),
    ).toEqual([
      { key: 'preferences', schemaVersion: 3 },
      { key: 'notification-delivery-preferences', schemaVersion: 3 },
    ]);
  });

  it('returns the module handle plus the disclosure port', () => {
    const composed = composeDataPortability({ db: fakeDb });

    expect(composed.module).toMatchObject({ name: 'DataPortability' });
    expect(typeof composed.module.register).toBe('function');
    expect(typeof composed.module.destroy).toBe('function');
    expect(composed.serverHeldDataDisclosureApi).toBe(
      createPrismaServerHeldDataDisclosureApplicationPort.mock.results[0].value,
    );
  });
});

/**
 * Structural registration test using real factories and a fake db.
 * 用真实工厂 + fake db 的结构注册测试。
 *
 * Real factories: the Prisma dependency adapters, import store and server-held
 * disclosure source only hold the db reference at construction (no queries), the
 * module has no runtime contributions, so registering with a fake db succeeds
 * and mounts /data-portability.
 *
 * 真实工厂下：Prisma 依赖适配器、import store 与 server-held disclosure source
 * 构造时只持有 db 引用（无查询），模块没有运行时贡献，因此用 fake db 注册可成功
 * 并挂载 /data-portability。
 */
describe('composeDataPortability structural registration', () => {
  let routerUse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    routerUse = vi.fn();
  });

  it('mounts /data-portability on the router and starts the owned instance', () => {
    const composed = composeDataPortability({ db: fakeDb });

    const instance = createDataPortabilityModule.mock.results[0].value;
    const startSpy = vi.spyOn(instance, 'start');
    const disposeSpy = vi.spyOn(instance, 'dispose');

    const context: DataPortabilityApiModuleContext = {
      app: {} as Express,
      router: { use: routerUse, stack: [] } as unknown as Router,
      middleware: {
        auth: vi.fn(),
        requireRole: vi.fn(() => vi.fn()),
      },
      openApiRegistry: undefined,
    };

    expect(() => composed.module.register(context)).not.toThrow();
    expect(routerUse).toHaveBeenCalledWith('/data-portability', expect.anything());

    expect(startSpy).toHaveBeenCalledTimes(1);

    composed.module.destroy?.();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});

describe('composeDataPortability layering boundary', () => {
  it('imports Prisma ingredients from the public package surface only', () => {
    const composer = readFileSync(resolve(__dirname, './compose-data-portability.ts'), 'utf8');

    expect(composer).toContain("from '@memoflow/data-portability'");
    expect(composer).toContain("from '@memoflow/data-portability/api'");
    expect(composer).not.toMatch(/from '.*server\/application\/prisma-adapters'/);
    expect(composer).not.toMatch(
      /from '.*server\/application\/import-store\/prisma-data-portability-import-store'/,
    );
    expect(composer).not.toContain('new PrismaDataPortabilityImportStore');
    expect(composer).not.toContain('new PrismaFocusSessionAdapter');
  });
});
