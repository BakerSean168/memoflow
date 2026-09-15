import { describe, expect, it, vi } from 'vitest';
import type { IUserPreferenceRepository } from '../../preferences';
import {
  createSettingModule,
  type SettingModuleDependencies,
  type SettingModuleRuntimeContribution,
} from '../setting.module';

function fakePreferenceRepository(): IUserPreferenceRepository {
  return {
    find: vi.fn(async () => null),
    list: vi.fn(async () => []),
    create: vi.fn(async (document) => ({ kind: 'created' as const, document })),
    compareAndSwap: vi.fn(async (document) => ({ kind: 'updated' as const, document })),
  };
}

function contribution(name: string, fail = false) {
  const start = vi.fn(() => {
    if (fail) throw new Error(`${name} start failed`);
  });
  const stop = vi.fn();
  return { start, stop, contribution: { start, stop } satisfies SettingModuleRuntimeContribution };
}

function deps(runtimeContributions: SettingModuleRuntimeContribution[]): SettingModuleDependencies {
  return { userPreferenceRepository: fakePreferenceRepository(), runtimeContributions };
}

describe('createSettingModule partial-start cleanup', () => {
  it('rolls back started contributions in reverse order and rethrows the original error', () => {
    const a = contribution('a');
    const b = contribution('b');
    const c = contribution('c', true);
    const instance = createSettingModule(deps([a.contribution, b.contribution, c.contribution]));

    expect(() => instance.start()).toThrow('c start failed');
    expect(a.stop).toHaveBeenCalledTimes(1);
    expect(b.stop).toHaveBeenCalledTimes(1);
    expect(c.stop).not.toHaveBeenCalled();
    expect(b.stop.mock.invocationCallOrder[0]).toBeLessThan(a.stop.mock.invocationCallOrder[0]);
  });

  it('leaves the module unstarted after a failed start so dispose is a no-op', () => {
    const a = contribution('a');
    const b = contribution('b', true);
    const instance = createSettingModule(deps([a.contribution, b.contribution]));
    expect(() => instance.start()).toThrow('b start failed');
    expect(a.stop).toHaveBeenCalledTimes(1);
    instance.dispose();
    expect(a.stop).toHaveBeenCalledTimes(1);
  });

  it('preserves the original start failure even if rollback stop fails', () => {
    const a = contribution('a');
    a.stop.mockImplementation(() => { throw new Error('a stop failed'); });
    const b = contribution('b', true);
    const instance = createSettingModule(deps([a.contribution, b.contribution]));
    expect(() => instance.start()).toThrow('b start failed');
  });

  it('stops all contributions in reverse order after a successful start', () => {
    const a = contribution('a');
    const b = contribution('b');
    const instance = createSettingModule(deps([a.contribution, b.contribution]));
    instance.start();
    instance.dispose();
    expect(b.stop.mock.invocationCallOrder[0]).toBeLessThan(a.stop.mock.invocationCallOrder[0]);
  });
});
