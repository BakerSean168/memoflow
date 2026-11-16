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
  RelationNeighborsInputSchema,
  RelationNeighborsOutputSchema,
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
} as const;
export type GatewayReadToolName = keyof typeof readToolDescriptors;
