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

  private async taskItems(identityId: string, startTime: number, endTime: number): Promise<AIPlannerTaskItem[]> {
    const [instances, templates] = await Promise.all([
      this.taskApplicationPort.getTaskInstancesByDateRange(identityId, startTime, endTime),
      this.taskApplicationPort.listTaskTemplates({ identityId: IdentityId.of(identityId) }),
    ]);
    const instanceData = unwrap(instances).data;
    const templateData = unwrap(templates).templates;
    const titles = new Map(templateData.map((template) => [String(template.id), template.name] as const));
    return instanceData.map((instance) => ({
      id: String(instance.id),
      templateId: String(instance.templateId),
      title: titles.get(String(instance.templateId)) ?? 'Untitled task',
      instanceDate: instance.instanceDate,
      dueDate: null,
      status: String(instance.status),
    }));
  }

  async getWindowSummary(input: Parameters<IAIPlannerReadPort['getWindowSummary']>[0]) {
    const [calendar, tasks] = await Promise.all([
      this.scheduleRepository.findByTimeRange(input.identityId, input.startTime, input.endTime),
      this.taskItems(input.identityId, input.startTime, input.endTime),
    ]);
    return {
      startTime: input.startTime,
      endTime: input.endTime,
      calendar: calendar.map((entry) => ({
        id: String(entry.id),
        title: entry.title,
        startTime: entry.startTime,
        endTime: entry.endTime,
        hasConflict: entry.hasConflict,
        conflictingEntryIds: entry.conflictingEntries ?? [],
      })),
      tasks,
    };
  }

  async getConflicts(input: Parameters<IAIPlannerReadPort['getConflicts']>[0]) {
    const entries = (await this.getWindowSummary(input)).calendar.filter((entry) => entry.hasConflict);
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
      .filter((item) => item.status !== 'Completed' && item.status !== 'Skipped' && item.status !== 'Missed')
      .sort((a, b) => a.instanceDate - b.instanceDate)
      .slice(0, input.limit ?? 20);
  }
}
