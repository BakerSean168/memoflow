/**
 * Reminder API composition root spec.
 * 提醒 API 组合根测试。
 *
 * Verifies composeReminder():
 * - assembles reminder in the mandated plan §3.3 order
 *   (repository set → module instance → schedule execution/projection sources → API module)
 * - passes the host closureChecker through unchanged
 * - does not inject the retired legacy trigger cron after ROUTINE-3402 cutover
 * - builds both schedule sources from the SAME repository set as the module
 * - returns an already-bound IApiModule-compatible handle
 * - mounts /reminders and starts the owned instance when registered
 *
 * 验证 composeReminder()：
 * - 按 ROUTINE-3402 切换后的顺序装配提醒（仓储集合 → module instance →
 *   schedule execution/projection sources → API module）
 * - 原样透传宿主 closureChecker
 * - 不再接入已退役的 legacy trigger cron
 * - 从与模块相同的仓储集合构建两个 schedule sources
 * - 返回已绑定 instance 的、兼容 IApiModule 的 handle
 * - register() 挂载 /reminders 并启动所属实例
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
import type { ReminderApiModuleContext } from '@memoflow/reminder/api';

vi.mock('@memoflow/reminder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/reminder')>();
  return {
    ...actual,
    createReminderPrismaRepositories: vi.fn(actual.createReminderPrismaRepositories),
    createReminderPrismaScheduleExecutionCommitPort: vi.fn(
      actual.createReminderPrismaScheduleExecutionCommitPort,
    ),
    createReminderModule: vi.fn(actual.createReminderModule),
    createReminderScheduleExecutionSource: vi.fn(actual.createReminderScheduleExecutionSource),
    createReminderScheduleProjectionSource: vi.fn(actual.createReminderScheduleProjectionSource),
  };
});

vi.mock('@memoflow/reminder/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/reminder/api')>();
  return {
    ...actual,
    createReminderApiModule: vi.fn(actual.createReminderApiModule),
  };
});

import { composeReminder, createExecutorClosureChecker } from './compose-reminder';
import {
  createReminderModule,
  createReminderPrismaRepositories,
  createReminderPrismaScheduleExecutionCommitPort,
  createReminderScheduleExecutionSource,
  createReminderScheduleProjectionSource,
} from '@memoflow/reminder';
import { createReminderApiModule } from '@memoflow/reminder/api';

const fakeDb = {} as unknown as PrismaClient;
const notificationRequestedWriter = {
  enqueueNotificationRequested: vi.fn(),
} as never;
const closureChecker = async (_identityId: string): Promise<boolean> => false;
const userTimeContextPort = {
  getUserTimeContext: async () => ({ timeZone: 'UTC', weekStartsOn: 1 as const }),
} as const;

describe('composeReminder assembly order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assembles after ROUTINE-3402 cutover: repositories → module → schedule sources → api module', () => {
    composeReminder({
      db: fakeDb,
      notificationRequestedWriter,
      userTimeContextPort,
      closureChecker,
    });

    const reposOrder = createReminderPrismaRepositories.mock.invocationCallOrder[0];
    const moduleOrder = createReminderModule.mock.invocationCallOrder[0];
    const executionOrder = createReminderScheduleExecutionSource.mock.invocationCallOrder[0];
    const projectionOrder = createReminderScheduleProjectionSource.mock.invocationCallOrder[0];
    const apiModuleOrder = createReminderApiModule.mock.invocationCallOrder[0];

    expect(reposOrder).toBeLessThan(moduleOrder);
    expect(moduleOrder).toBeLessThan(executionOrder);
    expect(executionOrder).toBeLessThan(projectionOrder);
    expect(projectionOrder).toBeLessThan(apiModuleOrder);
  });

  it('passes the fake db and host closureChecker through unchanged', () => {
    composeReminder({
      db: fakeDb,
      notificationRequestedWriter,
      userTimeContextPort,
      closureChecker,
    });

    expect(createReminderPrismaRepositories).toHaveBeenCalledWith(fakeDb);

    const repoSet = createReminderPrismaRepositories.mock.results[0].value;
    const moduleCall = createReminderModule.mock.calls[0][0];
    expect(moduleCall).toMatchObject({
      reminderTemplateRepository: repoSet.reminderTemplateRepository,
      reminderGroupRepository: repoSet.reminderGroupRepository,
      reminderResponseRepository: repoSet.reminderResponseRepository,
      userReminderPreferenceRepository: repoSet.userReminderPreferenceRepository,
      closureChecker,
      reliablePort: repoSet.reliablePort,
      snoozeOverrideWriter: repoSet.snoozeOverrideWriter,
      auditRepository: repoSet.auditRepository,
    });
    expect(moduleCall.runtimeContributions).toEqual([]);

    const instance = createReminderModule.mock.results[0].value;
    expect(createReminderApiModule).toHaveBeenCalledWith({ instance });
  });

  it('does not inject a legacy timing runtime and preserves explicit host contributions', () => {
    const hostContribution = { start: vi.fn(), stop: vi.fn() };
    composeReminder({
      db: fakeDb,
      notificationRequestedWriter,
      userTimeContextPort,
      closureChecker,
      runtimeContributions: hostContribution,
    });

    const moduleCall = createReminderModule.mock.calls[0][0];
    expect(moduleCall.runtimeContributions).toEqual([hostContribution]);
  });

  it('builds both schedule sources from the SAME repository set as the module', () => {
    composeReminder({
      db: fakeDb,
      notificationRequestedWriter,
      userTimeContextPort,
      closureChecker,
    });

    const instance = createReminderModule.mock.results[0].value;
    const templateRepository = instance.reminderTemplateRepository;

    const commitPort = createReminderPrismaScheduleExecutionCommitPort.mock.results[0].value;
    expect(createReminderPrismaScheduleExecutionCommitPort).toHaveBeenCalledWith(
      fakeDb,
      notificationRequestedWriter,
    );
    expect(createReminderScheduleExecutionSource).toHaveBeenCalledWith({
      reminderTemplateRepository: templateRepository,
      commitPort,
    });
    expect(createReminderScheduleProjectionSource).toHaveBeenCalledWith({
      reminderTemplateRepository: templateRepository,
      routineProfileStore: createReminderModule.mock.calls[0][0].routineProfileStore,
      userReminderPreferenceRepository:
        createReminderModule.mock.calls[0][0].userReminderPreferenceRepository,
    });
  });

  it('returns the module handle, application port, repository view and both schedule sources', () => {
    const composed = composeReminder({
      db: fakeDb,
      notificationRequestedWriter,
      userTimeContextPort,
      closureChecker,
    });

    expect(composed.module).toMatchObject({ name: 'Reminder' });
    expect(typeof composed.module.register).toBe('function');
    expect(typeof composed.module.destroy).toBe('function');

    const instance = createReminderModule.mock.results[0].value;
    expect(composed.applicationPort).toBe(instance.api);
    expect(composed.executorReminderPort).toBe(instance.api);
    expect(composed.repositories.reminderTemplateRepository).toBe(
      instance.reminderTemplateRepository,
    );
    expect(composed.scheduleExecutionSource).toBe(
      createReminderScheduleExecutionSource.mock.results[0].value,
    );
    expect(composed.scheduleProjectionSource).toBe(
      createReminderScheduleProjectionSource.mock.results[0].value,
    );
  });

  it('injects the host closure checker into the reminder module (host-owned, not queried by the AI executor)', () => {
    const hostClosureChecker = async (_identityId: string): Promise<boolean> => true;
    composeReminder({
      db: fakeDb,
      notificationRequestedWriter,
      userTimeContextPort,
      closureChecker: hostClosureChecker,
    });

    const moduleCall = createReminderModule.mock.calls[0][0];
    expect(moduleCall.closureChecker).toBe(hostClosureChecker);
  });

  it('exposes an executor reminder port with the frozen closure checker when provided', () => {
    const executorClosureChecker = async (_identityId: string): Promise<boolean> => false;
    const composed = composeReminder({
      db: fakeDb,
      notificationRequestedWriter,
      userTimeContextPort,
      closureChecker,
      executorClosureChecker,
    });

    const instance = createReminderModule.mock.results[0].value;
    // The module api keeps the module checker; the executor port swaps only
    // createTemplate to the executor use case carrying the frozen predicate.
    expect(composed.applicationPort).toBe(instance.api);
    expect(composed.executorReminderPort).not.toBe(instance.api);
    expect(composed.executorReminderPort.createTemplate).not.toBe(instance.api.createTemplate);
    expect(composed.executorReminderPort.listTemplates).toBe(instance.api.listTemplates);
  });
});

describe('createExecutorClosureChecker — merge-base frozen closure predicate', () => {
  const cases: Array<{
    name: string;
    account: { status: string } | null;
    opPhase: string | null;
    expectedBlocked: boolean;
  }> = [
    { name: 'missing account blocks', account: null, opPhase: null, expectedBlocked: true },
    {
      name: 'Closed account blocks (canonical lifecycle)',
      account: { status: 'Closed' },
      opPhase: null,
      expectedBlocked: true,
    },
    {
      name: 'Closed account blocks (no closure op)',
      account: { status: 'Closed' },
      opPhase: null,
      expectedBlocked: true,
    },
    {
      name: 'active account without closure op allows',
      account: { status: 'Active' },
      opPhase: null,
      expectedBlocked: false,
    },
    {
      name: 'active account with requested closure op blocks',
      account: { status: 'Active' },
      opPhase: 'requested',
      expectedBlocked: true,
    },
    {
      name: 'active account with revoking closure op blocks',
      account: { status: 'Active' },
      opPhase: 'revoking',
      expectedBlocked: true,
    },
    {
      name: 'active account with closing closure op blocks',
      account: { status: 'Active' },
      opPhase: 'closing',
      expectedBlocked: true,
    },
    {
      name: 'active account with revoked closure op allows (revoked NOT in merge-base phase set)',
      account: { status: 'Active' },
      opPhase: 'revoked',
      expectedBlocked: false,
    },
    {
      name: 'active account with closed closure op allows (closed NOT in merge-base phase set)',
      account: { status: 'Active' },
      opPhase: 'closed',
      expectedBlocked: false,
    },
  ];

  it.each(cases)('$name', async ({ account, opPhase, expectedBlocked }) => {
    const findUnique = vi.fn().mockResolvedValue(account);
    const findFirst = vi
      .fn()
      .mockResolvedValue(
        opPhase !== null && ['requested', 'revoking', 'closing'].includes(opPhase)
          ? { id: 'op-1', phase: opPhase }
          : null,
      );
    const db = {
      account: { findUnique },
      accountClosureOperation: { findFirst },
    } as unknown as PrismaClient;

    const checker = createExecutorClosureChecker(db);
    const isBlocked = await checker('identity-closure');

    expect(isBlocked).toBe(expectedBlocked);

    if (!account || account.status !== 'Active') {
      // Account status alone decides — the closure table is never queried.
      expect(findFirst).not.toHaveBeenCalled();
    } else {
      expect(findFirst).toHaveBeenCalledWith({
        where: {
          identityId: 'identity-closure',
          phase: { in: ['requested', 'revoking', 'closing'] },
        },
      });
    }
  });
});

/**
 * Structural registration test using real factories and a fake db.
 * 用真实工厂 + fake db 的结构注册测试。
 *
 * Real factories: the reminder Prisma module only holds the db reference at
 * construction (no queries) and its runtime contributions (cron) start lazily,
 * so registering with a fake db succeeds and mounts /reminders.
 *
 * 真实工厂下：提醒 Prisma module 构造时只持有 db 引用（无查询），其运行时贡献
 * （cron）惰性启动，因此用 fake db 注册可成功并挂载 /reminders。
 */
describe('composeReminder structural registration', () => {
  let routerUse: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    routerUse = vi.fn();
  });

  it('mounts /reminders on the router and starts the owned instance', async () => {
    const composed = composeReminder({
      db: fakeDb,
      notificationRequestedWriter,
      userTimeContextPort,
      closureChecker,
    });

    const instance = createReminderModule.mock.results[0].value;
    const startSpy = vi.spyOn(instance, 'start');
    const disposeSpy = vi.spyOn(instance, 'dispose');

    const context: ReminderApiModuleContext = {
      app: {} as Express,
      router: { use: routerUse, stack: [] } as unknown as Router,
      middleware: {
        auth: vi.fn(),
        requireRole: vi.fn(() => vi.fn()),
      },
      openApiRegistry: undefined,
    };

    await expect(composed.module.register(context)).resolves.toBeUndefined();
    expect(routerUse).toHaveBeenCalledWith('/reminders', expect.anything());

    expect(startSpy).toHaveBeenCalledTimes(1);

    await composed.module.destroy?.();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});
