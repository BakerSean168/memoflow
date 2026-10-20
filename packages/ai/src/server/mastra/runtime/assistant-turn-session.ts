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
  type AssistantRuntimeToolAnswerCommand,
  type AIChatPermissionMode,
  type AssistantRuntimeAttachment,
  type AssistantRuntimeEvent,
  type AssistantRuntimeSelectedEntity,
} from '@memoflow/contracts/ai';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { ResolvedAIModel } from '../models';
import type { IAIExecutionRecordPort } from '../../application/ports';
import { memoFlowToolPolicy } from '../tools/product-tool-policy';
import type { AssistantHistoryService } from './assistant-history.service';
import { AsyncEventQueue } from './async-event-queue';
import { projectAssistantUsage, type AssistantUsageSnapshot } from './assistant-observability';
import { AssistantTurnObservability } from './assistant-turn-observability';
import {
  readAIProviderFailureDiagnostics,
  toAIPublicFailure,
} from '../../../shared/ai-public-failure';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('AssistantTurnSession');

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
  readonly decide: (command: AssistantRuntimeApprovalCommand, context: ExecutionContext) => Promise<boolean>;
  readonly answer: (command: AssistantRuntimeToolAnswerCommand, context: ExecutionContext) => boolean;
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
  permissionMode?: AIChatPermissionMode;
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
      history: Pick<AssistantHistoryService, 'appendRuntimeRecord'>;
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
    const recordRuntimeFailure = (error: unknown): void => {
      lastRuntimeError = publicRuntimeError(error);
      logger.warn('Assistant turn runtime failure', {
        requestId: input.context?.requestId,
        conversationId: input.conversationId,
        modelId: resolvedModel.modelId,
        agentInstanceId: input.agentInstanceId,
        code: lastRuntimeError.code,
        ...readAIProviderFailureDiagnostics(error),
      });
    };
    let lastUsage: AssistantUsageSnapshot | undefined;
    let terminalHistory = Promise.resolve();
    let settled = false;
    let stopping = false;
    const bindingGeneration = session.run.bindingGeneration();
    let nativeRunId: string | null = null;
    const tools = new Map<
      string,
      Extract<AssistantRuntimeEvent, { type: 'assistant.approval.required' }>['data']
    >();
    const pending = new Set<string>();
    const suspensions = new Set<string>();
    const questions = new Map<string, { options?: { label: string }[]; selectionMode?: 'single_select' | 'multi_select' }>();
    const ownsTurn = () =>
      !settled &&
      session.run.bindingGeneration() === bindingGeneration &&
      session.thread.getId() === input.conversationId &&
      session.identity.getOwnerId() === input.identityId &&
      session.identity.getResourceId() === input.identityId &&
      (activeRuns.get(runId || fallbackRunId)?.decide === decide || activeRuns.get(runId || fallbackRunId)?.answer === answer);
    const ownsNativeRun = () => ownsTurn() && session.getCurrentRunId() === nativeRunId;

    const currentRunId = (): string => runId || fallbackRunId;

    const telemetry = new AssistantTurnObservability({
      identityId: input.identityId,
      conversationId: input.conversationId,
      agentInstanceId: input.agentInstanceId,
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
      if (type !== 'assistant.run.completed') {
        terminalHistory = this.deps.history.appendRuntimeRecord({
          identityId: input.identityId, conversationId: input.conversationId,
          runOutcome: { runId: currentRunId(), status: type === 'assistant.run.failed' ? 'failed' : 'cancelled' },
        });
        // Observe immediately; the generator's finally owns the awaited write,
        // including when the HTTP/IPC reader disconnects before the final event.
        terminalHistory.catch(() => {});
      }
      telemetry.finishPhases(type, lastRuntimeError?.code);
      for (const toolCallId of pending) {
        emit('assistant.approval.resolved', {
          toolCallId,
          resolution: type === 'assistant.run.cancelled' ? 'cancelled' : 'failed',
        });
      }
      pending.clear();
      for (const toolCallId of suspensions) emit('assistant.ask_user.resolved', { toolCallId, resolution: type === 'assistant.run.cancelled' ? 'cancelled' : 'failed' });
      suspensions.clear();
      questions.clear();
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
    const decide = async (
      command: AssistantRuntimeApprovalCommand,
      context: ExecutionContext,
    ): Promise<boolean> => {
      if (
        !ownsNativeRun() ||
        stopping ||
        session.run.isAbortRequested() ||
        !pending.has(command.toolCallId) ||
        !session.approval.isArmed() ||
        session.approval.getToolCallId() !== command.toolCallId
      )
        return false;
      const tool = tools.get(command.toolCallId);
      if (!tool) return false;
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
      const approvalHistory = this.deps.history.appendRuntimeRecord({
        identityId: input.identityId, conversationId: input.conversationId,
        approvalReceipt: { runId: currentRunId(), toolCallId: command.toolCallId,
          toolName: tool.toolName, category: tool.category, risk: 'high', decision: command.decision },
      });
      telemetry.approvalResolved(command.toolCallId, command.decision);
      emit('assistant.approval.resolved', {
        toolCallId: command.toolCallId,
        resolution: command.decision === 'approve' ? 'approved' : 'declined',
      });
      await approvalHistory;
      return true;
    };
    const answer = (command: AssistantRuntimeToolAnswerCommand, context: ExecutionContext): boolean => {
      if (command.action !== 'answer' || !ownsNativeRun() || stopping || session.run.isAbortRequested() || !suspensions.has(command.toolCallId)) return false;
      const suspension = session.suspensions.get({ toolCallId: command.toolCallId });
      const question = questions.get(command.toolCallId);
      if (!suspension || suspension.runId !== runId || suspension.threadId !== input.conversationId || suspension.resourceId !== input.identityId || !question) return false;
      const labels = new Set((question.options ?? []).map(({ label }) => label));
      if (question.selectionMode === 'multi_select') {
        if (!Array.isArray(command.answer) || command.answer.length === 0 || new Set(command.answer).size !== command.answer.length || command.answer.some((value) => !labels.has(value))) return false;
      } else if (question.options) {
        if (typeof command.answer !== 'string' || !labels.has(command.answer)) return false;
      } else if (typeof command.answer !== 'string' || !command.answer.trim() || command.answer.length > 4000) return false;
      suspensions.delete(command.toolCallId); questions.delete(command.toolCallId);
      const answerContext = new RequestContext(requestContext.entries());
      answerContext.setRaw('identityId', input.identityId); answerContext.setRaw('executionContext', context);
      answerContext.setRaw(MASTRA_RESOURCE_ID_KEY, input.identityId); answerContext.setRaw(MASTRA_THREAD_ID_KEY, input.conversationId);
      session.respondToToolSuspension({ resumeData: command.answer, toolCallId: command.toolCallId, requestContext: answerContext }).catch((error) => { lastRuntimeError = publicRuntimeError(error); });
      emit('assistant.ask_user.resolved', { toolCallId: command.toolCallId, resolution: 'answered' });
      return true;
    };
    const activeRun: ActiveAssistantTurn = {
      identityId: input.identityId,
      conversationId: input.conversationId,
      abort,
      decide,
      answer,
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
      if (event.type === 'tool_suspended') {
        if (event.toolName !== 'ask_user' || !event.toolCallId || event.toolCallId.length > 512) { abort(); return; }
        const suspension = session.suspensions.get({ toolCallId: event.toolCallId });
        const raw = event.suspendPayload;
        if (!suspension || suspension.runId !== runId || suspension.threadId !== input.conversationId || suspension.resourceId !== input.identityId || !raw || typeof raw !== 'object' || Array.isArray(raw)) { abort(); return; }
        const payload = raw as Record<string, unknown>;
        const rawOptions = payload.options;
        const validOptions = rawOptions === undefined || (Array.isArray(rawOptions) && rawOptions.length <= 20 && rawOptions.every((item) => {
          if (!item || typeof item !== 'object') return false;
          const choice = item as Record<string, unknown>;
          return typeof choice.label === 'string' && choice.label.trim().length > 0 && choice.label.length <= 500 &&
            (choice.description === undefined || (typeof choice.description === 'string' && choice.description.length <= 1000));
        }));
        if (typeof payload.question !== 'string' || !payload.question.trim() || payload.question.length > 2000 || !validOptions ||
          (payload.selectionMode !== undefined && payload.selectionMode !== 'single_select' && payload.selectionMode !== 'multi_select')) { abort(); return; }
        const options = rawOptions as { label: string; description?: string }[] | undefined;
        questions.set(event.toolCallId, { ...(options ? { options: options.map(({ label }) => ({ label })) } : {}), ...(payload.selectionMode ? { selectionMode: payload.selectionMode as 'single_select' | 'multi_select' } : {}) });
        suspensions.add(event.toolCallId);
        emit('assistant.ask_user.required', { toolCallId: event.toolCallId, question: payload.question.trim(), ...(options ? { options } : {}), ...(payload.selectionMode ? { selectionMode: payload.selectionMode as 'single_select' | 'multi_select' } : {}) });
        return;
      }
      if (event.type === 'tool_suspension_cancelled') {
        suspensions.delete(event.toolCallId); questions.delete(event.toolCallId);
        emit('assistant.ask_user.resolved', { toolCallId: event.toolCallId, resolution: 'cancelled' });
        return;
      }
      if (event.type === 'tool_start' && event.toolName === 'ask_user') return;
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
        recordRuntimeFailure(event.error);
        return;
      }
      if (event.type === 'agent_end') {
        if (event.reason === 'aborted') settle('assistant.run.cancelled');
        else if (event.reason === 'error') settle('assistant.run.failed');
        else if (event.reason === 'suspended') {
          settled = true;
          telemetry.finishPhases('assistant.run.completed');
          telemetry.recordOutcome('assistant.run.completed', lastUsage);
          if (activeRuns.get(currentRunId())?.decide === decide) activeRuns.delete(currentRunId());
          queue.end();
        } else if (pending.size) {
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
            recordRuntimeFailure(error);
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
      await terminalHistory;
    }
  }
}
