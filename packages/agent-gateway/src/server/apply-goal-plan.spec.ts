import { describe, expect, it, vi } from 'vitest';
import { GatewayGoalPlanApplySchema, validateGoalPlan } from '../contracts/goal-plan';
import { GatewayReadError, type GatewayWritePort } from '../ports';
import { applyGoalPlan, type GoalPlanApplyOptions } from './apply-goal-plan';
import type { ReadToolCall } from './register-read-tools';

const goalId = 'GoalId_00000000-0000-4000-8000-000000000001';
const krA = 'KeyResultId_00000000-0000-4000-8000-000000000001';
const krB = 'KeyResultId_00000000-0000-4000-8000-000000000002';
function input() {
  return GatewayGoalPlanApplySchema.parse({
    idempotencyKey: 'release-plan',
    plan: {
      target: { mode: 'create', goal: { name: 'Release 1.0' } },
      keyResults: [
        { ref: 'kr:b', keyResult: { title: 'Publish release', targetValue: 1 } },
        { ref: 'kr:a', keyResult: { title: 'Verify core paths', targetValue: 3 } },
      ],
      tasks: ['a', 'b'].map((ref) => ({
        ref: 'task:' + ref,
        keyResultRef: 'kr:' + ref,
        plan: {
          name: 'Action ' + ref,
          importance: 'Moderate',
          schedule: { kind: 'OneTime', date: '2026-12-01', timing: { kind: 'AllDay' } },
        },
      })),
    },
  });
}
function fixture() {
  let taskNumber = 0;
  const goalCreate = vi.fn(async (_input: Record<string, any>) => ({
    receiptId: 'goal-receipt',
    result: {
      goalId,
      goalVersion: 1,
      affectedEntityIds: {
        goalIds: [goalId],
        recordIds: [],
        reviewIds: [],
        keyResultIds: [krA, krB],
      },
    },
  }));
  const keyResultCreate = vi.fn(async (_input: Record<string, any>) => ({
    receiptId: 'kr-receipt',
    result: {
      goalId,
      goalVersion: 2,
      affectedEntityIds: { goalIds: [goalId], recordIds: [], reviewIds: [], keyResultIds: [krA] },
    },
  }));
  const taskCreate = vi.fn(async (_input: Record<string, any>) => ({
    receiptId: 'task-receipt-' + ++taskNumber,
    result: {
      kind: 'plan' as const,
      plan: {
        id: 'TaskPlanId_00000000-0000-4000-8000-' + String(taskNumber).padStart(12, '0'),
        version: 1,
      },
    },
  }));
  const writes = { goalCreate, keyResultCreate, taskCreate } as unknown as GatewayWritePort;
  const calls: string[] = [];
  let denied: string | undefined;
  const call: ReadToolCall = async (name, _scope, work) => {
    calls.push(name);
    if (name === denied)
      return { isError: true, content: [{ type: 'text', text: 'PERMISSION_DENIED: denied' }] };
    try {
      return { content: [], structuredContent: await work() };
    } catch (error) {
      return {
        isError: true,
        content: [
          { type: 'text', text: error instanceof GatewayReadError ? error.code : 'INTERNAL_ERROR' },
        ],
      };
    }
  };
  const options: GoalPlanApplyOptions = {
    writes,
    call,
    context: {
      identityId: 'owner',
      requestId: 'request',
      traceId: 'request',
      startedAt: Date.now(),
      source: 'http',
    },
    authority: {
      connectionId: 'connection',
      credentialType: 'pat',
      scopes: ['goals:write', 'tasks:write'],
      authorize: async () => {},
    },
  };
  return {
    options,
    goalCreate,
    keyResultCreate,
    taskCreate,
    calls,
    deny: (tool: string) => {
      denied = tool;
    },
  };
}
describe('deterministic Goal plan composition', () => {
  it('maps real returned KR IDs to Tasks and checks each business operation', async () => {
    const f = fixture();
    const result = await applyGoalPlan(input(), f.options);
    expect(result.status).toBe('success');
    expect(result.referenceMap).toMatchObject({ goal: goalId, 'kr:a': krA, 'kr:b': krB });
    expect(f.goalCreate.mock.calls[0][0].goal.initialKeyResults.map((kr) => kr.title)).toEqual([
      'Verify core paths',
      'Publish release',
    ]);
    expect(
      f.taskCreate.mock.calls.map(([request]) => request.plan.goalBinding.keyResultId),
    ).toEqual([krA, krB]);
    expect(f.calls).toEqual([
      'goal_create',
      'goal_key_result_create',
      'task_plan_create',
      'task_plan_create',
    ]);
    expect(JSON.stringify(result)).not.toContain('Release 1.0');
  });
  it('validates the entire input and required scopes before any write', async () => {
    const f = fixture();
    const invalid = input();
    invalid.plan.tasks[1]!.keyResultRef = 'kr:missing';
    expect(validateGoalPlan(invalid.plan)).toMatchObject({ valid: false });
    await expect(applyGoalPlan(invalid, f.options)).rejects.toThrow();
    f.options.authority = { ...f.options.authority, scopes: ['goals:write'] };
    expect(await applyGoalPlan(input(), f.options)).toMatchObject({
      status: 'failed',
      failures: [{ code: 'INSUFFICIENT_SCOPE', retryable: false }],
    });
    expect(f.goalCreate).not.toHaveBeenCalled();
  });
  it('does not bypass a KR deny inside an atomic Goal create', async () => {
    const f = fixture();
    f.deny('goal_key_result_create');
    const result = await applyGoalPlan(input(), f.options);
    expect(result).toMatchObject({
      status: 'failed',
      failures: [{ code: 'PERMISSION_DENIED', retryable: false }],
    });
    expect(f.goalCreate).not.toHaveBeenCalled();
    expect(f.taskCreate).not.toHaveBeenCalled();
  });
  it('returns successful receipts when Task permission is denied without writing Tasks', async () => {
    const f = fixture();
    f.deny('task_plan_create');
    const result = await applyGoalPlan(input(), f.options);
    expect(result).toMatchObject({
      status: 'partial',
      referenceMap: { goal: goalId },
      failures: [{ ref: 'task:a', code: 'PERMISSION_DENIED' }],
    });
    expect(f.taskCreate).not.toHaveBeenCalled();
  });
  it('extends an existing Goal with the exact version chain and never creates a replacement', async () => {
    const f = fixture();
    const plan = input();
    plan.plan.target = { mode: 'existing', goalId, expectedVersion: 7 };
    f.keyResultCreate.mockResolvedValueOnce({
      receiptId: 'kr-a',
      result: {
        goalId,
        goalVersion: 8,
        affectedEntityIds: { goalIds: [goalId], recordIds: [], reviewIds: [], keyResultIds: [krA] },
      },
    });
    f.keyResultCreate.mockRejectedValueOnce(new GatewayReadError('CONFLICT'));
    const result = await applyGoalPlan(plan, f.options);
    expect(result).toMatchObject({
      status: 'partial',
      goalVersion: 8,
      failures: [{ ref: 'kr:b', code: 'CONFLICT' }],
    });
    expect(f.goalCreate).not.toHaveBeenCalled();
    expect(
      f.keyResultCreate.mock.calls.map(([request]) => request.keyResult.expectedVersion),
    ).toEqual([7, 8]);
    expect(f.taskCreate).not.toHaveBeenCalled();
  });
  it('keeps child retry keys stable across reordering and stops after cancellation', async () => {
    const f = fixture();
    const plan = input();
    await applyGoalPlan(plan, f.options);
    plan.plan.keyResults.reverse();
    plan.plan.tasks.reverse();
    await applyGoalPlan(plan, f.options);
    expect(f.goalCreate.mock.calls[0][0].idempotencyKey).toBe(
      f.goalCreate.mock.calls[1][0].idempotencyKey,
    );
    expect(f.taskCreate.mock.calls[0][0].idempotencyKey).toBe(
      f.taskCreate.mock.calls[2][0].idempotencyKey,
    );
    const controller = new AbortController();
    f.options.signal = controller.signal;
    f.goalCreate.mockImplementationOnce(async () => {
      controller.abort();
      return {
        receiptId: 'created',
        result: {
          goalId,
          goalVersion: 1,
          affectedEntityIds: {
            goalIds: [goalId],
            recordIds: [],
            reviewIds: [],
            keyResultIds: [krA, krB],
          },
        },
      };
    });
    expect(await applyGoalPlan(plan, f.options)).toMatchObject({
      status: 'partial',
      failures: [{ code: 'TIMEOUT', retryable: true }],
    });
    expect(f.taskCreate).toHaveBeenCalledTimes(4);
  });
  it('warns rather than forbids intentional simple Goals, and rejects injected workflow identity', () => {
    expect(
      validateGoalPlan({ target: { mode: 'create', goal: { name: 'Simple' } } }),
    ).toMatchObject({
      valid: true,
      warnings: [expect.any(String), expect.any(String)],
    });
    expect(
      GatewayGoalPlanApplySchema.safeParse({ ...input(), conversationId: 'foreign' }).success,
    ).toBe(false);
    const bad = input();
    bad.plan.keyResults.push(bad.plan.keyResults[0]!);
    expect(validateGoalPlan(bad.plan).valid).toBe(false);
  });
});

