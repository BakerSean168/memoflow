import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChokidarOptions, FSWatcher } from 'chokidar';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  KnowledgeRemoteBindingClientDTO,
  SyncKnowledgeRepositoryRes,
} from '@memoflow/contracts/repository';
import { fail, ok } from '@memoflow/contracts/result';
import {
  DesktopKnowledgeRepositoryAutoSyncScheduler,
  shouldIgnoreKnowledgeRepositoryWatchPath,
  type KnowledgeRepositoryAutoSyncLifecyclePort,
} from './desktop-knowledge-repository-auto-sync.scheduler';

const NOW = 1_750_000_000_000;
const HEAD = 'a'.repeat(40);

const SPACE_ID = 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440041' as never;
const BINDING_ID = 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440042' as never;

function connection(
  overrides: Partial<KnowledgeRemoteBindingClientDTO> = {},
): KnowledgeRemoteBindingClientDTO {
  const base: KnowledgeRemoteBindingClientDTO = {
    id: BINDING_ID,
    knowledgeSpaceId: SPACE_ID,
    identityId:
      'IdentityId_11111111-1111-4111-8111-111111111111' as KnowledgeRemoteBindingClientDTO['identityId'],
    provider: 'GitHub',
    installationId: 'installation-1',
    repositoryId: '987654321',
    repositoryFullNameSnapshot: 'owner/knowledge',
    connectedAt: NOW,
    disconnectedAt: null,
    observation: {
      bindingId: BINDING_ID,
      observedAt: NOW,
      accountId: '42',
      repositoryFullName: 'owner/knowledge',
      defaultBranch: 'main',
      private: true,
      archived: false,
      disabled: false,
      contentsPermission: 'write',
      installationSuspended: false,
      eligibility: { state: 'Ready' },
    },
    historyFence: {
      bindingId: BINDING_ID,
      defaultBranch: 'main',
      lastConfirmedRemoteHeadSha: HEAD,
      confirmedAt: NOW,
    },
    projectionCheckpoint: null,
  };
  return { ...base, ...overrides };
}

function synchronizationResult(
  currentConnection: KnowledgeRemoteBindingClientDTO = connection(),
): SyncKnowledgeRepositoryRes {
  return {
    connection: currentConnection,
    outcome: 'UpToDate',
    headSha: HEAD,
    localCommitCreated: false,
    remoteChangesApplied: false,
    pushed: false,
  };
}

class FakeWatcher {
  readonly close = vi.fn(async () => undefined);
  private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  on(eventName: string, listener: (...args: unknown[]) => void): this {
    const listeners = this.listeners.get(eventName) ?? [];
    listeners.push(listener);
    this.listeners.set(eventName, listeners);
    return this;
  }

  emit(eventName: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(eventName) ?? []) listener(...args);
  }
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

function createFixture(options?: {
  connections?: KnowledgeRemoteBindingClientDTO[];
  stateFilePath?: string;
}) {
  const watcher = new FakeWatcher();
  let watchOptions: ChokidarOptions | undefined;
  let onlineListener: (() => void) | null = null;
  let resumeListener: (() => void) | null = null;
  const removeOnlineListener = vi.fn();
  const removeResumeListener = vi.fn();
  const lifecycle: KnowledgeRepositoryAutoSyncLifecyclePort = {
    onNetworkOnline(listener) {
      onlineListener = listener;
      return removeOnlineListener;
    },
    onSystemResume(listener) {
      resumeListener = listener;
      return removeResumeListener;
    },
  };
  const localBindingId = 'LocalVaultBindingId_550e8400-e29b-41d4-a716-446655440040' as never;
  const localVault = {
    getBinding: vi.fn(async () => ({
      binding: {
        id: localBindingId,
        knowledgeSpaceId: SPACE_ID,
        localProfileId: 'p_auto_sync',
        rootPath: '/vault',
        displayName: 'Vault',
        boundAt: NOW,
        detachedAt: null,
      },
      health: {
        bindingId: localBindingId,
        state: 'Available' as const,
        observedAt: NOW,
        detail: null,
      },
    })),
  };
  const remote = {
    listKnowledgeRepositoryConnections: vi.fn(async () =>
      ok({ connections: options?.connections ?? [connection()] }),
    ),
  };
  const synchronization = {
    executeAutomatic: vi.fn(
      async (_identityId: string, currentConnection: KnowledgeRemoteBindingClientDTO) =>
        ok(synchronizationResult(currentConnection)),
    ),
    commitLocalChanges: vi.fn(async () =>
      ok({ connectionId: 'connection-1', headSha: HEAD, localCommitCreated: true }),
    ),
  };
  const scheduler = new DesktopKnowledgeRepositoryAutoSyncScheduler({
    localVault: localVault as never,
    remote,
    synchronization,
    lifecycle,
    debounceMs: 100,
    stabilityThresholdMs: 500,
    shutdownCommitTimeoutMs: 100,
    stateFilePath: options?.stateFilePath,
    watchFactory: (_rootPath, options) => {
      watchOptions = options;
      return watcher as unknown as FSWatcher;
    },
  });
  return {
    scheduler,
    watcher,
    localVault,
    remote,
    synchronization,
    getWatchOptions: () => watchOptions,
    emitOnline: () => onlineListener?.(),
    emitResume: () => resumeListener?.(),
    removeOnlineListener,
    removeResumeListener,
  };
}

