import {
  AiAgentGetInputSchema,
  AiAgentGetOutputSchema,
  AiAgentListInputSchema,
  AiAgentListOutputSchema,
  AiConversationGetInputSchema,
  AiConversationListInputSchema,
  AiConversationListOutputSchema,
  AiConversationTranscriptInputSchema,
  AiConversationTranscriptOutputSchema,
  GoalGetInputSchema,
  GoalGetOutputSchema,
  GoalSearchInputSchema,
  GoalSearchOutputSchema,
  LabelListInputSchema,
  LabelListOutputSchema,
  LabelResolveNamesInputSchema,
  LabelResolveNamesOutputSchema,
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
  RelationNeighborsInputSchema,
  RelationNeighborsOutputSchema,
  RoutineGetInputSchema,
  RoutineGetOutputSchema,
  RoutineListInputSchema,
  RoutineListOutputSchema,
  RoutineUpcomingInputSchema,
  RoutineUpcomingOutputSchema,
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
  relation_neighbors: {
    version: '1',
    effect: 'read',
    requiredScope: 'relations:read',
    definition: {
      description:
        'Read cross-domain relation neighbors for a given goal, task, or knowledge note with optional relation/target type filtering and cursor pagination. Only relations between nodes visible to the current owner are returned; edges to invisible or cross-owner nodes are omitted without leaking peer existence.',
      inputSchema: RelationNeighborsInputSchema,
      outputSchema: RelationNeighborsOutputSchema,
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
  ai_conversation_list: {
    version: '1',
    effect: 'read',
    requiredScope: 'ai:read',
    definition: {
      description:
        'List owned Assistant conversations as bounded metadata (title, status, message count, timestamps); never returns message bodies.',
      inputSchema: AiConversationListInputSchema,
      outputSchema: AiConversationListOutputSchema,
      annotations: readAnnotations,
    },
  },
  ai_conversation_get: {
    version: '1',
    effect: 'read',
    requiredScope: 'ai:read',
    definition: {
      description:
        'Open one owned Assistant conversation and return its first bounded transcript page; missing and foreign ids both answer NOT_FOUND.',
      inputSchema: AiConversationGetInputSchema,
      outputSchema: AiConversationTranscriptOutputSchema,
      annotations: readAnnotations,
    },
  },
  ai_conversation_transcript: {
    version: '1',
    effect: 'read',
    requiredScope: 'ai:read',
    definition: {
      description:
        'Read one page of an owned Assistant transcript (at most 25 messages); each body is capped at 2000 characters and flags truncation, attachments carry metadata only.',
      inputSchema: AiConversationTranscriptInputSchema,
      outputSchema: AiConversationTranscriptOutputSchema,
      annotations: readAnnotations,
    },
  },
  ai_agent_list: {
    version: '1',
    effect: 'read',
    requiredScope: 'ai:read',
    definition: {
      description:
        'List owned AI Agent archive entries (instanceId, driver, name, enabled, timestamps); host-local configuration is never projected.',
      inputSchema: AiAgentListInputSchema,
      outputSchema: AiAgentListOutputSchema,
      annotations: readAnnotations,
    },
  },
  ai_agent_get: {
    version: '1',
    effect: 'read',
    requiredScope: 'ai:read',
    definition: {
      description:
        'Read one owned AI Agent archive entry; missing and foreign ids both answer NOT_FOUND.',
      inputSchema: AiAgentGetInputSchema,
      outputSchema: AiAgentGetOutputSchema,
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
  label_list: {
    version: '1',
    effect: 'read',
    requiredScope: 'labels:read',
    definition: {
      description: 'List owned labels with optional search query and bounded limit.',
      inputSchema: LabelListInputSchema,
      outputSchema: LabelListOutputSchema,
      annotations: readAnnotations,
    },
  },
  label_resolve_names: {
    version: '1',
    effect: 'read',
    requiredScope: 'labels:read',
    definition: {
      description: 'Resolve human-readable label names into owned canonical Label objects.',
      inputSchema: LabelResolveNamesInputSchema,
      outputSchema: LabelResolveNamesOutputSchema,
      annotations: readAnnotations,
    },
  },
} as const;
export type GatewayReadToolName = keyof typeof readToolDescriptors;
