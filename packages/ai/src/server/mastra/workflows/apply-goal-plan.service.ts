import {
  GoalPlanExecutionReceiptSchema,
  type GoalPlanDraft,
  type GoalPlanDraftRef,
  type GoalPlanExecutionFailure,
  type GoalPlanExecutionReceipt,
  type GoalPlanTask,
} from '@memoflow/contracts/ai';
import type { CreateGoalReq } from '@memoflow/contracts/goal';
import type { KnowledgeDocumentId } from '@memoflow/contracts/primitives';
import type { KnowledgeDocumentRef } from '@memoflow/contracts/repository';
import type { ResultError } from '@memoflow/contracts/result';
import type { CreateTaskPlanReq } from '@memoflow/contracts/task';
import { goalWorkflowEntityId, goalWorkflowMutationRequestId } from './deterministic-entity-id';
import type { ApplyGoalPlanInput, GoalPlanMutationPort } from './goal-plan-mutation.port';

const RETRYABLE_LEGACY_CODES = new Set([
  'DATABASE_ERROR',
  'DB_ERROR',
  'INTERNAL_ERROR',
  'NETWORK_ERROR',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'TIMEOUT',
]);

function retryableFailure(error: ResultError): boolean {
  const hint = error.failure?.retryHint;
  if (hint?.kind === 'not_retryable') return false;
  if (hint?.kind === 'transient' || hint?.kind === 'after') return true;
  return RETRYABLE_LEGACY_CODES.has(String(error.code).toUpperCase());
}

function failure(
  operation: GoalPlanExecutionFailure['operation'],
  draftRef: GoalPlanDraftRef,
  error: Pick<ResultError, 'code' | 'message' | 'failure'>,
): GoalPlanExecutionFailure {
  return {
    operation,
    draftRef,
    code: String(error.code),
    message: error.message,
    retryable: retryableFailure(error as ResultError),
  };
}

function throwToFailure(
  operation: GoalPlanExecutionFailure['operation'],
  draftRef: GoalPlanDraftRef,
  cause: unknown,
): GoalPlanExecutionFailure {
  return failure(operation, draftRef, {
    code: 'INTERNAL_ERROR',
    message: cause instanceof Error ? cause.message : String(cause),
    failure: {
      code: 'INTERNAL_ERROR',
      category: 'unavailable',
      retryHint: { kind: 'transient' },
    },
  });
}

function mismatchFailure(
  operation: GoalPlanExecutionFailure['operation'],
  draftRef: GoalPlanDraftRef,
  entity: string,
): GoalPlanExecutionFailure {
  return {
    operation,
    draftRef,
    code: 'AI_WORKFLOW_MUTATION_ID_MISMATCH',
    message: `${entity} application port returned an unexpected deterministic identity`,
    retryable: false,
  };
}

function expectedReferenceMap(workflowRunId: string, draft: GoalPlanDraft): Record<string, string> {
  const refs: Record<string, string> = {
    goal: goalWorkflowEntityId({
      workflowRunId,
      revision: draft.revision,
      kind: 'goal',
      draftRef: 'goal',
    }),
  };
  for (const keyResult of draft.keyResults) {
    refs[keyResult.draftRef] = goalWorkflowEntityId({
      workflowRunId,
      revision: draft.revision,
      kind: 'key_result',
      draftRef: keyResult.draftRef,
    });
  }
  for (const task of draft.tasks) {
    refs[task.draftRef] = goalWorkflowEntityId({
      workflowRunId,
      revision: draft.revision,
      kind: 'task_plan',
      draftRef: task.draftRef,
    });
  }
  for (const knowledge of draft.knowledge) {
    refs[knowledge.draftRef] =
      knowledge.mode === 'create'
        ? goalWorkflowEntityId({
            workflowRunId,
            revision: draft.revision,
            kind: 'knowledge_document',
            draftRef: knowledge.draftRef,
          })
        : knowledge.knowledgeDocument.documentId;
  }
  return refs;
}

