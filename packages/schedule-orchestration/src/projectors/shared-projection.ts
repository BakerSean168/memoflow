import type { SourceModule, ScheduleEventMap } from '@memoflow/contracts/schedule';
import type { IScheduleTaskRepository, ScheduleTask } from '@memoflow/scheduler';
import type { Publisher } from '@memoflow/utils/domain';

export interface ProjectionSelection {
  readonly sourceModule: SourceModule;
  readonly identityId: string;
  readonly sourceEntityId?: string;
  matches(task: ScheduleTask): boolean;
}

export interface ProjectionPlan {
  readonly selection: ProjectionSelection;
  readonly nextTasks: readonly ScheduleTask[];
}

export async function findMatchingTasks(
  scheduleTaskRepository: IScheduleTaskRepository,
  selection: ProjectionSelection,
): Promise<readonly ScheduleTask[]> {
  const existingTasks = selection.sourceEntityId
    ? await scheduleTaskRepository.findBySourceEntity(
        selection.sourceModule,
        selection.sourceEntityId,
        selection.identityId,
      )
    : await scheduleTaskRepository.findBySourceModule(
        selection.sourceModule,
        selection.identityId,
      );

  return existingTasks.filter((task) => selection.matches(task));
}

export async function deleteSelection(
  scheduleTaskRepository: IScheduleTaskRepository,
  selection: ProjectionSelection,
  scheduleEvents: Publisher<Pick<ScheduleEventMap, 'schedule:task-deleted'>>,
): Promise<void> {
  const existingTasks = await findMatchingTasks(scheduleTaskRepository, selection);
  if (existingTasks.length === 0) {
    return;
  }

  const idsByIdentity = new Map<string, string[]>();
  for (const task of existingTasks) {
    const identityId = selection.identityId;
    const ids = idsByIdentity.get(identityId) ?? [];
    ids.push(task.id);
    idsByIdentity.set(identityId, ids);
  }
  for (const [identityId, ids] of idsByIdentity) {
    await scheduleTaskRepository.deleteBatch(identityId, ids);
  }
  for (const task of existingTasks) {
    scheduleEvents.send('schedule:task-deleted', { taskId: task.id });
  }
}

export async function replaceSelection(
  scheduleTaskRepository: IScheduleTaskRepository,
  plan: ProjectionPlan,
  scheduleEvents: Publisher<Pick<ScheduleEventMap, 'schedule:task-deleted'>>,
): Promise<void> {
  // R1-4：原子交换——先 upsert 新计划（save 为 upsert 语义），再删除
  // selection 中不在新计划里的旧任务。避免原"先删后存"在重建中途失败时
  // 留下半成品读模型（P0-02）。
  const existing = await findMatchingTasks(scheduleTaskRepository, plan.selection);
  const nextIds = new Set(plan.nextTasks.map((task) => task.id));

  if (plan.nextTasks.length > 0) {
    await scheduleTaskRepository.saveBatch(Array.from(plan.nextTasks));
  }

  const toDelete = existing.filter((task) => !nextIds.has(task.id));
  if (toDelete.length > 0) {
    const ids = toDelete.map((task) => task.id);
    await scheduleTaskRepository.deleteBatch(plan.selection.identityId, ids);
    for (const task of toDelete) {
      scheduleEvents.send('schedule:task-deleted', { taskId: task.id });
    }
  }
}
