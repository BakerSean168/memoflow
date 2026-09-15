import { describe, expect, it } from 'vitest';
import {
  goalWorkflowEntityId,
  goalWorkflowMutationRequestId,
  knowledgeCaptureDocumentId,
} from './deterministic-entity-id';

describe('goalWorkflowEntityId V2', () => {
  it('is draftRef-stable across reorder and revision-sensitive', () => {
    const base = { workflowRunId: 'workflow-123', revision: 1 } as const;
    const goalA = goalWorkflowEntityId({ ...base, kind: 'goal', draftRef: 'goal' });
    const goalB = goalWorkflowEntityId({ ...base, kind: 'goal', draftRef: 'goal' });
    const applicationsBeforeReorder = goalWorkflowEntityId({
      ...base,
      kind: 'key_result',
      draftRef: 'kr:applications',
    });
    const interviews = goalWorkflowEntityId({
      ...base,
      kind: 'key_result',
      draftRef: 'kr:interviews',
    });
    const applicationsAfterReorder = goalWorkflowEntityId({
      ...base,
      kind: 'key_result',
      draftRef: 'kr:applications',
    });
    const revisedApplications = goalWorkflowEntityId({
      ...base,
      revision: 2,
      kind: 'key_result',
      draftRef: 'kr:applications',
    });

    expect(goalA).toBe(goalB);
    expect(goalA).toMatch(/^IGoalId_[0-9a-f-]{36}$/);
    expect(applicationsBeforeReorder).toBe(applicationsAfterReorder);
    expect(applicationsBeforeReorder).toMatch(/^IKeyResultId_[0-9a-f-]{36}$/);
    expect(interviews).not.toBe(applicationsBeforeReorder);
    expect(revisedApplications).not.toBe(applicationsBeforeReorder);
  });

  it('creates stable Task/Knowledge ids and operation request ids from draftRef', () => {
    const base = { workflowRunId: 'workflow-123', revision: 3 } as const;
    expect(
      goalWorkflowEntityId({ ...base, kind: 'task_plan', draftRef: 'task:daily-search' }),
    ).toMatch(/^ITaskPlanId_[0-9a-f-]{36}$/);
    expect(
      goalWorkflowEntityId({ ...base, kind: 'knowledge_document', draftRef: 'note:goal-brief' }),
    ).toMatch(/^kdoc_[0-9a-f-]{36}$/i);

    const requestA = goalWorkflowMutationRequestId({
      ...base,
      draftRef: 'note:goal-brief',
      operation: 'knowledge_create',
    });
    const requestB = goalWorkflowMutationRequestId({
      ...base,
      draftRef: 'note:goal-brief',
      operation: 'knowledge_create',
    });
    const linkRequest = goalWorkflowMutationRequestId({
      ...base,
      draftRef: 'note:goal-brief',
      operation: 'knowledge_link',
    });
    expect(requestA).toBe(requestB);
    expect(linkRequest).not.toBe(requestA);
  });

  it('keeps standalone KnowledgeDocumentId stable for one knowledge.capture run', () => {
    const first = knowledgeCaptureDocumentId({ workflowRunId: 'knowledge-run-1' });
    const replay = knowledgeCaptureDocumentId({ workflowRunId: 'knowledge-run-1' });
    const other = knowledgeCaptureDocumentId({ workflowRunId: 'knowledge-run-2' });

    expect(first).toBe(replay);
    expect(first).toMatch(/^kdoc_[0-9a-f-]{36}$/i);
    expect(other).not.toBe(first);
  });

  it('rejects invalid durable mutation identities', () => {
    expect(() =>
      goalWorkflowEntityId({ workflowRunId: '', revision: 1, kind: 'goal', draftRef: 'goal' }),
    ).toThrow('workflowRunId');
    expect(() =>
      goalWorkflowEntityId({ workflowRunId: 'run', revision: 0, kind: 'goal', draftRef: 'goal' }),
    ).toThrow('revision');
    expect(() =>
      goalWorkflowMutationRequestId({
        workflowRunId: 'run',
        revision: 1,
        draftRef: 'task:daily-search',
        operation: '',
      }),
    ).toThrow('operation');
  });
});
