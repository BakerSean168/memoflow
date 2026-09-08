import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** CLEAN-6304: @memoflow/schedule/client is Planner/Calendar only. */
describe('schedule client physical ownership surface', () => {
  const service = readFileSync(resolve(__dirname, 'schedule-client-service.ts'), 'utf8');
  const port = readFileSync(resolve(__dirname, 'schedule-client.port.ts'), 'utf8');
  const eventApi = readFileSync(
    resolve(__dirname, 'ports/schedule-event-api-client.port.ts'),
    'utf8',
  );

  it('keeps Calendar commands in the Schedule client facade', () => {
    expect(eventApi).toContain('export interface IScheduleEventApiClient');
    expect(eventApi).toContain('createSchedule');
    expect(eventApi).toContain('resolveConflict');
    expect(port).toContain('export interface ScheduleClientPort');
    expect(service).toContain('implements ScheduleClientPort');
    expect(service).toContain('private readonly eventApi: IScheduleEventApiClient');
  });

  it('does not re-export or implement Temporal Engine diagnostics', () => {
    for (const schedulerMember of [
      'IScheduleTaskApiClient',
      'ScheduleTask',
      'getTasks(',
      'getTaskById(',
      'getDueTasks(',
      'getTaskBySource(',
      'scheduleTaskFromDTO',
      'scheduleExecutionFromDTO',
    ]) {
      expect(port).not.toContain(schedulerMember);
      expect(service).not.toContain(schedulerMember);
      expect(eventApi).not.toContain(schedulerMember);
    }
  });
});
