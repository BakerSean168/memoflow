import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FORBIDDEN_CONTRACT_IMPORTS = ['rrule', 'ical.js', '@internationalized/date', '@date-fns/tz'];

function collectTsFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return collectTsFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.ts') ? [absolute] : [];
  });
}

describe('third-party date types stay out of workspace contract packages (TIME-1101)', () => {
  it('does not import recurrence/UI date libraries from feature contracts', () => {
    const packagesRoot = path.resolve(import.meta.dirname, '../../../packages');
    const contractRoots = readdirSync(packagesRoot, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          (entry.name.endsWith('-contracts') || entry.name === 'shared-primitives'),
      )
      .map((entry) => path.join(packagesRoot, entry.name, 'src'));
    const violations = contractRoots.flatMap(collectTsFiles).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return FORBIDDEN_CONTRACT_IMPORTS.filter(
        (library) => source.includes(`from '${library}'`) || source.includes(`from "${library}"`),
      ).map((library) => `${path.relative(packagesRoot, file)} -> ${library}`);
    });

    expect(violations).toEqual([]);
  });
});
