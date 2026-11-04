import { QueryClient } from '@tanstack/vue-query';
import { describe, expect, it, vi } from 'vitest';
import { fetchRoutineUpcomingCached } from './routineUpcomingCache';

describe('Routine upcoming projection cache', () => {
  it('separates interval summaries from the Planner wall-clock projection', async () => {
    const queryClient = new QueryClient();
    const getUpcomingOccurrences = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: { occurrences: [] } })
      .mockResolvedValueOnce({ ok: true, data: { occurrences: [{ routineId: 'elapsed' }] } });
    const input = {
      queryClient,
      identityScope: 'identity-1',
      service: { getUpcomingOccurrences },
      start: 100,
      end: 200,
    };
    expect(await fetchRoutineUpcomingCached(input)).toEqual([]);
    expect(await fetchRoutineUpcomingCached({ ...input, includeElapsed: true })).toEqual([
      { routineId: 'elapsed' },
    ]);
    expect(getUpcomingOccurrences).toHaveBeenLastCalledWith({
      start: 100,
      end: 200,
      limit: 500,
      includeElapsed: true,
    });
    expect(await fetchRoutineUpcomingCached(input)).toEqual([]);
    expect(getUpcomingOccurrences).toHaveBeenCalledTimes(2);
    queryClient.clear();
  });
});
