import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import {
  LocalAgentToolBridge,
  LocalAgentRepository,
  LocalMcpClientRepository,
  PermissionLocalRepository,
  permissionOperationForTool,
  goalPanelSubmitOperationId,
  type LocalToolContext,
} from '@memoflow/ai';
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
import {
  createRoutinePowerSyncAgentMutations,
  createRoutinePowerSyncRepositories,
  RoutineAgentMutationError,
} from '@memoflow/routine';
import {
  createRoutineConfigurationQueryService,
  createInMemoryRoutineRuntimeContextStore,
  type RoutineConfigurationQueryPort,
} from '@memoflow/routine/routine-runtime';
import {
  GatewayFailureCodeSchema,
  GatewayGoalCreateSchema,
  GatewayGoalUpdateSchema,
  GatewayKeyResultCreateSchema,
  GatewayKeyResultUpdateSchema,
  GatewayReadError,
  GatewayTaskCreateSchema,
  GatewayTaskUpdateSchema,
  GatewayTaskCompleteSchema,
  GatewayRoutineCreateSchema,
  type GatewayWriteAuthority,
  type GatewayWritePort,
  type RoutineReadPort,
  type NotificationReadPort,
  type ScheduleReadPort,
} from '@memoflow/agent-gateway';
import type { NotificationInboxPort } from '@memoflow/notification';
import type { ScheduleEventApplicationPort } from '@memoflow/schedule';
import {
  registerReadTools,
  registerWriteTools,
  type ReadToolCall,
} from '@memoflow/agent-gateway/server';
import type { Result } from '@memoflow/transport-contracts/result';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/desktop-contracts';
import {
  assertGoalDirectWriteAllowed,
  assertGoalIntentCanCommit,
  GoalIntentCommitBlockedError,
  GoalPanelPatchCommandSchema,
  GoalPanelAddKeyResultCommandSchema,
  GoalPanelRemoveKeyResultCommandSchema,
  GoalPanelFocusCommandSchema,
  GoalPanelSubmitCommandSchema,
  type GoalPanelCommand,
} from '@memoflow/ai-contracts';
import type { IDesktopNativePanelBridge } from './desktop-native-panel-bridge';

export interface DesktopLocalAgentToolsDomains {
  readonly routineQuery?: RoutineConfigurationQueryPort;
  readonly notifications?: NotificationReadPort | NotificationInboxPort;
  readonly schedules?: ScheduleReadPort | ScheduleEventApplicationPort;
}

function bindNotificationReadPort(
  port: NotificationReadPort | NotificationInboxPort,
): NotificationReadPort {
  if ('getUnreadCount' in port && 'listNotifications' in port && !('createNotification' in port)) {
    return port as NotificationReadPort;
  }
  const inbox = port as NotificationInboxPort;
  return {
    async getNotification(id, cx) {
      const res = await inbox.getNotification(id, cx.identityId);
      if (!res.ok || !res.data) return null;
      const row = res.data as Record<string, unknown>;
      return {
        id: String(row.id),
        workflowKey: String(row.workflowKey ?? ''),
        topic: String(row.topic ?? ''),
        title: String(row.title ?? ''),
        content: String(row.content ?? ''),
        type: String(row.type ?? 'info'),
        category: String(row.category ?? 'system'),
        importance: String(row.importance ?? 'normal'),
        urgency: String(row.urgency ?? 'normal'),
        isRead: Boolean(row.isRead),
        readAt: (row.readAt as string | number | null | undefined) ?? null,
        createdAt: (row.createdAt as string | number) ?? Date.now(),
        updatedAt: (row.updatedAt as string | number) ?? Date.now(),
        expiresAt: (row.expiresAt as string | number | null | undefined) ?? null,
        relatedEntityType: (row.relatedEntityType as string | null | undefined) ?? null,
        relatedEntityId: (row.relatedEntityId as string | null | undefined) ?? null,
        version: typeof row.version === 'number' ? row.version : 1,
      };
    },
    async listNotifications(query, cx) {
      const res = await inbox.listNotifications({
        identityId: cx.identityId,
        isRead: query.isRead,
        category: query.category,
        limit: query.limit,
        page: query.offset ? Math.floor(query.offset / query.limit) + 1 : 1,
      });
      if (!res.ok || !res.data) return { items: [], total: 0, hasMore: false };
      const data = res.data as Record<string, unknown>;
      const list = (
        Array.isArray(data) ? data : ((data.notifications ?? data.items ?? []) as unknown[])
      ) as Record<string, unknown>[];
      const total = typeof data.total === 'number' ? data.total : list.length;
      const items = list.map((row) => ({
        id: String(row.id),
        workflowKey: String(row.workflowKey ?? ''),
        topic: String(row.topic ?? ''),
        title: String(row.title ?? ''),
        content: String(row.content ?? ''),
        type: String(row.type ?? 'info'),
        category: String(row.category ?? 'system'),
        importance: String(row.importance ?? 'normal'),
        urgency: String(row.urgency ?? 'normal'),
        isRead: Boolean(row.isRead),
        readAt: (row.readAt as string | number | null | undefined) ?? null,
        createdAt: (row.createdAt as string | number) ?? Date.now(),
        updatedAt: (row.updatedAt as string | number) ?? Date.now(),
        expiresAt: (row.expiresAt as string | number | null | undefined) ?? null,
        relatedEntityType: (row.relatedEntityType as string | null | undefined) ?? null,
        relatedEntityId: (row.relatedEntityId as string | null | undefined) ?? null,
        version: typeof row.version === 'number' ? row.version : 1,
      }));
      return {
        items,
        total,
        hasMore: total > (query.offset ?? 0) + items.length,
      };
    },
    async getUnreadCount(cx) {
      const res = await inbox.getUnreadCount(cx.identityId);
      if (!res.ok) return 0;
      const data = res.data as unknown;
      return typeof data === 'number'
        ? data
        : typeof (data as { unreadCount?: number })?.unreadCount === 'number'
          ? (data as { unreadCount: number }).unreadCount
          : 0;
    },
  };
}

