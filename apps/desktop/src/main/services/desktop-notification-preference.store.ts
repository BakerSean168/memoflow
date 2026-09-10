import type {
  DesktopNotificationPreference,
  DesktopNotificationPreferencePatch,
} from '@memoflow/contracts/electron';

export const DEFAULT_DESKTOP_NOTIFICATION_PREFERENCE: DesktopNotificationPreference = {
  presentationMode: 'custom',
  soundEnabled: true,
};

type Listener = (preference: DesktopNotificationPreference) => void;

/** In-memory device preference owner for SETTING-9204; persistence belongs to 9206. */
export class DesktopNotificationPreferenceStore {
  private preference: DesktopNotificationPreference = { ...DEFAULT_DESKTOP_NOTIFICATION_PREFERENCE };
  private readonly listeners = new Set<Listener>();

  get(): DesktopNotificationPreference {
    return { ...this.preference };
  }

  update(patch: DesktopNotificationPreferencePatch): DesktopNotificationPreference {
    this.preference = { ...this.preference, ...patch };
    this.notify();
    return this.get();
  }

  reset(): DesktopNotificationPreference {
    this.preference = { ...DEFAULT_DESKTOP_NOTIFICATION_PREFERENCE };
    this.notify();
    return this.get();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const preference = this.get();
    for (const listener of this.listeners) listener(preference);
  }
}
