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
  type IUserPreferenceRepository,
} from '../../../../src';

describe('canonical setting repository factories', () => {
  const fakePrisma = {} as unknown as PrismaClient;
  const fakeElectronDb = {
    getOptional: async () => null,
    getAll: async () => [],
    get: async () => { throw new Error('not found'); },
    execute: async () => ({ rowsAffected: 0 }),
  };

  it('Prisma and PowerSync expose only userPreferenceRepository', () => {
    const prisma = createSettingPrismaRepositories(fakePrisma);
    const powersync = createSettingPowerSyncRepositories(fakeElectronDb);
    const typedPrisma: SettingPrismaRepositorySet = prisma;
    const typedPowerSync: SettingPowerSyncRepositorySet = powersync;

    expect(Object.keys(prisma)).toEqual(['userPreferenceRepository']);
    expect(Object.keys(powersync)).toEqual(['userPreferenceRepository']);
    expect(typeof typedPrisma.userPreferenceRepository.compareAndSwap).toBe('function');
    expect(typeof typedPowerSync.userPreferenceRepository.compareAndSwap).toBe('function');
  });

  it('module factories expose canonical API, time and portability seams only', () => {
    for (const instance of [
      createSettingPrismaModule(fakePrisma),
      createSettingPowerSyncModule(fakeElectronDb),
    ]) {
      const typed: SettingModuleInstance = instance;
      expect(typeof typed.api.getPreferenceProfile).toBe('function');
      expect(typeof typed.api.getPreferenceNamespace).toBe('function');
      expect(typeof typed.api.exportSettings).toBe('function');
      expect(typeof typed.api.importSettings).toBe('function');
      expect(typed.api).not.toHaveProperty('getUserSetting');
      expect(typed).not.toHaveProperty('userSettingRepository');
      expect(typed.portableCapability).toMatchObject({ key: 'preferences', schemaVersion: 3 });
      expect(typed.userTimeContextPort).toBeDefined();
    }
  });

  it('runtime contribution stays reversible', () => {
    const runtime = createSettingRuntimeContribution();
    expect(() => runtime.start()).not.toThrow();
    expect(() => runtime.stop()).not.toThrow();
  });

  it('root barrels do not leak concrete adapters or the deleted legacy repository port', async () => {
    const forbidden = [
      'UserSettingPrismaRepository',
      'UserSettingPowerSyncRepository',
      'UserPreferencePrismaRepository',
      'UserPreferencePowerSyncRepository',
      'IUserSettingRepository',
      'createSettingPrismaRepository',
    ];
    for (const file of ['../../../index.ts', '../index.ts']) {
      const source = readFileSync(resolve(__dirname, file), 'utf8');
      for (const name of forbidden) expect(source).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
    const root = await import('../../../../src');
    for (const name of forbidden) expect(Object.keys(root)).not.toContain(name);
  });

  it('type-exports the surviving preference repository port', () => {
    const compileLock = (_repo: IUserPreferenceRepository) => undefined;
    expect(typeof compileLock).toBe('function');
  });
});
