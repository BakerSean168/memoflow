import { unwrap } from '@memoflow/contracts/result';
import type { IAIPlannerReadPort, AIPlannerTaskItem } from '@memoflow/ai';
import { IdentityId } from '@memoflow/domain-shared/shared';
import type { IScheduleRepository } from '@memoflow/schedule';
import type { TaskApplicationPort } from '@memoflow/task';

/** Read-only Planner projection. Scheduler worker repositories are deliberately absent. */
export class DesktopPlannerAIReadAdapter implements IAIPlannerReadPort {
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
    const timedEntries = calendar.filter(
      (entry): entry is typeof entry & { range: Extract<typeof entry.range, { kind: 'Timed' }> } =>
        entry.range.kind === 'Timed',
    );
    const calendarItems: Array<
      Awaited<ReturnType<IAIPlannerReadPort['getWindowSummary']>>['calendar'][number]
    > = timedEntries.map((entry) => {
      // P4-2301B: this legacy AI read port derives overlap from current owner facts.
      // No persisted CalendarEntry conflict cache survives. AI-9609 owns the later
      // cross-owner range-aware AI Planner port.
      const conflictingEntryIds = timedEntries
        .filter(
          (other) =>
            other.id !== entry.id &&
            entry.range.start < other.range.end &&
            entry.range.end > other.range.start,
        )
        .map((other) => String(other.id));
      return {
        id: String(entry.id),
        title: entry.title,
        startTime: entry.range.start,
        endTime: entry.range.end,
        hasConflict: conflictingEntryIds.length > 0,
        conflictingEntryIds,
      };
    });

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
