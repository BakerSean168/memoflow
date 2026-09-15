import type { IAccountRepository } from '../../domain/repositories/i-account-repository';
import type {
  IAccountClosureOperationRepository,
  AccountClosureOperationRecord,
  AccountClosurePhase,
  AccountClosureStatus,
} from '../../domain/repositories/i-account-closure-operation-repository';
import type { CloudAuthRevocationPort } from '../ports/cloud-auth-revocation.port';
import type { AccountClosureEventPublisher } from '../ports/account-closure-event-publisher.port';
import { AccountStatus } from '../../domain/value-objects';
import type { UnifiedOperationMetricsRecorder } from '@memoflow/patterns/operations';
import { accountClosureFailureCode, accountNotFoundForClosure } from './account-closure-failure';
import type { AccountClosureFailureCode } from '../../domain/repositories/i-account-closure-operation-repository';
import type { Clock } from '@memoflow/time';

export interface AccountClosureReceipt {
  operationId: string;
  identityId: string;
  idempotencyKey: string;
  phase: AccountClosurePhase;
  status: AccountClosureStatus;
  retryable: boolean;
  signedOut: boolean;
  attempts: number;
  failureCode: AccountClosureFailureCode | null;
  lastError: string | null;
  createdAt: number;
  finishedAt: number | null;
  revokedSessions?: number;
  piiCleanupStatus?: string | null;
  piiReason?: string | null;
}

export interface AccountClosureOptions {
  reason?: string;
  feedback?: string;
}

export interface AccountClosureCoordinatorDependencies {
  accountRepository: IAccountRepository;
  closureOperationRepository: IAccountClosureOperationRepository;
  revocationPort: CloudAuthRevocationPort;
  eventPublisher: AccountClosureEventPublisher;
  clock: Clock;
  leaseDurationMs?: number;
  enableHeartbeat?: boolean;
  metrics?: UnifiedOperationMetricsRecorder;
}

export class AccountClosureCoordinator {
  private readonly accountRepository: IAccountRepository;
  private readonly closureOperationRepository: IAccountClosureOperationRepository;
  private readonly revocationPort: CloudAuthRevocationPort;
  private readonly eventPublisher: AccountClosureEventPublisher;
  private readonly clock: Clock;
  private readonly leaseDurationMs: number;
  private readonly enableHeartbeat: boolean;
  private readonly metrics: UnifiedOperationMetricsRecorder | undefined;

  constructor(deps: AccountClosureCoordinatorDependencies) {
    this.accountRepository = deps.accountRepository;
    this.closureOperationRepository = deps.closureOperationRepository;
    this.revocationPort = deps.revocationPort;
    this.eventPublisher = deps.eventPublisher;
    this.clock = deps.clock;
    this.leaseDurationMs = deps.leaseDurationMs ?? 30000;
    this.enableHeartbeat = deps.enableHeartbeat ?? true;
    this.metrics = deps.metrics;
  }

