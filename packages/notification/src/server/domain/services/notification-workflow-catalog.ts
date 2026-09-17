import {
  ImportanceLevel,
  UrgencyLevel,
} from '@memoflow/contracts/shared';
import {
  NotificationCategory,
  NotificationChannelType,
  NotificationDndBehavior,
  NotificationPreferenceControl,
  NotificationTone,
  NotificationType,
  type NotificationWorkflowChannelCapabilityDTO,
  type NotificationWorkflowDefinitionDTO,
} from '@memoflow/contracts/notification';

const USER_CONFIGURABLE_DEFER: NotificationWorkflowChannelCapabilityDTO = {
  supported: true,
  enabledByDefault: true,
  preferenceControl: NotificationPreferenceControl.UserConfigurable,
  dndBehavior: NotificationDndBehavior.Defer,
};

const USER_CONFIGURABLE_SUPPRESS: NotificationWorkflowChannelCapabilityDTO = {
  ...USER_CONFIGURABLE_DEFER,
  dndBehavior: NotificationDndBehavior.Suppress,
};

const UNSUPPORTED: NotificationWorkflowChannelCapabilityDTO = {
  supported: false,
  enabledByDefault: false,
  preferenceControl: NotificationPreferenceControl.ReadOnly,
  dndBehavior: NotificationDndBehavior.Suppress,
};

function commonExternalChannels(): NotificationWorkflowDefinitionDTO['channels'] {
  return {
    [NotificationChannelType.InApp]: { ...USER_CONFIGURABLE_DEFER },
    [NotificationChannelType.Desktop]: { ...USER_CONFIGURABLE_SUPPRESS },
    [NotificationChannelType.Email]: { ...USER_CONFIGURABLE_DEFER },
    [NotificationChannelType.Push]: { ...USER_CONFIGURABLE_DEFER },
    [NotificationChannelType.Sms]: { ...UNSUPPORTED },
    [NotificationChannelType.Webhook]: { ...UNSUPPORTED },
  };
}

function definition(input: {
  workflowKey: string;
  topicKey?: string;
  groupKey: string;
  tone: NotificationWorkflowDefinitionDTO['presentationDefaults']['tone'];
  type: NotificationWorkflowDefinitionDTO['legacyProjection']['type'];
  category: NotificationWorkflowDefinitionDTO['legacyProjection']['category'];
  importance?: NotificationWorkflowDefinitionDTO['presentationDefaults']['importance'];
  urgency?: NotificationWorkflowDefinitionDTO['presentationDefaults']['urgency'];
  channels?: NotificationWorkflowDefinitionDTO['channels'];
}): NotificationWorkflowDefinitionDTO {
  return {
    workflowKey: input.workflowKey,
    topicKey: input.topicKey ?? input.workflowKey,
    groupKey: input.groupKey,
    presentationDefaults: {
      tone: input.tone,
      importance: input.importance ?? ImportanceLevel.Moderate,
      urgency: input.urgency ?? UrgencyLevel.Medium,
    },
    legacyProjection: {
      type: input.type,
      category: input.category,
    },
    channels: input.channels ?? commonExternalChannels(),
  };
}

/**
 * Canonical built-in workflow registry. Product producers own stable keys;
 * Notification owns validation/capability/presentation defaults.
 */