function bindScheduleReadPort(
  port: ScheduleReadPort | ScheduleEventApplicationPort,
): ScheduleReadPort {
  if ('getSchedule' in port && 'listSchedules' in port) {
    return port as ScheduleReadPort;
  }
  const api = port as ScheduleEventApplicationPort;
  return {
    async getSchedule(id, cx) {
      const res = await api.getEvent(id, cx);
      if (!res.ok || !res.data) return null;
      const row = res.data as Record<string, unknown>;
      return {
        id: String(row.id),
        title: String(row.title ?? row.name ?? ''),
        description: (row.description as string | undefined) ?? undefined,
        range: row.range as import('@memoflow/schedule-contracts').CalendarEntryRange,
        location: (row.location as string | undefined) ?? undefined,
        attendees: (row.attendees as string[] | undefined) ?? undefined,
        version: typeof row.version === 'number' ? row.version : 1,
        createdAt: (row.createdAt as string | number) ?? Date.now(),
        updatedAt: (row.updatedAt as string | number) ?? Date.now(),
      };
    },
    async listSchedules(query, cx) {
      const res = await api.listEvents(
        {
          identityId: cx.identityId,
          startTime: query.startTime,
          endTime: query.endTime,
        },
        cx,
      );
      if (!res.ok || !res.data) return { items: [], hasMore: false };
      const list = (
        Array.isArray(res.data)
          ? res.data
          : (((res.data as Record<string, unknown>).items ?? []) as unknown[])
      ) as Record<string, unknown>[];
      const offset = query.offset ?? 0;
      const sliced = list.slice(offset, offset + query.limit);
      const items = sliced.map((row) => ({
        id: String(row.id),
        title: String(row.title ?? row.name ?? ''),
        description: (row.description as string | undefined) ?? undefined,
        range: row.range as import('@memoflow/schedule-contracts').CalendarEntryRange,
        location: (row.location as string | undefined) ?? undefined,
        attendees: (row.attendees as string[] | undefined) ?? undefined,
        version: typeof row.version === 'number' ? row.version : 1,
        createdAt: (row.createdAt as string | number) ?? Date.now(),
        updatedAt: (row.updatedAt as string | number) ?? Date.now(),
      }));
      return {
        items,
        hasMore: list.length > offset + items.length,
      };
    },
  };
}

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
  mcp?: { clients: LocalMcpClientRepository; discoveryPath?: string },
  domains?: DesktopLocalAgentToolsDomains,
) {
  const tasks = createTaskPowerSyncReadQueries(db, time);
  const goals = createGoalPowerSyncPageQuery(db);
  const goalWrites = createGoalPowerSyncAgentMutations(db);
  const taskWrites = createTaskPowerSyncAgentMutations(
    db,
    time,
    createGoalPowerSyncMeasurementReader,
  );
  const routineWrites = createRoutinePowerSyncAgentMutations(db);
  const routineRepos = createRoutinePowerSyncRepositories(db);
  const defaultRoutineQuery = createRoutineConfigurationQueryService({
    occurrenceTruthStore: routineRepos.routineOccurrenceTruthStore,
    routineProfileStore: routineRepos.routineProfileStore,
    routinePreferencesStore: routineRepos.routinePreferencesStore,
    runtimeContextStore: createInMemoryRoutineRuntimeContextStore(),
    temporaryOverrideStore: routineRepos.routineTemporaryOverrideStore,
    localRuntimeAvailable: true,
  });
  const routineQuery = domains?.routineQuery ?? defaultRoutineQuery;
  const routineReads: RoutineReadPort = {
    getConfigurationSnapshot: (identityId) => routineQuery.getConfigurationSnapshot(identityId),
    getUpcomingOccurrences: (identityId, query) =>
      routineQuery.getUpcomingOccurrences(identityId, query),
  };
  const notificationReadPort = domains?.notifications
    ? bindNotificationReadPort(domains.notifications)
    : undefined;
  const scheduleReadPort = domains?.schedules ? bindScheduleReadPort(domains.schedules) : undefined;
  const cursorSecret = randomBytes(32).toString('base64url');
  return new LocalAgentToolBridge({
    store,
    permissions: new PermissionLocalRepository(db),
    isActive,
    clients: mcp?.clients,
    discoveryPath: mcp?.discoveryPath,
    onRevokeGrant(grantInput) {
      panelBridge?.releaseAllForRun?.(grantInput.conversationId, grantInput.runId);
    },
    registerTools(server, context: LocalToolContext) {
      // External MCP clients have no visible Agent panel or run, so the panel
      // tools (and the "use the form" write rule) only apply to built-in runs.
      const panels = context.origin === 'client' ? undefined : panelBridge;
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
        async function read(toolName: string, work: () => Promise<Record<string, unknown>>) {
          try {
            const operationId = permissionOperationForTool(toolName)?.id ?? toolName;
            const result = await context.executeAuthorized(operationId, toolName, async () => {
              await context.authorize('knowledge:read');
              const value = await context.track(work);
              await context.authorize('knowledge:read');
              if (Buffer.byteLength(JSON.stringify(value)) > 120 * 1024)
                throw new GatewayReadError('RESPONSE_TOO_LARGE');
              return value;
            });
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
                  text:
                    error instanceof GatewayReadError
                      ? error.code
                      : error instanceof Error && 'code' in error
                        ? String(error.code)
                        : 'UNAVAILABLE',
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
            read('knowledge_search', async () => ({
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
            read('knowledge_get', async () => {
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
      const writeCall: ReadToolCall = async <T extends object>(
        toolName: Parameters<ReadToolCall>[0],
        _scope: Parameters<ReadToolCall>[1],
        work: () => Promise<T>,
      ) => {
        try {
          const operationId = permissionOperationForTool(toolName)?.id ?? toolName;
          const receipt = await context.executeAuthorized(operationId, toolName, () =>
            context.track(work),
          );
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(receipt) }],
            structuredContent: receipt as Record<string, unknown>,
          };
        } catch (error) {
          const failure = z
            .object({ code: z.enum(['LOCAL_AGENT_PERMISSION_DENIED', 'PERMISSION_DENIED']) })
            .safeParse(error);
          const code =
            error instanceof GoalAgentMutationError ||
            error instanceof TaskAgentMutationError ||
            error instanceof RoutineAgentMutationError
              ? error.code
              : failure.success
                ? failure.data.code === 'PERMISSION_DENIED'
                  ? 'PERMISSION_DENIED'
                  : 'FORBIDDEN'
                : error instanceof z.ZodError
                  ? 'VALIDATION_ERROR'
                  : error instanceof GoalIntentCommitBlockedError
                    ? error.code
                    : 'INTERNAL_ERROR';
          return {
            isError: true,
            content: [{ type: 'text' as const, text: code }],
          };
        }
      };
      type OwnerMutationAuthority = {
        connectionId: string;
        authorize(tx: IElectronDatabaseTransaction): Promise<void>;
      };
      // The bridge revalidates the connection revision and the tool's write
      // scope inside every owner transaction; a port must never bypass it.
      const mutationAuthority = (
        scope: 'goals:write' | 'tasks:write' | 'routines:write',
      ): OwnerMutationAuthority => ({
        connectionId: context.connectionId,
        authorize: (tx) => context.authorize(scope, tx),
      });
      const writes: GatewayWritePort = {
        goalCreate(input, cx) {
          const parsed = GatewayGoalCreateSchema.parse(input);
          // The run's user message cannot change mid-run, so one check before the owner write is enough.
          assertGoalIntentCanCommit(context.goalIntent ?? JSON.stringify(parsed.goal));
          // With the visible form available, a hidden write would leave the user nothing to review operations.
          if (panels) assertGoalDirectWriteAllowed(context.goalIntent);
          return goalWrites.create(parsed, cx, mutationAuthority('goals:write'));
        },
        goalUpdate(input, cx) {
          return goalWrites.update(
            GatewayGoalUpdateSchema.parse(input),
            cx,
            mutationAuthority('goals:write'),
          );
        },
        keyResultCreate(input, cx) {
          return goalWrites.createKeyResult(
            GatewayKeyResultCreateSchema.parse(input),
            cx,
            mutationAuthority('goals:write'),
          );
        },
        keyResultUpdate(input, cx) {
          return goalWrites.updateKeyResult(
            GatewayKeyResultUpdateSchema.parse(input),
            cx,
            mutationAuthority('goals:write'),
          );
        },
        taskCreate(input, cx) {
          const parsed = GatewayTaskCreateSchema.parse(input);
          if (parsed.plan.goalBinding && !context.writeScopes.includes('goals:write'))
            throw new GatewayReadError('FORBIDDEN');
          return taskWrites.create(parsed, cx, mutationAuthority('tasks:write'));
        },
        taskUpdate(input, cx) {
          const parsed = GatewayTaskUpdateSchema.parse(input);
          if (
            parsed.changes.goalBinding !== undefined &&
            !context.writeScopes.includes('goals:write')
          )
            throw new GatewayReadError('FORBIDDEN');
          return taskWrites.update(parsed, cx, mutationAuthority('tasks:write'));
        },
        taskComplete(input, cx) {
          return taskWrites.complete(
            GatewayTaskCompleteSchema.parse(input),
            cx,
            mutationAuthority('tasks:write'),
          );
        },
        routineCreate(input, cx) {
          return routineWrites.create(
            GatewayRoutineCreateSchema.parse(input),
            cx,
            mutationAuthority('routines:write'),
          );
        },
      };
      const writeAuthority: GatewayWriteAuthority = {
        connectionId: context.connectionId,
        scopes: context.writeScopes,
        // The local gate revalidates the tool scope and connection revision
        // inside every owner transaction (mutationAuthority); this shared
        // shape only needs to refuse a revoked grant.
        authorize: () => context.authorize('read'),
      };
      registerWriteTools(server, writes, context, context.writeScopes, writeAuthority, writeCall);
      if (panels) {
        async function runPanelAction(command: GoalPanelCommand) {
          try {
            if (command.action === 'submit') assertGoalIntentCanCommit(context.goalIntent ?? '');
            const scope = command.action === 'snapshot' ? 'read' : 'goals:write';
            await context.authorize(scope);
            let response;
            if (command.action === 'submit') {
              const snapshot = await panelBridge!.executeCommand(context, { action: 'snapshot' });
              const operationId = goalPanelSubmitOperationId(snapshot.snapshot?.mode === 'edit');
              response = await context.executeAuthorized(
                operationId,
                'goal_panel_submit',
                async () => {
                  await context.authorize(scope);
                  return context.track(() => panelBridge!.executeCommand(context, command));
                },
              );
            } else {
              response = await context.track(() => panelBridge!.executeCommand(context, command));
            }
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
          routines: routineReads,
          ...(notificationReadPort ? { notifications: notificationReadPort } : {}),
          ...(scheduleReadPort ? { schedules: scheduleReadPort } : {}),
        },
        context,
        { deadlineAt: context.deadlineAt, signal: context.signal },
        [
          'goals:read',
          'tasks:read',
          'routines:read',
          ...(notificationReadPort ? ['notifications:read'] : []),
          ...(scheduleReadPort ? ['schedules:read'] : []),
        ],
        async (toolName, scope, work) => {
          try {
            const operationId = permissionOperationForTool(toolName)?.id ?? toolName;
            const result = await context.executeAuthorized(operationId, toolName, async () => {
              await context.authorize(scope);
              const value = await context.track(work);
              await context.authorize(scope);
              if (Buffer.byteLength(JSON.stringify(value)) > 120 * 1024)
                throw new GatewayReadError('RESPONSE_TOO_LARGE');
              return value;
            });
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
