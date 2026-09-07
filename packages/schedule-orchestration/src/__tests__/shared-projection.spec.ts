import { describe, expect, it, vi } from 'vitest';
import { SourceModule } from '@memoflow/contracts/schedule';
import type { IScheduleTaskRepository, ScheduleTask } from '@memoflow/scheduler';
import type { Publisher } from '@memoflow/utils/domain';
import type { ScheduleEventMap } from '@memoflow/contracts/schedule';
import { replaceSelection } from '../projectors/shared-projection';

function createTask(id: string, templateId: string, title: string): ScheduleTask {
  return {
    id,
    identityId: 'identity-1',
    sourceModule: SourceModule.Task,
    sourceEntityId: id,
    title,
    metadata: { payload: { templateId } },
    scheduledAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as unknown as ScheduleTask;
}

function createRepo(existing: ScheduleTask[]): {
  repo: IScheduleTaskRepository;
  saved: ScheduleTask[];
  deleted: { identityId: string; ids: string[] }[];
} {
  const saved: ScheduleTask[] = [];
  const deleted: { identityId: string; ids: string[] }[] = [];
  const repo = {
    save: vi.fn(),
    findById: vi.fn(),
    findByIdForIdentity: vi.fn(),
    deleteById: vi.fn(),
    findByIdentityId: vi.fn(),
    findBySourceModule: vi.fn().mockResolvedValue(existing),
    findBySourceEntity: vi.fn().mockResolvedValue(existing),
    findByStatus: vi.fn(),
    findEnabled: vi.fn(),
    findDueTasksForExecution: vi.fn(),
    query: vi.fn(),
    count: vi.fn(),
    saveBatch: vi.fn(async (tasks: ScheduleTask[]) => saved.push(...tasks)),
    deleteBatch: vi.fn(async (identityId: string, ids: string[]) => {
      deleted.push({ identityId, ids });
    }),
    withTransaction: vi.fn(),
  } as unknown as IScheduleTaskRepository;
  return { repo, saved, deleted };
}

function createSender() {
  const sent: Array<{ taskId: string }> = [];
  const publisher: Publisher<Pick<ScheduleEventMap, 'schedule:task-deleted'>> = {
    send(event, payload) {
      if (event === 'schedule:task-deleted') sent.push(payload as { taskId: string });
    },
  };
  return { sent, publisher };
}

describe('shared-projection replaceSelection (R1-4 atomic swap)', () => {
  it('upserts the new plan first, then deletes only stale matching tasks', async () => {
    const stale = createTask('t-stale', 'T1', 'Old');
    const unrelated = createTask('t-other', 'T2', 'Other');
    const next = createTask('t-next', 'T1', 'Next');
    const { repo, saved, deleted } = createRepo([stale, unrelated]);
    const { sent, publisher } = createSender();

    await replaceSelection(
      repo,
      {
        selection: {
          sourceModule: SourceModule.Task,
          identityId: 'identity-1',
          matches(task: ScheduleTask) {
            return task.metadata.payload['templateId'] === 'T1';
          },
        },
        nextTasks: [next],
      },
      publisher,
    );

    // 新计划先 upsert（save 为 upsert 语义）。
    expect(saved).toEqual([next]);
    // 只删除 selection 内不在新计划里的旧任务；无关任务保留。
    expect(deleted).toEqual([{ identityId: 'identity-1', ids: ['t-stale'] }]);
    expect(sent).toEqual([{ taskId: 't-stale' }]);
  });

  it('does not emit deletes when the new plan covers all existing tasks', async () => {
    const current = createTask('t-keep', 'T1', 'Keep');
    const next = createTask('t-keep', 'T1', 'Updated');
    const { repo, saved, deleted } = createRepo([current]);
    const { sent, publisher } = createSender();

    await replaceSelection(
      repo,
      {
        selection: {
          sourceModule: SourceModule.Task,
          identityId: 'identity-1',
          matches() {
            return true;
          },
        },
        nextTasks: [next],
      },
      publisher,
    );

    expect(saved).toEqual([next]);
    expect(deleted).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });
});
