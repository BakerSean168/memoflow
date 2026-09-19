import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { TimeZoneIdSchema, YmdSchema } from '@memoflow/contracts/primitives';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type {
  IAIRoutineCommandPort,
  IAIPlannerReadPort,
  IAINotificationReadPort,
} from '../../application/ports';

export interface MemoFlowProductToolDependencies {
  readonly routineCommandPort?: IAIRoutineCommandPort;
  readonly plannerReadPort?: IAIPlannerReadPort;
  readonly notificationReadPort?: IAINotificationReadPort;
}

function executionContext(requestContext: { getRaw(key: string): unknown }): ExecutionContext {
  const raw = requestContext.getRaw('executionContext');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('MemoFlow product command requires canonical executionContext');
  }
  const context = raw as Record<string, unknown>;
  const identityId = typeof context.identityId === 'string' ? context.identityId.trim() : '';
  const requestId = typeof context.requestId === 'string' ? context.requestId.trim() : '';
  const traceId = typeof context.traceId === 'string' ? context.traceId.trim() : '';
  const startedAt = context.startedAt;
  const source = context.source;
  if (
    !identityId ||
    !requestId ||
    !traceId ||
    typeof startedAt !== 'number' ||
    !Number.isFinite(startedAt) ||
    (source !== 'http' && source !== 'ipc' && source !== 'system')
  ) {
    throw new Error('MemoFlow product command requires canonical executionContext');
  }
  return { identityId, requestId, traceId, startedAt, source };
}

function identityId(requestContext: { getRaw(key: string): unknown }): string {
  const value = requestContext.getRaw('identityId');
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('MemoFlow product read requires authenticated identityId');
  }
  return value;
}

function requirePort<T>(port: T | undefined, name: string): T {
  if (!port) throw new Error(`${name} is unavailable on this host`);
  return port;
}

const instantSchema = z.number().int().nonnegative();
const hmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const weekdaySchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);
const routineTriggerRecurrenceSchema = z
  .strictObject({
    startDate: YmdSchema,
    frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    interval: z.number().int().positive().default(1),
    byWeekday: z.array(weekdaySchema).default([]),
    count: z.number().int().positive().nullable().default(null),
    until: instantSchema.nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.frequency === 'weekly' && value.byWeekday.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['byWeekday'],
        message: 'Weekly WallClock recurrence requires at least one weekday',
      });
    }
  });

export const RoutineTriggerSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('WallClock'),
    timingOwner: z.literal('scheduler'),
    localTime: hmSchema,
    timeZone: TimeZoneIdSchema,
    recurrence: routineTriggerRecurrenceSchema,
  }),
  z.strictObject({
    type: z.literal('Elapsed'),
    timingOwner: z.literal('local-runtime'),
    durationMs: z.number().finite().positive(),
    anchor: z
      .enum(['routine-activation', 'profile-activation', 'last-satisfied'])
      .default('last-satisfied'),
  }),
  z.strictObject({
    type: z.literal('ActiveUsage'),
    timingOwner: z.literal('local-runtime'),
    requiredActiveMs: z.number().finite().positive(),
    anchor: z.enum(['profile-activation', 'last-satisfied']).default('last-satisfied'),
    naturalBreakCredit: z
      .strictObject({
        idleDurationMs: z.number().finite().positive(),
        effect: z.literal('satisfy-and-reset').default('satisfy-and-reset'),
      })
      .nullable()
      .default(null),
    protocolBreakCredit: z
      .strictObject({
        kind: z.enum(['Stand', 'Eye', 'Movement']),
        minimumBreakMs: z.number().finite().positive(),
      })
      .nullable()
      .default(null),
  }),
]);

const windowSchema = z.strictObject({
  range: z
    .strictObject({
      start: instantSchema,
      end: instantSchema,
    })
    .refine((value) => value.end > value.start, {
      message: 'Planner range end must be greater than start',
    }),
});