describe('DesktopKnowledgeRepositoryAutoSyncScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts a stable-file watcher and synchronizes on profile activation', async () => {
    const fixture = createFixture();

    await fixture.scheduler.start('identity-1');
    await flushMicrotasks();

    expect(fixture.synchronization.executeAutomatic).toHaveBeenCalledWith(
      'identity-1',
      expect.objectContaining({ id: BINDING_ID }),
    );
    expect(fixture.getWatchOptions()).toMatchObject({
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 500 },
    });
    const ignored = fixture.getWatchOptions()?.ignored;
    expect(typeof ignored).toBe('function');
    expect((ignored as (candidatePath: string) => boolean)('/vault/.git/index')).toBe(true);
    expect((ignored as (candidatePath: string) => boolean)('/vault/notes/idea.md')).toBe(false);

    await fixture.scheduler.stop();
  });

  it('debounces a burst of stable file events into one synchronization', async () => {
    const fixture = createFixture();
    await fixture.scheduler.start('identity-1');
    await flushMicrotasks();
    fixture.synchronization.executeAutomatic.mockClear();

    fixture.watcher.emit('all', 'change', '/vault/notes/idea.md');
    await vi.advanceTimersByTimeAsync(75);
    fixture.watcher.emit('all', 'change', '/vault/notes/idea.md');
    await vi.advanceTimersByTimeAsync(99);
    expect(fixture.synchronization.executeAutomatic).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await flushMicrotasks();
    expect(fixture.synchronization.executeAutomatic).toHaveBeenCalledTimes(1);

    await fixture.scheduler.stop();
  });

  it('refreshes and synchronizes after network recovery and system resume', async () => {
    const fixture = createFixture();
    await fixture.scheduler.start('identity-1');
    await flushMicrotasks();
    fixture.synchronization.executeAutomatic.mockClear();
    fixture.remote.listKnowledgeRepositoryConnections.mockClear();

    fixture.emitOnline();
    await flushMicrotasks();
    fixture.emitResume();
    await flushMicrotasks();

    expect(fixture.remote.listKnowledgeRepositoryConnections).toHaveBeenCalledTimes(2);
    expect(fixture.synchronization.executeAutomatic).toHaveBeenCalledTimes(2);

    await fixture.scheduler.stop();
  });

  it('pauses automatic retries after a conflict until an explicit refresh', async () => {
    const fixture = createFixture();
    fixture.synchronization.executeAutomatic.mockResolvedValueOnce(
      fail({
        code: 'CONFLICT',
        message: 'resolve the preserved rebase',
        context: {
          localHeadSha: HEAD,
          remoteHeadSha: 'b'.repeat(40),
          conflictingPaths: ['notes/conflict.md'],
          rebaseInProgress: true,
        },
      }),
    );
    await fixture.scheduler.start('identity-1');
    await flushMicrotasks();

    fixture.watcher.emit('all', 'change', '/vault/notes/conflict.md');
    await vi.advanceTimersByTimeAsync(100);
    fixture.emitOnline();
    await flushMicrotasks();
    expect(fixture.synchronization.executeAutomatic).toHaveBeenCalledTimes(1);

    await fixture.scheduler.refresh('identity-1');
    fixture.watcher.emit('all', 'change', '/vault/notes/resolved.md');
    await vi.advanceTimersByTimeAsync(100);
    await flushMicrotasks();
    expect(fixture.synchronization.executeAutomatic).toHaveBeenCalledTimes(2);

    await fixture.scheduler.stop();
  });

  it('refreshes and stops watching when the token endpoint reports a lifecycle suspension', async () => {
    const fixture = createFixture();
    fixture.remote.listKnowledgeRepositoryConnections
      .mockResolvedValueOnce(ok({ connections: [connection()] }))
      .mockResolvedValueOnce(
        ok({
          connections: [
            connection({
              observation: {
                ...connection().observation!,
                archived: true,
                eligibility: { state: 'Blocked', reason: 'RepositoryArchived' },
              },
            }),
          ],
        }),
      );
    fixture.synchronization.executeAutomatic.mockResolvedValueOnce(
      fail({
        code: 'FORBIDDEN',
        message: 'repository archived',
        context: { remoteRepositoryBlockReason: 'RepositoryArchived' },
      }),
    );

    await fixture.scheduler.start('identity-1');
    await flushMicrotasks();

    expect(fixture.remote.listKnowledgeRepositoryConnections).toHaveBeenCalledTimes(2);
    expect(fixture.watcher.close).toHaveBeenCalledOnce();
    fixture.watcher.emit('all', 'change', '/vault/notes/after-archive.md');
    await vi.advanceTimersByTimeAsync(100);
    expect(fixture.synchronization.executeAutomatic).toHaveBeenCalledOnce();

    await fixture.scheduler.stop();
  });

  it('closes lifecycle resources and creates a bounded local-only commit on stop', async () => {
    const fixture = createFixture();
    await fixture.scheduler.start('identity-1');
    await flushMicrotasks();

    await fixture.scheduler.stop({ commitPendingChanges: true });

    expect(fixture.watcher.close).toHaveBeenCalledOnce();
    expect(fixture.removeOnlineListener).toHaveBeenCalledOnce();
    expect(fixture.removeResumeListener).toHaveBeenCalledOnce();
    expect(fixture.synchronization.commitLocalChanges).toHaveBeenLastCalledWith(
      'identity-1',
      expect.objectContaining({
        id: BINDING_ID,
        historyFence: expect.objectContaining({ lastConfirmedRemoteHeadSha: HEAD }),
      }),
    );
    expect(fixture.synchronization.commitLocalChanges).toHaveBeenCalledOnce();
    expect(fixture.remote.listKnowledgeRepositoryConnections).toHaveBeenCalledOnce();
  });

  it('does not watch an ambiguous Vault with multiple reconciled connections', async () => {
    const fixture = createFixture({
      connections: [
        connection(),
        connection({
          id: 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440043' as never,
          repositoryId: '2',
          observation: {
            ...connection().observation!,
            bindingId: 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440043' as never,
          },
          historyFence: {
            ...connection().historyFence!,
            bindingId: 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440043' as never,
          },
        }),
      ],
    });

    await fixture.scheduler.start('identity-1');
    await flushMicrotasks();

    expect(fixture.getWatchOptions()).toBeUndefined();
    expect(fixture.synchronization.executeAutomatic).not.toHaveBeenCalled();
    await fixture.scheduler.stop();
  });

  it('restores the reconciled connection cache when startup cannot reach the server', async () => {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'auto-sync-state-'));
    const stateFilePath = path.join(directory, 'state.json');
    const cached = connection();
    await fs.promises.writeFile(
      stateFilePath,
      JSON.stringify({ schemaVersion: 2, connection: cached }),
      'utf8',
    );
    const fixture = createFixture({ stateFilePath });
    fixture.remote.listKnowledgeRepositoryConnections.mockResolvedValueOnce(
      fail({ code: 'SERVICE_UNAVAILABLE', message: 'offline' }),
    );

    await fixture.scheduler.start(String(cached.identityId));
    await flushMicrotasks();

    expect(fixture.getWatchOptions()).toBeDefined();
    expect(fixture.synchronization.executeAutomatic).toHaveBeenCalledWith(
      String(cached.identityId),
      expect.objectContaining({
        id: cached.id,
        historyFence: expect.objectContaining({ lastConfirmedRemoteHeadSha: HEAD }),
      }),
    );

    await fixture.scheduler.stop();
    await fs.promises.rm(directory, { recursive: true, force: true });
  });
});

