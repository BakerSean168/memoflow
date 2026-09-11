import { describe, expect, it, vi } from 'vitest';
import { PrismaDataPortabilityImportStore } from '../import-store/prisma-data-portability-import-store';

/**
 * PrismaDataPortabilityImportStore transaction behaviour.
 * PrismaDataPortabilityImportStore 的事务行为。
 *
 * The store must wrap the whole import callback in a single prisma.$transaction,
 * invoke the callback exactly once with a DataPortabilityImportTx bound to that
 * transaction client, and propagate transaction failures unchanged.
 *
 * store 必须把整个 import callback 包在单个 prisma.$transaction 内，回调只执行一次，
 * 并把绑定到该事务客户端的 DataPortabilityImportTx 传给回调，事务失败原样向上传播。
 */
describe('PrismaDataPortabilityImportStore', () => {
  function createFakePrisma() {
    const writeCalls: string[] = [];
    const transactionClient = {
      userPreferenceRecord: { upsert: vi.fn(async () => undefined) },
      repository: { create: vi.fn(async () => undefined) },
      goal: { create: vi.fn(async () => undefined) },
      taskPlan: { create: vi.fn(async () => undefined) },
      scheduleTask: { create: vi.fn(async () => undefined) },
      reminderResponse: { create: vi.fn(async () => undefined) },
      aiConversation: { create: vi.fn(async () => undefined) },
      aiMessage: { create: vi.fn(async () => undefined) },
    };
    const prisma = {
      $transaction: vi.fn(async (fn) => {
        return fn(transactionClient);
      }),
    };
    return { prisma, transactionClient, writeCalls };
  }

  it('invokes the import callback exactly once inside one $transaction', async () => {
    const { prisma } = createFakePrisma();
    const store = new PrismaDataPortabilityImportStore(prisma as never);

    const callback = vi.fn(async () => 'imported');
    const result = await store.transaction(callback);

    expect(result).toBe('imported');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0]?.[0]).toBeDefined();
  });

  it('routes every write to the same $transaction client', async () => {
    const { prisma, transactionClient } = createFakePrisma();
    const store = new PrismaDataPortabilityImportStore(prisma as never);

    await store.transaction(async (tx) => {
      await tx.upsertUserPreferences({
        identityId: 'identity-1',
        presentation: { theme: 'dark', language: 'en-US' },
        regional: { timeZone: 'UTC', dateStyle: 'medium', timeStyle: '24h', weekStartsOn: 1 },
      });
      await tx.createRepository({
        id: 'repo-1',
        identityId: 'identity-1',
        name: 'Knowledge',
        type: 'local',
        path: '/knowledge',
        description: null,
        config: {},
        status: 'ACTIVE',
      });
      await tx.createGoal({
        id: 'goal-1',
        identityId: 'identity-1',
        name: 'Ship',
        description: null,
        color: '#000',
        feasibilityAnalysis: null,
        motivation: null,
        status: 'active',
        importance: 'high',
        priority: 1,
        category: null,
        tags: [],
        startDate: null,
        targetDate: null,
        completedAt: null,
        folderId: null,
        parentGoalId: null,
        sortOrder: 0,
        reminderConfig: null,
      });
    });

    expect(transactionClient.userPreferenceRecord.upsert).toHaveBeenCalledTimes(2);
    expect(transactionClient.repository.create).toHaveBeenCalledTimes(1);
    expect(transactionClient.goal.create).toHaveBeenCalledTimes(1);
  });

  it('propagates transaction failures unchanged', async () => {
    const { prisma } = createFakePrisma();
    const store = new PrismaDataPortabilityImportStore(prisma as never);
    const error = new Error('boom');

    await expect(
      store.transaction(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });
});
