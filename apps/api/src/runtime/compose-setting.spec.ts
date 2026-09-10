/**
 * Setting API composition root spec.
 * 设置 API 组合根测试。
 *
 * Verifies composeSetting():
 * - assembles setting in the mandated plan §3.3 order
 *   (repository set → module-owned runtime contribution → module instance → API module)
 * - returns an already-bound IApiModule-compatible handle
 * - mounts /settings and starts the owned instance when registered
 *
 * 验证 composeSetting()：
 * - 按计划 §3.3 顺序装配设置（仓储集合 → 模块自有运行时贡献 → module instance → API module）
 * - 返回已绑定 instance 的、兼容 IApiModule 的 handle
 * - register() 挂载 /settings 并启动所属实例
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
import type { PrismaClient } from '@memoflow/database';
import type { SettingApiModuleContext } from '@memoflow/setting/api';

vi.mock('@memoflow/setting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/setting')>();
  return {
    ...actual,
    createSettingModule: vi.fn(actual.createSettingModule),
    createSettingPrismaRepositories: vi.fn(actual.createSettingPrismaRepositories),
    createSettingRuntimeContribution: vi.fn(actual.createSettingRuntimeContribution),
  };
});

vi.mock('@memoflow/setting/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/setting/api')>();
  return {
    ...actual,
    createSettingApiModule: vi.fn(actual.createSettingApiModule),
  };
});

import { composeSetting } from './compose-setting';
import {
  createSettingModule,
  createSettingPrismaRepositories,
  createSettingRuntimeContribution,
} from '@memoflow/setting';
import { createSettingApiModule } from '@memoflow/setting/api';

const fakeDb = {} as unknown as PrismaClient;

describe('composeSetting assembly order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assembles in plan §3.3 order: repositories → runtime contribution → module → api module', () => {
    composeSetting({ db: fakeDb });

    const reposOrder = createSettingPrismaRepositories.mock.invocationCallOrder[0];
    const runtimeOrder = createSettingRuntimeContribution.mock.invocationCallOrder[0];
    const moduleOrder = createSettingModule.mock.invocationCallOrder[0];
    const apiModuleOrder = createSettingApiModule.mock.invocationCallOrder[0];

    expect(reposOrder).toBeLessThan(runtimeOrder);
    expect(runtimeOrder).toBeLessThan(moduleOrder);
    expect(moduleOrder).toBeLessThan(apiModuleOrder);
  });

  it('passes the fake db, the repository set and the runtime contribution into the module', () => {
    composeSetting({ db: fakeDb });

    expect(createSettingPrismaRepositories).toHaveBeenCalledWith(fakeDb);

    const repoSet = createSettingPrismaRepositories.mock.results[0].value;
    const moduleCall = createSettingModule.mock.calls[0][0];
    expect(moduleCall).toMatchObject({
      userPreferenceRepository: repoSet.userPreferenceRepository,
    });
    expect(moduleCall).not.toHaveProperty('userSettingRepository');
    expect(moduleCall.runtimeContributions).toContain(
      createSettingRuntimeContribution.mock.results[0].value,
    );

    const instance = createSettingModule.mock.results[0].value;
    expect(createSettingApiModule).toHaveBeenCalledWith({ instance });
  });

  it('returns a module handle with name Setting plus register and destroy', () => {
    const handle = composeSetting({ db: fakeDb });

    expect(handle).toMatchObject({ name: 'Setting' });
    expect(typeof handle.register).toBe('function');
    expect(typeof handle.destroy).toBe('function');
  });
});

/**
 * Structural registration test using real factories and a fake db.
 * 用真实工厂 + fake db 的结构注册测试。
 *
 * Real factories: the canonical preference Prisma repository only holds the db reference
 * at construction, and the module-owned runtime only logs, so registering with a
 * fake db succeeds and mounts /settings.
 *
 * 真实工厂下：canonical preference Prisma 仓储构造时只持有 db 引用（无查询），模块自有运行时
 * 仅记录日志，因此用 fake db 注册可成功并挂载 /settings。
 */
describe('composeSetting structural registration', () => {
  let routerUse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    routerUse = vi.fn();
  });

  it('mounts /settings on the router and starts the owned instance', () => {
    const handle = composeSetting({ db: fakeDb });

    const instance = createSettingModule.mock.results[0].value;
    const startSpy = vi.spyOn(instance, 'start');
    const disposeSpy = vi.spyOn(instance, 'dispose');

    const context: SettingApiModuleContext = {
      app: {} as Express,
      router: { use: routerUse, stack: [] } as unknown as Router,
      middleware: {
        auth: vi.fn(),
        requireRole: vi.fn(() => vi.fn()),
      },
      openApiRegistry: undefined,
    };

    expect(() => handle.register(context)).not.toThrow();
    expect(routerUse).toHaveBeenCalledWith('/settings', expect.anything());

    expect(startSpy).toHaveBeenCalledTimes(1);

    handle.destroy?.();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});
