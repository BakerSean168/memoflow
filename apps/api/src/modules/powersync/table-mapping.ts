/**
 * PowerSync table-to-Prisma mapping
 *
 * Maps PowerSync CRUD operation table names (SQL table names from sync rules)
 * to Prisma model delegates, and identifies which tables have an `identity_id`
 * column for automatic user-scoping on write operations.
 */

/**
 * Tables that have an `identity_id` column (mapped to `identityId` in Prisma).
 * Used to automatically inject the authenticated user's identity on write operations.
 *
 * NOTE: `accounts` is NOT included — its `id` IS the identity, not a foreign key.
 * Tables like `linked_contents`, `resource_references`, * `rules`, and `rule_revisions` do not have `identityId`.
 */
export const IDENTITY_ID_TABLES = new Set([
  'user_preference_records',
  'goals',
  'key_results',
  'goal_records',
  'goal_reviews',
  'key_result_weight_snapshots',
  'relations',
  'task_plans',
  'task_occurrences',
  'task_plan_history',
  'schedules',
  'scheduled_invocations',
  'invocation_attempts',
  'routine_definitions',
  'routine_profiles',
  'routine_profile_memberships',
  'routine_interactions',
  'routine_temporary_overrides',
  'routine_occurrences',
  'notifications',
  'notification_preferences',
  'notification_interactions',
  'ai_conversations',
  'ai_execution_records',
  'task_goal_outbox',
  'repositories',
  'repository_explorers',
  'repository_statistics',
  'folders',
  'resources',
  'repository_resources',
]);

const TABLE_TO_MODEL: Record<string, string> = {
  accounts: 'account',
  user_preference_records: 'userPreferenceRecord',
  goals: 'goal',
  key_results: 'keyResult',
  goal_records: 'goalRecord',
  goal_reviews: 'goalReview',
  key_result_weight_snapshots: 'keyResultWeightSnapshot',
  relations: 'relation',
  task_plans: 'taskPlan',
  task_occurrences: 'taskOccurrence',
  task_plan_history: 'taskPlanHistory',
  schedules: 'schedule',
  scheduled_invocations: 'scheduledInvocation',
  invocation_attempts: 'invocationAttempt',
  routine_definitions: 'routineDefinition',
  routine_profiles: 'routineProfile',
  routine_occurrences: 'routineOccurrence',
  routine_interactions: 'routineInteraction',
  notifications: 'notification',
  notification_preferences: 'notificationPreference',
  notification_interactions: 'notificationInteraction',
  ai_conversations: 'aiConversation',
  ai_execution_records: 'aiExecutionRecord',
  task_goal_outbox: 'taskGoalOutbox',
  repositories: 'repository',
  repository_explorers: 'repositoryExplorer',
  repository_statistics: 'repositoryStatistic',
  folders: 'folder',
  resources: 'resource',
  repository_resources: 'repositoryResource',
  linked_contents: 'linkedContent',
  resource_references: 'resourceReference',
  rules: 'rule',
  rule_revisions: 'ruleRevision',
};

export interface CrudDelegate {
  upsert(args: {
    where: { id: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<unknown>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  deleteMany(args: { where: { id: string } }): Promise<unknown>;
}

export interface CrudDelegateContainer {
  [modelName: string]: unknown;
}

function isCrudDelegate(value: unknown): value is CrudDelegate {
  return (
    typeof value === 'object' &&
    value !== null &&
    'upsert' in value &&
    'update' in value &&
    'deleteMany' in value
  );
}

/**
 * Maps a PowerSync SQL table name to the corresponding Prisma model delegate.
 * Returns null if the table name is unknown or the model doesn't exist on the client.
 */
export function getPrismaDelegate(
  db: CrudDelegateContainer,
  tableName: string,
): CrudDelegate | null {
  const modelName = TABLE_TO_MODEL[tableName];
  if (!modelName || !(modelName in db)) {
    return null;
  }

  const delegate = db[modelName];
  return isCrudDelegate(delegate) ? delegate : null;
}
