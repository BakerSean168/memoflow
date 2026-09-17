import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 1216 (P1/P2): formatTimestamp package-boundary keep-boundary.
 * Raw Scheduler task presentation was retired by S4-2302B.
 * Soft residual 1216: TimelineControls uses formatProductDateTime.
 */
describe('formatTimestamp keep-boundary (residual 1216)', () => {
  const dir = __dirname;
  const timeline = readFileSync(
    resolve(dir, '../../modules/goal/components/timeline/TimelineControls.vue'),
    'utf8',
  );


  it('soft residual 1216 timeline uses formatProductDateTime', () => {
    expect(timeline).toContain('formatProductDateTime');
    expect(timeline).not.toMatch(/function formatTimestamp\b/);
    expect(timeline).not.toContain('toLocaleString()');
  });
});
