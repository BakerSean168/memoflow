import type {
  ExecuteNotificationActionReq,
  ExecuteNotificationActionRes,
  NotificationActionIntent,
  NotificationDispatchInAppEvent,
} from '@memoflow/contracts/notification';
import type { Result } from '@memoflow/contracts/result';
import { toast } from 'vue-sonner';
import { presentBrowserSystemNotification } from './browser-system-notification';

type OwnerCommandAction = Extract<NotificationActionIntent, { kind: 'owner-command' }>;

export interface WebLiveNotificationPresenterOptions {
  executeAction: (
    request: ExecuteNotificationActionReq,
  ) => Promise<Result<ExecuteNotificationActionRes>>;
  /**
   * Cache/query reconciliation remains host-owned because this presenter is not
   * a Vue composable and therefore does not own server-state runtime access.
   */
  onActionSettled?: (
    request: ExecuteNotificationActionReq,
    result: Result<ExecuteNotificationActionRes>,
  ) => void;
  translate: (key: string) => string;
}

export type WebLiveNotificationPresentation = 'system' | 'in-app' | 'none';

function isFocusedForeground(): boolean {
  return (
    typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()
  );
}

function isOwnerCommandAction(value: unknown): value is OwnerCommandAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as Record<string, unknown>;
  return (
    action.kind === 'owner-command' &&
    typeof action.actionKey === 'string' &&
    action.actionKey.length > 0 &&
    typeof action.labelKey === 'string' &&
    action.labelKey.length > 0
  );
}

function ownerCommandActions(event: NotificationDispatchInAppEvent): OwnerCommandAction[] {
  const raw = event.data?.actions;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isOwnerCommandAction);
}

function actionLabel(
  action: OwnerCommandAction,
  translate: WebLiveNotificationPresenterOptions['translate'],
): string {
  const translated = translate(action.labelKey);
  if (translated && translated !== action.labelKey) return translated;
  if (action.actionKey === 'complete') return translate('notification.action.complete');
  if (action.actionKey.startsWith('snooze')) return translate('notification.action.snooze10m');
  return action.actionKey;
}

async function executeLiveAction(
  event: NotificationDispatchInAppEvent,
  action: OwnerCommandAction,
  toastId: string | number,
  options: WebLiveNotificationPresenterOptions,
): Promise<void> {
  try {
    const request = {
      notificationId: String(event.id),
      actionKey: action.actionKey,
    };
    const result = await options.executeAction(request);
    options.onActionSettled?.(request, result);
    if (!result.ok || result.data.interaction.outcome !== 'accepted') {
      toast.error(options.translate('notification.toast.actionRejected'));
      return;
    }

    toast.dismiss(toastId);
    if (action.actionKey === 'complete') {
      toast.success(options.translate('notification.toast.routineCompleted'));
      return;
    }
    if (action.actionKey.startsWith('snooze')) {
      toast.success(options.translate('notification.toast.routineSnoozed'));
      return;
    }
    toast.success(options.translate('notification.toast.actionCompleted'));
  } catch {
    toast.error(options.translate('notification.error.actionFailed'));
  }
}

/**
 * Presents one already-canonical InApp Notification Fact on the current Web host.
 *
 * - hidden/minimized/unfocused -> optional browser/OS notification, if user enabled it;
 * - focused foreground -> transient in-app toast;
 * - owner-command actions are executed through Notification's typed action endpoint.
 *
 * This never creates another Notification Fact and never treats read state as business completion.
 */
export function presentWebLiveNotification(
  event: NotificationDispatchInAppEvent,
  options: WebLiveNotificationPresenterOptions,
): WebLiveNotificationPresentation {
  if (presentBrowserSystemNotification(event)) return 'system';
  if (!isFocusedForeground()) return 'none';

  const actions = ownerCommandActions(event);
  const complete = actions.find((action) => action.actionKey === 'complete');
  const snooze = actions.find((action) => action.actionKey.startsWith('snooze'));

  let toastId: string | number = '';
  toastId = toast(event.title, {
    id: event.operationId ?? String(event.id),
    description: event.body ?? undefined,
    duration: actions.length > 0 ? 30_000 : 8_000,
    closeButton: true,
    action: complete
      ? {
          label: actionLabel(complete, options.translate),
          onClick: () => {
            void executeLiveAction(event, complete, toastId, options);
          },
        }
      : undefined,
    cancel: snooze
      ? {
          label: actionLabel(snooze, options.translate),
          onClick: () => {
            void executeLiveAction(event, snooze, toastId, options);
          },
        }
      : undefined,
  });

  return 'in-app';
}
