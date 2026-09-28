import type { NotificationDispatchInAppEvent } from '@memoflow/contracts/notification';

const BROWSER_NOTIFICATION_PREFERENCE_KEY = 'memoflow:notification:browser-system-presentation';

export type BrowserSystemNotificationPermission = 'unsupported' | NotificationPermission;

function browserNotificationConstructor(): typeof Notification | null {
  if (
    typeof window === 'undefined' ||
    window.isSecureContext !== true ||
    typeof Notification === 'undefined'
  ) {
    return null;
  }
  return Notification;
}

export function browserSystemNotificationPermission(): BrowserSystemNotificationPermission {
  const ctor = browserNotificationConstructor();
  return ctor ? ctor.permission : 'unsupported';
}

export function isBrowserSystemNotificationSupported(): boolean {
  return browserNotificationConstructor() != null;
}

export function isBrowserSystemNotificationEnabled(): boolean {
  if (!isBrowserSystemNotificationSupported()) return false;
  try {
    return window.localStorage.getItem(BROWSER_NOTIFICATION_PREFERENCE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setBrowserSystemNotificationEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BROWSER_NOTIFICATION_PREFERENCE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Device-local presentation preference is best effort. Canonical
    // Notification Fact/Inbox state remains server-owned.
  }
}

export async function requestBrowserSystemNotificationPermission(): Promise<BrowserSystemNotificationPermission> {
  const ctor = browserNotificationConstructor();
  if (!ctor) return 'unsupported';
  if (ctor.permission === 'granted') {
    setBrowserSystemNotificationEnabled(true);
    return 'granted';
  }
  if (ctor.permission === 'denied') {
    setBrowserSystemNotificationEnabled(false);
    return 'denied';
  }

  const permission = await ctor.requestPermission();
  setBrowserSystemNotificationEnabled(permission === 'granted');
  return permission;
}

/**
 * Browser system notification is a device presentation of an already-created
 * InApp Notification Fact. It is intentionally not another server channel.
 *
 * A focused foreground page keeps the quieter Inbox/Bell experience. When the
 * tab is hidden/minimized or the browser is not focused, the OS popup is useful.
 */
export function presentBrowserSystemNotification(event: NotificationDispatchInAppEvent): boolean {
  const ctor = browserNotificationConstructor();
  if (
    !ctor ||
    ctor.permission !== 'granted' ||
    !isBrowserSystemNotificationEnabled() ||
    typeof document === 'undefined' ||
    (document.visibilityState === 'visible' && document.hasFocus())
  ) {
    return false;
  }

  const notification = new ctor(event.title, {
    body: event.body ?? '',
    tag: event.operationId ?? String(event.id),
  });
  notification.onclick = () => {
    window.focus();
    notification.close();
    if (window.location.pathname !== '/notifications') {
      window.location.assign(new URL('/notifications', window.location.origin).toString());
    }
  };
  return true;
}
