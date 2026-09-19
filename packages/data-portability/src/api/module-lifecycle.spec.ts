/**
 * Data Portability API Module Lifecycle Spec
 * 数据导出导入 API 模块生命周期测试
 *
 * Verifies that createDataPortabilityApiModule is a pure transport/lifecycle
 * adapter: it wires routes, starts the already-assembled instance, owns a
 * per-handle state machine (single registration, terminal states, idempotent
 * destroy), cleans up on start failure, and never touches `db`.
 *
 * 验证 createDataPortabilityApiModule 是纯传输/生命周期适配器：
 * 挂载路由、启动已装配实例、维护每个 handle 的状态机（单次注册、
 * 终态、destroy 幂等）、start 失败时清理，且完全不触碰 `db`。
 */

import type { Express, Router } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataPortabilityModuleInstance } from '../server/infrastructure';
import type { ServerHeldDataDisclosureApplicationPort } from '../server/application';
import {
  createDataPortabilityApiModule,
  type DataPortabilityApiModuleContext,
} from './module';

function createDisclosureApiStub(): ServerHeldDataDisclosureApplicationPort {
  return {
    exportServerHeldDataDisclosure: vi.fn().mockResolvedValue({
      fileName: 'disclosure.json',
      content: '{}',
      summary: { entityCounts: {}, cachedAttachmentBytes: 0, notes: [] },
    }),
  };
}

function createFakeInstance() {
  const api = {
    exportPortableDataV3: vi.fn().mockResolvedValue({
      fileName: 'export.json',
      content: '{}',
      summary: { capabilityKeys: [], warnings: [] },
    }),
    dryRunPortableDataV3: vi.fn().mockResolvedValue({
      batchId: 'batch-1',
      dryRun: true,
      capabilities: [],
      created: {},
      updated: {},
      skipped: {},
      warnings: [],
    }),
    applyPortableDataV3: vi.fn().mockResolvedValue({
      batchId: 'batch-1',
      dryRun: false,
      capabilities: [],
      created: {},
      updated: {},
      skipped: {},
      warnings: [],
    }),
  };
  const start = vi.fn();
  const dispose = vi.fn();
  const instance: DataPortabilityModuleInstance = {
    useCases: {} as never,
    api,
    start,
    dispose,
  } as DataPortabilityModuleInstance;
  return { instance, api, start, dispose };
}

function createFakeContext(): DataPortabilityApiModuleContext {
  return {
    app: {} as Express,
    router: { use: vi.fn(), stack: [] } as unknown as Router,
    middleware: {
      auth: vi.fn(),
      requireRole: vi.fn(() => vi.fn()),
    },
    openApiRegistry: {
      registerPath: vi.fn(),
      register: vi.fn(),
    },
  };
}

describe('createDataPortabilityApiModule lifecycle', () => {
  let fake: ReturnType<typeof createFakeInstance>;
  let context: DataPortabilityApiModuleContext;
  let disclosureApi: ServerHeldDataDisclosureApplicationPort;

  beforeEach(() => {
    fake = createFakeInstance();
    context = createFakeContext();
    disclosureApi = createDisclosureApiStub();
  });

  it('register wires routes once, starts once, and never touches db', () => {
    const moduleDef = createDataPortabilityApiModule({
      instance: fake.instance,
      serverHeldDataDisclosureApi: disclosureApi,
    });

    // No db property on the context: register must still work.
    // 上下文没有 db 属性：register 必须照常工作。
    const contextWithoutDb = { ...context } as DataPortabilityApiModuleContext;
    delete (contextWithoutDb as Record<string, unknown>).db;

    expect(() => moduleDef.register(contextWithoutDb)).not.toThrow();

    const routerUse = context.router.use as ReturnType<typeof vi.fn>;
    expect(routerUse).toHaveBeenCalledTimes(1);
    expect(routerUse).toHaveBeenCalledWith('/data-portability', expect.anything());

    expect(
      (context.openApiRegistry?.registerPath as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(0);

    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('throws on a second register() call (single registration per handle)', () => {
    const moduleDef = createDataPortabilityApiModule({
      instance: fake.instance,
      serverHeldDataDisclosureApi: disclosureApi,
    });

    moduleDef.register(context);
    expect(() => moduleDef.register(context)).toThrow(/only register once/);
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('throws on register() after destroy()', () => {
    const moduleDef = createDataPortabilityApiModule({
      instance: fake.instance,
      serverHeldDataDisclosureApi: disclosureApi,
    });

    moduleDef.register(context);
    moduleDef.destroy?.();

    expect(() => moduleDef.register(context)).toThrow(/only register once/);
  });

  it('destroy disposes exactly once and is idempotent', () => {
    const moduleDef = createDataPortabilityApiModule({
      instance: fake.instance,
      serverHeldDataDisclosureApi: disclosureApi,
    });

    moduleDef.destroy?.();
    expect(fake.dispose).toHaveBeenCalledTimes(1);

    moduleDef.destroy?.();
    moduleDef.destroy?.();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes and rethrows when start() throws, leaving a handle that cannot be re-registered', () => {
    fake.start.mockImplementation(() => {
      throw new Error('start failed');
    });

    const moduleDef = createDataPortabilityApiModule({
      instance: fake.instance,
      serverHeldDataDisclosureApi: disclosureApi,
    });

    expect(() => moduleDef.register(context)).toThrow('start failed');
    expect(fake.dispose).toHaveBeenCalledTimes(1);

    expect(() => moduleDef.register(context)).toThrow(/only register once/);
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('does not mount any route on the host router when start() throws', () => {
    fake.start.mockImplementation(() => {
      throw new Error('start failed');
    });

    const routerUse = context.router.use as ReturnType<typeof vi.fn>;
    const moduleDef = createDataPortabilityApiModule({
      instance: fake.instance,
      serverHeldDataDisclosureApi: disclosureApi,
    });

    expect(() => moduleDef.register(context)).toThrow('start failed');
    expect(routerUse).not.toHaveBeenCalled();
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('destroy() after a failed registration does not dispose a second time', () => {
    fake.start.mockImplementation(() => {
      throw new Error('start failed');
    });

    const moduleDef = createDataPortabilityApiModule({
      instance: fake.instance,
      serverHeldDataDisclosureApi: disclosureApi,
    });

    expect(() => moduleDef.register(context)).toThrow('start failed');
    expect(fake.dispose).toHaveBeenCalledTimes(1);

    moduleDef.destroy?.();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('rolls back the mount on the host router when router.use() throws', () => {
    const preExisting = { name: '<pre-existing>' };
    const routerStub = {
      stack: [preExisting],
      use: vi.fn().mockImplementationOnce(() => {
        throw new Error('mount failed');
      }),
    } as unknown as Router;

    const mountContext = { ...context, router: routerStub } as DataPortabilityApiModuleContext;
    const moduleDef = createDataPortabilityApiModule({
      instance: fake.instance,
      serverHeldDataDisclosureApi: disclosureApi,
    });

    expect(() => moduleDef.register(mountContext)).toThrow('mount failed');
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect((routerStub as unknown as { stack: unknown[] }).stack).toEqual([preExisting]);

    moduleDef.destroy?.();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('rethrows the original registration error even if dispose also throws', () => {
    fake.start.mockImplementation(() => {
      throw new Error('start failed');
    });
    fake.dispose.mockImplementation(() => {
      throw new Error('dispose failed');
    });

    const moduleDef = createDataPortabilityApiModule({
      instance: fake.instance,
      serverHeldDataDisclosureApi: disclosureApi,
    });

    expect(() => moduleDef.register(context)).toThrow('start failed');
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });
});
