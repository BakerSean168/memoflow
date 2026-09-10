/**
 * Notification characterization tests.
 *
 * Locks the current NotificationService behavior (DND suppression, native vs
 * custom notification routing, and the reminder/schedule/goal/task helpers) so
 * the capability ownership migration cannot change it silently.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserWindow, Notification } from 'electron';
import { NotificationService, type NotificationOptions } from './notification.service';
import type { CustomNotificationManager } from './custom-notification.manager';
import { eventBus } from '@memoflow/utils/domain';

function createService(): { service: NotificationService; dispatch: ReturnType<typeof vi.fn> } {
  const dispatch = vi.fn();
  const custom = { dispatch } as unknown as CustomNotificationManager;
  const service = new NotificationService(custom);
  return { service, dispatch };
}

describe('NotificationService DND state', () => {
  it('starts with DND disabled and no schedule', () => {
    const { service } = createService();
    expect(service.isDNDEnabled()).toBe(false);
    expect(service.getDNDConfig()).toMatchObject({
      enabled: false,
      scheduleEnabled: false,
      startHour: 22,
      endHour: 7,
    });
  });

  it('enableDND, disableDND, and toggleDND flip the running DND state', () => {
    const { service } = createService();
    service.enableDND();
    expect(service.isDNDEnabled()).toBe(true);
    expect(service.toggleDND()).toBe(false);
    service.disableDND();
    expect(service.isDNDEnabled()).toBe(false);
  });

  it('setDNDSchedule stores the schedule and enables it', () => {
    const { service } = createService();
    service.setDNDSchedule(23, 6);
    expect(service.getDNDConfig()).toMatchObject({
      scheduleEnabled: true,
      startHour: 23,
      endHour: 6,
    });
    service.disableDNDSchedule();
    expect(service.getDNDConfig().scheduleEnabled).toBe(false);
  });
});

describe('NotificationService routing', () => {
  let window: BrowserWindow;

  beforeEach(() => {
    vi.clearAllMocks();
    Notification.clearInstances();
    window = new BrowserWindow({});
    window.show();
  });

  it('routes to the custom manager by default and does not create a native notification', () => {
    const { service, dispatch } = createService();
    service.setMainWindow(window);
    const result = service.showNotification({
      title: 'Hello',
      body: 'World',
      sound: true,
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Hello', body: 'World', sound: true }),
    );
    expect(result).toBeNull();
    expect(Notification.lastInstance()).toBeNull();
  });

  it('uses the native notification path when custom notifications are disabled', () => {
    const { service, dispatch } = createService();
    service.setMainWindow(window);
    service.setUseCustomNotification(false);
    const options: NotificationOptions = { title: 'Native', body: 'Body' };
    const result = service.showNotification(options);
    expect(dispatch).not.toHaveBeenCalled();
    expect(result).toBeInstanceOf(Notification);
    expect(Notification.lastInstance()).toBe(result);
    expect(Notification.lastInstance()?.show).toHaveBeenCalled();
  });

  it('canonical delivery bypasses legacy renderer DND because policy was already evaluated upstream', () => {
    const { service, dispatch } = createService();
    service.setMainWindow(window);
    service.enableDND();

    const rendered = service.showCanonicalDelivery({ title: 'Canonical', body: 'Delivered once' });

    expect(rendered).toBe(true);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(window.webContents.send).not.toHaveBeenCalledWith(
      'notification:suppressed',
      expect.anything(),
    );
  });

  it('suppresses native notifications when Do Not Disturb is manually enabled', () => {
    const { service } = createService();
    service.setMainWindow(window);
    service.setUseCustomNotification(false);
    service.enableDND();
    const result = service.showNotification({ title: 'Suppressed', body: 'x' });
    expect(result).toBeNull();
    expect(Notification.lastInstance()).toBeNull();
    expect(window.webContents.send).toHaveBeenCalledWith(
      'notification:suppressed',
      expect.objectContaining({ title: 'Suppressed', body: 'x' }),
    );
  });

  it('does not render again when the canonical desktop-dispatch event is published', async () => {
    const { dispatch } = createService();

    await eventBus.dispatch('notification:dispatch_desktop', {
      id: 'NotificationId_once',
      identityId: 'IdentityId_once',
      title: 'Already rendered by durable transport',
      body: 'Do not render twice',
      category: 'System',
      type: 'Info',
      importance: 'Normal',
      data: {},
      sound: { enabled: true, name: null },
    } as never);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns null when native notifications are unsupported', () => {
    const { service } = createService();
    service.setMainWindow(window);
    service.setUseCustomNotification(false);
    vi.mocked(Notification.isSupported).mockReturnValueOnce(false);
    const result = service.showNotification({ title: 'nope', body: 'x' });
    expect(result).toBeNull();
  });
});

describe('NotificationService helper notifications', () => {
  let window: BrowserWindow;

  beforeEach(() => {
    vi.clearAllMocks();
    Notification.clearInstances();
    window = new BrowserWindow({});
    window.show();
  });

  it('showReminderNotification prefixes a bell and uses critical urgency for vital reminders', () => {
    const { service, dispatch } = createService();
    service.showReminderNotification({
      id: 'r1',
      title: 'Stand up',
      body: 'Now',
      importance: 'vital',
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '🔔 Stand up',
        body: 'Now',
        urgency: 'critical',
        data: { type: 'reminder', id: 'r1' },
      }),
    );
  });

  it('showScheduleNotification sets schedule type and default body', () => {
    const { service, dispatch } = createService();
    service.showScheduleNotification({ id: 's1', name: 'Review' });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '📅 Review',
        body: '调度任务已触发',
        data: { type: 'schedule', id: 's1' },
      }),
    );
  });

  it('showGoalProgressNotification computes the percentage rounded', () => {
    const { service, dispatch } = createService();
    service.showGoalProgressNotification({
      id: 'g1',
      title: 'Ship',
      progress: 25,
      targetValue: 100,
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '🎯 目标进度更新',
        body: 'Ship: 25% (25/100)',
        data: { type: 'goal', id: 'g1' },
      }),
    );
  });

  it('showTaskCompletedNotification sets task type', () => {
    const { service, dispatch } = createService();
    service.showTaskCompletedNotification({ id: 't1', title: 'Done' });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '✅ 任务已完成',
        body: 'Done',
        data: { type: 'task', id: 't1' },
      }),
    );
  });
});