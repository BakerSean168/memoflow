import { ipcMain } from 'electron';
import {
  AIChannels,
  AIStreamChannels,
  type IElectronModuleContext,
} from '@memoflow/desktop-contracts';
import {
  AssistantRuntimeApprovalCommandSchema,
  AssistantAttentionListRequestSchema,
  AssistantAttentionListResponseSchema,
  AssistantAttentionAckRequestSchema,
  AssistantAttentionAckResponseSchema,
  AssistantRuntimeApprovalResultSchema,
  AssistantRuntimeToolAnswerCommandSchema,
  AssistantRuntimeToolAnswerResultSchema,
  AssistantRuntimeCancelResultSchema,
  AssistantRuntimeClientCommandSchema,
  AssistantRuntimeConversationDeleteResultSchema,
  AssistantRuntimeEventSchema,
  AssistantRuntimeHistoryClientRequestSchema,
  AssistantRuntimeHistoryViewSchema,
  AIRuntimeUsageQueryClientRequestSchema,
  AIRuntimeUsageSummarySchema,
  WorkspaceStreamRequestSchema,
  WorkspaceStreamAckSchema,
  WorkspaceStreamStopSchema,
} from '@memoflow/ai-contracts';
import { fail, ok } from '@memoflow/transport-contracts/result';
import { formatZodErrors } from '@memoflow/utils/result';
import { toAITransportFailure } from '../../server/transport';
import { ConversationAttentionObserver } from '../../server/application/services/conversation-attention-observer';
import { workspaceEventStream } from '../../server/transport/workspace-event-stream';
import { withAuthenticatedValue, type AIElectronHandlerDeps } from './context';

/**
 * Workspace event stream channels.
 * Workspace 事件流通道。
 */
export function registerWorkspaceHandlers(
  ctx: IElectronModuleContext,
  deps: AIElectronHandlerDeps,
): void {
  const { instance: aiModule, activeStreamSessions, workspaceOwners, workspaceAcks, installed } =
    deps;

  ipcMain.handle(AIChannels.RUNTIME_WORKSPACE_START, async (event, request) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      const parsed = WorkspaceStreamRequestSchema.safeParse(request);
      if (!parsed.success)
        return fail({ code: 'VALIDATION_ERROR', message: 'Invalid Workspace subscription' });
      const { streamId, cursor } = parsed.data;
      if (
        activeStreamSessions.has(streamId) ||
        [...workspaceOwners.values()].some((owner) => owner.webContentsId === event.sender.id)
      ) {
        return fail({ code: 'CONFLICT', message: 'Workspace subscription already active' });
      }
      let source;
      try {
        source = await aiModule.workflowRuntime?.goalEvents?.();
        await aiModule.conversationAttentionPort?.events?.init();
        await aiModule.conversationEvents?.init();
      } catch {
        return fail({ code: 'SERVICE_UNAVAILABLE', message: 'Workspace events unavailable' });
      }
      if (
        !source &&
        !aiModule.conversationAttentionPort?.events &&
        !aiModule.conversationEvents
      )
        return fail({ code: 'SERVICE_UNAVAILABLE', message: 'Workspace events unavailable' });
      if (
        event.sender.isDestroyed() ||
        activeStreamSessions.has(streamId) ||
        [...workspaceOwners.values()].some((owner) => owner.webContentsId === event.sender.id)
      ) {
        return fail({ code: 'CONFLICT', message: 'Workspace subscription unavailable' });
      }
      const abortController = new AbortController();
      const close = () => abortController.abort();
      activeStreamSessions.set(streamId, { abortController, webContentsId: event.sender.id });
      workspaceOwners.set(streamId, {
        identityId: requestContext.identityId,
        webContentsId: event.sender.id,
      });
      event.sender.once('destroyed', close);
      void (async () => {
        try {
          for await (const update of workspaceEventStream({
            source: source ?? null,
            attention: aiModule.conversationAttentionPort?.events,
            conversations: aiModule.conversationEvents,
            identityId: requestContext.identityId,
            cursor,
            signal: abortController.signal,
          })) {
            if (abortController.signal.aborted || event.sender.isDestroyed()) break;
            await new Promise<void>((resolve) => {
              const timeout = setTimeout(close, 30_000);
              const done = () => {
                clearTimeout(timeout);
                workspaceAcks.delete(streamId);
                abortController.signal.removeEventListener('abort', done);
                resolve();
              };
              workspaceAcks.set(streamId, { cursor: update.cursor, resolve: done });
              abortController.signal.addEventListener('abort', done, { once: true });
              try {
                event.sender.send(AIStreamChannels.RUNTIME_WORKSPACE_EVENT, {
                  streamId,
                  event: update,
                });
              } catch {
                close();
              }
            });
          }
        } catch {
          /* The client reconnects to durable state; no business failure is synthesized. */
        } finally {
          close();
          event.sender.removeListener('destroyed', close);
          workspaceAcks.delete(streamId);
          workspaceOwners.delete(streamId);
          activeStreamSessions.delete(streamId);
          try {
            if (!event.sender.isDestroyed())
              event.sender.send(AIStreamChannels.RUNTIME_WORKSPACE_END, { streamId });
          } catch {
            /* The renderer may disappear between the check and the send. */
          }
        }
      })();
      return ok({ accepted: true });
    }),
  );
  installed.push(AIChannels.RUNTIME_WORKSPACE_START);
  ipcMain.handle(AIChannels.RUNTIME_WORKSPACE_ACK, async (event, request) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      const parsed = WorkspaceStreamAckSchema.safeParse(request);
      if (!parsed.success)
        return fail({
          code: 'VALIDATION_ERROR',
          message: 'Invalid Workspace acknowledgement',
        });
      const owner = workspaceOwners.get(parsed.data.streamId);
      if (
        owner?.identityId !== requestContext.identityId ||
        owner.webContentsId !== event.sender.id
      )
        return fail({ code: 'FORBIDDEN', message: 'Workspace subscription unavailable' });
      const pending = workspaceAcks.get(parsed.data.streamId);
      if (pending?.cursor === parsed.data.cursor) pending.resolve();
      return ok({ accepted: Boolean(pending?.cursor === parsed.data.cursor) });
    }),
  );
  installed.push(AIChannels.RUNTIME_WORKSPACE_ACK);
  ipcMain.handle(AIChannels.RUNTIME_WORKSPACE_STOP, async (event, request) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      const parsed = WorkspaceStreamStopSchema.safeParse(request);
      if (!parsed.success)
        return fail({ code: 'VALIDATION_ERROR', message: 'Invalid Workspace cancellation' });
      const owner = workspaceOwners.get(parsed.data.streamId);
      if (
        owner?.identityId !== requestContext.identityId ||
        owner.webContentsId !== event.sender.id
      )
        return fail({ code: 'FORBIDDEN', message: 'Workspace subscription unavailable' });
      activeStreamSessions.get(parsed.data.streamId)?.abortController.abort();
      return ok({ accepted: true });
    }),
  );
  installed.push(AIChannels.RUNTIME_WORKSPACE_STOP);
}

