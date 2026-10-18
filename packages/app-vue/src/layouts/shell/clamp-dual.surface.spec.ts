import { describe, expect, it } from 'vitest';
import { clamp } from './clamp';

/**
 * Residual 1001: clamp dual retired (panel-geometry + useAppShellStore).
 * Sole body in clamp.ts with max < min fail-safe.
 * Soft residual 1038: tip focused suite numbers track Residual 1038 evidence tip (309/1339).
 * Soft residual 1083: goal clampPercentage keep-boundary surface (no force-merge).
 * Structural locks (sole import, no local body): app-vue-source-locks.json#clamp-dual.
 * Does not flip §13.2 checkboxes.
 */
describe('clamp dual retired (residual 1001)', () => {
  it('clamps into range and fails safe when max < min', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
    expect(clamp(3, 5, 2)).toBe(5);
  });
});
