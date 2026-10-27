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

/** Routine Profile ID */

/** Stable managed knowledge document ID carried by Markdown frontmatter. */
export type KnowledgeDocumentId = string & { readonly __brand: 'KnowledgeDocumentId' };

/** Knowledge logical space ID */
export type KnowledgeSpaceId = string & { readonly __brand: 'KnowledgeSpaceId' };

/** Desktop Local Vault binding ID */
export type LocalVaultBindingId = string & { readonly __brand: 'LocalVaultBindingId' };

/** Cloud/remote knowledge source binding ID */
export type KnowledgeRemoteBindingId = string & { readonly __brand: 'KnowledgeRemoteBindingId' };

/** 仓库 ID */
export type RepositoryId = string & { readonly __brand: 'RepositoryId' };

/** 资源 ID */
export type ResourceId = string & { readonly __brand: 'ResourceId' };

/** 文件夹 ID */
export type FolderId = string & { readonly __brand: 'FolderId' };

/** 资源版本 ID */
export type ResourceVersionId = string & { readonly __brand: 'ResourceVersionId' };

/** 资源链接 ID */
export type ResourceLinkId = string & { readonly __brand: 'ResourceLinkId' };

/** 资源书签 ID */
export type BookmarkId = string & { readonly __brand: 'BookmarkId' };

/** AI 对话 ID */
export type AiConversationId = string & { readonly __brand: 'AiConversationId' };

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

/** AI Provider 配置 ID */
export type AiProviderConfigId = string & { readonly __brand: 'AiProviderConfigId' };

/** AI Provider connection ID (the persisted user-owned provider connection). */
export type AiProviderConnectionId = AiProviderConfigId;

/** Opaque reference into the host-owned provider SecretVault. */
export type AIProviderCredentialRef = string & { readonly __brand: 'AIProviderCredentialRef' };

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
