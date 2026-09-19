import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Routine API runtime composer surface (R4-2201C)', () => {
  const dir = resolve(__dirname, '..');
  const server = readFileSync(resolve(dir, 'server.ts'), 'utf8');
  const composer = readFileSync(resolve(dir, 'runtime/compose-routine.ts'), 'utf8');

  it('server composes the canonical Routine owner command port without a legacy transport module', () => {
    expect(server).toContain("from './runtime/compose-routine'");
    expect(server).toContain('const routineComposed = composeRoutine({ db: prisma });');
    expect(server).toContain('routineComposed.routineCommandPort');
    expect(server).not.toContain('.register(routineComposed.module)');
    expect(server).not.toContain("from '@memoflow/reminder/api'");
  });

  it('Scheduler receives only canonical Routine projection/execution owners', () => {
    expect(server).toContain('createRoutinePrismaScheduleProjectionSource(prisma)');
    expect(server).toContain('createRoutinePrismaScheduleExecutionDeps(prisma)');
    expect(server).toContain('routineSource: routineExecutionDeps');
    expect(server).not.toMatch(/reminderProjection\s*:/);
    expect(server).not.toMatch(/reminderSource\s*:/);
  });

  it('composer depends only on Routine vNext stores and application services', () => {
    expect(composer).toContain('createRoutinePrismaRepositories');
    expect(composer).toContain('createRoutineCoachCommandService');
    expect(composer).toContain('routineOccurrenceTruthStore');
    expect(composer).toContain('routineTemporaryOverrideStore');
    expect(composer).not.toMatch(/ReminderTemplate|ReminderGroup|ReminderResponse/);
    expect(composer).not.toMatch(/createReminder(Api|Prisma|PowerSync|Module)/);
  });
});
