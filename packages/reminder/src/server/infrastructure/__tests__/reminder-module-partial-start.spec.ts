/**
 * createReminderModule partial-start cleanup spec.
 * createReminderModule 部分启动回滚测试。
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
import { createTimeContext } from '@memoflow/time';
import type { IReminderTemplateRepository } from '../../domain/repositories/i-reminder-template-repository';
import type { IReminderGroupRepository } from '../../domain/repositories/i-reminder-group-repository';
import type { IReminderResponseRepository } from '../../domain/repositories/i-reminder-response-repository';
import type { IUserReminderPreferenceRepository } from '../../domain/repositories/i-user-reminder-preference-repository';
import type { RoutineProfileStore } from '../../domain/ports/routine-profile-store.port';
import {
  createReminderModule,
  type ReminderModuleDependencies,
  type ReminderModuleRuntimeContribution,
} from '../reminder.module';

interface FakeContribution {
  readonly name: string;
  readonly start: ReturnType<typeof vi.fn>;
  readonly stop: ReturnType<typeof vi.fn>;
  readonly contribution: ReminderModuleRuntimeContribution;
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

function makeRoutineProfileStore(): RoutineProfileStore {
  return {
    upsertDefinition: async () => {},
    findDefinition: async () => null,
    deleteDefinition: async () => {},
    upsertProfile: async () => {},
    findProfile: async () => null,
    listProfiles: async () => [],
    deleteProfile: async () => {},
    upsertMembership: async () => {},
    listMembershipsForRoutine: async () => [],
    listMembershipsForProfile: async () => [],
    deleteMembership: async () => {},
    replaceRoutineMemberships: async () => {},
  };
}

function makeDeps(
  runtimeContributions: ReminderModuleRuntimeContribution[],
): ReminderModuleDependencies {
  return {
    reminderTemplateRepository: {} as unknown as IReminderTemplateRepository,
    reminderGroupRepository: {} as unknown as IReminderGroupRepository,
    reminderResponseRepository: {} as unknown as IReminderResponseRepository,
    userReminderPreferenceRepository: {} as unknown as IUserReminderPreferenceRepository,
    routineProfileStore: makeRoutineProfileStore(),
    closureChecker: async (): Promise<boolean> => false,
    userTimeContextPort: {
      getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
    },
    runtimeContributions,
  };
}

describe('createReminderModule partial-start cleanup', () => {
  it('fails closed when the canonical RoutineProfileStore is missing', () => {
    const dependencies = {
      ...makeDeps([]),
      routineProfileStore: undefined,
    } as unknown as ReminderModuleDependencies;

    expect(() => createReminderModule(dependencies)).toThrow(
      '[FAIL-CLOSED] ReminderModule requires routineProfileStore dependency',
    );
  });

  it('awaits already-started contributions in reverse order and rethrows the original error', async () => {
    const a = makeContribution('a');
    const b = makeContribution('b');
    const c = makeContribution('c', true);

    const instance = createReminderModule(
      makeDeps([a.contribution, b.contribution, c.contribution]),
    );

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

    const instance = createReminderModule(makeDeps([a.contribution, b.contribution]));

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

    const instance = createReminderModule(makeDeps([a.contribution, b.contribution]));

    await expect(instance.start()).rejects.toThrow('b start failed');
    expect(a.stop).toHaveBeenCalledTimes(1);
  });

  it('awaits all contributions in reverse order on dispose after a successful start', async () => {
    const a = makeContribution('a');
    const b = makeContribution('b');

    const instance = createReminderModule(makeDeps([a.contribution, b.contribution]));

    await instance.start();
    expect(a.start).toHaveBeenCalledTimes(1);
    expect(b.start).toHaveBeenCalledTimes(1);

    await instance.dispose();
    expect(b.stop.mock.invocationCallOrder[0]).toBeLessThan(a.stop.mock.invocationCallOrder[0]);
  });
});
