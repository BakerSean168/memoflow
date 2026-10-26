import { describe, expect, it } from 'vitest';
import { Notification } from '../notification';
import { NotificationCategory, NotificationType } from '@memoflow/notification-contracts';

describe('NOTIF-2401 Notification Fact characterization', () => {
  it('does not expose a root delivery status on the user-visible Fact', () => {
    const fact = Notification.create({
      identityId: 'identity-wave2' as never,
      workflowKey: 'system.general',
      topic: 'system.general',
      idempotencyKey: 'characterization-fact',
      title: 'Fact survives delivery policy',
      content: 'Delivery outcome is a separate concern.',
      type: NotificationType.Info,
      category: NotificationCategory.System,
    });

    expect(fact.toServerDTO()).not.toHaveProperty('status');
  });
});
