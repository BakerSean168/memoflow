import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  AIWorkflowResumeCommandSchema,
  AIWorkflowSuspensionSchema,
  KnowledgeCaptureExecutionReceiptSchema,
  KnowledgeCaptureWorkflowInputSchema,
  KnowledgeClarificationStateSchema,
  KnowledgeDraftSchema,
  type KnowledgeCaptureDecision,
  type KnowledgeCaptureWorkflowInput,
} from '@memoflow/ai-contracts';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import type {
  KnowledgeCapturePlannerMode,
  KnowledgeCapturePlannerPort,
} from '../agents/knowledge-capture.planner';
import { ApplyKnowledgeNoteService } from './apply-knowledge-note.service';
import { knowledgeCaptureDocumentId } from './deterministic-entity-id';

export const KNOWLEDGE_CAPTURE_WORKFLOW_ID = 'knowledge-capture';
export const KNOWLEDGE_CAPTURE_LIFECYCLE_STEP_ID = 'knowledge-capture-lifecycle';
const MAX_CLARIFICATION_ROUNDS = 3;

export const KnowledgeCaptureWorkflowStateSchema = z
  .object({
    phase: z.enum([
      'planning',
      'applying',
      'clarification',
      'review',
      'recovery',
      'completed',
      'cancelled',
    ]),
    input: KnowledgeCaptureWorkflowInputSchema,
    clarification: KnowledgeClarificationStateSchema,
    pendingQuestions: z.array(z.string().min(1)).max(3),
    planningMode: z.enum(['initial', 'revise', 'regenerate']),
    revisionInstruction: z.string().optional(),
    targetRevision: z.number().int().positive(),
    draft: KnowledgeDraftSchema.optional(),
    priorReceipt: KnowledgeCaptureExecutionReceiptSchema.optional(),
  })
  .strict();
export type KnowledgeCaptureWorkflowState = z.infer<typeof KnowledgeCaptureWorkflowStateSchema>;

export const KnowledgeCaptureWorkflowOutputSchema = z.discriminatedUnion('outcome', [
  z
    .object({
      outcome: z.literal('completed'),
      receipt: KnowledgeCaptureExecutionReceiptSchema,
    })
    .strict(),
  z.object({ outcome: z.literal('cancelled') }).strict(),
]);
export type KnowledgeCaptureWorkflowOutput = z.infer<typeof KnowledgeCaptureWorkflowOutputSchema>;

