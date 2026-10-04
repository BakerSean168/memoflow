#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildInventory } from './lib/test-inventory.mjs';

const root = process.cwd();
const check = process.argv.includes('--check');
const inventory = await buildInventory(root);
const serialized = `${JSON.stringify(inventory, null, 2)}\n`;
if (check) {
  const target = path.resolve(root, 'tools/test-system-v2/test-inventory.json');
  const current = await fs.readFile(target, 'utf8').catch(() => '');
  if (current !== serialized) {
    console.error('[test-inventory] generated inventory is stale; run pnpm test:inventory');
    process.exitCode = 1;
  }
} else {
  const target = path.resolve(root, 'tools/test-system-v2/test-inventory.json');
  await fs.writeFile(target, serialized);
}
console.log(
  `[test-inventory] ${inventory.primary.length} files; ${JSON.stringify(inventory.counts)}`,
);
if (
  inventory.missing.length ||
  inventory.duplicate.length ||
  inventory.unexpected.length ||
  inventory.measurementOnly.length ||
  inventory.e2eGovernance.issues.length ||
  inventory.e2eRetirement.issues.length
) {
  console.error(
    JSON.stringify(
      {
        missing: inventory.missing,
        duplicate: inventory.duplicate,
        unexpected: inventory.unexpected,
        measurementOnly: inventory.measurementOnly,
        e2eGovernance: inventory.e2eGovernance,
        e2eRetirement: inventory.e2eRetirement,
      },
      null,
      2,
    ),
  );
  console.error('[test-inventory] ownership contract failed');
  process.exitCode = 1;
}
