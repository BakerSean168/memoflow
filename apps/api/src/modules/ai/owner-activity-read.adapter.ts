import { mergeAIActivityItems } from '@memoflow/ai';
import type { IAIActivityReadPort } from '@memoflow/ai/ports';
import type { GoalActivityReadService } from '@memoflow/goal';
import type { ScheduleActivityReadService } from '@memoflow/schedule';
import type { TaskActivityReadService } from '@memoflow/task';

export interface OwnerActivityAIReadDependencies {
  readonly goalActivity: Pick<GoalActivityReadService, 'listRecentActivity'>;
  readonly taskActivity: Pick<TaskActivityReadService, 'listRecentActivity'>;
  readonly scheduleActivity: Pick<ScheduleActivityReadService, 'listRecentActivity'>;
}

/**
 * API-side recent-activity assembly from domain-owned activity capabilities.
 *
 * HOME-1804 retired the cross-domain activity ledger: recent activity is a
 * bounded AI consumer projection, not a second durable product authority.
 * Domains own the fact-to-entry mapping; this host only assembles the streams.
 */
export class OwnerActivityAIReadAdapter implements IAIActivityReadPort {
  constructor(private readonly dependencies: OwnerActivityAIReadDependencies) {}

  async listRecent(input: Parameters<IAIActivityReadPort['listRecent']>[0]) {
    const [tasks, goals, schedules] = await Promise.all([
      this.dependencies.taskActivity.listRecentActivity(input.identityId, {
        since: input.since,
        limit: input.limit,
      }),
      this.dependencies.goalActivity.listRecentActivity(input.identityId, {
        since: input.since,
        limit: input.limit,
      }),
      this.dependencies.scheduleActivity.listRecentActivity(input.identityId, {
        since: input.since,
        limit: input.limit,
      }),
    ]);

    return mergeAIActivityItems([...tasks, ...goals, ...schedules], input.limit);
  }
}
