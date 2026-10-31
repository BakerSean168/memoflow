import type { AutoLaunchPort } from '../capabilities/ports';
import type { DesktopLifecyclePreference } from './desktop-lifecycle-preference';
import type {
  DesktopStartupPatch,
  DesktopStartupSnapshot,
  DesktopStartupUpdate,
} from '@memoflow/desktop-contracts';

/** Device-local shell settings. The OS owns auto-launch state; never persist a copy. */
export class DesktopStartupSettingsService {
  private state: DesktopStartupSnapshot;
  private readonly listeners = new Set<(snapshot: DesktopStartupSnapshot) => void>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly preference: DesktopLifecyclePreference,
    private readonly resolveAutoLaunch: () => AutoLaunchPort | null,
  ) {
    this.state = {
      autoLaunch: { available: false, enabled: false },
      closeToTray: preference.closeToTray,
      startHidden: preference.startHidden,
    };
  }

  get snapshot(): DesktopStartupSnapshot {
    return { ...this.state, autoLaunch: { ...this.state.autoLaunch } };
  }

  subscribe(listener: (snapshot: DesktopStartupSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const next = this.queue.then(action);
    this.queue = next.catch(() => undefined);
    return next;
  }

  refresh(): Promise<DesktopStartupSnapshot> {
    return this.serialize(() => this.read());
  }

  private async read(): Promise<DesktopStartupSnapshot> {
    const port = this.resolveAutoLaunch();
    let autoLaunch = {
      available: false,
      enabled: this.state.autoLaunch.enabled,
    };
    if (port) {
      try {
        autoLaunch = { available: true, enabled: await port.isEnabled() };
      } catch {
        /* Retain the last known value and disable the control when unreadable. */
      }
    }
    this.state = {
      autoLaunch,
      closeToTray: this.preference.closeToTray,
      startHidden: this.preference.startHidden,
    };
    for (const listener of this.listeners) listener(this.snapshot);
    return this.snapshot;
  }

  update(patch: DesktopStartupPatch): Promise<DesktopStartupUpdate> {
    return this.serialize(async () => {
      let success = true;
      try {
        if (patch.autoLaunch !== undefined) {
          const port = this.resolveAutoLaunch();
          success = port ? await (patch.autoLaunch ? port.enable() : port.disable()) : false;
        }
        for (const key of ['closeToTray', 'startHidden'] as const) {
          if (patch[key] !== undefined) this.preference.update(key, patch[key]);
        }
      } catch {
        success = false;
      }
      const snapshot = await this.read();
      if (
        patch.autoLaunch !== undefined &&
        (!snapshot.autoLaunch.available || snapshot.autoLaunch.enabled !== patch.autoLaunch)
      )
        success = false;
      return { success, snapshot };
    });
  }
}
