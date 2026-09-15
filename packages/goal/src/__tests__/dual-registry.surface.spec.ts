/**
 * Dual registry suite (elegance E3b tax cut).
 * Merged 3 dual-retired surface locks from this directory.
 * Behavior/assertions preserved; individual *-dual.surface.spec.ts removed.
 * Sources: integration-global-setup-dual.surface.spec.ts, integration-helpers-dual.surface.spec.ts, schedule-package-shim-dual.surface.spec.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ScheduleTask } from '@memoflow/test-utils';

// --- merged from integration-global-setup-dual.surface.spec.ts ---
{
  /**
   * Residual 1037: goal/schedule/reminder/task integration-global-setup duals retired
   * onto test-utils setup sole.
   * Soft residual 1038: tip focused suite numbers track Residual 1038 evidence tip (309/1339).
   * Does not flip §13.2 checkboxes.
   */
  describe('integration-global-setup dual retired (residual 1037)', () => {
    const sole = readFileSync(
      resolve(__dirname, '../../../test-utils/src/setup/integration-global-setup.ts'),
      'utf8',
    );
    const packages = ['goal', 'schedule', 'reminder', 'task'] as const;

    it('owns sole setup/teardown helper body', () => {
      expect(sole).toContain('Residual 1037');
      expect(sole).toMatch(/export async function setup\b/);
      expect(sole).toMatch(/export async function teardown\b/);
      expect(sole).toContain('ensureTestDatabase');
      expect(sole).toContain("from './database'");
    });

    it('package shims re-export sole without local dual bodies', () => {
      for (const pkg of packages) {
        const source = readFileSync(
          resolve(__dirname, `../../../${pkg}/src/__tests__/integration-global-setup.ts`),
          'utf8',
        );
        expect(source, pkg).toContain('Residual 1037');
        expect(source, pkg).toContain(
          "from '@memoflow/test-utils/setup/integration-global-setup'",
        );
        expect(source, pkg).toContain('setup');
        expect(source, pkg).toContain('teardown');
        expect(source, pkg).not.toMatch(/export async function setup\b/);
        expect(source, pkg).not.toMatch(/export async function teardown\b/);
        expect(source, pkg).not.toContain('ensureTestDatabase');
      }
    });

    it('integration vitest configs alias globalSetup to test-utils sole', () => {
      for (const pkg of packages) {
        const source = readFileSync(
          resolve(__dirname, `../../../${pkg}/vitest.integration.config.ts`),
          'utf8',
        );
        expect(source, pkg).toContain('Residual 1037');
        expect(source, pkg).toContain(
          '../test-utils/src/setup/integration-global-setup.ts',
        );
        expect(source, pkg).not.toContain(
          "./src/__tests__/integration-global-setup.ts",
        );
      }
    });

    it('sole setup is a thin ensureTestDatabase bootstrap without disconnect teardown', () => {
      expect(sole).toMatch(/export async function setup\(\)\s*\{\s*await ensureTestDatabase\(\);\s*\}/);
      expect(sole).toMatch(/export async function teardown\(\)\s*\{\s*\}/);
      expect(sole).not.toContain('disconnect');
    });
  });
}

// --- merged from integration-helpers-dual.surface.spec.ts ---
{
  /**
   * Residual 1043: goal/schedule/reminder/task integration-helpers duals retired
   * onto test-utils setup sole (getPrisma/disconnectPrisma/cleanAll/seedAccount).
   * Task keeps only canonical vNext cleanTaskTables; Folder/DAG seed helpers are retired.
   * Soft residual 1044: tip focused suite numbers track Residual 1044 evidence tip (312/1351).
   * Does not flip §13.2 checkboxes.
   */
  describe('integration-helpers dual retired (residual 1043)', () => {
    const sole = readFileSync(
      resolve(__dirname, '../../../test-utils/src/setup/integration-helpers.ts'),
      'utf8',
    );
    const packages = ['goal', 'schedule', 'reminder', 'task'] as const;

    it('owns sole getPrisma/disconnectPrisma/cleanAll/seedAccount bodies', () => {
      expect(sole).toContain('Residual 1043');
      expect(sole).toMatch(/export async function getPrisma\b/);
      expect(sole).toMatch(/export async function disconnectPrisma\b/);
      expect(sole).toMatch(/export async function cleanAll\b/);
      expect(sole).toMatch(/export async function seedAccount\b/);
      expect(sole).toContain('cleanAllTables');
      expect(sole).toContain("from '@memoflow/database'");
      expect(sole).toContain('emailPrefix');
    });

    it('package shims re-export sole without local dual bodies for shared helpers', () => {
      for (const pkg of packages) {
        const source = readFileSync(
          resolve(__dirname, `../../../${pkg}/src/__tests__/integration-helpers.ts`),
          'utf8',
        );
        expect(source, pkg).toContain(
          "from '@memoflow/test-utils/setup/integration-helpers'",
        );
        expect(source, pkg).toContain('getPrisma');
        expect(source, pkg).toContain('disconnectPrisma');
        expect(source, pkg).toContain('cleanAll');
        expect(source, pkg).toContain('seedAccount');
        expect(source, pkg).not.toMatch(/export async function getPrisma\b/);
        expect(source, pkg).not.toMatch(/export async function disconnectPrisma\b/);
        expect(source, pkg).not.toMatch(/export async function cleanAll\b/);
        expect(source, pkg).not.toMatch(/export async function seedAccount\b/);
        expect(source, pkg).not.toContain('cleanAllTables');
      }
    });

    it('task keep-boundary keeps canonical cleanup without resurrecting retired Folder/DAG seeds', () => {
      const task = readFileSync(
        resolve(__dirname, '../../../task/src/__tests__/integration-helpers.ts'),
        'utf8',
      );
      expect(task).toMatch(/export async function cleanTaskTables\b/);
      expect(task).toContain('taskGoalOutbox.deleteMany');
      expect(task).toContain('taskLabel.deleteMany');
      expect(task).toContain('taskOccurrence.deleteMany');
      expect(task).toContain('taskPlan.deleteMany');
      expect(task).not.toMatch(/export async function seedFolder\b/);
      expect(task).not.toMatch(/export async function seedTemplateRaw\b/);
      expect(task).not.toMatch(/export async function seedInstanceRaw\b/);
      expect(task).not.toContain('TaskFolderId');
      expect(task).not.toContain('taskDependency');
      expect(task).not.toContain('taskFolder');
    });

    it('goal/schedule/reminder shims stay re-export-only (no task-only helpers)', () => {
      for (const pkg of ['goal', 'schedule', 'reminder'] as const) {
        const source = readFileSync(
          resolve(__dirname, `../../../${pkg}/src/__tests__/integration-helpers.ts`),
          'utf8',
        );
        expect(source, pkg).not.toContain('cleanTaskTables');
        expect(source, pkg).not.toContain('seedFolder');
        expect(source, pkg).not.toContain('seedTemplateRaw');
        expect(source, pkg).not.toContain('seedInstanceRaw');
        expect(source, pkg).not.toMatch(/let prismaPromise/);
      }
    });
  });
}

