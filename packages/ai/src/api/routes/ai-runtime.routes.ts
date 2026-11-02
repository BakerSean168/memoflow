import type { ConversationEventSource } from '../../server/domain/repositories/conversation-events.port';
import { Router, type RequestHandler } from 'express';
import type { AIWorkflowRuntimePort, MastraAIRuntime } from '../../server/mastra/runtime';
import type { IConversationAttentionPort } from '../../server/application/ports/conversation-attention.port';
import { registerAIAssistantStreamRoutes } from './ai-assistant-stream.routes';
import { registerAIAssistantControlRoutes } from './ai-assistant-control.routes';
import { registerAIUsageRoutes } from './ai-usage.routes';
import { registerAIWorkflowRoutes } from './ai-workflow.routes';

interface PlatformMiddleware {
  readonly auth: RequestHandler;
}

type AssistantRuntimePort = Pick<
  MastraAIRuntime,
  | 'decideToolApproval'
  | 'answerToolSuspension'
  | 'listAskUserSuspensions'
  | 'dispatchMessage'
  | 'cancelRun'
  | 'listMessages'
  | 'deleteConversation'
  | 'summarizeUsage'
>;

/**
 * Canonical AI vNext Assistant transport.
 *
 * The route owns HTTP framing only. Mastra owns run/thread state; the host owns
 * authenticated identity. No Mastra private event is serialized across the
 * product boundary.
 *
 * The surface seams register on this single Router in the original order:
 * stream — GET /workspace/sse, POST /assistant/sse, POST /assistant/history,
 * POST /assistant/ask-user/pending; control — POST /assistant/delete, /answer,
 * /attention/list, /attention/ack, /approval, /cancel; usage — POST /usage;
 * workflow — POST /workflow/start, /resume, /goal-surface-lease, /get, /list,
 * /cancel.
 *
 * Runtime history stays Mastra-owned: ai-assistant-stream.routes.ts holds the
 * original router.post('/assistant/history' call and parses
 * AssistantRuntimeHistoryViewSchema there, never the AI chat shell DTO.
 */
export function registerAIRuntimeRoutes(
  runtime: AssistantRuntimePort | null,
  middleware: PlatformMiddleware,
  workflowRuntime: AIWorkflowRuntimePort | null = null,
  attentionPort: IConversationAttentionPort | null = null,
  conversationEvents?: ConversationEventSource,
): Router {
  const router = Router();
  const { auth } = middleware;

  registerAIAssistantStreamRoutes(
    router,
    { runtime, workflowRuntime, attentionPort, conversationEvents },
    auth,
  );
  registerAIAssistantControlRoutes(router, { runtime, attentionPort }, auth);
  registerAIUsageRoutes(router, { runtime }, auth);
  registerAIWorkflowRoutes(router, { workflowRuntime }, auth);

  return router;
}
