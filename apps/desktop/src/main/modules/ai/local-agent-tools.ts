import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { LocalAgentToolBridge, LocalAgentRepository, type LocalToolContext } from '@memoflow/ai';
import type { IKnowledgeSourcePort, KnowledgeSourceNote } from '@memoflow/ai/ports';
import {
  KnowledgeDocumentIdSchema,
  KnowledgeDocumentIdWireSchema,
} from '@memoflow/repository-contracts';
import {
  createTaskPowerSyncReadQueries,
  createTaskPowerSyncAgentMutations,
  TaskAgentMutationError,
} from '@memoflow/task';
import type { UserTimeContextPort } from '@memoflow/time';
import {
  createGoalPowerSyncMeasurementReader,
  createGoalPowerSyncAgentMutations,
  GoalAgentMutationError,
  createGoalPowerSyncPageQuery,
} from '@memoflow/goal';
import { GatewayReadError } from '@memoflow/agent-gateway';
import { registerReadTools } from '@memoflow/agent-gateway/server';
import { GatewayFailureCodeSchema } from '@memoflow/contracts/agent-gateway';
import {
  GoalAgentCreateSchema,
  GoalAgentUpdateSchema,
  GoalAgentReceiptSchema,
} from '@memoflow/goal-contracts';
import {
  TaskAgentCreateSchema,
  TaskAgentUpdateSchema,
  TaskAgentCompleteSchema,
  TaskAgentReceiptSchema,
} from '@memoflow/task-contracts';
import type { Result } from '@memoflow/contracts/result';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import {
  GoalPanelSnapshotSchema,
  GoalPanelPatchCommandSchema,
  GoalPanelAddKeyResultCommandSchema,
  GoalPanelRemoveKeyResultCommandSchema,
  GoalPanelFocusCommandSchema,
  GoalPanelSubmitCommandSchema,
  GoalPanelSubmitResultSchema,
  type GoalPanelCommand,
} from '@memoflow/ai-contracts';
import type { IDesktopNativePanelBridge } from './desktop-native-panel-bridge';

