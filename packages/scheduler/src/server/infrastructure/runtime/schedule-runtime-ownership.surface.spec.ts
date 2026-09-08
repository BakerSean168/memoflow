import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Schedule runtime ownership surface (stage-6 residual 131):
 * sync/execute reloads must prefer findByIdForIdentity when identity is known.
 * Residual 180 locks bare findById as bootstrap-only fallback.
 * (queue item or event), not bare primary keys alone.
 */
describe('schedule runtime ownership surface', () => {
  const runtime = readFileSync(resolve(__dirname, './schedule.runtime.ts'), 'utf8');
  const queue = readFileSync(
    resolve(__dirname, '../../application/scheduler/schedule-task-queue.ts'),
    'utf8',
  );

  it('ScheduledItem carries identityId for owned reloads', () => {
    expect(queue).toMatch(/export interface ScheduledItem[\s\S]*identityId: string;/);
  });

  it('toScheduledItem stamps identityId from the task aggregate', () => {
    expect(runtime).toContain('identityId: String(task.identityId)');
  });

  it('runtime loads prefer findByIdForIdentity when identity is known', () => {
    expect(runtime).toContain('async function loadTaskForRuntime(');
    expect(runtime).toContain('return repository.findByIdForIdentity(String(identityId), taskId);');
    expect(runtime).toContain(
      'return repository.findByIdForIdentity(String(task.identityId), taskId);',
    );
  });

  it('execute path passes item.identityId into the owned load', () => {
    expect(runtime).toContain('onExecuteTask: async (taskId, item) => {');
    expect(runtime).toContain('item.identityId');
  });

  it('sync path accepts event identityId when present', () => {
    expect(runtime).toContain(
      'const syncTaskHandler = async (event: { taskId?: string; identityId?: string }) => {',
    );
    expect(runtime).toContain('event.identityId');
  });

  it('bare findById is only the no-identity bootstrap path (residual 180)', () => {
    expect(runtime).toContain('const task = await repository.findById(taskId);');
    expect(runtime).toContain(
      'return repository.findByIdForIdentity(String(task.identityId), taskId);',
    );
    // Prefer owned load when identity known:
    expect(runtime).toContain('return repository.findByIdForIdentity(String(identityId), taskId);');
  });

});