export const BUILTIN_NOTIFICATION_WORKFLOWS: readonly NotificationWorkflowDefinitionDTO[] = [
  definition({
    workflowKey: 'system.general',
    groupKey: 'system',
    tone: NotificationTone.Info,
    type: NotificationType.Info,
    category: NotificationCategory.System,
  }),
  definition({
    workflowKey: 'system.news',
    groupKey: 'system',
    tone: NotificationTone.Info,
    type: NotificationType.Info,
    category: NotificationCategory.System,
  }),
  definition({
    workflowKey: 'task.reminder',
    topicKey: 'task.reminder',
    groupKey: 'task',
    tone: NotificationTone.Info,
    type: NotificationType.Reminder,
    category: NotificationCategory.Task,
  }),
  definition({
    workflowKey: 'goal.reminder',
    topicKey: 'goal.reminder',
    groupKey: 'goal',
    tone: NotificationTone.Info,
    type: NotificationType.Reminder,
    category: NotificationCategory.Goal,
  }),
  definition({
    workflowKey: 'reminder.trigger',
    topicKey: 'reminder.trigger',
    groupKey: 'reminder',
    tone: NotificationTone.Info,
    type: NotificationType.Reminder,
    category: NotificationCategory.Reminder,
  }),
  definition({
    workflowKey: 'routine.intervention',
    topicKey: 'routine.intervention',
    groupKey: 'routine',
    tone: NotificationTone.Info,
    type: NotificationType.Reminder,
    category: NotificationCategory.Reminder,
  }),
  definition({
    workflowKey: 'system.account-security',
    topicKey: 'account.security',
    groupKey: 'account',
    tone: NotificationTone.Warning,
    type: NotificationType.Warning,
    category: NotificationCategory.Account,
    importance: ImportanceLevel.Vital,
    urgency: UrgencyLevel.Critical,
    channels: {
      [NotificationChannelType.InApp]: {
        supported: true,
        enabledByDefault: true,
        preferenceControl: NotificationPreferenceControl.ReadOnly,
        dndBehavior: NotificationDndBehavior.Bypass,
      },
      [NotificationChannelType.Desktop]: {
        supported: true,
        enabledByDefault: true,
        preferenceControl: NotificationPreferenceControl.ReadOnly,
        dndBehavior: NotificationDndBehavior.Bypass,
      },
      [NotificationChannelType.Email]: { ...USER_CONFIGURABLE_DEFER },
    },
  }),
] as const;

/**
 * Unknown workflows may still materialize an Inbox Fact on controlled internal
 * paths, but fail-safe to InApp-only delivery. They never inherit Email/Push/
 * SMS/Webhook capability just because a producer forgot registration.
 */
function unknownWorkflow(
  workflowKey: string,
  topicKey?: string,
): NotificationWorkflowDefinitionDTO {
  return definition({
    workflowKey,
    topicKey: topicKey?.trim() || workflowKey,
    groupKey: 'other',
    tone: NotificationTone.Neutral,
    type: NotificationType.Info,
    category: NotificationCategory.Other,
    channels: {
      [NotificationChannelType.InApp]: { ...USER_CONFIGURABLE_DEFER },
    },
  });
}

export class NotificationWorkflowCatalog {
  private readonly definitions = new Map<string, NotificationWorkflowDefinitionDTO>();

  constructor(definitions: readonly NotificationWorkflowDefinitionDTO[] = []) {
    for (const item of BUILTIN_NOTIFICATION_WORKFLOWS) this.register(item);
    for (const item of definitions) this.register(item);
  }

  register(item: NotificationWorkflowDefinitionDTO): void {
    const workflowKey = item.workflowKey.trim();
    if (!workflowKey) throw new Error('workflowKey is required');
    if (!item.presentationDefaults) throw new Error('workflow presentationDefaults are required');
    if (!item.legacyProjection) throw new Error('workflow legacyProjection is required during DTO cutover');
    this.definitions.set(workflowKey, { ...item, workflowKey });
  }

  has(workflowKey: string): boolean {
    return this.definitions.has(workflowKey.trim());
  }

  resolve(workflowKey: string, topicKey?: string): NotificationWorkflowDefinitionDTO {
    const key = workflowKey.trim();
    if (!key) throw new Error('workflowKey is required');
    return this.definitions.get(key) ?? unknownWorkflow(key, topicKey);
  }

  list(): readonly NotificationWorkflowDefinitionDTO[] {
    return [...this.definitions.values()].sort((a, b) => a.workflowKey.localeCompare(b.workflowKey));
  }
}
