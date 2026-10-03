import type { NotificationNavigationIntentDTO } from '@memoflow/contracts/notification';

const CATEGORY_ROUTE: Readonly<Record<string, string>> = {
  goal: '/goals',
  schedule: '/schedule',
  task: '/tasks',
};

export interface NotificationDestinationInput {
  navigationIntent?: unknown;
  notificationCategory?: unknown;
  category?: unknown;
}

export interface NotificationDestination {
  path: string;
  query?: Record<string, string>;
}

function isNavigationIntent(value: unknown): value is NotificationNavigationIntentDTO {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as NotificationNavigationIntentDTO).route === 'string' &&
    (value as NotificationNavigationIntentDTO).route.trim().length > 0
  );
}

function normalizeCategory(category: unknown): string {
  return typeof category === 'string' ? category.trim().toLowerCase() : '';
}

/**
 * Canonical Notification destination policy shared by Inbox, Web browser
 * notifications, and Desktop native-notification clicks.
 *
 * Durable typed navigation intent wins. Category fallback is intentionally
 * coarse and only used when the fact has no explicit owner destination.
 */
export function resolveNotificationDestination(
  input: NotificationDestinationInput,
): NotificationDestination {
  if (isNavigationIntent(input.navigationIntent)) {
    return {
      path: input.navigationIntent.route,
      ...(input.navigationIntent.params ? { query: input.navigationIntent.params } : {}),
    };
  }

  const category = normalizeCategory(input.notificationCategory ?? input.category);
  return { path: CATEGORY_ROUTE[category] ?? '/notifications' };
}

export function hasNotificationExternalDestination(input: NotificationDestinationInput): boolean {
  return resolveNotificationDestination(input).path !== '/notifications';
}
