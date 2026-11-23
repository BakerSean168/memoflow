import { createHash } from 'node:crypto';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import {
  GatewayGoalPlanApplySchema,
  GatewayGoalPlanResultSchema,
  type GatewayGoalPlanApply,
  type GatewayGoalPlanResult,
} from '../contracts/goal-plan';
import {
  GatewayGoalReceiptSchema,
  GatewayTaskReceiptSchema,
  GatewayKeyResultCreateSchema,
  GatewayTaskCreateSchema,
} from '../contracts/writes';
import { GatewayReadError, type GatewayWriteAuthority, type GatewayWritePort } from '../ports';
import { GatewayFailureCodeSchema } from '../contracts';
import type { ReadToolCall } from './register-read-tools';

class GoalPlanStepError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

type StepTool = 'goal_create' | 'goal_key_result_create' | 'task_plan_create';
export interface GoalPlanApplyOptions {
  writes: GatewayWritePort;
  context: ExecutionContext;
  authority: GatewayWriteAuthority;
  call: ReadToolCall;
  signal?: AbortSignal;
  deadlineAt?: number;
}

function childKey(key: string, tool: StepTool, ref: string): string {
  // Content is deliberately excluded: changing a retry must conflict, not create a second object.
  return (
    'goal-plan:' +
    createHash('sha256')
      .update(JSON.stringify([key, tool, ref]))
      .digest('hex')
  );
}

function publicCode(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(code) ? code : 'INTERNAL_ERROR';
}

