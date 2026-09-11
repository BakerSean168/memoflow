import { describe, expect, it } from 'vitest';
import { goalWorkflowEntityId, knowledgeCaptureDocumentId } from './deterministic-entity-id';

describe('goalWorkflowEntityId', () => {
  it('is stable, prefix-correct, child-index-sensitive and revision-sensitive', () => {
    const base = { workflowRunId: 'workflow-123', revision: 1 } as const;
    const goalA = goalWorkflowEntityId({ ...base, kind: 'goal' });
    const goalB = goalWorkflowEntityId({ ...base, kind: 'goal' });
    const keyResult0 = goalWorkflowEntityId({ ...base, kind: 'key_result', index: 0 });
    const keyResult1 = goalWorkflowEntityId({ ...base, kind: 'key_result', index: 1 });
    const revisedGoal = goalWorkflowEntityId({ ...base, revision: 2, kind: 'goal' });

    expect(goalA).toBe(goalB);
    expect(goalA).toMatch(/^IGoalId_[0-9a-f-]{36}$/);
    expect(keyResult0).toMatch(/^IKeyResultId_[0-9a-f-]{36}$/);
    expect(keyResult0).not.toBe(keyResult1);
    expect(goalA).not.toBe(revisedGoal);
  });

  it('keeps KnowledgeDocumentId stable for one knowledge.capture run', () => {
    const first = knowledgeCaptureDocumentId({ workflowRunId: 'knowledge-run-1' });
    const replay = knowledgeCaptureDocumentId({ workflowRunId: 'knowledge-run-1' });
    const other = knowledgeCaptureDocumentId({ workflowRunId: 'knowledge-run-2' });

    expect(first).toBe(replay);
    expect(first).toMatch(/^kdoc_[0-9a-f-]{36}$/i);
    expect(other).not.toBe(first);
  });

  it('rejects invalid durable mutation identities', () => {
    expect(() => goalWorkflowEntityId({ workflowRunId: '', revision: 1, kind: 'goal' })).toThrow(
      'workflowRunId',
    );
    expect(() => goalWorkflowEntityId({ workflowRunId: 'run', revision: 0, kind: 'goal' })).toThrow(
      'revision',
    );
    expect(() =>
      goalWorkflowEntityId({ workflowRunId: 'run', revision: 1, kind: 'reminder', index: -1 }),
    ).toThrow('index');
  });
});
