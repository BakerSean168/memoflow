import { goalWorkflowEntityId } from './deterministic-entity-id';
import { AIWorkflowPublicError } from '../../../shared/ai-workflow-error';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  AIWorkflowResumeCommandSchema,
  AIWorkflowSuspensionSchema,
  GoalClarificationStateSchema,
  GoalCreateWorkflowInputSchema,
  GoalPlanDraftContentSchema,
  GoalPlanDraftSchema,
  GoalWorkflowLiveActionJournalSchema,
  GoalPlanExecutionReceiptSchema,
  GoalResearchEvidenceSchema,
  type GoalPlanDraft,
  type GoalResearchEvidence,
  type GoalPlanningDecision,
} from '@memoflow/ai-contracts';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import {
  readGoalPlannerResearchEvidence,
  type GoalPlannerMode,
  type GoalPlannerPort,
} from '../agents/goal-planner.worker';
import { ApplyGoalPlanService } from './apply-goal-plan.service';
import {
  GOAL_WORKFLOW_LIVE_ACTION_SINK_KEY,
  appendGoalWorkflowLiveAction,
  publishRunningGoalActions,
  type GoalWorkflowLiveActionSink,
} from './goal-business-action-journal';

export const GOAL_CREATE_WORKFLOW_ID = 'goal-create';
export const GOAL_CREATE_LIFECYCLE_STEP_ID = 'goal-create-lifecycle';
const MAX_CLARIFICATION_ROUNDS = 3;

export const GoalCreateWorkflowStateSchema = z
  .object({
    phase: z.enum(['planning', 'clarification', 'review', 'recovery', 'completed', 'cancelled']),
    input: GoalCreateWorkflowInputSchema,
    clarification: GoalClarificationStateSchema,
    pendingQuestions: z.array(z.string().min(1)).max(3),
    planningMode: z.enum(['initial', 'revise', 'regenerate']),
    revisionInstruction: z.string().optional(),
    targetRevision: z.number().int().positive(),
    researchEvidence: z.array(GoalResearchEvidenceSchema).max(8).default([]),
    liveActions: GoalWorkflowLiveActionJournalSchema.default([]),
    draft: GoalPlanDraftSchema.optional(),
    priorReceipt: GoalPlanExecutionReceiptSchema.optional(),
  })
  .strict();
export type GoalCreateWorkflowState = z.infer<typeof GoalCreateWorkflowStateSchema>;

export const GoalCreateWorkflowOutputSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('completed'), receipt: GoalPlanExecutionReceiptSchema }).strict(),
  z.object({ outcome: z.literal('cancelled') }).strict(),
]);
export type GoalCreateWorkflowOutput = z.infer<typeof GoalCreateWorkflowOutputSchema>;

export function initialGoalCreateWorkflowState(
  input: z.infer<typeof GoalCreateWorkflowInputSchema>,
): GoalCreateWorkflowState {
  return GoalCreateWorkflowStateSchema.parse({
    phase: 'planning',
    input,
    clarification: { rounds: [] },
    pendingQuestions: [],
    planningMode: 'initial',
    targetRevision: 1,
    researchEvidence: [],
    ...(input.sourceDraft &&
    GoalPlanDraftSchema.safeParse({ ...input.sourceDraft.draft, revision: 1 }).success
      ? { draft: { ...input.sourceDraft.draft, revision: 1 } }
      : {}),
  });
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const dangerousPatchKeys = new Set(['__proto__', 'prototype', 'constructor']);
const allowedDraftPatchKeys = new Set([
  'goal',
  'keyResults',
  'tasks',
  'knowledge',
  'rationale',
  'warnings',
]);

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
  draft: GoalPlanDraft,
  patch: Record<string, unknown>,
): GoalPlanDraft {
  for (const key of Object.keys(patch)) {
    if (!allowedDraftPatchKeys.has(key)) {
      throw new Error(`Unsupported goal draft patch field: ${key}`);
    }
  }
  const { revision: _revision, ...content } = draft;
  const merged = mergeStructuredPatch(content, patch);
  const parsed = GoalPlanDraftContentSchema.parse(merged);
  return GoalPlanDraftSchema.parse({ ...parsed, revision: draft.revision + 1 });
}

