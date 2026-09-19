import { describe, expect, it, vi } from 'vitest';
import type {
  GitHubInstallationRepositoryDTO,
  KnowledgeProjectionCheckpoint,
  KnowledgeRemoteBindingServerDTO,
  RemoteHistoryFence,
  RemoteRepositoryObservation,
} from '@memoflow/contracts/repository';
import type {
  IKnowledgeProjectionCheckpointRepository,
  IKnowledgeRemoteBindingRepository,
  IKnowledgeSpaceRepository,
  IRemoteHistoryFenceRepository,
  IRemoteRepositoryObservationRepository,
} from '../ports/knowledge-remote-binding.repositories';
import type { IKnowledgeRepositoryCloudDataPurger } from '../ports/knowledge-repository-cloud-data-purger.port';
import {
  GitHubAppClientFailureError,
  type GitHubAppInstallationInventory,
  type IGitHubAppClient,
} from '../ports/github-app-client.port';
import { InMemoryKnowledgeRepositoryInstallationIntentRepository } from '../../infrastructure/services/in-memory-knowledge-repository-installation-intent.repository';
import { KnowledgeRepositoryConnectionService } from './knowledge-repository-connection.service';

const SERVICE_NOW = 1_750_000_000_000;
const DESKTOP_SPACE = 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440001' as never;

class MemoryKnowledgeSpaceRepository implements IKnowledgeSpaceRepository {
  readonly ids = new Set<string>();
  readonly ensure = vi.fn(async (id: string) => {
    this.ids.add(id);
  });
}

class MemoryBindingRepository implements IKnowledgeRemoteBindingRepository {
  readonly rows = new Map<string, KnowledgeRemoteBindingServerDTO>();
  readonly save = vi.fn(async (binding: KnowledgeRemoteBindingServerDTO) => {
    const existing = this.rows.get(binding.id);
    if (existing && existing.identityId !== binding.identityId) {
      throw new Error('Knowledge remote binding not found for the current identity.');
    }
    this.rows.set(binding.id, binding);
  });
  readonly markDisconnected = vi.fn(
    async (identityId: string, id: string, disconnectedAt: number) => {
      const row = this.rows.get(id);
      if (!row || row.identityId !== identityId || row.disconnectedAt !== null) return false;
      this.rows.set(id, { ...row, disconnectedAt, version: row.version + 1 });
      return true;
    },
  );

  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async findByIdForIdentity(identityId: string, id: string) {
    const row = this.rows.get(id);
    return row?.identityId === identityId ? row : null;
  }
  async findByIdentityId(identityId: string) {
    return [...this.rows.values()].filter((row) => row.identityId === identityId);
  }
  async findByRepositoryId(repositoryId: string) {
    return [...this.rows.values()].find((row) => row.repositoryId === repositoryId) ?? null;
  }
  async findByInstallationAndRepositoryId(installationId: string, repositoryId: string) {
    return (
      [...this.rows.values()].find(
        (row) =>
          row.installationId === installationId &&
          row.repositoryId === repositoryId &&
          row.disconnectedAt === null,
      ) ?? null
    );
  }
  async listProjectionCandidates(limit: number, cursor?: { connectedAt: number; id: string }) {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.disconnectedAt === null &&
          (!cursor ||
            row.connectedAt > cursor.connectedAt ||
            (row.connectedAt === cursor.connectedAt && row.id > cursor.id)),
      )
      .sort((a, b) => a.connectedAt - b.connectedAt || a.id.localeCompare(b.id))
      .slice(0, limit);
  }
}

class MemoryObservationRepository implements IRemoteRepositoryObservationRepository {
  readonly rows = new Map<string, RemoteRepositoryObservation>();
  readonly save = vi.fn(async (row: RemoteRepositoryObservation) => {
    this.rows.set(row.bindingId, structuredClone(row));
  });
  async findByBindingId(bindingId: string) {
    return this.rows.get(bindingId) ?? null;
  }
  async findByBindingIds(bindingIds: readonly string[]) {
    return new Map(
      bindingIds.flatMap((id) => (this.rows.has(id) ? [[id, this.rows.get(id)!] as const] : [])),
    );
  }
}

