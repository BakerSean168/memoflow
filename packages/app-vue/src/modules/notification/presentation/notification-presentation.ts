import type { ComposerTranslation } from 'vue-i18n';
import type { NotificationClientDTO } from '@memoflow/contracts/notification';
import type { SemanticTone } from '../../../shared/constants/semantic-tone';

export type NotificationCategoryToken =
  'account' | 'general' | 'goal' | 'reminder' | 'schedule' | 'system' | 'task';

export interface NotificationPresentation {
  categoryToken: NotificationCategoryToken;
  categoryLabel: string;
  workflowLabel: string;
  relatedEntityLabel: string | null;
  tone: SemanticTone;
}

type PresentationNotification = Pick<
  NotificationClientDTO,
  'category' | 'type' | 'workflowKey' | 'relatedEntityType'
>;

type NotificationWorkflowToken =
  | 'accountSecurity'
  | 'goalReminder'
  | 'goalUpdate'
  | 'reminder'
  | 'routineReminder'
  | 'system'
  | 'taskDeadline'
  | 'taskReminder'
  | 'taskUpdate';

type NotificationEntityToken = 'goal' | 'reminder' | 'routine' | 'schedule' | 'task';

function normalizeContractValue(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function resolveCategoryToken(category: unknown): NotificationCategoryToken {
  switch (normalizeContractValue(category)) {
    case 'account':
      return 'account';
    case 'goal':
      return 'goal';
    case 'reminder':
      return 'reminder';
    case 'schedule':
      return 'schedule';
    case 'system':
      return 'system';
    case 'task':
      return 'task';
    default:
      return 'general';
  }
}

function resolveWorkflowToken(workflowKey: unknown): NotificationWorkflowToken | null {
  const workflow = normalizeContractValue(workflowKey);
  if (!workflow) return null;

  if (workflow === 'system.account-security') return 'accountSecurity';
  if (workflow === 'task.reminder') return 'taskReminder';
  if (workflow === 'task.deadline') return 'taskDeadline';
  if (workflow === 'goal.reminder') return 'goalReminder';
  if (workflow === 'routine.reminder' || workflow.startsWith('routine:')) {
    return 'routineReminder';
  }
  if (workflow.startsWith('task.')) return 'taskUpdate';
  if (workflow.startsWith('goal.')) return 'goalUpdate';
  if (workflow.startsWith('system.')) return 'system';

  return null;
}

function resolveEntityToken(relatedEntityType: unknown): NotificationEntityToken | null {
  switch (normalizeContractValue(relatedEntityType)) {
    case 'goal':
      return 'goal';
    case 'reminder':
      return 'reminder';
    case 'routine':
      return 'routine';
    case 'schedule':
      return 'schedule';
    case 'task':
      return 'task';
    default:
      return null;
  }
}

export function resolveNotificationSemanticTone(
  category: NotificationCategoryToken,
  type: unknown,
): SemanticTone {
  switch (category) {
    case 'task':
      return 'success';
    case 'goal':
      return 'warning';
    case 'reminder':
      return 'primary';
    case 'schedule':
      return 'info';
    case 'account':
      return 'primary';
    case 'system':
      return 'info';
    default:
      break;
  }

  switch (normalizeContractValue(type)) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'error':
      return 'destructive';
    case 'info':
      return 'info';
    case 'reminder':
      return 'primary';
    default:
      return 'muted';
  }
}

export function presentNotification(
  notification: PresentationNotification,
  t: ComposerTranslation,
): NotificationPresentation {
  const categoryToken = resolveCategoryToken(notification.category);
  const categoryLabel = t(`notification.category.${categoryToken}`);
  const workflowToken = resolveWorkflowToken(notification.workflowKey);
  const entityToken = resolveEntityToken(notification.relatedEntityType);

  return {
    categoryToken,
    categoryLabel,
    workflowLabel: workflowToken ? t(`notification.workflow.${workflowToken}`) : categoryLabel,
    relatedEntityLabel: entityToken ? t(`notification.entity.${entityToken}`) : null,
    tone: resolveNotificationSemanticTone(categoryToken, notification.type),
  };
}
