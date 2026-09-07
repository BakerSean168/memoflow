/**
 * Data Portability — Import Store Port
 *
 * Abstracts the persistence layer for data import, decoupling importers
 * from Prisma/PowerSync specifics. Input types use application-layer
 * camelCase field names; implementations map to their native format.
 */

// ============ Input Types ============

export interface CreatedImportInput {
  createdAt?: string;
}

export interface TimestampedImportInput extends CreatedImportInput {
  updatedAt?: string;
}

// --- Settings (singletons) ---

export interface UpsertUserSettingInput {
  id?: string;
  identityId: string;
  preferences: Record<string, unknown>;
}

export interface UpsertNotificationPreferenceInput {
  id: string;
  identityId: string;
  globalChannels: string;
  workflowOverrides: string;
  doNotDisturb: string | null;
  rateLimit: string | null;
}

export interface UpsertUserReminderPreferenceInput {
  id: string;
  identityId: string;
  bestTimeSlots: string;
  worstTimeSlots: string;
  globalReminderEnabled: boolean;
  globalSmartFrequency: boolean;
}

// --- Repository ---

export interface CreateRepositoryInput extends TimestampedImportInput {
  id: string;
  identityId: string;
  name: string;
  type: string;
  path: string;
  description: string | null;
  config: unknown;
  status: string;
}

export interface CreateResourceFolderInput extends TimestampedImportInput {
  id: string;
  identityId: string;
  repositoryId: string;
  parentId: string | null;
  name: string;
  path: string;
  order: number;
  isExpanded: boolean;
  metadata: unknown;
}

export interface CreateResourceInput extends TimestampedImportInput {
  id: string;
  identityId: string;
  repositoryId: string;
  folderId: string | null;
  name: string;
  type: string;
  path: string;
  size: number;
  content: string | null;
  metadata: unknown;
  status: string;
}

// --- Goal ---

export interface CreateGoalInput extends TimestampedImportInput {
  id: string;
  identityId: string;
  name: string;
  description: string | null;
  feasibilityAnalysis: string | null;
  motivation: string | null;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  sortOrder: number;
  reminderConfig: string | null;
}

export interface CreateKeyResultInput extends TimestampedImportInput {
  id: string;
  identityId: string;
  goalId: string;
  title: string;
  description: string | null;
  aggregationMethod: string;
  startingValue: number;
  progressBaselineValue: number | null;
  targetValue: number;
  currentValue: number;
  unit: string | null;
  weight: number;
  order: number;
}

export interface CreateGoalReviewInput extends TimestampedImportInput {
  id: string;
  identityId: string;
  goalId: string;
  reflection: string;
  challenges: string | null;
  adjustments: string | null;
  systemContext: string;
  reviewedAt: string;
}

export interface CreateGoalRecordInput extends TimestampedImportInput {
  id: string;
  identityId: string;
  keyResultId: string;
  value: number;
  note: string | null;
  sourceType: string | null;
  sourceId: string | null;
  recordedAt: string;
}

// --- Task ---

export interface CreateTaskTemplateInput extends TimestampedImportInput {
  id: string;
  identityId: string;
  name: string;
  description: string | null;
  status: string;
  outcome: string;
  completionPolicy: string;
  closedAt: string | null;
  archivedAt: string | null;
  abandonedReason: string | null;
  importance: string;
  color: string | null;
  tags: string;
  timeConfigType: string | null;
  timeConfigStartTime: string | null;
  timeConfigEndTime: string | null;
  timeConfigDurationMinutes: number | null;
  timeConfigTimePoint: number | null;
  timeConfigTimeRangeStart: number | null;
  timeConfigTimeRangeEnd: number | null;
  recurrenceRuleType: string | null;
  recurrenceRuleInterval: number | null;
  recurrenceRuleDaysOfWeek: string | null;
  recurrenceRuleEndDate: string | null;
  recurrenceRuleCount: number | null;
  reminderConfigEnabled: boolean | null;
  reminderConfigTimeOffsetMinutes: number | null;
  reminderConfigUnit: string | null;
  reminderConfigChannel: string | null;
  lastGeneratedDate: string | null;
  generateAheadDays: number | null;
  goalId: string | null;
  keyResultId: string | null;
  goalRecordValue: number | null;
  goalProgressTrigger: string | null;
  checklist: string | null;
}

export interface CreateTaskInstanceInput extends TimestampedImportInput {
  id: string;
  templateId: string;
  identityId: string;
  instanceDate: string;
  occurrenceKey: string | null;
  status: string;
  importance: string;
  timeConfig: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
  comment: string | null;
}

// --- Schedule ---

export interface CreateScheduleInput extends TimestampedImportInput {
  id: string;
  identityId: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  priority: number | null;
  location: string | null;
  attendees: string | null;
}

