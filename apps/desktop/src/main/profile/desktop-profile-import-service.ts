import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { BusinessDataSummarySchema } from '@memoflow/contracts/account';
import {
  DesktopProfileImportViewSchema,
  type DesktopProfileImportView,
  type DesktopProfileImportPrepare,
  type DesktopProfileImportCommit,
  type DesktopProfileImportOperationRequest,
} from '@memoflow/contracts/electron';
import {
  ProfileImportRequestSchema,
  ProfileImportPlanSchema,
  ProfileImportCommittedSchema,
  ProfileImportOperationSchema,
} from '@memoflow/contracts/data-portability';
import { profileImportDigest } from '@memoflow/data-portability';
import { ResultErrorException } from '@memoflow/contracts/result';
import type { DesktopProfileRuntimeManager } from './desktop-profile-runtime-manager';
import type { CloudSessionStore } from './cloud-session-store';
import { ProfileImportJournal, type ProfileImportJournalEntry } from './profile-import-journal';
import { readProfileSqliteSnapshot } from './profile-sqlite-snapshot';
import { composeProfilePortability } from './compose-profile-portability';
import { inspectProfileSource } from './profile-source-inventory';
import { profileImportHttp } from './profile-import-http';
import { LocalProfileIdSchema } from './profile-cleanup';
import { writeProfileDurableFile } from './profile-durable-file';

const endpoint = '/data-portability/profile-import';
const view = (entry: ProfileImportJournalEntry): DesktopProfileImportView =>
  DesktopProfileImportViewSchema.parse(
    Object.fromEntries(
      Object.keys(DesktopProfileImportViewSchema.shape).map((key) => [
        key,
        entry[key as keyof ProfileImportJournalEntry],
      ]),
    ),
  );

export class DesktopProfileImportService {
  constructor(
    private readonly runtime: DesktopProfileRuntimeManager,
    private readonly sessions: CloudSessionStore,
  ) {}

