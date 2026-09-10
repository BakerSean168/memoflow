/**
 * Account API composition root spec.
 * 账户 API 组合根测试。
 *
 * Verifies composeAccount():
 * - assembles account in the mandated plan §3.3 order
 *   (Prisma repository set → module-owned runtime contributions → account instance → API module)
 * - passes the host cloudAuth port through unchanged (never inferred from context)
 * - returns an already-bound IApiModule-compatible handle
 * - mounts /accounts and starts the owned instance when registered
 *
 * 验证 composeAccount()：
 * - 按计划 §3.3 顺序装配账户（Prisma 仓储集合 → 模块自有运行时贡献 →
 *   account instance → API module）
 * - 原样透传宿主 cloudAuth port（绝不从 context 推断）
 * - 返回已绑定 instance 的、兼容 IApiModule 的 handle
 * - register() 挂载 /accounts 并启动所属实例
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
import type { AccountApiModuleContext } from '@memoflow/account/api';
import type { AccountRuntimeContributionsInput, CloudAuthLike } from '@memoflow/account';
import { createFixedClock } from '@memoflow/time';

vi.mock('@memoflow/account', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/account')>();
  return {
    ...actual,
    createAccountModule: vi.fn(actual.createAccountModule),
    createAccountPrismaRepositories: vi.fn(actual.createAccountPrismaRepositories),
    createAccountRuntimeContributions: vi.fn(actual.createAccountRuntimeContributions),
  };
});

vi.mock('@memoflow/account/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/account/api')>();
  return {
    ...actual,
    createAccountApiModule: vi.fn(actual.createAccountApiModule),
  };
});

import { composeAccount } from './compose-account';
import {
  createAccountModule,
  createAccountPrismaRepositories,
  createAccountRuntimeContributions,
} from '@memoflow/account';
import { createAccountApiModule } from '@memoflow/account/api';

const fakeDb = {} as unknown as PrismaClient;
const fakeClock = createFixedClock(1_700_000_000_000);
const fakeCloudAuth = {
  revokeAllSessions: vi.fn(async () => ({ revokedSessions: 0 })),
} as unknown as CloudAuthLike;
const hostRuntime: AccountRuntimeContributionsInput = { start: () => {}, stop: () => {} };

describe('composeAccount assembly order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assembles in plan §3.3 order: repositories → runtime contributions → module → api module', () => {
    composeAccount({ db: fakeDb, cloudAuth: fakeCloudAuth, clock: fakeClock });

    const reposOrder = createAccountPrismaRepositories.mock.invocationCallOrder[0];
    const runtimeOrder = createAccountRuntimeContributions.mock.invocationCallOrder[0];
    const moduleOrder = createAccountModule.mock.invocationCallOrder[0];
    const apiModuleOrder = createAccountApiModule.mock.invocationCallOrder[0];

    expect(reposOrder).toBeLessThan(runtimeOrder);
    expect(runtimeOrder).toBeLessThan(moduleOrder);
    expect(moduleOrder).toBeLessThan(apiModuleOrder);
  });

  it('passes the exact host cloudAuth port into the repository factory unchanged', () => {
    composeAccount({ db: fakeDb, cloudAuth: fakeCloudAuth, clock: fakeClock });

    expect(createAccountPrismaRepositories).toHaveBeenCalledWith({
      db: fakeDb,
      cloudAuth: fakeCloudAuth,
    });
  });

  it('passes the repository set into the module with the api lane capability and runtime contributions', () => {
    composeAccount({
      db: fakeDb,
      cloudAuth: fakeCloudAuth,
      clock: fakeClock,
      runtimeContributions: hostRuntime,
    });

    const repoSet = createAccountPrismaRepositories.mock.results[0].value;
    expect(createAccountRuntimeContributions).toHaveBeenCalledWith(
      repoSet.accountRepository,
      hostRuntime,
    );

    const moduleCall = createAccountModule.mock.calls[0][0];
    expect(moduleCall).toMatchObject({
      accountRepository: repoSet.accountRepository,
      closureOperationRepository: repoSet.closureOperationRepository,
      revocationPort: repoSet.revocationPort,
      eventPublisher: repoSet.eventPublisher,
      laneCapability: 'api',
      auditRepository: repoSet.auditRepository,
      clock: fakeClock,
    });
    expect(moduleCall.runtimeContributions).toEqual(
      createAccountRuntimeContributions.mock.results[0].value,
    );

    const instance = createAccountModule.mock.results[0].value;
    expect(createAccountApiModule).toHaveBeenCalledWith({ instance });
  });

  it('returns a module handle with name Account plus register and destroy', () => {
    const handle = composeAccount({ db: fakeDb, cloudAuth: fakeCloudAuth, clock: fakeClock });

    expect(handle).toMatchObject({ name: 'Account' });
    expect(typeof handle.register).toBe('function');
    expect(typeof handle.destroy).toBe('function');
  });
});

/**
 * Structural registration test using real factories and a fake db.
 * 用真实工厂 + fake db 的结构注册测试。
 *
 * Real factories: the account Prisma repositories, revocation adapter, outbox
 * event publisher and audit repository only hold references at construction (no
 * queries), the runtime contributions are empty, so registering with a fake db
 * succeeds and mounts /accounts.
 *
 * 真实工厂下：账户 Prisma 仓储、revocation 适配器、outbox 事件发布器与审计仓储
 * 构造时只持有引用（无查询），运行时贡献为空，因此用 fake db 注册可成功并挂载
 * /accounts。
 */
describe('composeAccount structural registration', () => {
  let routerUse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    routerUse = vi.fn();
  });

  it('mounts /accounts on the router and starts the owned instance', () => {
    const handle = composeAccount({ db: fakeDb, cloudAuth: fakeCloudAuth, clock: fakeClock });

    const instance = createAccountModule.mock.results[0].value;
    const startSpy = vi.spyOn(instance, 'start');
    const disposeSpy = vi.spyOn(instance, 'dispose');

    const context: AccountApiModuleContext = {
      app: {} as Express,
      router: { use: routerUse, stack: [] } as unknown as Router,
      middleware: {
        auth: vi.fn(),
        requireRole: vi.fn(() => vi.fn()),
      },
      openApiRegistry: undefined,
    };

    expect(() => handle.register(context)).not.toThrow();
    expect(routerUse).toHaveBeenCalledWith('/accounts', expect.anything());

    expect(startSpy).toHaveBeenCalledTimes(1);

    handle.destroy?.();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});