/** Only sequences existing owner operations; receipts remain with their authoritative owners. */
export async function applyGoalPlan(
  raw: GatewayGoalPlanApply,
  options: GoalPlanApplyOptions,
): Promise<GatewayGoalPlanResult> {
  const { idempotencyKey, plan } = GatewayGoalPlanApplySchema.parse(raw);
  const { writes, context, authority, call } = options;
  const result: GatewayGoalPlanResult = {
    status: 'success',
    referenceMap: {},
    receipts: [],
    failures: [],
    retryable: false,
  };
  const ordered = <T extends { ref: string }>(items: readonly T[]) =>
    [...items].sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
  const keyResults = ordered(plan.keyResults);
  const tasks = ordered(plan.tasks);
  const refs: Record<string, string> = Object.fromEntries(
    plan.existingKeyResults.map((item) => [item.ref, item.keyResultId]),
  );
  let goalId = plan.target.mode === 'existing' ? plan.target.goalId : '';
  let goalVersion = plan.target.mode === 'existing' ? plan.target.expectedVersion : undefined;

  function fail(ref: string, tool: StepTool, cause: unknown): GatewayGoalPlanResult {
    const code = publicCode(cause);
    const retryable = [
      'TIMEOUT',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
      'UNAVAILABLE',
      'OPERATION_IN_PROGRESS',
    ].includes(code);
    result.failures.push({ ref, tool, code, retryable });
    result.retryable = retryable;
    result.status = result.receipts.length ? 'partial' : 'failed';
    return GatewayGoalPlanResultSchema.parse(result);
  }

  async function step<T extends object>(tool: StepTool, work: () => Promise<T>): Promise<T> {
    if (
      options.signal?.aborted ||
      (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt)
    )
      throw new GoalPlanStepError('TIMEOUT');
    const response = await call(
      tool,
      tool === 'task_plan_create' ? 'tasks:write' : 'goals:write',
      work,
    );
    if (response.isError || !response.structuredContent) {
      const code = response.content[0]?.text.split(':')[0]?.trim();
      const parsed = GatewayFailureCodeSchema.safeParse(code);
      throw parsed.success
        ? new GatewayReadError(parsed.data)
        : new GoalPlanStepError(code ?? 'INTERNAL_ERROR');
    }
    return response.structuredContent as T;
  }

  // Validate the whole request and all required grants before the first owner write.
  if (
    !authority.scopes.includes('goals:write') ||
    (tasks.length && !authority.scopes.includes('tasks:write'))
  )
    return fail('goal', plan.target.mode === 'create' ? 'goal_create' : 'goal_key_result_create', {
      code: 'INSUFFICIENT_SCOPE',
    });

  if (plan.target.mode === 'create') {
    const goal = plan.target.goal;
    try {
      const create = () =>
        writes
          .goalCreate(
            {
              idempotencyKey: childKey(idempotencyKey, 'goal_create', 'goal'),
              goal: { ...goal, initialKeyResults: keyResults.map((item) => item.keyResult) },
            },
            context,
            authority,
          )
          .then((value) => GatewayGoalReceiptSchema.parse(value));
      // Initial KRs are one atomic Goal write, but still honor a KR-specific deny.
      const receipt = await step('goal_create', () =>
        keyResults.length ? step('goal_key_result_create', create) : create(),
      );
      result.receipts.push({ ref: 'goal', tool: 'goal_create', receipt });
      goalId = receipt.result.goalId;
      goalVersion = receipt.result.goalVersion;
      result.referenceMap.goal = goalId;
      result.goalVersion = goalVersion;
      const ids = receipt.result.affectedEntityIds.keyResultIds ?? [];
      if (ids.length !== keyResults.length || new Set(ids).size !== ids.length)
        return fail('goal', 'goal_create', { code: 'RECEIPT_MISMATCH' });
      keyResults.forEach((item, index) => {
        refs[item.ref] = ids[index]!;
        result.referenceMap[item.ref] = ids[index]!;
      });
    } catch (error) {
      return fail('goal', 'goal_create', error);
    }
  } else {
    for (const item of keyResults) {
      try {
        const receipt = await step('goal_key_result_create', () =>
          writes
            .keyResultCreate(
              GatewayKeyResultCreateSchema.parse({
                idempotencyKey: childKey(idempotencyKey, 'goal_key_result_create', item.ref),
                goalId,
                keyResult: { ...item.keyResult, expectedVersion: goalVersion! },
              }),
              context,
              authority,
            )
            .then((value) => GatewayGoalReceiptSchema.parse(value)),
        );
        result.receipts.push({ ref: item.ref, tool: 'goal_key_result_create', receipt });
        result.referenceMap.goal = receipt.result.goalId;
        goalVersion = receipt.result.goalVersion;
        result.goalVersion = goalVersion;
        const ids = receipt.result.affectedEntityIds.keyResultIds ?? [];
        if (receipt.result.goalId !== goalId || ids.length !== 1)
          return fail(item.ref, 'goal_key_result_create', { code: 'RECEIPT_MISMATCH' });
        refs[item.ref] = ids[0]!;
        result.referenceMap[item.ref] = ids[0]!;
      } catch (error) {
        return fail(item.ref, 'goal_key_result_create', error);
      }
    }
  }

  for (const task of tasks) {
    try {
      const keyResultId = task.keyResultRef ? refs[task.keyResultRef] : null;
      if (task.keyResultRef && !keyResultId) throw new GoalPlanStepError('RECEIPT_MISMATCH');
      const receipt = await step('task_plan_create', () =>
        writes
          .taskCreate(
            GatewayTaskCreateSchema.parse({
              idempotencyKey: childKey(idempotencyKey, 'task_plan_create', task.ref),
              plan: {
                ...task.plan,
                goalBinding: {
                  goalId,
                  keyResultId: keyResultId ?? null,
                  progressRule: task.progressRule ?? null,
                },
              },
            }),
            context,
            authority,
          )
          .then((value) => GatewayTaskReceiptSchema.parse(value)),
      );
      result.receipts.push({ ref: task.ref, tool: 'task_plan_create', receipt });
      if (receipt.result.kind !== 'plan') throw new GoalPlanStepError('RECEIPT_MISMATCH');
      result.referenceMap.goal = goalId;
      result.referenceMap[task.ref] = receipt.result.plan.id;
      if (task.keyResultRef) result.referenceMap[task.keyResultRef] = keyResultId!;
    } catch (error) {
      return fail(task.ref, 'task_plan_create', error);
    }
  }
  return GatewayGoalPlanResultSchema.parse(result);
}