export interface CreateScheduleTaskInput extends TimestampedImportInput {
  id: string;
  identityId: string;
  name: string;
  description: string | null;
  sourceModule: string;
  sourceEntityId: string;
  status: string;
  enabled: boolean;
  cronExpression: string | null;
  timezone: string;
  startDate: string | null;
  endDate: string | null;
  maxExecutions: number | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  executionCount: number;
  lastExecutionStatus: string | null;
  lastExecutionDuration: number | null;
  consecutiveFailures: number;
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatuses: string;
  priority: string;
  timeout: number | null;
  payload: string | null;
  tags: string;
}

// --- Reminder ---

export interface CreateReminderGroupInput extends TimestampedImportInput {
  id: string;
  identityId: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  enabled: boolean;
  status: string;
  order: number;
  stats: string;
}

export interface CreateReminderTemplateInput extends TimestampedImportInput {
  id: string;
  identityId: string;
  name: string;
  description: string | null;
  type: string;
  selfEnabled: boolean;
  status: string;
  reminderGroupId: string | null;
  importanceLevel: string;
  tags: string;
  color: string | null;
  icon: string | null;
  trigger: string;
  activeTime: string;
  activeHours: string | null;
  notificationConfig: string;
  stats: string;
  smartFrequencyEnabled: boolean;
}

export interface CreateReminderResponseInput extends CreatedImportInput {
  id: string;
  identityId: string;
  templateId: string;
  action: string;
  responseTime: number | null;
  timestamp: string;
}

// --- Editor ---

export interface CreateEditorWorkspaceInput extends TimestampedImportInput {
  id: string;
  identityId: string;
  name: string;
  description: string | null;
  projectPath: string;
  projectType: string;
  layout: unknown;
  setting: unknown;
  isActive: boolean;
}

export interface CreateEditorSessionInput extends TimestampedImportInput {
  id: string;
  workspaceId: string;
  identityId: string;
  name: string;
  layout: unknown;
  isActive: boolean;
}

export interface CreateEditorGroupInput extends TimestampedImportInput {
  id: string;
  sessionId: string;
  workspaceId: string;
  identityId: string;
  groupIndex: number;
  name: string | null;
  splitDirection: string;
}

export interface CreateEditorTabInput extends TimestampedImportInput {
  id: string;
  groupId: string;
  sessionId: string;
  workspaceId: string;
  identityId: string;
  tabIndex: number;
  tabType: string;
  title: string;
  viewState: unknown;
  isPinned: boolean;
  isActive: boolean;
  resourceId: string | null;
}

// --- AI ---

export interface CreateAIConversationInput extends TimestampedImportInput {
  id: string;
  identityId: string;
  name: string;
  status: string;
}

export interface CreateAIMessageInput extends CreatedImportInput {
  id: string;
  identityId: string;
  conversationId: string;
  role: string;
  content: string;
  tokenUsage: string | null;
}

// ============ Transaction Port ============

export interface DataPortabilityImportTx {
  // Singletons (upsert)
  upsertUserSetting(input: UpsertUserSettingInput): Promise<void>;
  upsertNotificationPreference(input: UpsertNotificationPreferenceInput): Promise<void>;
  upsertUserReminderPreference(input: UpsertUserReminderPreferenceInput): Promise<void>;

  // Repository
  createRepository(input: CreateRepositoryInput): Promise<void>;
  createResourceFolder(input: CreateResourceFolderInput): Promise<void>;
  createResource(input: CreateResourceInput): Promise<void>;

  // Goal
  createGoal(input: CreateGoalInput): Promise<void>;
  createKeyResult(input: CreateKeyResultInput): Promise<void>;
  createGoalReview(input: CreateGoalReviewInput): Promise<void>;
  createGoalRecord(input: CreateGoalRecordInput): Promise<void>;

  // Task
  createTaskTemplate(input: CreateTaskTemplateInput): Promise<void>;
  createTaskInstance(input: CreateTaskInstanceInput): Promise<void>;

  // Schedule
  createSchedule(input: CreateScheduleInput): Promise<void>;
  createScheduleTask(input: CreateScheduleTaskInput): Promise<void>;

  // Reminder
  createReminderGroup(input: CreateReminderGroupInput): Promise<void>;
  createReminderTemplate(input: CreateReminderTemplateInput): Promise<void>;
  createReminderResponse(input: CreateReminderResponseInput): Promise<void>;

  // Editor
  createEditorWorkspace(input: CreateEditorWorkspaceInput): Promise<void>;
  createEditorSession(input: CreateEditorSessionInput): Promise<void>;
  createEditorGroup(input: CreateEditorGroupInput): Promise<void>;
  createEditorTab(input: CreateEditorTabInput): Promise<void>;

  // AI
  createAIConversation(input: CreateAIConversationInput): Promise<void>;
  createAIMessage(input: CreateAIMessageInput): Promise<void>;
}

// ============ Store Port ============

export interface DataPortabilityImportStore {
  transaction<T>(fn: (tx: DataPortabilityImportTx) => Promise<T>): Promise<T>;
}
