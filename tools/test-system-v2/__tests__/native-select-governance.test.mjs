import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repositoryRoot = process.cwd();
const packagesDirectory = path.join(repositoryRoot, 'packages');
// Native controls belong inside the component library. Business packages must
// compose the shadcn family (or their own wrappers) instead of raw elements.
const componentLibrary = 'ui-vue-shadcn';
const nativeSelect = /<select(?=[\s>/])/;

function businessVueFiles() {
  return readdirSync(packagesDirectory)
    .filter((name) => name !== componentLibrary)
    .filter((name) => existsSync(path.join(packagesDirectory, name, 'src')))
    .flatMap((name) =>
      readdirSync(path.join(packagesDirectory, name, 'src'), {
        recursive: true,
        encoding: 'utf8',
      })
        .filter((file) => file.endsWith('.vue'))
        .map((file) => path.join('packages', name, 'src', file)),
    );
}

function findNativeSelects(files) {
  const offenders = [];
  for (const relativePath of files) {
    const lines = readFileSync(path.join(repositoryRoot, relativePath), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (nativeSelect.test(line)) offenders.push(`${relativePath}:${index + 1}`);
    });
  }
  return offenders;
}

test('business packages never render native <select>', () => {
  assert.deepEqual(
    findNativeSelects(businessVueFiles()),
    [],
    'use the ui-vue-shadcn Select family behind a wrapper instead of a native <select>',
  );
});

test('the guard sees native selects but ignores the Select component family', () => {
  const scope = businessVueFiles();
  assert.ok(scope.length > 0, 'the guard must scan at least one business Vue component');
  assert.ok(
    scope.every((file) => !file.startsWith(`packages/${componentLibrary}/`)),
    'the component library implements native elements internally and stays out of scope',
  );

  const source = [
    '<template>',
    '  <select v-model="value"><option value="a">A</option></select>',
    '  <Select><SelectTrigger /></Select>',
    '</template>',
  ].join('\n');
  const flagged = source
    .split('\n')
    .flatMap((line, index) => (nativeSelect.test(line) ? [index + 1] : []));
  assert.deepEqual(flagged, [2]);
});
