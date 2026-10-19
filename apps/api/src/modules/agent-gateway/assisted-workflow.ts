import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  AssistedStartSchema, AssistedHandleSchema, AssistedResumeSchema, AssistedViewSchema,
  GatewayTaskReceiptSchema,
  type AssistedStart, type AssistedView,
} from '@memoflow/contracts/agent-gateway';
import {
  AIWorkflowRunViewSchema, TaskPlanExecutionReceiptSchema,
  type AIWorkflowRunView, type AIWorkflowResumeCommand,
} from '@memoflow/contracts/ai';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { GatewayReadError, type GatewayWriteAuthority, type GatewayAssistedPort } from '@memoflow/agent-gateway';
import type { AIWorkflowRuntimePort, ExternalWorkflowInvocation, AiAssistedWorkflowRepository } from '@memoflow/ai';
import type { AiAssistedWorkflow } from '@memoflow/database';
import type { GatewayWritePort } from '@memoflow/agent-gateway';

const PendingSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('start') }),
  z.strictObject({ type: z.literal('resume'), command: AssistedResumeSchema.shape.command, beforeDigest: z.string() }),
  z.strictObject({ type: z.literal('cancel') }),
]);
const StepsSchema = z.array(GatewayTaskReceiptSchema);
// Schema-parsed values have stable field ordering; hash only canonical typed projections.
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const token = (run: AIWorkflowRunView) => run.status === 'suspended' ? digest(run.suspension) : undefined;
const terminal = (run: AIWorkflowRunView) => ['completed', 'failed', 'cancelled'].includes(run.status);

