import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { argon2id, hash } from 'argon2';

interface PinEnvelope {
  version: 1;
  kdf: 'argon2id';
  memoryCost: number;
  timeCost: number;
  parallelism: number;
  salt: string;
  iv: string;
  ciphertext: string;
  authTag: string;
}

const KDF = {
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
} as const;

export class ProfilePinStore {
  private readonly directory: string;
  private readonly failures = new Map<string, { count: number; retryAt: number }>();

  constructor(rootDir: string) {
    this.directory = path.join(rootDir, 'shared', 'secure', 'profile-pins');
  }

  async hasPin(profileId: string): Promise<boolean> {
    try {
      await fs.promises.access(this.filePath(profileId));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return false;
    }
  }

  async setPin(profileId: string, pin: string, profileKey: Buffer): Promise<void> {
    this.validatePin(pin);
    if (profileKey.length !== 32) throw new Error('Profile key must be 32 bytes');
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = await hash(pin, { ...KDF, salt, type: argon2id, raw: true });
    try {
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(profileKey), cipher.final()]);
      const envelope: PinEnvelope = {
        version: 1,
        kdf: 'argon2id',
        memoryCost: KDF.memoryCost,
        timeCost: KDF.timeCost,
        parallelism: KDF.parallelism,
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
      };
      await fs.promises.mkdir(this.directory, { recursive: true });
      const target = this.filePath(profileId);
      const temp = `${target}.tmp`;
      await fs.promises.writeFile(temp, JSON.stringify(envelope), 'utf8');
      await fs.promises.rename(temp, target);
      this.failures.delete(profileId);
    } finally {
      key.fill(0);
    }
  }

  async unlock(profileId: string, pin: string): Promise<Buffer> {
    this.validatePin(pin);
    const failure = this.failures.get(profileId);
    if (failure && failure.retryAt > Date.now()) {
      throw new Error(
        `PIN 暂时锁定，请在 ${Math.ceil((failure.retryAt - Date.now()) / 1000)} 秒后重试`,
      );
    }

    try {
      const envelope = JSON.parse(
        await fs.promises.readFile(this.filePath(profileId), 'utf8'),
      ) as PinEnvelope;
      if (envelope.version !== 1 || envelope.kdf !== 'argon2id') throw new Error('unsupported');
      const key = await hash(pin, {
        memoryCost: envelope.memoryCost,
        timeCost: envelope.timeCost,
        parallelism: envelope.parallelism,
        hashLength: 32,
        salt: Buffer.from(envelope.salt, 'base64'),
        type: argon2id,
        raw: true,
      });
      try {
        const decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(envelope.iv, 'base64'),
        );
        decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
        const profileKey = Buffer.concat([
          decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
          decipher.final(),
        ]);
        if (profileKey.length !== 32) throw new Error('invalid key');
        this.failures.delete(profileId);
        return profileKey;
      } finally {
        key.fill(0);
      }
    } catch {
      const count = (this.failures.get(profileId)?.count ?? 0) + 1;
      const retryAt = count >= 5 ? Date.now() + Math.min(60_000, 2 ** (count - 5) * 1_000) : 0;
      this.failures.set(profileId, { count, retryAt });
      throw new Error('PIN 不正确或解锁凭据已损坏');
    }
  }

  async remove(profileId: string): Promise<void> {
    this.failures.delete(profileId);
    await fs.promises.rm(this.filePath(profileId), { force: true });
  }

  private validatePin(pin: string): void {
    if (!/^\d{6,12}$/.test(pin)) throw new Error('PIN 必须为 6 至 12 位数字');
  }

  private filePath(profileId: string): string {
    return path.join(this.directory, `${profileId}.json`);
  }
}
