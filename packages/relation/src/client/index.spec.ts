import { describe, expect, it, vi } from 'vitest';
import { RelationChannels } from '@memoflow/contracts/electron';
import { GoalKnowledgeLinkReqSchema } from '@memoflow/contracts/relation';
import { createGoalKnowledgeHttpClient, createGoalKnowledgeIpcClient } from './index';

const request = GoalKnowledgeLinkReqSchema.parse({
  goalId: 'IGoalId_550e8400-e29b-41d4-a716-446655440000',
  knowledgeDocument: {
    knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440091',
    documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440090',
  },
});

describe('GoalKnowledge clients', () => {
  it('uses the narrow HTTP product surface', async () => {
    const http = {
      get: vi.fn(async () => ({ ok: true, data: [] })),
      post: vi.fn(async () => ({ ok: true, data: [] })),
      delete: vi.fn(async () => ({ ok: true, data: { unlinked: true } })),
    };
    const client = createGoalKnowledgeHttpClient(http as never);
    await client.linkGoalKnowledge(request);
    await client.unlinkGoalKnowledge(request);
    await client.listGoalKnowledge({ goalId: request.goalId });
    await client.listGoalsForKnowledge({ knowledgeDocument: request.knowledgeDocument });
    expect(http.post).toHaveBeenCalledWith('/goal-knowledge', request);
    expect(http.delete).toHaveBeenCalledWith('/goal-knowledge', { data: request });
    expect(http.get).toHaveBeenCalledWith(`/goal-knowledge/${request.goalId}`);
    expect(http.post).toHaveBeenCalledWith('/goal-knowledge/reverse', {
      knowledgeDocument: request.knowledgeDocument,
    });
  });

  it('uses dedicated IPC channels rather than Goal channels', async () => {
    const invoke = vi.fn(async (_channel: string, _request?: unknown) => ({ ok: true, data: [] }));
    const ipc = { invoke };
    const client = createGoalKnowledgeIpcClient(ipc as never);
    await client.linkGoalKnowledge(request);
    await client.unlinkGoalKnowledge(request);
    await client.listGoalKnowledge({ goalId: request.goalId });
    await client.listGoalsForKnowledge({ knowledgeDocument: request.knowledgeDocument });
    expect(invoke.mock.calls.map((call) => call[0])).toEqual([
      RelationChannels.GOAL_KNOWLEDGE_LINK,
      RelationChannels.GOAL_KNOWLEDGE_UNLINK,
      RelationChannels.GOAL_KNOWLEDGE_LIST,
      RelationChannels.GOAL_KNOWLEDGE_REVERSE_LIST,
    ]);
  });
});
