import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(import.meta.dirname, '..');
const contractsFile = resolve(import.meta.dirname, '../../../contracts/src/modules/label/index.ts');
const forbidden =
  /\bGoal(?:Label)?\b|\bTask(?:Plan|Label)?\b|goal_labels|task_labels|goal_id|task_template_id/;

function sources(root: string): string[] {
  const result: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__' || entry.name === 'testing') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) result.push(full);
    }
  };
  walk(root);
  return result;
}

describe('LABEL-1302 pure registry ownership surface', () => {
  it('keeps owner-feature assignment concepts out of Label production source and contracts', () => {
    const violations = [...sources(sourceRoot), contractsFile].flatMap((file) => {
      const match = readFileSync(file, 'utf8').match(forbidden);
      return match ? [`${file}: ${match[0]}`] : [];
    });
    expect(violations).toEqual([]);
  });
});
