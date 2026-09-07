import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import {
  createPrismaDataPortabilityDependencies,
  createPowerSyncDataPortabilityDependencies,
  createPrismaDataPortabilityImportStore,
  createPowerSyncDataPortabilityImportStore,
  createDataPortabilityModule,
  type DataPortabilityRepositorySet,
  type DataPortabilityDependencies,
  type DataPortabilityImportStore,
} from '../../../../src';

/**
 * Data portability repository seam surface.
 * 数据可移植性仓储 seam 的表面契约。
 *
 * Both lane factories return the complete cross-module `DataPortabilityDependencies`
 * shape (aliased as `DataPortabilityRepositorySet`), import-store factories
 * return the `DataPortabilityImportStore` port, and no concrete PowerSync
 * adapter class leaks through the root barrel.
 *
 * 两个 lane 工厂都返回完整的跨模块 `DataPortabilityDependencies` 形状
 * （别名为 `DataPortabilityRepositorySet`）；import-store 工厂返回
 * `DataPortabilityImportStore` Port；具体 PowerSync 适配器类不通过根 barrel 泄漏。
 */
describe('data portability dependency factories surface', () => {
  const fakePrisma = {} as unknown as PrismaClient;
  const fakeElectronDb = {} as unknown as IElectronDatabase;

  const expectedFieldNames = [
    'goalRepository',
    'goalRecordRepository',
    'taskTemplateRepository',
    'taskInstanceRepository',
    'reminderTemplateRepository',
    'reminderGroupRepository',
    'reminderResponseRepository',
    'routineProfileMembershipRepository',
    'routineDefinitionRepository',
    'userReminderPreferenceRepository',
    'repositoryRepository',
    'folderRepository',
    'resourceRepository',
    'scheduleRepository',
    'scheduleTaskRepository',
    'editorWorkspaceRepository',
    'editorSessionRepository',
    'editorGroupRepository',
    'editorTabRepository',
    'aiConversationRepository',
    'notificationPreferenceRepository',
    'settingRepository',
  ];

  it('createPrismaDataPortabilityDependencies returns the complete field set', () => {
    const deps = createPrismaDataPortabilityDependencies(fakePrisma);
    for (const name of expectedFieldNames) {
      expect(deps).toHaveProperty(name);
    }
    const typed: DataPortabilityRepositorySet = deps;
    const typedFull: DataPortabilityDependencies = typed;
    expect(Object.keys(typedFull).length).toBeGreaterThanOrEqual(expectedFieldNames.length);
  });

  it('createPowerSyncDataPortabilityDependencies returns the same complete field set', () => {
    const deps = createPowerSyncDataPortabilityDependencies(fakeElectronDb);
    for (const name of expectedFieldNames) {
      expect(deps).toHaveProperty(name);
    }
    const typed: DataPortabilityRepositorySet = deps;
    expect(Object.keys(typed)).toHaveLength(expectedFieldNames.length);
  });

  it('Prisma and PowerSync dependency shapes agree on all field names', () => {
    const prismaKeys = Object.keys(
      createPrismaDataPortabilityDependencies(fakePrisma),
    ).sort();
    const powerSyncKeys = Object.keys(
      createPowerSyncDataPortabilityDependencies(fakeElectronDb),
    ).sort();
    expect(prismaKeys).toEqual(powerSyncKeys);
  });

  it('import-store factories return the DataPortabilityImportStore port', () => {
    const prismaStore: DataPortabilityImportStore =
      createPrismaDataPortabilityImportStore(fakePrisma);
    expect(typeof prismaStore.transaction).toBe('function');

    const powerSyncStore: DataPortabilityImportStore =
      createPowerSyncDataPortabilityImportStore(fakeElectronDb);
    expect(typeof powerSyncStore.transaction).toBe('function');
  });

  it('module factory still assembles exportDependencies + importStore', () => {
    const instance = createDataPortabilityModule({
      exportDependencies: createPowerSyncDataPortabilityDependencies(fakeElectronDb),
      importStore: createPowerSyncDataPortabilityImportStore(fakeElectronDb),
    });
    expect(typeof instance.start).toBe('function');
    expect(typeof instance.dispose).toBe('function');
    expect(typeof instance.api.exportUserData).toBe('function');
  });

  it('does not leak concrete adapter classes through the root barrel', async () => {
    const forbidden = [
      'PowerSyncGoalAdapter',
      'PowerSyncTaskTemplateAdapter',
      'PowerSyncAIConversationAdapter',
      'PowerSyncDataPortabilityImportStore',
      'PrismaDataPortabilityImportStore',
      'PrismaServerHeldDataDisclosureSource',
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
});
