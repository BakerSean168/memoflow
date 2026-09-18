import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient, RoutineInteraction, RoutineOccurrence } from '@memoflow/database';
import { buildIdempotencyKeyString } from '@memoflow/contracts/reliable-messaging';
import { asInstant } from '@memoflow/time';
import type {
  ApplyRoutineInteractionInput,
  EnsureRoutineOccurrenceInput,
  ResolveRoutineOccurrenceInput,
  RoutineInteractionApplyReceipt,
  RoutineInteractionFact,
  RoutineOccurrenceFact,
  RoutineOccurrenceTruthStore,
} from '../../domain/ports';
import {
  ROUTINE_INTERACTION_ACTIONS,
  ROUTINE_OCCURRENCE_RESOLUTION_KINDS,
  ROUTINE_OCCURRENCE_RESOLUTION_STATES,
  ROUTINE_OCCURRENCE_TRIGGER_KINDS,
} from '../../domain/ports';
import { serializeRoutineTemporaryOverride } from './trigger-persistence-parity';

const ROUTINE_OCCURRENCE_SOURCE = 'routine';

type RoutineDb = PrismaClient | Prisma.TransactionClient;

function nonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${field} must not be empty`);
  return normalized;
}

function nonNegative(value: number | null | undefined, field: string): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${field} must be non-negative`);
  return value;
}

