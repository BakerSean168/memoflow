import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { NotificationDispatchInAppEvent } from '@memoflow/contracts/notification';

const mocks = vi.hoisted(() => {
  const toastFn = vi.fn(() => 'toast-1');
  Object.assign(toastFn, {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  });
  return {
    toast: toastFn,
    presentSystem: vi.fn(() => false),
  };
});

vi.mock('vue-sonner', () => ({
  toast: mocks.toast,
}));

vi.mock('./browser-system-notification', () => ({
  presentBrowserSystemNotification: mocks.presentSystem,
}));

import { presentWebLiveNotification } from './web-live-notification';

function event(): NotificationDispatchInAppEvent {
  return {
    id: 'notification-1' as NotificationDispatchInAppEvent['id'],
    operationId: 'operation-1',
    identityId: 'identity-1' as NotificationDispatchInAppEvent['identityId'],
    title: 'Stand & Move',
    body: 'Take a short movement break.',
    category: 'Reminder',
    type: 'Reminder',
    data: {
      actions: [
        {
          kind: 'owner-command',
          actionKey: 'complete',
          labelKey: 'routine.action.complete',
          owner: { type: 'routine-occurrence', id: 'occurrence-1' },
          commandKey: 'routine.complete',
          input: { routineId: 'routine-1', occurrenceKey: 'occurrence-1' },
        },
        {
          kind: 'owner-command',
          actionKey: 'snooze-10m',
          labelKey: 'routine.action.snooze10m',
          owner: { type: 'routine-occurrence', id: 'occurrence-1' },
          commandKey: 'routine.snooze',
          input: {
            routineId: 'routine-1',
            occurrenceKey: 'occurrence-1',
            durationMs: 600_000,
          },
        },
      ],
    },
  } as NotificationDispatchInAppEvent;
}

describe('presentWebLiveNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.presentSystem.mockReturnValue(false);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  it('prefers the browser/OS surface when it presents the event', () => {
    mocks.presentSystem.mockReturnValue(true);
    const executeAction = vi.fn();
    const result = presentWebLiveNotification(event(), {
      executeAction,
      translate: (key) => key,
    });

    expect(result).toBe('system');
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(executeAction).not.toHaveBeenCalled();
  });

  it('shows a focused Web toast with typed Complete and Snooze actions', async () => {
    const onActionSettled = vi.fn();
    const executeAction = vi.fn().mockResolvedValue(
      ok({
        interaction: {
          id: 'interaction-1',
          idempotencyKey: 'notification:notification-1:action:complete',
          identityId: 'identity-1',
          notificationId: 'notification-1',
          actionKey: 'complete',
          actionKind: 'owner-command',
          occurredAt: 1,
          commandReceiptId: 'receipt-1',
          outcome: 'accepted',
        },
        action: {
          kind: 'owner-command',
          actionKey: 'complete',
          labelKey: 'routine.action.complete',
          owner: { type: 'routine-occurrence', id: 'occurrence-1' },
          commandKey: 'routine.complete',
        },
      }),
    );

    const result = presentWebLiveNotification(event(), {
      executeAction,
      onActionSettled,
      translate: (key) =>
        (
          ({
            'routine.action.complete': 'Complete',
            'routine.action.snooze10m': 'Remind in 10 min',
            'notification.toast.routineCompleted': 'Completed',
          }) as Record<string, string>
        )[key] ?? key,
    });

    expect(result).toBe('in-app');
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    const options = mocks.toast.mock.calls[0][1] as {
      action?: { label: string; onClick(): void };
      cancel?: { label: string; onClick(): void };
      duration?: number;
    };
    expect(options.action?.label).toBe('Complete');
    expect(options.cancel?.label).toBe('Remind in 10 min');
    expect(options.duration).toBe(30_000);

    options.action?.onClick();
    await vi.waitFor(() => {
      expect(executeAction).toHaveBeenCalledWith({
        notificationId: 'notification-1',
        actionKey: 'complete',
      });
    });
    expect(onActionSettled).toHaveBeenCalledWith(
      {
        notificationId: 'notification-1',
        actionKey: 'complete',
      },
      expect.objectContaining({ ok: true }),
    );
    expect(mocks.toast.dismiss).toHaveBeenCalledWith('toast-1');
    expect(mocks.toast.success).toHaveBeenCalledWith('Completed');
  });

  it('does not create an invisible toast when the page is not focused and OS presentation is unavailable', () => {
    vi.mocked(document.hasFocus).mockReturnValue(false);

    const result = presentWebLiveNotification(event(), {
      executeAction: vi.fn(),
      translate: (key) => key,
    });

    expect(result).toBe('none');
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
