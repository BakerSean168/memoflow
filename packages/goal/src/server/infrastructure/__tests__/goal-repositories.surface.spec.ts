import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { GoalDependencyReadPort } from '@memoflow/contracts/reliable-messaging';
import { createTimeContext } from '@memoflow/time';
import {
  createGoalPrismaRepositories,
  createGoalPowerSyncRepositories,
  createGoalEventListenersRuntime,
  type GoalRepositorySet,
  type GoalWriteTransactionRunner,
  type IGoalRecordRepository,
  type IGoalRepository,
  type IHabitRepository,
  type IWalletRepository,
  type GoalModuleInstance,
} from '../../../../src';
import { createGoalPrismaModule } from '../prisma';
import { createGoalPowerSyncModule } from '../powersync';

/**
 * Goal repository seam surface.
 * 目标仓储 seam 的表面契约。
 *
 * The two host-facing repository factories must return the same port-shaped
 * dependency names, the transaction runner must be present on both variants,
 * `habitRepository` stays optional (Prisma only), convenience module factories
 * keep the api/start/dispose surface, and concrete adapter classes must never
 * leak through the root barrel.
 *
 * 两个宿主向仓储工厂必须返回相同的 Port 形状依赖名，两种变体都必须包含
 * 事务运行器，`habitRepository` 保持可选（仅 Prisma 提供），便捷模块工厂
 * 保留 api/start/dispose 表面，具体适配器类绝不能通过根 barrel 泄漏。
 */
