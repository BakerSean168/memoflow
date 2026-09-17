import type { JsonValue } from '@memoflow/contracts/result';
import type { RoutineCoachCommandPort } from './routine-coach-command.service';

interface OwnerRef { readonly type: string; readonly id: string }
interface Invocation<TInput> {
  readonly identityId: string;
  readonly notificationId: string;
  readonly workflowKey: string;
  readonly actionKey: string;
  readonly owner: OwnerRef;
  readonly commandKey: string;
  readonly input: TInput;
  readonly idempotencyKey: string;
}
interface Receipt {
  readonly outcome: 'accepted' | 'rejected';
  readonly commandReceiptId?: string | null;
  readonly reason?: string;
}
interface Registration<TInput> {
  readonly workflowKey: string;
  readonly ownerType: string;
  readonly commandKey: string;
  readonly inputSchema?: { parse(value: unknown): TInput };
  readonly execute: (invocation: Invocation<TInput>) => Promise<Receipt>;
}
export interface RoutineNotificationOwnerCommandRegistry {
  register<TInput>(registration: Registration<TInput>): () => void;
}

interface RoutineOccurrenceActionInput {
  readonly routineId: string;
  readonly occurrenceKey: string;
  readonly durationMs?: number;
}

function parseRoutineOccurrenceInput(value: unknown): RoutineOccurrenceActionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Routine notification command input must be an object');
  }
  const input = value as Record<string, unknown>;
  if (typeof input.routineId !== 'string' || input.routineId.length === 0) {
    throw new TypeError('routineId is required');
  }
  if (typeof input.occurrenceKey !== 'string' || input.occurrenceKey.length === 0) {
    throw new TypeError('occurrenceKey is required');
  }
  if (
    input.durationMs !== undefined
    && (!Number.isInteger(input.durationMs) || (input.durationMs as number) <= 0)
  ) {
    throw new TypeError('durationMs must be a positive integer');
  }
  return {
    routineId: input.routineId,
    occurrenceKey: input.occurrenceKey,
    ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs as number }),
  };
}

function assertOwnerMatches(invocation: Invocation<RoutineOccurrenceActionInput>): void {
  if (invocation.owner.id !== invocation.input.occurrenceKey) {
    throw new Error('Routine notification owner reference does not match occurrenceKey');
  }
}

/**
 * Registers Routine-owned commands into a host-provided Notification action registry.
 * Notification supplies provenance/idempotency; all business mutation still enters
 * RoutineCoachCommandPort and therefore RoutineOccurrenceTruthStore.
 */
export function registerRoutineNotificationOwnerCommands(
  registry: RoutineNotificationOwnerCommandRegistry,
  routineCommandPort: RoutineCoachCommandPort,
): () => void {
  const inputSchema = { parse: parseRoutineOccurrenceInput };

  const disposeComplete = registry.register<RoutineOccurrenceActionInput>({
    workflowKey: 'routine.intervention',
    ownerType: 'routine-occurrence',
    commandKey: 'routine.complete',
    inputSchema,
    execute: async (invocation) => {
      assertOwnerMatches(invocation);
      const receipt = await routineCommandPort.respondToOccurrence({
        commandId: invocation.idempotencyKey,
        identityId: invocation.identityId,
        routineId: invocation.input.routineId,
        occurrenceKey: invocation.input.occurrenceKey,
        action: 'complete',
        metadata: { surface: 'Notification', actionKey: invocation.actionKey } as Readonly<Record<string, JsonValue>>,
      });
      return { outcome: 'accepted', commandReceiptId: receipt.interaction.id };
    },
  });

  const disposeSnooze = registry.register<RoutineOccurrenceActionInput>({
    workflowKey: 'routine.intervention',
    ownerType: 'routine-occurrence',
    commandKey: 'routine.snooze',
    inputSchema,
    execute: async (invocation) => {
      assertOwnerMatches(invocation);
      if (!invocation.input.durationMs) {
        return { outcome: 'rejected', reason: 'snooze-duration-required' };
      }
      const receipt = await routineCommandPort.respondToOccurrence({
        commandId: invocation.idempotencyKey,
        identityId: invocation.identityId,
        routineId: invocation.input.routineId,
        occurrenceKey: invocation.input.occurrenceKey,
        action: 'snooze',
        snoozeDurationMs: invocation.input.durationMs,
        metadata: { surface: 'Notification', actionKey: invocation.actionKey } as Readonly<Record<string, JsonValue>>,
      });
      return { outcome: 'accepted', commandReceiptId: receipt.interaction.id };
    },
  });

  return () => {
    disposeSnooze();
    disposeComplete();
  };
}