it('rejects malformed existing KR IDs before any plan step', async () => {
  const f = fixture();
  const plan = {
    ...input().plan,
    target: { mode: 'existing', goalId, expectedVersion: 1 },
    existingKeyResults: [{ ref: 'kr:existing', keyResultId: 'malformed' }],
  };
  expect(validateGoalPlan(plan).valid).toBe(false);
  await expect(
    applyGoalPlan({ idempotencyKey: 'invalid-binding', plan }, f.options),
  ).rejects.toThrow();
  expect(f.goalCreate).not.toHaveBeenCalled();
  expect(f.keyResultCreate).not.toHaveBeenCalled();
  expect(f.taskCreate).not.toHaveBeenCalled();
});
it.each(['UNAVAILABLE', 'OPERATION_IN_PROGRESS'] as const)(
  'reports %s as a recoverable partial plan',
  async (code) => {
    const f = fixture();
    f.taskCreate.mockRejectedValueOnce(new GatewayReadError(code));
    expect(await applyGoalPlan(input(), f.options)).toMatchObject({
      status: 'partial',
      retryable: true,
      referenceMap: { goal: goalId },
      failures: [{ ref: 'task:a', code, retryable: true }],
    });
    expect(f.taskCreate).toHaveBeenCalledTimes(1);
  },
);
