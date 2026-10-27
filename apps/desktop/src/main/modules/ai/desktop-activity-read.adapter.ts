import { mergeAIActivityItems } from '@memoflow/ai';
import type { IAIActivityReadPort } from '@memoflow/ai/ports';
import type { GoalActivityReadService } from '@memoflow/goal';
import type { ScheduleActivityReadService } from '@memoflow/schedule';
import type { TaskActivityReadService } from '@memoflow/task';

export interface DesktopActivityAIReadDependencies {
  readonly goalActivity: Pick<GoalActivityReadService, 'listRecentActivity'>;
  readonly taskActivity: Pick<TaskActivityReadService, 'listRecentActivity'>;
  readonly scheduleActivity: Pick<ScheduleActivityReadService, 'listRecentActivity'>;
}

/**
 * Desktop recent-activity assembly from domain-owned activity capabilities.
 *
 * HOME-1804 keeps this host adapter thin: it reads domain activity streams and
 * delegates ordering/bounding semantics to the shared AI assembly seam.
 */
export class DesktopActivityAIReadAdapter implements IAIActivityReadPort {
  constructor(private readonly dependencies: DesktopActivityAIReadDependencies) {}

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
