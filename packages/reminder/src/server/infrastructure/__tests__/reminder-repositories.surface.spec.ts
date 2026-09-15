import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import { createTimeContext } from '@memoflow/time';
import {
  createReminderPrismaRepositories,
  createReminderPowerSyncRepositories,
  createReminderPrismaModule,
  createReminderPowerSyncModule,
  createPowerSyncClosureChecker,
  type ReminderPrismaRepositorySet,
  type ReminderPowerSyncRepositorySet,
  type ReminderModuleInstance,
  type IReminderTemplateRepository,
  type IReminderGroupRepository,
  type IReminderResponseRepository,
  type IUserReminderPreferenceRepository,
} from '../../../../src';

/**
 * Reminder repository seam surface.
 * 提醒仓储 seam 的表面契约。
 *
 * The Prisma set keeps the four domain repositories plus `reliablePort` and
 * `transactionRunner`; the PowerSync set returns the four domain repositories
 * plus the fail-closed closure checker. Convenience module factories keep the
 * api/start/dispose surface and the fail-closed closure checker requirement,
 * and concrete adapter classes must never leak through the root barrel.
 *
 * Prisma 集合保留四个领域仓储加 `reliablePort` 与 `transactionRunner`；PowerSync
 * 集合返回四个领域仓储加 fail-closed closure checker。便捷模块工厂保留
 * api/start/dispose 表面与 fail-closed closure checker 要求，具体适配器类绝不
 * 通过根 barrel 泄漏。
 */
describe('reminder repository factories surface', () => {
  const fakePrisma = {} as unknown as PrismaClient;
  const fakeElectronDb = {} as unknown as IElectronDatabase;
  const closureChecker = async (): Promise<boolean> => false;
  const userTimeContextPort = {
    getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
  };

  it('createReminderPrismaRepositories returns the full Prisma Port set', () => {
    const set = createReminderPrismaRepositories(fakePrisma);
    expect(set).toHaveProperty('reminderTemplateRepository');
    expect(set).toHaveProperty('reminderGroupRepository');
    expect(set).toHaveProperty('reminderResponseRepository');
    expect(set).toHaveProperty('userReminderPreferenceRepository');
    expect(set).toHaveProperty('reliablePort');
    expect(set).toHaveProperty('transactionRunner');
    const typed: ReminderPrismaRepositorySet = set;
    expect(typeof typed.transactionRunner.executeClaimedOccurrenceTransaction).toBe('function');
  });

  it('createReminderPowerSyncRepositories returns the four repos plus closure checker', () => {
    const set = createReminderPowerSyncRepositories(fakeElectronDb);
    expect(set).toHaveProperty('reminderTemplateRepository');
    expect(set).toHaveProperty('reminderGroupRepository');
    expect(set).toHaveProperty('reminderResponseRepository');
    expect(set).toHaveProperty('userReminderPreferenceRepository');
    expect(set).toHaveProperty('closureChecker');
    const typed: ReminderPowerSyncRepositorySet = set;
    expect(typeof typed.closureChecker).toBe('function');
  });

  it('PowerSync set exposes every shared repository name the Prisma set has', () => {
    const sharedNames = [
      'reminderTemplateRepository',
      'reminderGroupRepository',
      'reminderResponseRepository',
      'userReminderPreferenceRepository',
    ];
    const prismaSet = createReminderPrismaRepositories(fakePrisma);
    const powerSyncSet = createReminderPowerSyncRepositories(fakeElectronDb);
    for (const name of sharedNames) {
      expect(prismaSet).toHaveProperty(name);
      expect(powerSyncSet).toHaveProperty(name);
    }
  });

  it('convenience module factories preserve api/start/dispose and fail-closed closure checker', () => {
    const prismaInstance = createReminderPrismaModule(fakePrisma, { closureChecker, userTimeContextPort });
    expect(prismaInstance).toHaveProperty('api');
    expect(typeof prismaInstance.start).toBe('function');
    expect(typeof prismaInstance.dispose).toBe('function');
    const typedPrisma: ReminderModuleInstance = prismaInstance;
    expect(typeof typedPrisma.api.listTemplates).toBe('function');

    expect(() => createReminderPrismaModule(fakePrisma)).toThrow(/FAIL-CLOSED/);

    const powerSyncInstance = createReminderPowerSyncModule(fakeElectronDb, { userTimeContextPort });
    expect(powerSyncInstance).toHaveProperty('api');
    expect(typeof powerSyncInstance.start).toBe('function');
    expect(typeof powerSyncInstance.dispose).toBe('function');
    const typedPowerSync: ReminderModuleInstance = powerSyncInstance;
    expect(typeof typedPowerSync.api.listTemplates).toBe('function');
  });

  it('createPowerSyncClosureChecker returns a fail-closed checker', async () => {
    const checker = createPowerSyncClosureChecker(fakeElectronDb);
    expect(typeof checker).toBe('function');
    expect(typeof await checker('identity')).toBe('boolean');
  });

  it('does not leak concrete adapter classes through the root barrel', async () => {
    const forbidden = [
      'ReminderTemplatePrismaRepository',
      'ReminderGroupPrismaRepository',
      'ReminderResponsePrismaRepository',
      'UserReminderPreferencePrismaRepository',
      'ReminderTemplatePowerSyncRepository',
      'ReminderGroupPowerSyncRepository',
      'ReminderResponsePowerSyncRepository',
      'UserReminderPreferencePowerSyncRepository',
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

  it('root barrel type-exports every set field type (compile-time lock)', () => {
    const template = (_t: IReminderTemplateRepository) => undefined;
    const group = (_t: IReminderGroupRepository) => undefined;
    const response = (_t: IReminderResponseRepository) => undefined;
    const preference = (_t: IUserReminderPreferenceRepository) => undefined;

    expect(typeof template).toBe('function');
    expect(typeof group).toBe('function');
    expect(typeof response).toBe('function');
    expect(typeof preference).toBe('function');
  });
});
