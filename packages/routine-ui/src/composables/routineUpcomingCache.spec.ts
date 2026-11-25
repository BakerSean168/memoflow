import { QueryClient } from '@tanstack/vue-query';
import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/transport-contracts/result';
import { createTestServerStateRuntime } from '@routine-ui-test-host/platform/server-state';
import { routineUpcomingQueryKeys } from '@routine-ui-test-host/platform/server-state/query-keys';
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

  it('refetches an invalidated range inside the stale window and only marks other ranges stale', async () => {
    const runtime = createTestServerStateRuntime();
    const todayStart = Date.UTC(2026, 8, 28);
    const todayEnd = Date.UTC(2026, 8, 29);
    const previousStart = Date.UTC(2026, 8, 27);
    let revision = 1;
    const getUpcomingOccurrences = vi.fn(async ({ start }: { start: number }) =>
      ok({
        occurrences: [
          {
            identityId: 'identity-1',
            routineId: 'routine-1',
            occurrenceKey: `routine-1:${start}:${revision}`,
            title: 'Wind down',
            description: null,
            occurrenceAt: start + 23 * 3_600_000 + 50 * 60_000,
            endAt: null,
            revision,
            editable: false,
          },
        ],
      }),
    );
    const input = {
      queryClient: runtime.queryClient,
      identityScope: 'identity-1',
      service: { getUpcomingOccurrences },
      start: todayStart,
      end: todayEnd,
    };

    const before = await fetchRoutineUpcomingCached(input);
    expect(before[0]?.occurrenceKey).toBe(`routine-1:${todayStart}:1`);
    await fetchRoutineUpcomingCached({ ...input, start: previousStart, end: todayStart });
    expect(getUpcomingOccurrences).toHaveBeenCalledTimes(2);

    revision = 2;
    await runtime.dispatcher.invalidate({
      target: 'routine-upcoming',
      identityScope: 'identity-1',
      source: 'mutation',
    });

    // Inactive ranges are only marked stale: no eager refetch happened yet.
    expect(getUpcomingOccurrences).toHaveBeenCalledTimes(2);
    expect(
      runtime.queryClient.getQueryState(
        routineUpcomingQueryKeys.range('identity-1', previousStart, todayStart, 500),
      )?.isInvalidated,
    ).toBe(true);

    // The active/mounted range re-reads immediately even though the 30s staleTime has not
    // elapsed, because the owner mutation invalidated the identity-scoped projection.
    const after = await fetchRoutineUpcomingCached(input);
    expect(after[0]?.occurrenceKey).toBe(`routine-1:${todayStart}:2`);
    expect(getUpcomingOccurrences).toHaveBeenCalledTimes(3);

    // Re-entering a previously inactive range reads the new projection too.
    const reentered = await fetchRoutineUpcomingCached({
      ...input,
      start: previousStart,
      end: todayStart,
    });
    expect(reentered[0]?.occurrenceKey).toBe(`routine-1:${previousStart}:2`);
    expect(getUpcomingOccurrences).toHaveBeenCalledTimes(4);

    runtime.dispose();
  });
});
