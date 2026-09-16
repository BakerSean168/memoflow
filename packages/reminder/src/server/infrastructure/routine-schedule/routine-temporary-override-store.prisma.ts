import type { PrismaClient } from '@memoflow/database';
import type { RoutineTemporaryOverride } from '../../domain/routine';
import type { RoutineTemporaryOverrideStore } from '../../domain/ports/routine-temporary-override-store.port';
import {
  deserializeRoutineTemporaryOverride,
  serializeRoutineTemporaryOverride,
} from '../routine-vnext/trigger-persistence-parity';

/**
 * Prisma snooze/suppress store (`routine_temporary_overrides`, ROUTINE-3401).
 *
 * One durable override row per routine, encoded with the W2 trigger-parity
 * codec. `setRoutineTemporaryOverride` upserts a single active override (a
 * snooze replaces any prior suppress/snooze); `clearRoutineTemporaryOverride`
 * restores the canonical recurrence. The state reader serves the same row back
 * to projection and execution.
 */
export class PrismaRoutineTemporaryOverrideStore implements RoutineTemporaryOverrideStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findRoutineTemporaryOverride(input: {
    readonly identityId: string;
    readonly routineId: string;
  }): Promise<RoutineTemporaryOverride | null> {
    const row = await this.prisma.routineTemporaryOverride.findUnique({
      where: { identityId_routineId: { identityId: input.identityId, routineId: input.routineId } },
    });
    return row ? deserializeRoutineTemporaryOverride(row.overrideJson) : null;
  }

  async setRoutineTemporaryOverride(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly override: RoutineTemporaryOverride;
    readonly expectedVersion?: number;
  }): Promise<void> {
    const { identityId, routineId, override } = input;
    const overrideJson = serializeRoutineTemporaryOverride(override);
    if (overrideJson == null) {
      throw new TypeError('Expected a non-null RoutineTemporaryOverride to serialize');
    }
    if (input.expectedVersion === undefined) {
      await this.prisma.routineTemporaryOverride.upsert({
        where: { identityId_routineId: { identityId, routineId } },
        create: { identityId, routineId, overrideJson },
        update: { overrideJson, version: { increment: 1 } },
      });
      return;
    }
    const result = await this.prisma.routineTemporaryOverride.updateMany({
      where: { identityId, routineId, version: input.expectedVersion },
      data: { overrideJson, version: { increment: 1 } },
    });
    if (result.count !== 1) throw new Error(`Routine override '${routineId}' version conflict`);
  }

  async clearRoutineTemporaryOverride(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly expectedVersion?: number;
  }): Promise<void> {
    const result = await this.prisma.routineTemporaryOverride.deleteMany({
      where: {
        identityId: input.identityId,
        routineId: input.routineId,
        ...(input.expectedVersion === undefined ? {} : { version: input.expectedVersion }),
      },
    });
    if (input.expectedVersion !== undefined && result.count !== 1) {
      throw new Error(`Routine override '${input.routineId}' version conflict`);
    }
  }
}