function restoreCurrentReceiptState(
  prior: GoalPlanExecutionReceipt | undefined,
  expected: Readonly<Record<string, string>>,
  knowledgeRefs: readonly string[],
): {
  referenceMap: Record<string, string>;
  relationIds: Record<string, string>;
  goalVersion?: number;
  appliedGoalStatus?: 'Planned' | 'InProgress';
} {
  if (!prior) return { referenceMap: {}, relationIds: {} };
  const referenceMap: Record<string, string> = {};
  for (const [draftRef, expectedId] of Object.entries(expected)) {
    if (prior.referenceMap[draftRef as GoalPlanDraftRef] === expectedId) {
      referenceMap[draftRef] = expectedId;
    }
  }
  const relationIds: Record<string, string> = {};
  for (const draftRef of knowledgeRefs) {
    const relationId = prior.relationIds[draftRef as `note:${string}`];
    if (relationId) relationIds[draftRef] = relationId;
  }
  return {
    referenceMap,
    relationIds,
    ...(referenceMap.goal && prior.goalVersion ? { goalVersion: prior.goalVersion } : {}),
    ...(referenceMap.goal && prior.appliedGoalStatus
      ? { appliedGoalStatus: prior.appliedGoalStatus }
      : {}),
  };
}

function receipt(input: {
  workflowRunId: string;
  revision: number;
  referenceMap: Record<string, string>;
  relationIds: Record<string, string>;
  goalVersion?: number;
  appliedGoalStatus?: 'Planned' | 'InProgress';
  failures: GoalPlanExecutionFailure[];
  forceStatus?: GoalPlanExecutionReceipt['status'];
}): GoalPlanExecutionReceipt {
  const status =
    input.forceStatus ??
    (input.failures.length === 0 ? 'success' : input.referenceMap.goal ? 'partial' : 'failed');
  return GoalPlanExecutionReceiptSchema.parse({
    workflowRunId: input.workflowRunId,
    revision: input.revision,
    status,
    referenceMap: input.referenceMap,
    relationIds: input.relationIds,
    ...(input.goalVersion ? { goalVersion: input.goalVersion } : {}),
    ...(input.appliedGoalStatus ? { appliedGoalStatus: input.appliedGoalStatus } : {}),
    failures: input.failures,
    retryable: input.failures.some((item) => item.retryable),
  });
}

function goalRequest(
  draft: GoalPlanDraft,
  expected: Readonly<Record<string, string>>,
  labelIds: readonly string[],
): CreateGoalReq {
  return {
    id: expected.goal as NonNullable<CreateGoalReq['id']>,
    name: draft.goal.name,
    ...(draft.goal.summary == null ? {} : { summary: draft.goal.summary }),
    ...(draft.goal.startDate == null ? {} : { startDate: draft.goal.startDate }),
    ...(draft.goal.target == null ? {} : { target: draft.goal.target }),
    labelIds: [...labelIds],
    initialKeyResults: draft.keyResults.map((keyResult) => ({
      id: expected[keyResult.draftRef] as NonNullable<
        NonNullable<CreateGoalReq['initialKeyResults']>[number]['id']
      >,
      title: keyResult.title,
      description: keyResult.description ?? null,
      calculationMethod: keyResult.aggregationMethod,
      initialValue: keyResult.initialValue,
      currentValue: keyResult.currentValue,
      targetValue: keyResult.targetValue,
      ...(keyResult.target == null ? {} : { target: keyResult.target }),
      unit: keyResult.unit ?? '',
      weight: keyResult.weight,
    })),
  };
}

function taskRequest(
  task: GoalPlanTask,
  expected: Readonly<Record<string, string>>,
  labelIds: readonly string[],
): CreateTaskPlanReq {
  const goalId = expected.goal;
  if (!goalId) throw new Error('Goal persistent identity is missing');
  const keyResultId = task.keyResultRef ? expected[task.keyResultRef] : undefined;
  if (task.keyResultRef && !keyResultId) {
    throw new Error(`Key Result persistent identity is missing for ${task.keyResultRef}`);
  }
  return {
    id: expected[task.draftRef] as NonNullable<CreateTaskPlanReq['id']>,
    name: task.title,
    description: task.description ?? null,
    schedule: task.schedule,
    reminderConfig: task.reminderConfig ?? null,
    importance: task.importance,
    labelIds: [...labelIds],
    goalBinding: {
      goalId: goalId as NonNullable<NonNullable<CreateTaskPlanReq['goalBinding']>['goalId']>,
      keyResultId: (keyResultId ?? null) as NonNullable<
        CreateTaskPlanReq['goalBinding']
      >['keyResultId'],
      contribution: task.contribution ?? null,
    },
  };
}