describe('shouldIgnoreKnowledgeRepositoryWatchPath', () => {
  it('ignores Git, Obsidian, trash, MemoFlow state, and temporary files', () => {
    const rootPath = path.resolve('/vault');

    expect(shouldIgnoreKnowledgeRepositoryWatchPath(rootPath, path.join(rootPath, '.git'))).toBe(
      true,
    );
    expect(
      shouldIgnoreKnowledgeRepositoryWatchPath(
        rootPath,
        path.join(rootPath, '.obsidian', 'workspace.json'),
      ),
    ).toBe(true);
    expect(
      shouldIgnoreKnowledgeRepositoryWatchPath(rootPath, path.join(rootPath, '.trash', 'old.md')),
    ).toBe(true);
    expect(
      shouldIgnoreKnowledgeRepositoryWatchPath(
        rootPath,
        path.join(rootPath, '.memory-flow', 'repository.json'),
      ),
    ).toBe(true);
    expect(
      shouldIgnoreKnowledgeRepositoryWatchPath(rootPath, path.join(rootPath, 'notes', 'idea.md~')),
    ).toBe(true);
    expect(
      shouldIgnoreKnowledgeRepositoryWatchPath(rootPath, path.join(rootPath, 'notes', 'idea.md')),
    ).toBe(false);
  });
});
