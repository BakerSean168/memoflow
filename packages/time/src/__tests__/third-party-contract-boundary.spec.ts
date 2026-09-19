import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FORBIDDEN_CONTRACT_IMPORTS = [
  'rrule',
  'ical.js',
  '@internationalized/date',
  '@date-fns/tz',
];

function collectTsFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return collectTsFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.ts') ? [absolute] : [];
  });
}

describe('third-party date types stay out of @memoflow/contracts (TIME-1101)', () => {
  it('does not import recurrence/UI date libraries from feature contracts', () => {
    const contractsRoot = path.resolve(__dirname, '../../../contracts/src');
    const violations = collectTsFiles(contractsRoot).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return FORBIDDEN_CONTRACT_IMPORTS
        .filter((library) => source.includes(`from '${library}'`) || source.includes(`from "${library}"`))
        .map((library) => `${path.relative(contractsRoot, file)} -> ${library}`);
    });

    expect(violations).toEqual([]);
  });
});