  async execute(
    identityId: string,
    idempotencyKey: string,
    options?: AccountClosureOptions,
  ): Promise<AccountClosureReceipt> {
    const now = new Date(this.clock.now());
    const leaseDurationMs = this.leaseDurationMs;
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
    const ownerToken = crypto.randomUUID();

    const existing = await this.closureOperationRepository.findByIdentityAndIdempotencyKey(
      identityId,
      idempotencyKey,
    );

    let record: AccountClosureOperationRecord;

    if (existing) {
      if (existing.status === 'succeeded') {
        return this.toReceipt(existing);
      }

      if (existing.status === 'running') {
        const claimed = await this.closureOperationRepository.claimOwnership({
          id: existing.id,
          identityId: existing.identityId,
          ownerToken,
          leaseExpiresAt,
          now,
          expectedStatus: 'running',
        });
        if (!claimed) {
          const current = await this.closureOperationRepository.findByIdentityAndIdempotencyKey(
            identityId,
            idempotencyKey,
          );
          return this.toReceipt(current ?? existing);
        }
        this.metrics?.recordOutbox('account-closure', 'claimed');
        record = {
          ...existing,
          ownerToken,
          leaseExpiresAt,
          status: 'running',
        };
      } else if (existing.status === 'failed') {
        const claimed = await this.closureOperationRepository.claimOwnership({
          id: existing.id,
          identityId: existing.identityId,
          ownerToken,
          leaseExpiresAt,
          now,
          expectedStatus: 'failed',
        });
        if (!claimed) {
          const current = await this.closureOperationRepository.findByIdentityAndIdempotencyKey(
            identityId,
            idempotencyKey,
          );
          return this.toReceipt(current ?? existing);
        }
        // P1-5：failed → running 的重新认领是一次 retry，不得笼统计为 failed。
        this.metrics?.recordOutbox('account-closure', 'retried');
        record = {
          ...existing,
          ownerToken,
          leaseExpiresAt,
          status: 'running',
          attempts: existing.attempts + 1,
          lastErrorCode: null,
          lastError: null,
        };
      } else {
        record = existing;
      }
    } else {
      record = {
        id: crypto.randomUUID(),
        identityId,
        idempotencyKey,
        phase: 'requested',
        status: 'running',
        attempts: 1,
        version: 1,
        ownerToken,
        leaseExpiresAt,
        nextRetryAt: null,
        deadLetterAt: null,
        eventId: null,
        reason: options?.reason ?? null,
        revokedSessions: 0,
        piiCleanupStatus: null,
        lastErrorCode: null,
        lastError: null,
        receiptJson: null,
        createdAt: now,
        updatedAt: now,
        finishedAt: null,
      };

      const created = await this.closureOperationRepository.create(record);
      this.metrics?.recordOutbox('account-closure', 'persisted');
      if (!created) {
        const competitor = await this.closureOperationRepository.findByIdentityAndIdempotencyKey(
          identityId,
          idempotencyKey,
        );
        if (!competitor) {
          throw new Error('Concurrent operation race detected but record not found');
        }
        if (competitor.status === 'succeeded') {
          return this.toReceipt(competitor);
        }

        const claimed = await this.closureOperationRepository.claimOwnership({
          id: competitor.id,
          identityId: competitor.identityId,
          ownerToken,
          leaseExpiresAt,
          now,
        });
        if (!claimed) {
          const latest = await this.closureOperationRepository.findByIdentityAndIdempotencyKey(
            identityId,
            idempotencyKey,
          );
          return this.toReceipt(latest ?? competitor);
        }
        record = {
          ...competitor,
          ownerToken,
          leaseExpiresAt,
          status: 'running',
        };
      }
    }

    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    if (this.enableHeartbeat) {
      const intervalMs = Math.max(50, Math.floor(leaseDurationMs / 3));
      heartbeatTimer = setInterval(async () => {
        try {
          const currentTime = new Date(this.clock.now());
          const nextLease = new Date(currentTime.getTime() + leaseDurationMs);
          const renewed = await this.closureOperationRepository.renewHeartbeat({
            id: record.id,
            identityId: record.identityId,
            ownerToken,
            leaseExpiresAt: nextLease,
            now: currentTime,
          });
          if (!renewed && heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
        } catch {
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
        }
      }, intervalMs);
    }

    try {
      // Phase 1: requested -> revoking
      if (record.phase === 'requested') {
        const newLease = new Date(this.clock.now() + leaseDurationMs);
        const okCAS = await this.closureOperationRepository.updatePhaseCAS({
          id: record.id,
          identityId: record.identityId,
          expectedPhase: 'requested',
          newPhase: 'revoking',
          newStatus: 'running',
          ownerToken,
          leaseExpiresAt: newLease,
        });
        if (okCAS) {
          record.phase = 'revoking';
          record.leaseExpiresAt = newLease;
        } else {
          const latest = await this.closureOperationRepository.findByIdentityAndIdempotencyKey(
            identityId,
            idempotencyKey,
          );
          if (latest) return this.toReceipt(latest);
          throw new Error('CAS failed at requested->revoking transition');
        }
      }

      // Phase 2: revoking -> revoked
      if (record.phase === 'revoking') {
        const stillOwner = await this.heartbeat(record.id, identityId, ownerToken, leaseDurationMs);
        if (!stillOwner) {
          const latest = await this.closureOperationRepository.findByIdentityAndIdempotencyKey(
            identityId,
            idempotencyKey,
          );
          if (latest) return this.toReceipt(latest);
          throw new Error('Ownership lost before revoking side effect');
        }

        let revokedSessionsCount = 0;
        let piiStatus = 'not_performed';
        let piiReason: string | undefined = undefined;

        if (typeof this.revocationPort.revokeAuthentication === 'function') {
          const revResult = await this.revocationPort.revokeAuthentication(identityId);
          revokedSessionsCount = revResult.revokedSessions;
        } else if (typeof this.revocationPort.revokeAll === 'function') {
          const revResult = await this.revocationPort.revokeAll(identityId);
          revokedSessionsCount = revResult.revokedSessions;
        }

        if (typeof this.revocationPort.deleteUserData === 'function') {
          const piiResult = await this.revocationPort.deleteUserData(identityId);
          piiStatus = piiResult.piiCleanupStatus;
          piiReason = piiResult.reason;
        }

        const newLease = new Date(this.clock.now() + leaseDurationMs);
        const okCAS = await this.closureOperationRepository.updatePhaseCAS({
          id: record.id,
          identityId: record.identityId,
          expectedPhase: 'revoking',
          newPhase: 'revoked',
          ownerToken,
          leaseExpiresAt: newLease,
          revokedSessions: revokedSessionsCount,
          piiCleanupStatus: piiStatus,
          piiReason,
        });

        if (okCAS) {
          record.phase = 'revoked';
          record.leaseExpiresAt = newLease;
          record.revokedSessions = revokedSessionsCount;
          record.piiCleanupStatus = piiStatus;
          record.piiReason = piiReason ?? null;
        } else {
          const latest = await this.closureOperationRepository.findByIdentityAndIdempotencyKey(
            identityId,
            idempotencyKey,
          );
          if (latest) return this.toReceipt(latest);
          throw new Error('CAS failed at revoking->revoked transition');
        }
      }

      // Phase 3: revoked -> closing -> closed
      if (record.phase === 'revoked' || record.phase === 'closing') {
        if (record.phase === 'revoked') {
          const newLease = new Date(this.clock.now() + leaseDurationMs);
          const okCAS = await this.closureOperationRepository.updatePhaseCAS({
            id: record.id,
            identityId: record.identityId,
            expectedPhase: 'revoked',
            newPhase: 'closing',
            ownerToken,
            leaseExpiresAt: newLease,
          });
          if (okCAS) {
            record.phase = 'closing';
            record.leaseExpiresAt = newLease;
          } else {
            const latest = await this.closureOperationRepository.findByIdentityAndIdempotencyKey(
              identityId,
              idempotencyKey,
            );
            if (latest) return this.toReceipt(latest);
            throw new Error('CAS failed at revoked->closing transition');
          }
        }

        const account = await this.accountRepository.findById(identityId);
        if (!account) {
          throw accountNotFoundForClosure(identityId);
        }

        if (!AccountStatus.isClosed(account.status)) {
          const stillOwner = await this.heartbeat(
            record.id,
            identityId,
            ownerToken,
            leaseDurationMs,
          );
          if (!stillOwner) {
            const latest = await this.closureOperationRepository.findByIdentityAndIdempotencyKey(
              identityId,
              idempotencyKey,
            );
            if (latest) return this.toReceipt(latest);
            throw new Error('Ownership lost before account close side effect');
          }
          account.close(this.clock.now());
          await this.accountRepository.save(account);
        }

        const newLease = new Date(this.clock.now() + leaseDurationMs);
        const okCAS = await this.closureOperationRepository.updatePhaseCAS({
          id: record.id,
          identityId: record.identityId,
          expectedPhase: 'closing',
          newPhase: 'closed',
          ownerToken,
          leaseExpiresAt: newLease,
        });
        if (okCAS) {
          record.phase = 'closed';
          record.leaseExpiresAt = newLease;
        } else {
          const latest = await this.closureOperationRepository.findByIdentityAndIdempotencyKey(
            identityId,
            idempotencyKey,
          );
          if (latest) return this.toReceipt(latest);
          throw new Error('CAS failed at closing->closed transition');
        }
      }

      // Phase 4: closed -> succeeded
      if (record.phase === 'closed') {
        const account = await this.accountRepository.findById(identityId);
        const serverDto = account
          ? account.toServerDTO()
          : ({
              id: identityId,
            } as unknown as import('@memoflow/contracts/account').AccountServerDTO);

        const finishedNow = new Date(this.clock.now());
        const eventId = record.eventId ?? `closure:${record.id}:closed`;

        await this.eventPublisher.publishAccountClosed({
          identityId,
          accountId: identityId,
          account: serverDto,
          reason: record.reason ?? 'User requested closure',
          closedAt: finishedNow.getTime(),
          eventId,
        });

        record.status = 'succeeded';
        record.finishedAt = finishedNow;
        record.eventId = eventId;

        const receipt = this.toReceipt(record);
        record.receiptJson = JSON.stringify(receipt);

        const okCAS = await this.closureOperationRepository.updatePhaseCAS({
          id: record.id,
          identityId: record.identityId,
          expectedPhase: 'closed',
          newPhase: 'closed',
          newStatus: 'succeeded',
          ownerToken,
          eventId,
          finishedAt: finishedNow,
          receiptJson: record.receiptJson,
        });

        if (!okCAS) {
          const latest = await this.closureOperationRepository.findByIdentityAndIdempotencyKey(
            identityId,
            idempotencyKey,
          );
          if (latest) return this.toReceipt(latest);
        }

        this.metrics?.recordOutbox('account-closure', 'succeeded');
        this.metrics?.recordWorker('account-closure', 'completed');
        return receipt;
      }

      throw new Error(`Unexpected phase progression for operation ${record.id}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Account closure operation failed';
      const failureCode = accountClosureFailureCode(err);
      record.status = 'failed';
      record.lastErrorCode = failureCode;
      record.lastError = errorMessage;
      record.updatedAt = new Date(this.clock.now());

      const failedReceipt = this.toReceipt(record);
      record.receiptJson = JSON.stringify(failedReceipt);
      const okCAS = await this.closureOperationRepository.updatePhaseCAS({
        id: record.id,
        identityId: record.identityId,
        expectedPhase: record.phase,
        newPhase: record.phase,
        newStatus: 'failed',
        ownerToken,
        lastErrorCode: failureCode,
        lastError: errorMessage,
        receiptJson: record.receiptJson,
      });

      if (!okCAS) {
        const latest = await this.closureOperationRepository.findByIdentityAndIdempotencyKey(
          identityId,
          idempotencyKey,
        );
        if (latest) return this.toReceipt(latest);
      }

      this.metrics?.recordOutbox('account-closure', 'failed');
      this.metrics?.recordWorker('account-closure', 'failed');
      return failedReceipt;
    } finally {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
    }
  }

  private async heartbeat(
    recordId: string,
    identityId: string,
    ownerToken: string,
    leaseDurationMs = 30000,
  ): Promise<boolean> {
    const now = new Date(this.clock.now());
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
    return this.closureOperationRepository.claimOwnership({
      id: recordId,
      identityId,
      ownerToken,
      leaseExpiresAt,
      now,
    });
  }

  private toReceipt(record: AccountClosureOperationRecord): AccountClosureReceipt {
    const isSignedOut =
      record.phase === 'revoked' ||
      record.phase === 'closing' ||
      record.phase === 'closed' ||
      record.status === 'succeeded';

    return {
      operationId: record.id,
      identityId: record.identityId,
      idempotencyKey: record.idempotencyKey,
      phase: record.phase,
      status: record.status,
      retryable: record.status === 'failed',
      signedOut: isSignedOut,
      attempts: record.attempts,
      failureCode: record.lastErrorCode ?? null,
      lastError: record.lastError,
      createdAt: record.createdAt.getTime(),
      finishedAt: record.finishedAt ? record.finishedAt.getTime() : null,
      revokedSessions: record.revokedSessions,
      piiCleanupStatus: record.piiCleanupStatus,
      piiReason: record.piiReason ?? null,
    };
  }
}
