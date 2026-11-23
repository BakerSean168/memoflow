import type { McpServer } from '@modelcontextprotocol/server';
import {
  GoalPanelPresentInputSchema,
  type GoalPanelCommand,
  type GoalPanelSnapshot,
} from '@memoflow/ai-contracts';
import type { LocalToolContext } from '@memoflow/ai';
import type { IDesktopNativePanelBridge } from './desktop-native-panel-bridge';

class PanelPresentationError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** A bounded projection, never a remote editing session or a renderer write authority. */
export function registerGoalPanelPresentation(
  server: McpServer,
  bridge: IDesktopNativePanelBridge,
  context: LocalToolContext,
): void {
  if (context.origin !== 'client' || !context.writeScopes.includes('goals:write')) return;
  server.registerTool(
    'goal_panel_present',
    {
      description:
        'Show a Goal/KR draft in the active MemoFlow desktop form, or open an existing Goal for refinement. Immediately hand control to the user. This does not save changes or create Tasks; use goal_plan_apply for a complete saved plan.',
      inputSchema: GoalPanelPresentInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      let snapshot: GoalPanelSnapshot | undefined;
      const send = async (command: GoalPanelCommand) => {
        await context.authorize('goals:write');
        const response = await context.track(() => bridge.executeCommand(context, command));
        await context.authorize('goals:write');
        if (!response.ok)
          throw new PanelPresentationError(response.error?.code ?? 'PANEL_OPERATION_FAILED');
        snapshot = response.snapshot;
        return snapshot;
      };
      const revision = () => {
        if (snapshot?.revision === undefined)
          throw new PanelPresentationError('PANEL_SNAPSHOT_MISSING');
        return snapshot.revision;
      };
      try {
        const result = await context.executeAuthorized(
          'goal.read',
          'goal_panel_present',
          async () => {
            await send({
              action: 'open',
              mode: input.mode,
              ...(input.mode === 'edit' ? { goalId: input.goalId } : {}),
            });
            if (input.mode === 'create') {
              await send({ action: 'patch', ...input.fields, expectedRevision: revision() });
              for (const keyResult of input.keyResults) {
                await send({ action: 'add_key_result', keyResult, expectedRevision: revision() });
              }
            }
            await send({ action: 'release' });
            if (!snapshot || snapshot.controlledByMe)
              throw new PanelPresentationError('PANEL_HANDOFF_FAILED');
            return { mode: input.mode, savedByTool: false, handedOff: true, snapshot };
          },
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (error) {
        const raw = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        const code =
          raw === 'LOCAL_AGENT_PERMISSION_DENIED'
            ? 'FORBIDDEN'
            : typeof raw === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(raw)
              ? raw
              : 'PANEL_OPERATION_FAILED';
        return { isError: true, content: [{ type: 'text' as const, text: code }] };
      } finally {
        // Cleanup must work even after this request is aborted or its credential revoked.
        if (bridge.releaseForContext) await bridge.releaseForContext(context);
        else await bridge.executeCommand(context, { action: 'release' }).catch(() => undefined);
      }
    },
  );
}
