import {
  AccountChannels,
  AIChannels,
  AIStreamChannels,
  ProfileAccessChannels,
  ProfileAvatarChannels,
  DesktopProfileImportChannels,
  CloudAuthChannels,
  ExternalAgentChannels,
  DataPortabilityChannels,
  DesktopFeatureChannels,
  DesktopUpdateChannels,
  DesktopStartupChannels,
  SyncStatusChannels,
  GoalChannels,
  GoalWorkspaceChannels,
  KeyboardChannels,
  LabelChannels,
  NotificationChannels,
  RelationChannels,
  RendererEventChannels,
  RoutineChannels,
  RoutineWindowChannels,
  RepositoryChannels,
  ScheduleChannels,
  SchedulerChannels,
  SettingChannels,
  SystemChannels,
  TaskChannels,
  TaskWorkspaceChannels,
  WindowChannels,
} from '@memoflow/desktop-contracts';

export const SUPPORTED_REPOSITORY_CHANNELS = [
  RepositoryChannels.LOCAL_VAULT_GET,
  RepositoryChannels.LOCAL_VAULT_SELECT,
  RepositoryChannels.LOCAL_VAULT_DETACH,
  RepositoryChannels.LOCAL_VAULT_SCAN,
  RepositoryChannels.LOCAL_VAULT_GIT_CHANGES,
  RepositoryChannels.LOCAL_VAULT_WRITES,
  RepositoryChannels.LOCAL_VAULT_NOTE_READ,
  RepositoryChannels.LOCAL_VAULT_SEARCH,
  RepositoryChannels.LOCAL_VAULT_OPEN_OBSIDIAN,
  RepositoryChannels.LOCAL_VAULT_NOTE_WRITE_CONFIRMED,
  RepositoryChannels.LOCAL_VAULT_NOTE_WRITE,
] as const;

/** Goal↔Knowledge relation transport; every handler is identity-scoped in Main. */
export const SUPPORTED_RELATION_CHANNELS = [
  RelationChannels.GOAL_KNOWLEDGE_LINK,
  RelationChannels.GOAL_KNOWLEDGE_UNLINK,
  RelationChannels.GOAL_KNOWLEDGE_LIST,
  RelationChannels.GOAL_KNOWLEDGE_REVERSE_LIST,
] as const;

export const SUPPORTED_LABEL_CHANNELS = [LabelChannels.LIST, LabelChannels.CREATE] as const;

/** Read-only Temporal Engine diagnostics registered by the Scheduler module. */
export const SUPPORTED_SCHEDULER_CHANNELS = [
  SchedulerChannels.INVOCATION_LIST,
  SchedulerChannels.INVOCATION_GET_BY_ID,
  SchedulerChannels.INVOCATION_GET_DUE,
] as const;

export const ALLOWED_CHANNELS = [
  ...Object.values(SystemChannels),
  ...Object.values(GoalChannels),
  ...Object.values(GoalWorkspaceChannels),
  ...Object.values(TaskChannels),
  ...Object.values(TaskWorkspaceChannels),
  ...Object.values(ScheduleChannels),
  ...SUPPORTED_SCHEDULER_CHANNELS,
  ...Object.values(RoutineChannels),
  ...Object.values(RoutineWindowChannels),
  ...Object.values(AccountChannels),
  ...Object.values(ProfileAccessChannels),
  ...Object.values(ProfileAvatarChannels),
  ...Object.values(DesktopProfileImportChannels),
  ...Object.values(CloudAuthChannels),
  ...Object.values(ExternalAgentChannels),
  ...Object.values(DesktopFeatureChannels),
  ...Object.values(DesktopUpdateChannels),
  ...Object.values(SyncStatusChannels),
  ...Object.values(DesktopStartupChannels),
  ...Object.values(KeyboardChannels),
  ...SUPPORTED_LABEL_CHANNELS,
  ...Object.values(RendererEventChannels),
  ...Object.values(NotificationChannels),
  ...SUPPORTED_RELATION_CHANNELS,
  ...SUPPORTED_REPOSITORY_CHANNELS,
  ...Object.values(SettingChannels),
  ...Object.values(WindowChannels),
  ...Object.values(AIChannels),
  ...Object.values(AIStreamChannels),
  ...Object.values(DataPortabilityChannels),
] as const;

export type AllowedIpcChannel = (typeof ALLOWED_CHANNELS)[number];
