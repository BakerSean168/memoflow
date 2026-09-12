import { randomUUID } from 'node:crypto';
import type { Result } from '@memoflow/contracts/result';
import { fail, ok } from '@memoflow/contracts/result';
import type {
  CompleteKnowledgeRepositoryInstallationReq,
  CompleteKnowledgeRepositoryInstallationRes,
  ConfirmKnowledgeRepositoryHeadReq,
  CreateKnowledgeRepositoryConnectionReq,
  KnowledgeRemoteBindingClientDTO,
  KnowledgeRemoteBindingServerDTO,
  KnowledgeProjectionCheckpoint,
  RemoteHistoryFence,
  RemoteRepositoryBlockReason,
  RemoteRepositoryObservation,
  GitHubInstallationRepositoryDTO,
  KnowledgeRepositoryContentState,
  KnowledgeRepositoryInstallationClientKind,
  KnowledgeRepositoryInstallationIntentStatusResponse,
  KnowledgeRepositoryFirstReconciliationAction,
  KnowledgeRepositoryReconciliationPreview,
  ListKnowledgeRepositoryConnectionsRes,
  PreviewKnowledgeRepositoryReconciliationReq,
  StartKnowledgeRepositoryInstallationReq,
  StartKnowledgeRepositoryInstallationRes,
} from '@memoflow/contracts/repository';
import type {
  GitHubAppInstallationInventory,
  IGitHubAppClient,
} from '../ports/github-app-client.port';
import { GitHubAppClientFailureError } from '../ports/github-app-client.port';
import type {
  IKnowledgeProjectionCheckpointRepository,
  IKnowledgeRemoteBindingRepository,
  IKnowledgeSpaceRepository,
  IRemoteHistoryFenceRepository,
  IRemoteRepositoryObservationRepository,
} from '../ports/knowledge-remote-binding.repositories';
import type { IKnowledgeRemoteBindingWriteTransactionRunner } from '../ports/knowledge-remote-binding-write-transaction.runner';
import type { IKnowledgeRepositoryCloudDataPurger } from '../ports/knowledge-repository-cloud-data-purger.port';
import type {
  IKnowledgeRepositoryInstallationIntentRepository,
  KnowledgeRepositoryInstallationIntentRecord,
} from '../ports/knowledge-repository-installation-intent.repository';
import type {
  KnowledgeRepositoryInstallationSetupRequest,
  KnowledgeRepositoryInstallationSetupResolution,
} from '../ports/knowledge-repository-connection.service.port';
import {
  createKnowledgeRepositoryInstallationState,
  hashKnowledgeRepositoryInstallationState,
  parseKnowledgeRepositoryInstallationStateRouteKey,
} from './knowledge-repository-installation-state';
import { buildRemoteRepositoryObservation } from './remote-repository-observation.policy';

function firstReconciliationAction(
  localState: KnowledgeRepositoryContentState,
  remoteState: KnowledgeRepositoryContentState,
): KnowledgeRepositoryFirstReconciliationAction {
  if (localState === 'NonEmpty' && remoteState === 'Empty') {
    return 'InitializeRemoteFromLocal';
  }
  if (localState === 'Empty' && remoteState === 'NonEmpty') {
    return 'CloneRemoteIntoLocal';
  }
  if (localState === 'Empty' && remoteState === 'Empty') {
    return 'InitializeBoth';
  }
  return 'ManualResolutionRequired';
}

const DEFAULT_INSTALLATION_RETURN_PATH = '/settings?tab=repository';
const INSTALLATION_INTENT_TTL_MS = 10 * 60 * 1000;
const VERIFIED_INSTALLATION_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
const INSTALLATION_SETUP_PATH = '/api/v1/repositories/knowledge-connections/installations/setup';

export interface KnowledgeRepositoryInstallationRoutingConfig {
  routeKey: string;
  webOrigin: string;
  routeTargets?: Readonly<Record<string, string>>;
}

function normalizeOrigin(value: string): string {
  return new URL(value).origin;
}

