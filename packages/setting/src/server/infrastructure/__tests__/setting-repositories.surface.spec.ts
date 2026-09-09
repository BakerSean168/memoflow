import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import {
  createSettingPrismaRepositories,
  createSettingPowerSyncRepositories,
  createSettingPrismaModule,
  createSettingPowerSyncModule,
  createSettingRuntimeContribution,
  type SettingPrismaRepositorySet,
  type SettingPowerSyncRepositorySet,
  type SettingModuleInstance,
  type IUserSettingRepository,
  type IUserPreferenceRepository,
} from '../../../../src';

/**
 * Setting repository seam surface.
 * 设置仓储 seam 的表面契约。
 *
 * Both lane factories return the single `userSettingRepository` port;
 * convenience module factories keep the api/start/dispose surface; the runtime
 * contribution factory returns a reversible contribution; and no concrete
 * adapter class leaks through the root barrel.
 *
 * 两个 lane 工厂都返回单一的 `userSettingRepository` Port；便捷模块工厂保留
 * api/start/dispose 表面；运行时贡献工厂返回可逆贡献；具体适配器类绝不通过
 * 根 barrel 泄漏。
 */
describe('setting repository factories surface', () => {
  const fakePrisma = {} as unknown as PrismaClient;
  const fakeElectronDb = {
    getOptional: async () => null,
    getAll: async () => [],
    get: async () => {
      throw new Error('not found');
    },
    execute: async () => ({ rowsAffected: 0 }),
  };

  it('createSettingPrismaRepositories returns legacy + canonical Prisma repositories', () => {
    const set = createSettingPrismaRepositories(fakePrisma);
    expect(set).toHaveProperty('userSettingRepository');
    expect(set).toHaveProperty('userPreferenceRepository');
    const typed: SettingPrismaRepositorySet = set;
    expect(typeof typed.userSettingRepository.findByIdentityId).toBe('function');
    expect(typeof typed.userPreferenceRepository.compareAndSwap).toBe('function');
  });

  it('createSettingPowerSyncRepositories returns legacy + canonical PowerSync repositories', () => {
    const set = createSettingPowerSyncRepositories(fakeElectronDb);
    expect(set).toHaveProperty('userSettingRepository');
    expect(set).toHaveProperty('userPreferenceRepository');
    const typed: SettingPowerSyncRepositorySet = set;
    expect(typeof typed.userSettingRepository.findByIdentityId).toBe('function');
    expect(typeof typed.userPreferenceRepository.compareAndSwap).toBe('function');
  });

  it('Prisma and PowerSync sets agree on all field names', () => {
    expect(Object.keys(createSettingPrismaRepositories(fakePrisma))).toEqual(
      Object.keys(createSettingPowerSyncRepositories(fakeElectronDb)),
    );
  });

  it('convenience module factories preserve api/start/dispose', () => {
    const prismaInstance = createSettingPrismaModule(fakePrisma);
    expect(prismaInstance).toHaveProperty('api');
    expect(typeof prismaInstance.start).toBe('function');
    expect(typeof prismaInstance.dispose).toBe('function');
    const typedPrisma: SettingModuleInstance = prismaInstance;
    expect(typeof typedPrisma.api.getUserSetting).toBe('function');

    const powerSyncInstance = createSettingPowerSyncModule(fakeElectronDb);
    expect(powerSyncInstance).toHaveProperty('api');
    expect(typeof powerSyncInstance.start).toBe('function');
    expect(typeof powerSyncInstance.dispose).toBe('function');
    const typedPowerSync: SettingModuleInstance = powerSyncInstance;
    expect(typeof typedPowerSync.api.getUserSetting).toBe('function');
  });

  it('createSettingRuntimeContribution returns a reversible contribution', () => {
    const runtime = createSettingRuntimeContribution();
    expect(typeof runtime.start).toBe('function');
    expect(typeof runtime.stop).toBe('function');
    expect(() => runtime.start()).not.toThrow();
    expect(() => runtime.stop()).not.toThrow();
  });

  it('does not leak concrete adapter classes through the root barrel', async () => {
    const forbidden = [
      'UserSettingPrismaRepository',
      'UserSettingPowerSyncRepository',
      'UserPreferencePrismaRepository',
      'UserPreferencePowerSyncRepository',
    ];

    const root = readFileSync(resolve(__dirname, '../../../index.ts'), 'utf8');
    for (const name of forbidden) {
      expect(root).not.toMatch(new RegExp(`\\b${name}\\b`));
    }

    const infra = readFileSync(resolve(__dirname, '../index.ts'), 'utf8');
    for (const name of forbidden) {
      expect(infra).not.toMatch(new RegExp(`\\b${name}\\b`));
    }

    const rootModule = await import('../../../../src');
    const exportedNames = Object.keys(rootModule).sort();
    for (const name of forbidden) {
      expect(exportedNames).not.toContain(name);
    }
  });

  it('root barrel type-exports the set field type (compile-time lock)', () => {
    const legacyRepo = (_t: IUserSettingRepository) => undefined;
    const canonicalRepo = (_t: IUserPreferenceRepository) => undefined;
    expect(typeof legacyRepo).toBe('function');
    expect(typeof canonicalRepo).toBe('function');
  });
});
