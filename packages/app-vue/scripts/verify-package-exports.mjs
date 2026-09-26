/*
 * This verifier must import the package through its published entry points;
 * relative imports would bypass the export map and invalidate the test.
 */
/* eslint-disable @nx/enforce-module-boundaries */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import * as root from '@memoflow/app-vue';
import * as di from '@memoflow/app-vue/di';

const packageRoot = new URL('../', import.meta.url);
const packageJson = JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8'));

for (const [subpath, conditions] of Object.entries(packageJson.exports)) {
  for (const target of Object.values(conditions)) {
    assert.match(target, /^\.\/dist\//, `${subpath} must resolve from dist`);
    assert.ok(existsSync(new URL(target.slice(2), packageRoot)), `${subpath} target is missing: ${target}`);
  }
}

const sharedKeyNames = Object.keys(root).filter((name) => name.endsWith('_KEY') && name in di);

assert.ok(sharedKeyNames.length > 0, 'No shared injection keys were exported');

for (const name of sharedKeyNames) {
  assert.strictEqual(root[name], di[name], `${name} is duplicated across package entry points`);
}

console.log(
  `Verified ${Object.keys(packageJson.exports).length} dist exports and ${sharedKeyNames.length} shared injection keys.`,
);
