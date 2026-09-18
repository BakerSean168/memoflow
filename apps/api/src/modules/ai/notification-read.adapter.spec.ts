import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import { NotificationAIReadAdapter } from './notification-read.adapter';

describe('NotificationAIReadAdapter', () => {
  it('projects Notification Fact/Inbox data without retired compatibility fields', async () => {
    const inbox = {
      getUnreadCount: vi.fn(async () => ok({ count: 2 })),
      listNotifications: vi.fn(async () =>
        ok({
          notifications: [
            {
              id: 'notification-1',
              identityId: 'identity-1',
              workflowKey: 'task.due',
              topic: 'task',
              title: 'Task due',
              content: 'Write draft',
              importance: 'Moderate',
              urgency: 'Soon',
              relatedEntityType: 'task.occurrence',
              relatedEntityId: 'occ-1',
              navigationIntent: { route: '/tasks/occ-1' },
              actions: [{ kind: 'archive', actionKey: 'archive', labelKey: 'archive' }],
              readAt: null,
              archivedAt: null,
              createdAt: 1_000,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 5,
          hasMore: false,
        }),
      ),
      executeAction: vi.fn(async () =>
        ok({
          interaction: {
            id: 'interaction-1',
            notificationId: 'notification-1',
            actionKey: 'archive',
            actionKind: 'archive' as const,
            occurredAt: 1_001,
            outcome: 'accepted' as const,
            commandReceiptId: null,
          },
          action: { kind: 'archive' as const, actionKey: 'archive', labelKey: 'archive' },
        }),
      ),
    };
    const adapter = new NotificationAIReadAdapter(inbox as never);

    await expect(adapter.getUnreadSummary({ identityId: 'identity-1', limit: 5 })).resolves.toEqual(
      {
        unreadCount: 2,
        items: [
          expect.objectContaining({
            id: 'notification-1',
            workflowKey: 'task.due',
            topicKey: 'task',
            subjectRef: { type: 'task.occurrence', id: 'occ-1' },
            actions: [{ kind: 'archive', actionKey: 'archive', labelKey: 'archive' }],
            presentation: { importance: 'Moderate', urgency: 'Soon' },
          }),
        ],
      },
    );
    expect(inbox.listNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'identity-1', isRead: false, archiveState: 'active' }),
    );

    const item = (await adapter.getUnreadSummary({ identityId: 'identity-1' })).items[0];
    expect(item).not.toHaveProperty('category');
    expect(item).not.toHaveProperty('channel');
    expect(item).not.toHaveProperty('delivery');
  });

  it('routes typed actions through the Notification Inbox owner port', async () => {
    const inbox = {
      executeAction: vi.fn(async () =>
        ok({
          interaction: {
            id: 'interaction-1',
            notificationId: 'notification-1',
            actionKey: 'archive',
            actionKind: 'archive' as const,
            occurredAt: 1_001,
            outcome: 'accepted' as const,
            commandReceiptId: null,
          },
          action: { kind: 'archive' as const, actionKey: 'archive', labelKey: 'archive' },
        }),
      ),
    };
    const adapter = new NotificationAIReadAdapter(inbox as never);
    const receipt = await adapter.executeAction({
      notificationId: 'notification-1',
      actionKey: 'archive',
      context: {
        identityId: 'identity-1',
        requestId: 'request-1',
        traceId: 'request-1',
        startedAt: 1,
        source: 'http',
      },
    });

    expect(receipt).toEqual({
      id: 'interaction-1',
      notificationId: 'notification-1',
      actionKey: 'archive',
      actionKind: 'archive',
      outcome: 'accepted',
      commandReceiptId: null,
    });
    expect(inbox.executeAction).toHaveBeenCalledWith('notification-1', 'archive', 'identity-1');
  });
});
