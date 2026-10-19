import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { decryptSafeStorageString, encryptSafeStorageString } from './safe-storage-codec';

export interface ProfileKeyStore {
  ensure(profileId: string): Promise<void>;
  unlock(profileId: string): Promise<Buffer>;
  remove(profileId: string): Promise<void>;
}

export class ElectronProfileKeyStore implements ProfileKeyStore {
  private readonly directory: string;

  constructor(rootDir: string) {
    this.directory = path.join(rootDir, 'shared', 'secure', 'profile-keys');
  }

  async ensure(profileId: string): Promise<void> {
    const filePath = this.filePath(profileId);
    if (await this.exists(filePath)) return;
    await fs.promises.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const key = crypto.randomBytes(32);
    let envelope: Buffer;
    try {
      envelope = await encryptSafeStorageString(key.toString('base64'));
    } catch {
      throw new Error('本机安全存储不可用，无法创建 Profile 解锁凭据');
    }
    await fs.promises.writeFile(filePath, envelope);
  }

  async unlock(profileId: string): Promise<Buffer> {
    const filePath = this.filePath(profileId);
    const envelope = await fs.promises.readFile(filePath);
    let decoded: string;
    try {
      const result = await decryptSafeStorageString(envelope);
      decoded = result.value;
      if (result.shouldReEncrypt) {
        await fs.promises.writeFile(filePath, await encryptSafeStorageString(decoded));
      }
    } catch {
      throw new Error('本机安全存储不可用，无法解锁 Profile');
    }
    const key = Buffer.from(decoded, 'base64');
    if (key.length !== 32) throw new Error('Profile 解锁凭据损坏');
    return key;
  }

  async remove(profileId: string): Promise<void> {
    await fs.promises.rm(this.filePath(profileId), { force: true });
  }

  private filePath(profileId: string): string {
    return path.join(this.directory, `${profileId}.bin`);
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
