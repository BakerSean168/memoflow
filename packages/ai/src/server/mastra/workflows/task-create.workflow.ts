import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  AIWorkflowResumeCommandSchema,
  AIWorkflowSuspensionSchema,
  TaskClarificationStateSchema,
  TaskCreateWorkflowInputSchema,
  TaskPlanDraftContentSchema,
  TaskPlanDraftSchema,
  TaskPlanExecutionReceiptSchema,
  type TaskPlanDraft,
  type TaskPlanningDecision,
} from '@memoflow/contracts/ai';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { TaskPlannerMode, TaskPlannerPort } from '../agents/task-planner.worker';
import { ApplyTaskPlanService } from './apply-task-plan.service';

export const TASK_CREATE_WORKFLOW_ID = 'task-create';
export const TASK_CREATE_LIFECYCLE_STEP_ID = 'task-create-lifecycle';
const MAX_CLARIFICATION_ROUNDS = 3;

export const TaskCreateWorkflowStateSchema = z
  .object({
    phase: z.enum(['planning', 'clarification', 'review', 'recovery', 'completed', 'cancelled']),
    input: TaskCreateWorkflowInputSchema,
    clarification: TaskClarificationStateSchema,
    pendingQuestions: z.array(z.string().min(1)).max(3),
    planningMode: z.enum(['initial', 'revise', 'regenerate']),
    revisionInstruction: z.string().optional(),
    targetRevision: z.number().int().positive(),
    draft: TaskPlanDraftSchema.optional(),
    priorReceipt: TaskPlanExecutionReceiptSchema.optional(),
  })
  .strict();
export type TaskCreateWorkflowState = z.infer<typeof TaskCreateWorkflowStateSchema>;

export const TaskCreateWorkflowOutputSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('completed'), receipt: TaskPlanExecutionReceiptSchema }).strict(),
  z.object({ outcome: z.literal('cancelled') }).strict(),
]);
export type TaskCreateWorkflowOutput = z.infer<typeof TaskCreateWorkflowOutputSchema>;

export function initialTaskCreateWorkflowState(
  input: z.infer<typeof TaskCreateWorkflowInputSchema>,
): TaskCreateWorkflowState {
  return TaskCreateWorkflowStateSchema.parse({
    phase: 'planning',
    input,
    clarification: { rounds: [] },
    pendingQuestions: [],
    planningMode: 'initial',
    targetRevision: 1,
  });
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const dangerousPatchKeys = new Set(['__proto__', 'prototype', 'constructor']);
const allowedDraftPatchKeys = new Set(['task', 'rationale', 'warnings']);

function mergeStructuredPatch(base: unknown, patch: unknown): unknown {
  if (!plainRecord(patch) || !plainRecord(base)) return patch;
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (dangerousPatchKeys.has(key)) throw new Error(`Unsafe structured patch key: ${key}`);
    result[key] = key in base ? mergeStructuredPatch(base[key], value) : value;
  }
  return result;
}

function applyStructuredDraftPatch(
  draft: TaskPlanDraft,
  patch: Record<string, unknown>,
): TaskPlanDraft {
  for (const key of Object.keys(patch)) {
    if (!allowedDraftPatchKeys.has(key)) {
      throw new Error(`Unsupported task draft patch field: ${key}`);
    }
  }
  const { revision: _revision, ...content } = draft;
  const merged = mergeStructuredPatch(content, patch);
  const parsed = TaskPlanDraftContentSchema.parse(merged);
  return TaskPlanDraftSchema.parse({ ...parsed, revision: draft.revision + 1 });
}

function currentExecutionContext(
  requestContext: { getRaw(key: string): unknown },
  identityId: string,
): ExecutionContext {
  const raw = requestContext.getRaw('executionContext');
  if (!plainRecord(raw) || raw.identityId !== identityId) {
    throw new Error('task.create workflow requires current authenticated ExecutionContext');
  }
  const { requestId, traceId, startedAt, source } = raw;
  if (
    typeof requestId !== 'string' ||
    typeof traceId !== 'string' ||
    typeof startedAt !== 'number' ||
    !['http', 'ipc', 'system'].includes(String(source))
  ) {
    throw new Error('task.create workflow received an invalid ExecutionContext');
  }
  return {
    identityId,
    requestId,
    traceId,
    startedAt,
    source: source as 'http' | 'ipc' | 'system',
  };
}

