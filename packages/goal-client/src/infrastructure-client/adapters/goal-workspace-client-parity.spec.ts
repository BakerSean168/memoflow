import { describe, expect, it, vi } from 'vitest';
import { GoalWorkspaceChannels } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import { GoalHttpAdapter } from './http/goal-http.adapter';
import { GoalIpcAdapter } from './ipc/goal-ipc.adapter';

const GOAL_ID = 'IGoalId_550e8400-e29b-41d4-a716-446655440000';

describe('Goal Workspace client transport parity', () => {
  it('HTTP uses the canonical Goal Workspace read routes', async () => {
    const get = vi.fn().mockResolvedValue(ok({}));
    const adapter = new GoalHttpAdapter({ get } as never);

    await adapter.getGoalWorkspace(GOAL_ID, { previewLimit: 3, recentLimit: 4 });
    await adapter.getGoalWorkspaceTasks(GOAL_ID, { limit: 7, offset: 2, keyResultId: 'kr-1' });
    await adapter.getGoalWorkspaceKnowledge(GOAL_ID, { limit: 8, offset: 3 });

    expect(get.mock.calls).toEqual([
      [`/goals/${GOAL_ID}/workspace`, { params: { previewLimit: 3, recentLimit: 4 } }],
      [
        `/goals/${GOAL_ID}/workspace/tasks`,
        { params: { limit: 7, offset: 2, keyResultId: 'kr-1' } },
      ],
      [`/goals/${GOAL_ID}/workspace/knowledge`, { params: { limit: 8, offset: 3 } }],
    ]);
  });

  it('IPC uses dedicated workspace channels with the same invocation payloads', async () => {
    const invoke = vi.fn().mockResolvedValue(ok({}));
    const adapter = new GoalIpcAdapter({ invoke } as never);

    await adapter.getGoalWorkspace(GOAL_ID, { previewLimit: 3, recentLimit: 4 });
    await adapter.getGoalWorkspaceTasks(GOAL_ID, { limit: 7, offset: 2, keyResultId: 'kr-1' });
    await adapter.getGoalWorkspaceKnowledge(GOAL_ID, { limit: 8, offset: 3 });

    expect(invoke.mock.calls).toEqual([
      [GoalWorkspaceChannels.GET, { goalId: GOAL_ID, previewLimit: 3, recentLimit: 4 }],
      [GoalWorkspaceChannels.TASKS, { goalId: GOAL_ID, limit: 7, offset: 2, keyResultId: 'kr-1' }],
      [GoalWorkspaceChannels.KNOWLEDGE, { goalId: GOAL_ID, limit: 8, offset: 3 }],
    ]);
  });
});
