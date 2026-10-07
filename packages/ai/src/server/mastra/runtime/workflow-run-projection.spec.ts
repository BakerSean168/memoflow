import { describe, expect, it } from 'vitest';
import {
  GOAL_CREATE_LIFECYCLE_STEP_ID,
  GOAL_CREATE_WORKFLOW_ID,
  TASK_CREATE_LIFECYCLE_STEP_ID,
  TASK_CREATE_WORKFLOW_ID,
  KNOWLEDGE_CAPTURE_LIFECYCLE_STEP_ID,
  KNOWLEDGE_CAPTURE_WORKFLOW_ID,
} from '../workflows';
import {
  projectGoalCreateRun,
  projectTaskCreateRun,
  projectKnowledgeCaptureRun,
} from './workflow-run-projection';
import { parseWorkflowSnapshot, workflowInputFromSnapshot } from './workflow-run-snapshot';

const owners = [
  {
    kind: 'goal.create',
    workflow: GOAL_CREATE_WORKFLOW_ID,
    step: GOAL_CREATE_LIFECYCLE_STEP_ID,
    project: projectGoalCreateRun,
    input: { idea: 'Plan a goal' },
  },
  {
    kind: 'task.create',
    workflow: TASK_CREATE_WORKFLOW_ID,
    step: TASK_CREATE_LIFECYCLE_STEP_ID,
    project: projectTaskCreateRun,
    input: { idea: 'Plan a task' },
  },
  {
    kind: 'knowledge.capture',
    workflow: KNOWLEDGE_CAPTURE_WORKFLOW_ID,
    step: KNOWLEDGE_CAPTURE_LIFECYCLE_STEP_ID,
    project: projectKnowledgeCaptureRun,
    input: { topic: 'Capture a note' },
  },
] as const;
const receipt = { workflowRunId: 'run', revision: 1, status: 'success', retryable: false };

function row(snapshot: unknown, resourceId: string | undefined = 'owner') {
  return {
    runId: 'run',
    resourceId,
    snapshot,
    createdAt: new Date(1000),
    updatedAt: new Date(2000),
  };
}

describe.each(owners)('$kind durable snapshot projection', (owner) => {
  function snapshot(status: string, extra: Record<string, unknown> = {}) {
    return {
      status,
      context: { input: { ...owner.input, identityId: 'owner', conversationId: 'thread' } },
      ...extra,
    };
  }

  it('filters foreign and missing resources before decoding even a corrupt snapshot', () => {
    expect(owner.project(row('not JSON', 'other'), 'owner')).toBeNull();
    expect(owner.project({ ...row('not JSON'), resourceId: undefined }, 'owner')).toBeNull();
  });

  it('dispatches typed inputs with schema defaults from object and JSON snapshots', () => {
    for (const value of [snapshot('running'), JSON.stringify(snapshot('running'))]) {
      expect(workflowInputFromSnapshot(owner.workflow, value)).toEqual({
        ...owner.input,
        identityId: 'owner',
        conversationId: 'thread',
        locale: 'zh-CN',
      });
      expect(owner.project(row(value), 'owner')).toEqual({
        runId: 'run',
        kind: owner.kind,
        conversationId: 'thread',
        status: 'running',
        createdAt: 1000,
        updatedAt: 2000,
      });
    }
  });

  it.each(['running', 'pending', 'waiting'])('keeps %s nonterminal', (status) => {
    expect(owner.project(row(snapshot(status)), 'owner')?.status).toBe('running');
  });

  it.each(['future-status', 'paused', undefined, null])(
    'terminates unsupported status %s explicitly',
    (status) => {
      const view = owner.project(row({ ...snapshot('running'), status }), 'owner');
      expect(view).toMatchObject({
        status: 'failed',
        failure: { code: 'AI_WORKFLOW_STATUS_UNSUPPORTED' },
      });
      expect(view).not.toHaveProperty('result');
    },
  );

  it.each(['success', 'bailed', 'skipped'])(
    'validates %s output and distinguishes cancellation',
    (status) => {
      expect(
        owner.project(
          row(snapshot(status, { result: { outcome: 'completed', receipt } })),
          'owner',
        ),
      ).toMatchObject({ status: 'completed', result: receipt });
      expect(
        owner.project(row(snapshot(status, { result: { outcome: 'cancelled' } })), 'owner'),
      ).toMatchObject({ status: 'cancelled' });
      expect(() => owner.project(row(snapshot(status, { result: {} })), 'owner')).toThrow(
        'AI_WORKFLOW_SNAPSHOT_CORRUPT',
      );
    },
  );

  it('projects canceled without requiring output', () => {
    expect(owner.project(row(snapshot('canceled')), 'owner')?.status).toBe('cancelled');
  });

  it.each(['failed', 'tripwire'])('sanitizes %s failure', (status) => {
    const view = owner.project(
      row(snapshot(status, { error: new Error('secret-internal-detail') })),
      'owner',
    );
    expect(view).toMatchObject({
      status: 'failed',
      failure: {
        code: 'AI_RUNTIME_TRANSPORT_ERROR',
        message: 'AI runtime request failed',
      },
    });
    expect(JSON.stringify(view)).not.toContain('secret-internal-detail');
  });

  it('projects only the matching recovery receipt and rejects corrupt suspension', () => {
    const base = snapshot('suspended');
    const suspension = {
      type: 'recovery_required',
      message: 'Retry owner mutation',
      retryable: true,
      receipt: { kind: owner.kind, receipt },
    };
    const value = {
      ...base,
      context: { ...base.context, [owner.step]: { suspendPayload: suspension } },
    };
    expect(owner.project(row(value), 'owner')).toMatchObject({
      status: 'suspended',
      result: receipt,
    });
    const otherKind = owner.kind === 'goal.create' ? 'task.create' : 'goal.create';
    const foreign = { ...suspension, receipt: { kind: otherKind, receipt } };
    expect(() =>
      owner.project(
        row({ ...base, context: { ...base.context, [owner.step]: { suspendPayload: foreign } } }),
        'owner',
      ),
    ).toThrow('AI_WORKFLOW_SNAPSHOT_CORRUPT');
    expect(() => owner.project(row(base), 'owner')).toThrow('AI_WORKFLOW_SNAPSHOT_CORRUPT');
  });

  it.each([null, [], {}, { context: [] }, { context: { input: {} } }, 'invalid JSON'])(
    'fails closed on malformed snapshot %j',
    (value) => {
      expect(() => owner.project(row(value), 'owner')).toThrow('AI_WORKFLOW_SNAPSHOT_CORRUPT');
    },
  );
});

it('preserves snapshot object identity and rejects unsupported workflow names after decoding', () => {
  const value = { context: {} };
  expect(parseWorkflowSnapshot(value)).toBe(value);
  expect(() => workflowInputFromSnapshot('unsupported', value)).toThrow(
    'AI_WORKFLOW_KIND_UNSUPPORTED',
  );
  expect(() => workflowInputFromSnapshot('unsupported', 'bad JSON')).toThrow(
    'AI_WORKFLOW_SNAPSHOT_CORRUPT',
  );
});
