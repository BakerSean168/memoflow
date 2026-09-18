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

export interface UpsertUserPreferencesInput {
  identityId: string;
  presentation: Record<string, unknown>;
  regional: Record<string, unknown>;
}

export interface UpsertNotificationPreferenceInput {
  id: string;
  identityId: string;
  globalChannels: string;
  workflowOverrides: string;
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
  summary: string | null;
  status: string;
  startDate: string | null;
  targetKind: string | null;
  targetEndDate: string | null;
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
  initialValue: number;
  trackingBaseValue: number;
  targetValue: number;
  currentValue: number;
  targetKind: string | null;
  targetEndDate: string | null;
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

export interface CreateTaskPlanInput extends TimestampedImportInput {
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
  schedule: Record<string, unknown>;
  reminderConfig: string | null;
  goalId: string | null;
  keyResultId: string | null;
  goalRecordValue: number | null;
  goalProgressTrigger: string | null;
  checklist: string | null;
}

export interface CreateTaskOccurrenceInput extends TimestampedImportInput {
  id: string;
  planId: string;
  identityId: string;
  occurrenceKey: string;
  scheduleDate: string;
  scheduleTiming: string;
  importanceSnapshot: string;
  status: string;
  actualStartAt: string | null;
  result: string | null;
  checklistState: string;
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


// --- AI ---

export interface CreateAIConversationInput extends TimestampedImportInput {
  id: string;
  identityId: string;
  name: string;
  status: string;
}


// ============ Transaction Port ============

export interface DataPortabilityImportTx {
  // Singletons (upsert)
  upsertUserPreferences(input: UpsertUserPreferencesInput): Promise<void>;
  upsertNotificationPreference(input: UpsertNotificationPreferenceInput): Promise<void>;

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
  createTaskPlan(input: CreateTaskPlanInput): Promise<void>;
  createTaskOccurrence(input: CreateTaskOccurrenceInput): Promise<void>;

  // Schedule
  createSchedule(input: CreateScheduleInput): Promise<void>;

  // AI
  createAIConversation(input: CreateAIConversationInput): Promise<void>;
}

// ============ Store Port ============

export interface DataPortabilityImportStore {
  transaction<T>(fn: (tx: DataPortabilityImportTx) => Promise<T>): Promise<T>;
}
