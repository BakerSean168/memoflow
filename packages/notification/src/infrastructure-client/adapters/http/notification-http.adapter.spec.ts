import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import { NotificationHttpAdapter } from './notification-http.adapter';

describe('NotificationHttpAdapter typed actions', () => {
  it('posts typed notification actions to the canonical actions endpoint', async () => {
    const httpClient = {
      post: vi.fn().mockResolvedValue(
        ok({
          interaction: { outcome: 'accepted' },
          action: { actionKey: 'complete' },
        }),
      ),
    } as any;
    const adapter = new NotificationHttpAdapter(httpClient);

    await adapter.executeAction({
      notificationId: 'notification-1',
      actionKey: 'complete',
    });

    expect(httpClient.post).toHaveBeenCalledWith('/notifications/actions', {
      notificationId: 'notification-1',
      actionKey: 'complete',
    });
  });
});
