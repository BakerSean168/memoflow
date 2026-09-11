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

/** 目标 ID */
export type GoalId = string & { readonly __brand: 'GoalId' };

/** 关键结果 ID */
export type KeyResultId = string & { readonly __brand: 'KeyResultId' };

/** 任务模板 ID */
export type TaskPlanId = string & { readonly __brand: 'TaskPlanId' };

/** 任务实例 ID */
export type TaskOccurrenceId = string & { readonly __brand: 'TaskOccurrenceId' };

/** 提醒模板 ID */
export type ReminderTemplateId = string & { readonly __brand: 'ReminderTemplateId' };

/** 提醒分组 ID */
export type ReminderGroupId = string & { readonly __brand: 'ReminderGroupId' };

/** Routine Profile ID */
export type RoutineProfileId = string & { readonly __brand: 'RoutineProfileId' };

/** 提醒实例 ID */
export type ReminderInstanceId = string & { readonly __brand: 'ReminderInstanceId' };

/** 提醒历史 ID */
export type ReminderHistoryId = string & { readonly __brand: 'ReminderHistoryId' };

/** 提醒响应 ID */
export type ReminderResponseId = string & { readonly __brand: 'ReminderResponseId' };

/** 用户提醒偏好 ID */
export type UserReminderPreferencesId = string & { readonly __brand: 'UserReminderPreferencesId' };

/** 日程 ID */
export type ScheduleId = string & { readonly __brand: 'ScheduleId' };

/** 日程任务 ID */
export type ScheduleTaskId = string & { readonly __brand: 'ScheduleTaskId' };

/** 日程执行 ID */
export type ScheduleExecutionId = string & { readonly __brand: 'ScheduleExecutionId' };

/** 日程统计 ID */
export type ScheduleStatisticId = string & { readonly __brand: 'ScheduleStatisticId' };

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

/** 设置 ID */
export type SettingId = string & { readonly __brand: 'SettingId' };

export type SettingEntryId = string & { readonly __brand: 'SettingEntryId' };

/** 设置历史 ID */
export type SettingHistoryId = string & { readonly __brand: 'SettingHistoryId' };

/** 设置分组 ID */
export type SettingGroupId = string & { readonly __brand: 'SettingGroupId' };

/** 通知 ID */
export type NotificationId = string & { readonly __brand: 'NotificationId' };

/** 通知渠道 ID */
export type NotificationChannelId = string & { readonly __brand: 'NotificationChannelId' };

/** 通知偏好 ID */
export type NotificationPreferenceId = string & { readonly __brand: 'NotificationPreferenceId' };

/** 通知模板 ID */
export type NotificationTemplateId = string & { readonly __brand: 'NotificationTemplateId' };

/** 通知历史 ID */
export type NotificationHistoryId = string & { readonly __brand: 'NotificationHistoryId' };

/** AI 对话 ID */
export type AiConversationId = string & { readonly __brand: 'AiConversationId' };

/** AI 消息 ID */
export type AiMessageId = string & { readonly __brand: 'AiMessageId' };

/** AI 生成任务 ID */
export type AiGenerationTaskId = string & { readonly __brand: 'AiGenerationTaskId' };

/** 同步配置 ID */
export type SyncProfileId = string & { readonly __brand: 'SyncProfileId' };

/** 同步会话 ID */
export type SyncSessionId = string & { readonly __brand: 'SyncSessionId' };

/** 同步冲突 ID */
export type SyncConflictId = string & { readonly __brand: 'SyncConflictId' };

/** 待同步变更 ID */
export type PendingChangeId = string & { readonly __brand: 'PendingChangeId' };

/** 数据快照 ID */
export type DataSnapshotId = string & { readonly __brand: 'DataSnapshotId' };

/** 应用配置 ID */
export type AppConfigId = string & { readonly __brand: 'AppConfigId' };

/** 目标记录 ID */
export type GoalRecordId = string & { readonly __brand: 'GoalRecordId' };

/** 目标评审 ID */
export type GoalReviewId = string & { readonly __brand: 'GoalReviewId' };

/** 关键结果权重快照 ID */
export type KeyResultWeightSnapshotId = string & { readonly __brand: 'KeyResultWeightSnapshotId' };

/** 仪表盘 ID */
export type DashboardId = string & { readonly __brand: 'DashboardId' };

/** 仪表盘小部件 ID */
export type WidgetId = string & { readonly __brand: 'WidgetId' };

/** AI Provider 配置 ID */
export type AiProviderConfigId = string & { readonly __brand: 'AiProviderConfigId' };

/** AI 使用配额 ID */
export type AiUsageQuotaId = string & { readonly __brand: 'AiUsageQuotaId' };

/** 治理规则 ID */
export type RuleId = string & { readonly __brand: 'RuleId' };

/** 规则修订记录 ID */
export type RuleRevisionId = string & { readonly __brand: 'RuleRevisionId' };

/** 代码片段 ID */
export type CodeSnippetId = string & { readonly __brand: 'CodeSnippetId' };

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

  // === Reminder ===
  ReminderTemplateId: 'IReminderTemplateId',
  ReminderGroupId: 'IReminderGroupId',
  RoutineProfileId: 'IRoutineProfileId',
  ReminderInstanceId: 'IReminderInstanceId',
  ReminderHistoryId: 'IReminderHistoryId',
  ReminderResponseId: 'IReminderResponseId',

  // === Schedule ===
  ScheduleId: 'IScheduleId',
  ScheduleTaskId: 'IScheduleTaskId',
  ScheduleExecutionId: 'IScheduleExecutionId',
  ScheduleStatisticId: 'IScheduleStatisticId',

  // === Knowledge / Repository ===
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
  NotificationChannelId: 'INotificationChannelId',
  NotificationPreferenceId: 'INotificationPreferenceId',
  NotificationTemplateId: 'INotificationTemplateId',
  NotificationHistoryId: 'NotificationHistoryId',

  // === AI ===
  AiConversationId: 'IAiConversationId',
  AiMessageId: 'IAiMessageId',
  AiGenerationTaskId: 'IAiGenerationTaskId',
  AiProviderConfigId: 'IAiProviderConfigId',
  AiUsageQuotaId: 'IAiUsageQuotaId',

  // === Governance ===
  RuleId: 'RuleId',
  RuleRevisionId: 'RuleRevisionId',
} as const;

export type IdPrefixKey = keyof typeof ID_PREFIXES;
export type IdPrefixValue = (typeof ID_PREFIXES)[IdPrefixKey];