function mergeGoalResearchEvidence(
  existing: readonly GoalResearchEvidence[],
  incoming: readonly GoalResearchEvidence[],
): GoalResearchEvidence[] {
  const merged = new Map<string, GoalResearchEvidence>();
  for (const evidence of [...existing, ...incoming]) {
    const parsed = GoalResearchEvidenceSchema.parse(evidence);
    merged.set(`${parsed.intent}:${parsed.query.trim().toLowerCase()}`, parsed);
  }
  return [...merged.values()].slice(-8);
}

function currentExecutionContext(
  requestContext: { getRaw(key: string): unknown },
  identityId: string,
): ExecutionContext {
  const raw = requestContext.getRaw('executionContext');
  if (!plainRecord(raw) || raw.identityId !== identityId) {
    throw new Error('goal.create workflow requires current authenticated ExecutionContext');
  }
  const { requestId, traceId, startedAt, source } = raw;
  if (
    typeof requestId !== 'string' ||
    typeof traceId !== 'string' ||
    typeof startedAt !== 'number' ||
    !['http', 'ipc', 'system'].includes(String(source))
  ) {
    throw new Error('goal.create workflow received an invalid ExecutionContext');
  }
  return {
    identityId,
    requestId,
    traceId,
    startedAt,
    source: source as 'http' | 'ipc' | 'system',
  };
}

