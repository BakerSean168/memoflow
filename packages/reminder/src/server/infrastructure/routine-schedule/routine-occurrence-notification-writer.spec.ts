import { describe, expect, it, vi } from 'vitest';
import type { NotificationRequestedWriterPort } from '@memoflow/contracts/notification';
import {
  buildRoutineOccurrenceNotificationRequest,
  createRoutineOccurrenceNotificationWriter,
} from './routine-occurrence-notification-writer';

describe('Routine occurrence notification adapter', () => {
  it('builds one canonical routine.intervention envelope and delegates to NotificationRequested writer', async () => {
    const receipt = {
      schemaVersion: 1,
      operationId: 'op-1',
      identityId: 'identity-1',
      source: 'routine',
      occurrenceKey: 'occurrence-1',
      idempotencyKey: 'identity-1:routine:occurrence-1',
      status: 'succeeded',
      attempt: 1,
      lease: null,
      lastError: null,
      nextRetryAt: null,
      deadLetterAt: null,
      correlationId: null,
      causationId: null,
      attemptsHistory: [],
      createdAt: '2026-09-28T00:00:00.000Z',
      updatedAt: '2026-09-28T00:00:00.000Z',
      finishedAt: '2026-09-28T00:00:00.000Z',
    } as const;
    const sharedWriter = {
      enqueueNotificationRequested: vi.fn().mockResolvedValue(receipt),
    } as unknown as NotificationRequestedWriterPort;
    const writer = createRoutineOccurrenceNotificationWriter(sharedWriter);

    const request = buildRoutineOccurrenceNotificationRequest({
      identityId: 'identity-1',
      routineId: 'routine-1',
      occurrenceKey: 'occurrence-1',
      scheduledFor: 123,
      sourceRevision: 4,
      routineName: 'Stand & Move',
      routineDescription: null,
    });

    await expect(writer.enqueueRoutineOccurrenceRequested(request)).resolves.toBe(receipt);
    expect(sharedWriter.enqueueNotificationRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        envelope: expect.objectContaining({
          source: 'routine',
          occurrenceKey: 'occurrence-1',
          workflowKey: 'routine.intervention',
          suggestedChannels: ['InApp'],
          content: {
            title: '例行提醒：Stand & Move',
            content: '已到「Stand & Move」的执行时间。',
            type: 'Reminder',
            category: 'Reminder',
          },
        }),
      }),
      { txClient: undefined },
    );
  });

  it('uses a distinct notificationOccurrenceKey for snooze re-presentation while preserving business actions', async () => {
    const sharedWriter = {
      enqueueNotificationRequested: vi.fn().mockResolvedValue({}),
    } as unknown as NotificationRequestedWriterPort;
    const writer = createRoutineOccurrenceNotificationWriter(sharedWriter);

    await writer.enqueueRoutineOccurrenceRequested({
      identityId: 'identity-1',
      routineId: 'routine-1',
      occurrenceKey: 'occurrence-1',
      notificationOccurrenceKey: 'occurrence-1:snooze:600123',
      scheduledFor: 600123,
      sourceRevision: 4,
      title: '例行提醒：Stand & Move',
      content: 'Take a break',
    });

    expect(sharedWriter.enqueueNotificationRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        envelope: expect.objectContaining({
          occurrenceKey: 'occurrence-1:snooze:600123',
          idempotencyKey: expect.stringContaining('occurrence-1:snooze:600123'),
          actions: expect.arrayContaining([
            expect.objectContaining({
              actionKey: 'complete',
              owner: { type: 'routine-occurrence', id: 'occurrence-1' },
              input: expect.objectContaining({ occurrenceKey: 'occurrence-1' }),
            }),
            expect.objectContaining({
              actionKey: 'snooze-10m',
              owner: { type: 'routine-occurrence', id: 'occurrence-1' },
              input: expect.objectContaining({ occurrenceKey: 'occurrence-1' }),
            }),
          ]),
        }),
      }),
      { txClient: undefined },
    );
  });

  it('forwards the paired occurrence transaction client when one is supplied', async () => {
    const sharedWriter = {
      enqueueNotificationRequested: vi.fn().mockResolvedValue({}),
    } as unknown as NotificationRequestedWriterPort;
    const writer = createRoutineOccurrenceNotificationWriter(sharedWriter);
    const txClient = { transaction: true };

    await writer.enqueueRoutineOccurrenceRequested(
      buildRoutineOccurrenceNotificationRequest({
        identityId: 'identity-1',
        routineId: 'routine-1',
        occurrenceKey: 'occurrence-1',
        scheduledFor: 123,
        sourceRevision: null,
        routineName: 'Routine',
      }),
      {
        transaction: {
          kind: 'routine-occurrence-transaction',
          client: txClient,
        },
      },
    );

    expect(sharedWriter.enqueueNotificationRequested).toHaveBeenCalledWith(expect.any(Object), {
      txClient,
    });
  });
});