export function createTaskCreateWorkflow(input: {
  planner: TaskPlannerPort;
  applyService: ApplyTaskPlanService;
}) {
  const lifecycle = createStep({
    id: TASK_CREATE_LIFECYCLE_STEP_ID,
    inputSchema: TaskCreateWorkflowInputSchema,
    outputSchema: TaskCreateWorkflowOutputSchema,
    stateSchema: TaskCreateWorkflowStateSchema,
    resumeSchema: AIWorkflowResumeCommandSchema,
    suspendSchema: AIWorkflowSuspensionSchema,
    execute: async ({ inputData, state, setState, resumeData, suspend, runId, requestContext }) => {
      let current = TaskCreateWorkflowStateSchema.parse(state);
      const workflowInput = TaskCreateWorkflowInputSchema.parse(inputData);
      if (
        workflowInput.identityId !== current.input.identityId ||
        workflowInput.conversationId !== current.input.conversationId
      ) {
        throw new Error('task.create workflow input no longer matches persisted state');
      }

      const persist = async (next: TaskCreateWorkflowState): Promise<void> => {
        current = TaskCreateWorkflowStateSchema.parse(next);
        await setState(current);
      };

      const suspendReview = async (draft: TaskPlanDraft) => {
        await persist({
          ...current,
          phase: 'review',
          draft,
          pendingQuestions: [],
          planningMode: 'initial',
          revisionInstruction: undefined,
          targetRevision: draft.revision,
          priorReceipt: undefined,
        });
        return await suspend({
          type: 'task_draft_review' as const,
          draft,
          warnings: draft.warnings,
          revision: draft.revision,
        });
      };

      const handlePlanningDecision = async (
        decision: TaskPlanningDecision,
        targetRevision: number,
      ) => {
        if (decision.status === 'needs_clarification') {
          if (current.clarification.rounds.length >= MAX_CLARIFICATION_ROUNDS) {
            throw new Error('AI_TASK_CLARIFICATION_LIMIT_EXCEEDED');
          }
          await persist({
            ...current,
            phase: 'clarification',
            pendingQuestions: decision.questions,
            targetRevision,
          });
          return await suspend({
            type: 'clarification_required' as const,
            questions: decision.questions,
            round: current.clarification.rounds.length + 1,
          });
        }

        const draft = TaskPlanDraftSchema.parse({
          ...decision.candidateDraft,
          revision: targetRevision,
        });
        return suspendReview(draft);
      };

      const planAndSuspend = async (options: {
        mode: TaskPlannerMode;
        targetRevision: number;
        instruction?: string;
        forceDraft?: boolean;
      }) => {
        await persist({
          ...current,
          phase: 'planning',
          planningMode: options.mode,
          revisionInstruction: options.instruction,
          targetRevision: options.targetRevision,
        });
        requestContext.setRaw('workflowRunId', runId);
        const decision = await input.planner.plan(
          {
            input: current.input,
            clarification: current.clarification,
            mode: options.mode,
            currentDraft: current.draft,
            instruction: options.instruction,
            forceDraft: options.forceDraft,
          },
          requestContext,
        );
        return handlePlanningDecision(decision, options.targetRevision);
      };

      const applyAndResolve = async (priorReceipt = current.priorReceipt) => {
        if (!current.draft) throw new Error('task.create approve requires a persisted draft');
        const receipt = await input.applyService.apply({
          workflowRunId: runId,
          draft: current.draft,
          context: currentExecutionContext(requestContext, current.input.identityId),
          priorReceipt,
        });
        if (receipt.status === 'success') {
          await persist({
            ...current,
            phase: 'completed',
            priorReceipt: receipt,
          });
          return TaskCreateWorkflowOutputSchema.parse({ outcome: 'completed', receipt });
        }
        await persist({
          ...current,
          phase: 'recovery',
          priorReceipt: receipt,
        });
        return await suspend({
          type: 'recovery_required' as const,
          message:
            receipt.status === 'partial'
              ? 'Some approved task-plan mutations did not complete.'
              : 'The approved task plan could not be applied.',
          retryable: receipt.retryable,
          failures: receipt.failures,
        });
      };

      if (!resumeData) {
        if (current.phase !== 'planning') {
          throw new Error(`task.create cannot start lifecycle from phase ${current.phase}`);
        }
        return planAndSuspend({
          mode: current.planningMode,
          targetRevision: current.targetRevision,
          instruction: current.revisionInstruction,
        });
      }

      if (resumeData.type === 'cancel') {
        await persist({ ...current, phase: 'cancelled' });
        return TaskCreateWorkflowOutputSchema.parse({ outcome: 'cancelled' });
      }

      if (current.phase === 'clarification') {
        if (resumeData.type !== 'answer') {
          throw new Error('task.create clarification requires an answer command');
        }
        if (
          current.pendingQuestions.length === 0 ||
          current.pendingQuestions.length !== resumeData.answers.length
        ) {
          throw new Error(
            'task.create clarification answer count does not match pending questions',
          );
        }
        const nextClarification = TaskClarificationStateSchema.parse({
          rounds: [
            ...current.clarification.rounds,
            {
              round: current.clarification.rounds.length + 1,
              questions: current.pendingQuestions,
              answers: resumeData.answers,
            },
          ],
        });
        await persist({
          ...current,
          phase: 'planning',
          clarification: nextClarification,
          pendingQuestions: [],
        });
        const forceDraft = nextClarification.rounds.length >= MAX_CLARIFICATION_ROUNDS;
        return planAndSuspend({
          mode: current.planningMode,
          targetRevision: current.targetRevision,
          instruction: current.revisionInstruction,
          forceDraft,
        });
      }

      if (current.phase === 'review') {
        if (!current.draft) throw new Error('task.create review phase is missing its draft');
        if (resumeData.type === 'approve') return applyAndResolve();
        if (resumeData.type === 'edit_structured') {
          return suspendReview(applyStructuredDraftPatch(current.draft, resumeData.patch));
        }
        if (resumeData.type === 'revise_natural_language') {
          return planAndSuspend({
            mode: 'revise',
            targetRevision: current.draft.revision + 1,
            instruction: resumeData.instruction,
          });
        }
        if (resumeData.type === 'regenerate') {
          return planAndSuspend({
            mode: 'regenerate',
            targetRevision: current.draft.revision + 1,
          });
        }
        throw new Error(`Unsupported task.create review command: ${resumeData.type}`);
      }

      if (current.phase === 'recovery') {
        const priorReceipt = current.priorReceipt;
        if (!priorReceipt) throw new Error('task.create recovery phase is missing its receipt');
        if (resumeData.type === 'retry') {
          if (!priorReceipt.retryable) {
            throw new Error('task.create recovery has no retryable mutations');
          }
          return applyAndResolve(priorReceipt);
        }
        if (resumeData.type === 'accept_partial') {
          if (priorReceipt.status !== 'partial' || !priorReceipt.taskPlanId) {
            throw new Error('task.create has no partial business result to accept');
          }
          await persist({ ...current, phase: 'completed' });
          return TaskCreateWorkflowOutputSchema.parse({
            outcome: 'completed',
            receipt: priorReceipt,
          });
        }
        if (resumeData.type === 'cancel_remaining') {
          if (priorReceipt.status === 'partial' && priorReceipt.taskPlanId) {
            await persist({ ...current, phase: 'completed' });
            return TaskCreateWorkflowOutputSchema.parse({
              outcome: 'completed',
              receipt: priorReceipt,
            });
          }
          await persist({ ...current, phase: 'cancelled' });
          return TaskCreateWorkflowOutputSchema.parse({ outcome: 'cancelled' });
        }
        throw new Error(`Unsupported task.create recovery command: ${resumeData.type}`);
      }

      throw new Error(`task.create cannot resume lifecycle from phase ${current.phase}`);
    },
  });

  return createWorkflow({
    id: TASK_CREATE_WORKFLOW_ID,
    inputSchema: TaskCreateWorkflowInputSchema,
    outputSchema: TaskCreateWorkflowOutputSchema,
    stateSchema: TaskCreateWorkflowStateSchema,
  })
    .then(lifecycle)
    .commit();
}
