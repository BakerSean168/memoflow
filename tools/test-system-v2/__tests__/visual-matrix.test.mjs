import { readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const manifestPath = path.resolve(
  import.meta.dirname,
  '../../../apps/web/e2e/visual-regression/manifest.mjs',
);
const { matrix, requiredSurfaces, validateMatrix, desktopRunner } = await import(
  pathToFileURL(manifestPath).href
);
test('UI-9001 has one canonical owner for every master-plan surface', () => {
  validateMatrix(matrix);
  assert.equal(requiredSurfaces.length, 25);
  for (const dimension of ['theme', 'locale', 'width'])
    assert.equal(new Set(matrix.map((entry) => entry[dimension])).size, 2);
  assert.equal(desktopRunner.acceptance, false);
});
test('UI-9001 rejects omitted, duplicated and invalid fixture cases', () => {
  assert.throws(() => validateMatrix(matrix.slice(1)), /missing or duplicated/);
  assert.throws(() => validateMatrix([...matrix, matrix[0]]), /Duplicate case/);
  assert.throws(
    () =>
      validateMatrix(matrix.map((entry, index) => (index ? entry : { ...entry, theme: 'system' }))),
    /Invalid fixture/,
  );
});

test('UI-9001 baseline artifacts exactly match its deliberate matrix', () => {
  const directory = new URL('../../../apps/web/e2e/visual-regression/baselines/', import.meta.url);
  assert.deepEqual(
    readdirSync(directory).sort(),
    matrix.map((entry) => `${entry.id.replaceAll('.', '-')}.png`).sort(),
  );
});
