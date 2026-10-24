import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('@memoflow/cloud-auth root export', () => {
  it('remains a browser-safe client facade', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'index.ts'), 'utf8');

    expect(source).toContain("from './client/index.js'");
    expect(source).not.toContain("from './server/index.js'");
  });
});
