import { describe, expect, it, vi } from 'vitest';
import { DesktopNotificationPreferenceStore } from './desktop-notification-preference.store';

describe('DesktopNotificationPreferenceStore', () => {
  it('owns the in-memory default and notifies subscribers on update/reset', () => {
    const store = new DesktopNotificationPreferenceStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    expect(store.get()).toEqual({ presentationMode: 'custom', soundEnabled: true });
    expect(store.update({ presentationMode: 'native' })).toEqual({
      presentationMode: 'native',
      soundEnabled: true,
    });
    expect(listener).toHaveBeenLastCalledWith({ presentationMode: 'native', soundEnabled: true });
    expect(store.reset()).toEqual({ presentationMode: 'custom', soundEnabled: true });
    unsubscribe();
    store.update({ soundEnabled: false });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
