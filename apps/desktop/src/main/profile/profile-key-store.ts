import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { decryptSafeStorageString, encryptSafeStorageString } from './safe-storage-codec';

export interface ProfileKeyStore {
  ensure(profileId: string): Promise<void>;
  save(profileId: string, key: Buffer): Promise<void>;
  has(profileId: string): Promise<boolean>;
  unlock(profileId: string): Promise<Buffer>;
  remove(profileId: string): Promise<void>;
}

/**
 * safeStorage-backed Profile data-key copies.
 *
 * The default namespace is the registered-Profile key copy (`profile-keys/`).
 * A secondary namespace (e.g. `remembered/`) reuses the same envelope and store
 * for "remember me" copies without mixing them with the registered keys.
 *
 * 同一 store 承载两类副本：注册表 Profile 的默认命名空间，以及本地账户「记住我」
 * 的独立命名空间；不引入第二套凭据存储。
 */
export class ElectronProfileKeyStore implements ProfileKeyStore {
  private readonly directory: string;

  constructor(rootDir: string, namespace?: string) {
    const base = path.join(rootDir, 'shared', 'secure', 'profile-keys');
    this.directory = namespace ? path.join(base, namespace) : base;
  }

  async ensure(profileId: string): Promise<void> {
    if (await this.has(profileId)) return;
    await this.save(profileId, crypto.randomBytes(32));
  }

  /** Persist an already-unlocked 32-byte data key (never the password). */
  async save(profileId: string, key: Buffer): Promise<void> {
    if (key.length !== 32) throw new Error('Profile key must be 32 bytes');
    await fs.promises.mkdir(this.directory, { recursive: true, mode: 0o700 });
    let envelope: Buffer;
    try {
      envelope = await encryptSafeStorageString(key.toString('base64'));
    } catch {
      throw new Error('本机安全存储不可用，无法保存 Profile 解锁凭据');
    }
    await fs.promises.writeFile(this.filePath(profileId), envelope);
  }

  async has(profileId: string): Promise<boolean> {
    return this.exists(this.filePath(profileId));
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
