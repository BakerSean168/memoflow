import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveExportRef, resolveExportRefOrThrow } from './projection-helpers';
import type { ExportContext } from '../../portable-runtime';
import { RefAllocator } from '../../portable-runtime';

/**
 * Residual 1003: resolveExportRef dual retired (task/reminder/repository projections).
 * Sole bodies in projection-helpers with entityLabel message domain.
 * Soft residual 1038: tip focused suite numbers track Residual 1038 evidence tip (309/1339).
 * Soft residual 1017: Goal resolveRef dual remains retired onto this sole.
 * Does not flip §13.2 checkboxes.
 */
describe('resolveExportRef dual retired (residual 1003)', () => {
  const dir = __dirname;
  const sole = readFileSync(resolve(dir, 'projection-helpers.ts'), 'utf8');
  const task = readFileSync(resolve(dir, 'task.projection.ts'), 'utf8');
  const reminder = readFileSync(resolve(dir, 'reminder.projection.ts'), 'utf8');
  const repository = readFileSync(resolve(dir, 'repository.projection.ts'), 'utf8');
  const goal = readFileSync(resolve(dir, 'goal.projection.ts'), 'utf8');

  it('owns sole resolveExportRef + resolveExportRefOrThrow bodies', () => {
    expect(sole).toContain('Residual 1003');
    expect(sole).toMatch(/export function resolveExportRef\b/);
    expect(sole).toMatch(/export function resolveExportRefOrThrow\b/);
    expect(sole).toContain('Unresolved ${entityLabel} reference to ${id}');
    expect(sole).toContain('EXPORT_VALIDATION_ERROR');
  });

  it('task/reminder/repository import sole without local dual bodies', () => {
    for (const [label, source, entity] of [
      ['task', task, 'task'],
      ['reminder', reminder, 'reminder'],
      ['repository', repository, 'repository'],
    ] as const) {
      expect(source, label).toContain('resolveExportRef');
      expect(source, label).toContain('resolveExportRefOrThrow');
      expect(source, label).toContain(`'${entity}'`);
      expect(source, label).not.toMatch(/function resolveRef\b/);
      expect(source, label).not.toMatch(/function resolveRefOrThrow\b/);
    }
  });

  it('Goal dual remains retired onto the sole (residual 1017)', () => {
    expect(goal).toContain('resolveExportRef');
    expect(goal).toContain("'goal'");
    expect(goal).not.toMatch(/function resolveRef/);
    expect(goal).not.toMatch(/function resolveRefOrThrow/);
    expect(goal).toContain('resolveExportRefOrThrow');
  });

  it('resolves mapped refs, warns, and throws with entityLabel', () => {
    const ctx: ExportContext = {
      identityId: 'id-1',
      exportedAt: new Date().toISOString(),
      refAllocator: new RefAllocator(),
      warnings: [],
      refToIdMap: new Map([['uuid-1', 'task:1']]),
    };
    expect(resolveExportRef(null, ctx, 'task')).toBeNull();
    expect(resolveExportRef('uuid-1', ctx, 'task')).toBe('task:1');
    expect(resolveExportRef('missing', ctx, 'task')).toBeNull();
    expect(ctx.warnings.at(-1)).toContain('Unresolved task reference to missing');
    expect(resolveExportRefOrThrow('uuid-1', ctx, 'reminder')).toBe('task:1');
    expect(() => resolveExportRefOrThrow('missing', ctx, 'repository')).toThrow(
      /EXPORT_VALIDATION_ERROR: Unresolved repository reference to missing/,
    );
  });
});
