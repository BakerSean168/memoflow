import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaskTemplateClientDTO } from '@memoflow/contracts/task';
import { createTestServerStateRuntime } from '../../../platform/server-state';
import { taskTemplateQueryKeys } from '../../../platform/server-state/query-keys';
import {
  patchTaskTemplateEverywhere,
  restoreTaskTemplateSnapshot,
  snapshotTaskTemplateCache,
  waitForTaskTemplateQuery,
} from './taskTemplateCache';

const SCOPE = 'identity-1';

function template(overrides: Partial<TaskTemplateClientDTO> = {}): TaskTemplateClientDTO {
  return {
    id: 'template-1' as TaskTemplateClientDTO['id'],
    identityId: SCOPE as TaskTemplateClientDTO['identityId'],
    name: 'Draft',
    description: null,
    timeConfig: { timeType: 'AllDay', startDate: 1 },
    recurrenceRule: null,
    reminderConfig: null,
    importance: 'Moderate',
    tags: [],
    color: null,
    status: 'Active',
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    goalBinding: null,
    instanceCount: 0,
    completedInstanceCount: 0,
    pendingInstanceCount: 0,
    ...overrides,
  } as TaskTemplateClientDTO;
}

describe('taskTemplateCache — snapshot/restore residue-free rollback (P1-1)', () => {
  afterEach(() => vi.useRealTimers());

  it('restore removes a detail key that the optimistic patch created', () => {
    const runtime = createTestServerStateRuntime();
    const tpl = template();
    const listKey = taskTemplateQueryKeys.list(SCOPE, { page: 1, limit: 20 });
    const detailKey = taskTemplateQueryKeys.detail(SCOPE, tpl.id);
    runtime.queryClient.setQueryData(listKey, { templates: [tpl], total: 1 });
    expect(runtime.queryClient.getQueryData(detailKey)).toBeUndefined();

    // The optimistic mutation snapshots, then patches everywhere (which creates detail).
    const snapshot = snapshotTaskTemplateCache(runtime.queryClient, SCOPE);
    patchTaskTemplateEverywhere(runtime.queryClient, SCOPE, { ...tpl, name: 'Optimistic' });
    expect(runtime.queryClient.getQueryData(detailKey)?.name).toBe('Optimistic');

    // Rollback restores the snapshot and drops the newly-created detail key.
    restoreTaskTemplateSnapshot(runtime.queryClient, SCOPE, snapshot);
    expect(runtime.queryClient.getQueryData(detailKey)).toBeUndefined();
    const listData = runtime.queryClient.getQueryData(listKey) as {
      templates: TaskTemplateClientDTO[];
    };
    expect(listData.templates[0].name).toBe('Draft');
  });

  it('restore keeps pre-existing keys that were not touched by the optimistic patch', () => {
    const runtime = createTestServerStateRuntime();
    const tpl = template();
    const listKey = taskTemplateQueryKeys.list(SCOPE, { page: 1, limit: 20 });
    const otherKey = taskTemplateQueryKeys.list(SCOPE, { page: 2, limit: 20 });
    runtime.queryClient.setQueryData(listKey, { templates: [tpl], total: 1 });
    runtime.queryClient.setQueryData(otherKey, { templates: [], total: 0 });

    const snapshot = snapshotTaskTemplateCache(runtime.queryClient, SCOPE);
    patchTaskTemplateEverywhere(runtime.queryClient, SCOPE, { ...tpl, name: 'Optimistic' });
    restoreTaskTemplateSnapshot(runtime.queryClient, SCOPE, snapshot);

    // The untouched page-2 list key survives the rollback.
    expect(runtime.queryClient.getQueryData(otherKey)).toEqual({ templates: [], total: 0 });
  });
});

describe('taskTemplateCache — waitForTaskTemplateQuery terminal states (P2-1)', () => {
  afterEach(() => vi.useRealTimers());

  it('resolves when the query reaches success', async () => {
    const runtime = createTestServerStateRuntime();
    const key = taskTemplateQueryKeys.list(SCOPE, { page: 1, limit: 20 });
    const fetch = vi.fn(async () => ({ templates: [], total: 0 }));
    runtime.queryClient.setQueryData(key, { templates: [], total: 0 });

    await expect(waitForTaskTemplateQuery(runtime.queryClient, key)).resolves.toBeUndefined();
    void fetch;
  });

  it('resolves (settles) when the query reaches error instead of hanging forever', async () => {
    const runtime = createTestServerStateRuntime();
    const key = taskTemplateQueryKeys.list(SCOPE, { page: 1, limit: 20 });
    await runtime.queryClient
      .fetchQuery({
        queryKey: key,
        queryFn: async () => {
          throw new Error('backend down');
        },
      })
      .catch(() => {
        // fetchQuery rejects on error; the query itself is now in the error state.
      });

    await expect(waitForTaskTemplateQuery(runtime.queryClient, key)).resolves.toBeUndefined();
  });

  it('resolves when the query is removed before reaching success', async () => {
    const runtime = createTestServerStateRuntime();
    const key = taskTemplateQueryKeys.list(SCOPE, { page: 1, limit: 20 });
    // Create the query (still fetching), then remove it — the waiter must settle.
    const waiter = waitForTaskTemplateQuery(runtime.queryClient, key);
    void runtime.queryClient.prefetchQuery({
      queryKey: key,
      queryFn: async () => new Promise(() => {}), // never resolves → stays pending
    });
    runtime.queryClient.removeQueries({ queryKey: key });
    await expect(waiter).resolves.toBeUndefined();
  });
});
