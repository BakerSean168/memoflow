/** Data Portability dependency interfaces for the surviving V2 owners. */

export interface GoalRepoPort {
  findByIdentityId(identityId: string, options?: { includeChildren?: boolean }): Promise<unknown[]>;
}
export interface GoalRecordRepoPort {
  findByGoalId(identityId: string, goalId: string): Promise<unknown[]>;
}
export interface TaskPlanRepoPort {
  findByIdentityId(identityId: string): Promise<unknown[]>;
}
export interface TaskOccurrenceRepoPort {
  findByIdentityId(identityId: string): Promise<unknown[]>;
}
export interface RepositoryRepoPort {
  findByIdentityId(identityId: string): Promise<unknown[]>;
}
export interface ResourceFolderRepoPort {
  findByRepositoryId(repositoryId: string): Promise<unknown[]>;
}
export interface ResourceRepoPort {
  findByIdentityId(identityId: string): Promise<unknown[]>;
}
export interface ScheduleRepoPort {
  findByIdentityId(identityId: string): Promise<unknown[]>;
}
export interface AIConversationRepoPort {
  findByIdentityId(identityId: string): Promise<unknown[]>;
}
export interface NotificationPreferenceRepoPort {
  findByIdentityId(identityId: string): Promise<unknown | null>;
}
export interface UserPreferenceDocumentPort {
  readonly namespace: 'presentation' | 'regional';
  readonly payload: unknown;
}
export interface UserPreferenceRepoPort {
  list(identityId: string): Promise<readonly UserPreferenceDocumentPort[]>;
}

export interface DataPortabilityDependencies {
  goalRepository: GoalRepoPort;
  goalRecordRepository: GoalRecordRepoPort;
  taskPlanRepository: TaskPlanRepoPort;
  taskOccurrenceRepository: TaskOccurrenceRepoPort;
  repositoryRepository: RepositoryRepoPort;
  folderRepository: ResourceFolderRepoPort;
  resourceRepository: ResourceRepoPort;
  scheduleRepository: ScheduleRepoPort;
  aiConversationRepository: AIConversationRepoPort;
  notificationPreferenceRepository: NotificationPreferenceRepoPort;
  userPreferenceRepository: UserPreferenceRepoPort;
}
