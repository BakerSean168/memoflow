import { MinHeap } from '@memoflow/patterns/scheduler';
import type { IScheduleTimer } from '@memoflow/patterns/scheduler';
import { NodeTimer } from '@memoflow/patterns/scheduler';
import type { IScheduledInvocationRepository } from '../../domain/repositories/i-scheduled-invocation-repository';
import type { ScheduledInvocation } from '@memoflow/schedule-contracts';
import {
  DEFAULT_SCHEDULER_EXECUTION_DOMAIN,
  resolveSchedulerExecutionDomain,
  type SchedulerExecutionDomain,
} from '../../../scheduling';
import { generateUUID } from '@memoflow/utils/shared';

interface InvocationQueueItem {
  taskId: string;
  nextRunAt: number;
  identityId: string;
  executionDomain: SchedulerExecutionDomain;
}

export interface ScheduledInvocationRuntimeOptions {
  readonly repository: IScheduledInvocationRepository;
  readonly handlerRegistry: {
    execute(
      context: ScheduledInvocation['payload'] extends never
        ? never
        : {
            identityId: string;
            owner: { identityId: string; type: string; id: string };
            schedulingKey: string;
            handlerKey: string;
            runAt: number;
            payloadVersion: number;
            payload: unknown;
            sourceRevision?: number | string;
          },
    ): Promise<{
      status: 'succeeded' | 'skipped' | 'retryable' | 'failed' | 'dead_letter';
      result?: Record<string, unknown>;
      reason?: string;
      failure?: { code: string; message: string; retryable: boolean };
    }>;
  };
  readonly leaseCoordinator?: { isLeaseHeld?(): boolean };
  readonly timer?: IScheduleTimer;
  readonly workerId?: string;
  readonly claimTtlMs?: number;
  /**
   * Execution domain of this host. A host only claims invocations whose
   * stamped domain matches; `undefined` disables the gate (test hosts).
   */
  readonly executionDomain?: SchedulerExecutionDomain;
  /**
   * Whether another host can execute this identity's cloud-domain work. A
   * `local` host without a cloud peer (guest or never-synced profile) owns
   * every domain, so its durable work still runs with no cloud session.
   */
  readonly hasPeerExecutor?: () => boolean | Promise<boolean>;
  readonly shouldExecuteIdentity?: (identityId: string) => boolean | Promise<boolean>;
}

export class ScheduledInvocationQueue {
  private readonly timer: IScheduleTimer;
  private readonly heap = new MinHeap<InvocationQueueItem>();
  private currentTimer: unknown = null;
  private running = false;
  private executing = false;

  constructor(private readonly options: ScheduledInvocationRuntimeOptions) {
    this.timer = options.timer ?? new NodeTimer();
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.reload();
    this.schedule();
  }

  async reload(): Promise<void> {
    const now = this.timer.now();
    await this.options.repository.recoverExpiredClaims(now, 1000);
    const invocations = await this.options.repository.findRunnable();
    for (const invocation of invocations) this.add(invocation);
  }

  stop(): void {
    this.running = false;
    if (this.currentTimer) this.timer.clearTimeout(this.currentTimer);
    this.currentTimer = null;
  }

  async drain(): Promise<void> {
    this.running = false;
    while (this.executing) await new Promise((resolve) => setTimeout(resolve, 5));
  }

  add(invocation: ScheduledInvocation): void {
    const dueAt = invocation.nextAttemptAt ?? invocation.runAt;
    this.heap.remove(invocation.id);
    this.heap.insert({
      taskId: invocation.id,
      nextRunAt: dueAt,
      identityId: invocation.identityId,
      executionDomain:
        resolveSchedulerExecutionDomain(invocation.observability.tags) ??
        DEFAULT_SCHEDULER_EXECUTION_DOMAIN,
    });
    if (this.running && !this.executing) this.schedule();
  }

  remove(invocationId: string): void {
    this.heap.remove(invocationId);
  }

  private schedule(): void {
    if (!this.running) return;
    if (this.currentTimer) this.timer.clearTimeout(this.currentTimer);
    const item = this.heap.peek();
    if (!item) return;
    const delay = Math.max(0, item.nextRunAt - this.timer.now());
    this.currentTimer = this.timer.setTimeout(() => void this.executeNext(), delay);
  }

