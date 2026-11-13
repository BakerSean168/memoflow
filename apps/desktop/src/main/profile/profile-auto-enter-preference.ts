import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('ProfileAutoEnterPreference');

/**
 * Device preference for #926: which Profile a cold start should enter, or null
 * for "off". It holds one Profile id and nothing else; the remembered
 * credential material stays exactly where #785 put it.
 */
export class ProfileAutoEnterPreference {
  private profileId: string | null = null;

  constructor(private readonly filePath: string) {
    this.profileId = this.read();
  }

  get(): string | null {
    return this.profileId;
  }

  set(profileId: string | null): void {
    const next = { profileId };
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(`${this.filePath}.tmp`, JSON.stringify(next), 'utf8');
    renameSync(`${this.filePath}.tmp`, this.filePath);
    this.profileId = profileId;
  }

  private read(): string | null {
    if (!existsSync(this.filePath)) return null;
    try {
      const value: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'));
      const id = (value as { profileId?: unknown } | null)?.profileId;
      return typeof id === 'string' && id.length > 0 ? id : null;
    } catch {
      logger.warn('Automatic entry preference unreadable; treating it as off');
      return null;
    }
  }
}