function normalizeReturnPath(returnUrl: string | undefined, webOrigin: string): string | null {
  if (!returnUrl) return DEFAULT_INSTALLATION_RETURN_PATH;
  try {
    const url = new URL(returnUrl);
    if (url.origin !== normalizeOrigin(webOrigin)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function buildWebReturnUrl(webOrigin: string, returnPath: string, intentId: string): string {
  const url = new URL(returnPath, `${normalizeOrigin(webOrigin)}/`);
  url.searchParams.set('installation_intent', intentId);
  return url.toString();
}

class KnowledgeRepositoryConnectionCommitError extends Error {
  constructor(
    readonly code: 'FORBIDDEN' | 'CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'KnowledgeRepositoryConnectionCommitError';
  }
}

function buildSetupRouteUrl(
  apiBaseUrl: string,
  request: KnowledgeRepositoryInstallationSetupRequest,
): string {
  const url = new URL(INSTALLATION_SETUP_PATH, `${normalizeOrigin(apiBaseUrl)}/`);
  url.searchParams.set('state', request.state);
  url.searchParams.set('installation_id', request.installationId);
  if (request.setupAction) url.searchParams.set('setup_action', request.setupAction);
  return url.toString();
}

export interface KnowledgeRepositoryConnectionServiceOptions {
  appSlug: string;
  knowledgeSpaceRepository: IKnowledgeSpaceRepository;
  bindingRepository: IKnowledgeRemoteBindingRepository;
  observationRepository: IRemoteRepositoryObservationRepository;
  historyFenceRepository: IRemoteHistoryFenceRepository;
  projectionCheckpointRepository: IKnowledgeProjectionCheckpointRepository;
  bindingWriteTransactionRunner: IKnowledgeRemoteBindingWriteTransactionRunner;
  cloudDataPurger?: IKnowledgeRepositoryCloudDataPurger;
  githubAppClient: IGitHubAppClient;
  installationIntentRepository: IKnowledgeRepositoryInstallationIntentRepository;
  installationRouting: KnowledgeRepositoryInstallationRoutingConfig;
  now?: () => number;
}

export class KnowledgeRepositoryConnectionService {
  private readonly now: () => number;

  constructor(private readonly options: KnowledgeRepositoryConnectionServiceOptions) {
    this.now = options.now ?? Date.now;
  }

  async startInstallation(
    identityId: string,
    request: StartKnowledgeRepositoryInstallationReq,
  ): Promise<Result<StartKnowledgeRepositoryInstallationRes>> {
    const returnPath = normalizeReturnPath(
      request.returnUrl,
      this.options.installationRouting.webOrigin,
    );
    if (!returnPath) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'GitHub installation return URL must use the configured MemoFlow Web origin',
      });
    }

    try {
      const now = this.now();
      const expiresAt = now + INSTALLATION_INTENT_TTL_MS;
      const clientKind: KnowledgeRepositoryInstallationClientKind = request.clientKind ?? 'web';

      if (clientKind === 'desktop') {
        const recovered = await this.tryRecoverVerifiedDesktopIntent(identityId, now, expiresAt);
        if (!recovered.ok) return recovered;
        if (recovered.data) {
          return ok({
            intentId: recovered.data.id,
            installationUrl: `https://github.com/apps/${encodeURIComponent(this.options.appSlug)}/installations/new`,
            expiresAt: recovered.data.expiresAt,
            requiresExternalBrowser: false,
          });
        }
      }

      const intentId = `knowledge-install-intent-${randomUUID()}`;
      const state = createKnowledgeRepositoryInstallationState(
        this.options.installationRouting.routeKey,
      );
      await this.options.installationIntentRepository.create({
        id: intentId,
        identityId,
        stateHash: state.stateHash,
        routeKey: state.routeKey,
        clientKind,
        returnPath,
        expiresAt,
        createdAt: now,
      });
      const search = new URLSearchParams({ state: state.state });
      return ok({
        intentId,
        installationUrl: `https://github.com/apps/${encodeURIComponent(this.options.appSlug)}/installations/new?${search.toString()}`,
        expiresAt,
        requiresExternalBrowser: true,
      });
    } catch (error) {
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'GitHub installation start failed',
      });
    }
  }

  async receiveInstallationSetup(
    request: KnowledgeRepositoryInstallationSetupRequest,
  ): Promise<Result<KnowledgeRepositoryInstallationSetupResolution>> {
    const routeKey = parseKnowledgeRepositoryInstallationStateRouteKey(request.state);
    if (!routeKey) {
      return fail({ code: 'VALIDATION_ERROR', message: 'GitHub installation state is invalid' });
    }

    if (routeKey !== this.options.installationRouting.routeKey) {
      const target = this.options.installationRouting.routeTargets?.[routeKey];
      if (!target) {
        return fail({
          code: 'FORBIDDEN',
          message: 'GitHub installation state targets an unconfigured environment',
        });
      }
      return ok({ kind: 'redirect', location: buildSetupRouteUrl(target, request) });
    }

    const stateHash = hashKnowledgeRepositoryInstallationState(request.state);
    const intent = await this.options.installationIntentRepository.findByStateHash(stateHash);
    if (!intent || intent.routeKey !== routeKey) {
      return fail({ code: 'VALIDATION_ERROR', message: 'GitHub installation state is invalid' });
    }
    if (intent.expiresAt <= this.now()) {
      return fail({ code: 'VALIDATION_ERROR', message: 'GitHub installation state has expired' });
    }

    const inventoryResult = await this.getValidInstallationInventory(request.installationId);
    if (!inventoryResult.ok) return inventoryResult;
    const callback = await this.options.installationIntentRepository.recordCallback({
      stateHash,
      installationId: request.installationId,
      providerAccountId: inventoryResult.data.accountId,
      setupAction: request.setupAction ?? 'install',
      now: this.now(),
    });
    if (callback.kind === 'not_found' || callback.kind === 'expired') {
      return fail({ code: 'VALIDATION_ERROR', message: 'GitHub installation state is invalid' });
    }
    if (callback.kind === 'conflict') {
      return fail({
        code: 'CONFLICT',
        message: 'GitHub installation state was already used by another installation',
      });
    }

    const resolvedIntent = callback.intent;
    if (resolvedIntent.clientKind === 'desktop') {
      return ok({
        kind: 'desktop',
        intentId: resolvedIntent.id,
        expiresAt: resolvedIntent.expiresAt,
      });
    }
    return ok({
      kind: 'web',
      intentId: resolvedIntent.id,
      location: buildWebReturnUrl(
        this.options.installationRouting.webOrigin,
        resolvedIntent.returnPath,
        resolvedIntent.id,
      ),
    });
  }

  async getInstallationIntentStatus(
    identityId: string,
    intentId: string,
  ): Promise<Result<KnowledgeRepositoryInstallationIntentStatusResponse>> {
    const intent = await this.options.installationIntentRepository.findByIdForIdentity(
      identityId,
      intentId,
    );
    if (!intent) {
      return fail({ code: 'NOT_FOUND', message: 'GitHub installation intent was not found' });
    }
    return ok({
      intentId: intent.id,
      status:
        intent.expiresAt <= this.now() && intent.status !== 'Consumed' ? 'Expired' : intent.status,
      clientKind: intent.clientKind,
      expiresAt: intent.expiresAt,
      installationId: intent.installationId,
    });
  }

  async finalizeInstallationIntent(
    identityId: string,
    intentId: string,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>> {
    const intent = await this.options.installationIntentRepository.findByIdForIdentity(
      identityId,
      intentId,
    );
    if (!intent) {
      return fail({ code: 'NOT_FOUND', message: 'GitHub installation intent was not found' });
    }
    if (intent.expiresAt <= this.now()) {
      return fail({ code: 'VALIDATION_ERROR', message: 'GitHub installation intent has expired' });
    }
    if (!intent.installationId || !intent.providerAccountId) {
      return fail({
        code: 'CONFLICT',
        message: 'GitHub installation callback has not been received yet',
      });
    }
    if (intent.status !== 'CallbackReceived' && intent.status !== 'Finalized') {
      return fail({
        code: 'CONFLICT',
        message: 'GitHub installation intent cannot be finalized from its current state',
      });
    }

    const inventoryResult = await this.getValidInstallationInventory(intent.installationId);
    if (!inventoryResult.ok) return inventoryResult;
    if (inventoryResult.data.accountId !== intent.providerAccountId) {
      return fail({
        code: 'CONFLICT',
        message: 'GitHub installation account changed before finalization',
      });
    }
    const finalized = await this.options.installationIntentRepository.markFinalized({
      identityId,
      intentId,
      installationId: intent.installationId,
      providerAccountId: inventoryResult.data.accountId,
      now: this.now(),
    });
    if (!finalized) {
      return fail({
        code: 'CONFLICT',
        message: 'GitHub installation intent could not be finalized',
      });
    }
    return ok({
      installationId: intent.installationId,
      githubAccountId: inventoryResult.data.accountId,
      repositories: inventoryResult.data.repositories,
      returnUrl: new URL(
        finalized.returnPath,
        `${normalizeOrigin(this.options.installationRouting.webOrigin)}/`,
      ).toString(),
    });
  }

  async completeInstallation(
    identityId: string,
    request: CompleteKnowledgeRepositoryInstallationReq,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>> {
    const routeKey = parseKnowledgeRepositoryInstallationStateRouteKey(request.state);
    if (!routeKey || routeKey !== this.options.installationRouting.routeKey) {
      return fail({ code: 'VALIDATION_ERROR', message: 'GitHub installation state is invalid' });
    }
    const stateHash = hashKnowledgeRepositoryInstallationState(request.state);
    const intent = await this.options.installationIntentRepository.findByStateHash(stateHash);
    if (!intent || intent.identityId !== identityId || intent.expiresAt <= this.now()) {
      return fail({ code: 'VALIDATION_ERROR', message: 'GitHub installation state is invalid' });
    }

    const inventoryResult = await this.getValidInstallationInventory(request.installationId);
    if (!inventoryResult.ok) return inventoryResult;
    const callback = await this.options.installationIntentRepository.recordCallback({
      stateHash,
      installationId: request.installationId,
      providerAccountId: inventoryResult.data.accountId,
      setupAction: request.setupAction ?? 'install',
      now: this.now(),
    });
    if (callback.kind === 'not_found' || callback.kind === 'expired') {
      return fail({ code: 'VALIDATION_ERROR', message: 'GitHub installation state is invalid' });
    }
    if (callback.kind === 'conflict') {
      return fail({ code: 'CONFLICT', message: 'GitHub installation state is already bound' });
    }
    return this.finalizeInstallationIntent(identityId, intent.id);
  }

  async connect(
    identityId: string,
    request: CreateKnowledgeRepositoryConnectionReq,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>> {
    const finalizedIntent = await this.options.installationIntentRepository.findUsableFinalized(
      identityId,
      request.installationId,
      this.now(),
    );
    if (!finalizedIntent) {
      return fail({
        code: 'FORBIDDEN',
        message: 'Finalize the GitHub App installation before connecting a repository',
      });
    }
    if (finalizedIntent.clientKind === 'desktop' && !request.knowledgeSpaceId) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Desktop knowledge repository binding requires the Local Vault knowledgeSpaceId',
      });
    }
    if (finalizedIntent.clientKind === 'web' && request.knowledgeSpaceId) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Web knowledge repository binding cannot choose a device-local KnowledgeSpace id',
      });
    }

    try {
      const inventory = await this.options.githubAppClient.getInstallationInventory(
        request.installationId,
      );
      if (inventory.suspended) {
        return fail({ code: 'FORBIDDEN', message: 'GitHub App installation is suspended' });
      }
      const repository = inventory.repositories.find(
        (candidate) => candidate.id === request.githubRepositoryId,
      );
      if (!repository) {
        return fail({ code: 'NOT_FOUND', message: 'Repository is not part of this installation' });
      }
      if (!repository.private) {
        return fail({ code: 'FORBIDDEN', message: 'Knowledge repositories must be private' });
      }
      if (repository.archived || repository.disabled) {
        return fail({
          code: 'FORBIDDEN',
          message: 'Archived or disabled repositories cannot connect',
        });
      }
      if (!repository.permissions.push || inventory.contentsPermission !== 'write') {
        return fail({ code: 'FORBIDDEN', message: 'Contents write permission is required' });
      }

      const timestamp = this.now();
      const result = await this.options.bindingWriteTransactionRunner.run(
        async ({
          knowledgeSpaceRepository,
          bindingRepository,
          observationRepository,
          historyFenceRepository,
          projectionCheckpointRepository,
          installationIntentRepository,
        }) => {
          const transactionalIntent = await installationIntentRepository.findUsableFinalized(
            identityId,
            request.installationId,
            timestamp,
          );
          if (!transactionalIntent || transactionalIntent.id !== finalizedIntent.id) {
            throw new KnowledgeRepositoryConnectionCommitError(
              'FORBIDDEN',
              'GitHub installation intent is no longer available for connection',
            );
          }

          const existing = await bindingRepository.findByRepositoryId(repository.id);
          if (existing && existing.identityId !== identityId) {
            throw new KnowledgeRepositoryConnectionCommitError(
              'CONFLICT',
              'Repository is already associated with another account',
            );
          }
          const ownedBindings = await bindingRepository.findByIdentityId(identityId);
          const otherActive = ownedBindings.find(
            (binding) => binding.disconnectedAt === null && binding.id !== existing?.id,
          );
          if (otherActive) {
            throw new KnowledgeRepositoryConnectionCommitError(
              'CONFLICT',
              'Disconnect the current remote knowledge binding before selecting another repository',
            );
          }

          const knowledgeSpaceId =
            transactionalIntent.clientKind === 'desktop'
              ? request.knowledgeSpaceId!
              : (existing?.knowledgeSpaceId ??
                ownedBindings[0]?.knowledgeSpaceId ??
                (`KnowledgeSpaceId_${randomUUID()}` as KnowledgeRemoteBindingServerDTO['knowledgeSpaceId']));
          await knowledgeSpaceRepository.ensure(knowledgeSpaceId);

          const binding: KnowledgeRemoteBindingServerDTO = {
            id:
              existing?.id ??
              (`KnowledgeRemoteBindingId_${randomUUID()}` as KnowledgeRemoteBindingServerDTO['id']),
            knowledgeSpaceId,
            identityId: identityId as KnowledgeRemoteBindingServerDTO['identityId'],
            provider: 'GitHub',
            installationId: request.installationId,
            repositoryId: repository.id,
            repositoryFullNameSnapshot: repository.fullName,
            connectedAt: timestamp,
            disconnectedAt: null,
            version: (existing?.version ?? 0) + 1,
          };
          await bindingRepository.save(binding);

          const existingFence = existing
            ? await historyFenceRepository.findByBindingId(binding.id)
            : null;
          const observation = this.buildObservation(
            binding,
            inventory,
            repository,
            existingFence,
            timestamp,
          );
          await observationRepository.save(observation);

          const checkpoint = existing
            ? await projectionCheckpointRepository.findByBindingId(binding.id)
            : null;
          const nextCheckpoint: KnowledgeProjectionCheckpoint = checkpoint ?? {
            bindingId: binding.id,
            branch: repository.defaultBranch,
            projectedCommitSha: null,
            state: 'Lagging',
            failure: null,
            lastAttemptAt: null,
            projectedAt: null,
          };
          if (!checkpoint) await projectionCheckpointRepository.save(nextCheckpoint);

          const consumed = await installationIntentRepository.markConsumed({
            identityId,
            intentId: transactionalIntent.id,
            now: timestamp,
          });
          if (!consumed) {
            throw new KnowledgeRepositoryConnectionCommitError(
              'CONFLICT',
              'GitHub installation intent was consumed concurrently',
            );
          }
          return { binding, observation, historyFence: existingFence, checkpoint: nextCheckpoint };
        },
      );
      return ok(
        this.toClient(result.binding, result.observation, result.historyFence, result.checkpoint),
      );
    } catch (error) {
      if (error instanceof KnowledgeRepositoryConnectionCommitError) {
        return fail({ code: error.code, message: error.message });
      }
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'GitHub repository connection failed',
      });
    }
  }

  async list(identityId: string): Promise<Result<ListKnowledgeRepositoryConnectionsRes>> {
    const bindings = (await this.options.bindingRepository.findByIdentityId(identityId)).filter(
      (binding) => binding.disconnectedAt === null,
    );
    const bindingIds = bindings.map((binding) => binding.id);
    const [observations, fences, checkpoints] = await Promise.all([
      this.options.observationRepository.findByBindingIds(bindingIds),
      this.options.historyFenceRepository.findByBindingIds(bindingIds),
      this.options.projectionCheckpointRepository.findByBindingIds(bindingIds),
    ]);
    return ok({
      connections: bindings.map((binding) =>
        this.toClient(
          binding,
          observations.get(binding.id) ?? null,
          fences.get(binding.id) ?? null,
          checkpoints.get(binding.id) ?? null,
        ),
      ),
    });
  }

  async refreshObservation(
    identityId: string,
    bindingId: string,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>> {
    const binding = await this.options.bindingRepository.findByIdForIdentity(identityId, bindingId);
    if (!binding || binding.disconnectedAt !== null) {
      return fail({ code: 'NOT_FOUND', message: 'Knowledge remote binding was not found' });
    }
    try {
      await this.refreshObservationState(binding);
      return ok(await this.composeClient(binding));
    } catch (error) {
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message:
          error instanceof Error ? error.message : 'GitHub repository observation refresh failed',
      });
    }
  }

  async disconnect(
    identityId: string,
    bindingId: string,
    purgeCloudData = false,
  ): Promise<Result<null>> {
    const binding = await this.options.bindingRepository.findByIdForIdentity(identityId, bindingId);
    if (!binding || binding.disconnectedAt !== null) {
      return fail({ code: 'NOT_FOUND', message: 'Knowledge remote binding was not found' });
    }
    if (purgeCloudData) {
      if (!this.options.cloudDataPurger) {
        return fail({
          code: 'SERVICE_UNAVAILABLE',
          message: 'Cloud data purge is not configured for this runtime',
        });
      }
      const purged = await this.options.cloudDataPurger.purge(identityId, bindingId);
      if (!purged)
        return fail({ code: 'NOT_FOUND', message: 'Knowledge remote binding was not found' });
    } else {
      const disconnected = await this.options.bindingRepository.markDisconnected(
        identityId,
        bindingId,
        this.now(),
      );
      if (!disconnected) {
        return fail({ code: 'NOT_FOUND', message: 'Knowledge remote binding was not found' });
      }
    }
    return ok(null);
  }

  async issueInstallationToken(
    identityId: string,
    bindingId: string,
  ): Promise<Result<{ token: string; expiresAt: number; repositoryId: string }>> {
    const binding = await this.options.bindingRepository.findByIdForIdentity(identityId, bindingId);
    if (!binding || binding.disconnectedAt !== null) {
      return fail({ code: 'NOT_FOUND', message: 'Active knowledge remote binding was not found' });
    }
    const preflight = await this.requireLiveProviderState(binding);
    if (!preflight.ok) return preflight;
    try {
      const token = await this.options.githubAppClient.createInstallationAccessToken(
        binding.installationId,
        binding.repositoryId,
      );
      return ok({
        token: token.token,
        expiresAt: token.expiresAt,
        repositoryId: binding.repositoryId,
      });
    } catch (error) {
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message:
          error instanceof Error ? error.message : 'GitHub installation token issuance failed',
      });
    }
  }

  async previewFirstReconciliation(
    identityId: string,
    bindingId: string,
    request: PreviewKnowledgeRepositoryReconciliationReq,
  ): Promise<Result<KnowledgeRepositoryReconciliationPreview>> {
    const binding = await this.options.bindingRepository.findByIdForIdentity(identityId, bindingId);
    if (!binding || binding.disconnectedAt !== null) {
      return fail({ code: 'NOT_FOUND', message: 'Active knowledge remote binding was not found' });
    }

    const preflight = await this.requireLiveProviderState(binding, ['DefaultBranchChanged']);
    if (!preflight.ok) return preflight;
    try {
      const snapshot = await this.options.githubAppClient.getRepositorySnapshot(
        binding.installationId,
        preflight.data.repository,
      );
      const remoteState: KnowledgeRepositoryContentState = snapshot.empty ? 'Empty' : 'NonEmpty';
      return ok({
        connectionId: bindingId,
        localState: request.localState,
        remoteState,
        action: firstReconciliationAction(request.localState, remoteState),
        defaultBranch: snapshot.defaultBranch,
        remoteHeadSha: snapshot.headSha,
      });
    } catch (error) {
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message:
          error instanceof Error ? error.message : 'GitHub repository reconciliation check failed',
      });
    }
  }

  async confirmHead(
    identityId: string,
    bindingId: string,
    request: ConfirmKnowledgeRepositoryHeadReq,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>> {
    const binding = await this.options.bindingRepository.findByIdForIdentity(identityId, bindingId);
    if (!binding || binding.disconnectedAt !== null) {
      return fail({ code: 'NOT_FOUND', message: 'Active knowledge remote binding was not found' });
    }

    const preflight = await this.requireLiveProviderState(binding, ['DefaultBranchChanged']);
    if (!preflight.ok) return preflight;
    try {
      const snapshot = await this.options.githubAppClient.getRepositorySnapshot(
        binding.installationId,
        preflight.data.repository,
      );
      if (snapshot.headSha !== request.headSha) {
        return fail({
          code: 'CONFLICT',
          message: 'GitHub default branch changed before reconciliation was confirmed',
        });
      }
      const timestamp = this.now();
      const fence: RemoteHistoryFence = {
        bindingId: binding.id,
        defaultBranch: snapshot.defaultBranch,
        lastConfirmedRemoteHeadSha: request.headSha,
        confirmedAt: timestamp,
      };
      await this.options.historyFenceRepository.save(fence);
      await this.options.observationRepository.save(
        this.buildObservation(
          binding,
          preflight.data.inventory,
          preflight.data.repository,
          fence,
          timestamp,
        ),
      );

      const checkpoint = await this.options.projectionCheckpointRepository.findByBindingId(
        binding.id,
      );
      if (checkpoint && checkpoint.branch !== snapshot.defaultBranch) {
        await this.options.projectionCheckpointRepository.save({
          ...checkpoint,
          branch: snapshot.defaultBranch,
          projectedCommitSha: null,
          state: 'Lagging',
          failure: null,
          lastAttemptAt: null,
          projectedAt: null,
        });
      }
      return ok(await this.composeClient(binding));
    } catch (error) {
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message:
          error instanceof Error ? error.message : 'GitHub repository HEAD confirmation failed',
      });
    }
  }

  private async tryRecoverVerifiedDesktopIntent(
    identityId: string,
    now: number,
    expiresAt: number,
  ): Promise<Result<KnowledgeRepositoryInstallationIntentRecord | null>> {
    const notBefore = now - VERIFIED_INSTALLATION_RETRY_WINDOW_MS;
    const candidate = await this.options.installationIntentRepository.findLatestRecoverableVerified(
      identityId,
      this.options.installationRouting.routeKey,
      notBefore,
    );
    if (!candidate?.installationId || !candidate.providerAccountId) return ok(null);

    let inventory: GitHubAppInstallationInventory;
    try {
      inventory = await this.options.githubAppClient.getInstallationInventory(
        candidate.installationId,
      );
    } catch (error) {
      if (error instanceof GitHubAppClientFailureError && error.failure.kind === 'not_found') {
        return ok(null);
      }
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'GitHub installation lookup failed',
      });
    }
    if (
      inventory.suspended ||
      inventory.contentsPermission !== 'write' ||
      inventory.accountId !== candidate.providerAccountId
    ) {
      return ok(null);
    }

    return ok(
      await this.options.installationIntentRepository.renewVerifiedForRetry({
        identityId,
        intentId: candidate.id,
        installationId: candidate.installationId,
        providerAccountId: candidate.providerAccountId,
        notBefore,
        expiresAt,
        now,
      }),
    );
  }

  private async getValidInstallationInventory(
    installationId: string,
  ): Promise<Result<GitHubAppInstallationInventory>> {
    try {
      const inventory = await this.options.githubAppClient.getInstallationInventory(installationId);
      if (inventory.suspended) {
        return fail({ code: 'FORBIDDEN', message: 'GitHub App installation is suspended' });
      }
      if (inventory.contentsPermission !== 'write') {
        return fail({
          code: 'FORBIDDEN',
          message: 'GitHub App installation requires Contents write permission',
        });
      }
      return ok(inventory);
    } catch (error) {
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'GitHub installation lookup failed',
      });
    }
  }

  private async composeClient(
    binding: KnowledgeRemoteBindingServerDTO,
  ): Promise<KnowledgeRemoteBindingClientDTO> {
    const [observation, historyFence, projectionCheckpoint] = await Promise.all([
      this.options.observationRepository.findByBindingId(binding.id),
      this.options.historyFenceRepository.findByBindingId(binding.id),
      this.options.projectionCheckpointRepository.findByBindingId(binding.id),
    ]);
    return this.toClient(binding, observation, historyFence, projectionCheckpoint);
  }

  private toClient(
    binding: KnowledgeRemoteBindingServerDTO,
    observation: RemoteRepositoryObservation | null,
    historyFence: RemoteHistoryFence | null,
    projectionCheckpoint: KnowledgeProjectionCheckpoint | null,
  ): KnowledgeRemoteBindingClientDTO {
    return {
      id: binding.id,
      knowledgeSpaceId: binding.knowledgeSpaceId,
      identityId: binding.identityId,
      provider: binding.provider,
      installationId: binding.installationId,
      repositoryId: binding.repositoryId,
      repositoryFullNameSnapshot: binding.repositoryFullNameSnapshot,
      connectedAt: binding.connectedAt,
      disconnectedAt: binding.disconnectedAt,
      observation,
      historyFence,
      projectionCheckpoint,
    };
  }

  private buildObservation(
    binding: KnowledgeRemoteBindingServerDTO,
    inventory: GitHubAppInstallationInventory,
    repository: GitHubInstallationRepositoryDTO,
    historyFence: RemoteHistoryFence | null,
    observedAt: number,
  ): RemoteRepositoryObservation {
    return buildRemoteRepositoryObservation({
      binding,
      inventory,
      repository,
      historyFence,
      observedAt,
    });
  }

  private async refreshObservationState(binding: KnowledgeRemoteBindingServerDTO): Promise<{
    observation: RemoteRepositoryObservation;
    inventory: GitHubAppInstallationInventory | null;
    repository: GitHubInstallationRepositoryDTO | null;
  }> {
    const observedAt = this.now();
    const previous = await this.options.observationRepository.findByBindingId(binding.id);
    let inventory: GitHubAppInstallationInventory;
    try {
      inventory = await this.options.githubAppClient.getInstallationInventory(
        binding.installationId,
      );
    } catch (error) {
      if (!previous) throw error;
      const reason: RemoteRepositoryBlockReason =
        error instanceof GitHubAppClientFailureError && error.failure.kind === 'not_found'
          ? 'InstallationMissing'
          : 'CheckUnavailable';
      const observation: RemoteRepositoryObservation = {
        ...previous,
        observedAt,
        eligibility: { state: 'Blocked', reason },
      };
      await this.options.observationRepository.save(observation);
      return { observation, inventory: null, repository: null };
    }

    const repository = inventory.repositories.find(
      (candidate) => candidate.id === binding.repositoryId,
    );
    if (!repository) {
      if (!previous) {
        throw new Error('GitHub repository observation is unavailable before initial projection');
      }
      const observation: RemoteRepositoryObservation = {
        ...previous,
        observedAt,
        accountId: inventory.accountId,
        contentsPermission: inventory.contentsPermission,
        installationSuspended: inventory.suspended,
        eligibility: { state: 'Blocked', reason: 'RepositoryAccessLost' },
      };
      await this.options.observationRepository.save(observation);
      return { observation, inventory, repository: null };
    }

    const historyFence = await this.options.historyFenceRepository.findByBindingId(binding.id);
    const observation = this.buildObservation(
      binding,
      inventory,
      repository,
      historyFence,
      observedAt,
    );
    await this.options.observationRepository.save(observation);
    return { observation, inventory, repository };
  }

  private async requireLiveProviderState(
    binding: KnowledgeRemoteBindingServerDTO,
    allowedBlockedReasons: readonly RemoteRepositoryBlockReason[] = [],
  ): Promise<
    Result<{
      inventory: GitHubAppInstallationInventory;
      repository: GitHubInstallationRepositoryDTO;
      observation: RemoteRepositoryObservation;
    }>
  > {
    let state: Awaited<ReturnType<KnowledgeRepositoryConnectionService['refreshObservationState']>>;
    try {
      state = await this.refreshObservationState(binding);
    } catch (error) {
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'GitHub repository check failed',
      });
    }

    const blockedReason =
      state.observation.eligibility.state === 'Blocked'
        ? state.observation.eligibility.reason
        : null;
    if (blockedReason && !allowedBlockedReasons.includes(blockedReason)) {
      return fail({
        code: 'FORBIDDEN',
        message: 'Knowledge repository authorization or provider state requires attention',
        context: { remoteRepositoryBlockReason: blockedReason },
      });
    }
    if (!state.inventory || !state.repository) {
      return fail({
        code: blockedReason === 'CheckUnavailable' ? 'SERVICE_UNAVAILABLE' : 'FORBIDDEN',
        message: 'Knowledge repository provider state is unavailable',
        context: blockedReason ? { remoteRepositoryBlockReason: blockedReason } : undefined,
      });
    }
    return ok({
      inventory: state.inventory,
      repository: state.repository,
      observation: state.observation,
    });
  }
}
