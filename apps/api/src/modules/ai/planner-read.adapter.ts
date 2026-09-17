import { unwrap } from '@memoflow/contracts/result';
import type { IAIPlannerReadPort, AIPlannerTaskItem } from '@memoflow/ai';
import { IdentityId } from '@memoflow/domain-shared/shared';
import type { IScheduleRepository } from '@memoflow/schedule';
import type { TaskApplicationPort } from '@memoflow/task';

/** Read-only Planner projection. Scheduler worker repositories are deliberately absent. */
export class PlannerAIReadAdapter implements IAIPlannerReadPort {
  constructor(
    private readonly scheduleRepository: IScheduleRepository,
    private readonly taskApplicationPort: TaskApplicationPort,
  ) {}

  private async taskItems(
    identityId: string,
    startTime: number,
    endTime: number,
  ): Promise<AIPlannerTaskItem[]> {
    const [instances, plans] = await Promise.all([
      this.taskApplicationPort.getTaskOccurrencesByDateRange(identityId, startTime, endTime),
      this.taskApplicationPort.listTaskPlans({ identityId: IdentityId.of(identityId) }),
    ]);
    const instanceData = unwrap(instances).data;
    const planData = unwrap(plans).plans;
    const titles = new Map(
      planData.map((plan) => [String(plan.id), plan.name] as const),
    );
    return instanceData.map((instance) => ({
      id: String(instance.id),
      planId: String(instance.planId),
      title: titles.get(String(instance.planId)) ?? 'Untitled task',
      scheduleDate: instance.scheduleSnapshot.date,
      dueAt: instance.dueAt,
      status: String(instance.status),
    }));
  }

  async getWindowSummary(input: Parameters<IAIPlannerReadPort['getWindowSummary']>[0]) {
    const [calendar, tasks] = await Promise.all([
      this.scheduleRepository.findByTimeRange(input.identityId, input.startTime, input.endTime),
      this.taskItems(input.identityId, input.startTime, input.endTime),
    ]);
    const calendarItems: Array<
      Awaited<ReturnType<IAIPlannerReadPort['getWindowSummary']>>['calendar'][number]
    > = [];
    for (const entry of calendar) {
      // P4-2301A: this legacy AI read port is Instant-window based. Never synthesize
      // an Instant for an AllDay Ymd range; AI-9609 owns the later range-aware port cutover.
      if (entry.range.kind !== 'Timed') {
        continue;
      }
      const conflict = await this.scheduleRepository.getConflictProjection(
        input.identityId,
        entry.id,
      );
      calendarItems.push({
        id: String(entry.id),
        title: entry.title,
        startTime: entry.range.start,
        endTime: entry.range.end,
        hasConflict: conflict?.hasConflict ?? false,
        conflictingEntryIds: conflict?.conflictingEntries ?? [],
      });
    }

    return {
      startTime: input.startTime,
      endTime: input.endTime,
      calendar: calendarItems,
      tasks,
    };
  }

  async getConflicts(input: Parameters<IAIPlannerReadPort['getConflicts']>[0]) {
    const entries = (await this.getWindowSummary(input)).calendar.filter(
      (entry) => entry.hasConflict,
    );
    return {
      startTime: input.startTime,
      endTime: input.endTime,
      entries,
      conflictCount: entries.length,
    };
  }

  async getUpcomingTasks(input: Parameters<IAIPlannerReadPort['getUpcomingTasks']>[0]) {
    const items = await this.taskItems(input.identityId, input.startTime, input.endTime);
    return items
      .filter(
        (item) =>
          item.status !== 'Completed' && item.status !== 'Skipped' && item.status !== 'Missed',
      )
      .sort((a, b) => a.dueAt - b.dueAt)
      .slice(0, input.limit ?? 20);
  }
}
