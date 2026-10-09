import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { DesktopProfileImportViewSchema } from '@memoflow/contracts/electron';
import {
  ProfileImportCommittedSchema,
  ProfileImportRequestSchema,
} from '@memoflow/contracts/data-portability';
import { LocalProfileIdSchema } from './profile-cleanup';
import { writeProfileDurableFile } from './profile-durable-file';

export const ProfileImportJournalSchema = DesktopProfileImportViewSchema.extend({
  schemaVersion: z.literal(1),
  targetIdentityId: z.string().min(1),
  sourceLastActiveAt: z.number().finite(),
  exportedAt: z.iso.datetime(),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  inventoryDigest: z.string().regex(/^[a-f0-9]{64}$/),
  result: ProfileImportCommittedSchema.nullable(),
});
export type ProfileImportJournalEntry = z.infer<typeof ProfileImportJournalSchema>;

export class ProfileImportJournal {
  private readonly directory: string;
  constructor(rootDir: string, targetProfileId: string) {
    LocalProfileIdSchema.parse(targetProfileId);
    this.directory = path.join(rootDir, 'shared', 'profiles', 'imports', targetProfileId);
  }
  private filename(requestId: string, extension: string) {
    ProfileImportRequestSchema.shape.requestId.parse(requestId);
    return path.join(this.directory, `${requestId}.${extension}`);
  }
  async save(entry: ProfileImportJournalEntry) {
    await writeProfileDurableFile(
      this.filename(entry.requestId, 'json'),
      JSON.stringify(ProfileImportJournalSchema.parse(entry)),
    );
  }
  async load(requestId: string): Promise<ProfileImportJournalEntry | null> {
    try {
      return ProfileImportJournalSchema.parse(
        JSON.parse(await fs.readFile(this.filename(requestId, 'json'), 'utf8')),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async list(): Promise<ProfileImportJournalEntry[]> {
    let files: string[];
    try {
      files = await fs.readdir(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const entries: ProfileImportJournalEntry[] = [];
    for (const file of files.filter((file) => file.endsWith('.json'))) {
      const entry = await this.load(file.slice(0, -5));
      if (entry) entries.push(entry);
    }
    return entries;
  }
  private aad(entry: ProfileImportJournalEntry) {
    return Buffer.from(
      JSON.stringify([
        entry.targetProfileId,
        entry.targetIdentityId,
        entry.sourceProfileId,
        entry.requestId,
        entry.sourceDigest,
      ]),
    );
  }
  async saveSnapshot(entry: ProfileImportJournalEntry, content: string, key: Buffer) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(this.aad(entry));
    const encrypted = Buffer.concat([cipher.update(content, 'utf8'), cipher.final()]);
    await writeProfileDurableFile(
      this.filename(entry.requestId, 'bin'),
      Buffer.concat([iv, cipher.getAuthTag(), encrypted]),
    );
  }
  async readSnapshot(entry: ProfileImportJournalEntry, key: Buffer) {
    const envelope = await fs.readFile(this.filename(entry.requestId, 'bin'));
    const decipher = createDecipheriv('aes-256-gcm', key, envelope.subarray(0, 12));
    decipher.setAAD(this.aad(entry));
    decipher.setAuthTag(envelope.subarray(12, 28));
    return Buffer.concat([decipher.update(envelope.subarray(28)), decipher.final()]).toString(
      'utf8',
    );
  }
  async discardSnapshot(requestId: string) {
    await fs.rm(this.filename(requestId, 'bin'), { force: true });
  }
}