  private async target(profileId: string) {
    const profile = this.runtime.getActiveProfileDescriptorSync();
    if (!profile || profile.profileId !== profileId || profile.profileKind !== 'registered')
      throw new ResultErrorException('IMPORT_TARGET_REQUIRED', 'IMPORT_TARGET_REQUIRED');
    const session = await this.sessions.load(profileId);
    if (
      !session ||
      session.account.id !== profile.cloudBinding?.cloudAccountId ||
      Date.parse(session.expiresAt) <= Date.now()
    )
      throw new ResultErrorException('IMPORT_REAUTH_REQUIRED', 'IMPORT_REAUTH_REQUIRED');
    return {
      profile,
      token: session.token,
      journal: new ProfileImportJournal(this.runtime.getSharedResolver().rootDir, profileId),
    };
  }
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const generation = this.runtime.getProfileGeneration();
    return this.runtime.runExclusive(() => {
      if (generation !== this.runtime.getProfileGeneration())
        throw new ResultErrorException('PROFILE_CHANGED', 'PROFILE_CHANGED');
      return work();
    });
  }
  list(targetProfileId: string) {
    return this.exclusive(async () => {
      const { journal } = await this.target(targetProfileId);
      return (await journal.list()).map(view);
    });
  }
  private readSource(sourceProfileId: string, pin: string | undefined, exportedAt: string) {
    return this.runtime.withInactiveGuest(sourceProfileId, pin, (profile, paths) =>
      readProfileSqliteSnapshot(paths.dbPath, async (db) => {
        const exported = await composeProfilePortability(db, exportedAt).export(
          profile.localOwnerId,
        );
        const inventory = await inspectProfileSource(db, paths.profileDir);
        return {
          sourceLastActiveAt: profile.lastActiveAt,
          content: JSON.stringify(exported.envelope),
          sourceDigest: profileImportDigest(exported.envelope),
          inventory,
        };
      }),
    );
  }
  prepare(input: DesktopProfileImportPrepare) {
    return this.exclusive(async () => {
      const { profile, token, journal } = await this.target(input.targetProfileId);
      const previous = await journal.load(input.requestId);
      if (previous) {
        if (
          previous.sourceProfileId !== input.sourceProfileId ||
          previous.targetIdentityId !== profile.localOwnerId
        )
          throw new ResultErrorException('IMPORT_REQUEST_CONFLICT', 'IMPORT_REQUEST_CONFLICT');
        return view(previous);
      }
      const exportedAt = new Date().toISOString();
      const source = await this.readSource(input.sourceProfileId, input.pin, exportedAt);
      ProfileImportRequestSchema.parse({ requestId: input.requestId, content: source.content });
      const entry: ProfileImportJournalEntry = {
        schemaVersion: 1,
        requestId: input.requestId,
        targetProfileId: profile.profileId,
        targetIdentityId: profile.localOwnerId,
        sourceProfileId: input.sourceProfileId,
        exportedAt,
        sourceLastActiveAt: source.sourceLastActiveAt,
        sourceDigest: source.sourceDigest,
        inventoryDigest: source.inventory.digest,
        phase: 'prepared',
        plan: null,
        result: null,
        blockers: source.inventory.blockers,
        deleteSource: false,
        serverVerified: false,
        localVerified: false,
        sourceUnchanged: null,
      };
      await this.runtime.withActiveProfileKey(profile.profileId, (key) =>
        journal.saveSnapshot(entry, source.content, key),
      );
      await journal.save(entry);
      entry.plan = await profileImportHttp(
        token,
        `${endpoint}/preflight`,
        ProfileImportPlanSchema,
        { requestId: entry.requestId, content: source.content },
      );
      entry.blockers.push(...entry.plan.blockers);
      entry.phase = 'preflight';
      await journal.save(entry);
      return view(entry);
    });
  }
  commit(input: DesktopProfileImportCommit) {
    return this.exclusive(async () => {
      const target = await this.target(input.targetProfileId);
      const entry = await this.requireEntry(
        target.journal,
        input.requestId,
        target.profile.localOwnerId,
      );
      if (entry.phase === 'preflight') {
        entry.deleteSource = input.deleteSource;
        entry.phase = 'committing';
        await target.journal.save(entry);
      } else if (entry.phase === 'prepared')
        throw new ResultErrorException('IMPORT_PREFLIGHT_REQUIRED', 'IMPORT_PREFLIGHT_REQUIRED');
      return this.recoverNow(entry, target.token, target.journal, input.pin);
    });
  }
  recover(input: DesktopProfileImportOperationRequest) {
    return this.exclusive(async () => {
      const target = await this.target(input.targetProfileId);
      const entry = await this.requireEntry(
        target.journal,
        input.requestId,
        target.profile.localOwnerId,
      );
      return this.recoverNow(entry, target.token, target.journal, input.pin);
    });
  }
  private async requireEntry(journal: ProfileImportJournal, requestId: string, identityId: string) {
    const entry = await journal.load(requestId);
    if (!entry || entry.targetIdentityId !== identityId)
      throw new ResultErrorException('IMPORT_NOT_FOUND', 'IMPORT_NOT_FOUND');
    return entry;
  }
  private async content(entry: ProfileImportJournalEntry, journal: ProfileImportJournal) {
    return this.runtime.withActiveProfileKey(entry.targetProfileId, async (key) => {
      const content = await journal.readSnapshot(entry, key);
      if (profileImportDigest(JSON.parse(content)) !== entry.sourceDigest)
        throw new ResultErrorException('IMPORT_SNAPSHOT_CHANGED', 'IMPORT_SNAPSHOT_CHANGED');
      return content;
    });
  }
  private async recoverNow(
    entry: ProfileImportJournalEntry,
    token: string,
    journal: ProfileImportJournal,
    pin?: string,
  ) {
    if (entry.phase === 'completed') {
      await journal.discardSnapshot(entry.requestId);
      return view(entry);
    }
    if (entry.phase === 'cleanup_pending') {
      // A cleanup tombstone is the durable authorization to finish an already-started removal.
      const sourceExists = (await this.runtime.listProfiles()).some(
        (profile) => profile.profileId === entry.sourceProfileId,
      );
      if (!sourceExists || (await this.runtime.isProfileCleanupPending(entry.sourceProfileId))) {
        if (sourceExists) await this.runtime.removeImportedGuest(entry.sourceProfileId);
        entry.phase = 'completed';
        await journal.save(entry);
        await journal.discardSnapshot(entry.requestId);
        return view(entry);
      }
      // Crash before the tombstone: the source may have been opened since then.
      // Re-run all content checks and PIN authorization before starting cleanup.
      entry.phase = 'committed';
    }
    if (entry.phase === 'prepared') {
      entry.plan = await profileImportHttp(
        token,
        `${endpoint}/preflight`,
        ProfileImportPlanSchema,
        { requestId: entry.requestId, content: await this.content(entry, journal) },
      );
      entry.blockers.push(...entry.plan.blockers);
      entry.phase = 'preflight';
      await journal.save(entry);
      return view(entry);
    }
    const operation = await profileImportHttp(
      token,
      `${endpoint}/${entry.requestId}`,
      ProfileImportOperationSchema,
    );
    if (operation.status === 'pending' && entry.phase !== 'committing') return view(entry);
    try {
      entry.result =
        operation.status === 'committed'
          ? operation
          : await profileImportHttp(token, `${endpoint}/commit`, ProfileImportCommittedSchema, {
              requestId: entry.requestId,
              content: await this.content(entry, journal),
              effectiveDigest: entry.plan?.effectiveDigest,
            });
    } catch (error) {
      if (error instanceof ResultErrorException && error.code === 'TARGET_CHANGED') {
        entry.phase = 'prepared';
        entry.plan = null;
        entry.deleteSource = false;
        entry.blockers = entry.blockers.filter((blocker) => blocker.reason !== 'preserved_target');
        await journal.save(entry);
      }
      throw error;
    }
    if (entry.result.plan.sourceDigest !== entry.sourceDigest)
      throw new ResultErrorException('IMPORT_REQUEST_CONFLICT', 'IMPORT_REQUEST_CONFLICT');
    entry.phase = 'committed';
    entry.serverVerified = entry.result.serverVerified;
    entry.localVerified = false;
    await journal.save(entry);
    // A durable committed receipt is sufficient for all remaining verification/recovery.
    await journal.discardSnapshot(entry.requestId);
    const paths = this.runtime.getActiveProfileResolver();
    if (!paths || paths.profileId !== entry.targetProfileId)
      throw new ResultErrorException('PROFILE_CHANGED', 'PROFILE_CHANGED');
    try {
      const result = entry.result;
      const manifests = await readProfileSqliteSnapshot(paths.dbPath, (db) =>
        composeProfilePortability(db, entry.exportedAt).readProfileManifests(
          entry.targetIdentityId,
          result.bindings,
          result.manifests.map((manifest) => manifest.key),
        ),
      );
      entry.localVerified =
        profileImportDigest(manifests) === profileImportDigest(result.manifests);
    } catch {
      /* Incomplete sync never authorizes cleanup; retry reads actual owner facts. */
    }
    if (entry.localVerified && entry.serverVerified) entry.phase = 'verified';
    await journal.save(entry);
    if (entry.phase === 'verified' && entry.deleteSource && entry.blockers.length === 0) {
      const source = await this.readSource(entry.sourceProfileId, pin, entry.exportedAt);
      entry.sourceUnchanged =
        source.sourceLastActiveAt === entry.sourceLastActiveAt &&
        source.sourceDigest === entry.sourceDigest &&
        source.inventory.digest === entry.inventoryDigest &&
        source.inventory.blockers.length === 0;
      await journal.save(entry);
      if (entry.sourceUnchanged) {
        // Verify the server again immediately before entering the irreversible cleanup phase.
        const fresh = await profileImportHttp(
          token,
          `${endpoint}/${entry.requestId}`,
          ProfileImportOperationSchema,
        );
        if (fresh.status !== 'committed' || !fresh.serverVerified) {
          entry.serverVerified = false;
          entry.phase = 'committed';
          await journal.save(entry);
          return view(entry);
        }
        entry.phase = 'cleanup_pending';
        await journal.save(entry);
        await this.runtime.removeImportedGuest(entry.sourceProfileId);
        entry.phase = 'completed';
        await journal.save(entry);
        await journal.discardSnapshot(entry.requestId);
      }
    }
    return view(entry);
  }

  /** Consume before any IO that may fail, so refresh/offline/re-auth never causes repeat prompts. */
  consumePrompt(targetProfileId: string) {
    return this.exclusive(async () => {
      const { profile, token } = await this.target(targetProfileId);
      const marker = path.join(
        this.runtime.getSharedResolver().rootDir,
        'shared',
        'profiles',
        'import-prompts',
        `${profile.profileId}.json`,
      );
      let pending: { sourceProfileId: string | null; consumed: boolean };
      try {
        pending = z
          .object({ sourceProfileId: LocalProfileIdSchema.nullable(), consumed: z.boolean() })
          .parse(JSON.parse(await fs.readFile(marker, 'utf8')));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
      if (pending.consumed) return null;
      await writeProfileDurableFile(marker, JSON.stringify({ ...pending, consumed: true }));
      try {
        const summary = await profileImportHttp(
          token,
          '/accounts/me/data-summary',
          BusinessDataSummarySchema,
        );
        if (summary.state !== 'empty') return null;
        const candidates = (await this.runtime.listProfiles()).filter(
          (candidate) => candidate.profileKind === 'guest',
        );
        const available: string[] = [];
        for (const candidate of candidates.slice(0, 20)) {
          if (await this.runtime.hasPin(candidate.profileId)) continue;
          try {
            const exported = await this.runtime.withInactiveGuest(
              candidate.profileId,
              undefined,
              (source, paths) =>
                readProfileSqliteSnapshot(paths.dbPath, (db) =>
                  composeProfilePortability(db, new Date().toISOString()).export(
                    source.localOwnerId,
                  ),
                ),
            );
            const hasBusiness = exported.envelope.capabilities.some(
              (owner) =>
                !['account-profile', 'preferences', 'notification-delivery-preferences'].includes(
                  owner.key,
                ) &&
                owner.payload !== null &&
                typeof owner.payload === 'object' &&
                Object.values(owner.payload).some(
                  (value) => Array.isArray(value) && value.length > 0,
                ),
            );
            if (hasBusiness) available.push(candidate.profileId);
          } catch {
            /* Unreadable candidates remain available only through manual selection. */
          }
        }
        return available.length
          ? { sourceProfileId: available.length === 1 ? available[0]! : null }
          : null;
      } catch {
        return null;
      }
    });
  }
}
