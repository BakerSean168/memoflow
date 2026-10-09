import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { createProfilePathResolver } from '../paths';
import { syncProfileDirectory, writeProfileDurableFile } from './profile-durable-file';

export const LocalProfileIdSchema = z.string().regex(/^p_[a-f0-9]{24}$/);

/** Durable tombstone prevents opening an empty/recreated Profile after a crash. */
export class ProfileCleanup {
  constructor(private readonly rootDir: string) {}
  private marker(profileId: string) {
    LocalProfileIdSchema.parse(profileId);
    return path.join(this.rootDir, 'shared', 'profiles', 'cleanup', `${profileId}.json`);
  }
  async isPending(profileId: string): Promise<boolean> {
    try {
      await fs.access(this.marker(profileId));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
  async pending(): Promise<string[]> {
    try {
      const names = await fs.readdir(path.join(this.rootDir, 'shared', 'profiles', 'cleanup'));
      return names
        .filter((name) => name.endsWith('.json'))
        .map((name) => LocalProfileIdSchema.parse(name.slice(0, -5)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
  async remove(profileId: string, finalize: () => Promise<void>): Promise<void> {
    const marker = this.marker(profileId);
    const source = createProfilePathResolver(this.rootDir, profileId).profileDir;
    const trash = path.join(this.rootDir, 'profiles', `.deleting-${profileId}`);
    await writeProfileDurableFile(marker, JSON.stringify({ schemaVersion: 1, profileId }));
    try {
      await fs.rename(source, trash);
      await syncProfileDirectory(path.dirname(source));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await fs.rm(trash, { recursive: true, force: true });
    await syncProfileDirectory(path.dirname(source));
    // Import recovery material belongs to the target Profile and must not outlive its key.
    const imports = path.join(this.rootDir, 'shared', 'profiles', 'imports');
    await fs.rm(path.join(imports, profileId), { recursive: true, force: true });
    const prompts = path.join(this.rootDir, 'shared', 'profiles', 'import-prompts');
    await fs.rm(path.join(prompts, `${profileId}.json`), { force: true });
    // Directory must be gone before discarding the only keys that can unlock it.
    await finalize();
    await fs.rm(marker);
    await syncProfileDirectory(path.dirname(marker));
  }
}
