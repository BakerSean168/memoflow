import type { IAccountRepository, IAccountClosureOperationRepository } from '../domain';
import {
  ListAccountsUseCase,
  GetAccountProfileUseCase,
  UpdateAccountProfileUseCase,
  CloseAccountUseCase,
  AccountClosureCoordinator,
  type CloudAuthRevocationPort,
  type AccountClosureEventPublisher,
} from '../application';
import type { Clock } from '@memoflow/time';
import type { AccountApplicationPort } from '../application';
import type { OperationAuditRepository } from '@memoflow/patterns/operations';
import {
  runTimelineQueryWithAudit,
  globalUnifiedOperationMetrics,
} from '@memoflow/patterns/operations';
import type { OperationTimelineEntry, OperationAuditRecord } from '@memoflow/contracts/operations';
import { OperationTimelineEntrySchema } from '@memoflow/contracts/operations';
import { ok, fail } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import type { AccountClosureOperationRecord } from '../domain/repositories/i-account-closure-operation-repository';

const logger = createLogger('AccountModule');

/** Explicit dependencies required by the account runtime. */
export interface AccountModuleDependencies {
  readonly accountRepository: IAccountRepository;
  readonly closureOperationRepository?: IAccountClosureOperationRepository;
  readonly revocationPort?: CloudAuthRevocationPort;
  readonly eventPublisher?: AccountClosureEventPublisher;
  readonly coordinator?: AccountClosureCoordinator;
  readonly clock: Clock;
  readonly laneCapability?: 'api' | 'desktop';
  readonly runtimeContributions?:
    AccountModuleRuntimeContribution | readonly AccountModuleRuntimeContribution[];
  /** W7：审计仓库（最小权限 + 审计） */
  readonly auditRepository?: OperationAuditRepository;
}

/** Module-owned side effects that start and stop with an account module instance. */
export interface AccountModuleRuntimeContribution {
  start(): void;
  stop(): void;
}

/** Lower-level assembled use cases kept for tests and diagnostics. */
export interface AccountModuleUseCases {
  readonly listAccounts: ListAccountsUseCase;
  readonly getProfile: GetAccountProfileUseCase;
  readonly updateProfile: UpdateAccountProfileUseCase;
  readonly closeAccount: CloseAccountUseCase;
}

export interface AccountModuleInstance {
  readonly accountRepository: IAccountRepository;
  readonly useCases: AccountModuleUseCases;
  readonly api: AccountApplicationPort;
  start(): void;
  dispose(): void;
}

/**
 * Pure assembly helper.
 */
export function createAccountUseCases(
  dependencies: AccountModuleDependencies,
): AccountModuleUseCases {
  const { accountRepository, clock, laneCapability = 'api' } = dependencies;

  let coordinator: AccountClosureCoordinator | null = dependencies.coordinator ?? null;

  if (!coordinator) {
    if (
      dependencies.closureOperationRepository &&
      dependencies.revocationPort &&
      dependencies.eventPublisher
    ) {
      coordinator = new AccountClosureCoordinator({
        accountRepository,
        closureOperationRepository: dependencies.closureOperationRepository,
        revocationPort: dependencies.revocationPort,
        eventPublisher: dependencies.eventPublisher,
        clock,
        metrics: globalUnifiedOperationMetrics,
      });
    }
  }

  if (!coordinator) {
    if (laneCapability === 'desktop') {
      // Desktop lane capability declaration: closure is delegated to Cloud API
      coordinator = {
        async execute(): Promise<never> {
          throw new Error('Account closure must be initiated through the Cloud API endpoint');
        },
      } as unknown as AccountClosureCoordinator;
    } else {
      // API lane fail-fast check
      throw new Error(
        'CloseAccountUseCase requires AccountClosureCoordinator or (closureOperationRepository, revocationPort, eventPublisher) to be explicitly provided on API lane.',
      );
    }
  }

  return {
    listAccounts: new ListAccountsUseCase(accountRepository),
    getProfile: new GetAccountProfileUseCase(accountRepository),
    updateProfile: new UpdateAccountProfileUseCase(accountRepository, clock),
    closeAccount: new CloseAccountUseCase(coordinator),
  };
}

function normalizeRuntimeContributions(
  runtimeContributions?:
    AccountModuleRuntimeContribution | readonly AccountModuleRuntimeContribution[],
): readonly AccountModuleRuntimeContribution[] {
  if (!runtimeContributions) {
    return [];
  }

  if (Array.isArray(runtimeContributions)) {
    return Array.from(runtimeContributions);
  }

  return [runtimeContributions as AccountModuleRuntimeContribution];
}

/**
 * Canonical account composition root.
 */