interface Options {
  repository: AiAssistedWorkflowRepository;
  runtime: AIWorkflowRuntimePort;
  recoverStep: (row: AiAssistedWorkflow) => Promise<z.infer<typeof GatewayTaskReceiptSchema> | null>;
  writes: (guard: { handleId: string; pendingJson: string }) => GatewayWritePort;
}
/** Connection-bound projection over the existing durable runtime, not an executor. */
export function bindAssistedWorkflow(options: Options): GatewayAssistedPort {
  const { repository: repo, runtime } = options;
  async function authorize(authority: GatewayWriteAuthority) {
    if (!authority.scopes.includes('tasks:write')) throw new GatewayReadError('FORBIDDEN');
    await authority.authorize();
  }
  function invocation(row: AiAssistedWorkflow, cx: ExecutionContext, authority: GatewayWriteAuthority, assertLock: () => void): ExternalWorkflowInvocation {
    return {
      connectionId: row.connectionId,
      apply: async ({ workflowRunId, draft }) => {
        assertLock();
        await authorize(authority);
        if (workflowRunId !== row.runId || !row.pendingJson) throw new GatewayReadError('FORBIDDEN');
        const steps = StepsSchema.parse(JSON.parse(row.stepsJson));
        const prior = steps[0];
        if (prior) {
          return TaskPlanExecutionReceiptSchema.parse({
            workflowRunId, revision: draft.revision, status: 'success',
            referenceMap: { [draft.task.draftRef]: prior.result.kind === 'plan' ? prior.result.plan.id : '' },
            failures: [], retryable: false,
          });
        }
        if (draft.task.labels.length) return TaskPlanExecutionReceiptSchema.parse({
          workflowRunId, revision: draft.revision, status: 'failed', referenceMap: {},
          failures: [{ operation: 'task_plan', draftRef: draft.task.draftRef, code: 'VALIDATION_ERROR',
            message: 'External task assistance cannot create labels. Use an unlabeled task.', retryable: false }],
          retryable: false,
        });
        const stepKey = `assisted:${row.runId}:${draft.revision}:task`;
        row = await repo.save(row.id, { stepKey });
        const receipt = await options.writes({ handleId: row.id, pendingJson: row.pendingJson }).taskCreate({
          idempotencyKey: stepKey,
          plan: {
            name: draft.task.title, description: draft.task.description,
            schedule: draft.task.schedule, reminderConfig: draft.task.reminderConfig,
            importance: draft.task.importance, goalBinding: draft.task.goalBinding, labelIds: [],
          },
        }, cx, authority);
        if (receipt.result.kind !== 'plan') throw new Error('Unexpected Task owner receipt');
        // The owner receipt is already committed. Retrying this step recovers that
        // same fact if either this projection write or the Mastra acknowledgement is lost.
        assertLock();
        row = await repo.save(row.id, { stepsJson: JSON.stringify([receipt]) });
        return TaskPlanExecutionReceiptSchema.parse({
          workflowRunId, revision: draft.revision, status: 'success',
          referenceMap: { [draft.task.draftRef]: receipt.result.plan.id }, failures: [], retryable: false,
        });
      },
    };
  }
  async function settle(row: AiAssistedWorkflow, cx: ExecutionContext, authority: GatewayWriteAuthority, assertLock: () => void) {
    if (row.stepKey) {
      const committed = await options.recoverStep(row);
      if (committed) row = await repo.save(row.id, { stepsJson: JSON.stringify([committed]) });
    }
    if (!row.pendingJson) return row;
    const pending = PendingSchema.parse(JSON.parse(row.pendingJson));
    const start = AssistedStartSchema.parse(JSON.parse(row.requestJson));
    let run = await runtime.get({ identityId: cx.identityId, runId: row.runId });
    const external = invocation(row, cx, authority, assertLock);
    if (pending.type === 'cancel') {
      if (run && !terminal(run)) run = await runtime.cancel({ identityId: cx.identityId, runId: row.runId });
    } else {
      await authorize(authority);
      // Only planning operations use the provider. Deterministic apply/retry do not infer.
      const inference = pending.type === 'start' || pending.command.type === 'answer';
      if (inference) await repo.assertConsent(cx.identityId, start.consent);
      if (!run && pending.type === 'start') {
        run = await runtime.start({ context: cx, runId: row.runId, external, request: {
          kind: 'task.create', conversationId: `assisted:${row.runId}`,
          input: start.input, providerId: start.consent.providerId, modelId: start.consent.modelId,
        } });
      } else if (run?.status === 'running') {
        if (!runtime.recoverTask) throw new Error('Durable workflow restart unavailable');
        run = await runtime.recoverTask({ context: cx, runId: row.runId, external,
          ...(pending.type === 'resume' ? { command: pending.command } : {}),
        });
      } else if (run && pending.type === 'resume' && !terminal(run) && digest(run) === pending.beforeDigest) {
        run = await runtime.resume({ context: cx, external, request: { runId: row.runId, command: pending.command } });
      }
    }
    if (!run) throw new Error('Durable workflow snapshot missing');
    assertLock();
    // Reload committed step evidence written by the callback before publishing the view.
    const current = await repo.find(row.id, cx.identityId, authority.connectionId);
    if (!current) throw new GatewayReadError('NOT_FOUND');
    return repo.save(row.id, {
      viewJson: JSON.stringify(AIWorkflowRunViewSchema.parse(run)), pendingJson: null,
      revision: row.viewJson ? row.revision + 1 : row.revision,
    });
  }
  function view(row: AiAssistedWorkflow): AssistedView {
    const run = AIWorkflowRunViewSchema.parse(JSON.parse(row.viewJson ?? 'null'));
    return AssistedViewSchema.parse({ handle: row.id, revision: row.revision, run,
      ...(token(run) ? { reviewToken: token(run) } : {}), steps: StepsSchema.parse(JSON.parse(row.stepsJson)),
    });
  }
  async function access(raw: unknown, cx: ExecutionContext, authority: GatewayWriteAuthority,
    work: (row: AiAssistedWorkflow, assertLock: () => void) => Promise<AiAssistedWorkflow>) {
    const input = AssistedHandleSchema.parse(raw);
    await authorize(authority);
    return repo.locked(input.handle, async (assertLock) => {
      await authorize(authority);
      let row = await repo.find(input.handle, cx.identityId, authority.connectionId);
      if (!row) throw new GatewayReadError('NOT_FOUND');
      if (row.revision !== input.expectedRevision) throw new GatewayReadError('CONFLICT');
      row = await settle(row, cx, authority, assertLock);
      // A recovered transition changes the revision. Return its durable outcome;
      // never execute a second command against a stale request.
      if (row.revision !== input.expectedRevision) return view(row);
      return view(await work(row, assertLock));
    });
  }
  const wrap = <T>(work: () => Promise<T>) => work().catch((cause: unknown) => {
    if (cause instanceof z.ZodError) throw new GatewayReadError('VALIDATION_ERROR');
    if (cause instanceof Error && cause.message === 'ASSISTED_OPERATION_IN_PROGRESS') throw new GatewayReadError('OPERATION_IN_PROGRESS');
    if (cause instanceof Error && cause.message === 'ASSISTED_CONSENT_REQUIRED') throw new GatewayReadError('FORBIDDEN');
    throw cause;
  });
  return {
    start: (raw, cx, authority) => wrap(async () => {
      const start: AssistedStart = AssistedStartSchema.parse(raw);
      await authorize(authority);
      const key = digest([cx.identityId, authority.connectionId, start.idempotencyKey]);
      return repo.locked(key, async () => {
        let row = await repo.findStart(cx.identityId, authority.connectionId, start.idempotencyKey);
        if (row && row.requestDigest !== digest(start)) throw new GatewayReadError('IDEMPOTENCY_CONFLICT');
        if (!row) {
          await repo.assertConsent(cx.identityId, start.consent);
          row = await repo.create({ id: randomUUID(), identityId: cx.identityId, connectionId: authority.connectionId,
            kind: 'task.create', runId: randomUUID(), requestKey: start.idempotencyKey,
            requestDigest: digest(start), requestJson: JSON.stringify(start), pendingJson: JSON.stringify({ type: 'start' }),
          });
        }
        return repo.locked(row.id, async (assertLock) => view(await settle(row, cx, authority, assertLock)));
      });
    }),
    get: (raw, cx, authority) => wrap(() => access(raw, cx, authority, async (row) => row)),
    review: (raw, cx, authority) => wrap(() => access(raw, cx, authority, async (row) => row)),
    resume: (raw, cx, authority) => wrap(async () => {
      const input = AssistedResumeSchema.parse(raw);
      return access({ handle: input.handle, expectedRevision: input.expectedRevision }, cx, authority, async (row, assertLock) => {
        const run = view(row).run;
        if (run.status !== 'suspended' || token(run) !== input.reviewToken) throw new GatewayReadError('CONFLICT');
        const suspension = run.suspension;
        const command: AIWorkflowResumeCommand = input.command;
        const valid = suspension?.type === 'clarification_required'
          ? command.type === 'answer' && command.answers.length === suspension.questions.length
          : suspension?.type === 'task_draft_review' ? command.type === 'approve'
          : suspension?.type === 'recovery_required' &&
            (command.type === 'cancel_remaining' || (command.type === 'retry' && suspension.retryable));
        if (!valid) throw new GatewayReadError('VALIDATION_ERROR');
        row = await repo.save(row.id, { pendingJson: JSON.stringify({ type: 'resume', command, beforeDigest: digest(run) }) });
        return settle(row, cx, authority, assertLock);
      });
    }),
    cancel: (raw, cx, authority) => wrap(() => access(raw, cx, authority, async (row, assertLock) => {
      if (terminal(view(row).run)) return row;
      row = await repo.save(row.id, { pendingJson: JSON.stringify({ type: 'cancel' }) });
      return settle(row, cx, authority, assertLock);
    })),
  };
}
