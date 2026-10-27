// ==========================================
// Strong-typed IDs
// 强类型 ID 定义
// ==========================================

// 使用 branded type pattern 创建名义类型
// 这样可以防止不同类型的 ID 被混用

/** 示例实体 ID */
export type ExampleId = string & { readonly __brand: 'ExampleId' };

/** 账户/身份 ID */
export type IdentityId = string & { readonly __brand: 'IdentityId' };

/** 同步配置 ID */
export type SyncProfileId = string & { readonly __brand: 'SyncProfileId' };

/** 同步会话 ID */
export type SyncSessionId = string & { readonly __brand: 'SyncSessionId' };

/** 同步冲突 ID */
export type SyncConflictId = string & { readonly __brand: 'SyncConflictId' };

/** 待同步变更 ID */
export type PendingChangeId = string & { readonly __brand: 'PendingChangeId' };

/** 应用配置 ID */
export type AppConfigId = string & { readonly __brand: 'AppConfigId' };

// ==========================================
// ID Prefix Constants
// 运行时前缀常量，与 createIdType() 调用保持同步
// ==========================================

/**
 * 所有 branded ID 的运行时前缀映射。
 * 用于 Zod schema 校验 `{Prefix}_{uuid}` 格式。
 *
 * 注意：值必须与各模块 `createIdType(prefix)` 调用中的 prefix 参数完全一致。
 */
export const ID_PREFIXES = {
  // === 共享 ===
  IdentityId: 'IdentityId',

  // === Goal ===
  GoalId: 'IGoalId',
  KeyResultId: 'IKeyResultId',
  GoalRecordId: 'IGoalRecordId',
  GoalReviewId: 'IGoalReviewId',
  KeyResultWeightSnapshotId: 'IKeyResultWeightSnapshotId',

  // === Task ===
  TaskPlanId: 'ITaskPlanId',
  TaskOccurrenceId: 'ITaskOccurrenceId',

  // === Routine ===
  RoutineProfileId: 'IRoutineProfileId',

  // === Schedule ===
  ScheduleId: 'IScheduleId',

  // === Knowledge / Repository ===
  KnowledgeDocumentId: 'kdoc',
  KnowledgeSpaceId: 'KnowledgeSpaceId',
  LocalVaultBindingId: 'LocalVaultBindingId',
  KnowledgeRemoteBindingId: 'KnowledgeRemoteBindingId',
  RepositoryId: 'IRepositoryId',
  ResourceId: 'IResourceId',
  FolderId: 'IFolderId',
  ResourceVersionId: 'IResourceVersionId',
  ResourceLinkId: 'IResourceLinkId',

  // === Setting ===
  SettingId: 'ISettingId',

  // === Notification ===
  NotificationId: 'INotificationId',
  NotificationPreferenceId: 'INotificationPreferenceId',
  NotificationInteractionId: 'NotificationInteractionId',

  // === AI ===
  AiConversationId: 'IAiConversationId',
  AiProviderConfigId: 'IAiProviderConfigId',
} as const;

export type IdPrefixKey = keyof typeof ID_PREFIXES;
export type IdPrefixValue = (typeof ID_PREFIXES)[IdPrefixKey];