class MemoryHistoryFenceRepository implements IRemoteHistoryFenceRepository {
  readonly rows = new Map<string, RemoteHistoryFence>();
  readonly save = vi.fn(async (row: RemoteHistoryFence) => {
    this.rows.set(row.bindingId, structuredClone(row));
  });
  async findByBindingId(bindingId: string) {
    return this.rows.get(bindingId) ?? null;
  }
  async findByBindingIds(bindingIds: readonly string[]) {
    return new Map(
      bindingIds.flatMap((id) => (this.rows.has(id) ? [[id, this.rows.get(id)!] as const] : [])),
    );
  }
}

class MemoryProjectionCheckpointRepository implements IKnowledgeProjectionCheckpointRepository {
  readonly rows = new Map<string, KnowledgeProjectionCheckpoint>();
  readonly save = vi.fn(async (row: KnowledgeProjectionCheckpoint) => {
    this.rows.set(row.bindingId, structuredClone(row));
  });
  async findByBindingId(bindingId: string) {
    return this.rows.get(bindingId) ?? null;
  }
  async findByBindingIds(bindingIds: readonly string[]) {
    return new Map(
      bindingIds.flatMap((id) => (this.rows.has(id) ? [[id, this.rows.get(id)!] as const] : [])),
    );
  }
}

function createGithubClient(overrides: Partial<IGitHubAppClient> = {}): IGitHubAppClient {
  return {
    getInstallationInventory: vi.fn(async () => installationInventory()),
    createInstallationAccessToken: vi.fn(async () => ({
      token: 'short-lived-token',
      expiresAt: 1_750_000_300_000,
    })),
    getRepositorySnapshot: vi.fn(async () => ({
      repositoryId: 'repository-1',
      defaultBranch: 'main',
      empty: false,
      headSha: 'remote-head-sha',
    })),
    getMarkdownChanges: vi.fn(),
    getFullMarkdownSnapshot: vi.fn(),
    getBlob: vi.fn(),
    createFileCommit: vi.fn(),
    ...overrides,
  };
}

function installationInventory(
  repositoryPatch: Partial<GitHubInstallationRepositoryDTO> = {},
  inventoryPatch: Partial<GitHubAppInstallationInventory> = {},
): GitHubAppInstallationInventory {
  return {
    installationId: 'installation-1',
    accountId: 'github-account-1',
    contentsPermission: 'write',
    suspended: false,
    repositories: [
      {
        id: 'repository-1',
        nodeId: 'R_1',
        fullName: 'owner/knowledge',
        ownerId: 'github-account-1',
        private: true,
        archived: false,
        disabled: false,
        defaultBranch: 'main',
        permissions: { admin: true, push: true, pull: true },
        ...repositoryPatch,
      },
    ],
    ...inventoryPatch,
  };
}

function createService(
  github = createGithubClient(),
  cloudDataPurger?: IKnowledgeRepositoryCloudDataPurger,
  now: () => number = () => SERVICE_NOW,
) {
  const knowledgeSpaceRepository = new MemoryKnowledgeSpaceRepository();
  const bindingRepository = new MemoryBindingRepository();
  const observationRepository = new MemoryObservationRepository();
  const historyFenceRepository = new MemoryHistoryFenceRepository();
  const projectionCheckpointRepository = new MemoryProjectionCheckpointRepository();
  const installationIntentRepository =
    new InMemoryKnowledgeRepositoryInstallationIntentRepository();
  const service = new KnowledgeRepositoryConnectionService({
    appSlug: 'memoflow-test',
    knowledgeSpaceRepository,
    bindingRepository,
    observationRepository,
    historyFenceRepository,
    projectionCheckpointRepository,
    bindingWriteTransactionRunner: {
      run: (work) =>
        work({
          knowledgeSpaceRepository,
          bindingRepository,
          observationRepository,
          historyFenceRepository,
          projectionCheckpointRepository,
          installationIntentRepository,
        }),
    },
    githubAppClient: github,
    installationIntentRepository,
    installationRouting: {
      routeKey: 'dev',
      webOrigin: 'https://app.example.test',
      routeTargets: { staging: 'https://staging-api.example.test' },
    },
    cloudDataPurger,
    now,
  });
  return {
    service,
    github,
    knowledgeSpaceRepository,
    bindingRepository,
    observationRepository,
    historyFenceRepository,
    projectionCheckpointRepository,
    installationIntentRepository,
  };
}

