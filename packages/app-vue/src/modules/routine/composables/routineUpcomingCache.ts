import type { QueryClient } from '@tanstack/vue-query';
import type { RoutineUpcomingOccurrence } from '@memoflow/contracts/routine';
import type { RoutineClientPort } from '@memoflow/reminder/client';
import { routineUpcomingQueryKeys } from '../../../platform/server-state/query-keys';
import { ROUTINE_UPCOMING_STALE_TIME_MS } from '../../../platform/server-state/query-policy';

export interface FetchRoutineUpcomingCachedInput {
  queryClient: QueryClient;
  identityScope: string;
  service: Pick<RoutineClientPort, 'getUpcomingOccurrences'>;
  start: number;
  end: number;
  limit?: number;
  force?: boolean;
}

/**
 * Identity/range-scoped Routine occurrence read shared by the header capsule and Planner.
 * QueryClient owns freshness/in-flight dedupe so Popover unmounts never reset the cache.
 */
export async function fetchRoutineUpcomingCached(
  input: FetchRoutineUpcomingCachedInput,
): Promise<RoutineUpcomingOccurrence[]> {
  const limit = input.limit ?? 500;
  return input.queryClient.fetchQuery<RoutineUpcomingOccurrence[]>({
    queryKey: routineUpcomingQueryKeys.range(
      input.identityScope,
      input.start,
      input.end,
      limit,
    ),
    staleTime: input.force ? 0 : ROUTINE_UPCOMING_STALE_TIME_MS,
    queryFn: async () => {
      const result = await input.service.getUpcomingOccurrences({
        start: input.start,
        end: input.end,
        limit,
      });
      if (!result.ok) throw result.error;
      return result.data.occurrences;
    },
  });
}
