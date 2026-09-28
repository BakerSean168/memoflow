import { asInstant, createRecurrenceEngine } from '@memoflow/time';
import {
  computeRoutineNextEligibleOccurrence,
  createWallClockTrigger,
  RoutineDefinition,
  type RoutineTrigger,
  type WallClockTrigger,
} from '../../../domain/routine';

export const FIXTURE_F = {
  identityId: 'IdentityId_fixture-f',
  routineId: 'RoutineId_fixture-f',
  localTime: '23:30',
  timeZone: 'Asia/Shanghai',
  startDate: '2026-08-25',
  firstOccurrenceAt: Date.parse('2026-08-25T15:30:00.000Z'),
  nextOccurrenceAt: Date.parse('2026-08-26T15:30:00.000Z'),
  version: 3,
} as const;

export const recurrenceEngine = createRecurrenceEngine();

export function fixtureTrigger(options?: { count?: number | null }): WallClockTrigger {
  return createWallClockTrigger({
    localTime: FIXTURE_F.localTime,
    timeZone: FIXTURE_F.timeZone,
    recurrence: {
      startDate: FIXTURE_F.startDate,
      frequency: 'daily',
      interval: 1,
      count: options?.count ?? null,
      byWeekday: [],
    },
  });
}

export function buildFixtureFRoutine(options?: {
  enabled?: boolean;
  version?: number;
  trigger?: RoutineTrigger | null;
  activatedAt?: Date | null;
}): RoutineDefinition {
  return RoutineDefinition.load({
    id: FIXTURE_F.routineId,
    identityId: FIXTURE_F.identityId,
    name: '晚间熄灯',
    description: '屋内灯光关闭，进入休息时间。',
    enabled: options?.enabled ?? true,
    trigger: options?.trigger !== undefined ? options.trigger : fixtureTrigger(),
    activatedAt: options?.activatedAt ?? new Date(Date.parse('2026-08-01T00:00:00.000Z')),
    version: options?.version ?? FIXTURE_F.version,
    createdAt: new Date(Date.parse('2026-08-01T00:00:00.000Z')),
    updatedAt: new Date(Date.parse('2026-08-24T00:00:00.000Z')),
  });
}

export function fixtureOccurrenceKey(options?: {
  routineId?: string;
  trigger?: WallClockTrigger;
  after?: number;
}): string {
  const trigger = options?.trigger ?? fixtureTrigger();
  const occurrence = computeRoutineNextEligibleOccurrence({
    routineId: options?.routineId ?? FIXTURE_F.routineId,
    engine: recurrenceEngine,
    trigger,
    after: asInstant(options?.after ?? FIXTURE_F.firstOccurrenceAt - 1),
  });
  if (!occurrence) {
    throw new Error('Expected an eligible Fixture F occurrence.');
  }
  return occurrence.occurrenceKey;
}
