import type { IAINotificationReadPort } from '@memoflow/ai';
import { createNotificationReadAdapter } from '@memoflow/ai/adapters';
import type { NotificationInboxPort } from '@memoflow/notification';

/**
 * Desktop-host binding for the canonical `@memoflow/ai/adapters` Notification
 * factory. Owner delivery workers and channel state stay host-private.
 */
export class DesktopNotificationAIReadAdapter implements IAINotificationReadPort {
  readonly #port: IAINotificationReadPort;

  constructor(inbox: NotificationInboxPort) {
    this.#port = createNotificationReadAdapter(inbox);
  }

  getUnreadSummary(input: Parameters<IAINotificationReadPort['getUnreadSummary']>[0]) {
    return this.#port.getUnreadSummary(input);
  }

  executeAction(input: Parameters<IAINotificationReadPort['executeAction']>[0]) {
    return this.#port.executeAction(input);
  }
}
