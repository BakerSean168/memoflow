import { describe, expect, it, vi } from 'vitest';
import { fail, ok, type Result } from '@memoflow/contracts/result';
import type { TaskPlanClientDTO } from '@memoflow/contracts/task';
import { taskPlanQueryKeys } from '../../../platform/server-state/query-keys';
import { mountTaskComposable } from './taskQueryTestUtils';
import { useTaskPlanMutations } from './useTaskPlanMutations';

const SCOPE = 'identity-1';

function template(overrides: Partial<TaskPlanClientDTO> = {}): TaskPlanClientDTO {
  return {
    id: 'template-1' as TaskPlanClientDTO['id'],
    identityId: SCOPE as TaskPlanClientDTO['identityId'],
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
  } as TaskPlanClientDTO;
}

function entity(dto: TaskPlanClientDTO) {
  return { toDTO: () => dto };
}

function makeService(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  return {
    listTemplates: vi.fn(),
    getTemplate: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    activateTemplate: vi.fn(),
    pauseTemplate: vi.fn(),
    archiveTemplate: vi.fn(),
    ...overrides,
  };
}

describe('useTaskPlanMutations (plan §3.4)', () => {
  it('optimistic update patches matching list/detail entries and rolls back exactly on failure', async () => {
    const tpl = template();
    const service = makeService({
      updateTemplate: vi
        .fn()
        .mockResolvedValueOnce(ok(entity(template({ name: 'Published', version: 2 }))))
        .mockResolvedValueOnce(fail({ code: 'VALIDATION_ERROR', message: 'nope' })),
    });
    const { api, runtime } = mountTaskComposable(() => useTaskPlanMutations(), { service });

    const listKey = taskPlanQueryKeys.list(SCOPE, { page: 1, limit: 20 });
    const detailKey = taskPlanQueryKeys.detail(SCOPE, tpl.id);
    runtime.queryClient.setQueryData(listKey, { templates: [tpl], total: 1 });
    runtime.queryClient.setQueryData(detailKey, tpl);

    // Success: optimistic patch converges to the server-confirmed DTO everywhere.
    const okResult = await api.updateTemplateSafe(tpl.id, { name: 'Published' });
    expect(okResult).toBeTruthy();
    expect(runtime.queryClient.getQueryData(detailKey)?.name).toBe('Published');

    // Failure: exact restore of every snapshot key (to the pre-mutation 'Published' state).
    await api.updateTemplateSafe(tpl.id, { name: 'Broken' });
    expect(runtime.queryClient.getQueryData(detailKey)?.name).toBe('Published');
    const afterFailList = runtime.queryClient.getQueryData(listKey) as {
      templates: TaskPlanClientDTO[];
    };
    expect(afterFailList.templates[0].name).toBe('Published');
  });

  it('status mutations (activate/pause) apply optimistic status and restore on failure', async () => {
    const tpl = template();
    const service = makeService({
      activateTemplate: vi.fn().mockResolvedValue(ok(entity(template({ status: 'Active' })))),
      pauseTemplate: vi.fn().mockResolvedValue(fail({ code: 'VALIDATION_ERROR', message: 'nope' })),
    });
    const { api, runtime } = mountTaskComposable(() => useTaskPlanMutations(), { service });

    const detailKey = taskPlanQueryKeys.detail(SCOPE, tpl.id);
    const listKey = taskPlanQueryKeys.list(SCOPE, { page: 1, limit: 20 });
    runtime.queryClient.setQueryData(detailKey, tpl);
    runtime.queryClient.setQueryData(listKey, { templates: [tpl], total: 1 });

    await api.activateTemplateSafe(tpl.id);
    expect(runtime.queryClient.getQueryData(detailKey)?.status).toBe('Active');

    // Pause failure restores the pre-mutation status.
    await api.pauseTemplateSafe(tpl.id);
    expect(runtime.queryClient.getQueryData(detailKey)?.status).toBe('Active');
  });

  it('status mutation derives from the complete cached projection, not a bare {id,status} DTO', async () => {
    const tpl = template({ name: 'Full DTO', description: 'kept' });
    const service = makeService({
      pauseTemplate: vi.fn().mockResolvedValue(fail({ code: 'VALIDATION_ERROR', message: 'nope' })),
    });
    const { api, runtime } = mountTaskComposable(() => useTaskPlanMutations(), { service });

    // Only the list entry is cached — no detail key. A bare `{id,status}` patch would have
    // clobbered the list entry's other fields; the implementation must derive from the
    // complete cached projection and roll back residue-free.
    const listKey = taskPlanQueryKeys.list(SCOPE, { page: 1, limit: 20 });
    runtime.queryClient.setQueryData(listKey, { templates: [tpl], total: 1 });

    await api.pauseTemplateSafe(tpl.id);

    const listData = runtime.queryClient.getQueryData(listKey) as {
      templates: TaskPlanClientDTO[];
    };
    // The list entry keeps its full projection after the failed mutation.
    expect(listData.templates[0].name).toBe('Full DTO');
    expect(listData.templates[0].description).toBe('kept');
    expect(listData.templates[0].status).toBe('Active');
  });

  it('rolls back a newly-created detail key (optimistic patch residue) when the mutation fails', async () => {
    const tpl = template();
    const service = makeService({
      updateTemplate: vi
        .fn()
        .mockResolvedValue(fail({ code: 'VALIDATION_ERROR', message: 'nope' })),
    });
    const { api, runtime } = mountTaskComposable(() => useTaskPlanMutations(), { service });

    // Only the list entry is cached; no detail key exists before the mutation.
    const listKey = taskPlanQueryKeys.list(SCOPE, { page: 1, limit: 20 });
    const detailKey = taskPlanQueryKeys.detail(SCOPE, tpl.id);
    runtime.queryClient.setQueryData(listKey, { templates: [tpl], total: 1 });
    expect(runtime.queryClient.getQueryData(detailKey)).toBeUndefined();

    await api.updateTemplateSafe(tpl.id, { name: 'Broken' });

    // The optimistic patch may create a detail key, but a failed mutation must remove it.
    expect(runtime.queryClient.getQueryData(detailKey)).toBeUndefined();
  });

  it('create success keeps server-confirmed semantics (no fake id) and invalidates task-plan lists', async () => {
    const created = template({ id: 'template-new' as TaskPlanClientDTO['id'] });
    const service = makeService({
      createTemplate: vi
        .fn()
        .mockResolvedValue(
          ok({ template: entity(created), instanceCount: 7, todayInstanceCreated: true }),
        ),
    });
    const { api, runtime } = mountTaskComposable(() => useTaskPlanMutations(), { service });
    const invalidate = vi.spyOn(runtime.dispatcher, 'invalidate');

    const result = await api.createTemplateSafe({ name: 'New' } as never);
    expect(result?.instanceCount).toBe(7);
    expect(result?.todayInstanceCreated).toBe(true);
    expect(result?.template.toDTO().id).toBe('template-new');
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'task-plan', source: 'mutation' }),
    );
    // Plan §3.4: create seeds the detail key from the server response.
    const detailKey = taskPlanQueryKeys.detail(SCOPE, created.id);
    expect(runtime.queryClient.getQueryData(detailKey)?.id).toBe('template-new');
  });

  it('single delete removes the item from cache after server confirmation and invalidates detail', async () => {
    const tpl = template();
    const service = makeService({
      deleteTemplate: vi.fn().mockResolvedValue(ok(undefined)),
    });
    const { api, runtime } = mountTaskComposable(() => useTaskPlanMutations(), { service });

    const listKey = taskPlanQueryKeys.list(SCOPE, { page: 1, limit: 20 });
    const detailKey = taskPlanQueryKeys.detail(SCOPE, tpl.id);
    runtime.queryClient.setQueryData(listKey, { templates: [tpl], total: 1 });
    runtime.queryClient.setQueryData(detailKey, tpl);
    const invalidate = vi.spyOn(runtime.dispatcher, 'invalidate');

    const deleted = await api.deleteTemplateSafe(tpl.id);
    expect(deleted).toBe(true);
    const remaining = (
      runtime.queryClient.getQueryData(listKey) as {
        templates: TaskPlanClientDTO[];
      }
    ).templates;
    expect(remaining.some((t) => t.id === tpl.id)).toBe(false);
    expect(runtime.queryClient.getQueryData(detailKey)).toBeUndefined();
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'task-plan', source: 'mutation', entityId: tpl.id }),
    );
  });

  it('batch delete preserves partial success (first failure stops, confirmed removals stay)', async () => {
    const first = template();
    const second = template({ id: 'template-2' as TaskPlanClientDTO['id'] });
    const service = makeService({
      deleteTemplate: vi
        .fn()
        .mockResolvedValueOnce(ok(undefined))
        .mockResolvedValueOnce(fail({ code: 'VALIDATION_ERROR', message: 'Cannot delete' })),
    });
    const { api, runtime } = mountTaskComposable(() => useTaskPlanMutations(), { service });

    const listKey = taskPlanQueryKeys.list(SCOPE, { page: 1, limit: 20 });
    runtime.queryClient.setQueryData(listKey, { templates: [first, second], total: 2 });

    const deleted = await api.deleteTemplatesSafe([first.id, second.id]);
    expect(deleted).toBe(false);
    expect(service.deleteTemplate).toHaveBeenCalledTimes(2);
    const remaining = (
      runtime.queryClient.getQueryData(listKey) as {
        templates: TaskPlanClientDTO[];
      }
    ).templates;
    // First confirmed removal stays gone; the failed second item is restored by invalidation.
    expect(remaining.some((t) => t.id === first.id)).toBe(false);
  });

  it('resolves identityScope at mutation begin and carries it through callbacks (P1-2)', async () => {
    const tpl = template();
    const service = makeService({
      updateTemplate: vi.fn().mockResolvedValue(ok(entity(template({ name: 'Confirmed' })))),
    });
    const { api, runtime } = mountTaskComposable(() => useTaskPlanMutations(), { service });

    const detailKey = taskPlanQueryKeys.detail(SCOPE, tpl.id);
    const listKey = taskPlanQueryKeys.list(SCOPE, { page: 1, limit: 20 });
    runtime.queryClient.setQueryData(listKey, { templates: [tpl], total: 1 });
    const invalidate = vi.spyOn(runtime.dispatcher, 'invalidate');

    await api.updateTemplateSafe(tpl.id, { name: 'Renamed' });

    // The mutation patched and invalidated the begin-scope identity.
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ identityScope: SCOPE, target: 'task-plan' }),
    );
    expect(runtime.queryClient.getQueryData(detailKey)?.name).toBe('Confirmed');
    expect(runtime.queryClient.getQueryData(listKey)?.templates?.[0].name).toBe('Confirmed');
  });

  it('batch delete patches the identity captured at mutation begin even when a competing batch for the switched identity completes first (P1-2)', async () => {
    const tpl = template();
    let resolveA!: (result: Result<void>) => void;
    let resolveB!: (result: Result<void>) => void;
    const pendingA = new Promise<Result<void>>((resolve) => {
      resolveA = resolve;
    });
    const pendingB = new Promise<Result<void>>((resolve) => {
      resolveB = resolve;
    });
    const service = makeService({
      deleteTemplate: vi.fn().mockReturnValueOnce(pendingA).mockReturnValueOnce(pendingB),
    });
    // Batch A begins at identity A; the identity then switches to B while it is pending, and a
    // competing batch B for the new identity starts — its onMutate overwrites the pre-fix shared
    // scope before batch A's mutationFn reads it — and completes before batch A resolves. Batch A
    // must still patch the identity it began with (A), not the scope the competing batch wrote.
    let currentIdentity = 'identity-a';
    const { api, runtime } = mountTaskComposable(() => useTaskPlanMutations(), {
      service,
      identityScope: () => currentIdentity,
    });

    const listKeyA = taskPlanQueryKeys.list('identity-a', { page: 1, limit: 20 });
    const listKeyB = taskPlanQueryKeys.list('identity-b', { page: 1, limit: 20 });
    runtime.queryClient.setQueryData(listKeyA, { templates: [tpl], total: 1 });
    runtime.queryClient.setQueryData(listKeyB, { templates: [tpl], total: 1 });

    const batchA = api.deleteTemplatesSafe([tpl.id]);
    // The identity switches while batch A is pending; a competing batch for the new identity
    // begins and completes before batch A resolves.
    currentIdentity = 'identity-b';
    const batchB = api.deleteTemplatesSafe([tpl.id]);
    resolveB(ok(undefined));
    await batchB;
    resolveA(ok(undefined));
    await batchA;

    // Batch A removed the template from the identity it began with (A)…
    const remainingA = runtime.queryClient.getQueryData(listKeyA) as {
      templates: TaskPlanClientDTO[];
    };
    expect(remainingA.templates.some((t) => t.id === tpl.id)).toBe(false);
    // …and batch B from its own identity (B). Neither cache is left with a stale entry.
    const remainingB = runtime.queryClient.getQueryData(listKeyB) as {
      templates: TaskPlanClientDTO[];
    };
    expect(remainingB.templates.some((t) => t.id === tpl.id)).toBe(false);
  });

  it('concurrent batch deletes for different identities do not cross-contaminate (P1-2)', async () => {
    const tplA = template({ id: 'template-a' as TaskPlanClientDTO['id'] });
    const tplB = template({ id: 'template-b' as TaskPlanClientDTO['id'] });
    let resolveA!: (result: Result<void>) => void;
    let resolveB!: (result: Result<void>) => void;
    const pendingA = new Promise<Result<void>>((resolve) => {
      resolveA = resolve;
    });
    const pendingB = new Promise<Result<void>>((resolve) => {
      resolveB = resolve;
    });
    const service = makeService({
      deleteTemplate: vi.fn().mockReturnValueOnce(pendingA).mockReturnValueOnce(pendingB),
    });
    // Both identities cache both templates so a misdirected removal is observable: A's batch
    // must remove only tplA from A's cache, and B's batch only tplB from B's cache.
    let currentIdentity = 'identity-a';
    const { api, runtime } = mountTaskComposable(() => useTaskPlanMutations(), {
      service,
      identityScope: () => currentIdentity,
    });

    const listKeyA = taskPlanQueryKeys.list('identity-a', { page: 1, limit: 20 });
    const listKeyB = taskPlanQueryKeys.list('identity-b', { page: 1, limit: 20 });
    runtime.queryClient.setQueryData(listKeyA, { templates: [tplA, tplB], total: 2 });
    runtime.queryClient.setQueryData(listKeyB, { templates: [tplA, tplB], total: 2 });

    // The identity flips to B before the second batch begins; each invocation must keep the
    // scope captured at ITS OWN begin, not a shared value the other invocation overwrote.
    const batchA = api.deleteTemplatesSafe([tplA.id]);
    currentIdentity = 'identity-b';
    const batchB = api.deleteTemplatesSafe([tplB.id]);
    resolveA(ok(undefined));
    resolveB(ok(undefined));
    await Promise.all([batchA, batchB]);

    const remainingA = runtime.queryClient.getQueryData(listKeyA) as {
      templates: TaskPlanClientDTO[];
    };
    const remainingB = runtime.queryClient.getQueryData(listKeyB) as {
      templates: TaskPlanClientDTO[];
    };
    // A's batch removed only tplA from A's cache (its own begin identity)…
    expect(remainingA.templates.some((t) => t.id === tplA.id)).toBe(false);
    expect(remainingA.templates.some((t) => t.id === tplB.id)).toBe(true);
    // …and B's batch removed only tplB from B's cache — tplA stays in B because A's batch
    // must never touch B's identity cache, even while both batches are in flight together.
    expect(remainingB.templates.some((t) => t.id === tplB.id)).toBe(false);
    expect(remainingB.templates.some((t) => t.id === tplA.id)).toBe(true);
  });
});
