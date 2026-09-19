import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function sliceBetween(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Unable to locate surface: ${start} -> ${end}`);
  return source.slice(from, to);
}

describe('TaskOccurrence vNext anti-resurrection locks (TASK-7303)', () => {
  const aggregate = readFileSync(resolve(__dirname, 'aggregates/task-occurrence.ts'), 'utf8');
  const responseSchemas = readFileSync(
    resolve(__dirname, '../../../../contracts/src/modules/task/api/response-schemas.ts'),
    'utf8',
  );
  const clientAggregate = readFileSync(
    resolve(__dirname, '../../domain-client/aggregates/task-occurrence.ts'),
    'utf8',
  );
  const serverDto = readFileSync(
    resolve(
      __dirname,
      '../../../../contracts/src/modules/task/aggregates/task-occurrence-server.ts',
    ),
    'utf8',
  );
  const prismaSchema = readFileSync(
    resolve(__dirname, '../../../../database/prisma/schema/task.prisma'),
    'utf8',
  );
  const powersyncSchema = readFileSync(
    resolve(__dirname, '../../../../powersync-schema/src/index.ts'),
    'utf8',
  );

  it('keeps durable aggregate state on canonical occurrence facts only', () => {
    const state = sliceBetween(
      aggregate,
      'export interface TaskOccurrenceState',
      'function cloneResult',
    );
    for (const required of [
      'planId:',
      'occurrenceKey:',
      'scheduleSnapshot:',
      'importanceSnapshot:',
      'result:',
      'checklistState:',
      'actualStartAt:',
    ]) {
      expect(state).toContain(required);
    }
    for (const retired of [
      'occurrenceDate:',
      'timeConfig:',
      'completionRecord:',
      'skipRecord:',
      'actualEndTime:',
      'note:',
    ]) {
      expect(state).not.toContain(retired);
    }
  });

  it('keeps server and transport DTOs canonical after TASK-7306 cutover', () => {
    for (const required of [
      'planId:',
      'scheduleSnapshot:',
      'importanceSnapshot:',
      'result:',
      'checklistState:',
    ]) {
      expect(serverDto).toContain(required);
    }
    expect(serverDto).not.toMatch(
      /\boccurrenceDate:|\btimeConfig:|\bactualEndTime:|\bcomment:/,
    );

    const response = sliceBetween(
      responseSchemas,
      'export const TaskOccurrenceResponseSchema = z.object({',
      '// ============ Inferred response aliases',
    );
    for (const required of [
      'planId:',
      'occurrenceKey:',
      'scheduleSnapshot:',
      'importanceSnapshot:',
      'result:',
      'checklistState:',
      'dueAt:',
      'isOverdue:',
    ]) {
      expect(response).toContain(required);
    }
    expect(response).not.toMatch(
      /\boccurrenceDate:|\btimeConfig:|\bactualEndTime:|\bcomment:/,
    );
    expect(clientAggregate).toContain('export type TaskOccurrenceState = TaskOccurrenceClientDTO');
    expect(clientAggregate).not.toMatch(/get occurrenceDate\b|get timeConfig\b/);
  });

  it('locks Prisma task_occurrences to canonical columns', () => {
    const model = sliceBetween(prismaSchema, 'model TaskOccurrence {', '/// Durable delivery log');
    for (const required of [
      'planId',
      'scheduleDate',
      'scheduleTiming',
      'importanceSnapshot',
      'actualStartAt',
      'result',
      'checklistState',
    ]) {
      expect(model).toContain(required);
    }
    expect(model).not.toMatch(
      /\boccurrenceDate\b|\btimeConfig\b|\bactualEndTime\b|\bcomment\b/,
    );
  });

  it('locks PowerSync task_occurrences to Prisma-equivalent canonical columns', () => {
    const table = sliceBetween(
      powersyncSchema,
      'const task_occurrences = new Table({',
      'const task_plan_history = new Table({',
    );
    for (const required of [
      'plan_id:',
      'schedule_date:',
      'schedule_timing:',
      'importance_snapshot:',
      'actual_start_at:',
      'result:',
      'checklist_state:',
    ]) {
      expect(table).toContain(required);
    }
    expect(table).not.toMatch(
      /\binstance_date:|\btime_config:|\bactual_end_time:|\bcomment:/,
    );
  });
});
