/**
 * createTaskModule partial-start cleanup spec.
 * createTaskModule 部分启动回滚测试。
 *
 * Verifies that when the Nth runtime contribution fails to start, the module
 * awaits the already-started contributions in REVERSE order (best-effort,
 * logged), rethrows the ORIGINAL error, and leaves the module unstarted so a
 * later dispose() is a no-op — start() owns its partial-start cleanup.
 *
 * 验证：当第 N 个运行时贡献启动失败时，模块按逆序 await 已成功启动的贡献
 * （best-effort、记录日志）、重新抛出原始错误，并保持模块未启动状态，
 * 使后续 dispose() 为 no-op——start() 自行负责部分启动清理。
 */

import { describe, expect, it, vi } from 'vitest';
import type { ITaskInstanceRepository } from '../../domain/repositories/i-task-instance-repository';
import type { ITaskTemplateRepository } from '../../domain/repositories/i-task-template-repository';
import type { TaskWriteTransactionRunner } from '../../application/use-cases/commands/task-write-support';
import {
  createTaskModule,
  type TaskModuleDependencies,
  type TaskModuleRuntimeContribution,
} from '../task.module';

interface FakeContribution {
  readonly name: string;
  readonly start: ReturnType<typeof vi.fn>;
  readonly stop: ReturnType<typeof vi.fn>;
  readonly contribution: TaskModuleRuntimeContribution;
}

function makeContribution(name: string, failOnStart = false): FakeContribution {
  const start = vi.fn(async () => {
    if (failOnStart) {
      throw new Error(`${name} start failed`);
    }
  });
  const stop = vi.fn(async () => {});
  return { name, start, stop, contribution: { start, stop } };
}

function makeDeps(runtimeContributions: TaskModuleRuntimeContribution[]): TaskModuleDependencies {
  return {
    taskTemplateRepository: {
      findNeedGenerateInstances: vi.fn(async () => []),
    } as unknown as ITaskTemplateRepository,
    taskInstanceRepository: {} as unknown as ITaskInstanceRepository,
    taskWriteTransactionRunner: {} as unknown as TaskWriteTransactionRunner,
    runtimeContributions,
  };
}

describe('createTaskModule partial-start cleanup', () => {
  it('awaits already-started contributions in reverse order and rethrows the original error', async () => {
    const a = makeContribution('a');
    const b = makeContribution('b');
    const c = makeContribution('c', true);

    const instance = createTaskModule(makeDeps([a.contribution, b.contribution, c.contribution]));

    await expect(instance.start()).rejects.toThrow('c start failed');

    expect(a.start).toHaveBeenCalledTimes(1);
    expect(b.start).toHaveBeenCalledTimes(1);
    expect(c.start).toHaveBeenCalledTimes(1);

    expect(a.stop).toHaveBeenCalledTimes(1);
    expect(b.stop).toHaveBeenCalledTimes(1);
    expect(c.stop).not.toHaveBeenCalled();

    expect(b.stop.mock.invocationCallOrder[0]).toBeLessThan(a.stop.mock.invocationCallOrder[0]);
  });

  it('leaves the module unstarted after a failed start: dispose is a no-op', async () => {
    const a = makeContribution('a');
    const b = makeContribution('b', true);

    const instance = createTaskModule(makeDeps([a.contribution, b.contribution]));

    await expect(instance.start()).rejects.toThrow('b start failed');
    expect(a.stop).toHaveBeenCalledTimes(1);

    await instance.dispose();
    expect(a.stop).toHaveBeenCalledTimes(1);
    expect(b.stop).not.toHaveBeenCalled();
  });

  it('keeps the ORIGINAL error even when a rollback stop rejects', async () => {
    const a = makeContribution('a');
    a.stop.mockRejectedValue(new Error('a stop failed'));
    const b = makeContribution('b', true);

    const instance = createTaskModule(makeDeps([a.contribution, b.contribution]));

    await expect(instance.start()).rejects.toThrow('b start failed');
    expect(a.stop).toHaveBeenCalledTimes(1);
  });

  it('awaits all contributions in reverse order on dispose after a successful start', async () => {
    const a = makeContribution('a');
    const b = makeContribution('b');

    const instance = createTaskModule(makeDeps([a.contribution, b.contribution]));

    await instance.start();
    expect(a.start).toHaveBeenCalledTimes(1);
    expect(b.start).toHaveBeenCalledTimes(1);

    await instance.dispose();
    expect(b.stop.mock.invocationCallOrder[0]).toBeLessThan(a.stop.mock.invocationCallOrder[0]);
  });
});
