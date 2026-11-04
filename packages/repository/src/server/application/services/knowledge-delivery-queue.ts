import { RepositoryNoteMutationType } from '@memoflow/repository-contracts';
import type {
  GitHubInstallationRepositoryDTO,
  KnowledgeProjectionCheckpoint,
  KnowledgeRemoteBindingServerDTO,
  RemoteRepositoryBlockReason,
} from '@memoflow/repository-contracts';
import { createLogger } from '@memoflow/utils/logger';
import { GitHubAppClientFailureError } from '../ports/github-app-client.port';
import type { IGitHubAppClient } from '../ports/github-app-client.port';
import type {
  IKnowledgeProjectionCheckpointRepository,
  IKnowledgeRemoteBindingRepository,
  IRemoteHistoryFenceRepository,
  IRemoteRepositoryObservationRepository,
} from '../ports/knowledge-remote-binding.repositories';
import type {
  GithubWebhookDeliveryRecord,
  IGithubWebhookDeliveryRepository,
  IKnowledgeWriteRequestRepository,
} from '../ports/knowledge-note-projection.repository';
import { buildRemoteRepositoryObservation } from './remote-repository-observation.policy';
import { KnowledgeDocumentIdentityConflictError } from './knowledge-document-identity.policy';
import {
  KnowledgeRepositoryLeaseCoordinator,
  KnowledgeRepositoryLeaseLostError,
  knowledgeRepositoryConnectionLeaseKey,
  knowledgeRepositoryDeliveryLeaseKey,
} from './knowledge-repository-lease-coordinator';
import type { IKnowledgeProjectionEngine } from './knowledge-projection.engine';

const logger = createLogger('KnowledgeRepositoryProjectionService');
const DEFAULT_RECONCILIATION_INTERVAL_MS = 15 * 60 * 1_000;
const FORCE_PUSH_ERROR = 'GITHUB_FORCE_PUSH_REQUIRES_RECONCILIATION';

export interface KnowledgeDeliveryQueueOptions {
  connectionRepository: IKnowledgeRemoteBindingRepository;
  observationRepository: IRemoteRepositoryObservationRepository;
  historyFenceRepository: IRemoteHistoryFenceRepository;
  projectionCheckpointRepository: IKnowledgeProjectionCheckpointRepository;
  deliveryRepository: IGithubWebhookDeliveryRepository;
  writeRequestRepository?: IKnowledgeWriteRequestRepository;
  githubAppClient: IGitHubAppClient;
  reconciliationIntervalMs?: number;
  reconciliationBatchSize?: number;
}

/**
 * Collaborators owned by the projection service aggregate. The queue calls back
 * into the aggregate for projection persistence and ownership re-checks so the
 * connection lease and delivery ordering stay in one place.
 */
export interface KnowledgeDeliveryQueueHost {
  now: () => number;
  leaseCoordinator: KnowledgeRepositoryLeaseCoordinator;
  projectionEngine: IKnowledgeProjectionEngine;
  findRepository: (
    repositories: GitHubInstallationRepositoryDTO[],
    connection: KnowledgeRemoteBindingServerDTO,
  ) => GitHubInstallationRepositoryDTO | null;
  loadOwnedConnectionById: (
    connectionId: string,
  ) => Promise<KnowledgeRemoteBindingServerDTO | null>;
  saveProjectionCheckpoint: (
    connection: KnowledgeRemoteBindingServerDTO,
    checkpoint: Omit<KnowledgeProjectionCheckpoint, 'bindingId'>,
  ) => Promise<void>;
  saveProjectionFailure: (
    connection: KnowledgeRemoteBindingServerDTO,
    code: string,
    message: string,
  ) => Promise<void>;
  persistObservationUnavailable: (
    connection: KnowledgeRemoteBindingServerDTO,
    reason: Extract<RemoteRepositoryBlockReason, 'InstallationMissing' | 'CheckUnavailable'>,
  ) => Promise<void>;
  persistMissingRepositoryObservation: (
    connection: KnowledgeRemoteBindingServerDTO,
    inventory: Awaited<ReturnType<IGitHubAppClient['getInstallationInventory']>>,
    reason: Extract<RemoteRepositoryBlockReason, 'RepositoryAccessLost'>,
  ) => Promise<void>;
  replayPendingWriteRequests: (connectionId: string) => Promise<void>;
}

/**
 * Managed runtime lifecycle, per-connection delivery serialization and the
 * periodic reconciliation cursor. Lifecycle generation guards every deferred
 * enqueue so a stopped runtime never resumes scheduling work.
 */
