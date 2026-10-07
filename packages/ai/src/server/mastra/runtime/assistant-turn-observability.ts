import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { AIExecutionRecordInput, IAIExecutionRecordPort } from '../../application/ports';
import type { ResolvedAIModel } from '../models';
import {
  createAssistantExecutionRecord,
  createAssistantPhaseExecutionRecord,
  type AssistantExecutionPhase,
  type AssistantTurnOutcome,
  type AssistantUsageSnapshot,
} from './assistant-observability';

type Outcome = AIExecutionRecordInput['outcome'];

/** Side-channel timing and writes; never owns a native turn or an approval gate. */
export class AssistantTurnObservability {
  private readonly writes: Promise<void>[] = [];
  private firstActivityAt?: number;
  private firstTokenAt?: number;
  private transportRecorded = false;
  private providerStartedAt?: number;
  private readonly tools = new Map<string, number>();
  private readonly approvals = new Map<string, number>();

  constructor(
    private readonly input: {
      identityId: string;
      conversationId: string;
      context?: ExecutionContext;
      model: ResolvedAIModel;
      runId: () => string;
      startedAt: number;
      port?: IAIExecutionRecordPort;
    },
  ) {}

  private phase(
    phase: AssistantExecutionPhase,
    processingMs: number,
    outcome: Outcome = 'succeeded',
    errorCategory?: string,
  ): void {
    if (!this.input.port) return;
    this.writes.push(
      this.input.port.record(
        createAssistantPhaseExecutionRecord({
          ...this.input,
          runId: this.input.runId(),
          phase,
          processingMs,
          outcome,
          errorCategory,
        }),
      ),
    );
  }

  private transport(now: number, outcome: Outcome = 'succeeded', errorCategory?: string): void {
    if (this.transportRecorded) return;
    this.transportRecorded = true;
    this.phase('transport', now - this.input.startedAt, outcome, errorCategory);
  }

  private activity(now: number): void {
    if (this.firstActivityAt !== undefined) return;
    this.firstActivityAt = now;
    this.phase('first_activity', now - this.input.startedAt);
  }

  private finishProvider(
    now: number,
    outcome: Outcome = 'succeeded',
    errorCategory?: string,
  ): void {
    if (this.providerStartedAt === undefined) return;
    this.phase('provider_inference', now - this.providerStartedAt, outcome, errorCategory);
    this.providerStartedAt = undefined;
  }

  started(now: number): void {
    this.transport(now);
    this.activity(now);
    this.providerStartedAt = now;
  }

  firstToken(now = Date.now()): void {
    this.finishProvider(now);
    if (this.firstTokenAt !== undefined) return;
    this.firstTokenAt = now;
    this.phase('first_token', now - this.input.startedAt);
  }

  toolActivity(now: number): void {
    this.activity(now);
    this.finishProvider(now);
  }

  approvalRequired(id: string, now: number): void {
    if (!this.approvals.has(id)) this.approvals.set(id, now);
  }

  approvalResolved(id: string, decision: 'approve' | 'decline', now = Date.now()): void {
    const started = this.approvals.get(id);
    if (started === undefined) return;
    this.phase(
      'approval_wait',
      now - started,
      decision === 'approve' ? 'succeeded' : 'cancelled',
      decision === 'approve' ? undefined : 'approval_declined',
    );
    this.approvals.delete(id);
  }

  toolStarted(id: string, now: number): void {
    this.approvalResolved(id, 'approve', now);
    if (!this.tools.has(id)) this.tools.set(id, now);
  }

  toolEnded(
    id: string,
    isError: boolean | undefined,
    denied: boolean | undefined,
    now: number,
  ): void {
    const started = this.tools.get(id);
    if (started !== undefined) {
      this.phase(
        'tool',
        now - started,
        isError ? 'failed' : denied ? 'cancelled' : 'succeeded',
        isError ? 'tool_failed' : denied ? 'tool_denied' : undefined,
      );
      this.tools.delete(id);
    }
    this.providerStartedAt = now;
  }

  finishPhases(type: AssistantTurnOutcome, runtimeErrorCode?: string): void {
    const now = Date.now();
    const outcome =
      type === 'assistant.run.completed'
        ? 'succeeded'
        : type === 'assistant.run.cancelled'
          ? 'cancelled'
          : 'failed';
    const errorCategory = type === 'assistant.run.cancelled' ? 'aborted' : runtimeErrorCode;
    this.transport(now, outcome, errorCategory);
    this.finishProvider(now, outcome, errorCategory);
    for (const [phase, pending] of [
      ['tool', this.tools],
      ['approval_wait', this.approvals],
    ] as const) {
      for (const started of pending.values()) {
        this.phase(
          phase,
          now - started,
          outcome === 'succeeded' ? 'failed' : outcome,
          outcome === 'succeeded'
            ? phase === 'tool'
              ? 'tool_phase_incomplete'
              : 'approval_phase_incomplete'
            : errorCategory,
        );
      }
      pending.clear();
    }
  }

  recordOutcome(
    type: AssistantTurnOutcome,
    usage?: AssistantUsageSnapshot,
    runtimeErrorCode?: string,
  ): void {
    if (this.input.port)
      this.writes.push(
        this.input.port.record(
          createAssistantExecutionRecord({
            ...this.input,
            runId: this.input.runId(),
            outcome: type,
            usage,
            runtimeErrorCode,
            processingMs: Date.now() - this.input.startedAt,
          }),
        ),
      );
  }

  async flush(): Promise<void> {
    await Promise.allSettled(this.writes);
  }
}
