import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Scheduler owns raw worker diagnostics query parsing after CLEAN-6304. */
describe('Scheduler diagnostics query parser ownership', () => {
  const routes = readFileSync(resolve(__dirname, 'routes.ts'), 'utf8');

  it('keeps task query parsers with read-only worker diagnostics', () => {
    expect(routes).toMatch(/function parseNumber\b/);
    expect(routes).toMatch(/function parseString\b/);
    expect(routes).toMatch(/function parseBoolean\b/);
    expect(routes).toContain("path: '/tasks'");
    expect(routes).toContain("path: '/tasks/due'");
    expect(routes).toContain("path: '/tasks/:id'");
    expect(routes).not.toMatch(/method: '(?:post|put|patch|delete)'/);
  });
});
