import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import { aTaskOccurrence } from '../../../../testing';
import { TaskGoalBinding } from '../../../domain/value-objects/task-goal-binding';
import { PrismaTaskOccurrenceMapper } from './mappers/prisma-task-occurrence-mapper';
import { PrismaTaskWriteTransactionRunner } from './prisma-task-write-transaction-runner';

/** Exercise the real repository + runner without invoking database schema setup. */
describe('PrismaTaskWriteTransactionRunner Prompt transaction', () => {
  it.each([0, -2, undefined])('commits completion and optional fact %s together', async (value) => {
    const harness = await createHarness();
    await harness.complete(value);
    expect(harness.state().occurrence.status).toBe('Completed');
    expect(harness.state().outbox).toHaveLength(value === undefined ? 0 : 1);
    if (value !== undefined) {
      expect(JSON.parse(harness.state().outbox[0].payload)).toMatchObject({
        recordingMode: 'PromptedUserMeasurement',
        value,
        note: 'Measured',
        source: { type: 'TaskOccurrence', id: harness.occurrenceId },
      });
      // An already-completed delivery request cannot append another intent.
      await harness.complete(value);
      expect(harness.state().outbox).toHaveLength(1);
    }
  });

  it('rolls back completion and buffered publication when the outbox write fails', async () => {
    const harness = await createHarness(true);
    await expect(harness.complete(0)).rejects.toThrow('Outbox append failed');
    expect(harness.state().occurrence.status).toBe('Pending');
    expect(harness.state().outbox).toHaveLength(0);
    expect(harness.publisher.publish).not.toHaveBeenCalled();
  });
});

async function createHarness(failOutbox = false) {
  const occurrence = await aTaskOccurrence();
  const binding = TaskGoalBinding.fromDTO({
    goalId: 'goal-1',
    keyResultId: 'kr-1',
    progressRule: { mode: 'Prompt', trigger: 'EachCompletion', suggestedValue: 99 },
  });
  let committed = {
    occurrence: {
      id: String(occurrence.id),
      ...PrismaTaskOccurrenceMapper.toPersistence(occurrence),
      createdAt: new Date(occurrence.createdAt),
    },
    outbox: [] as { payload: string }[],
  };
  const publisher = { publish: vi.fn(async () => {}) };
  const prisma = {
    $transaction: async <T>(work: (tx: unknown) => Promise<T>) => {
      const staged = structuredClone(committed);
      const tx = {
        taskOccurrence: {
          findFirst: async () => staged.occurrence,
          updateMany: async ({
            where,
            data,
          }: {
            where: { id: string; version: number };
            data: object;
          }) => {
            expect(where.id).toBe(occurrence.id);
            expect(where.version).toBe(staged.occurrence.version);
            Object.assign(staged.occurrence, data);
            return { count: 1 };
          },
        },
        taskGoalOutbox: {
          createMany: async ({
            data,
            skipDuplicates,
          }: {
            data: { payload: string }[];
            skipDuplicates: boolean;
          }) => {
            expect(staged.occurrence.status).toBe('Completed');
            expect(skipDuplicates).toBe(true);
            if (failOutbox) throw new Error('Outbox append failed');
            staged.outbox.push(...data);
          },
        },
      };
      const result = await work(tx);
      committed = staged;
      return result;
    },
  };
  const runner = new PrismaTaskWriteTransactionRunner(prisma as unknown as PrismaClient, publisher);
  return {
    state: () => committed,
    publisher,
    occurrenceId: String(occurrence.id),
    complete: (value: number | undefined) =>
      runner.run(async ({ occurrenceRepository }) => {
        const loaded = await occurrenceRepository.findByIdForIdentity(
          String(occurrence.identityId),
          String(occurrence.id),
        );
        if (!loaded || loaded.status === 'Completed') return;
        loaded.complete(undefined, 'Task note', undefined, {
          taskTitle: 'Measure Task',
          goalBinding: binding.toDTO(),
          ...(value === undefined ? {} : { goalMeasurement: { value, note: 'Measured' } }),
        });
        await occurrenceRepository.save(loaded);
      }),
  };
}
