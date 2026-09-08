/**
 * Data Portability — Dependency Interfaces
 *
 * Abstracts the repository ports needed by export/import use cases.
 * Uses the same interfaces as the existing module repositories.
 */

// ============ Goal ============

export interface GoalRepoPort {
  findByIdentityId(identityId: string, options?: { includeChildren?: boolean }): Promise<unknown[]>;
}
export interface GoalRecordRepoPort {
  findByGoalId(identityId: string, goalId: string): Promise<unknown[]>;
}

// ============ Task ============

export interface TaskTemplateRepoPort {
  findByIdentityId(identityId: string): Promise<unknown[]>;
}
export interface TaskInstanceRepoPort {
  findByIdentityId(identityId: string): Promise<unknown[]>;
}

// ============ Reminder ============

export interface ReminderTemplateRepoPort {
  findByIdentityId(identityId: string, options?: { includeHistory?: boolean }): Promise<unknown[]>;
}
export interface ReminderGroupRepoPort {
  findByIdentityId(identityId: string): Promise<unknown[]>;
}
export interface ReminderResponseRepoPort {
  findByTemplateId(templateId: string, identityId: string, limit?: number): Promise<unknown[]>;
}
export interface RoutineProfileMembershipRepoPort {
  findByIdentityId(identityId: string): Promise<unknown[]>;
}
export interface RoutineDefinitionRepoPort {
  findByIdentityId(identityId: string): Promise<unknown[]>;
}
export interface UserReminderPreferenceRepoPort {
  findByIdentityId(identityId: string): Promise<unknown | null>;
}

// ============ Repository ============

export interface RepositoryRepoPort {
  findByIdentityId(identityId: string): Promise<unknown[]>;
}
export interface ResourceFolderRepoPort {
  findByRepositoryId(repositoryId: string): Promise<unknown[]>;
}
export interface ResourceRepoPort {
  findByIdentityId(identityId: string): Promise<unknown[]>;
}

// ============ Schedule ============

export interface ScheduleRepoPort {
  findByIdentityId(identityId: string): Promise<unknown[]>;
}
export interface ScheduleTaskRepoPort {
  findByIdentityId(identityId: string): Promise<unknown[]>;
}

// ============ Editor ============

export interface EditorWorkspaceRepoPort {
  findByIdentityId(identityId: string): Promise<unknown[]>;
}
export interface EditorSessionRepoPort {
  findByWorkspaceId(workspaceId: string): Promise<unknown[]>;
}
export interface EditorGroupRepoPort {
  findBySessionId(sessionId: string): Promise<unknown[]>;
}
export interface EditorTabRepoPort {
  findByGroupId(groupId: string): Promise<unknown[]>;
}

// ============ AI ============

export interface AIConversationRepoPort {
  findByIdentityId(identityId: string, options?: { includeChildren?: boolean }): Promise<unknown[]>;
}

// ============ Notification ============

export interface NotificationPreferenceRepoPort {
  findByIdentityId(identityId: string): Promise<unknown | null>;
}

// ============ Setting ============

export interface SettingRepoPort {
  findByIdentityId(identityId: string): Promise<unknown | null>;
}

// ============ Aggregate Dependencies ============

export interface DataPortabilityDependencies {
  goalRepository: GoalRepoPort;
  goalRecordRepository: GoalRecordRepoPort;
  taskTemplateRepository: TaskTemplateRepoPort;
  taskInstanceRepository: TaskInstanceRepoPort;
  reminderTemplateRepository: ReminderTemplateRepoPort;
  reminderGroupRepository: ReminderGroupRepoPort;
  reminderResponseRepository: ReminderResponseRepoPort;
  routineProfileMembershipRepository: RoutineProfileMembershipRepoPort;
  routineDefinitionRepository: RoutineDefinitionRepoPort;
  userReminderPreferenceRepository: UserReminderPreferenceRepoPort;
  repositoryRepository: RepositoryRepoPort;
  folderRepository: ResourceFolderRepoPort;
  resourceRepository: ResourceRepoPort;
  scheduleRepository: ScheduleRepoPort;
  scheduleTaskRepository: ScheduleTaskRepoPort;
  editorWorkspaceRepository: EditorWorkspaceRepoPort;
  editorSessionRepository: EditorSessionRepoPort;
  editorGroupRepository: EditorGroupRepoPort;
  editorTabRepository: EditorTabRepoPort;
  aiConversationRepository: AIConversationRepoPort;
  notificationPreferenceRepository: NotificationPreferenceRepoPort;
  settingRepository: SettingRepoPort;
}