export function createGoalCreateWorkflow(input: {
  planner: GoalPlannerPort;
  applyService: ApplyGoalPlanService;
  /** Must be the same Mastra storage instance as the registered Workflow. */
  liveActionStorage?: Pick<MastraCompositeStore, 'getStore'>;
}) {
  const lifecycle = createStep({
    id: GOAL_CREATE_LIFECYCLE_STEP_ID,
    inputSchema: GoalCreateWorkflowInputSchema,
    outputSchema: GoalCreateWorkflowOutputSchema,
    stateSchema: GoalCreateWorkflowStateSchema,
    resumeSchema: AIWorkflowResumeCommandSchema,
    suspendSchema: AIWorkflowSuspensionSchema,
    execute: async ({ inputData, state, setState, resumeData, suspend, runId, requestContext }) => {
      let current = GoalCreateWorkflowStateSchema.parse(state);
      const workflowInput = GoalCreateWorkflowInputSchema.parse(inputData);
      if (
        workflowInput.identityId !== current.input.identityId ||
        workflowInput.conversationId !== current.input.conversationId
      ) {
        throw new Error('goal.create workflow input no longer matches persisted state');
      }

      const persist = async (next: GoalCreateWorkflowState): Promise<void> => {
        current = GoalCreateWorkflowStateSchema.parse(next);
        await setState(current);
      };

      const suspendReview = async (draft: GoalPlanDraft) => {
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
          type: 'goal_draft_review' as const,
          draft,
          warnings: draft.warnings,
          revision: draft.revision,
          ...(current.researchEvidence.length > 0
            ? { researchEvidence: current.researchEvidence }
            : {}),
          ownerCreate: {
            goalId: goalWorkflowEntityId({
              workflowRunId: runId,
              revision: draft.revision,
              kind: 'goal',
              draftRef: 'goal',
            }),
            keyResultIds: Object.fromEntries(
              draft.keyResults.map((item) => [
                item.draftRef,
                goalWorkflowEntityId({
                  workflowRunId: runId,
                  revision: draft.revision,
                  kind: 'key_result',
                  draftRef: item.draftRef,
                }),
              ]),
            ),
          },
        });
      };

      const handlePlanningDecision = async (
        decision: GoalPlanningDecision,
        targetRevision: number,
      ) => {
        if (decision.status === 'needs_clarification') {
          if (current.clarification.rounds.length >= MAX_CLARIFICATION_ROUNDS) {
            throw new Error('AI_GOAL_CLARIFICATION_LIMIT_EXCEEDED');
          }
          const candidateDraft = decision.candidateDraft
            ? GoalPlanDraftSchema.parse({ ...decision.candidateDraft, revision: targetRevision })
            : current.draft?.revision === targetRevision
              ? current.draft
              : undefined;
          await persist({
            ...current,
            phase: 'clarification',
            pendingQuestions: decision.questions,
            targetRevision,
            draft: candidateDraft,
          });
          return await suspend({
            type: 'clarification_required' as const,
            questions: decision.questions,
            round: current.clarification.rounds.length + 1,
            ...(current.researchEvidence.length > 0
              ? { researchEvidence: current.researchEvidence }
              : {}),
            ...(candidateDraft ? { candidateDraft } : {}),
          });
        }

        const draft = GoalPlanDraftSchema.parse({
          ...decision.candidateDraft,
          revision: targetRevision,
        });
        return suspendReview(draft);
      };

      const planAndSuspend = async (options: {
        mode: GoalPlannerMode;
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
        let accepting = true;
        let actionQueue: Promise<unknown> = Promise.resolve();
        const sink: GoalWorkflowLiveActionSink = {
          identityId: current.input.identityId,
          runId,
          revision: options.targetRevision,
          append(command) {
            // Mastra may dispatch independent tool calls concurrently. Serialize
            // the workflow state mutation before acknowledging each staged action.
            const append = actionQueue.then(async () => {
              if (
                !accepting ||
                current.phase !== 'planning' ||
                current.targetRevision !== options.targetRevision ||
                requestContext.getRaw('identityId') !== current.input.identityId
              ) {
                throw new Error('Goal action workflow owner is no longer active');
              }
              const recorded = appendGoalWorkflowLiveAction({
                journal: current.liveActions,
                command,
                revision: options.targetRevision,
              });
              if (!recorded.duplicate) {
                await persist({ ...current, liveActions: recorded.journal });
                if (input.liveActionStorage) {
                  await publishRunningGoalActions({
                    storage: input.liveActionStorage,
                    identityId: current.input.identityId,
                    runId,
                    journal: recorded.journal,
                  });
                }
              }
              return recorded.record;
            });
            actionQueue = append.then(
              () => undefined,
              () => undefined,
            );
            return append;
          },
        };
        requestContext.setRaw(GOAL_WORKFLOW_LIVE_ACTION_SINK_KEY, sink);
        try {
          const decision = await input.planner.plan(
            {
              input: current.input,
              clarification: current.clarification,
              mode: options.mode,
              currentDraft: current.draft,
              researchEvidence: current.researchEvidence,
              instruction: options.instruction,
              forceDraft: options.forceDraft,
            },
            requestContext,
          );
          await actionQueue;
          const newResearchEvidence = readGoalPlannerResearchEvidence(requestContext);
          if (newResearchEvidence.length > 0) {
            const researchEvidence = mergeGoalResearchEvidence(
              current.researchEvidence,
              newResearchEvidence,
            );
            await persist({ ...current, researchEvidence });
          }
          return handlePlanningDecision(decision, options.targetRevision);
        } catch (error) {
          throw new AIWorkflowPublicError(error);
        } finally {
          accepting = false;
          requestContext.setRaw(GOAL_WORKFLOW_LIVE_ACTION_SINK_KEY, null);
        }
      };

      const applyAndResolve = async (priorReceipt = current.priorReceipt) => {
        if (!current.draft) throw new Error('goal.create approve requires a persisted draft');
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
          return GoalCreateWorkflowOutputSchema.parse({ outcome: 'completed', receipt });
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
              ? 'Some approved goal-plan mutations did not complete.'
              : 'The approved goal plan could not be applied.',
          retryable: receipt.retryable,
          failures: receipt.failures,
          receipt: { kind: 'goal.create' as const, receipt },
        });
      };

      if (!resumeData) {
        if (current.phase !== 'planning') {
          throw new Error(`goal.create cannot start lifecycle from phase ${current.phase}`);
        }
        return planAndSuspend({
          mode: current.planningMode,
          targetRevision: current.targetRevision,
          instruction: current.revisionInstruction,
        });
      }

      if (resumeData.type === 'cancel') {
        await persist({ ...current, phase: 'cancelled' });
        return GoalCreateWorkflowOutputSchema.parse({ outcome: 'cancelled' });
      }

      if (current.phase === 'clarification') {
        if (resumeData.type === 'edit_structured') {
          if (!current.draft)
            throw new Error('goal.create clarification has no draft to reconcile');
          const reconciledDraft = applyStructuredDraftPatch(current.draft, resumeData.patch);
          await persist({
            ...current,
            draft: reconciledDraft,
            targetRevision: reconciledDraft.revision,
          });
          return await suspend({
            type: 'clarification_required' as const,
            questions: current.pendingQuestions,
            round: current.clarification.rounds.length + 1,
            candidateDraft: reconciledDraft,
            ...(current.researchEvidence.length > 0
              ? { researchEvidence: current.researchEvidence }
              : {}),
          });
        }
        if (resumeData.type !== 'answer') {
          throw new Error('goal.create clarification requires an answer command');
        }
        if (current.pendingQuestions.length === 0 || resumeData.answers.length === 0) {
          throw new Error(
            'goal.create clarification answer count does not match pending questions',
          );
        }
        const response = resumeData.answers.join('\n').trim();
        const nextClarification = GoalClarificationStateSchema.parse({
          rounds: [
            ...current.clarification.rounds,
            {
              round: current.clarification.rounds.length + 1,
              questions: current.pendingQuestions,
              answers: resumeData.answers,
              response,
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
        if (!current.draft) throw new Error('goal.create review phase is missing its draft');
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
        throw new Error(`Unsupported goal.create review command: ${resumeData.type}`);
      }

      if (current.phase === 'recovery') {
        const priorReceipt = current.priorReceipt;
        if (!priorReceipt) throw new Error('goal.create recovery phase is missing its receipt');
        if (resumeData.type === 'retry') {
          if (!priorReceipt.retryable) {
            throw new Error('goal.create recovery has no retryable mutations');
          }
          return applyAndResolve(priorReceipt);
        }
        if (resumeData.type === 'accept_partial') {
          if (priorReceipt.status !== 'partial' || !priorReceipt.referenceMap.goal) {
            throw new Error('goal.create has no partial business result to accept');
          }
          await persist({ ...current, phase: 'completed' });
          return GoalCreateWorkflowOutputSchema.parse({
            outcome: 'completed',
            receipt: priorReceipt,
          });
        }
        if (resumeData.type === 'cancel_remaining') {
          if (priorReceipt.status === 'partial' && Boolean(priorReceipt.referenceMap.goal)) {
            await persist({ ...current, phase: 'completed' });
            return GoalCreateWorkflowOutputSchema.parse({
              outcome: 'completed',
              receipt: priorReceipt,
            });
          }
          await persist({ ...current, phase: 'cancelled' });
          return GoalCreateWorkflowOutputSchema.parse({ outcome: 'cancelled' });
        }
        throw new Error(`Unsupported goal.create recovery command: ${resumeData.type}`);
      }

      throw new Error(`goal.create cannot resume lifecycle from phase ${current.phase}`);
    },
  });

  return createWorkflow({
    id: GOAL_CREATE_WORKFLOW_ID,
    inputSchema: GoalCreateWorkflowInputSchema,
    outputSchema: GoalCreateWorkflowOutputSchema,
    stateSchema: GoalCreateWorkflowStateSchema,
  })
    .then(lifecycle)
    .commit();
}