  private async executeNext(): Promise<void> {
    if (!this.running) return;
    const item = this.heap.extractMin();
    if (!item) return this.schedule();
    this.executing = true;
    try {
      // 单一执行者：只认领属于本宿主执行域的 invocation。云端域的工作由 API
      // Scheduler 执行，桌面域的工作由桌面执行；两端不会同时认领同一条。
      // 没有云端同侪的本地宿主（访客/未同步 Profile）仍拥有全部执行域。
      if (
        this.options.executionDomain !== undefined &&
        item.executionDomain !== this.options.executionDomain
      ) {
        const localOwnsEveryDomain =
          this.options.executionDomain === 'local' &&
          this.options.hasPeerExecutor !== undefined &&
          !(await this.options.hasPeerExecutor());
        if (!localOwnsEveryDomain) return;
      }
      if (
        this.options.shouldExecuteIdentity &&
        !(await this.options.shouldExecuteIdentity(item.identityId))
      ) {
        return;
      }
      const now = this.timer.now();
      const claim = await this.options.repository.claimAndStart({
        invocationId: item.taskId,
        identityId: item.identityId,
        claimToken: generateUUID(),
        claimExpiresAt: now + (this.options.claimTtlMs ?? 60_000),
        now,
        workerId: this.options.workerId ?? null,
      });
      if (claim) await this.executeClaim(claim);
    } finally {
      this.executing = false;
      this.schedule();
    }
  }

  private async executeClaim(claim: {
    invocation: ScheduledInvocation;
    attempt: { attemptNumber: number; claimToken: string | null; fencingToken: number | null };
  }): Promise<void> {
    const invocation = claim.invocation;
    let result: Awaited<
      ReturnType<ScheduledInvocationRuntimeOptions['handlerRegistry']['execute']>
    >;
    try {
      result = await this.options.handlerRegistry.execute({
        identityId: invocation.identityId,
        owner: {
          identityId: invocation.identityId,
          type: invocation.ownerType,
          id: invocation.ownerId,
        },
        schedulingKey: invocation.schedulingKey,
        handlerKey: invocation.handlerKey,
        runAt: invocation.runAt,
        payloadVersion: invocation.payloadVersion,
        payload: invocation.payload,
        ...(invocation.sourceRevision === null
          ? {}
          : { sourceRevision: invocation.sourceRevision }),
      });
    } catch (error) {
      result = {
        status: 'retryable',
        failure: {
          code: 'HANDLER_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
        },
      };
    }
    const retryable = result.status === 'retryable';
    const attemptsUsed = claim.attempt.attemptNumber;
    const mayRetry =
      retryable &&
      invocation.retryPolicy.enabled &&
      attemptsUsed <= invocation.retryPolicy.maxRetries;
    const delay = Math.min(
      invocation.retryPolicy.maxDelayMs,
      invocation.retryPolicy.initialDelayMs *
        Math.pow(invocation.retryPolicy.backoffMultiplier, Math.max(0, attemptsUsed - 1)),
    );
    const nextAttemptAt = mayRetry ? this.timer.now() + delay : null;
    const status =
      result.status === 'succeeded'
        ? 'succeeded'
        : result.status === 'skipped'
          ? 'skipped'
          : result.status === 'failed'
            ? 'failed'
            : result.status === 'dead_letter'
              ? 'dead_letter'
              : mayRetry
                ? 'retry_wait'
                : 'dead_letter';
    await this.options.repository.completeAttempt({
      invocationId: invocation.id,
      identityId: invocation.identityId,
      claimToken: claim.attempt.claimToken ?? '',
      fencingToken: claim.attempt.fencingToken ?? 0,
      attemptNumber: claim.attempt.attemptNumber,
      outcome:
        result.status === 'succeeded'
          ? 'succeeded'
          : result.status === 'skipped'
            ? 'skipped'
            : retryable
              ? 'retryable_failure'
              : result.status === 'dead_letter' || result.status === 'failed'
                ? 'permanent_failure'
                : 'timeout',
      status,
      nextAttemptAt,
      finishedAt: this.timer.now(),
      result: result.result ?? null,
      failureCode: result.failure?.code ?? null,
      failureMessage: result.failure?.message ?? ('reason' in result ? result.reason : null),
      failureRetryable: result.failure?.retryable ?? null,
    });
    if (status === 'retry_wait') {
      this.add({ ...invocation, status, nextAttemptAt });
    }
  }
}