describe('goal repository factories surface', () => {
  const fakePrisma = {} as unknown as PrismaClient;
  const fakeElectronDb = {} as unknown as IElectronDatabase;

  it('createGoalPrismaRepositories returns the full repository Port set', () => {
    const set = createGoalPrismaRepositories(fakePrisma);
    expect(set).toHaveProperty('goalRepository');
    expect(set).toHaveProperty('goalRecordRepository');
    expect(set).toHaveProperty('goalWriteTransactionRunner');
    expect(set).toHaveProperty('habitRepository');
    expect(set).not.toHaveProperty('relationRepository');
    expect(set).toHaveProperty('walletRepository');
    const typed: GoalRepositorySet = set;
    expect(typeof typed.goalWriteTransactionRunner.run).toBe('function');
    expect(typeof typed.habitRepository?.findByIdentityId).toBe('function');
    expect(typeof typed.walletRepository?.listAccounts).toBe('function');
  });

  it('createGoalPowerSyncRepositories returns the same Port shape without Prisma-only repositories', () => {
    const set = createGoalPowerSyncRepositories(fakeElectronDb);
    const requiredNames = ['goalRepository', 'goalRecordRepository', 'goalWriteTransactionRunner'];
    for (const name of requiredNames) {
      expect(set).toHaveProperty(name);
    }
    expect(set).not.toHaveProperty('habitRepository');
    expect(set).not.toHaveProperty('relationRepository');
    expect(set).not.toHaveProperty('walletRepository');
    const typed: GoalRepositorySet = set;
    expect(typeof typed.goalWriteTransactionRunner.run).toBe('function');
  });

  it('Prisma and PowerSync sets agree on all non-optional Port field names', () => {
    const prismaKeys = Object.keys(createGoalPrismaRepositories(fakePrisma)).filter(
      (key) => !['habitRepository', 'walletRepository'].includes(key),
    );
    const powerSyncKeys = Object.keys(createGoalPowerSyncRepositories(fakeElectronDb));
    expect(prismaKeys.sort()).toEqual(powerSyncKeys.sort());
  });

  it('convenience module factories still expose api/start/dispose', () => {
    const fakeReadPort = {} as unknown as GoalDependencyReadPort;

    const prismaInstance = createGoalPrismaModule(fakePrisma, {
      taskBindingReadPort: fakeReadPort,
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      relationCleanupFactory: () => ({ unlinkAllForGoal: async () => 0 }),
    });
    expect(prismaInstance).toHaveProperty('api');
    expect(typeof prismaInstance.start).toBe('function');
    expect(typeof prismaInstance.dispose).toBe('function');
    const typed: GoalModuleInstance = prismaInstance;
    expect(typeof typed.api.createGoal).toBe('function');

    const powerSyncInstance = createGoalPowerSyncModule(fakeElectronDb, {
      taskBindingReadPort: fakeReadPort,
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      relationCleanupFactory: () => ({ unlinkAllForGoal: async () => 0 }),
    });
    expect(powerSyncInstance).toHaveProperty('api');
    expect(typeof powerSyncInstance.start).toBe('function');
    expect(typeof powerSyncInstance.dispose).toBe('function');
  });

  it('createGoalEventListenersRuntime returns a reversible runtime contribution', () => {
    const runtime = createGoalEventListenersRuntime({
      goalRepository: createGoalPrismaRepositories(fakePrisma).goalRepository,
      goalRecordRepository: createGoalPrismaRepositories(fakePrisma).goalRecordRepository,
      goalWriteTransactionRunner:
        createGoalPrismaRepositories(fakePrisma).goalWriteTransactionRunner,
    });
    expect(typeof runtime.start).toBe('function');
    expect(typeof runtime.stop).toBe('function');
    expect(() => runtime.start()).not.toThrow();
    expect(() => runtime.stop()).not.toThrow();
  });

  it('does not leak concrete adapter classes through the root barrel', async () => {
    const forbidden = [
      'GoalPrismaRepository',
      'GoalFolderPrismaRepository',
      'FocusModePrismaRepository',
      'FocusSessionPrismaRepository',
      'PrismaWeightSnapshotRepository',
      'GoalRecordPrismaRepository',
      'PrismaGoalWriteTransactionRunner',
      'PrismaHabitRepository',
      'RelationPrismaRepository',
      'WalletPrismaRepository',
      'PrismaRelationMapper',
      'PrismaWalletMapper',
      'GoalPowerSyncRepository',
      'GoalFolderPowerSyncRepository',
      'GoalRecordPowerSyncRepository',
      'FocusModePowerSyncRepository',
      'PowerSyncGoalWriteTransactionRunner',
      'PowerSyncGoalReliableOperationAdapter',
    ];

    const root = readFileSync(resolve(__dirname, '../../../index.ts'), 'utf8');
    const infrastructure = readFileSync(resolve(__dirname, '../index.ts'), 'utf8');
    for (const name of forbidden) {
      expect(root).not.toMatch(new RegExp(`\\b${name}\\b`));
      expect(infrastructure).not.toMatch(new RegExp(`\\b${name}\\b`));
    }

    const rootModule = await import('../../../../src');
    const exportedNames = Object.keys(rootModule).sort();
    for (const name of forbidden) {
      expect(exportedNames).not.toContain(name);
    }
  });

  it('root barrel type-exports every GoalRepositorySet field type (compile-time lock)', () => {
    // These type-only imports from the root barrel prove the set field types are
    // reachable from @memoflow/goal; the following value-level assertions pin the
    // field names so a renamed/removed port fails loudly.
    const run = (_t: GoalWriteTransactionRunner) => undefined;
    const habit = (_t: IHabitRepository) => undefined;
    const goal = (_t: IGoalRepository) => undefined;
    const record = (_t: IGoalRecordRepository) => undefined;
    const wallet = (_t: IWalletRepository) => undefined;

    expect(typeof run).toBe('function');
    expect(typeof habit).toBe('function');
    expect(typeof goal).toBe('function');
    expect(typeof record).toBe('function');
    expect(typeof wallet).toBe('function');
  });

  it('infrastructure public barrel keeps ingredient factories, set types and port types only', async () => {
    const infrastructure = readFileSync(resolve(__dirname, '../index.ts'), 'utf8');

    expect(infrastructure).toContain('createGoalModule');
    expect(infrastructure).toContain('createGoalPrismaRepositories');
    expect(infrastructure).toContain('createGoalPowerSyncRepositories');
    expect(infrastructure).toContain('createGoalEventListenersRuntime');
    expect(infrastructure).toContain('createGoalPrismaScheduleProjectionSource');
    expect(infrastructure).not.toContain('ScheduleExecutionSource');
    expect(infrastructure).toContain('GoalRepositorySet');
    expect(infrastructure).toContain('GoalModuleInstance');

    const infraModule = await import('../index');
    const exportedNames = Object.keys(infraModule);
    for (const name of [
      'GoalPrismaRepository',
      'GoalFolderPrismaRepository',
      'FocusModePrismaRepository',
      'GoalRecordPrismaRepository',
      'PrismaGoalWriteTransactionRunner',
      'RelationPrismaRepository',
      'WalletPrismaRepository',
      'PrismaRelationMapper',
      'PrismaWalletMapper',
      'GoalPowerSyncRepository',
      'PowerSyncGoalWriteTransactionRunner',
    ]) {
      expect(exportedNames).not.toContain(name);
    }
  });
});
const TEST_USER_TIME_CONTEXT_PORT = {
  getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
};