function positive(value: number | null | undefined, field: string): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${field} must be positive`);
  return value;
}

function assertEnum<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string,
): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new TypeError(`Invalid ${field}: ${value}`);
  }
  return value as T;
}

function parseMetadata(value: string | null): Readonly<Record<string, unknown>> | null {
  if (value == null) return null;
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
    throw new TypeError('Routine interaction metadata must be an object');
  }
  return parsed as Readonly<Record<string, unknown>>;
}

function mapOccurrence(row: RoutineOccurrence): RoutineOccurrenceFact {
  return {
    id: row.id,
    identityId: row.identityId,
    routineId: row.routineId,
    occurrenceKey: row.occurrenceKey,
    triggerKind: assertEnum(row.triggerKind, ROUTINE_OCCURRENCE_TRIGGER_KINDS, 'triggerKind'),
    scheduledFor: row.scheduledFor == null ? null : asInstant(row.scheduledFor.getTime()),
    becameDueAt: asInstant(row.becameDueAt.getTime()),
    sourceRevision: row.sourceRevision,
    resolutionState: assertEnum(
      row.resolutionState,
      ROUTINE_OCCURRENCE_RESOLUTION_STATES,
      'resolutionState',
    ),
    resolvedAt: row.resolvedAt == null ? null : asInstant(row.resolvedAt.getTime()),
    resolutionKind:
      row.resolutionKind == null
        ? null
        : assertEnum(row.resolutionKind, ROUTINE_OCCURRENCE_RESOLUTION_KINDS, 'resolutionKind'),
    resolutionReason: row.resolutionReason,
  };
}

function mapInteraction(row: RoutineInteraction): RoutineInteractionFact {
  return {
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    identityId: row.identityId,
    routineId: row.routineId,
    occurrenceKey: row.occurrenceKey,
    action: assertEnum(row.action, ROUTINE_INTERACTION_ACTIONS, 'interaction action'),
    actedAt: asInstant(row.actedAt.getTime()),
    responseLatencyMs: row.responseLatencyMs,
    snoozeDurationMs: row.snoozeDurationMs,
    metadata: parseMetadata(row.metadataJson),
  };
}

function assertInteractionReplayMatches(
  row: RoutineInteraction,
  input: ApplyRoutineInteractionInput,
  snoozeDurationMs: number | null,
): void {
  if (
    row.identityId !== input.identityId ||
    row.routineId !== input.routineId ||
    row.occurrenceKey !== input.occurrenceKey ||
    row.action !== input.action ||
    row.snoozeDurationMs !== snoozeDurationMs
  ) {
    throw new Error(`Routine interaction idempotency key '${input.idempotencyKey}' was reused for a different command`);
  }
}

function occurrenceWhere(input: {
  identityId: string;
  routineId: string;
  occurrenceKey: string;
}) {
  return {
    identityId_routineId_occurrenceKey: {
      identityId: input.identityId,
      routineId: input.routineId,
      occurrenceKey: input.occurrenceKey,
    },
  } as const;
}

async function requireOccurrence(
  db: RoutineDb,
  input: { identityId: string; routineId: string; occurrenceKey: string },
): Promise<RoutineOccurrence> {
  const row = await db.routineOccurrence.findUnique({ where: occurrenceWhere(input) });
  if (!row) {
    throw new Error(`Routine occurrence '${input.occurrenceKey}' was not found for owner '${input.routineId}'`);
  }
  return row;
}

async function resolveOnDb(
  db: RoutineDb,
  input: ResolveRoutineOccurrenceInput,
): Promise<RoutineOccurrence> {
  const current = await requireOccurrence(db, input);
  const currentState = assertEnum(
    current.resolutionState,
    ROUTINE_OCCURRENCE_RESOLUTION_STATES,
    'resolutionState',
  );
  if (currentState !== 'Open') {
    if (currentState === input.state && current.resolutionKind === input.resolutionKind) return current;
    throw new Error(
      `Routine occurrence '${input.occurrenceKey}' is already resolved as ${currentState}`,
    );
  }

  const updated = await db.routineOccurrence.updateMany({
    where: {
      id: current.id,
      identityId: input.identityId,
      routineId: input.routineId,
      resolutionState: 'Open',
    },
    data: {
      resolutionState: input.state,
      resolvedAt: new Date(Number(input.resolvedAt)),
      resolutionKind: input.resolutionKind,
      resolutionReason: input.reason?.trim() || null,
    },
  });
  if (updated.count !== 1) {
    const raced = await requireOccurrence(db, input);
    if (raced.resolutionState === input.state && raced.resolutionKind === input.resolutionKind) {
      return raced;
    }
    throw new Error(`Routine occurrence '${input.occurrenceKey}' resolution conflict`);
  }
  return requireOccurrence(db, input);
}

function resolutionForInteraction(
  input: ApplyRoutineInteractionInput,
): Pick<ResolveRoutineOccurrenceInput, 'state' | 'resolutionKind' | 'resolvedAt' | 'reason'> | null {
  if (input.action === 'Completed') {
    return {
      state: 'Satisfied',
      resolutionKind: 'ExplicitComplete',
      resolvedAt: input.actedAt,
      reason: null,
    };
  }
  if (input.action === 'Skipped') {
    return {
      state: 'Skipped',
      resolutionKind: 'UserSkipped',
      resolvedAt: input.actedAt,
      reason: null,
    };
  }
  return null;
}

/** Prisma canonical Routine occurrence + interaction truth store (ADR-077 / R4-2201B). */
export class PrismaRoutineOccurrenceTruthStore implements RoutineOccurrenceTruthStore {
  constructor(private readonly prisma: PrismaClient) {}

  async ensureOpenOccurrence(input: EnsureRoutineOccurrenceInput): Promise<RoutineOccurrenceFact> {
    const identityId = nonEmpty(input.identityId, 'identityId');
    const routineId = nonEmpty(input.routineId, 'routineId');
    const occurrenceKey = nonEmpty(input.occurrenceKey, 'occurrenceKey');
    const becameDueAt = new Date(Number(input.becameDueAt));
    if (!Number.isFinite(becameDueAt.getTime())) throw new TypeError('becameDueAt must be valid');
    const scheduledFor =
      input.scheduledFor == null ? null : new Date(Number(input.scheduledFor));
    if (scheduledFor != null && !Number.isFinite(scheduledFor.getTime())) {
      throw new TypeError('scheduledFor must be valid');
    }

    const row = await this.prisma.routineOccurrence.upsert({
      where: occurrenceWhere({ identityId, routineId, occurrenceKey }),
      update: {},
      create: {
        id: `RoutineOccurrence_${randomUUID()}`,
        identityId,
        routineId,
        source: ROUTINE_OCCURRENCE_SOURCE,
        occurrenceKey,
        scheduledFor,
        sourceRevision: input.sourceRevision == null ? null : String(input.sourceRevision),
        idempotencyKey: buildIdempotencyKeyString({
          identityId,
          source: ROUTINE_OCCURRENCE_SOURCE,
          occurrenceKey,
        }),
        // A local-runtime due detector has completed its infrastructure work;
        // business satisfaction remains independently Open.
        status: 'succeeded',
        triggerKind: input.triggerKind,
        becameDueAt,
        resolutionState: 'Open',
        attempt: 1,
        fencingToken: 0,
        historyJson: '[]',
        finishedAt: becameDueAt,
      },
    });
    const fact = mapOccurrence(row);
    if (fact.triggerKind !== input.triggerKind) {
      throw new Error(
        `Routine occurrence '${occurrenceKey}' trigger mismatch: ${fact.triggerKind} != ${input.triggerKind}`,
      );
    }
    return fact;
  }

  async findOccurrence(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly occurrenceKey: string;
  }): Promise<RoutineOccurrenceFact | null> {
    const row = await this.prisma.routineOccurrence.findUnique({ where: occurrenceWhere(input) });
    return row ? mapOccurrence(row) : null;
  }

  async listOccurrences(input: { readonly identityId: string }): Promise<RoutineOccurrenceFact[]> {
    const rows = await this.prisma.routineOccurrence.findMany({
      where: { identityId: input.identityId },
      orderBy: [{ becameDueAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(mapOccurrence);
  }

  async resolveOccurrence(input: ResolveRoutineOccurrenceInput): Promise<RoutineOccurrenceFact> {
    return mapOccurrence(await resolveOnDb(this.prisma, input));
  }

  async applyInteraction(input: ApplyRoutineInteractionInput): Promise<RoutineInteractionApplyReceipt> {
    const idempotencyKey = nonEmpty(input.idempotencyKey, 'idempotencyKey');
    const responseLatencyMs = nonNegative(input.responseLatencyMs, 'responseLatencyMs');
    const snoozeDurationMs = positive(input.snoozeDurationMs, 'snoozeDurationMs');
    const temporaryOverride = input.temporaryOverride ?? null;
    if (input.action === 'Snoozed' && snoozeDurationMs == null) {
      throw new TypeError('Snoozed interaction requires snoozeDurationMs');
    }
    if (input.action === 'Snoozed' && temporaryOverride == null) {
      throw new TypeError('Snoozed interaction requires temporaryOverride');
    }
    if (input.action !== 'Snoozed' && (snoozeDurationMs != null || temporaryOverride != null)) {
      throw new TypeError('Snooze state is only valid for Snoozed interaction');
    }
    if (
      temporaryOverride != null &&
      Number(temporaryOverride.snoozeUntil) !== Number(input.actedAt) + snoozeDurationMs!
    ) {
      throw new TypeError('Snoozed temporaryOverride must match actedAt + snoozeDurationMs');
    }
    const temporaryOverrideJson = serializeRoutineTemporaryOverride(temporaryOverride);

    return this.prisma.$transaction(async (tx) => {
      const candidateInteractionId = `RoutineInteraction_${randomUUID()}`;
      const interaction = await tx.routineInteraction.upsert({
        where: { idempotencyKey },
        update: {},
        create: {
          id: candidateInteractionId,
          idempotencyKey,
          identityId: input.identityId,
          routineId: input.routineId,
          occurrenceKey: input.occurrenceKey,
          action: input.action,
          actedAt: new Date(Number(input.actedAt)),
          responseLatencyMs,
          snoozeDurationMs,
          metadataJson: input.metadata == null ? null : JSON.stringify(input.metadata),
        },
      });
      const replayed = interaction.id !== candidateInteractionId;
      if (replayed) {
        assertInteractionReplayMatches(interaction, input, snoozeDurationMs);
        // The idempotency upsert is the concurrency fence. Read occurrence truth
        // after crossing it so a duplicate command cannot return the pre-commit
        // Open snapshot from the winning transaction.
        const occurrence = await requireOccurrence(tx, input);
        return {
          interaction: mapInteraction(interaction),
          occurrence: mapOccurrence(occurrence),
          replayed: true,
        };
      }

      let occurrence = await requireOccurrence(tx, input);
      const resolution = resolutionForInteraction(input);
      if (resolution) {
        occurrence = await resolveOnDb(tx, { ...input, ...resolution });
      }
      if (temporaryOverrideJson != null) {
        await tx.routineTemporaryOverride.upsert({
          where: {
            identityId_routineId: {
              identityId: input.identityId,
              routineId: input.routineId,
            },
          },
          create: {
            identityId: input.identityId,
            routineId: input.routineId,
            overrideJson: temporaryOverrideJson,
          },
          update: {
            overrideJson: temporaryOverrideJson,
            version: { increment: 1 },
          },
        });
      }

      return {
        interaction: mapInteraction(interaction),
        occurrence: mapOccurrence(occurrence),
        replayed: false,
      };
    });
  }

  async listInteractions(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly occurrenceKey: string;
  }): Promise<RoutineInteractionFact[]> {
    const rows = await this.prisma.routineInteraction.findMany({
      where: input,
      orderBy: [{ actedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(mapInteraction);
  }

  async listInteractionsForIdentity(input: {
    readonly identityId: string;
  }): Promise<RoutineInteractionFact[]> {
    const rows = await this.prisma.routineInteraction.findMany({
      where: { identityId: input.identityId },
      orderBy: [{ actedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(mapInteraction);
  }
}
