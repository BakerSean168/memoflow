import { randomUUID } from 'node:crypto';
import type { AgentController, AgentControllerEvent } from '@mastra/core/agent-controller';
import {
  MASTRA_RESOURCE_ID_KEY,
  MASTRA_THREAD_ID_KEY,
  RequestContext,
} from '@mastra/core/request-context';
import {
  AssistantToolNameSchema,
  type AssistantRuntimeApprovalCommand,
  type AssistantRuntimeAttachment,
  type AssistantRuntimeEvent,
  type AssistantRuntimeSelectedEntity,
} from '@memoflow/contracts/ai';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { ResolvedAIModel } from '../models';
import type { IAIExecutionRecordPort } from '../../application/ports';
import { memoFlowToolPolicy } from '../tools/product-tool-policy';
import { AsyncEventQueue } from './async-event-queue';
import { projectAssistantUsage, type AssistantUsageSnapshot } from './assistant-observability';
import { AssistantTurnObservability } from './assistant-turn-observability';
import { toAIPublicFailure } from '../../../shared/ai-public-failure';

function messageText(event: Extract<AgentControllerEvent, { type: 'message_start' }>): string {
  const parts = event.message.content.parts;
  return parts
    .filter(
      (part): part is typeof part & { type: 'text'; text: string } =>
        part.type === 'text' && 'text' in part && typeof part.text === 'string',
    )
    .map((part) => part.text)
    .join('');
}

function publicRuntimeError(error?: unknown): { code: string; message: string } {
  const failure = toAIPublicFailure(error, {
    fallbackCode: 'AI_RUNTIME_TRANSPORT_ERROR',
    fallbackMessage: 'AI runtime request failed',
  });
  return { code: failure.code, message: failure.message };
}

export type ActiveAssistantTurn = {
  readonly identityId: string;
  readonly abort: () => boolean;
  readonly conversationId: string;
  readonly decide: (command: AssistantRuntimeApprovalCommand, context: ExecutionContext) => boolean;
};

export type AssistantTurnInput = {
  identityId: string;
  /** Host request context carries requestId/traceId; credentials never enter it. */
  context?: ExecutionContext;
  conversationId: string;
  content: string;
  providerId?: string;
  modelId?: string;
  agentInstanceId?: string;
  locale?: 'zh-CN' | 'en-US';
  attachments?: readonly AssistantRuntimeAttachment[];
  selectedEntities?: readonly AssistantRuntimeSelectedEntity[];
  signal?: AbortSignal;
};

/** One native turn: ownership, approval, cancellation and event sequencing stay together. */
export class AssistantTurnSession {
  constructor(
    private readonly deps: {
      session: Awaited<ReturnType<AgentController['createSession']>>;
      activeRuns: Map<string, ActiveAssistantTurn>;
      requestContext: RequestContext;
      model: ResolvedAIModel;
      startedAt: number;
      executionRecordPort?: IAIExecutionRecordPort;
    },
  ) {}

