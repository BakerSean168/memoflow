import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ScheduleClientPort maps calendar commands plus read-only worker diagnostics.
 * Raw ScheduleTask mutation must not re-enter the product client facade.
 */
describe('schedule client facade ownership surface', () => {
  const service = readFileSync(resolve(__dirname, 'schedule-client-service.ts'), 'utf8');
  const port = readFileSync(resolve(__dirname, 'schedule-client.port.ts'), 'utf8');
  const eventApi = readFileSync(
    resolve(__dirname, 'ports/schedule-event-api-client.port.ts'),
    'utf8',
  );
  const taskApi = readFileSync(
    resolve(__dirname, 'ports/schedule-task-api-client.port.ts'),
    'utf8',
  );

  it('splits event commands from read-only worker diagnostics', () => {
    expect(eventApi).toContain('export interface IScheduleEventApiClient');
    expect(eventApi).toContain('createSchedule');
    expect(taskApi).toContain('export interface IScheduleTaskApiClient');
    expect(taskApi).toContain('getTasks');
    expect(taskApi).toContain('getTaskBySource');

    for (const mutation of [
      'createTask',
      'createTasksBatch',
      'pauseTask',
      'resumeTask',
      'completeTask',
      'cancelTask',
      'deleteTask',
      'deleteTasksBatch',
      'updateTaskMetadata',
    ]) {
      expect(taskApi).not.toContain(`${mutation}(`);
      expect(port).not.toContain(`${mutation}(`);
    }
  });

  it('ScheduleClientPort remains a domain facade with DTO-to-domain mappers', () => {
    expect(port).toMatch(/export interface ScheduleClientPort\s*\{/);
    expect(service).toContain('implements ScheduleClientPort');
    expect(service).toContain('private readonly eventApi: IScheduleEventApiClient');
    expect(service).toContain('private readonly taskApi: IScheduleTaskApiClient');
    expect(service).toContain('function scheduleTaskFromDTO');
    expect(service).toContain('function scheduleExecutionFromDTO');
    expect(port).toContain('ScheduleTask');
  });
});
