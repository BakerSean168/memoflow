import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TaskPriority, mapImportanceToTaskPriority } from './task-priority';

/**
 * Residual 1168: mapPriority dual retired (contracts schedule sole).
 * Legacy ScheduleTask keeps one TaskPriority mapper. TASK-3101 moved the Task
 * business projector to neutral SchedulingPriority, so it must not depend on it.
 * Soft residual 1168: buildTaskName / trigger scheduling stay domain-specific (no force-merge).
 * Does not flip §13.2 checkboxes.
 */
describe('mapImportanceToTaskPriority dual retired (residual 1168)', () => {
  const dir = __dirname;
  const sole = readFileSync(resolve(dir, 'task-priority.ts'), 'utf8');
  const voIndex = readFileSync(resolve(dir, 'index.ts'), 'utf8');
  const goal = readFileSync(
    resolve(dir, '../../../../../goal/src/server/infrastructure/schedule-projection-source.ts'),
    'utf8',
  );
  const task = readFileSync(
    resolve(dir, '../../../../../task/src/server/infrastructure/schedule-projection-source.ts'),
    'utf8',
  );

  it('owns sole mapImportanceToTaskPriority helper body', () => {
    expect(sole).toContain('Residual 1168');
    expect(sole).toMatch(/export function mapImportanceToTaskPriority\b/);
    expect(sole).toContain("importance === 'Vital'");
    expect(sole).toContain('TaskPriority.Urgent');
    expect(sole).toContain('TaskPriority.High');
    expect(sole).toContain('TaskPriority.Normal');
    expect(voIndex).toContain('mapImportanceToTaskPriority');
  });

  it('keeps legacy TaskPriority mapping out of the neutral Task projector', () => {
    expect(task).not.toContain('mapImportanceToTaskPriority');
    expect(task).toContain('SchedulingPriority');
    expect(task).toMatch(/function neutralPriority\b/);
    expect(task).toContain("if (importance === 'Vital') return 'urgent'");
    expect(task).toContain("if (importance === 'Important') return 'high'");
    expect(task).toContain('priority: neutralPriority(templateDTO.importance)');

    expect(goal).not.toContain('mapImportanceToTaskPriority');
    expect(goal).not.toContain('goalDTO.importance');
    expect(goal).toContain("priority: 'normal'");
  });

  it('runtime: maps importance strings to TaskPriority', () => {
    expect(mapImportanceToTaskPriority('Vital')).toBe(TaskPriority.Urgent);
    expect(mapImportanceToTaskPriority('Important')).toBe(TaskPriority.High);
    expect(mapImportanceToTaskPriority('Normal')).toBe(TaskPriority.Normal);
    expect(mapImportanceToTaskPriority('Low')).toBe(TaskPriority.Normal);
    expect(mapImportanceToTaskPriority('')).toBe(TaskPriority.Normal);
  });

  it('documents residual 1168 lock intent without claiming §13.2 complete', () => {
    const self = readFileSync(
      resolve(dir, 'map-importance-to-task-priority-dual.surface.spec.ts'),
      'utf8',
    );
    expect(self).toContain('Residual 1168');
    expect(self).toContain('Does not flip §13.2 checkboxes');
    expect(self).toContain('dual retired');
  });
});