  async *run(input: AssistantTurnInput): AsyncGenerator<AssistantRuntimeEvent, void, void> {
    const { session, requestContext, model: resolvedModel, startedAt, activeRuns } = this.deps;
    const queue = new AsyncEventQueue<AssistantRuntimeEvent>();
    const fallbackRunId = `turn:${input.conversationId}:${randomUUID()}`;
    let runId = '';
    let sequence = 0;
    let lastText = '';
    let assistantMessageId: string | undefined;
    let lastRuntimeError: { code: string; message: string } | undefined;
    let lastUsage: AssistantUsageSnapshot | undefined;
    let settled = false;
    let stopping = false;
    const bindingGeneration = session.run.bindingGeneration();
    let nativeRunId: string | null = null;
    const tools = new Map<
      string,
      Extract<AssistantRuntimeEvent, { type: 'assistant.approval.required' }>['data']
    >();
    const pending = new Set<string>();
    const ownsTurn = () =>
      !settled &&
      session.run.bindingGeneration() === bindingGeneration &&
      session.thread.getId() === input.conversationId &&
      session.identity.getOwnerId() === input.identityId &&
      session.identity.getResourceId() === input.identityId &&
      activeRuns.get(runId || fallbackRunId)?.decide === decide;
    const ownsNativeRun = () => ownsTurn() && session.getCurrentRunId() === nativeRunId;

    const currentRunId = (): string => runId || fallbackRunId;

    const telemetry = new AssistantTurnObservability({
      identityId: input.identityId,
      conversationId: input.conversationId,
      context: input.context,
      model: resolvedModel,
      runId: currentRunId,
      startedAt,
      port: this.deps.executionRecordPort,
    });

    const emit = <T extends AssistantRuntimeEvent['type']>(
      type: T,
      data: Extract<AssistantRuntimeEvent, { type: T }>['data'],
    ): void => {
      const id = currentRunId();
      sequence += 1;
      queue.push({
        eventId: `${id}:${sequence}`,
        runId: id,
        conversationId: input.conversationId,
        sequence,
        createdAt: Date.now(),
        type,
        data,
      } as Extract<AssistantRuntimeEvent, { type: T }>);
    };

    const settle = (
      type: 'assistant.run.completed' | 'assistant.run.failed' | 'assistant.run.cancelled',
    ): void => {
      if (settled) return;
      telemetry.finishPhases(type, lastRuntimeError?.code);
      for (const toolCallId of pending) {
        emit('assistant.approval.resolved', {
          toolCallId,
          resolution: type === 'assistant.run.cancelled' ? 'cancelled' : 'failed',
        });
      }
      pending.clear();
      settled = true;
      if (type === 'assistant.run.completed') {
        emit(type, {
          content: lastText,
          ...(assistantMessageId ? { assistantMessageId } : {}),
        });
      } else if (type === 'assistant.run.failed') {
        emit(type, lastRuntimeError ?? publicRuntimeError());
      } else {
        emit(type, { reason: 'aborted' });
      }

      telemetry.recordOutcome(type, lastUsage, lastRuntimeError?.code);
      if (activeRuns.get(currentRunId())?.decide === decide) activeRuns.delete(currentRunId());
      queue.end();
    };

    const abort = (): boolean => {
      if (!ownsTurn() || stopping || (runId && !ownsNativeRun())) return false;
      stopping = true;
      for (const toolCallId of pending)
        emit('assistant.approval.resolved', { toolCallId, resolution: 'cancelled' });
      pending.clear();
      // Native startup can clear an earlier abort and assign its id before agent_start.
      // Keep the reservation and replay Stop only once that run is bound.
      if (!runId) nativeRunId = session.getCurrentRunId();
      else session.abortRun();
      return true;
    };
    const onAbort = (): void => {
      if (!abort() && !stopping) settle('assistant.run.cancelled');
    };
    const decide = (
      command: AssistantRuntimeApprovalCommand,
      context: ExecutionContext,
    ): boolean => {
      if (
        !ownsNativeRun() ||
        stopping ||
        session.run.isAbortRequested() ||
        !pending.has(command.toolCallId) ||
        !session.approval.isArmed() ||
        session.approval.getToolCallId() !== command.toolCallId
      )
        return false;
      pending.delete(command.toolCallId);
      const decisionContext = new RequestContext(requestContext.entries());
      decisionContext.setRaw('identityId', input.identityId);
      decisionContext.setRaw('executionContext', context);
      decisionContext.setRaw(MASTRA_RESOURCE_ID_KEY, input.identityId);
      decisionContext.setRaw(MASTRA_THREAD_ID_KEY, input.conversationId);
      session.respondToToolApproval({
        decision: command.decision,
        toolCallId: command.toolCallId,
        requestContext: decisionContext,
      });
      if (session.approval.isArmed()) {
        pending.add(command.toolCallId);
        return false;
      }
      telemetry.approvalResolved(command.toolCallId, command.decision);
      emit('assistant.approval.resolved', {
        toolCallId: command.toolCallId,
        resolution: command.decision === 'approve' ? 'approved' : 'declined',
      });
      return true;
    };
    const activeRun: ActiveAssistantTurn = {
      identityId: input.identityId,
      conversationId: input.conversationId,
      abort,
      decide,
    };
    // Reserve synchronously before sendMessage; never let native queued follow-ups become product turns.
    activeRuns.set(fallbackRunId, activeRun);
    const unsubscribe = session.subscribe((event) => {
      if (settled) return;
      if (!ownsTurn()) {
        settle(stopping ? 'assistant.run.cancelled' : 'assistant.run.failed');
        return;
      }
      if ('threadId' in event && event.threadId && event.threadId !== input.conversationId) return;
      if (event.type === 'agent_start') {
        const nextNativeRunId = session.getCurrentRunId();
        // A native resume belongs to this turn only while it retains the native run id.
        if (runId || nativeRunId) {
          if (nextNativeRunId !== nativeRunId) {
            settle(stopping ? 'assistant.run.cancelled' : 'assistant.run.failed');
            return;
          }
          if (runId) return;
        }
        nativeRunId = nextNativeRunId;
        runId = nextNativeRunId ?? fallbackRunId;
        activeRuns.delete(fallbackRunId);
        activeRuns.set(runId, activeRun);
        const now = Date.now();
        telemetry.started(now);
        emit('assistant.run.started', {
          modelId: resolvedModel.modelId,
          providerId: resolvedModel.providerId,
        });
        if (stopping) session.abortRun();
        return;
      }
      if (!ownsNativeRun()) return;
      if (stopping) {
        if (event.type === 'agent_end') settle('assistant.run.cancelled');
        return;
      }
      if (event.type === 'tool_start' || event.type === 'tool_approval_required') {
        const name = AssistantToolNameSchema.safeParse(event.toolName);
        const policy = memoFlowToolPolicy(event.toolName);
        if (!name.success || !policy || event.toolCallId.length > 512 || !event.toolCallId) {
          abort();
          return;
        }
        const category = policy.category;
        if (category !== 'read' && category !== 'edit' && category !== 'execute') return;
        const now = Date.now();
        telemetry.toolActivity(now);
        const tool = {
          toolCallId: event.toolCallId,
          toolName: name.data,
          category,
          risk: policy.requireApproval ? ('high' as const) : ('low' as const),
        };
        tools.set(event.toolCallId, tool);
        if (event.type === 'tool_approval_required') {
          if (!policy.requireApproval || stopping) {
            abort();
            return;
          }
          telemetry.approvalRequired(event.toolCallId, now);
          pending.add(event.toolCallId);
          emit('assistant.approval.required', tool);
        } else {
          telemetry.toolStarted(event.toolCallId, now);
          emit('assistant.activity', { activityType: 'tool', ...tool, state: 'running' });
        }
        return;
      }
      if (event.type === 'tool_end') {
        const now = Date.now();
        telemetry.toolEnded(event.toolCallId, event.isError, event.denied, now);
        const tool = tools.get(event.toolCallId);
        if (tool)
          emit('assistant.activity', {
            activityType: 'tool',
            ...tool,
            state: event.denied ? 'denied' : event.isError ? 'failed' : 'completed',
          });
        tools.delete(event.toolCallId);
        return;
      }
      if (event.type === 'message_start' && event.message.role === 'assistant') {
        assistantMessageId = event.message.id;
        lastText = messageText(event);
        if (lastText) {
          telemetry.firstToken();
          emit('assistant.message.delta', { content: lastText });
        }
        return;
      }
      if (event.type === 'message_update' && event.id === assistantMessageId) {
        if (event.event.type === 'text-delta') {
          telemetry.firstToken();
          lastText += event.event.delta;
          emit('assistant.message.delta', { content: event.event.delta });
        }
        return;
      }
      if (event.type === 'usage_update') {
        lastUsage = {
          promptTokens: event.usage.promptTokens,
          completionTokens: event.usage.completionTokens,
          totalTokens: event.usage.totalTokens,
        };
        emit('assistant.usage.updated', projectAssistantUsage(resolvedModel.modelId, lastUsage));
        return;
      }
      if (event.type === 'error') {
        lastRuntimeError = publicRuntimeError(event.error);
        return;
      }
      if (event.type === 'agent_end') {
        if (event.reason === 'aborted') settle('assistant.run.cancelled');
        else if (event.reason === 'error') settle('assistant.run.failed');
        else if (event.reason === 'suspended' || pending.size) {
          abort();
          settle('assistant.run.failed');
        } else settle('assistant.run.completed');
      }
    });

    input.signal?.addEventListener('abort', onAbort, { once: true });
    if (input.signal?.aborted) {
      stopping = true;
      settle('assistant.run.cancelled');
    }
    const sending = settled
      ? Promise.resolve()
      : session
          .sendMessage({
            content: input.content,
            files: input.attachments?.map((attachment) => ({
              data: attachment.data,
              mediaType: attachment.mediaType,
              ...(attachment.filename ? { filename: attachment.filename } : {}),
            })),
            requestContext,
          })
          .then(() => {
            // Startup may end without agent_start/agent_end (for example a rejected delivery).
            if (stopping) settle('assistant.run.cancelled');
          })
          .catch((error) => {
            if (settled) return;
            const wasStopping = stopping;
            if (pending.size) abort();
            lastRuntimeError = publicRuntimeError(error);
            settle(wasStopping ? 'assistant.run.cancelled' : 'assistant.run.failed');
          });

    try {
      while (true) {
        const next = await queue.next();
        if (next.done) break;
        yield next.value;
      }
    } finally {
      input.signal?.removeEventListener('abort', onAbort);
      if (!settled) {
        abort();
        await sending;
      }
      unsubscribe();
      if (activeRuns.get(currentRunId()) === activeRun) activeRuns.delete(currentRunId());
      await telemetry.flush();
    }
  }
}
