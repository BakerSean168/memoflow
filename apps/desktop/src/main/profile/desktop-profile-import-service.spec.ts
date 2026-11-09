import { resolveDesktopStorageRoots } from '../paths';
import { mkdtemp, mkdir, rm, readFile, access, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';
import { PowerSyncAppSchema } from '@memoflow/powersync-schema';
import type { IElectronDatabase } from '@memoflow/desktop-contracts';
import type {
  ArchiveManifest,
  ProfileImportPlan,
  ProfileImportCommitted,
} from '@memoflow/data-portability-contracts';
import {
  ArchiveLineV1Schema,
  computeArchiveManifest,
  computeThreadManifestEntry,
  type ArchiveMessageLineV1,
} from '@memoflow/ai-contracts/portable-messages-archive';
import { PROFILE_IMPORT_ARCHIVE_MAX_CHUNK_BYTES } from '@memoflow/data-portability-contracts';
import { profileImportDigest } from '@memoflow/data-portability';
import { createProfilePathResolver } from '../paths';
import { composeProfilePortability } from './compose-profile-portability';
import { DesktopProfileImportService } from './desktop-profile-import-service';
import { ProfileImportJournal } from './profile-import-journal';
import { markProfileImportOpportunity } from './profile-import-opportunity';

vi.mock('../utils/api-config', () => ({ getApiBaseUrl: () => 'https://memo.test/api/v1' }));
afterEach(() => vi.unstubAllGlobals());
const sourceId = 'p_111111111111111111111111';
const targetId = 'p_222222222222222222222222';
const requestId = 'copy-request-1234';

function initialize(filename: string, identityId: string) {
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  for (const [name, table] of Object.entries(PowerSyncAppSchema.props)) {
    db.exec(
      `CREATE TABLE "${name}" (id TEXT PRIMARY KEY, ${table.columns.map((column) => `"${column.name}" ${column.type}`).join(', ')})`,
    );
  }
  db.prepare(
    'INSERT INTO accounts (id, status, profile, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(
    identityId,
    'Active',
    JSON.stringify({
      nickname: 'Same',
      realName: null,
      avatarUrl: null,
      bio: null,
      gender: 'PreferNotToSay',
      birthday: null,
    }),
    '2026-10-09T00:00:00Z',
    '2026-10-09T00:00:00Z',
  );
  return db;
}
function writable(db: Database.Database): IElectronDatabase {
  const adapter: IElectronDatabase = {
    async execute(sql, parameters = []) {
      return { rowsAffected: db.prepare(sql).run(...parameters).changes };
    },
    async getAll<T>(sql: string, parameters: unknown[] = []) {
      return db.prepare(sql).all(...parameters) as T[];
    },
    async getOptional<T>(sql: string, parameters: unknown[] = []) {
      return (db.prepare(sql).get(...parameters) as T | undefined) ?? null;
    },
    async get<T>(sql: string, parameters: unknown[] = []) {
      const row = db.prepare(sql).get(...parameters);
      if (!row) throw new Error('missing');
      return row as T;
    },
    async writeTransaction(callback) {
      db.exec('BEGIN');
      try {
        const result = await callback(adapter);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return adapter;
}

function archiveManifestFromNdjson(text: string): ArchiveManifest {
  const messagesByRef = new Map<string, ArchiveMessageLineV1[]>();
  const refs: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = ArchiveLineV1Schema.parse(JSON.parse(line));
    if (parsed.k === 'thread') {
      refs.push(parsed.ref);
      continue;
    }
    const list = messagesByRef.get(parsed.ref);
    if (list) list.push(parsed);
    else messagesByRef.set(parsed.ref, [parsed]);
  }
  return computeArchiveManifest(
    refs.map((ref) => computeThreadManifestEntry(ref, messagesByRef.get(ref) ?? [])),
  );
}

function emptyPreview(dryRun: boolean) {
  return {
    batchId: 'stable-batch',
    dryRun,
    capabilities: [],
    created: {},
    updated: {},
    skipped: {},
    warnings: [],
  };
}

async function fixture(fixtureOptions: { messages?: boolean } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'profile-copy-'));
  const roots = {
    ...resolveDesktopStorageRoots({
      platform: 'linux',
      channel: 'test',
      home: root,
      env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: root },
    }),
    dataRoot: root,
  };
  const source = createProfilePathResolver(roots, sourceId);
  const target = createProfilePathResolver(roots, targetId);
  await mkdir(source.dbDir, { recursive: true });
  await mkdir(target.dbDir, { recursive: true });
  const src = initialize(source.dbPath, 'IdentityId_11111111-1111-4111-8111-111111111111');
  const sourceIdentity = 'IdentityId_11111111-1111-4111-8111-111111111111';
  src
    .prepare(
      'INSERT INTO labels (id, identity_id, name, normalized_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(
      'label-source',
      sourceIdentity,
      'Travel',
      'travel',
      '2026-10-09T00:00:00Z',
      '2026-10-09T00:00:00Z',
    );
  if (fixtureOptions.messages) {
    src
      .prepare(
        'INSERT INTO ai_conversations (id, identity_id, name, status, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        'IAiConversationId_11111111-1111-4111-8111-111111111111',
        sourceIdentity,
        'Conversation',
        'Active',
        1,
        '2026-10-09T00:00:00Z',
        '2026-10-09T00:00:00Z',
        null,
      );
    await mkdir(source.storageDir, { recursive: true });
    const mastra = new Database(path.join(source.storageDir, 'mastra.db'));
    mastra.exec(`
      CREATE TABLE mastra_threads (
        id TEXT PRIMARY KEY,
        resourceId TEXT,
        title TEXT,
        metadata TEXT,
        createdAt TEXT,
        updatedAt TEXT
      );
      CREATE TABLE mastra_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT,
        content TEXT,
        role TEXT,
        type TEXT,
        createdAt TEXT,
        resourceId TEXT
      );
      INSERT INTO mastra_threads VALUES (
        'IAiConversationId_11111111-1111-4111-8111-111111111111',
        '${sourceIdentity}',
        'Conversation',
        NULL,
        '2026-10-09T00:00:00.000Z',
        '2026-10-09T00:00:02.000Z'
      );
      INSERT INTO mastra_messages VALUES (
        'message-1',
        'IAiConversationId_11111111-1111-4111-8111-111111111111',
        '{"format":2,"parts":[{"type":"text","text":"hello"}]}',
        'user',
        'text',
        '2026-10-09T00:00:01.000Z',
        '${sourceIdentity}'
      );
      INSERT INTO mastra_messages VALUES (
        'message-2',
        'IAiConversationId_11111111-1111-4111-8111-111111111111',
        '{"format":2,"parts":[{"type":"text","text":"world"}]}',
        'assistant',
        'text',
        '2026-10-09T00:00:02.000Z',
        '${sourceIdentity}'
      );
    `);
    mastra.close();
  }
  const identity = 'IdentityId_22222222-2222-4222-8222-222222222222';
  initialize(target.dbPath, identity).close();
  const server = initialize(path.join(root, 'server.sqlite'), identity);
  const coordinator = composeProfilePortability(writable(server), '2026-10-09T00:00:00Z');
  const descriptor = {
    profileId: targetId,
    profileKind: 'registered',
    localOwnerId: identity,
    cloudBinding: { cloudAccountId: identity },
  };
  const sourceDescriptor = {
    lastActiveAt: 1,
    profileId: sourceId,
    profileKind: 'local',
    localOwnerId: 'IdentityId_11111111-1111-4111-8111-111111111111',
  };
  const remove = vi.fn(async () => undefined);
  const runtime = {
    runExclusive: <T>(fn: () => Promise<T>) => fn(),
    getProfileGeneration: () => 0,
    getActiveProfileDescriptorSync: () => descriptor,
    getActiveProfileResolver: () => target,
    getSharedResolver: () => ({ roots }),
    listProfiles: async () => [descriptor, sourceDescriptor],
    hasCredential: async () => false,
    hasRememberedKey: async (_id?: string) => false,
    isProfileCleanupPending: async () => false,
    withActiveProfileKey: <T>(_id: string, work: (key: Buffer) => Promise<T>) =>
      work(Buffer.alloc(32, 1)),
    withInactiveLocalAccount: <T>(
      _id: string,
      _password: string | undefined,
      work: (profile: typeof sourceDescriptor, paths: typeof source) => Promise<T>,
    ) => work(sourceDescriptor, source),
    removeImportedLocalAccount: remove,
  };
  const sessions = {
    load: async () => ({
      token: 'private-token',
      account: { id: identity },
      expiresAt: '2030-01-01T00:00:00Z',
    }),
  };
  const service = () => new DesktopProfileImportService(runtime as never, sessions as never);
  let plan: ProfileImportPlan;
  let result: ProfileImportCommitted | null = null;
  let loseCommitResponse = false;
  let commits = 0;
  const archive = {
    events: [] as string[],
    digest: '',
    codec: '',
    chunkCount: 0,
    uncompressedBytes: 0,
    chunks: new Map<number, Buffer>(),
    complete: false,
    manifest: null as ArchiveManifest | null,
  };
  const http = vi.fn(async (url: string, options?: RequestInit) => {
    const input = JSON.parse(String(options?.body ?? '{}'));
    if (url.endsWith('/archive/prepare')) {
      archive.events.push('prepare');
      if (!archive.digest) {
        archive.digest = input.archiveDigest;
        archive.codec = input.codec;
        archive.chunkCount = input.chunkCount;
        archive.uncompressedBytes = input.uncompressedBytes;
      } else {
        expect(input).toMatchObject({
          archiveDigest: archive.digest,
          codec: archive.codec,
          chunkCount: archive.chunkCount,
          uncompressedBytes: archive.uncompressedBytes,
        });
      }
      return Response.json({
        ok: true,
        data: {
          archiveState: archive.complete ? 'complete' : 'partial',
          receivedChunkIndexes: [...archive.chunks.keys()].sort((a, b) => a - b),
        },
      });
    }
    if (url.endsWith('/archive/chunk')) {
      archive.events.push(`chunk:${input.index}`);
      const bytes = Buffer.from(input.data, 'base64');
      expect(bytes.byteLength).toBeLessThanOrEqual(PROFILE_IMPORT_ARCHIVE_MAX_CHUNK_BYTES);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(input.digest);
      archive.chunks.set(input.index, bytes);
      return Response.json({
        ok: true,
        data: {
          archiveState: 'partial',
          receivedChunkIndexes: [...archive.chunks.keys()].sort((a, b) => a - b),
        },
      });
    }
    if (url.endsWith('/archive/complete')) {
      archive.events.push('complete');
      const ordered = [...archive.chunks.entries()].sort((left, right) => left[0] - right[0]);
      expect(ordered).toHaveLength(archive.chunkCount);
      let bytes = Buffer.concat(ordered.map(([, chunk]) => chunk));
      if (archive.codec === 'ndjson+gzip') bytes = gunzipSync(bytes);
      archive.manifest = archiveManifestFromNdjson(bytes.toString('utf8'));
      expect(archive.manifest.archive.digest).toBe(archive.digest);
      archive.complete = true;
      return Response.json({
        ok: true,
        data: { archiveState: 'complete', computedManifest: archive.manifest },
      });
    }
    if (url.endsWith('/data-summary'))
      return Response.json({
        ok: true,
        data: {
          schemaVersion: 1,
          state: 'empty',
          observedAt: new Date().toISOString(),
          owners: [
            'goal',
            'task',
            'label',
            'schedule',
            'routine',
            'repository',
            'ai',
            'notification',
            'relation',
          ].map((owner) => ({ owner, state: 'empty' })),
        },
      });
    if (url.endsWith('/preflight')) {
      archive.events.push('preflight');
      if (fixtureOptions.messages) {
        expect(archive.complete).toBe(true);
        const envelope = JSON.parse(input.content);
        const declared = envelope.capabilities.find(
          (capability: { key: string }) => capability.key === 'ai-conversation-messages',
        )?.payload;
        expect(declared).toEqual(archive.manifest);
        const sourceDigest = profileImportDigest(envelope);
        plan = {
          schemaVersion: 1,
          requestId,
          operationId: 'stable-batch',
          batchId: 'stable-batch',
          sourceDigest,
          effectiveDigest: sourceDigest,
          blockers: [],
          preview: emptyPreview(true),
        };
        return Response.json({ ok: true, data: plan });
      }
      const prepared = await coordinator.planProfileCopy(input.content, identity, 'stable-batch');
      plan = {
        schemaVersion: 1,
        requestId,
        operationId: 'stable-batch',
        batchId: 'stable-batch',
        sourceDigest: prepared.sourceDigest,
        effectiveDigest: prepared.effectiveDigest,
        blockers: prepared.blockers,
        preview: prepared.preview,
      };
      return Response.json({ ok: true, data: plan });
    }
    if (url.endsWith('/commit')) {
      commits += 1;
      if (fixtureOptions.messages) {
        result = {
          status: 'committed',
          plan,
          receipt: emptyPreview(false),
          bindings: [],
          // The desktop must ignore this server-scoped manifest during local verification.
          manifests: [
            { key: 'ai-conversation-messages', schemaVersion: 1, digest: 'a'.repeat(64) },
          ],
          committedAt: new Date().toISOString(),
          serverVerified: true,
        };
        return Response.json({ ok: true, data: result });
      }
      const prepared = await coordinator.planProfileCopy(input.content, identity, 'stable-batch');
      const applied = await coordinator.applyProfileCopy(
        prepared.effectiveContent,
        identity,
        'stable-batch',
      );
      result = {
        status: 'committed',
        plan,
        ...applied,
        committedAt: new Date().toISOString(),
        serverVerified: true,
      };
      if (loseCommitResponse) throw new Error('connection dropped after commit');
      return Response.json({ ok: true, data: result });
    }
    return Response.json({ ok: true, data: result ?? { status: 'pending', plan } });
  });
  vi.stubGlobal('fetch', http);
  return {
    root,
    src,
    server,
    source,
    target,
    service,
    remove,
    http,
    runtime,
    archive,
    sourceDescriptor,
    loseResponse: () => {
      loseCommitResponse = true;
    },
    commits: () => commits,
    sync: () => server.backup(target.dbPath),
    dispose: async () => {
      src.close();
      server.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

it('recovers after a lost commit response, waits for actual local contents, and never repeats apply', async () => {
  const f = await fixture();
  try {
    const prepared = await f
      .service()
      .prepare({ requestId, sourceProfileId: sourceId, targetProfileId: targetId });
    expect(prepared.blockers).toEqual([]);
    const directory = path.join(f.root, 'shared/profiles/imports', targetId);
    expect(await readFile(path.join(directory, `${requestId}.json`), 'utf8')).not.toContain(
      'Travel',
    );
    expect(
      (await readFile(path.join(directory, `${requestId}.bin`))).includes(Buffer.from('Travel')),
    ).toBe(false);
    f.loseResponse();
    await expect(
      f.service().commit({ requestId, targetProfileId: targetId, deleteSource: false }),
    ).rejects.toThrow('connection dropped');
    const pending = await f.service().recover({ requestId, targetProfileId: targetId });
    expect(pending).toMatchObject({
      phase: 'committed',
      serverVerified: true,
      localVerified: false,
    });
    expect(f.commits()).toBe(1);
    await f.sync();
    expect(await f.service().recover({ requestId, targetProfileId: targetId })).toMatchObject({
      phase: 'verified',
      localVerified: true,
    });
    expect(f.commits()).toBe(1);
    expect(f.remove).not.toHaveBeenCalled();
    await access(f.source.dbPath);
  } finally {
    await f.dispose();
  }
});

it('refuses opted-in cleanup when the source changed after the snapshot', async () => {
  const f = await fixture();
  try {
    await f.service().prepare({ requestId, sourceProfileId: sourceId, targetProfileId: targetId });
    await f.service().commit({ requestId, targetProfileId: targetId, deleteSource: true });
    f.src.prepare("UPDATE labels SET name = 'Edited', normalized_name = 'edited'").run();
    await f.sync();
    expect(await f.service().recover({ requestId, targetProfileId: targetId })).toMatchObject({
      phase: 'verified',
      sourceUnchanged: false,
    });
    expect(f.remove).not.toHaveBeenCalled();
  } finally {
    await f.dispose();
  }
});

it('binds the encrypted snapshot to its source, target and request', async () => {
  const f = await fixture();
  try {
    await f.service().prepare({ requestId, sourceProfileId: sourceId, targetProfileId: targetId });
    const journal = new ProfileImportJournal(f.root, targetId);
    const entry = (await journal.load(requestId))!;
    const content = await journal.readSnapshot(entry, Buffer.alloc(32, 1));
    expect(profileImportDigest(JSON.parse(content))).toBe(entry.sourceDigest);
    await expect(
      journal.readSnapshot({ ...entry, sourceProfileId: targetId }, Buffer.alloc(32, 1)),
    ).rejects.toThrow();
  } finally {
    await f.dispose();
  }
});

it('cleans up only after server, local and unchanged-source verification all succeed', async () => {
  const f = await fixture();
  try {
    await f.service().prepare({ requestId, sourceProfileId: sourceId, targetProfileId: targetId });
    await f.service().commit({ requestId, targetProfileId: targetId, deleteSource: true });
    expect(f.remove).not.toHaveBeenCalled();
    await f.sync();
    expect(await f.service().recover({ requestId, targetProfileId: targetId })).toMatchObject({
      phase: 'completed',
      serverVerified: true,
      localVerified: true,
      sourceUnchanged: true,
    });
    expect(f.remove).toHaveBeenCalledExactlyOnceWith(sourceId);
    await expect(
      access(path.join(f.root, 'shared/profiles/imports', targetId, `${requestId}.bin`)),
    ).rejects.toThrow();
    await f.service().recover({ requestId, targetProfileId: targetId });
    expect(f.remove).toHaveBeenCalledTimes(1);
  } finally {
    await f.dispose();
  }
});

it.each(['reopened', 'changed-before-tombstone'] as const)(
  'retains a source that was %s before cleanup',
  async (change) => {
    const f = await fixture();
    try {
      await f
        .service()
        .prepare({ requestId, sourceProfileId: sourceId, targetProfileId: targetId });
      await f.service().commit({ requestId, targetProfileId: targetId, deleteSource: true });
      await f.sync();
      if (change === 'reopened') f.sourceDescriptor.lastActiveAt += 1;
      else {
        const journal = new ProfileImportJournal(f.root, targetId);
        await journal.save({ ...(await journal.load(requestId))!, phase: 'cleanup_pending' });
        f.src.prepare("UPDATE labels SET name = 'Changed', normalized_name = 'changed'").run();
      }
      expect(await f.service().recover({ requestId, targetProfileId: targetId })).toMatchObject({
        phase: 'verified',
        sourceUnchanged: false,
      });
      expect(f.remove).not.toHaveBeenCalled();
    } finally {
      await f.dispose();
    }
  },
);

it('consumes a new-account invitation once, before displaying it', async () => {
  const f = await fixture();
  try {
    await markProfileImportOpportunity(f.root, targetId, sourceId);
    expect(await f.service().consumePrompt(targetId)).toEqual({ sourceProfileId: sourceId });
    expect(await f.service().consumePrompt(targetId)).toBeNull();
  } finally {
    await f.dispose();
  }
});

it('requires selection when multiple local accounts contain business data and skips password-locked candidates', async () => {
  const f = await fixture();
  try {
    const secondId = 'p_333333333333333333333333';
    const profiles = await f.runtime.listProfiles();
    f.runtime.listProfiles = async () => [
      ...profiles,
      { ...f.sourceDescriptor, profileId: secondId },
    ];
    await markProfileImportOpportunity(f.root, targetId, sourceId);
    expect(await f.service().consumePrompt(targetId)).toEqual({ sourceProfileId: null });
    f.runtime.hasCredential = async (id?: string) => id === secondId;
    await markProfileImportOpportunity(f.root, targetId, sourceId);
    expect(await f.service().consumePrompt(targetId)).toEqual({ sourceProfileId: sourceId });
    f.runtime.hasCredential = async () => true;
    await markProfileImportOpportunity(f.root, targetId, sourceId);
    expect(await f.service().consumePrompt(targetId)).toBeNull();
  } finally {
    await f.dispose();
  }
});

it('invites remembered password-protected sources and skips unreadable remembered copies', async () => {
  const f = await fixture();
  try {
    f.runtime.hasCredential = async () => true;
    await markProfileImportOpportunity(f.root, targetId, sourceId);
    expect(await f.service().consumePrompt(targetId)).toBeNull();

    f.runtime.hasRememberedKey = async () => true;
    await markProfileImportOpportunity(f.root, targetId, sourceId);
    expect(await f.service().consumePrompt(targetId)).toEqual({ sourceProfileId: sourceId });

    f.runtime.withInactiveLocalAccount = async () => {
      throw new Error('SOURCE_PASSWORD_REQUIRED');
    };
    await markProfileImportOpportunity(f.root, targetId, sourceId);
    expect(await f.service().consumePrompt(targetId)).toBeNull();
  } finally {
    await f.dispose();
  }
});

it('does not invite a guest containing only account and default preferences', async () => {
  const f = await fixture();
  try {
    f.src.exec('DELETE FROM labels');
    await markProfileImportOpportunity(f.root, targetId, sourceId);
    expect(await f.service().consumePrompt(targetId)).toBeNull();
  } finally {
    await f.dispose();
  }
});

it('completes an epoch-and-cache-only local profile import to a registered target and removes its source after real manifest verification', async () => {
  const f = await fixture();
  const phases: Array<{ phase: string }> = [];
  const save = ProfileImportJournal.prototype.save;
  const journalSpy = vi
    .spyOn(ProfileImportJournal.prototype, 'save')
    .mockImplementation(async function (this: ProfileImportJournal, entry) {
      phases.push(JSON.parse(JSON.stringify(entry)));
      return save.call(this, entry);
    });
  await mkdir(path.join(f.source.storageDir, 'local-agents/model-catalog'), { recursive: true });
  const mastra = new Database(path.join(f.source.storageDir, 'mastra.db'));
  try {
    mastra.pragma('journal_mode = WAL');
    mastra.exec(`CREATE TABLE memoflow_goal_event_meta(id INTEGER PRIMARY KEY CHECK(id=1),epoch TEXT NOT NULL);
      INSERT INTO memoflow_goal_event_meta VALUES(1,'00000000-0000-4000-8000-000000000865');`);
    await writeFile(
      path.join(f.source.storageDir, 'local-agents/model-catalog', 'a'.repeat(64) + '.json'),
      '{"revision":1}',
    );
    f.remove.mockImplementation(async () => {
      mastra.close();
      f.src.close();
      await rm(f.source.profileDir, { recursive: true });
    });
    const prepared = await f
      .service()
      .prepare({ requestId, sourceProfileId: sourceId, targetProfileId: targetId });
    expect(prepared.blockers).toEqual([]);
    expect(
      await f.service().commit({ requestId, targetProfileId: targetId, deleteSource: true }),
    ).toMatchObject({ phase: 'committed', localVerified: false });
    expect(f.remove).not.toHaveBeenCalled();
    await f.sync();
    expect(await f.service().recover({ requestId, targetProfileId: targetId })).toMatchObject({
      phase: 'completed',
      serverVerified: true,
      localVerified: true,
      sourceUnchanged: true,
      blockers: [],
    });
    await expect(access(f.source.profileDir)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(f.remove).toHaveBeenCalledOnce();
    expect(phases.map((entry) => entry.phase)).toEqual(
      expect.arrayContaining([
        'prepared',
        'preflight',
        'committing',
        'committed',
        'verified',
        'cleanup_pending',
        'completed',
      ]),
    );
    if (process.env.VERIFY_865_DIR)
      await writeFile(
        path.join(process.env.VERIFY_865_DIR, 'service-journal-phases.json'),
        JSON.stringify(phases, null, 2),
      );
  } finally {
    journalSpy.mockRestore();
    if (mastra.open) mastra.close();
    await f.dispose();
  }
});

it('uploads the message archive before preflight and ignores the server-scoped manifest locally', async () => {
  const f = await fixture({ messages: true });
  try {
    const prepared = await f
      .service()
      .prepare({ requestId, sourceProfileId: sourceId, targetProfileId: targetId });
    expect(prepared.blockers).toEqual([]);
    expect(f.archive.manifest?.archive).toMatchObject({ threads: 1, messages: 2 });
    expect(f.archive.codec).toBe('ndjson+gzip');
    expect(f.archive.events).toEqual(['prepare', 'chunk:0', 'complete', 'preflight']);
    const committed = await f.service().commit({
      requestId,
      targetProfileId: targetId,
      deleteSource: false,
    });
    expect(committed).toMatchObject({
      phase: 'verified',
      localVerified: true,
      serverVerified: true,
    });
  } finally {
    await f.dispose();
  }
});