export class KnowledgeDeliveryQueue {
  private readonly now: () => number;
  private readonly projectionEngine: IKnowledgeProjectionEngine;
  private readonly leaseCoordinator: KnowledgeRepositoryLeaseCoordinator;
  private readonly reconciliationIntervalMs: number;
  private readonly reconciliationBatchSize: number;
  private readonly inFlight = new Set<string>();
  private readonly connectionQueues = new Map<string, Promise<void>>();
  private running = false;
  private lifecycleGeneration = 0;
  private reconciliationTimer: ReturnType<typeof setInterval> | null = null;
  private reconciliationRun: Promise<void> | null = null;
  private reconciliationCursor: { connectedAt: number; id: string } | null = null;

  constructor(
    private readonly options: KnowledgeDeliveryQueueOptions,
    private readonly host: KnowledgeDeliveryQueueHost,
  ) {
    this.now = host.now;
    this.projectionEngine = host.projectionEngine;
    this.leaseCoordinator = host.leaseCoordinator;
    this.reconciliationIntervalMs =
      options.reconciliationIntervalMs ?? DEFAULT_RECONCILIATION_INTERVAL_MS;
    this.reconciliationBatchSize = options.reconciliationBatchSize ?? 50;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const generation = ++this.lifecycleGeneration;
    void this.startManagedRuntime(generation);
    if (this.reconciliationIntervalMs > 0) {
      this.reconciliationTimer = setInterval(() => {
        if (this.isManagedRuntimeActive(generation)) void this.reconcileNow();
      }, this.reconciliationIntervalMs);
      this.reconciliationTimer.unref?.();
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.lifecycleGeneration += 1;
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
    this.reconciliationTimer = null;
  }

  isRunning(): boolean {
    return this.running;
  }

  async reconcileNow(): Promise<void> {
    if (this.reconciliationRun) return this.reconciliationRun;
    const run = this.reconcileCandidates();
    this.reconciliationRun = run;
    try {
      await run;
    } finally {
      if (this.reconciliationRun === run) this.reconciliationRun = null;
    }
  }

  enqueue(deliveryId: string, connectionId: string): void {
    if (this.inFlight.has(deliveryId)) return;
    this.inFlight.add(deliveryId);
    const queued = this.queueConnectionTask(connectionId, () => this.processDelivery(deliveryId));
    const cleanup = (): void => {
      this.inFlight.delete(deliveryId);
    };
    void queued.then(cleanup, cleanup);
  }

  private queueConnectionTask(connectionId: string, task: () => Promise<void>): Promise<void> {
    const previous = this.connectionQueues.get(connectionId) ?? Promise.resolve();
    const queued = previous.catch(() => undefined).then(task);
    this.connectionQueues.set(connectionId, queued);
    const cleanup = (): void => {
      if (this.connectionQueues.get(connectionId) === queued) {
        this.connectionQueues.delete(connectionId);
      }
    };
    void queued.then(cleanup, cleanup);
    return queued;
  }

  private async startManagedRuntime(generation: number): Promise<void> {
    try {
      await this.recoverPending(generation);
      if (this.isManagedRuntimeActive(generation)) await this.reconcileNow();
    } catch (error) {
      logger.warn('Knowledge projection runtime startup failed', { error });
    }
  }

  private isManagedRuntimeActive(generation: number): boolean {
    return this.running && this.lifecycleGeneration === generation;
  }

  private async recoverPending(generation: number): Promise<void> {
    try {
      const pending = await this.options.deliveryRepository.listPending(50);
      if (!this.isManagedRuntimeActive(generation)) return;
      pending.forEach((delivery) => this.enqueue(delivery.id, delivery.connectionId));
    } catch (error) {
      // Startup recovery is best effort; the next managed runtime restart or
      // reconciliation pass will retry persisted Received deliveries.
      logger.warn('Knowledge projection delivery recovery failed', { error });
    }
  }

  private async reconcileCandidates(): Promise<void> {
    try {
      const pending = await this.options.deliveryRepository.listPending(
        this.reconciliationBatchSize,
      );
      pending.forEach((delivery) => this.enqueue(delivery.id, delivery.connectionId));
      const cursor = this.reconciliationCursor;
      let candidates = cursor
        ? await this.options.connectionRepository.listProjectionCandidates(
            this.reconciliationBatchSize,
            cursor,
          )
        : await this.options.connectionRepository.listProjectionCandidates(
            this.reconciliationBatchSize,
          );
      if (!candidates.length && cursor) {
        this.reconciliationCursor = null;
        candidates = await this.options.connectionRepository.listProjectionCandidates(
          this.reconciliationBatchSize,
        );
      }
      const last = candidates[candidates.length - 1];
      if (last) {
        this.reconciliationCursor = { connectedAt: Number(last.connectedAt), id: last.id };
      }
      await Promise.all(
        candidates.map((connection) =>
          this.queueConnectionTask(connection.id, async () => {
            await this.reconcileConnection(connection.id);
            // Automatic replay: Committed write requests whose projection is
            // Pending/Failed are replayed during the reconciliation cycle.
            await this.host.replayPendingWriteRequests(connection.id);
          }),
        ),
      );
    } catch (error) {
      logger.warn('Periodic knowledge projection reconciliation failed', { error });
    }
  }

  private async reconcileConnection(connectionId: string): Promise<void> {
    await this.leaseCoordinator.execute(
      knowledgeRepositoryConnectionLeaseKey(connectionId),
      async (guard) => this.reconcileConnectionOwned(connectionId, guard),
    );
  }

  private async reconcileConnectionOwned(
    connectionId: string,
    guard: { ensureHeld(): Promise<void> },
  ): Promise<void> {
    const connection = await this.host.loadOwnedConnectionById(connectionId);
    if (!connection) return;
    const attemptAt = this.now();
    let inventory: Awaited<ReturnType<IGitHubAppClient['getInstallationInventory']>>;
    try {
      inventory = await this.options.githubAppClient.getInstallationInventory(
        connection.installationId,
      );
    } catch (error) {
      await this.host.persistObservationUnavailable(
        connection,
        error instanceof GitHubAppClientFailureError && error.failure.kind === 'not_found'
          ? 'InstallationMissing'
          : 'CheckUnavailable',
      );
      return;
    }
    try {
      const repository = this.host.findRepository(inventory.repositories, connection);
      if (!repository) {
        await this.host.persistMissingRepositoryObservation(
          connection,
          inventory,
          'RepositoryAccessLost',
        );
        return;
      }
      const historyFence = await this.options.historyFenceRepository.findByBindingId(connection.id);
      const observation = buildRemoteRepositoryObservation({
        binding: connection,
        inventory,
        repository,
        historyFence,
        observedAt: attemptAt,
      });
      await this.options.observationRepository.save(observation);
      if (observation.eligibility.state !== 'Ready') return;

      let remote: Awaited<ReturnType<IGitHubAppClient['getRepositorySnapshot']>>;
      try {
        remote = await this.options.githubAppClient.getRepositorySnapshot(
          connection.installationId,
          repository,
        );
      } catch {
        await this.host.persistObservationUnavailable(connection, 'CheckUnavailable');
        return;
      }
      const checkpoint = await this.options.projectionCheckpointRepository.findByBindingId(
        connection.id,
      );
      if (!remote.headSha) {
        await this.host.saveProjectionCheckpoint(connection, {
          branch: remote.defaultBranch,
          projectedCommitSha: null,
          state: 'Ready',
          failure: null,
          lastAttemptAt: attemptAt,
          projectedAt: attemptAt,
        });
        return;
      }
      if (checkpoint?.projectedCommitSha === remote.headSha && checkpoint.state === 'Ready') return;

      await this.host.saveProjectionCheckpoint(connection, {
        branch: remote.defaultBranch,
        projectedCommitSha: checkpoint?.projectedCommitSha ?? null,
        state: 'Rebuilding',
        failure: null,
        lastAttemptAt: attemptAt,
        projectedAt: checkpoint?.projectedAt ?? null,
      });
      const snapshot = await this.options.githubAppClient.getFullMarkdownSnapshot(
        connection.installationId,
        repository,
        remote.headSha,
      );
      await guard.ensureHeld();
      await this.projectionEngine.applySnapshot(connection, remote.headSha, snapshot);
      await guard.ensureHeld();
      const projectedAt = this.now();
      await this.host.saveProjectionCheckpoint(connection, {
        branch: remote.defaultBranch,
        projectedCommitSha: remote.headSha,
        state: 'Ready',
        failure: null,
        lastAttemptAt: attemptAt,
        projectedAt,
      });
      await guard.ensureHeld();
      if (this.options.writeRequestRepository) {
        await this.options.writeRequestRepository.markProjectionSucceededByCommit(
          connection.id,
          remote.headSha,
          projectedAt,
        );
      }
    } catch (error) {
      if (error instanceof KnowledgeRepositoryLeaseLostError) return;
      await this.host.saveProjectionFailure(
        connection,
        error instanceof KnowledgeDocumentIdentityConflictError
          ? error.code
          : 'KNOWLEDGE_PROJECTION_RECONCILIATION_FAILED',
        error instanceof Error ? error.message : 'Knowledge projection reconciliation failed',
      );
      logger.warn('Knowledge projection connection reconciliation failed', {
        error,
        connectionId,
      });
    }
  }

  private async processDelivery(deliveryId: string): Promise<void> {
    const initial = await this.options.deliveryRepository.findById(deliveryId);
    if (!initial || initial.status === 'Processed' || initial.status === 'Ignored') return;
    const claimed = await this.leaseCoordinator.execute(
      knowledgeRepositoryDeliveryLeaseKey(deliveryId),
      async (deliveryGuard) => {
        const delivery = await this.options.deliveryRepository.findById(deliveryId);
        if (!delivery || delivery.status === 'Processed' || delivery.status === 'Ignored') {
          return { retry: false, connectionId: initial.connectionId };
        }
        const connection = await this.host.loadOwnedConnectionById(delivery.connectionId);
        if (!connection) {
          await deliveryGuard.ensureHeld();
          await this.options.deliveryRepository.updateStatus(
            deliveryId,
            delivery.connectionId,
            'Ignored',
            'Knowledge repository connection no longer exists',
          );
          return { retry: false, connectionId: delivery.connectionId };
        }
        const connectionClaim = await this.leaseCoordinator.execute(
          knowledgeRepositoryConnectionLeaseKey(connection.id),
          async (connectionGuard) => {
            await this.processDeliveryOwned(delivery, connection, {
              ensureHeld: async () => {
                await deliveryGuard.ensureHeld();
                await connectionGuard.ensureHeld();
              },
            });
          },
        );
        return { retry: !connectionClaim.acquired, connectionId: connection.id };
      },
    );
    if (claimed.acquired && claimed.value?.retry) {
      this.scheduleDeliveryRetry(deliveryId, claimed.value.connectionId);
    }
  }

  private async processDeliveryOwned(
    delivery: GithubWebhookDeliveryRecord,
    connection: KnowledgeRemoteBindingServerDTO,
    guard: { ensureHeld(): Promise<void> },
  ): Promise<void> {
    await guard.ensureHeld();
    await this.options.deliveryRepository.updateStatus(
      delivery.id,
      delivery.connectionId,
      'Processing',
    );

    if (delivery.forced) {
      await guard.ensureHeld();
      await this.host.saveProjectionFailure(
        connection,
        FORCE_PUSH_ERROR,
        'Force push requires full reconciliation',
      );
      await this.options.deliveryRepository.updateStatus(
        delivery.id,
        delivery.connectionId,
        'Failed',
        'Force push requires full reconciliation',
      );
      return;
    }

    let inventory: Awaited<ReturnType<IGitHubAppClient['getInstallationInventory']>>;
    try {
      inventory = await this.options.githubAppClient.getInstallationInventory(
        connection.installationId,
      );
    } catch (error) {
      await this.host.persistObservationUnavailable(connection, 'CheckUnavailable');
      await guard.ensureHeld();
      await this.options.deliveryRepository.updateStatus(
        delivery.id,
        delivery.connectionId,
        'Failed',
        error instanceof Error ? error.message : 'Repository provider observation failed',
      );
      return;
    }

    const repository = this.host.findRepository(inventory.repositories, connection);
    if (!repository) {
      await this.host.persistMissingRepositoryObservation(
        connection,
        inventory,
        'RepositoryAccessLost',
      );
      await guard.ensureHeld();
      await this.options.deliveryRepository.updateStatus(
        delivery.id,
        delivery.connectionId,
        'Failed',
        'Repository is no longer available to the GitHub App installation',
      );
      return;
    }
    const historyFence = await this.options.historyFenceRepository.findByBindingId(connection.id);
    const observation = buildRemoteRepositoryObservation({
      binding: connection,
      inventory,
      repository,
      historyFence,
      observedAt: this.now(),
    });
    await this.options.observationRepository.save(observation);
    if (observation.eligibility.state !== 'Ready') {
      await guard.ensureHeld();
      await this.options.deliveryRepository.updateStatus(
        delivery.id,
        delivery.connectionId,
        'Failed',
        `Repository provider state blocked projection: ${observation.eligibility.reason}`,
      );
      return;
    }

    const afterSha = delivery.afterSha;
    if (!afterSha) {
      await this.options.deliveryRepository.updateStatus(
        delivery.id,
        delivery.connectionId,
        'Failed',
        'Webhook delivery has no after SHA',
      );
      return;
    }
    const attemptAt = this.now();
    const previousCheckpoint = await this.options.projectionCheckpointRepository.findByBindingId(
      connection.id,
    );
    await this.host.saveProjectionCheckpoint(connection, {
      branch: repository.defaultBranch,
      projectedCommitSha: previousCheckpoint?.projectedCommitSha ?? null,
      state: 'Rebuilding',
      failure: null,
      lastAttemptAt: attemptAt,
      projectedAt: previousCheckpoint?.projectedAt ?? null,
    });

    try {
      const changes = await this.options.githubAppClient.getMarkdownChanges(
        connection.installationId,
        repository,
        delivery.beforeSha,
        afterSha,
      );
      await guard.ensureHeld();
      if (changes.requiresFullSnapshot) {
        const snapshot = await this.options.githubAppClient.getFullMarkdownSnapshot(
          connection.installationId,
          repository,
          afterSha,
        );
        await guard.ensureHeld();
        await this.projectionEngine.applySnapshot(connection, afterSha, snapshot);
      } else {
        const deletedPaths = changes.changes
          .filter((change) => change.status === 'removed')
          .map((change) => change.relativePath);
        const notes = changes.changes.flatMap((change) =>
          change.status !== 'removed' && change.markdownContent && change.blobSha
            ? [
                {
                  relativePath: change.relativePath,
                  blobSha: change.blobSha,
                  markdownContent: change.markdownContent,
                  previousPath: change.previousPath ?? null,
                  mutation:
                    change.status === 'added'
                      ? RepositoryNoteMutationType.Created
                      : RepositoryNoteMutationType.ContentUpdated,
                },
              ]
            : [],
        );
        const attachmentChanges = changes.attachmentChanges ?? [];
        const deletedAttachmentPaths = attachmentChanges
          .filter((change) => change.status === 'removed')
          .map((change) => change.relativePath);
        const attachments = attachmentChanges.flatMap((change) =>
          change.status !== 'removed' && change.blobSha && change.mediaType
            ? [
                {
                  relativePath: change.relativePath,
                  blobSha: change.blobSha,
                  byteSize: change.byteSize,
                  mediaType: change.mediaType,
                  previousPath: change.previousPath ?? null,
                },
              ]
            : [],
        );
        await this.projectionEngine.applyChanges(connection, afterSha, {
          notes,
          deletedPaths,
          attachments,
          deletedAttachmentPaths,
        });
      }
      await guard.ensureHeld();
      const projectedAt = this.now();
      await this.host.saveProjectionCheckpoint(connection, {
        branch: repository.defaultBranch,
        projectedCommitSha: afterSha,
        state: 'Ready',
        failure: null,
        lastAttemptAt: attemptAt,
        projectedAt,
      });
      await guard.ensureHeld();
      if (this.options.writeRequestRepository) {
        await this.options.writeRequestRepository.markProjectionSucceededByCommit(
          connection.id,
          afterSha,
          projectedAt,
        );
      }
      await guard.ensureHeld();
      await this.options.deliveryRepository.updateStatus(
        delivery.id,
        delivery.connectionId,
        'Processed',
      );
    } catch (error) {
      if (error instanceof KnowledgeRepositoryLeaseLostError) return;
      await guard.ensureHeld();
      await this.host.saveProjectionFailure(
        connection,
        error instanceof KnowledgeDocumentIdentityConflictError
          ? error.code
          : 'KNOWLEDGE_PROJECTION_INGESTION_FAILED',
        error instanceof Error ? error.message : 'Projection ingestion failed',
      );
      await this.options.deliveryRepository.updateStatus(
        delivery.id,
        delivery.connectionId,
        'Failed',
        error instanceof Error ? error.message : 'Projection ingestion failed',
      );
    }
  }

  private scheduleDeliveryRetry(deliveryId: string, connectionId: string): void {
    if (!this.running) return;
    const generation = this.lifecycleGeneration;
    const timer = setTimeout(() => {
      if (this.isManagedRuntimeActive(generation)) this.enqueue(deliveryId, connectionId);
    }, 250);
    timer.unref?.();
  }
}
