import fs from 'node:fs';
import path from 'node:path';
import { decryptSafeStorageString, encryptSafeStorageString } from './safe-storage-codec';

export interface StoredCloudSession {
  token: string;
  sessionId: string;
  account: { id: string; email: string; name: string; emailVerified: boolean };
  expiresAt: string;
}

export class CloudSessionStore {
  private readonly directory: string;

  constructor(rootDir: string) {
    this.directory = path.join(rootDir, 'shared', 'secure', 'cloud-sessions');
  }

  async save(profileId: string, session: StoredCloudSession): Promise<void> {
    await fs.promises.mkdir(this.directory, { recursive: true, mode: 0o700 });
    let encrypted: Buffer;
    try {
      encrypted = await encryptSafeStorageString(JSON.stringify(session));
    } catch {
      throw new Error('本机安全存储不可用');
    }
    const target = path.join(this.directory, `${profileId}.bin`);
    const temp = `${target}.tmp`;
    await fs.promises.writeFile(temp, encrypted, { mode: 0o600 });
    await fs.promises.rename(temp, target);
  }

  async load(profileId: string): Promise<StoredCloudSession | null> {
    try {
      const target = path.join(this.directory, `${profileId}.bin`);
      const encrypted = await fs.promises.readFile(target);
      const decoded = await decryptSafeStorageString(encrypted);
      if (decoded.shouldReEncrypt) {
        await fs.promises.writeFile(target, await encryptSafeStorageString(decoded.value));
      }
      return JSON.parse(decoded.value) as StoredCloudSession;
    } catch {
      return null;
    }
  }

  async getValidToken(profileId: string): Promise<string | null> {
    const session = await this.load(profileId);
    if (!session) return null;
    if (Date.parse(session.expiresAt) <= Date.now()) return null;
    return session.token;
  }

  async remove(profileId: string): Promise<void> {
    await fs.promises.rm(path.join(this.directory, `${profileId}.bin`), { force: true });
  }
}
