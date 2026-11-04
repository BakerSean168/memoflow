import { ipcMain } from 'electron';
import { AIChannels, type IElectronModuleContext } from '@memoflow/desktop-contracts';
import {
  AIWorkflowCancelClientRequestSchema,
  AIGoalSurfaceLeaseRequestSchema,
  AIGoalSurfaceLeaseResponseSchema,
  AIWorkflowGetClientRequestSchema,
  AIWorkflowListClientRequestSchema,
  AIWorkflowResumeClientRequestSchema,
  AIWorkflowRunViewSchema,
  AIWorkflowStartClientRequestSchema,
} from '@memoflow/ai-contracts';
import { fail, ok } from '@memoflow/transport-contracts/result';
import { formatZodErrors } from '@memoflow/utils/result';
import { toAITransportFailure } from '../../server/transport';
import { withAuthenticatedValue, type AIElectronHandlerDeps } from './context';

/**
 * Canonical Mastra workflow channels.
 * 规范 Mastra workflow 通道。
 */
export function registerWorkflowHandlers(
  ctx: IElectronModuleContext,
  deps: AIElectronHandlerDeps,
): void {
  const { instance: aiModule, installed } = deps;

  // AI vNext canonical Workflow request/response transport. Mastra owns
  // workflow execution/snapshots; MemoFlow owns authenticated product mutations.
  ipcMain.handle(AIChannels.RUNTIME_WORKFLOW_START, async (_, request) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      if (!aiModule.workflowRuntime) {
        return fail({
          code: 'SERVICE_UNAVAILABLE',
          message: 'AI workflow runtime unavailable',
        });
      }
      const parsed = AIWorkflowStartClientRequestSchema.safeParse(request);
      if (!parsed.success) {
        return fail({
          code: 'VALIDATION_ERROR',
          message: 'Invalid workflow start request',
          details: formatZodErrors(parsed.error.issues),
        });
      }
      try {
        const run = AIWorkflowRunViewSchema.parse(
          await aiModule.workflowRuntime.startDetached({
            context: requestContext,
            request: parsed.data,
          }),
        );
        return ok(run);
      } catch (error) {
        const failure = toAITransportFailure(error, {
          fallbackCode: 'AI_WORKFLOW_RUNTIME_ERROR',
          fallbackMessage: 'Workflow failed',
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
  installed.push(AIChannels.RUNTIME_WORKFLOW_START);
  ipcMain.handle(AIChannels.RUNTIME_WORKFLOW_RESUME, async (_, request) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      if (!aiModule.workflowRuntime) {
        return fail({
          code: 'SERVICE_UNAVAILABLE',
          message: 'AI workflow runtime unavailable',
        });
      }
      const parsed = AIWorkflowResumeClientRequestSchema.safeParse(request);
      if (!parsed.success) {
        return fail({
          code: 'VALIDATION_ERROR',
          message: 'Invalid workflow resume request',
          details: formatZodErrors(parsed.error.issues),
        });
      }
      try {
        const run = AIWorkflowRunViewSchema.parse(
          await aiModule.workflowRuntime.resumeDetached({
            context: requestContext,
            request: parsed.data,
          }),
        );
        return ok(run);
      } catch (error) {
        const failure = toAITransportFailure(error, {
          fallbackCode: 'AI_WORKFLOW_RUNTIME_ERROR',
          fallbackMessage: 'Workflow failed',
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
  installed.push(AIChannels.RUNTIME_WORKFLOW_RESUME);
  ipcMain.handle(AIChannels.RUNTIME_WORKFLOW_GOAL_SURFACE_LEASE, async (_, request) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      if (!aiModule.workflowRuntime) {
        return fail({
          code: 'SERVICE_UNAVAILABLE',
          message: 'AI workflow runtime unavailable',
        });
      }
      const parsed = AIGoalSurfaceLeaseRequestSchema.safeParse(request);
      if (!parsed.success) {
        return fail({
          code: 'VALIDATION_ERROR',
          message: 'Invalid Goal surface lease request',
          details: formatZodErrors(parsed.error.issues),
        });
      }
      try {
        const result = AIGoalSurfaceLeaseResponseSchema.parse(
          await aiModule.workflowRuntime.goalSurfaceLease({
            identityId: requestContext.identityId,
            request: parsed.data,
          }),
        );
        return ok(result);
      } catch (error) {
        const failure = toAITransportFailure(error, {
          fallbackCode: 'AI_WORKFLOW_RUNTIME_ERROR',
          fallbackMessage: 'Goal surface lease failed',
        });
        return fail({
          code: failure.code,
          message: failure.message,
          context: failure.context,
        });
      }
    }),
  );
  installed.push(AIChannels.RUNTIME_WORKFLOW_GOAL_SURFACE_LEASE);
  ipcMain.handle(AIChannels.RUNTIME_WORKFLOW_GET, async (_, request) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      if (!aiModule.workflowRuntime) {
        return fail({
          code: 'SERVICE_UNAVAILABLE',
          message: 'AI workflow runtime unavailable',
        });
      }
      const parsed = AIWorkflowGetClientRequestSchema.safeParse(request);
      if (!parsed.success) {
        return fail({
          code: 'VALIDATION_ERROR',
          message: 'Invalid workflow get request',
          details: formatZodErrors(parsed.error.issues),
        });
      }
      try {
        const run = await aiModule.workflowRuntime.get({
          identityId: requestContext.identityId,
          runId: parsed.data.runId,
        });
        return ok(run ? AIWorkflowRunViewSchema.parse(run) : null);
      } catch (error) {
        const failure = toAITransportFailure(error, {
          fallbackCode: 'AI_WORKFLOW_RUNTIME_ERROR',
          fallbackMessage: 'Workflow failed',
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
  installed.push(AIChannels.RUNTIME_WORKFLOW_GET);
  ipcMain.handle(AIChannels.RUNTIME_WORKFLOW_LIST, async (_, request) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      if (!aiModule.workflowRuntime) {
        return fail({
          code: 'SERVICE_UNAVAILABLE',
          message: 'AI workflow runtime unavailable',
        });
      }
      const parsed = AIWorkflowListClientRequestSchema.safeParse(request ?? {});
      if (!parsed.success) {
        return fail({
          code: 'VALIDATION_ERROR',
          message: 'Invalid workflow list request',
          details: formatZodErrors(parsed.error.issues),
        });
      }
      try {
        const runs = await aiModule.workflowRuntime.list({
          identityId: requestContext.identityId,
          conversationId: parsed.data.conversationId,
        });
        return ok(runs.map((run) => AIWorkflowRunViewSchema.parse(run)));
      } catch (error) {
        const failure = toAITransportFailure(error, {
          fallbackCode: 'AI_WORKFLOW_RUNTIME_ERROR',
          fallbackMessage: 'Workflow failed',
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
  installed.push(AIChannels.RUNTIME_WORKFLOW_LIST);
  ipcMain.handle(AIChannels.RUNTIME_WORKFLOW_CANCEL, async (_, request) =>
    withAuthenticatedValue(ctx, async (requestContext) => {
      if (!aiModule.workflowRuntime) {
        return fail({
          code: 'SERVICE_UNAVAILABLE',
          message: 'AI workflow runtime unavailable',
        });
      }
      const parsed = AIWorkflowCancelClientRequestSchema.safeParse(request);
      if (!parsed.success) {
        return fail({
          code: 'VALIDATION_ERROR',
          message: 'Invalid workflow cancel request',
          details: formatZodErrors(parsed.error.issues),
        });
      }
      try {
        const run = await aiModule.workflowRuntime.cancel({
          identityId: requestContext.identityId,
          runId: parsed.data.runId,
        });
        return ok(run ? AIWorkflowRunViewSchema.parse(run) : null);
      } catch (error) {
        const failure = toAITransportFailure(error, {
          fallbackCode: 'AI_WORKFLOW_RUNTIME_ERROR',
          fallbackMessage: 'Workflow failed',
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
  installed.push(AIChannels.RUNTIME_WORKFLOW_CANCEL);
}
