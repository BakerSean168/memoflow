import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveExportRef, resolveExportRefOrThrow } from './projection-helpers';
import type { ExportContext } from '../../portable-runtime';
import { RefAllocator } from '../../portable-runtime';

/** Residual 1017: Goal resolveRef dual remains retired onto the residual 1003 sole. */
describe('goal resolveRef dual retired (residual 1017)', () => {
  const dir = __dirname;
  const sole = readFileSync(resolve(dir, 'projection-helpers.ts'), 'utf8');
  const goal = readFileSync(resolve(dir, 'goal.projection.ts'), 'utf8');

  it('owns sole resolveExportRef helpers used by Goal', () => {
    expect(sole).toContain('Residual 1003');
    expect(sole).toMatch(/export function resolveExportRef\b/);
    expect(sole).toMatch(/export function resolveExportRefOrThrow\b/);
    expect(sole).toContain('Unresolved ${entityLabel} reference to ${id}');
  });

  it('Goal imports the sole without local dual bodies', () => {
    expect(goal).toContain('resolveExportRef');
    expect(goal).toContain("'goal'");
    expect(goal).toContain('resolveExportRefOrThrow');
    expect(goal).not.toMatch(/function resolveRef\b/);
    expect(goal).not.toMatch(/function resolveRefOrThrow\b/);
  });

  it('resolves mapped refs with Goal entity labels', () => {
    const ctx: ExportContext = {
      identityId: 'id-1',
      exportedAt: new Date().toISOString(),
      refAllocator: new RefAllocator(),
      warnings: [],
      refToIdMap: new Map([['uuid-goal', 'goal:1']]),
    };
    expect(resolveExportRef(null, ctx, 'goal')).toBeNull();
    expect(resolveExportRef('uuid-goal', ctx, 'goal')).toBe('goal:1');
    expect(resolveExportRef('missing', ctx, 'goal')).toBeNull();
    expect(ctx.warnings.at(-1)).toContain('Unresolved goal reference to missing');
    expect(resolveExportRefOrThrow('uuid-goal', ctx, 'goal')).toBe('goal:1');
    expect(() => resolveExportRefOrThrow('missing', ctx, 'goal')).toThrow(
      /EXPORT_VALIDATION_ERROR: Unresolved goal reference to missing/,
    );
  });
});
