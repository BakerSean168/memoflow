import { describe, expect, it, vi } from 'vitest';
import { Goal, GoalRecord } from '../../../domain';
import { GoalWorkspaceQueryService } from '../goal-workspace-query.service';
import type {
  GoalWorkspaceKnowledgeContextReadPort,
  GoalWorkspaceKnowledgeRelationReadPort,
  GoalWorkspaceTaskContextReadPort,
} from '../../ports/goal-workspace-read.ports';

function createGoal() {
  return Goal.create({
    identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440001' as never,
    name: 'Ship Goal Workspace',
    summary: 'Compose owner-controlled context',
    startDate: null,
    target: null,
    reminderConfig: null,
  });
}

function createHarness() {
  const goal = createGoal();
  const goalRepository = {
    findByIdForIdentity: vi.fn().mockResolvedValue(goal),
  } as never;
  const goalRecordRepository = {
    findByGoalId: vi.fn().mockResolvedValue([]),
    findByKeyResultId: vi.fn().mockResolvedValue([]),
  } as never;
  const taskContextReadPort: GoalWorkspaceTaskContextReadPort = {
    listTasksByGoal: vi.fn().mockResolvedValue({
      items: [
        {
          taskPlanId: 'task-1',
          name: 'Implement workspace',
          status: 'Active',
          outcome: 'Open',
          keyResultId: null,
          hasContribution: false,
        },
      ],
      total: 1,
      limit: 2,
      offset: 0,
    }),
    listTasksByKeyResult: vi.fn().mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 }),
    getTaskGoalContextSummary: vi.fn().mockResolvedValue({
      total: 1,
      active: 1,
      completed: 0,
      goalLevel: 1,
      byKeyResult: [],
    }),
  };
  const knowledgeRelationReadPort: GoalWorkspaceKnowledgeRelationReadPort = {
    listEdgeRefsForGoal: vi.fn().mockResolvedValue({
      items: [
        {
          relationId: 'relation-1',
          goalId: goal.id,
          documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440090',
          createdAt: 10,
        },
        {
          relationId: 'relation-2',
          goalId: goal.id,
          documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440099',
          createdAt: 11,
        },
      ],
      total: 2,
      limit: 2,
      offset: 0,
    } as never),
  };
  const knowledgeContextReadPort: GoalWorkspaceKnowledgeContextReadPort = {
    resolveForWorkspace: vi.fn().mockImplementation(async (_identityId, documentId) => {
      if (String(documentId).endsWith('0099')) return null;
      return {
        knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440091' as never,
        documentId,
        title: 'Workspace architecture',
        excerpt: 'Owner-provided display projection',
        relativePath: 'architecture/workspace.md',
        updatedAt: 20,
      };
    }),
  };
  const service = new GoalWorkspaceQueryService({
    goalRepository,
    goalRecordRepository,
    taskContextReadPort,
    knowledgeRelationReadPort,
    knowledgeContextReadPort,
  });
  return {
    goal,
    goalRepository,
    goalRecordRepository,
    taskContextReadPort,
    knowledgeRelationReadPort,
    knowledgeContextReadPort,
    service,
  };
}