/**
 * Canonical Mastra Assistant runtime and usage channels.
 * 规范 Mastra Assistant 运行时与用量通道。
 */
export function registerAssistantRuntimeHandlers(
  ctx: IElectronModuleContext,
  deps: AIElectronHandlerDeps,
): void {
  const { instance: aiModule, activeStreamSessions, installed } = deps;
  const attentionObserver = aiModule.conversationAttentionPort
    ? new ConversationAttentionObserver(aiModule.conversationAttentionPort)
    : null;

  // AI vNext canonical Mastra Assistant transport. The renderer sends only
  // a typed client command; authenticated identity is injected here. All
  // runtime events are validated against the shared contract before push.
  ipcMain.handle(AIChannels.RUNTIME_ASSISTANT_START, async (event, dto) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      const payload = dto as { streamId?: unknown; command?: unknown };
      const streamId = String(payload.streamId ?? '');
      if (!streamId) {
        return fail({ code: 'VALIDATION_ERROR', message: 'Missing streamId' });
      }

      const parsed = AssistantRuntimeClientCommandSchema.safeParse(payload.command);
      if (!parsed.success || parsed.data.type !== 'message') {
        return fail({
          code: 'VALIDATION_ERROR',
          message: 'Invalid runtime assistant message command',
          details: parsed.success
            ? [
                {
                  field: 'type',
                  code: 'INVALID_FIELD',
                  message: 'Expected message command',
                },
              ]
            : formatZodErrors(parsed.error.issues),
        });
      }

      const messageCommand = parsed.data;
      const runtime =
        messageCommand.runtimeKind === 'local_agent'
          ? aiModule.localAgentRuntime
          : aiModule.mastraRuntime;
      if (!runtime)
        return fail({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Selected AI runtime unavailable',
        });
      if (activeStreamSessions.has(streamId))
        return fail({ code: 'CONFLICT', message: 'Stream already active' });
      const abortController = new AbortController();
      activeStreamSessions.set(streamId, {
        abortController,
        webContentsId: event.sender.id,
      });

      void (async () => {
        const kind = messageCommand.runtimeKind === 'local_agent' ? 'local_agent' : 'builtin';
        const pulse = attentionObserver
          ? setInterval(() => {
              void attentionObserver
                .heartbeat(requestContext.identityId, kind, messageCommand.conversationId)
                .catch(() => undefined);
            }, 30_000)
          : null;
        try {
          for await (const runtimeEvent of runtime.dispatchMessage({
            identityId: requestContext.identityId,
            context: requestContext,
            conversationId: messageCommand.conversationId,
            content: messageCommand.content,
            providerId: messageCommand.providerId,
            modelId: messageCommand.modelId,
            agentInstanceId: messageCommand.agentInstanceId,
            permissionMode: messageCommand.permissionMode,
            ...(messageCommand.runtimeKind === 'local_agent' &&
            messageCommand.nativeModelOptions
              ? { modelOptions: messageCommand.nativeModelOptions }
              : {}),
            locale: messageCommand.locale,
            attachments: messageCommand.attachments,
            selectedEntities: messageCommand.selectedEntities,
            signal: abortController.signal,
          })) {
            const validated = AssistantRuntimeEventSchema.parse(runtimeEvent);
            await attentionObserver
              ?.observe(requestContext.identityId, kind, validated)
              .catch(() => undefined);
            if (!event.sender.isDestroyed()) {
              event.sender.send(AIStreamChannels.RUNTIME_ASSISTANT_EVENT, {
                streamId,
                event: validated,
              });
            }
          }
        } catch (error) {
          if (!abortController.signal.aborted && !event.sender.isDestroyed()) {
            const failure = toAITransportFailure(error, {
              fallbackCode: 'AI_RUNTIME_TRANSPORT_ERROR',
              fallbackMessage: 'AI runtime request failed',
            });
            event.sender.send(AIStreamChannels.RUNTIME_ASSISTANT_ERROR, {
              streamId,
              code: failure.code,
              message: failure.message,
            });
          }
        } finally {
          if (pulse) clearInterval(pulse);
          activeStreamSessions.delete(streamId);
        }
      })();

      return ok(null);
    }),
  );
  installed.push(AIChannels.RUNTIME_ASSISTANT_START);
  ipcMain.handle(AIChannels.RUNTIME_ASSISTANT_ANSWER, async (_, command) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      if (!aiModule.mastraRuntime)
        return fail({ code: 'SERVICE_UNAVAILABLE', message: 'AI runtime unavailable' });
      const parsed = AssistantRuntimeToolAnswerCommandSchema.safeParse(command);
      if (!parsed.success)
        return fail({ code: 'VALIDATION_ERROR', message: 'Invalid ask-user response' });
      return ok(
        AssistantRuntimeToolAnswerResultSchema.parse({
          accepted:
            parsed.data.runtimeKind === 'local_agent'
              ? ((await aiModule.localAgentRuntime?.answerToolSuspension({
                  identityId: requestContext.identityId,
                  command: parsed.data,
                })) ?? false)
              : await aiModule.mastraRuntime.answerToolSuspension({
                  context: requestContext,
                  command: parsed.data,
                }),
        }),
      );
    }),
  );
  installed.push(AIChannels.RUNTIME_ASSISTANT_ANSWER);
  ipcMain.handle(AIChannels.RUNTIME_ASSISTANT_ASK_USER_PENDING, async (_, request) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      if (!aiModule.mastraRuntime)
        return fail({ code: 'SERVICE_UNAVAILABLE', message: 'AI runtime unavailable' });
      const parsed = AssistantRuntimeHistoryClientRequestSchema.safeParse(request);
      if (!parsed.success)
        return fail({ code: 'VALIDATION_ERROR', message: 'Invalid conversation reference' });
      return ok(
        parsed.data.runtimeKind === 'local_agent'
          ? ((await aiModule.localAgentRuntime?.listAskUserSuspensions({
              identityId: requestContext.identityId,
              conversationId: parsed.data.conversationId,
            })) ?? [])
          : await aiModule.mastraRuntime.listAskUserSuspensions({
              identityId: requestContext.identityId,
              conversationId: parsed.data.conversationId,
            }),
      );
    }),
  );
  installed.push(AIChannels.RUNTIME_ASSISTANT_ASK_USER_PENDING);

  ipcMain.handle(AIChannels.RUNTIME_ASSISTANT_APPROVAL, async (_, command) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      if (!aiModule.mastraRuntime)
        return fail({ code: 'SERVICE_UNAVAILABLE', message: 'AI runtime unavailable' });
      const parsed = AssistantRuntimeApprovalCommandSchema.safeParse(command);
      if (!parsed.success)
        return fail({
          code: 'VALIDATION_ERROR',
          message: 'Invalid runtime assistant approval command',
          details: formatZodErrors(parsed.error.issues),
        });
      const accepted = await aiModule.mastraRuntime.decideToolApproval({
        context: requestContext,
        command: parsed.data,
      });
      return ok(AssistantRuntimeApprovalResultSchema.parse({ accepted }));
    }),
  );
  installed.push(AIChannels.RUNTIME_ASSISTANT_APPROVAL);
  ipcMain.handle(AIChannels.RUNTIME_ASSISTANT_CANCEL, async (_, command) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      const parsed = AssistantRuntimeClientCommandSchema.safeParse(command);
      if (!parsed.success || parsed.data.type !== 'cancel_run') {
        return fail({
          code: 'VALIDATION_ERROR',
          message: 'Invalid runtime assistant cancel command',
          details: parsed.success
            ? [
                {
                  field: 'type',
                  code: 'INVALID_FIELD',
                  message: 'Expected cancel_run command',
                },
              ]
            : formatZodErrors(parsed.error.issues),
        });
      }
      const runtime =
        parsed.data.runtimeKind === 'local_agent'
          ? aiModule.localAgentRuntime
          : aiModule.mastraRuntime;
      if (!runtime)
        return fail({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Selected AI runtime unavailable',
        });
      const cancelled = runtime.cancelRun({
        identityId: requestContext.identityId,
        runId: parsed.data.runId,
      });
      return ok(AssistantRuntimeCancelResultSchema.parse({ cancelled }));
    }),
  );
  installed.push(AIChannels.RUNTIME_ASSISTANT_CANCEL);
  ipcMain.handle(AIChannels.RUNTIME_ASSISTANT_HISTORY, async (_, request) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      const parsed = AssistantRuntimeHistoryClientRequestSchema.safeParse(request);
      if (!parsed.success) {
        return fail({
          code: 'VALIDATION_ERROR',
          message: 'Invalid runtime assistant history request',
          details: formatZodErrors(parsed.error.issues),
        });
      }
      const runtime =
        parsed.data.runtimeKind === 'local_agent'
          ? aiModule.localAgentRuntime
          : aiModule.mastraRuntime;
      if (!runtime)
        return fail({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Selected AI runtime unavailable',
        });
      try {
        const history = AssistantRuntimeHistoryViewSchema.parse(
          await runtime.listMessages({
            identityId: requestContext.identityId,
            conversationId: parsed.data.conversationId,
          }),
        );
        return ok(history);
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'ASSISTANT_CONVERSATION_NOT_FOUND'
        ) {
          return fail({ code: 'NOT_FOUND', message: 'Conversation not found' });
        }
        const failure = toAITransportFailure(error, {
          fallbackCode: 'AI_RUNTIME_ERROR',
          fallbackMessage: 'AI runtime request failed',
        });
        return fail({
          code: failure.code,
          message: failure.message,
          context: failure.context,
          failure: failure.failure,
        });
      }
    }),
  );
  installed.push(AIChannels.RUNTIME_ASSISTANT_HISTORY);
  ipcMain.handle(AIChannels.RUNTIME_ASSISTANT_DELETE, async (_, request) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      const parsed = AssistantRuntimeHistoryClientRequestSchema.safeParse(request);
      if (!parsed.success) {
        return fail({
          code: 'VALIDATION_ERROR',
          message: 'Invalid runtime assistant delete request',
          details: formatZodErrors(parsed.error.issues),
        });
      }
      const runtime =
        parsed.data.runtimeKind === 'local_agent'
          ? aiModule.localAgentRuntime
          : aiModule.mastraRuntime;
      if (!runtime)
        return fail({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Selected AI runtime unavailable',
        });
      try {
        const result = AssistantRuntimeConversationDeleteResultSchema.parse({
          deleted: await runtime.deleteConversation({
            identityId: requestContext.identityId,
            conversationId: parsed.data.conversationId,
          }),
        });
        await aiModule.conversationAttentionPort
          ?.forget({
            identityId: requestContext.identityId,
            runtimeKind:
              parsed.data.runtimeKind === 'local_agent' ? 'local_agent' : 'builtin',
            conversationId: parsed.data.conversationId,
          })
          .catch(() => undefined);
        return ok(result);
      } catch (error) {
        const failure = toAITransportFailure(error, {
          fallbackCode: 'AI_RUNTIME_ERROR',
          fallbackMessage: 'AI runtime request failed',
        });
        return fail({
          code: failure.code,
          message: failure.message,
          context: failure.context,
          failure: failure.failure,
        });
      }
    }),
  );
  installed.push(AIChannels.RUNTIME_ASSISTANT_DELETE);

  ipcMain.handle(AIChannels.RUNTIME_ASSISTANT_ATTENTION_LIST, async (_, payload) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      const parsed = AssistantAttentionListRequestSchema.safeParse(payload);
      if (!parsed.success)
        return fail({
          code: 'VALIDATION_ERROR',
          message: 'Invalid attention list',
          details: formatZodErrors(parsed.error.issues),
        });
      if (!aiModule.conversationAttentionPort)
        return fail({ code: 'SERVICE_UNAVAILABLE', message: 'Attention unavailable' });
      try {
        const items = await aiModule.conversationAttentionPort.list({
          identityId: requestContext.identityId,
          ...parsed.data,
        });
        return ok(AssistantAttentionListResponseSchema.parse({ items }));
      } catch (error) {
        const failure = toAITransportFailure(error, {
          fallbackCode: 'AI_RUNTIME_ERROR',
          fallbackMessage: 'Attention read failed',
        });
        return fail({ code: failure.code, message: failure.message });
      }
    }),
  );
  installed.push(AIChannels.RUNTIME_ASSISTANT_ATTENTION_LIST);

  ipcMain.handle(AIChannels.RUNTIME_ASSISTANT_ATTENTION_ACK, async (_, payload) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      const parsed = AssistantAttentionAckRequestSchema.safeParse(payload);
      if (!parsed.success)
        return fail({
          code: 'VALIDATION_ERROR',
          message: 'Invalid attention acknowledgement',
          details: formatZodErrors(parsed.error.issues),
        });
      if (!aiModule.conversationAttentionPort)
        return fail({ code: 'SERVICE_UNAVAILABLE', message: 'Attention unavailable' });
      try {
        const acknowledged = await aiModule.conversationAttentionPort.acknowledge({
          identityId: requestContext.identityId,
          ...parsed.data,
        });
        return ok(AssistantAttentionAckResponseSchema.parse({ acknowledged }));
      } catch (error) {
        const failure = toAITransportFailure(error, {
          fallbackCode: 'AI_RUNTIME_ERROR',
          fallbackMessage: 'Attention acknowledgement failed',
        });
        return fail({ code: failure.code, message: failure.message });
      }
    }),
  );
  installed.push(AIChannels.RUNTIME_ASSISTANT_ATTENTION_ACK);

  ipcMain.handle(AIChannels.RUNTIME_USAGE_GET, async (_, request) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      if (!aiModule.mastraRuntime) {
        return fail({ code: 'SERVICE_UNAVAILABLE', message: 'AI runtime unavailable' });
      }
      const parsed = AIRuntimeUsageQueryClientRequestSchema.safeParse(request);
      if (!parsed.success) {
        return fail({
          code: 'VALIDATION_ERROR',
          message: 'Invalid runtime usage request',
          details: formatZodErrors(parsed.error.issues),
        });
      }
      try {
        const summary = AIRuntimeUsageSummarySchema.parse(
          await aiModule.mastraRuntime.summarizeUsage({
            identityId: requestContext.identityId,
            ...(parsed.data.conversationId
              ? { conversationId: parsed.data.conversationId }
              : {}),
            ...(parsed.data.runId ? { runId: parsed.data.runId } : {}),
          }),
        );
        return ok(summary);
      } catch (error) {
        const failure = toAITransportFailure(error, {
          fallbackCode: 'AI_RUNTIME_ERROR',
          fallbackMessage: 'AI runtime request failed',
        });
        return fail({
          code: failure.code,
          message: failure.message,
          context: failure.context,
          failure: failure.failure,
        });
      }
    }),
  );
  installed.push(AIChannels.RUNTIME_USAGE_GET);
}
