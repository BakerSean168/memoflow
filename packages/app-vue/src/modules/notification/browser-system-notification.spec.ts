import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationDispatchInAppEvent } from '@memoflow/contracts/notification';
import {
  browserSystemNotificationPermission,
  isBrowserSystemNotificationEnabled,
  isBrowserSystemNotificationSupported,
  presentBrowserSystemNotification,
  requestBrowserSystemNotificationPermission,
  setBrowserSystemNotificationEnabled,
} from './browser-system-notification';

class FakeNotification {
  static permission: NotificationPermission = 'default';
  static requestPermission = vi.fn(async () => FakeNotification.permission);
  static instances: FakeNotification[] = [];

  onclick: (() => void) | null = null;
  readonly title: string;
  readonly options?: NotificationOptions;
  close = vi.fn();

  constructor(title: string, options?: NotificationOptions) {
    this.title = title;
    this.options = options;
    FakeNotification.instances.push(this);
  }
}

function event(): NotificationDispatchInAppEvent {
  return {
    id: 'notification-1' as NotificationDispatchInAppEvent['id'],
    operationId: 'operation-1',
    identityId: 'identity-1' as NotificationDispatchInAppEvent['identityId'],
    title: 'Stand & Move',
    body: 'Time for a short break.',
    category: 'Reminder',
    type: 'Reminder',
  } as NotificationDispatchInAppEvent;
}

describe('browser system notification presentation', () => {
  beforeEach(() => {
    localStorage.clear();
    FakeNotification.permission = 'default';
    FakeNotification.requestPermission.mockClear();
    FakeNotification.instances = [];
    vi.stubGlobal('Notification', FakeNotification);
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  it('requests permission only from the explicit setting action and persists local presentation intent', async () => {
    FakeNotification.permission = 'granted';

    expect(browserSystemNotificationPermission()).toBe('granted');
    expect(isBrowserSystemNotificationEnabled()).toBe(false);

    await expect(requestBrowserSystemNotificationPermission()).resolves.toBe('granted');
    expect(isBrowserSystemNotificationEnabled()).toBe(true);

    setBrowserSystemNotificationEnabled(false);
    expect(isBrowserSystemNotificationEnabled()).toBe(false);
  });

  it('presents an already-created InApp fact as an OS notification only while the page is hidden', () => {
    FakeNotification.permission = 'granted';
    setBrowserSystemNotificationEnabled(true);

    expect(presentBrowserSystemNotification(event())).toBe(true);
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0]).toMatchObject({
      title: 'Stand & Move',
      options: {
        body: 'Time for a short break.',
        tag: 'operation-1',
      },
    });

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    expect(presentBrowserSystemNotification(event())).toBe(false);
    expect(FakeNotification.instances).toHaveLength(1);

    vi.mocked(document.hasFocus).mockReturnValue(false);
    expect(presentBrowserSystemNotification(event())).toBe(true);
    expect(FakeNotification.instances).toHaveLength(2);
  });

  it('does not present without granted browser permission or local opt-in', () => {
    FakeNotification.permission = 'default';
    setBrowserSystemNotificationEnabled(true);
    expect(presentBrowserSystemNotification(event())).toBe(false);

    FakeNotification.permission = 'granted';
    setBrowserSystemNotificationEnabled(false);
    expect(presentBrowserSystemNotification(event())).toBe(false);
  });

  it('treats insecure origins as unsupported even when Notification exists', () => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: false,
    });

    expect(browserSystemNotificationPermission()).toBe('unsupported');
    expect(isBrowserSystemNotificationSupported()).toBe(false);
    expect(presentBrowserSystemNotification(event())).toBe(false);
  });

  it('keeps denied permission disabled', async () => {
    FakeNotification.permission = 'denied';

    await expect(requestBrowserSystemNotificationPermission()).resolves.toBe('denied');
    expect(isBrowserSystemNotificationEnabled()).toBe(false);
  });
});