async function completeInstallation(
  service: KnowledgeRepositoryConnectionService,
  identityId = 'identity-1',
  clientKind: 'web' | 'desktop' = 'web',
) {
  const started = await service.startInstallation(identityId, {
    clientKind,
    returnUrl: 'https://app.example.test/settings/repository',
  });
  if (!started.ok) throw new Error('expected installation URL');
  const state = new URL(started.data.installationUrl).searchParams.get('state')!;
  return service.completeInstallation(identityId, {
    state,
    installationId: 'installation-1',
    setupAction: 'install',
  });
}

describe('KnowledgeRepositoryConnectionService', () => {
  it('issues a durable identity-bound installation state without letting another identity consume it', async () => {
    const { service } = createService();
    const started = await service.startInstallation('identity-1', {
      returnUrl: 'https://app.example.test/settings/repository',
    });
    if (!started.ok) throw new Error('expected ok');
    expect(started.data.intentId).toMatch(/^knowledge-install-intent-/);
    expect(started.data.installationUrl).toContain(
      'https://github.com/apps/memoflow-test/installations/new?state=mfi1.dev.',
    );
    const state = new URL(started.data.installationUrl).searchParams.get('state')!;

    await expect(
      service.completeInstallation('identity-2', {
        state,
        installationId: 'installation-1',
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    await expect(
      service.completeInstallation('identity-1', {
        state,
        installationId: 'installation-1',
      }),
    ).resolves.toMatchObject({ ok: true, data: { installationId: 'installation-1' } });
  });

  it('records a public setup callback but refuses connect until the original identity finalizes', async () => {
    const { service } = createService();
    const started = await service.startInstallation('identity-1', {
      clientKind: 'web',
      returnUrl: 'https://app.example.test/settings?tab=repository',
    });
    if (!started.ok) throw new Error('expected ok');
    const state = new URL(started.data.installationUrl).searchParams.get('state')!;

    const setup = await service.receiveInstallationSetup({
      state,
      installationId: 'installation-1',
      setupAction: 'install',
    });
    expect(setup).toMatchObject({
      ok: true,
      data: {
        kind: 'web',
        intentId: started.data.intentId,
        location: expect.stringContaining(`installation_intent=${started.data.intentId}`),
      },
    });

    await expect(
      service.connect('identity-1', {
        installationId: 'installation-1',
        githubRepositoryId: 'repository-1',
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });

    await expect(
      service.finalizeInstallationIntent('identity-2', started.data.intentId),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    await expect(
      service.finalizeInstallationIntent('identity-1', started.data.intentId),
    ).resolves.toMatchObject({ ok: true, data: { installationId: 'installation-1' } });
    await expect(
      service.connect('identity-1', {
        installationId: 'installation-1',
        githubRepositoryId: 'repository-1',
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it('resumes a recent verified Desktop callback after TTL without requiring another GitHub update', async () => {
    let now = SERVICE_NOW;
    const github = createGithubClient();
    const { service } = createService(github, undefined, () => now);
    const started = await service.startInstallation('identity-1', { clientKind: 'desktop' });
    if (!started.ok) throw new Error('expected ok');
    const state = new URL(started.data.installationUrl).searchParams.get('state')!;

    now += 1_000;
    await expect(
      service.receiveInstallationSetup({
        state,
        installationId: 'installation-1',
        setupAction: 'update',
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { kind: 'desktop', intentId: started.data.intentId },
    });

    now = SERVICE_NOW + 2 * 60 * 60 * 1_000;
    await expect(
      service.getInstallationIntentStatus('identity-1', started.data.intentId),
    ).resolves.toMatchObject({ ok: true, data: { status: 'Expired' } });

    const retried = await service.startInstallation('identity-1', { clientKind: 'desktop' });
    expect(retried).toMatchObject({
      ok: true,
      data: {
        intentId: started.data.intentId,
        requiresExternalBrowser: false,
        expiresAt: now + 10 * 60 * 1_000,
      },
    });
    if (!retried.ok) throw new Error('expected retry');
    expect(new URL(retried.data.installationUrl).searchParams.has('state')).toBe(false);
    expect(github.getInstallationInventory).toHaveBeenCalledWith('installation-1');

    await expect(
      service.getInstallationIntentStatus('identity-1', started.data.intentId),
    ).resolves.toMatchObject({ ok: true, data: { status: 'CallbackReceived' } });
    await expect(
      service.finalizeInstallationIntent('identity-1', started.data.intentId),
    ).resolves.toMatchObject({
      ok: true,
      data: { installationId: 'installation-1', githubAccountId: 'github-account-1' },
    });
  });

  it('does not recover a verified callback outside the bounded retry window', async () => {
    let now = SERVICE_NOW;
    const { service } = createService(createGithubClient(), undefined, () => now);
    const started = await service.startInstallation('identity-1', { clientKind: 'desktop' });
    if (!started.ok) throw new Error('expected ok');
    const state = new URL(started.data.installationUrl).searchParams.get('state')!;
    now += 1_000;
    await service.receiveInstallationSetup({
      state,
      installationId: 'installation-1',
      setupAction: 'install',
    });

    now = SERVICE_NOW + 24 * 60 * 60 * 1_000 + 2_000;
    const retried = await service.startInstallation('identity-1', { clientKind: 'desktop' });
    expect(retried).toMatchObject({
      ok: true,
      data: { requiresExternalBrowser: true },
    });
    if (!retried.ok) throw new Error('expected retry');
    expect(retried.data.intentId).not.toBe(started.data.intentId);
    expect(new URL(retried.data.installationUrl).searchParams.has('state')).toBe(true);
  });

  it('refuses verified retry when the GitHub installation account has drifted', async () => {
    let now = SERVICE_NOW;
    const github = createGithubClient();
    const { service } = createService(github, undefined, () => now);
    const started = await service.startInstallation('identity-1', { clientKind: 'desktop' });
    if (!started.ok) throw new Error('expected ok');
    const state = new URL(started.data.installationUrl).searchParams.get('state')!;
    now += 1_000;
    await service.receiveInstallationSetup({
      state,
      installationId: 'installation-1',
      setupAction: 'install',
    });

    vi.mocked(github.getInstallationInventory).mockResolvedValue(
      installationInventory({}, { accountId: 'github-account-other' }),
    );
    now = SERVICE_NOW + 2 * 60 * 60 * 1_000;
    const retried = await service.startInstallation('identity-1', { clientKind: 'desktop' });
    expect(retried).toMatchObject({ ok: true, data: { requiresExternalBrowser: true } });
    if (!retried.ok) throw new Error('expected retry');
    expect(retried.data.intentId).not.toBe(started.data.intentId);
  });

  it('falls back to a fresh browser flow when the previously verified installation was removed', async () => {
    let now = SERVICE_NOW;
    const github = createGithubClient();
    const { service } = createService(github, undefined, () => now);
    const started = await service.startInstallation('identity-1', { clientKind: 'desktop' });
    if (!started.ok) throw new Error('expected ok');
    const state = new URL(started.data.installationUrl).searchParams.get('state')!;
    now += 1_000;
    await service.receiveInstallationSetup({
      state,
      installationId: 'installation-1',
      setupAction: 'install',
    });

    vi.mocked(github.getInstallationInventory).mockRejectedValue(
      new GitHubAppClientFailureError({ kind: 'not_found' }, 'installation removed'),
    );
    now = SERVICE_NOW + 2 * 60 * 60 * 1_000;
    const retried = await service.startInstallation('identity-1', { clientKind: 'desktop' });
    expect(retried).toMatchObject({ ok: true, data: { requiresExternalBrowser: true } });
    if (!retried.ok) throw new Error('expected fresh flow');
    expect(retried.data.intentId).not.toBe(started.data.intentId);
  });

  it('fails closed when verified-installation revalidation is temporarily unavailable', async () => {
    let now = SERVICE_NOW;
    const github = createGithubClient();
    const { service } = createService(github, undefined, () => now);
    const started = await service.startInstallation('identity-1', { clientKind: 'desktop' });
    if (!started.ok) throw new Error('expected ok');
    const state = new URL(started.data.installationUrl).searchParams.get('state')!;
    now += 1_000;
    await service.receiveInstallationSetup({
      state,
      installationId: 'installation-1',
      setupAction: 'install',
    });

    vi.mocked(github.getInstallationInventory).mockRejectedValue(
      new GitHubAppClientFailureError({ kind: 'unavailable' }, 'GitHub unavailable'),
    );
    now = SERVICE_NOW + 2 * 60 * 60 * 1_000;
    await expect(
      service.startInstallation('identity-1', { clientKind: 'desktop' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
  });

  it('routes a foreign environment setup only through the configured API allowlist', async () => {
    const github = createGithubClient();
    const { service } = createService(github);
    const foreignState =
      'mfi1.staging.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';

    await expect(
      service.receiveInstallationSetup({
        state: foreignState,
        installationId: 'installation-9',
        setupAction: 'update',
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        kind: 'redirect',
        location: expect.stringContaining(
          'https://staging-api.example.test/api/v1/repositories/knowledge-connections/installations/setup?',
        ),
      },
    });
    expect(github.getInstallationInventory).not.toHaveBeenCalled();

    const unknownState = foreignState.replace('mfi1.staging.', 'mfi1.preview.');
    await expect(
      service.receiveInstallationSetup({ state: unknownState, installationId: 'installation-9' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('rejects an installation return URL outside the configured MemoFlow Web origin', async () => {
    const { service } = createService();
    await expect(
      service.startInstallation('identity-1', {
        returnUrl: 'https://evil.example/settings?tab=repository',
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('returns only the inventory revalidated through the GitHub App', async () => {
    const { service, github } = createService();
    const completed = await completeInstallation(service);

    expect(completed).toMatchObject({
      ok: true,
      data: {
        installationId: 'installation-1',
        githubAccountId: 'github-account-1',
        returnUrl: 'https://app.example.test/settings/repository',
        repositories: [{ id: 'repository-1', private: true }],
      },
    });
    expect(github.getInstallationInventory).toHaveBeenCalledWith('installation-1');
  });

  it('connects a Web repository into a server-created KnowledgeSpace and never exposes a token', async () => {
    const { service, bindingRepository, knowledgeSpaceRepository } = createService();
    await completeInstallation(service);
    const connected = await service.connect('identity-1', {
      installationId: 'installation-1',
      githubRepositoryId: 'repository-1',
    });
    expect(connected).toMatchObject({
      ok: true,
      data: {
        provider: 'GitHub',
        repositoryId: 'repository-1',
        repositoryFullNameSnapshot: 'owner/knowledge',
        disconnectedAt: null,
        observation: { eligibility: { state: 'Ready' } },
        historyFence: null,
        projectionCheckpoint: { state: 'Lagging' },
      },
    });
    if (!connected.ok) throw new Error('expected connection');
    expect(String(connected.data.knowledgeSpaceId)).toMatch(/^KnowledgeSpaceId_/);
    expect(knowledgeSpaceRepository.ids.has(connected.data.knowledgeSpaceId)).toBe(true);
    expect(bindingRepository.rows.size).toBe(1);
    expect(JSON.stringify(connected)).not.toContain('short-lived-token');
  });

  it('requires Desktop to bind the exact Local Vault KnowledgeSpace and Web to omit device-local space', async () => {
    const desktop = createService();
    await completeInstallation(desktop.service, 'identity-1', 'desktop');
    await expect(
      desktop.service.connect('identity-1', {
        installationId: 'installation-1',
        githubRepositoryId: 'repository-1',
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    const connected = await desktop.service.connect('identity-1', {
      installationId: 'installation-1',
      githubRepositoryId: 'repository-1',
      knowledgeSpaceId: DESKTOP_SPACE,
    });
    expect(connected).toMatchObject({ ok: true, data: { knowledgeSpaceId: DESKTOP_SPACE } });

    const web = createService();
    await completeInstallation(web.service);
    await expect(
      web.service.connect('identity-1', {
        installationId: 'installation-1',
        githubRepositoryId: 'repository-1',
        knowledgeSpaceId: DESKTOP_SPACE,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('lists only persisted four-axis state without GitHub I/O or mutation', async () => {
    const { service, github, bindingRepository, observationRepository } = createService();
    await completeInstallation(service);
    const connected = await service.connect('identity-1', {
      installationId: 'installation-1',
      githubRepositoryId: 'repository-1',
    });
    if (!connected.ok) throw new Error('expected connection');
    vi.clearAllMocks();
    const beforeBinding = structuredClone(bindingRepository.rows.get(connected.data.id));
    const beforeObservation = structuredClone(observationRepository.rows.get(connected.data.id));

    await expect(service.list('identity-1')).resolves.toMatchObject({
      ok: true,
      data: { connections: [{ id: connected.data.id, observation: beforeObservation }] },
    });
    expect(github.getInstallationInventory).not.toHaveBeenCalled();
    expect(bindingRepository.save).not.toHaveBeenCalled();
    expect(observationRepository.save).not.toHaveBeenCalled();
    expect(bindingRepository.rows.get(connected.data.id)).toEqual(beforeBinding);
  });

  it('refreshes provider rename metadata only in Observation, never in durable Binding', async () => {
    const { service, github, bindingRepository } = createService();
    await completeInstallation(service);
    const connected = await service.connect('identity-1', {
      installationId: 'installation-1',
      githubRepositoryId: 'repository-1',
    });
    if (!connected.ok) throw new Error('expected connection');
    const bindingBefore = structuredClone(bindingRepository.rows.get(connected.data.id));
    vi.mocked(github.getInstallationInventory).mockResolvedValueOnce(
      installationInventory({ fullName: 'owner/renamed-knowledge' }),
    );

    await expect(
      service.refreshObservation('identity-1', connected.data.id),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        repositoryFullNameSnapshot: 'owner/knowledge',
        observation: {
          repositoryFullName: 'owner/renamed-knowledge',
          eligibility: { state: 'Ready' },
        },
      },
    });
    expect(bindingRepository.rows.get(connected.data.id)).toEqual(bindingBefore);
  });

  it('provider loss blocks Observation but never disconnects the durable binding', async () => {
    const { service, github, bindingRepository } = createService();
    await completeInstallation(service);
    const connected = await service.connect('identity-1', {
      installationId: 'installation-1',
      githubRepositoryId: 'repository-1',
    });
    if (!connected.ok) throw new Error('expected connection');
    vi.mocked(github.getInstallationInventory).mockRejectedValueOnce(
      new GitHubAppClientFailureError({ kind: 'not_found' }, 'installation removed'),
    );

    await expect(
      service.refreshObservation('identity-1', connected.data.id),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        disconnectedAt: null,
        observation: { eligibility: { state: 'Blocked', reason: 'InstallationMissing' } },
      },
    });
    expect(bindingRepository.rows.get(connected.data.id)?.disconnectedAt).toBeNull();
  });

  it('default-branch drift blocks Observation until confirmHead establishes a new history fence', async () => {
    const { service, github } = createService();
    await completeInstallation(service);
    const connected = await service.connect('identity-1', {
      installationId: 'installation-1',
      githubRepositoryId: 'repository-1',
    });
    if (!connected.ok) throw new Error('expected connection');
    vi.mocked(github.getRepositorySnapshot).mockResolvedValueOnce({
      repositoryId: 'repository-1',
      defaultBranch: 'main',
      empty: false,
      headSha: 'a'.repeat(40),
    });
    const initial = await service.confirmHead('identity-1', connected.data.id, {
      headSha: 'a'.repeat(40),
    });
    expect(initial).toMatchObject({ ok: true, data: { historyFence: { defaultBranch: 'main' } } });

    vi.mocked(github.getInstallationInventory).mockResolvedValue(
      installationInventory({ defaultBranch: 'trunk' }),
    );
    await expect(
      service.refreshObservation('identity-1', connected.data.id),
    ).resolves.toMatchObject({
      ok: true,
      data: { observation: { eligibility: { state: 'Blocked', reason: 'DefaultBranchChanged' } } },
    });
    vi.mocked(github.getRepositorySnapshot).mockResolvedValueOnce({
      repositoryId: 'repository-1',
      defaultBranch: 'trunk',
      empty: false,
      headSha: 'b'.repeat(40),
    });
    await expect(
      service.confirmHead('identity-1', connected.data.id, { headSha: 'b'.repeat(40) }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        historyFence: { defaultBranch: 'trunk', lastConfirmedRemoteHeadSha: 'b'.repeat(40) },
        observation: { eligibility: { state: 'Ready' }, defaultBranch: 'trunk' },
        projectionCheckpoint: { branch: 'trunk', state: 'Lagging', projectedCommitSha: null },
      },
    });
  });

  it('revalidates provider state before issuing a repository-scoped Desktop token', async () => {
    const { service, github } = createService();
    await completeInstallation(service);
    const connected = await service.connect('identity-1', {
      installationId: 'installation-1',
      githubRepositoryId: 'repository-1',
    });
    if (!connected.ok) throw new Error('expected connection');
    vi.mocked(github.getInstallationInventory).mockResolvedValueOnce(
      installationInventory({ archived: true }),
    );
    await expect(
      service.issueInstallationToken('identity-1', connected.data.id),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN', context: { remoteRepositoryBlockReason: 'RepositoryArchived' } },
    });
    expect(github.createInstallationAccessToken).not.toHaveBeenCalled();
  });

  it('disconnect mutates only binding lifecycle while explicit purge remains opt-in', async () => {
    const cloudDataPurger = { purge: vi.fn(async () => true) };
    const { service, bindingRepository } = createService(createGithubClient(), cloudDataPurger);
    await completeInstallation(service);
    const connected = await service.connect('identity-1', {
      installationId: 'installation-1',
      githubRepositoryId: 'repository-1',
    });
    if (!connected.ok) throw new Error('expected connection');
    await expect(service.disconnect('identity-1', connected.data.id)).resolves.toEqual({
      ok: true,
      data: null,
    });
    expect(bindingRepository.rows.get(connected.data.id)?.disconnectedAt).toBe(SERVICE_NOW);
    expect(cloudDataPurger.purge).not.toHaveBeenCalled();
  });

  it('rejects repositories that are public, archived, or not writable', async () => {
    for (const inventory of [
      installationInventory({ private: false }),
      installationInventory({ archived: true }),
      installationInventory({ permissions: { admin: false, push: false, pull: true } }),
    ]) {
      const github = createGithubClient({ getInstallationInventory: vi.fn(async () => inventory) });
      const { service } = createService(github);
      await completeInstallation(service);
      await expect(
        service.connect('identity-1', {
          installationId: 'installation-1',
          githubRepositoryId: 'repository-1',
        }),
      ).resolves.toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    }
  });
});