// --- merged from schedule-package-shim-dual.surface.spec.ts ---
{
  /**
   * Residual 1035: goal/task/reminder schedule-package-shim duals retired onto test-utils sole.
   * Soft residual 1038: tip focused suite numbers track Residual 1038 evidence tip (309/1339).
   * Does not flip §13.2 checkboxes.
   */
  describe('schedule-package-shim dual retired (residual 1035)', () => {
    const sole = readFileSync(
      resolve(__dirname, '../../../test-utils/src/shims/schedule-package-shim.ts'),
      'utf8',
    );
    const goalShim = readFileSync(resolve(__dirname, 'schedule-package-shim.ts'), 'utf8');
    const taskShim = readFileSync(
      resolve(__dirname, '../../../task/src/__tests__/schedule-package-shim.ts'),
      'utf8',
    );
    const reminderShim = readFileSync(
      resolve(__dirname, '../../../reminder/src/__tests__/schedule-package-shim.ts'),
      'utf8',
    );
    const goalVitest = readFileSync(resolve(__dirname, '../../vitest.config.ts'), 'utf8');
    const taskVitest = readFileSync(resolve(__dirname, '../../../task/vitest.config.ts'), 'utf8');
    const reminderVitest = readFileSync(
      resolve(__dirname, '../../../reminder/vitest.config.ts'),
      'utf8',
    );

    it('owns sole ScheduleTask shim body', () => {
      expect(sole).toContain('Residual 1035');
      expect(sole).toMatch(/export class ScheduleTask\b/);
      expect(sole).toContain('static create');
      expect(sole).toContain('createMetadata');
      expect(sole).toContain('toDTO()');
    });

    it('goal/task/reminder shims re-export sole without local dual bodies', () => {
      for (const [label, source] of [
        ['goal', goalShim],
        ['task', taskShim],
        ['reminder', reminderShim],
      ] as const) {
        expect(source, label).toContain('Residual 1035');
        expect(source, label).toContain("from '@memoflow/test-utils'");
        expect(source, label).toContain('ScheduleTask');
        expect(source, label).not.toMatch(/export class ScheduleTask\b/);
        expect(source, label).not.toMatch(/function createMetadata\b/);
      }
    });

    it('vitest configs alias @memoflow/schedule to test-utils sole', () => {
      for (const [label, source] of [
        ['goal', goalVitest],
        ['task', taskVitest],
        ['reminder', reminderVitest],
      ] as const) {
        expect(source, label).toContain('Residual 1035');
        expect(source, label).toContain('../test-utils/src/shims/schedule-package-shim.ts');
        expect(source, label).not.toContain("src/__tests__/schedule-package-shim.ts");
      }
    });

    it('creates schedule tasks with metadata toDTO bridge', () => {
      const task = ScheduleTask.create({
        identityId: 'IdentityId_1',
        name: 'n',
        sourceModule: 'task',
        sourceEntityId: 'entity-1',
        schedule: { kind: 'once' } as never,
        metadata: { payload: { templateId: 't1' } } as never,
      });
      expect(task.id).toBe('ScheduleTaskId_entity-1');
      expect(task.name).toBe('n');
      expect(task.metadata.toDTO()).toEqual({ payload: { templateId: 't1' } });
    });
  });
}
