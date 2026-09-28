import { describe, expect, it } from 'vitest';
import { InMemoryKnowledgeRepositoryInstallationIntentRepository } from '../../infrastructure/services/in-memory-knowledge-repository-installation-intent.repository';
import {
  createKnowledgeRepositoryInstallationState,
  hashKnowledgeRepositoryInstallationState,
  parseKnowledgeRepositoryInstallationStateRouteKey,
} from './knowledge-repository-installation-state';

const NOW = 1_775_000_000_000;

async function createIntent(
  repository: InMemoryKnowledgeRepositoryInstallationIntentRepository,
  options: {
    identityId?: string;
    expiresAt?: number;
    clientKind?: 'web' | 'desktop';
  } = {},
) {
  const state = createKnowledgeRepositoryInstallationState('staging');
  await repository.create({
    id: 'intent-1',
    identityId: options.identityId ?? 'identity-1',
    stateHash: state.stateHash,
    routeKey: 'staging',
    clientKind: options.clientKind ?? 'desktop',
    returnPath: '/settings?tab=repository',
    expiresAt: options.expiresAt ?? NOW + 600_000,
    createdAt: NOW,
  });
  return state;
}

describe('knowledge repository installation intent', () => {
  it('uses a versioned route envelope while persisting only a sha256 state hash', async () => {
    const repository = new InMemoryKnowledgeRepositoryInstallationIntentRepository();
    const state = await createIntent(repository);

    expect(state.state).toMatch(/^mfi1\.staging\.[A-Za-z0-9_-]{32,}$/);
    expect(parseKnowledgeRepositoryInstallationStateRouteKey(state.state)).toBe('staging');
    expect(hashKnowledgeRepositoryInstallationState(state.state)).toBe(state.stateHash);
    expect(state.stateHash).not.toContain(state.state);

    const stored = await repository.findByStateHash(state.stateHash);
    expect(stored).toMatchObject({
      identityId: 'identity-1',
      routeKey: 'staging',
      status: 'Pending',
    });
    expect(JSON.stringify(stored)).not.toContain(state.state);
  });

  it('records the same callback idempotently and rejects a conflicting installation id', async () => {
    const repository = new InMemoryKnowledgeRepositoryInstallationIntentRepository();
    const state = await createIntent(repository);

    await expect(
      repository.recordCallback({
        stateHash: state.stateHash,
        installationId: 'installation-1',
        providerAccountId: 'github-account-1',
        setupAction: 'install',
        now: NOW + 1,
      }),
    ).resolves.toMatchObject({ kind: 'updated', intent: { status: 'CallbackReceived' } });

    await expect(
      repository.recordCallback({
        stateHash: state.stateHash,
        installationId: 'installation-1',
        providerAccountId: 'github-account-1',
        setupAction: 'install',
        now: NOW + 2,
      }),
    ).resolves.toMatchObject({ kind: 'idempotent' });

    await expect(
      repository.recordCallback({
        stateHash: state.stateHash,
        installationId: 'installation-2',
        providerAccountId: 'github-account-2',
        setupAction: 'install',
        now: NOW + 3,
      }),
    ).resolves.toEqual({ kind: 'conflict' });
  });

  it('requires the original identity to finalize and a live Finalized intent to authorize connect', async () => {
    const repository = new InMemoryKnowledgeRepositoryInstallationIntentRepository();
    const state = await createIntent(repository);
    await repository.recordCallback({
      stateHash: state.stateHash,
      installationId: 'installation-1',
      providerAccountId: 'github-account-1',
      setupAction: 'install',
      now: NOW + 1,
    });

    await expect(
      repository.markFinalized({
        identityId: 'identity-2',
        intentId: 'intent-1',
        installationId: 'installation-1',
        providerAccountId: 'github-account-1',
        now: NOW + 2,
      }),
    ).resolves.toBeNull();

    const finalized = await repository.markFinalized({
      identityId: 'identity-1',
      intentId: 'intent-1',
      installationId: 'installation-1',
      providerAccountId: 'github-account-1',
      now: NOW + 2,
    });
    expect(finalized).toMatchObject({ status: 'Finalized' });

    await expect(
      repository.findUsableFinalized('identity-1', 'installation-1', NOW + 3),
    ).resolves.toMatchObject({ id: 'intent-1' });

    await expect(
      repository.markConsumed({ identityId: 'identity-1', intentId: 'intent-1', now: NOW + 4 }),
    ).resolves.toBe(true);
    await expect(
      repository.findUsableFinalized('identity-1', 'installation-1', NOW + 5),
    ).resolves.toBeNull();
  });

  it('renews only a recent verified unconsumed callback for authenticated retry', async () => {
    const repository = new InMemoryKnowledgeRepositoryInstallationIntentRepository();
    const state = await createIntent(repository, { expiresAt: NOW + 10 });
    await repository.recordCallback({
      stateHash: state.stateHash,
      installationId: 'installation-1',
      providerAccountId: 'github-account-1',
      setupAction: 'update',
      now: NOW + 1,
    });

    await expect(
      repository.findLatestRecoverableVerified('identity-1', 'staging', NOW),
    ).resolves.toMatchObject({
      id: 'intent-1',
      status: 'CallbackReceived',
      installationId: 'installation-1',
    });
    await expect(
      repository.findLatestRecoverableVerified('identity-1', 'staging', NOW + 2),
    ).resolves.toBeNull();

    const renewed = await repository.renewVerifiedForRetry({
      identityId: 'identity-1',
      intentId: 'intent-1',
      installationId: 'installation-1',
      providerAccountId: 'github-account-1',
      notBefore: NOW,
      expiresAt: NOW + 600_000,
      now: NOW + 100,
    });
    expect(renewed).toMatchObject({
      status: 'CallbackReceived',
      expiresAt: NOW + 600_000,
    });

    await repository.markFinalized({
      identityId: 'identity-1',
      intentId: 'intent-1',
      installationId: 'installation-1',
      providerAccountId: 'github-account-1',
      now: NOW + 101,
    });
    await repository.markConsumed({
      identityId: 'identity-1',
      intentId: 'intent-1',
      now: NOW + 102,
    });
    await expect(
      repository.findLatestRecoverableVerified('identity-1', 'staging', NOW),
    ).resolves.toBeNull();
  });

  it('finds only a recent finalized intent for the requested client kind', async () => {
    const repository = new InMemoryKnowledgeRepositoryInstallationIntentRepository();
    const state = await createIntent(repository, { clientKind: 'web' });
    await repository.recordCallback({
      stateHash: state.stateHash,
      installationId: 'installation-1',
      providerAccountId: 'github-account-1',
      setupAction: 'update',
      now: NOW + 1,
    });

    await expect(
      repository.findLatestRecoverableFinalized('identity-1', 'staging', 'web', NOW),
    ).resolves.toBeNull();

    await repository.markFinalized({
      identityId: 'identity-1',
      intentId: 'intent-1',
      installationId: 'installation-1',
      providerAccountId: 'github-account-1',
      now: NOW + 2,
    });

    await expect(
      repository.findLatestRecoverableFinalized('identity-1', 'staging', 'web', NOW),
    ).resolves.toMatchObject({ id: 'intent-1', clientKind: 'web', status: 'Finalized' });
    await expect(
      repository.findLatestRecoverableFinalized('identity-1', 'staging', 'desktop', NOW),
    ).resolves.toBeNull();
  });

  it('fails closed when callback or finalize happens after expiry', async () => {
    const repository = new InMemoryKnowledgeRepositoryInstallationIntentRepository();
    const state = await createIntent(repository, { expiresAt: NOW + 10 });

    await expect(
      repository.recordCallback({
        stateHash: state.stateHash,
        installationId: 'installation-1',
        providerAccountId: 'github-account-1',
        setupAction: 'install',
        now: NOW + 11,
      }),
    ).resolves.toEqual({ kind: 'expired' });

    await expect(
      repository.markFinalized({
        identityId: 'identity-1',
        intentId: 'intent-1',
        installationId: 'installation-1',
        providerAccountId: 'github-account-1',
        now: NOW + 11,
      }),
    ).resolves.toBeNull();
  });
});
