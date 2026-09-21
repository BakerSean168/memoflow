import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const RETIRED_NAMES = [
  'ReminderApplicationPort',
  'IReminderTemplateRepository',
  'IReminderGroupRepository',
  'IReminderResponseRepository',
  'IUserReminderPreferenceRepository',
  'createReminderModule',
  'createReminderPrismaModule',
  'createReminderPowerSyncModule',
  'createReminderScheduleExecutionSource',
  'createReminderScheduleProjectionSource',
] as const;

const CANONICAL_ROUTINE_EXPORTS = [
  'createRoutinePrismaRepositories',
  'createRoutinePowerSyncRepositories',
  'createRoutineCoachCommandService',
  'registerRoutineNotificationOwnerCommands',
  'loadPowerSyncRoutineLocalRegistrations',
] as const;

const ROOT_IMPORT_BUDGET_MS = 60_000;

describe('@memoflow/reminder R4-2201C owner surface', () => {
  let rootExportNames: readonly string[];

  const routineProjection = readFileSync(
    resolve(
      __dirname,
      '../server/infrastructure/routine-schedule/routine-schedule-projection-source.ts',
    ),
    'utf8',
  );
  const routineExecution = readFileSync(
    resolve(
      __dirname,
      '../server/infrastructure/routine-schedule/routine-schedule-execution-source.ts',
    ),
    'utf8',
  );

  beforeAll(async () => {
    rootExportNames = Object.keys(await import('../index'));
  }, ROOT_IMPORT_BUDGET_MS);

  it('contains no legacy Reminder owner authority on root or server seams', () => {
    const root = readFileSync(resolve(__dirname, '../index.ts'), 'utf8');
    const server = readFileSync(resolve(__dirname, '../server/index.ts'), 'utf8');
    for (const name of RETIRED_NAMES) {
      expect(root).not.toMatch(new RegExp(`\\b${name}\\b`));
      expect(server).not.toMatch(new RegExp(`\\b${name}\\b`));
      expect(rootExportNames).not.toContain(name);
    }
  });

  it('keeps Routine schedule projection identity-scoped through the canonical state reader', () => {
    expect(routineProjection).toMatch(
      /buildRoutinePlan\s*\(\s*routineId:\s*string,\s*identityId:\s*string\s*\):\s*Promise<RoutineScheduleProjectionPlan>/s,
    );
    expect(routineProjection).toContain('readonly owner: SchedulingOwner;');
    expect(routineProjection).toContain('readRoutineScheduleSnapshot(routineId, identityId)');
    expect(routineProjection).toContain('buildRoutineWallClockOwner(routineId, identityId)');
    expect(routineProjection).not.toContain('ReminderTemplate');
    expect(routineProjection).not.toContain('reminderTemplateRepository');
  });

  it('keeps Routine scheduled execution identity-bound without Reminder repositories', () => {
    expect(routineExecution).toMatch(
      /readRoutineScheduleSnapshot\s*\(\s*input\.routineId,\s*input\.identityId,?\s*\)/s,
    );
    expect(routineExecution).toContain('readonly routineId: string;');
    expect(routineExecution).toContain('readonly identityId: string;');
    expect(routineExecution).not.toContain('ReminderTemplate');
    expect(routineExecution).not.toContain('reminderTemplateRepository');
  });

  it('keeps canonical Routine owner entrypoints', () => {
    for (const name of CANONICAL_ROUTINE_EXPORTS) {
      expect(rootExportNames).toContain(name);
    }
  });
});
