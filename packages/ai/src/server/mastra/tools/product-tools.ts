import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
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
  if (!raw || typeof raw !== 'object') {
    throw new Error('MemoFlow product command requires canonical executionContext');
  }
  const context = raw as Partial<ExecutionContext>;
  if (typeof context.identityId !== 'string' || !context.identityId.trim()) {
    throw new Error('MemoFlow product command requires authenticated identityId');
  }
  return context as ExecutionContext;
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

const windowSchema = z.object({
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().positive(),
}).refine((value) => value.endTime > value.startTime, {
  message: 'endTime must be greater than startTime',
});

export function createMemoFlowProductTools(deps: MemoFlowProductToolDependencies) {
  const routineCreate = createTool({
    id: 'routine_create',
    description:
      'Create a MemoFlow Routine configuration. Persistent configuration change: explicit user approval is required. Use a WallClock method preset or provide an Interval/FixedTime trigger. Protocol presets must use routine_start_protocol instead.',
    requireApproval: true,
    inputSchema: z.object({
      title: z.string().trim().min(1).max(200),
      description: z.string().trim().max(1000).optional(),
      methodId: z.enum([
        'stand-and-move',
        '20-20-20',
        'drink-water',
        'sleep-wind-down',
        '50-10-protocol',
        'pomodoro',
      ]).optional(),
      trigger: z.discriminatedUnion('type', [
        z.object({ type: z.literal('Interval'), intervalMinutes: z.number().int().positive() }),
        z.object({ type: z.literal('FixedTime'), fixedTime: z.string().regex(/^\d{2}:\d{2}$/) }),
      ]).optional(),
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
    inputSchema: z.object({
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
    inputSchema: z.object({
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
    inputSchema: z.object({
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

  const protocolTransition = (action: 'pause' | 'resume' | 'end') => createTool({
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
      'Read the user-visible Planner and Task projection for one local-day window. Supply explicit epoch-millisecond day boundaries so timezone arithmetic stays outside the model-facing data layer. This is read-only.',
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
      'Read Calendar conflicts for a requested window. Read-only; never returns or mutates Scheduler worker state.',
    inputSchema: windowSchema,
    execute: async (input, { requestContext }) =>
      requirePort(deps.plannerReadPort, 'Planner read capability').getConflicts({
        ...input,
        identityId: identityId(requestContext),
      }),
  });

  const plannerUpcomingTasks = createTool({
    id: 'planner_upcoming_tasks',
    description: 'Read upcoming Task occurrences in a requested window. Read-only.',
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
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(10) }),
    execute: async (input, { requestContext }) =>
      requirePort(deps.notificationReadPort, 'Notification read capability').getUnreadSummary({
        ...input,
        identityId: identityId(requestContext),
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
  };
}

export type MemoFlowProductTools = ReturnType<typeof createMemoFlowProductTools>;
