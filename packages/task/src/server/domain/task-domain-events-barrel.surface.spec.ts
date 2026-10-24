import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 257: task domain has no dual events/ barrel re-exporting
 * Task*Event / TaskEventMap from contracts. Import event types from
 * @memoflow/contracts/task directly.
 */
describe('task domain events barrel single-track surface', () => {
  const domainDir = __dirname;
  const dualDir = resolve(domainDir, 'events');
  const dualIndex = resolve(domainDir, 'events/index.ts');
  const domainIndex = resolve(domainDir, 'index.ts');

  it('drops domain/events contracts re-export dual barrel', () => {
    expect(existsSync(dualDir)).toBe(false);
    expect(existsSync(dualIndex)).toBe(false);
  });

  it('domain index does not re-export dual events barrel', () => {
    const src = readFileSync(domainIndex, 'utf8');
    expect(src).not.toContain("from './events'");
  });
});