export function createAccountModule(
  dependencies: AccountModuleDependencies,
): AccountModuleInstance {
  const { accountRepository } = dependencies;
  const runtimeContributions = normalizeRuntimeContributions(dependencies.runtimeContributions);
  const useCases = createAccountUseCases(dependencies);
  const auditRepository = dependencies.auditRepository;

  let started = false;

  return {
    accountRepository,
    useCases,
    api: {
      listAccounts: (options) => useCases.listAccounts.execute(options),
      getProfile: (cx) => useCases.getProfile.execute(cx),
      updateProfile: (data, cx) => useCases.updateProfile.execute(data, cx),
      closeAccount: (data, cx) => useCases.closeAccount.execute(data, cx),
      queryClosureTimeline: async (cx) => {
        const operationRepo = dependencies.closureOperationRepository;
        if (!operationRepo || !auditRepository) {
          return fail({
            code: 'FAIL_CLOSED',
            message:
              '[FAIL-CLOSED] account closure timeline requires closureOperationRepository and auditRepository dependencies (timeline_query audit is mandatory).',
          });
        }
        const { entries } = await runTimelineQueryWithAudit({
          repository: auditRepository,
          source: 'account-closure',
          actorIdentityId: cx.identityId,
          filters: { limit: 100 },
          query: () => operationRepo.listByIdentityId(cx.identityId),
        });
        return ok(entries.map(mapClosureRecordToTimelineEntry));
      },
      replayClosure: async (operationId, cx) => {
        const operationRepo = dependencies.closureOperationRepository;
        if (!operationRepo || !auditRepository) {
          return fail({
            code: 'FAIL_CLOSED',
            message:
              '[FAIL-CLOSED] account closure replay requires closureOperationRepository and auditRepository dependencies.',
          });
        }
        try {
          if (!operationRepo.resetForReplayWithAudit) {
            return fail({
              code: 'FAIL_CLOSED',
              message:
                '[FAIL-CLOSED] account closure replay requires a repository implementing atomic resetForReplayWithAudit (state + audit in one transaction).',
            });
          }
          const record = await operationRepo.resetForReplayWithAudit(
            cx.identityId,
            operationId,
            {
              actorIdentityId: cx.identityId,
              source: 'account-closure',
              operationId,
              action: 'replay',
            },
            auditRepository,
          );
          return ok(mapClosureRecordToTimelineEntry(record));
        } catch (err) {
          return fail({
            code: 'NOT_FOUND',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      },
      getOperationAudit: async (cx) => {
        if (!auditRepository) {
          return fail({
            code: 'FAIL_CLOSED',
            message:
              '[FAIL-CLOSED] account operation audit requires an explicit auditRepository dependency.',
          });
        }
        const records: OperationAuditRecord[] = await auditRepository.listByActor({
          identityId: cx.identityId,
        });
        return ok(records);
      },
    },
    start(): void {
      if (started) return;
      const startedContributions: AccountModuleRuntimeContribution[] = [];
      for (const runtime of runtimeContributions) {
        try {
          runtime.start();
          startedContributions.push(runtime);
        } catch (error) {
          // Partial-start rollback: stop the already-started contributions in
          // REVERSE order (best-effort, logged), then rethrow the ORIGINAL
          // error. `started` stays false, so a later dispose() is a no-op —
          // start() owns its partial-start cleanup.
          for (const startedRuntime of [...startedContributions].reverse()) {
            try {
              startedRuntime.stop();
            } catch (stopError) {
              logger.error(
                'AccountModule: contribution stop failed during partial-start rollback',
                stopError,
              );
            }
          }
          throw error;
        }
      }
      started = true;
    },
    dispose(): void {
      if (!started) return;
      for (const runtime of [...runtimeContributions].reverse()) {
        runtime.stop();
      }
      started = false;
    },
  };
}

function mapClosureRecordToTimelineEntry(
  record: AccountClosureOperationRecord,
): OperationTimelineEntry {
  const entry: OperationTimelineEntry = {
    source: 'account-closure',
    operationId: record.id,
    status: normalizeClosureStatus(record.status, record.deadLetterAt),
    failureReason: record.lastError ?? null,
    attempts: record.attempts,
    nextRetryAt: record.nextRetryAt ? record.nextRetryAt.toISOString() : null,
    replayable: record.status === 'failed',
    updatedAt: record.updatedAt.toISOString(),
  };
  return OperationTimelineEntrySchema.parse(entry);
}

function normalizeClosureStatus(
  status: string,
  deadLetterAt: Date | null,
): OperationTimelineEntry['status'] {
  if (deadLetterAt) return 'dead_letter';
  switch (status) {
    case 'running':
      return 'running';
    case 'succeeded':
      return 'succeeded';
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
}
