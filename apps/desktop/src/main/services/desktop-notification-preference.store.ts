import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  DesktopNotificationPreferencePatchSchema,
  DesktopNotificationPreferenceSchema,
  type DesktopNotificationPreference,
  type DesktopNotificationPreferencePatch,
} from '@memoflow/contracts/electron';

export const DEFAULT_DESKTOP_NOTIFICATION_PREFERENCE: DesktopNotificationPreference = {
  presentationMode: 'custom',
  soundEnabled: true,
};

const PersistedDesktopNotificationPreferenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    preference: DesktopNotificationPreferenceSchema,
  })
  .strict();

type Listener = (preference: DesktopNotificationPreference) => void;
export type DesktopNotificationPreferencePathResolver = () => string | null;

/**
 * Narrow owner for desktop notification presentation/sound preferences.
 *
 * Production supplies a resolver for the currently active Profile's dedicated
 * preference file. The store detects scope changes lazily, so a Profile switch
 * can never reuse the previous Profile's cached values. A no-argument store is
 * intentionally memory-only for focused service tests; production composition
 * must always provide the Profile path resolver.
 */
export class DesktopNotificationPreferenceStore {
  private preference: DesktopNotificationPreference = { ...DEFAULT_DESKTOP_NOTIFICATION_PREFERENCE };
  private readonly listeners = new Set<Listener>();
  private loadedPath: string | null | undefined = undefined;

  constructor(private readonly resolvePreferencePath?: DesktopNotificationPreferencePathResolver) {}

  get(): DesktopNotificationPreference {
    this.synchronizeScope();
    return { ...this.preference };
  }

  update(patch: DesktopNotificationPreferencePatch): DesktopNotificationPreference {
    const targetPath = this.synchronizeScope();
    if (this.resolvePreferencePath && targetPath === null) {
      throw new Error('Desktop notification preference requires an active Profile');
    }

    const safePatch = DesktopNotificationPreferencePatchSchema.parse(patch);
    this.preference = DesktopNotificationPreferenceSchema.parse({
      ...this.preference,
      ...safePatch,
    });
    if (targetPath) this.persist(targetPath);
    this.notify();
    return this.get();
  }

  reset(): DesktopNotificationPreference {
    const targetPath = this.synchronizeScope();
    if (this.resolvePreferencePath && targetPath === null) {
      throw new Error('Desktop notification preference requires an active Profile');
    }

    this.preference = { ...DEFAULT_DESKTOP_NOTIFICATION_PREFERENCE };
    if (targetPath) fs.rmSync(targetPath, { force: true });
    this.notify();
    return this.get();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private synchronizeScope(): string | null {
    if (!this.resolvePreferencePath) return null;

    const targetPath = this.resolvePreferencePath();
    if (targetPath === this.loadedPath) return targetPath;

    this.loadedPath = targetPath;
    this.preference = { ...DEFAULT_DESKTOP_NOTIFICATION_PREFERENCE };
    if (!targetPath) return null;

    try {
      const parsed = PersistedDesktopNotificationPreferenceSchema.safeParse(
        JSON.parse(fs.readFileSync(targetPath, 'utf8')) as unknown,
      );
      if (parsed.success) this.preference = parsed.data.preference;
    } catch {
      // Missing/corrupt local preference is recoverable: keep canonical defaults.
    }
    return targetPath;
  }

  private persist(targetPath: string): void {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const temporaryPath = `${targetPath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(
        temporaryPath,
        `${JSON.stringify({ schemaVersion: 1, preference: this.preference }, null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600 },
      );
      fs.renameSync(temporaryPath, targetPath);
    } finally {
      fs.rmSync(temporaryPath, { force: true });
    }
  }

  private notify(): void {
    const preference = { ...this.preference };
    for (const listener of this.listeners) listener(preference);
  }
}
