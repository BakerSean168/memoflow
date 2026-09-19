/**
 * Account API Module Lifecycle Spec
 * 账户 API 模块生命周期测试
 *
 * Verifies that createAccountApiModule is a pure transport/lifecycle adapter:
 * it wires routes, starts the already-assembled instance, owns a per-handle
 * state machine (single registration, terminal states, idempotent destroy),
 * cleans up on start failure, and never touches `db`.
 *
 * 验证 createAccountApiModule 是纯传输/生命周期适配器：
 * 挂载路由、启动已装配实例、维护每个 handle 的状态机（单次注册、
 * 终态、destroy 幂等）、start 失败时清理，且完全不触碰 `db`。
 */

import type { Express, Router } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountModuleInstance } from '../server/infrastructure';
import { createAccountApiModule, type AccountApiModuleContext } from './module';

function createFakeInstance() {
  const api = {
    listAccounts: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    closeAccount: vi.fn(),
    queryClosureTimeline: vi.fn(),
    replayClosure: vi.fn(),
    getOperationAudit: vi.fn(),
  };
  const start = vi.fn();
  const dispose = vi.fn();
  const instance: AccountModuleInstance = {
    accountRepository: {} as never,
    useCases: {} as never,
    api,
    start,
    dispose,
  } as AccountModuleInstance;
  return { instance, api, start, dispose };
}

function createFakeContext(): AccountApiModuleContext {
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

describe('createAccountApiModule lifecycle', () => {
  let fake: ReturnType<typeof createFakeInstance>;
  let context: AccountApiModuleContext;

  beforeEach(() => {
    fake = createFakeInstance();
    context = createFakeContext();
  });

  it('register wires routes once, starts once, and never touches db', () => {
    const moduleDef = createAccountApiModule({ instance: fake.instance });

    // No db property on the context: register must still work.
    // 上下文没有 db 属性：register 必须照常工作。
    const contextWithoutDb = { ...context } as AccountApiModuleContext;
    delete (contextWithoutDb as Record<string, unknown>).db;

    expect(() => moduleDef.register(contextWithoutDb)).not.toThrow();

    const routerUse = context.router.use as ReturnType<typeof vi.fn>;
    expect(routerUse).toHaveBeenCalledTimes(1);
    expect(routerUse).toHaveBeenCalledWith('/accounts', expect.anything());

    expect(
      (context.openApiRegistry?.registerPath as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(0);

    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('throws on a second register() call (single registration per handle)', () => {
    const moduleDef = createAccountApiModule({ instance: fake.instance });

    moduleDef.register(context);
    expect(() => moduleDef.register(context)).toThrow(/only register once/);
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('throws on register() after destroy()', () => {
    const moduleDef = createAccountApiModule({ instance: fake.instance });

    moduleDef.register(context);
    moduleDef.destroy?.();

    expect(() => moduleDef.register(context)).toThrow(/only register once/);
  });

  it('destroy disposes exactly once and is idempotent', () => {
    const moduleDef = createAccountApiModule({ instance: fake.instance });

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

    const moduleDef = createAccountApiModule({ instance: fake.instance });

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
    const moduleDef = createAccountApiModule({ instance: fake.instance });

    expect(() => moduleDef.register(context)).toThrow('start failed');
    expect(routerUse).not.toHaveBeenCalled();
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it('destroy() after a failed registration does not dispose a second time', () => {
    fake.start.mockImplementation(() => {
      throw new Error('start failed');
    });

    const moduleDef = createAccountApiModule({ instance: fake.instance });

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

    const mountContext = { ...context, router: routerStub } as AccountApiModuleContext;
    const moduleDef = createAccountApiModule({ instance: fake.instance });

    expect(() => moduleDef.register(mountContext)).toThrow('mount failed');
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect((routerStub as unknown as { stack: unknown[] }).stack).toEqual([preExisting]);

    // The handle is now 'failed': destroy() must no-op (dispose already ran once).
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

    const moduleDef = createAccountApiModule({ instance: fake.instance });

    expect(() => moduleDef.register(context)).toThrow('start failed');
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });
});
