import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBoolean } from './parse-boolean';

describe('parseBoolean single Goal route helper', () => {
  const dir = __dirname;
  const sole = readFileSync(resolve(dir, 'parse-boolean.ts'), 'utf8');
  const goal = readFileSync(resolve(dir, 'goal.routes.ts'), 'utf8');

  it('owns the sole helper body and Goal routes import it', () => {
    expect(sole).toMatch(/export function parseBoolean\b/);
    expect(goal).toContain("import { parseBoolean } from './parse-boolean'");
    expect(goal).not.toMatch(/function parseBoolean\b/);
  });

  it('maps query string true/false and rejects other values', () => {
    expect(parseBoolean('true')).toBe(true);
    expect(parseBoolean('false')).toBe(false);
    expect(parseBoolean(undefined)).toBeUndefined();
    expect(parseBoolean(null)).toBeUndefined();
    expect(parseBoolean('1')).toBeUndefined();
    expect(parseBoolean(true)).toBeUndefined();
  });
});
