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

  it('keeps canonical Routine owner entrypoints', () => {
    for (const name of CANONICAL_ROUTINE_EXPORTS) {
      expect(rootExportNames).toContain(name);
    }
  });
});