/**
 * Deterministic, restart-safe V2 application of one approved GoalPlanDraft.
 *
 * Each operation is owner-local and idempotent. There is intentionally no
 * cross-module transaction: Mastra persists the receipt in Workflow state and
 * retries only the missing draftRef operations using stable child identities.
 */
export class ApplyGoalPlanService {
  constructor(private readonly mutations: GoalPlanMutationPort) {}

  async apply(input: ApplyGoalPlanInput): Promise<GoalPlanExecutionReceipt> {
    const { workflowRunId, draft, context } = input;
    const prior =
      input.priorReceipt?.workflowRunId === workflowRunId &&
      input.priorReceipt.revision === draft.revision
        ? input.priorReceipt
        : undefined;
    const expected = expectedReferenceMap(workflowRunId, draft);
    const state = restoreCurrentReceiptState(
      prior,
      expected,
      draft.knowledge.map((item) => item.draftRef),
    );
    const failures: GoalPlanExecutionFailure[] = [];

    const expectedGoalId = expected.goal!;
    const expectedKeyResultIds = draft.keyResults.map((item) => expected[item.draftRef]!);
    const goalAlreadyCreated =
      state.referenceMap.goal === expectedGoalId &&
      state.goalVersion !== undefined &&
      draft.keyResults.every(
        (item) => state.referenceMap[item.draftRef] === expected[item.draftRef],
      );

    if (!goalAlreadyCreated) {
      let labels;
      try {
        labels = await this.mutations.resolveLabels(draft.goal.labels, context);
      } catch (cause) {
        failures.push(throwToFailure('label_resolve', 'goal', cause));
        return receipt({
          workflowRunId,
          revision: draft.revision,
          ...state,
          failures,
        });
      }
      if (!labels.ok) {
        failures.push(failure('label_resolve', 'goal', labels.error));
        return receipt({ workflowRunId, revision: draft.revision, ...state, failures });
      }

      try {
        const result = await this.mutations.createGoal(
          goalRequest(draft, expected, labels.data),
          context,
        );
        if (!result.ok) {
          failures.push(failure('goal_create', 'goal', result.error));
          return receipt({ workflowRunId, revision: draft.revision, ...state, failures });
        }
        const returnedKeyResults = new Set(result.data.keyResultIds);
        if (
          result.data.goalId !== expectedGoalId ||
          result.data.keyResultIds.length !== expectedKeyResultIds.length ||
          !expectedKeyResultIds.every((id) => returnedKeyResults.has(id))
        ) {
          failures.push(mismatchFailure('goal_create', 'goal', 'Goal/Key Result'));
          return receipt({
            workflowRunId,
            revision: draft.revision,
            ...state,
            failures,
            forceStatus: 'failed',
          });
        }
        state.referenceMap.goal = expectedGoalId;
        state.goalVersion = result.data.goalVersion;
        for (const keyResult of draft.keyResults) {
          state.referenceMap[keyResult.draftRef] = expected[keyResult.draftRef]!;
        }
      } catch (cause) {
        failures.push(throwToFailure('goal_create', 'goal', cause));
        return receipt({ workflowRunId, revision: draft.revision, ...state, failures });
      }
    }

    if (draft.goal.status === 'InProgress' && state.appliedGoalStatus !== 'InProgress') {
      try {
        const result = await this.mutations.activateGoal(
          expectedGoalId,
          state.goalVersion!,
          context,
        );
        if (!result.ok) {
          failures.push(failure('goal_activate', 'goal', result.error));
          return receipt({ workflowRunId, revision: draft.revision, ...state, failures });
        }
        state.goalVersion = result.data.goalVersion;
        state.appliedGoalStatus = 'InProgress';
      } catch (cause) {
        failures.push(throwToFailure('goal_activate', 'goal', cause));
        return receipt({ workflowRunId, revision: draft.revision, ...state, failures });
      }
    } else if (draft.goal.status === 'Planned') {
      state.appliedGoalStatus = 'Planned';
    }

    for (const knowledge of draft.knowledge) {
      let knowledgeDocument: KnowledgeDocumentRef | null =
        knowledge.mode === 'linkExisting' ? knowledge.knowledgeDocument : null;
      const expectedDocumentId = expected[knowledge.draftRef]!;

      if (knowledge.mode === 'create' && !state.relationIds[knowledge.draftRef]) {
        try {
          const result = await this.mutations.createKnowledgeDocument(
            {
              workflowRunId,
              revision: draft.revision,
              draftRef: knowledge.draftRef,
              knowledgeDocumentId: expectedDocumentId as KnowledgeDocumentId,
              title: knowledge.title,
              markdown: knowledge.markdown,
              targetSubpath: knowledge.targetSubpath,
              sourceRefs: knowledge.sourceRefs,
              requestId: goalWorkflowMutationRequestId({
                workflowRunId,
                revision: draft.revision,
                draftRef: knowledge.draftRef,
                operation: 'knowledge_create',
              }),
            },
            context,
          );
          if (!result.ok) {
            failures.push(failure('knowledge_create', knowledge.draftRef, result.error));
            continue;
          }
          if (result.data.knowledgeDocument.documentId !== expectedDocumentId) {
            failures.push(
              mismatchFailure('knowledge_create', knowledge.draftRef, 'KnowledgeDocument'),
            );
            continue;
          }
          knowledgeDocument = result.data.knowledgeDocument;
          state.referenceMap[knowledge.draftRef] = expectedDocumentId;
        } catch (cause) {
          failures.push(throwToFailure('knowledge_create', knowledge.draftRef, cause));
          continue;
        }
      } else if (knowledge.mode === 'linkExisting') {
        state.referenceMap[knowledge.draftRef] = knowledge.knowledgeDocument.documentId;
      }

      if (state.relationIds[knowledge.draftRef]) continue;
      if (!knowledgeDocument) {
        // A created note with a durable ref but no relation receipt is replayed
        // through createKnowledgeDocument above, so reaching here is a bug.
        failures.push({
          operation: 'knowledge_link',
          draftRef: knowledge.draftRef,
          code: 'AI_WORKFLOW_KNOWLEDGE_REF_MISSING',
          message: 'KnowledgeDocumentRef is required before linking Goal Knowledge',
          retryable: false,
        });
        continue;
      }
      try {
        const result = await this.mutations.linkGoalKnowledge(
          expectedGoalId,
          knowledgeDocument,
          context,
        );
        if (!result.ok) {
          failures.push(failure('knowledge_link', knowledge.draftRef, result.error));
          continue;
        }
        state.relationIds[knowledge.draftRef] = result.data.relationId;
      } catch (cause) {
        failures.push(throwToFailure('knowledge_link', knowledge.draftRef, cause));
      }
    }

    for (const task of draft.tasks) {
      const expectedTaskId = expected[task.draftRef]!;
      if (state.referenceMap[task.draftRef] === expectedTaskId) continue;

      let labels;
      try {
        labels = await this.mutations.resolveLabels(task.labels, context);
      } catch (cause) {
        failures.push(throwToFailure('label_resolve', task.draftRef, cause));
        continue;
      }
      if (!labels.ok) {
        failures.push(failure('label_resolve', task.draftRef, labels.error));
        continue;
      }

      try {
        const result = await this.mutations.createTaskPlan(
          taskRequest(task, expected, labels.data),
          context,
        );
        if (!result.ok) {
          failures.push(failure('task_create', task.draftRef, result.error));
          continue;
        }
        if (result.data.taskId !== expectedTaskId) {
          failures.push(mismatchFailure('task_create', task.draftRef, 'Task'));
          continue;
        }
        state.referenceMap[task.draftRef] = expectedTaskId;
      } catch (cause) {
        failures.push(throwToFailure('task_create', task.draftRef, cause));
      }
    }

    return receipt({
      workflowRunId,
      revision: draft.revision,
      ...state,
      failures,
    });
  }
}
