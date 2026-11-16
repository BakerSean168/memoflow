import {
  GoalGetInputSchema,
  GoalGetOutputSchema,
  GoalSearchInputSchema,
  GoalSearchOutputSchema,
  TaskPlanGetInputSchema,
  TaskPlanGetOutputSchema,
  TaskPlanSearchInputSchema,
  TaskPlanSearchOutputSchema,
  TaskOccurrenceGetInputSchema,
  TaskOccurrenceGetOutputSchema,
  TaskOccurrenceListInputSchema,
  TaskOccurrenceListOutputSchema,
  RoutineGetInputSchema,
  RoutineGetOutputSchema,
  RoutineListInputSchema,
  RoutineListOutputSchema,
  RoutineUpcomingInputSchema,
  RoutineUpcomingOutputSchema,
  NotificationGetInputSchema,
  NotificationGetOutputSchema,
  NotificationListInputSchema,
  NotificationListOutputSchema,
  NotificationUnreadCountInputSchema,
  NotificationUnreadCountOutputSchema,
  ScheduleGetInputSchema,
  ScheduleGetOutputSchema,
  ScheduleListInputSchema,
  ScheduleListOutputSchema,
} from './contracts';

const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;
/** Shared data proven by Goal/Task reads; no SDK, workflow or registry runtime. */
export const readToolDescriptors = {
  goal_get: {
    version: '1',
    effect: 'read',
    requiredScope: 'goals:read',
    definition: {
      description: 'Read an owned Goal and its Key Results.',
      inputSchema: GoalGetInputSchema,
      outputSchema: GoalGetOutputSchema,
      annotations: readAnnotations,
    },
  },
  goal_search: {
    version: '1',
    effect: 'read',
    requiredScope: 'goals:read',
    definition: {
      description: 'Search owned active Goals using a bounded keyset page.',
      inputSchema: GoalSearchInputSchema,
      outputSchema: GoalSearchOutputSchema,
      annotations: readAnnotations,
    },
  },
  task_plan_get: {
    version: '1',
    effect: 'read',
    requiredScope: 'tasks:read',
    definition: {
      description:
        'Read an owned TaskPlan definition; no synthetic occurrence statistics or private bodies.',
      inputSchema: TaskPlanGetInputSchema,
      outputSchema: TaskPlanGetOutputSchema,
      annotations: readAnnotations,
    },
  },
  task_plan_search: {
    version: '1',
    effect: 'read',
    requiredScope: 'tasks:read',
    definition: {
      description: 'Search owned non-archived TaskPlans with createdAt/id keyset pagination.',
      inputSchema: TaskPlanSearchInputSchema,
      outputSchema: TaskPlanSearchOutputSchema,
      annotations: readAnnotations,
    },
  },
  task_occurrence_get: {
    version: '1',
    effect: 'read',
    requiredScope: 'tasks:read',
    definition: {
      description: 'Read an owned existing TaskOccurrence using current account Product Time.',
      inputSchema: TaskOccurrenceGetInputSchema,
      outputSchema: TaskOccurrenceGetOutputSchema,
      annotations: readAnnotations,
    },
  },
  task_occurrence_list: {
    version: '1',
    effect: 'read',
    requiredScope: 'tasks:read',
    definition: {
      description:
        'List existing owned occurrences in an inclusive account-time date range (epoch ms; at most 31 days). Optional earlier open facts; never materializes upcoming occurrences.',
      inputSchema: TaskOccurrenceListInputSchema,
      outputSchema: TaskOccurrenceListOutputSchema,
      annotations: readAnnotations,
    },
  },
  routine_get: {
    version: '1',
    effect: 'read',
    requiredScope: 'routines:read',
    definition: {
      description: 'Read one owned Routine definition and its trigger revision.',
      inputSchema: RoutineGetInputSchema,
      outputSchema: RoutineGetOutputSchema,
      annotations: readAnnotations,
    },
  },
  routine_list: {
    version: '1',
    effect: 'read',
    requiredScope: 'routines:read',
    definition: {
      description:
        'Search owned Routine definitions by name or description using a bounded keyset page.',
      inputSchema: RoutineListInputSchema,
      outputSchema: RoutineListOutputSchema,
      annotations: readAnnotations,
    },
  },
  routine_upcoming: {
    version: '1',
    effect: 'read',
    requiredScope: 'routines:read',
    definition: {
      description:
        'List upcoming owned Routine occurrences in an ordered epoch-ms window of at most 31 days, bounded to 100 per page.',
      inputSchema: RoutineUpcomingInputSchema,
      outputSchema: RoutineUpcomingOutputSchema,
      annotations: readAnnotations,
    },
  },
  notification_get: {
    version: '1',
    effect: 'read',
    requiredScope: 'notifications:read',
    definition: {
      description: 'Read one owned Notification fact.',
      inputSchema: NotificationGetInputSchema,
      outputSchema: NotificationGetOutputSchema,
      annotations: readAnnotations,
    },
  },
  notification_list: {
    version: '1',
    effect: 'read',
    requiredScope: 'notifications:read',
    definition: {
      description: 'List owned Notification facts with bounded pagination.',
      inputSchema: NotificationListInputSchema,
      outputSchema: NotificationListOutputSchema,
      annotations: readAnnotations,
    },
  },
  notification_unread_count: {
    version: '1',
    effect: 'read',
    requiredScope: 'notifications:read',
    definition: {
      description: 'Get the unread Notification count for the owned profile.',
      inputSchema: NotificationUnreadCountInputSchema,
      outputSchema: NotificationUnreadCountOutputSchema,
      annotations: readAnnotations,
    },
  },
  schedule_get: {
    version: '1',
    effect: 'read',
    requiredScope: 'schedules:read',
    definition: {
      description: 'Read one owned Calendar Schedule entry.',
      inputSchema: ScheduleGetInputSchema,
      outputSchema: ScheduleGetOutputSchema,
      annotations: readAnnotations,
    },
  },
  schedule_list: {
    version: '1',
    effect: 'read',
    requiredScope: 'schedules:read',
    definition: {
      description:
        'List owned Calendar Schedule entries in a bounded time range (at most 90 days).',
      inputSchema: ScheduleListInputSchema,
      outputSchema: ScheduleListOutputSchema,
      annotations: readAnnotations,
    },
  },
} as const;
export type GatewayReadToolName = keyof typeof readToolDescriptors;
