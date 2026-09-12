import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import { TaskOccurrenceHttpAdapter } from './task-occurrence-http.adapter';

describe('TaskOccurrenceHttpAdapter', () => {
  it('uses by-date-range endpoint for date range queries', async () => {
    const httpClient = {
      get: vi.fn().mockResolvedValue(ok([])),
    } as any;

    const adapter = new TaskOccurrenceHttpAdapter(httpClient);

    await adapter.getTaskOccurrencesByDateRange({
      startDate: 1_700_000_000_000,
      endDate: 1_700_086_399_999,
    });

    expect(httpClient.get).toHaveBeenCalledWith('/task-occurrences/by-date-range', {
      params: {
        startDate: 1_700_000_000_000,
        endDate: 1_700_086_399_999,
      },
    });
  });

  it('uses list endpoint when no date range is provided', async () => {
    const httpClient = {
      get: vi.fn().mockResolvedValue(ok([])),
    } as any;

    const adapter = new TaskOccurrenceHttpAdapter(httpClient);

    await adapter.getTaskOccurrences({
      status: 'Pending',
    });

    expect(httpClient.get).toHaveBeenCalledWith('/task-occurrences', {
      params: {
        status: 'Pending',
      },
    });
  });

  it('uses the occurrence reschedule endpoint with expectedVersion', async () => {
    const httpClient = {
      post: vi.fn().mockResolvedValue(ok({ id: 'TaskOccurrenceId_123' })),
    } as any;
    const adapter = new TaskOccurrenceHttpAdapter(httpClient);
    const request = {
      newTime: {
        timeType: 'TimePoint' as const,
        startDate: 1_787_860_800_000,
        timePoint: 16 * 60,
        timeRange: null,
      },
      expectedVersion: 4,
    };

    await adapter.rescheduleTaskOccurrence('TaskOccurrenceId_123', request);

    expect(httpClient.post).toHaveBeenCalledWith(
      '/task-occurrences/TaskOccurrenceId_123/reschedule',
      request,
    );
  });

  it('uses the uncomplete endpoint when restoring a completed instance', async () => {
    const httpClient = {
      post: vi.fn().mockResolvedValue(ok({ status: 'Pending' })),
    } as any;

    const adapter = new TaskOccurrenceHttpAdapter(httpClient);

    await adapter.uncompleteTaskOccurrence('TaskOccurrenceId_123');

    expect(httpClient.post).toHaveBeenCalledWith('/task-occurrences/TaskOccurrenceId_123/uncomplete');
  });
});
