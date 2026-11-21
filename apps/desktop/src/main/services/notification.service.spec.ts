import { describe, expect, it, vi } from 'vitest';
import { NotificationService } from './notification.service';
import type { CustomNotificationManager } from './custom-notification.manager';

function createService() {
  const dispatch = vi.fn().mockResolvedValue(true);
  const custom = {
    dispatch,
    clearPresentation: vi.fn(),
    destroy: vi.fn(),
  } as unknown as CustomNotificationManager;
  return { service: new NotificationService(custom), dispatch };
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

describe('NotificationService custom presentation', () => {
  it('forwards actionable content unchanged to the custom window', async () => {
    const { service, dispatch } = createService();
    const options = { title: 'Due', body: 'Move', data: { actions: [{ actionKey: 'complete' }] } };
    await expect(service.showCanonicalDelivery(options)).resolves.toBe(true);
    expect(dispatch).toHaveBeenCalledWith(options);
  });

  it('waits for the renderer acknowledgement and preserves a failed presentation', async () => {
    const { service, dispatch } = createService();
    let complete!: (shown: boolean) => void;
    dispatch.mockReturnValue(
      new Promise<boolean>((resolve) => {
        complete = resolve;
      }),
    );
    let settled = false;
    const delivery = service.showCanonicalDelivery({ title: 'Due', body: '' }).then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    complete(false);
    await expect(delivery).resolves.toBe(false);
  });

  it('records device DND as suppressed without dispatching', async () => {
    const { service, dispatch } = createService();
    service.enableDND();
    await expect(service.showCanonicalDelivery({ title: 'Due', body: '' })).resolves.toEqual({
      status: 'suppressed',
      reason: 'device-dnd',
    });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
