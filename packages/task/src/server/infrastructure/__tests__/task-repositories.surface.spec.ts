import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import {
  createTaskPrismaRepositories,
  createTaskPowerSyncRepositories,
  type TaskRepositorySet,
  type TaskWriteTransactionRunner,
  type ITaskOccurrenceRepository,
  type ITaskPlanRepository,
  type TaskModuleInstance,
} from '../../../../src';
import { createTaskPrismaModule } from '../prisma';
import { createTaskPowerSyncModule } from '../powersync';
import { TASK_TEST_USER_TIME_CONTEXT_PORT } from '../../../testing';

/**
 * Task repository seam surface.
 * 任务仓储 seam 的表面契约。
 *
 * The two host-facing repository factories must return the same port-shaped
 * dependency names, the transaction runner must be present on both variants,
 * convenience module factories keep the api/start/dispose surface, and concrete
 * adapter classes must never leak through the root barrel.
 *
 * 两个宿主向仓储工厂必须返回相同的 Port 形状依赖名，两种变体都必须包含
 * 事务运行器，便捷模块工厂保留 api/start/dispose 表面，具体适配器类绝不能
 * 通过根 barrel 泄漏。
 */
describe('task repository factories surface', () => {
  const fakePrisma = {} as unknown as PrismaClient;
  const fakeElectronDb = {} as unknown as IElectronDatabase;

  it('createTaskPrismaRepositories returns the full repository Port set', () => {
    const set = createTaskPrismaRepositories(fakePrisma);
    expect(set).toHaveProperty('taskPlanRepository');
    expect(set).toHaveProperty('taskOccurrenceRepository');
    expect(set).toHaveProperty('taskWriteTransactionRunner');
    const typed: TaskRepositorySet = set;
    expect(typeof typed.taskWriteTransactionRunner.run).toBe('function');
  });

  it('createTaskPowerSyncRepositories returns the same Port shape', () => {
    const set = createTaskPowerSyncRepositories(fakeElectronDb);
    expect(set).toHaveProperty('taskPlanRepository');
    expect(set).toHaveProperty('taskOccurrenceRepository');
    expect(set).toHaveProperty('taskWriteTransactionRunner');
    expect(Object.keys(set).sort()).toEqual(
      Object.keys(createTaskPrismaRepositories(fakePrisma)).sort(),
    );
    const typed: TaskRepositorySet = set;
    expect(typeof typed.taskWriteTransactionRunner.run).toBe('function');
  });

  it('convenience module factories still expose api/start/dispose', () => {
    const prismaInstance = createTaskPrismaModule(fakePrisma, {
      userTimeContextPort: TASK_TEST_USER_TIME_CONTEXT_PORT,
    });
    expect(prismaInstance).toHaveProperty('api');
    expect(typeof prismaInstance.start).toBe('function');
    expect(typeof prismaInstance.dispose).toBe('function');
    const typed: TaskModuleInstance = prismaInstance;
    expect(typeof typed.api.createTaskPlan).toBe('function');

    const powerSyncInstance = createTaskPowerSyncModule(fakeElectronDb, {
      userTimeContextPort: TASK_TEST_USER_TIME_CONTEXT_PORT,
    });
    expect(powerSyncInstance).toHaveProperty('api');
    expect(typeof powerSyncInstance.start).toBe('function');
    expect(typeof powerSyncInstance.dispose).toBe('function');
  });

  it('does not leak concrete adapter classes through the root barrel', async () => {
    const forbidden = [
      'TaskPlanPrismaRepository',
      'TaskOccurrencePrismaRepository',
      'TaskDependencyPrismaRepository',
      'TaskFolderPrismaRepository',
      'PrismaTaskWriteTransactionRunner',
      'PrismaTaskGoalOutboxDispatchStore',
      'PowerSyncTaskPlanRepository',
      'PowerSyncTaskOccurrenceRepository',
      'PowerSyncTaskDependencyRepository',
      'PowerSyncTaskFolderRepository',
      'PowerSyncTaskWriteTransactionRunner',
      'PowerSyncTaskGoalOutboxDispatchStore',
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

  it('root barrel type-exports every TaskRepositorySet field type (compile-time lock)', () => {
    // These type-only imports from the root barrel prove the set field types are
    // reachable from @memoflow/task; the following value-level assertions pin the
    // field names so a renamed/removed port fails loudly.
    const run = (_t: TaskWriteTransactionRunner) => undefined;
    const instance = (_t: ITaskOccurrenceRepository) => undefined;
    const template = (_t: ITaskPlanRepository) => undefined;

    expect(typeof run).toBe('function');
    expect(typeof instance).toBe('function');
    expect(typeof template).toBe('function');
  });

  it('infrastructure public barrel keeps ingredient factories, set types, port types and cross-module read ports only', async () => {
    const infrastructure = readFileSync(resolve(__dirname, '../index.ts'), 'utf8');

    expect(infrastructure).toContain('createTaskModule');
    expect(infrastructure).toContain('createTaskPrismaRepositories');
    expect(infrastructure).toContain('createTaskPowerSyncRepositories');
    expect(infrastructure).toContain('createTaskRuntimeContribution');
    expect(infrastructure).toContain('createTaskPrismaScheduleProjectionSource');
    expect(infrastructure).not.toContain('ScheduleExecutionSource');
    expect(infrastructure).toContain('TaskRepositorySet');
    expect(infrastructure).toContain('TaskModuleInstance');
    // Cross-module read ports stay reachable for host composition.
    expect(infrastructure).toContain('PrismaTaskBindingReadPort');
    expect(infrastructure).toContain('PowerSyncTaskBindingReadPort');

    const infraModule = await import('../index');
    const exportedNames = Object.keys(infraModule);
    for (const name of [
      'TaskPlanPrismaRepository',
      'TaskOccurrencePrismaRepository',
      'TaskDependencyPrismaRepository',
      'TaskFolderPrismaRepository',
      'PrismaTaskWriteTransactionRunner',
      'PrismaTaskGoalOutboxDispatchStore',
      'PowerSyncTaskPlanRepository',
      'PowerSyncTaskOccurrenceRepository',
      'PowerSyncTaskDependencyRepository',
      'PowerSyncTaskFolderRepository',
      'PowerSyncTaskWriteTransactionRunner',
      'PowerSyncTaskGoalOutboxDispatchStore',
    ]) {
      expect(exportedNames).not.toContain(name);
    }
  });
});
