import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTimeContext } from '@memoflow/time';
import type { PrismaClient } from '@memoflow/database';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import {
  createNotificationPrismaRepositories,
  createNotificationPowerSyncRepositories,
  createNotificationPrismaModule,
  createNotificationPowerSyncModule,
  createNotificationDurableRuntime,
  type NotificationPrismaRepositorySet,
  type NotificationPowerSyncRepositorySet,
  type NotificationModuleInstance,
  type INotificationRepository,
  type INotificationPreferenceRepository,
  type INotificationTemplateRepository,
  type ChannelCapabilitySpec,
} from '../../../../src';

const TEST_TIME_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
const TEST_USER_TIME_CONTEXT_PORT = {
  getUserTimeContext: async () => TEST_TIME_CONTEXT,
};

/**
 * Notification repository seam surface.
 * 通知仓储 seam 的表面契约。
 *
 * The Prisma set returns the three domain repositories plus the
 * reliable-operation adapter and audit repository; the PowerSync set returns
 * the three domain repositories plus the reliable-operation adapter.
 * Convenience module factories keep the api/start/dispose surface and the
 * fail-closed closure checker requirement, and concrete adapter classes must
 * never leak through the root barrel.
 *
 * Prisma 集合返回三个领域仓储加可靠操作适配器与审计仓储；PowerSync 集合返回
 * 三个领域仓储加可靠操作适配器。便捷模块工厂保留 api/start/dispose 表面与
 * fail-closed closure checker 要求，具体适配器类绝不通过根 barrel 泄漏。
 */
describe('notification repository factories surface', () => {
  const fakePrisma = {} as unknown as PrismaClient;
  const fakeElectronDb = {} as unknown as IElectronDatabase;

  const closureChecker = async (): Promise<boolean> => false;

  it('createNotificationPrismaRepositories returns the full Prisma Port set', () => {
    const set = createNotificationPrismaRepositories(fakePrisma);
    expect(set).toHaveProperty('notificationRepository');
    expect(set).toHaveProperty('notificationPreferenceRepository');
    expect(set).toHaveProperty('notificationTemplateRepository');
    expect(set).toHaveProperty('reliableAdapter');
    expect(set).toHaveProperty('auditRepository');
    const typed: NotificationPrismaRepositorySet = set;
    expect(typeof typed.reliableAdapter.claimOutboxDispatch).toBe('function');
  });

  it('createNotificationPowerSyncRepositories returns the PowerSync Port set', () => {
    const set = createNotificationPowerSyncRepositories(fakeElectronDb);
    expect(set).toHaveProperty('notificationRepository');
    expect(set).toHaveProperty('notificationPreferenceRepository');
    expect(set).toHaveProperty('notificationTemplateRepository');
    expect(set).toHaveProperty('reliableAdapter');
    expect(set).not.toHaveProperty('auditRepository');
    const typed: NotificationPowerSyncRepositorySet = set;
    expect(typeof typed.reliableAdapter.claimOutboxDispatch).toBe('function');
  });

  it('PowerSync set field names are a lane-capable subset of the Prisma set', () => {
    const prismaKeys = Object.keys(
      createNotificationPrismaRepositories(fakePrisma),
    ).sort();
    const powerSyncKeys = Object.keys(
      createNotificationPowerSyncRepositories(fakeElectronDb),
    ).sort();
    for (const key of powerSyncKeys) {
      expect(prismaKeys).toContain(key);
    }
  });

  it('convenience module factories preserve api/start/dispose and fail-closed closure checker', () => {
    const prismaInstance = createNotificationPrismaModule(fakePrisma, {
      closureChecker,
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
    });
    expect(prismaInstance).toHaveProperty('api');
    expect(typeof prismaInstance.start).toBe('function');
    expect(typeof prismaInstance.dispose).toBe('function');
    const typedPrisma: NotificationModuleInstance = prismaInstance;
    expect(typeof typedPrisma.api.listNotifications).toBe('function');

    expect(() => createNotificationPrismaModule(fakePrisma)).toThrow(
      /FAIL-CLOSED/,
    );

    expect(() => createNotificationPowerSyncModule(fakeElectronDb)).toThrow(/userTimeContextPort/);

    const powerSyncInstance = createNotificationPowerSyncModule(fakeElectronDb, {
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
    });
    expect(powerSyncInstance).toHaveProperty('api');
    expect(typeof powerSyncInstance.start).toBe('function');
    expect(typeof powerSyncInstance.dispose).toBe('function');
    const typedPowerSync: NotificationModuleInstance = powerSyncInstance;
    expect(typeof typedPowerSync.api.listNotifications).toBe('function');
  });

  it('createNotificationDurableRuntime wires host channel capabilities and transport', () => {
    const set = createNotificationPowerSyncRepositories(fakeElectronDb);
    const capabilities: ChannelCapabilitySpec[] = [
      { channelType: 'InApp', status: 'available' },
      { channelType: 'Desktop', status: 'available' },
    ];
    const runtime = createNotificationDurableRuntime({
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      notificationRepository: set.notificationRepository,
      reliableAdapter: set.reliableAdapter,
      channelCapabilities: capabilities,
      transport: { getAckStore: () => undefined, deliver: async () => ({ status: 'delivered', ackId: 'a', timestamp: 1 }) },
    });
    expect(typeof runtime.start).toBe('function');
    expect(typeof runtime.stop).toBe('function');
    expect(typeof runtime.queryReceipts).toBe('function');
  });

  it('does not leak concrete adapter classes through the root barrel', async () => {
    const forbidden = [
      'NotificationPrismaRepository',
      'NotificationPreferencePrismaRepository',
      'NotificationTemplatePrismaRepository',
      'PowerSyncNotificationRepository',
      'PowerSyncNotificationPreferenceRepository',
      'PowerSyncNotificationTemplateRepository',
      'PowerSyncNotificationReliableAdapter',
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
    const repo = (_t: INotificationRepository) => undefined;
    const pref = (_t: INotificationPreferenceRepository) => undefined;
    const template = (_t: INotificationTemplateRepository) => undefined;

    expect(typeof repo).toBe('function');
    expect(typeof pref).toBe('function');
    expect(typeof template).toBe('function');
  });
});
