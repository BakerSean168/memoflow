import type {
  NotificationOwnerAttention,
  NotificationOwnerAttentionReader,
} from '@memoflow/notification-contracts';
import type { RoutineOccurrenceTruthStore } from '../../domain/ports/routine-occurrence-truth-store.port';
import type { RoutineTemporaryOverrideStore } from '../../domain/ports/routine-temporary-override-store.port';
import type { JsonValue } from '@memoflow/transport-contracts/result';
import type { RoutineCoachCommandPort } from './routine-coach-command.service';

interface OwnerRef {
  readonly type: string;
  readonly id: string;
}
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
  registerAttentionReader(
    workflowKey: string,
    reader: NotificationOwnerAttentionReader,
  ): () => void;
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
    input.durationMs !== undefined &&
    (!Number.isInteger(input.durationMs) || (input.durationMs as number) <= 0)
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
  attentionReader?: NotificationOwnerAttentionReader,
): () => void {
  const inputSchema = { parse: parseRoutineOccurrenceInput };
  const disposeAttention = attentionReader
    ? registry.registerAttentionReader('routine.intervention', attentionReader)
    : undefined;

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
        metadata: { surface: 'Notification', actionKey: invocation.actionKey } as Readonly<
          Record<string, JsonValue>
        >,
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
        metadata: { surface: 'Notification', actionKey: invocation.actionKey } as Readonly<
          Record<string, JsonValue>
        >,
      });
      return { outcome: 'accepted', commandReceiptId: receipt.interaction.id };
    },
  });

  return () => {
    disposeAttention?.();
    disposeSnooze();
    disposeComplete();
  };
}

/** Routine owns occurrence/snooze truth; Notification only consumes this projection. */
export function createRoutineNotificationAttentionReader(deps: {
  occurrenceTruthStore: RoutineOccurrenceTruthStore;
  temporaryOverrideStore: RoutineTemporaryOverrideStore;
}): NotificationOwnerAttentionReader {
  return async ({ identityId, notifications, now }) => {
    const candidates = notifications.flatMap((notification) => {
      const action = notification.actions?.find(
        (candidate) =>
          candidate.kind === 'owner-command' &&
          candidate.owner.type === 'routine-occurrence' &&
          candidate.commandKey === 'routine.complete',
      );
      if (action?.kind !== 'owner-command') return [];
      try {
        const input = parseRoutineOccurrenceInput(action.input);
        if (input.occurrenceKey !== action.owner.id) return [];
        return [{ notification, input }];
      } catch {
        return [];
      }
    });
    const occurrences = await deps.occurrenceTruthStore.listOccurrences({ identityId });
    const occurrenceByKey = new Map(
      occurrences
        .filter((occurrence) => occurrence.identityId === identityId)
        .map((occurrence) => [
          JSON.stringify([occurrence.routineId, occurrence.occurrenceKey]),
          occurrence,
        ]),
    );
    const overrides = new Map(
      await Promise.all(
        [...new Set(candidates.map(({ input }) => input.routineId))].map(
          async (routineId) =>
            [
              routineId,
              await deps.temporaryOverrideStore.findRoutineTemporaryOverride({
                identityId,
                routineId,
              }),
            ] as const,
        ),
      ),
    );
    const result = new Map<string, NotificationOwnerAttention>();
    for (const { notification, input } of candidates) {
      const groupKey = JSON.stringify([input.routineId, input.occurrenceKey]);
      const occurrence = occurrenceByKey.get(groupKey);
      if (!occurrence) continue;
      const override = overrides.get(input.routineId);
      const snoozeUntil = override?.snoozeUntil == null ? 0 : Number(override.snoozeUntil);
      const suppressUntil = override?.suppressUntil == null ? 0 : Number(override.suppressUntil);
      const dueAt = Math.max(Number(occurrence.becameDueAt), snoozeUntil, suppressUntil);
      const open = occurrence.resolutionState === 'Open';
      result.set(String(notification.id), {
        groupKey,
        needsAction: open && dueAt <= now,
        nextAttentionAt: open && dueAt > now ? dueAt : null,
      });
    }
    return result;
  };
}
