import { describe, expect, it } from 'vitest';
import { WorkspaceEventSchema } from './workspace-event.dto';
import { GoalPlanGoalSchema, GoalPlanningSeedSchema } from './ai-goal-create-workflow.dto';
import { CreateGoalSchema } from '@memoflow/goal-contracts';

describe('Workspace workflow event contract', () => {
  const action = {
    sequence: 1,
    command: { actionId: 'name', revision: 1, operation: 'goal.setName', value: 'Plan' },
  };
  const event = {
    type: 'workflow.updated',
    eventId: 'run:2',
    cursor: 'cursor',
    resourceVersion: 2,
    data: {
      kind: 'goal.create',
      runId: 'run',
      conversationId: 'thread',
      status: 'running',
      resourceVersion: 2,
      createdAt: 1,
      updatedAt: 2,
    },
    actions: [action],
    baseActionSequence: 0,
    lastActionSequence: 1,
  };

  it('requires matching versions and a contiguous action delta', () => {
    expect(WorkspaceEventSchema.safeParse(event).success).toBe(true);
    expect(WorkspaceEventSchema.safeParse({ ...event, resourceVersion: 3 }).success).toBe(false);
    expect(WorkspaceEventSchema.safeParse({ ...event, lastActionSequence: 2 }).success).toBe(false);
    expect(
      WorkspaceEventSchema.safeParse({ ...event, actions: [{ ...action, sequence: 2 }] }).success,
    ).toBe(false);
    expect(WorkspaceEventSchema.safeParse({ ...event, providerKey: 'private' }).success).toBe(
      false,
    );
  });

  it('uses native Goal field constraints for AI drafts and supports an incomplete planning seed', () => {
    for (const length of [80, 81]) {
      const name = 'x'.repeat(length);
      expect(GoalPlanGoalSchema.safeParse({ draftRef: 'goal', name }).success).toBe(
        CreateGoalSchema.safeParse({ name }).success,
      );
    }
    expect(
      GoalPlanGoalSchema.safeParse({ draftRef: 'goal', name: 'Plan', summary: 'x'.repeat(256) })
        .success,
    ).toBe(false);
    expect(
      GoalPlanningSeedSchema.safeParse({
        goal: { draftRef: 'goal', name: '   ' },
        keyResults: [],
        tasks: [],
        knowledge: [],
      }).success,
    ).toBe(true);
  });
});