function ownerResult<T>(result: Result<T>): T {
  if (result.ok) return result.data;
  const parsed = GatewayFailureCodeSchema.safeParse(result.error.code);
  throw new GatewayReadError(parsed.success ? parsed.data : 'INTERNAL_ERROR');
}
/** Native-session authentication stays local; owner tool contracts match hosted MCP. */
export function createDesktopLocalAgentTools(
  db: IElectronDatabase,
  store: LocalAgentRepository,
  isActive: () => boolean,
  time: UserTimeContextPort,
  knowledge?: IKnowledgeSourcePort,
  panelBridge?: IDesktopNativePanelBridge,
) {
  const tasks = createTaskPowerSyncReadQueries(db, time);
  const goals = createGoalPowerSyncPageQuery(db);
  const goalWrites = createGoalPowerSyncAgentMutations(db);
  const taskWrites = createTaskPowerSyncAgentMutations(
    db,
    time,
    createGoalPowerSyncMeasurementReader,
  );
  const cursorSecret = randomBytes(32).toString('base64url');
  return new LocalAgentToolBridge({
    store,
    isActive,
    onRevokeGrant(grantInput) {
      panelBridge?.releaseAllForRun?.(grantInput.conversationId, grantInput.runId);
    },
    registerTools(server, context: LocalToolContext) {
      if (knowledge) {
        const reference = z.object({
          documentId: KnowledgeDocumentIdWireSchema,
          url: z.string().max(1024),
          spaceId: z.string(),
          path: z.string(),
          title: z.string(),
          excerpt: z.string(),
          contentHash: z.string(),
        });
        function project(note: KnowledgeSourceNote) {
          if (note.identityId !== context.identityId) throw new GatewayReadError('FORBIDDEN');
          return reference.parse({
            documentId: note.knowledgeDocumentId,
            url: `/repository?note=${note.knowledgeDocumentId}`,
            spaceId: note.knowledgeSpaceId,
            path: note.sourcePath,
            title: note.title ?? note.sourcePath,
            excerpt: note.content.slice(0, 2000),
            contentHash: note.sourceContentHash,
          });
        }
        async function read(work: () => Promise<Record<string, unknown>>) {
          try {
            await context.authorize('knowledge:read');
            const result = await context.track(work);
            await context.authorize('knowledge:read');
            if (Buffer.byteLength(JSON.stringify(result)) > 120 * 1024)
              throw new GatewayReadError('RESPONSE_TOO_LARGE');
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(result) }],
              structuredContent: result,
            };
          } catch (error) {
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: error instanceof GatewayReadError ? error.code : 'UNAVAILABLE',
                },
              ],
            };
          }
        }
        const annotations = {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        };
        server.registerTool(
          'knowledge_search',
          {
            description:
              'Search managed Markdown notes in the current local Vault. Returns stable document references and excerpts; no filesystem path input or cloud fallback.',
            inputSchema: z
              .object({
                query: z.string().trim().min(1).max(500),
                limit: z.number().int().min(1).max(20).default(10),
              })
              .strict(),
            outputSchema: z.object({ items: z.array(reference).max(20) }),
            annotations,
          },
          (input) =>
            read(async () => ({
              items: (
                await knowledge.listRelevantNotes(context.identityId, input.query, input.limit)
              )
                .filter((note) => note.knowledgeDocumentId)
                .slice(0, input.limit)
                .map(project),
            })),
        );
        server.registerTool(
          'knowledge_get',
          {
            description:
              'Read one managed local Vault note by the stable documentId from knowledge_search. Source paths are references, never write permissions.',
            inputSchema: z
              .object({
                documentId: KnowledgeDocumentIdWireSchema,
                spaceId: z.string().min(1).max(512).optional(),
              })
              .strict(),
            outputSchema: z.object({ note: reference.extend({ content: z.string() }).nullable() }),
            annotations,
          },
          (input) =>
            read(async () => {
              const note = await knowledge.getNoteById(
                context.identityId,
                KnowledgeDocumentIdSchema.parse(input.documentId),
                input.spaceId,
              );
              if (!note) return { note: null };
              if (Buffer.byteLength(note.content) > 100 * 1024)
                throw new GatewayReadError('RESPONSE_TOO_LARGE');
              return { note: { ...project(note), content: note.content } };
            }),
        );
      }
      async function write(work: () => Promise<Record<string, unknown>>) {
        try {
          const receipt = await context.track(work);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(receipt) }],
            structuredContent: receipt,
          };
        } catch (error) {
          const failure = z
            .object({ code: z.literal('LOCAL_AGENT_PERMISSION_DENIED') })
            .safeParse(error);
          const code =
            error instanceof GoalAgentMutationError || error instanceof TaskAgentMutationError
              ? error.code
              : failure.success
                ? 'FORBIDDEN'
                : error instanceof z.ZodError
                  ? 'VALIDATION_ERROR'
                  : 'INTERNAL_ERROR';
          return { isError: true, content: [{ type: 'text' as const, text: code }] };
        }
      }
      if (context.writeScopes.includes('tasks:write')) {
        const authority = {
          connectionId: context.connectionId,
          authorize: (tx: IElectronDatabaseTransaction) => context.authorize('tasks:write', tx),
        };
        const annotations = {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        };
        server.registerTool(
          'task_plan_create',
          {
            description:
              'Create an owned TaskPlan and its occurrences atomically. Reuse the exact input and idempotencyKey on retries.',
            inputSchema: TaskAgentCreateSchema,
            annotations,
          },
          (input) => write(() => taskWrites.create(input, context, authority)),
        );
        server.registerTool(
          'task_plan_update',
          {
            description:
              'Update an owned TaskPlan using its explicit expectedVersion. A conflict requires a new user decision, never an automatic version replacement.',
            inputSchema: TaskAgentUpdateSchema,
            annotations,
          },
          (input) => write(() => taskWrites.update(input, context, authority)),
        );
        server.registerTool(
          'task_occurrence_complete',
          {
            description:
              'Complete one occurrence with expectedVersion. Prompt contribution must explicitly choose complete_only or record with a measurement; suggestedValue is never a user decision. Fixed contributions follow the existing Task binding.',
            inputSchema: TaskAgentCompleteSchema,
            annotations,
          },
          (input) => write(() => taskWrites.complete(input, context, authority)),
        );
      }
      if (context.writeScopes.includes('goals:write')) {
        const authority = {
          connectionId: context.connectionId,
          authorize: (tx: IElectronDatabaseTransaction) => context.authorize('goals:write', tx),
        };
        server.registerTool(
          'goal_create',
          {
            description:
              'Create an owned Goal atomically. A stable idempotencyKey is required for all retries.',
            inputSchema: GoalAgentCreateSchema,
            annotations: {
              readOnlyHint: false,
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: false,
            },
          },
          (input) => write(() => goalWrites.create(input, context, authority)),
        );
        server.registerTool(
          'goal_update',
          {
            description:
              'Update an owned Goal with its explicit expectedVersion. Never automatically fetch a newer version to override a conflict.',
            inputSchema: GoalAgentUpdateSchema,
            annotations: {
              readOnlyHint: false,
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: false,
            },
          },
          (input) => write(() => goalWrites.update(input, context, authority)),
        );
      }
      if (panelBridge) {
        async function runPanelAction(command: GoalPanelCommand) {
          try {
            const scope = command.action === 'snapshot' ? 'read' : 'goals:write';
            await context.authorize(scope);
            const response = await context.track(() =>
              panelBridge!.executeCommand(context, command),
            );
            if (!response.ok) {
              return {
                isError: true,
                content: [
                  {
                    type: 'text' as const,
                    text: response.error?.message ?? 'Panel command failed',
                  },
                ],
                structuredContent: { error: response.error, snapshot: response.snapshot },
              };
            }
            const structured = response.submitResult
              ? { submitResult: response.submitResult, snapshot: response.snapshot }
              : { snapshot: response.snapshot };
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(structured) }],
              structuredContent: structured,
            };
          } catch (error) {
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: error instanceof Error ? error.message : 'INTERNAL_ERROR',
                },
              ],
            };
          }
        }

        server.registerTool(
          'goal_panel_snapshot',
          {
            description:
              'Get a bounded snapshot of the current Goal business panel, including draft state, key results, dirty/busy status, and allowed actions.',
            inputSchema: z.object({}).strict(),
            annotations: {
              readOnlyHint: true,
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: false,
            },
          },
          () => runPanelAction({ action: 'snapshot' }),
        );

        if (context.writeScopes.includes('goals:write')) {
          server.registerTool(
            'goal_panel_open',
            {
              description:
                'Open the Goal editor panel in create or edit mode and claim exclusive control for this run.',
              inputSchema: z
                .object({
                  mode: z.enum(['create', 'edit']).optional(),
                  goalId: z.string().optional(),
                })
                .strict(),
              annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
              },
            },
            (input) => runPanelAction({ action: 'open', mode: input.mode, goalId: input.goalId }),
          );

          server.registerTool(
            'goal_panel_patch',
            {
              description:
                'Patch fields of the controlled Goal draft. Changes are reflected in the Vue form immediately.',
              inputSchema: GoalPanelPatchCommandSchema.omit({ action: true }),
              annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
              },
            },
            (input) => runPanelAction({ action: 'patch', ...input }),
          );

          server.registerTool(
            'goal_panel_add_key_result',
            {
              description: 'Add a new Key Result to the controlled Goal draft.',
              inputSchema: GoalPanelAddKeyResultCommandSchema.omit({ action: true }),
              annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: false,
              },
            },
            (input) => runPanelAction({ action: 'add_key_result', ...input }),
          );

          server.registerTool(
            'goal_panel_remove_key_result',
            {
              description: 'Remove a Key Result by index from the controlled Goal draft.',
              inputSchema: GoalPanelRemoveKeyResultCommandSchema.omit({ action: true }),
              annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: false,
                openWorldHint: false,
              },
            },
            (input) => runPanelAction({ action: 'remove_key_result', ...input }),
          );

          server.registerTool(
            'goal_panel_focus',
            {
              description:
                'Focus a specific field in the controlled Goal form (name, summary, or description).',
              inputSchema: GoalPanelFocusCommandSchema.omit({ action: true }),
              annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
              },
            },
            (input) => runPanelAction({ action: 'focus', ...input }),
          );

          server.registerTool(
            'goal_panel_submit',
            {
              description:
                'Validate and persist the controlled Goal draft through the real owner form. Returns saved goal information and releases panel.',
              inputSchema: GoalPanelSubmitCommandSchema.omit({ action: true }),
              annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: false,
              },
            },
            (input) => runPanelAction({ action: 'submit', ...input }),
          );

          server.registerTool(
            'goal_panel_release',
            {
              description: 'Release exclusive control of the Goal panel.',
              inputSchema: z.object({}).strict(),
              annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
              },
            },
            () => runPanelAction({ action: 'release' }),
          );
        }
      }
      registerReadTools(
        server,
        {
          cursorSecret,
          tasks: {
            async getTaskPlan(id, cx, budget) {
              return ownerResult(await tasks.getTaskPlan(cx.identityId, id, budget));
            },
            async searchTaskPlans(query, cx, budget) {
              return ownerResult(await tasks.searchTaskPlans(cx.identityId, query, budget));
            },
            async getTaskOccurrence(id, cx, budget) {
              return ownerResult(await tasks.getTaskOccurrence(cx.identityId, id, budget));
            },
            async listTaskOccurrences(query, cx, budget) {
              return ownerResult(await tasks.listTaskOccurrences(cx.identityId, query, budget));
            },
          },
          goals: {
            async getGoal(id, cx, budget) {
              return ownerResult(await goals.getGoal(cx.identityId, id, budget));
            },
            async searchGoalPage(query, cx, budget) {
              return ownerResult(await goals.searchGoalPage(cx.identityId, query, budget));
            },
          },
        },
        context,
        { deadlineAt: context.deadlineAt, signal: context.signal },
        ['goals:read', 'tasks:read'],
        async (_name, scope, work) => {
          try {
            await context.authorize(scope);
            const result = await context.track(work);
            await context.authorize(scope);
            if (Buffer.byteLength(JSON.stringify(result)) > 120 * 1024)
              throw new GatewayReadError('RESPONSE_TOO_LARGE');
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
              structuredContent: result as Record<string, unknown>,
            };
          } catch (error) {
            return {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: error instanceof GatewayReadError ? error.code : 'FORBIDDEN',
                },
              ],
            };
          }
        },
      );
    },
  });
}
