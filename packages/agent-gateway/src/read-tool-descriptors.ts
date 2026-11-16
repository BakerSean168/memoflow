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
  TaskPlanGetInputSchema,
  TaskPlanGetOutputSchema,
  TaskPlanSearchInputSchema,
  TaskPlanSearchOutputSchema,
  TaskOccurrenceGetInputSchema,
  TaskOccurrenceGetOutputSchema,
  TaskOccurrenceListInputSchema,
  TaskOccurrenceListOutputSchema,
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
} as const;
export type GatewayReadToolName = keyof typeof readToolDescriptors;