export function initialKnowledgeCaptureWorkflowState(
  input: KnowledgeCaptureWorkflowInput,
): KnowledgeCaptureWorkflowState {
  return KnowledgeCaptureWorkflowStateSchema.parse({
    phase: 'planning',
    input,
    clarification: { rounds: [] as never[] },
    pendingQuestions: [],
    planningMode: 'initial',
    targetRevision: 1,
  });
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function currentExecutionContext(
  requestContext: { getRaw(key: string): unknown },
  identityId: string,
): ExecutionContext {
  const raw = requestContext.getRaw('executionContext');
  if (!plainRecord(raw) || raw.identityId !== identityId) {
    throw new Error('knowledge.capture workflow requires current authenticated ExecutionContext');
  }
  const { requestId, traceId, startedAt, source } = raw;
  if (
    typeof requestId !== 'string' ||
    typeof traceId !== 'string' ||
    typeof startedAt !== 'number' ||
    !['http', 'ipc', 'system'].includes(String(source))
  ) {
    throw new Error('knowledge.capture workflow received an invalid ExecutionContext');
  }
  return {
    identityId,
    requestId,
    traceId,
    startedAt,
    source: source as 'http' | 'ipc' | 'system',
  };
}

function stripRevision(draft: {
  title: string;
  topic: string;
  markdown: string;
  targetSubpath: string;
  tags: string[];
}): { title: string; topic: string; markdown: string; targetSubpath: string; tags: string[] } {
  const { title, topic, markdown, targetSubpath, tags } = draft;
  return { title, topic, markdown, targetSubpath, tags };
}

export function createKnowledgeCaptureWorkflow(input: {
  planner: KnowledgeCapturePlannerPort;
  applyService: ApplyKnowledgeNoteService;
}) {
  const lifecycle = createStep({
    id: KNOWLEDGE_CAPTURE_LIFECYCLE_STEP_ID,
    inputSchema: KnowledgeCaptureWorkflowInputSchema,
    outputSchema: KnowledgeCaptureWorkflowOutputSchema,
    stateSchema: KnowledgeCaptureWorkflowStateSchema,
    resumeSchema: AIWorkflowResumeCommandSchema,
    suspendSchema: AIWorkflowSuspensionSchema,
    execute: async ({ inputData, state, setState, resumeData, suspend, runId, requestContext }) => {
      let current = KnowledgeCaptureWorkflowStateSchema.parse(state);
      const workflowInput = KnowledgeCaptureWorkflowInputSchema.parse(inputData);
      if (
        workflowInput.identityId !== current.input.identityId ||
        workflowInput.conversationId !== current.input.conversationId
      ) {
        throw new Error('knowledge.capture workflow input no longer matches persisted state');
      }

      const persist = async (next: KnowledgeCaptureWorkflowState): Promise<void> => {
        current = KnowledgeCaptureWorkflowStateSchema.parse(next);
        await setState(current);
      };

      const handlePlanningDecision = async (
        decision: KnowledgeCaptureDecision,
        targetRevision: number,
      ) => {
        if (decision.status === 'needs_clarification') {
          if (current.clarification.rounds.length >= MAX_CLARIFICATION_ROUNDS) {
            throw new Error('AI_KNOWLEDGE_CLARIFICATION_LIMIT_EXCEEDED');
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

        const draft = KnowledgeDraftSchema.parse({
          ...stripRevision(decision.candidateDraft),
          knowledgeDocumentId: knowledgeCaptureDocumentId({ workflowRunId: runId }),
          // knowledge.capture only runs on Desktop, where the unlocked profile
          // has at most one owner-selected local Vault. A host without this
          // capability never registers the workflow.
          source: current.draft?.source ?? { kind: 'local_vault' },
          revision: targetRevision,
        });
        // The reviewed-dialog era ended with #1097: the draft is written as
        // soon as the planner produces it. Failures still suspend for an
        // explicit retry/cancel instead of pretending success.
        await persist({
          ...current,
          phase: 'applying',
          draft,
          pendingQuestions: [],
          planningMode: 'initial',
          revisionInstruction: undefined,
          targetRevision: draft.revision,
          priorReceipt: undefined,
        });
        return applyAndResolve();
      };

      const planAndSuspend = async (options: {
        mode: KnowledgeCapturePlannerMode;
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
        if (!current.draft) throw new Error('knowledge.capture approve requires a persisted draft');
        if (!current.draft.source)
          throw new Error('knowledge.capture approve requires an owner-selected source');
        const receipt = await input.applyService.apply({
          workflowRunId: runId,
          draft: current.draft,
          context: currentExecutionContext(requestContext, current.input.identityId),
          priorReceipt,
        });
        if (receipt.status === 'success') {
          await persist({ ...current, phase: 'completed', priorReceipt: receipt });
          return KnowledgeCaptureWorkflowOutputSchema.parse({ outcome: 'completed', receipt });
        }
        await persist({ ...current, phase: 'recovery', priorReceipt: receipt });
        return await suspend({
          type: 'recovery_required' as const,
          message: 'The approved knowledge-note draft could not be saved.',
          retryable: receipt.retryable,
          failures: receipt.failures,
          receipt: { kind: 'knowledge.capture' as const, receipt },
        });
      };

      if (!resumeData) {
        if (current.phase !== 'planning') {
          throw new Error(`knowledge.capture cannot start lifecycle from phase ${current.phase}`);
        }
        return planAndSuspend({
          mode: current.planningMode,
          targetRevision: current.targetRevision,
          instruction: current.revisionInstruction,
        });
      }

      if (resumeData.type === 'cancel') {
        await persist({ ...current, phase: 'cancelled' });
        return KnowledgeCaptureWorkflowOutputSchema.parse({ outcome: 'cancelled' });
      }

      if (current.phase === 'clarification') {
        if (resumeData.type !== 'answer') {
          throw new Error('knowledge.capture clarification requires an answer command');
        }
        if (current.pendingQuestions.length === 0 || resumeData.answers.length === 0) {
          throw new Error(
            'knowledge.capture clarification answer count does not match pending questions',
          );
        }
        const nextClarification = KnowledgeClarificationStateSchema.parse({
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
        // A run suspended by the retired draft-review contract must never be
        // written implicitly after an upgrade. Any resume explicitly retires
        // the stale draft instead of applying it.
        await persist({ ...current, phase: 'cancelled', draft: undefined });
        return KnowledgeCaptureWorkflowOutputSchema.parse({ outcome: 'cancelled' });
      }

      if (current.phase === 'recovery') {
        const priorReceipt = current.priorReceipt;
        if (!priorReceipt)
          throw new Error('knowledge.capture recovery phase is missing its receipt');
        if (resumeData.type === 'retry') {
          if (!priorReceipt.retryable) {
            throw new Error('knowledge.capture recovery has no retryable mutations');
          }
          return applyAndResolve(priorReceipt);
        }
        if (resumeData.type === 'accept_partial') {
          throw new Error('knowledge.capture has no partial business result to accept');
        }
        if (resumeData.type === 'cancel_remaining') {
          await persist({ ...current, phase: 'cancelled' });
          return KnowledgeCaptureWorkflowOutputSchema.parse({ outcome: 'cancelled' });
        }
        throw new Error(`Unsupported knowledge.capture recovery command: ${resumeData.type}`);
      }

      throw new Error(`knowledge.capture cannot resume lifecycle from phase ${current.phase}`);
    },
  });

  return createWorkflow({
    id: KNOWLEDGE_CAPTURE_WORKFLOW_ID,
    inputSchema: KnowledgeCaptureWorkflowInputSchema,
    outputSchema: KnowledgeCaptureWorkflowOutputSchema,
    stateSchema: KnowledgeCaptureWorkflowStateSchema,
  })
    .then(lifecycle)
    .commit();
}
