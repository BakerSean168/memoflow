import { ipcMain } from 'electron';
import { AIChannels, type IElectronModuleContext } from '@memoflow/desktop-contracts';
import {
  LocalAgentClientCommandSchema,
  ConversationUpdateSchema,
  ListConversationsSchema,
} from '@memoflow/ai-contracts';
import { fail, ok } from '@memoflow/transport-contracts/result';
import { formatZodErrors } from '@memoflow/utils/result';
import { toAITransportFailure } from '../../server/transport';
import { AgentInstanceController } from '../../server/transport/agent-instance.controller';
import { withAuthenticatedValue, type AIElectronHandlerDeps } from './context';

/**
 * Conversation, agent instance and local agent channels.
 * 会话、Agent 实例与本地 Agent 通道。
 */
export function registerConversationHandlers(
  ctx: IElectronModuleContext,
  deps: AIElectronHandlerDeps,
): void {
  const { instance: aiModule, installed } = deps;
  const { assistantConversation } = aiModule;

  // -- Conversations --
  ipcMain.handle(AIChannels.CONVERSATION_CREATE, async (_, dto) =>
    withAuthenticatedValue(ctx, async (requestContext) =>
      assistantConversation.createConversation(requestContext, dto.name),
    ),
  );
  installed.push(AIChannels.CONVERSATION_CREATE);
  ipcMain.handle(AIChannels.CONVERSATION_UPDATE, async (_, dto) =>
    withAuthenticatedValue(ctx, async (requestContext) =>
      assistantConversation.updateConversation(
        String(dto.id),
        ConversationUpdateSchema.parse(dto),
        requestContext,
      ),
    ),
  );
  installed.push(AIChannels.CONVERSATION_UPDATE);
  ipcMain.handle(AIChannels.CONVERSATION_LIST, async (_, dto) =>
    withAuthenticatedValue(ctx, async (requestContext) =>
      assistantConversation.listConversations(
        requestContext,
        Number(dto?.page ?? 1),
        Number(dto?.pageSize ?? 20),
        ListConversationsSchema.parse(dto ?? {}).status,
      ),
    ),
  );
  installed.push(AIChannels.CONVERSATION_LIST);
  ipcMain.handle(AIChannels.CONVERSATION_GET, async (_, id) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      const result = await assistantConversation.getConversation(String(id), requestContext);
      if (!result.ok) return result;
      return result.data ?? null;
    }),
  );
  installed.push(AIChannels.CONVERSATION_GET);
  ipcMain.handle(AIChannels.CONVERSATION_DELETE, async (_, id) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      const result = await assistantConversation.deleteConversation(String(id), requestContext);
      if (!result.ok) return result;
      return ok(null);
    }),
  );
  installed.push(AIChannels.CONVERSATION_DELETE);

  ipcMain.handle(AIChannels.AGENT_INSTANCE, async (_, command) =>
    withAuthenticatedValue(ctx, (requestContext) => {
      const controller = new AgentInstanceController(aiModule.agentRegistry);
      if (
        command &&
        typeof command === 'object' &&
        'action' in command &&
        command.action === 'list'
      )
        return controller.list(requestContext);
      return controller.execute(command, requestContext);
    }),
  );
  installed.push(AIChannels.AGENT_INSTANCE);

  ipcMain.handle(AIChannels.LOCAL_AGENT, async (_, command) =>
    withAuthenticatedValue<unknown>(ctx, async (requestContext) => {
      const runtime = aiModule.localAgentRuntime;
      if (!runtime)
        return fail({ code: 'SERVICE_UNAVAILABLE', message: 'Local Agents require Desktop' });
      const parsed = LocalAgentClientCommandSchema.safeParse(command);
      if (!parsed.success)
        return fail({
          code: 'VALIDATION_ERROR',
          message: 'Invalid local Agent command',
          details: formatZodErrors(parsed.error.issues),
        });
      const input = parsed.data;
      const owner = requestContext.identityId;
      try {
        switch (input.action) {
          case 'permissions':
            return ok(await runtime.permissions(owner, input.command));
          case 'list_connections':
            return ok(await runtime.listConnections(owner));
          case 'get_default':
            return ok(await runtime.getDefaultChoice(owner));
          case 'set_default':
            await runtime.setDefaultChoice(owner, input.choice);
            return ok(null);
          case 'save_connection':
            return ok(
              await runtime.saveConnection(
                owner,
                input.connection,
                input.id,
                input.expectedRevision,
              ),
            );
          case 'delete_connection':
            await runtime.deleteConnection(owner, input.id);
            return ok(null);
          case 'probe_connection':
            return ok(await runtime.probeConnection(owner, input.id));
          case 'catalog_cached_connection':
            return ok(await runtime.cachedCatalogConnection(owner, input.id));
          case 'probe_default':
            return ok(await runtime.probeDefaultDriver(owner, input.driver));
          case 'list_conversations':
            return ok(await runtime.listConversations(owner));
          case 'rename_conversation':
            return ok(
              await runtime.renameConversation(
                owner,
                input.id,
                input.name,
                input.expectedVersion,
                input.automatic,
              ),
            );
          case 'set_conversation_status':
            return ok(await runtime.setConversationStatus(owner, input.id, input.status));
          case 'create_conversation':
            return ok(await runtime.createConversation(owner, input.conversation));
          case 'respond':
            return ok({ accepted: runtime.respond(owner, input.response) });
          case 'auth_start':
            return ok(await runtime.startLogin(owner, input.connectionId));
          case 'auth_status':
            return ok(runtime.loginStatus(owner, input.connectionId));
          case 'auth_cancel':
            return ok(await runtime.cancelLogin(owner, input.connectionId, input.flowId));
          case 'auth_complete':
            return ok(
              await runtime.completeLogin(
                owner,
                input.connectionId,
                input.flowId,
                input.callbackUrl,
              ),
            );
          case 'auth_sign_out':
            return ok(await runtime.signOutLogin(owner, input.connectionId));
        }
      } catch (error) {
        const failure = toAITransportFailure(error, {
          fallbackCode: 'INTERNAL_ERROR',
          fallbackMessage: 'Local Agent operation failed',
        });
        return fail({ code: failure.code, message: failure.message });
      }
    }),
  );
  installed.push(AIChannels.LOCAL_AGENT);
}