describe('GoalWorkspaceQueryService', () => {
  it('composes Goal authority with bounded Task/Knowledge previews and preserves missing stable edges', async () => {
    const h = createHarness();
    const result = await h.service.getWorkspace(
      'IdentityId_550e8400-e29b-41d4-a716-446655440001',
      String(h.goal.id),
      {
        previewLimit: 2,
        recentLimit: 3,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.goal.name).toBe('Ship Goal Workspace');
    expect(result.data.goal.reviews).toBeNull();
    expect(result.data.taskContext).toMatchObject({
      availability: 'Available',
      summary: { total: 1, active: 1 },
    });
    expect(result.data.knowledgeContext).toMatchObject({
      availability: 'Available',
      summary: { total: 2 },
    });
    if (result.data.knowledgeContext.availability === 'Available') {
      expect(result.data.knowledgeContext.preview.map((item) => item.state)).toEqual([
        'Resolved',
        'Missing',
      ]);
      expect(result.data.knowledgeContext.preview[1]?.documentId).toContain('kdoc_');
    }
    expect(result.data.recentProgress).toEqual([]);
    expect(result.data.recentReviews).toEqual([]);
    expect(h.taskContextReadPort.listTasksByGoal).toHaveBeenCalledWith(
      'IdentityId_550e8400-e29b-41d4-a716-446655440001',
      String(h.goal.id),
      { limit: 2, offset: 0 },
    );
  });

  it('checks Goal ownership before any external owner read', async () => {
    const h = createHarness();
    vi.mocked(h.goalRepository.findByIdForIdentity).mockResolvedValue(null);

    const result = await h.service.getWorkspace(
      'IdentityId_550e8400-e29b-41d4-a716-446655440002',
      String(h.goal.id),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(h.taskContextReadPort.getTaskGoalContextSummary).not.toHaveBeenCalled();
    expect(h.knowledgeRelationReadPort.listEdgeRefsForGoal).not.toHaveBeenCalled();
    expect(h.knowledgeContextReadPort.resolveForWorkspace).not.toHaveBeenCalled();
  });

  it('degrades external preview context independently when Task/Knowledge owners are unavailable', async () => {
    const h = createHarness();
    vi.mocked(h.taskContextReadPort.getTaskGoalContextSummary).mockRejectedValue(
      new Error('offline'),
    );
    vi.mocked(h.knowledgeRelationReadPort.listEdgeRefsForGoal).mockRejectedValue(
      new Error('offline'),
    );

    const result = await h.service.getWorkspace(
      'IdentityId_550e8400-e29b-41d4-a716-446655440001',
      String(h.goal.id),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.taskContext).toEqual({
      availability: 'Unavailable',
      summary: null,
      preview: [],
    });
    expect(result.data.knowledgeContext).toEqual({
      availability: 'Unavailable',
      summary: null,
      preview: [],
    });
  });

  it('fails full external collections explicitly instead of returning a partial page', async () => {
    const h = createHarness();
    vi.mocked(h.taskContextReadPort.listTasksByGoal).mockRejectedValue(new Error('offline'));
    vi.mocked(h.knowledgeContextReadPort.resolveForWorkspace).mockRejectedValue(
      new Error('offline'),
    );

    await expect(
      h.service.listTasks('IdentityId_550e8400-e29b-41d4-a716-446655440001', String(h.goal.id), {}),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
    await expect(
      h.service.listKnowledge(
        'IdentityId_550e8400-e29b-41d4-a716-446655440001',
        String(h.goal.id),
        { limit: 2, offset: 0 },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
  });

  it('rejects a KR-scoped Task query when the KR is not owned by this Goal', async () => {
    const h = createHarness();
    const result = await h.service.listTasks(
      'IdentityId_550e8400-e29b-41d4-a716-446655440001',
      String(h.goal.id),
      {
        keyResultId: 'foreign-kr',
      },
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(h.taskContextReadPort.listTasksByKeyResult).not.toHaveBeenCalled();
  });

  it('returns bounded recent Goal-owned progress and review context without duplicating review authority under goal', async () => {
    const h = createHarness();
    const keyResult = h.goal.createAndAddKeyResult({
      title: 'Workspace shipped',
      aggregationMethod: 'Last',
      initialValue: 0,
      currentValue: 7,
      targetValue: 10,
      weight: 1,
      unit: 'points',
    });
    const review = h.goal.createAndAddReview({
      reflection: 'The composed read model is coherent.',
      systemContext: {
        windowStartAt: 1,
        windowEndAt: 2,
        overallProgress: { startPercentage: 50, endPercentage: 70, deltaPercentage: 20 },
        keyResults: [],
        summary: { recordCount: 1, manualRecordCount: 1, taskContributionCount: 0 },
      },
    });
    const record = GoalRecord.create({
      keyResultId: keyResult.id,
      identityId: h.goal.identityId,
      value: 7,
      note: 'Reached first usable workspace',
      recordedAt: 3 as never,
    });
    vi.mocked(h.goalRecordRepository.findByGoalId).mockResolvedValue([record]);

    const result = await h.service.getWorkspace(
      'IdentityId_550e8400-e29b-41d4-a716-446655440001',
      String(h.goal.id),
      { recentLimit: 1 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.goal.reviews).toBeNull();
    expect(result.data.recentProgress).toHaveLength(1);
    expect(result.data.recentProgress[0]).toMatchObject({
      value: 7,
      comment: 'Reached first usable workspace',
    });
    expect(result.data.recentReviews).toHaveLength(1);
    expect(result.data.recentReviews[0]).toMatchObject({
      id: review.id,
      reflection: 'The composed read model is coherent.',
    });
  });

  it('returns available empty context instead of treating an empty owner result as unavailable', async () => {
    const h = createHarness();
    vi.mocked(h.taskContextReadPort.getTaskGoalContextSummary).mockResolvedValue({
      total: 0,
      active: 0,
      completed: 0,
      goalLevel: 0,
      byKeyResult: [],
    });
    vi.mocked(h.taskContextReadPort.listTasksByGoal).mockResolvedValue({
      items: [],
      total: 0,
      limit: 5,
      offset: 0,
    });
    vi.mocked(h.knowledgeRelationReadPort.listEdgeRefsForGoal).mockResolvedValue({
      items: [],
      total: 0,
      limit: 5,
      offset: 0,
    });

    const result = await h.service.getWorkspace(
      'IdentityId_550e8400-e29b-41d4-a716-446655440001',
      String(h.goal.id),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.taskContext).toEqual({
      availability: 'Available',
      summary: { total: 0, active: 0, completed: 0, goalLevel: 0, byKeyResult: [] },
      preview: [],
    });
    expect(result.data.knowledgeContext).toEqual({
      availability: 'Available',
      summary: { total: 0 },
      preview: [],
    });
  });
});