export function createMemoFlowProductTools(deps: MemoFlowProductToolDependencies) {
  const routineCreate = createTool({
    id: 'routine_create',
    description:
      'Create a MemoFlow Routine configuration from one canonical WallClock, Elapsed, or ActiveUsage trigger. Persistent configuration change: explicit user approval is required. Protocol sessions must use routine_start_protocol instead.',
    requireApproval: true,
    inputSchema: z.strictObject({
      name: z.string().trim().min(1).max(200),
      description: z.string().trim().max(1000).optional(),
      routineId: z.string().min(1).optional(),
      trigger: RoutineTriggerSchema,
      profileIds: z.array(z.string().min(1)).max(50).optional(),
    }),
    execute: async (input, { requestContext }) =>
      requirePort(deps.routineCommandPort, 'Routine command capability').createRoutine({
        ...input,
        context: executionContext(requestContext),
      }),
  });

  const routineProfile = createTool({
    id: 'routine_set_profile_active',
    description:
      'Activate or deactivate a Routine Profile gate without rewriting the member routines. Persistent profile configuration change: explicit user approval is required.',
    requireApproval: true,
    inputSchema: z.strictObject({
      profileId: z.string().min(1),
      active: z.boolean(),
    }),
    execute: async (input, { requestContext }) =>
      requirePort(deps.routineCommandPort, 'Routine command capability').setProfileActive({
        ...input,
        context: executionContext(requestContext),
      }),
  });

  const routineOverride = createTool({
    id: 'routine_set_temporary_override',
    description:
      'Set temporary Routine runtime state (snooze/suppress/temporary interval) without rewriting long-lived trigger configuration. Explicit user approval is required.',
    requireApproval: true,
    inputSchema: z.strictObject({
      routineId: z.string().min(1),
      snoozeUntil: z.number().int().nonnegative().nullable().optional(),
      suppressUntil: z.number().int().nonnegative().nullable().optional(),
      overrideIntervalMs: z.number().int().positive().nullable().optional(),
      expiresAt: z.number().int().positive(),
      reason: z.string().trim().min(1).max(500),
    }),
    execute: async (input, { requestContext }) =>
      requirePort(deps.routineCommandPort, 'Routine command capability').setTemporaryOverride({
        ...input,
        context: executionContext(requestContext),
      }),
  });

  const routineOverrideClear = createTool({
    id: 'routine_clear_temporary_override',
    description:
      'Clear a Routine temporary override and restore canonical trigger behavior. Explicit user approval is required.',
    requireApproval: true,
    inputSchema: z.object({ routineId: z.string().min(1) }),
    execute: async (input, { requestContext }) =>
      requirePort(deps.routineCommandPort, 'Routine command capability').clearTemporaryOverride({
        ...input,
        context: executionContext(requestContext),
      }),
  });

  const routineStartProtocol = createTool({
    id: 'routine_start_protocol',
    description:
      'Start a deterministic 50/10 or Pomodoro ProtocolSession. Explicit approval is required before starting a new persistent session; the model never owns timer truth.',
    requireApproval: true,
    inputSchema: z.strictObject({
      methodId: z.enum(['50-10-protocol', 'pomodoro']),
      focusMinutes: z.number().int().positive().optional(),
      breakMinutes: z.number().int().positive().optional(),
      cycles: z.number().int().positive().max(20).optional(),
      longBreakEveryCycles: z.number().int().positive().nullable().optional(),
      longBreakMinutes: z.number().int().positive().nullable().optional(),
    }),
    execute: async (input, { requestContext }) =>
      requirePort(deps.routineCommandPort, 'Routine command capability').startProtocol({
        ...input,
        context: executionContext(requestContext),
      }),
  });

  const protocolTransition = (action: 'pause' | 'resume' | 'end') =>
    createTool({
      id: `routine_${action}_protocol`,
      description: `${action[0].toUpperCase()}${action.slice(1)} an existing deterministic ProtocolSession. This changes only session runtime state; timer truth remains in the Routine Protocol runtime.`,
      inputSchema: z.object({ sessionId: z.string().min(1) }),
      execute: async ({ sessionId }, { requestContext }) =>
        requirePort(deps.routineCommandPort, 'Routine command capability').transitionProtocol({
          context: executionContext(requestContext),
          sessionId,
          action,
        }),
    });

  const plannerToday = createTool({
    id: 'planner_today_summary',
    description:
      'Read canonical owner projections for one local-day Planner range. Supply explicit epoch-millisecond boundaries so Product Time arithmetic stays outside the model-facing data layer. This is read-only.',
    inputSchema: windowSchema,
    execute: async (input, { requestContext }) =>
      requirePort(deps.plannerReadPort, 'Planner read capability').getWindowSummary({
        ...input,
        identityId: identityId(requestContext),
      }),
  });

  const plannerConflicts = createTool({
    id: 'planner_conflicts',
    description:
      'Read canonical Planner conflicts for a requested range. Read-only; conflict truth is derived from owner projections.',
    inputSchema: windowSchema,
    execute: async (input, { requestContext }) =>
      requirePort(deps.plannerReadPort, 'Planner read capability').getConflicts({
        ...input,
        identityId: identityId(requestContext),
      }),
  });

  const plannerUpcomingTasks = createTool({
    id: 'planner_upcoming_tasks',
    description: 'Read upcoming Task owner projections in a requested Planner range. Read-only.',
    inputSchema: windowSchema.extend({ limit: z.number().int().min(1).max(100).optional() }),
    execute: async (input, { requestContext }) =>
      requirePort(deps.plannerReadPort, 'Planner read capability').getUpcomingTasks({
        ...input,
        identityId: identityId(requestContext),
      }),
  });

  const notificationUnread = createTool({
    id: 'notification_unread_summary',
    description:
      'Read the current unread Notification Facts, including a bounded recent-item summary. Read-only; does not expose delivery worker internals.',
    inputSchema: z.strictObject({ limit: z.number().int().min(1).max(50).default(10) }),
    execute: async (input, { requestContext }) =>
      requirePort(deps.notificationReadPort, 'Notification read capability').getUnreadSummary({
        ...input,
        identityId: identityId(requestContext),
      }),
  });

  const notificationExecuteAction = createTool({
    id: 'notification_execute_action',
    description:
      'Execute one typed Notification Inbox action. The Notification owner validates the action and routes owner commands to the owning domain; delivery state is not exposed.',
    requireApproval: true,
    inputSchema: z.strictObject({
      notificationId: z.string().trim().min(1),
      actionKey: z.string().trim().min(1).max(200),
    }),
    execute: async (input, { requestContext }) =>
      requirePort(deps.notificationReadPort, 'Notification command capability').executeAction({
        ...input,
        context: executionContext(requestContext),
      }),
  });

  return {
    routine_create: routineCreate,
    routine_set_profile_active: routineProfile,
    routine_set_temporary_override: routineOverride,
    routine_clear_temporary_override: routineOverrideClear,
    routine_start_protocol: routineStartProtocol,
    routine_pause_protocol: protocolTransition('pause'),
    routine_resume_protocol: protocolTransition('resume'),
    routine_end_protocol: protocolTransition('end'),
    planner_today_summary: plannerToday,
    planner_conflicts: plannerConflicts,
    planner_upcoming_tasks: plannerUpcomingTasks,
    notification_unread_summary: notificationUnread,
    notification_execute_action: notificationExecuteAction,
  };
}

export type MemoFlowProductTools = ReturnType<typeof createMemoFlowProductTools>;
