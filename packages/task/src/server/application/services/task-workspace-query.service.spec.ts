import { describe, expect, it, vi } from 'vitest';
import { error, ok } from '@memoflow/contracts/result';
import { aOneTimeTask, TASK_TEST_USER_TIME_CONTEXT_PORT } from '../../../testing/task.fixture';
import { TaskWorkspaceQueryService } from './task-workspace-query.service';

describe('TaskWorkspaceQueryService', () => {
  function harness() {
    const plan = aOneTimeTask();
    const occurrences = { getStatusCountsForPlan: vi.fn().mockResolvedValue({ total: 10, completed: 4, missed: 1, skipped: 1, pending: 3, inProgress: 1 }), findRecentByPlan: vi.fn().mockResolvedValue([]) };
    const service = new TaskWorkspaceQueryService({
      taskPlanRepository: { findByIdForIdentity: vi.fn().mockResolvedValue(plan) } as never,
      taskOccurrenceRepository: occurrences as never,
      userTimeContextPort: TASK_TEST_USER_TIME_CONTEXT_PORT,
      goalReadPort: { getGoal: vi.fn() },
      knowledgeRelationReadPort: { listEdgeRefsForTask: vi.fn().mockResolvedValue({ items: [], total: 0, limit: 5, offset: 0 }) },
      knowledgeContextReadPort: { resolveForWorkspace: vi.fn() },
    });
    return { service, plan, occurrences };
  }

  it('returns NOT_FOUND before reading workspace data', async () => {
    const { service, occurrences } = harness();
    (service as never as { deps: { taskPlanRepository: { findByIdForIdentity: unknown } } }).deps.taskPlanRepository.findByIdForIdentity = vi.fn().mockResolvedValue(null);
    const result = await service.getWorkspace('identity-1', 'missing');
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(occurrences.getStatusCountsForPlan).not.toHaveBeenCalled();
  });

  it('uses all-time status counts and forwards the bounded recent limit', async () => {
    const { service, occurrences } = harness();
    const result = await service.getWorkspace('identity-1', 'task-1', { recentLimit: 3 });
    expect(result).toMatchObject({ ok: true, data: { occurrenceSummary: { total: 10, completed: 4, completionRate: 40 } } });
    expect(occurrences.findRecentByPlan).toHaveBeenCalledWith('task-1', 'identity-1', 3);
  });

  it('maps goal NOT_FOUND and provider failures to distinct fail-soft states while retaining ids', async () => {
    const { service } = harness();
    const goalReadPort = (service as never as { deps: { goalReadPort: { getGoal: ReturnType<typeof vi.fn> } } }).deps.goalReadPort;
    const binding = { goalId: 'IGoalId_550e8400-e29b-41d4-a716-446655440000', keyResultId: 'IKeyResultId_550e8400-e29b-41d4-a716-446655440001' };
    await expect((service as never as { loadGoalContext: Function }).loadGoalContext('i', binding)).resolves.toMatchObject({ availability: 'Unavailable', goalId: binding.goalId, keyResultId: binding.keyResultId });
    goalReadPort.getGoal.mockResolvedValue(error('NOT_FOUND', 'gone'));
    await expect((service as never as { loadGoalContext: Function }).loadGoalContext('i', binding)).resolves.toMatchObject({ availability: 'Missing', goalId: binding.goalId, keyResultId: binding.keyResultId });
    goalReadPort.getGoal.mockResolvedValue(ok({ keyResults: [] }));
    goalReadPort.getGoal.mockResolvedValue(ok({ name: 'Goal', keyResults: [{ id: binding.keyResultId, title: 'KR' }] }));
    await expect((service as never as { loadGoalContext: Function }).loadGoalContext('i', binding)).resolves.toMatchObject({ availability: 'Available', goalId: binding.goalId, keyResultId: binding.keyResultId, keyResult: { title: 'KR' } });
  });

  it('keeps valid linked notes when another document resolver fails', async () => {
    const { service } = harness();
    const deps = (service as never as { deps: { knowledgeRelationReadPort: { listEdgeRefsForTask: ReturnType<typeof vi.fn> }; knowledgeContextReadPort: { resolveForWorkspace: ReturnType<typeof vi.fn> } } }).deps;
    deps.knowledgeRelationReadPort.listEdgeRefsForTask.mockResolvedValue({ items: [
      { relationId: 'r1', documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440000', createdAt: 1 },
      { relationId: 'r2', documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440001', createdAt: 2 },
    ], total: 2, limit: 5, offset: 0 });
    deps.knowledgeContextReadPort.resolveForWorkspace.mockImplementation(async (_identity, documentId) => {
      if (String(documentId).endsWith('001')) throw new Error('provider unavailable');
      return { knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440002', title: 'Note', excerpt: 'body', relativePath: 'renamed.md', updatedAt: 3 };
    });
    const notes = await (service as never as { loadNotes: Function }).loadNotes('i', 'task-1', 5);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ state: 'Resolved', documentRef: { documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440000' } });
    expect(notes[1]).toMatchObject({ state: 'Missing', documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440001' });
  });
});
