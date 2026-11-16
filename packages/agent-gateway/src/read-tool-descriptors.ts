import {
  GoalGetInputSchema,
  GoalGetOutputSchema,
  GoalSearchInputSchema,
  GoalSearchOutputSchema,
  NotificationListInputSchema,
  NotificationListOutputSchema,
  NotificationUnreadCountOutputSchema,
  TaskPlanGetInputSchema,
  TaskPlanGetOutputSchema,
  TaskPlanSearchInputSchema,
  TaskPlanSearchOutputSchema,
  TaskOccurrenceGetInputSchema,
  TaskOccurrenceGetOutputSchema,
  TaskOccurrenceListInputSchema,
  TaskOccurrenceListOutputSchema,
} from './contracts';
import { z } from 'zod';

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
  notification_list: {
    version: '1',
    effect: 'read',
    requiredScope: 'notifications:read',
    definition: {
      description:
        'List owned notifications with an offset page (page ≤ 20, limit ≤ 50). Bodies are truncated at 2000 characters and flagged; action handles are not exposed.',
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
      description: 'Count owned unread notifications.',
      inputSchema: z.strictObject({}),
      outputSchema: NotificationUnreadCountOutputSchema,
      annotations: readAnnotations,
    },
  },
} as const;
export type GatewayReadToolName = keyof typeof readToolDescriptors;
