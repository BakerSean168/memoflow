/**
 * createGoalModule partial-start cleanup spec.
 * createGoalModule 部分启动回滚测试。
 *
 * Verifies that when the Nth runtime contribution fails to start, the module
 * stops the already-started contributions in REVERSE order (best-effort,
 * logged), rethrows the ORIGINAL error, and leaves the module unstarted so a
 * later dispose() is a no-op — start() owns its partial-start cleanup.
 *
 * 验证：当第 N 个运行时贡献启动失败时，模块按逆序停止已成功启动的贡献
 * （best-effort、记录日志）、重新抛出原始错误，并保持模块未启动状态，
 * 使后续 dispose() 为 no-op——start() 自行负责部分启动清理。
 */

import { describe, expect, it, vi } from 'vitest';
import type { GoalDependencyReadPort } from '@memoflow/contracts/reliable-messaging';
import { createTimeContext } from '@memoflow/time';
import type { GoalWriteTransactionRunner } from '../../application/use-cases/commands/goal-write-support';
import type { GoalDeletionTransactionRunner } from '../../application/use-cases/commands/goal-deletion-support';
import type { IGoalRecordRepository, IGoalRepository } from '../../domain';
import {
  createGoalModule,
  type GoalModuleDependencies,
  type GoalModuleRuntimeContribution,
} from '../goal.module';

interface FakeContribution {
  readonly name: string;
  readonly start: ReturnType<typeof vi.fn>;
  readonly stop: ReturnType<typeof vi.fn>;
  readonly contribution: GoalModuleRuntimeContribution;
}

function makeContribution(name: string, failOnStart = false): FakeContribution {
  const start = vi.fn(() => {
    if (failOnStart) {
      throw new Error(`${name} start failed`);
    }
  });
  const stop = vi.fn();
  return { name, start, stop, contribution: { start, stop } };
}

function makeDeps(runtimeContributions: GoalModuleRuntimeContribution[]): GoalModuleDependencies {
  const goalRepository = {} as unknown as IGoalRepository;
  const goalDeletionTransactionRunner: GoalDeletionTransactionRunner = {
    run: (work) =>
      work({
        goalRepository,
        relationCleanup: { unlinkAllForGoal: async () => 0 },
      }),
  };

  return {
    goalRepository,
    goalRecordRepository: {} as unknown as IGoalRecordRepository,
    goalWriteTransactionRunner: {} as unknown as GoalWriteTransactionRunner,
    goalDeletionTransactionRunner,
    taskBindingReadPort: {} as unknown as GoalDependencyReadPort,
    userTimeContextPort: {
      getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
    },
    runtimeContributions,
  };
}

describe('createGoalModule partial-start cleanup', () => {
  it('stops already-started contributions in reverse order and rethrows the original error', () => {
    const a = makeContribution('a');
    const b = makeContribution('b');
    const c = makeContribution('c', true);

    const instance = createGoalModule(makeDeps([a.contribution, b.contribution, c.contribution]));

    expect(() => instance.start()).toThrow('c start failed');

    expect(a.start).toHaveBeenCalledTimes(1);
    expect(b.start).toHaveBeenCalledTimes(1);
    expect(c.start).toHaveBeenCalledTimes(1);

    expect(a.stop).toHaveBeenCalledTimes(1);
    expect(b.stop).toHaveBeenCalledTimes(1);
    expect(c.stop).not.toHaveBeenCalled();

    expect(b.stop.mock.invocationCallOrder[0]).toBeLessThan(a.stop.mock.invocationCallOrder[0]);
  });

  it('leaves the module unstarted after a failed start: dispose is a no-op', () => {
    const a = makeContribution('a');
    const b = makeContribution('b', true);

    const instance = createGoalModule(makeDeps([a.contribution, b.contribution]));

    expect(() => instance.start()).toThrow('b start failed');
    expect(a.stop).toHaveBeenCalledTimes(1);

    instance.dispose();
    expect(a.stop).toHaveBeenCalledTimes(1);
    expect(b.stop).not.toHaveBeenCalled();
  });

  it('keeps the ORIGINAL error even when a rollback stop throws', () => {
    const a = makeContribution('a');
    a.stop.mockImplementation(() => {
      throw new Error('a stop failed');
    });
    const b = makeContribution('b', true);

    const instance = createGoalModule(makeDeps([a.contribution, b.contribution]));

    expect(() => instance.start()).toThrow('b start failed');
    expect(a.stop).toHaveBeenCalledTimes(1);
  });

  it('stops all contributions in reverse order on dispose after a successful start', () => {
    const a = makeContribution('a');
    const b = makeContribution('b');

    const instance = createGoalModule(makeDeps([a.contribution, b.contribution]));

    instance.start();
    expect(a.start).toHaveBeenCalledTimes(1);
    expect(b.start).toHaveBeenCalledTimes(1);

    instance.dispose();
    expect(b.stop.mock.invocationCallOrder[0]).toBeLessThan(a.stop.mock.invocationCallOrder[0]);
  });
});
