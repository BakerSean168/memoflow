import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  collectViolations,
  isStaticStyleExpression,
  parseAddedLines,
  scanLine,
  validateExemptions,
} from '../lib/style-guard.mjs';

const guardBin = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'style-guard.mjs',
);
const COMPONENT = 'apps/web/src/Sample.vue';

function fixture(component = '<div class="flex w-[137px]" />\n') {
  const dir = mkdtempSync(path.join(tmpdir(), 'quality-style-guard-'));
  const git = (args) =>
    execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', ...args], {
      cwd: dir,
      encoding: 'utf8',
    });
  git(['init', '-q']);
  execFileSync('mkdir', ['-p', path.join(dir, path.dirname(COMPONENT))]);
  writeFileSync(path.join(dir, COMPONENT), component);
  writeFileSync(path.join(dir, 'exemptions.json'), registry([]));
  git(['add', '-A']);
  git(['commit', '-qm', 'base']);
  return dir;
}

function registry(entries) {
  return `${JSON.stringify({ kind: 'style-guard-exemptions-v1', entries }, null, 2)}\n`;
}

function edit(dir, content, file = COMPONENT) {
  writeFileSync(path.join(dir, file), content);
}

function runGuard(dir, extra = []) {
  return spawnSync(
    process.execPath,
    [guardBin, '--root', dir, '--base', 'HEAD', '--exemptions', 'exemptions.json', ...extra],
    { encoding: 'utf8' },
  );
}

function setRegistry(dir, entries) {
  writeFileSync(path.join(dir, 'exemptions.json'), registry(entries));
}

test('changed mode blocks a newly added arbitrary value but ignores the existing backlog', () => {
  const dir = fixture();
  edit(dir, `<div class="flex w-[137px]" />\n<div class="mt-[7px]" />\n`);
  const result = runGuard(dir);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Sample\.vue:2/u);
  assert.match(result.stderr, /mt-\[7px\]/u);
  assert.doesNotMatch(result.stderr, /w-\[137px\]/u);
});

test('registry exemption allows the registered token and stale entries fail', () => {
  const dir = fixture();
  edit(dir, `<div class="flex w-[137px]" />\n<canvas class="h-[320px]" />\n`);
  setRegistry(dir, [
    {
      file: COMPONENT,
      token: 'h-[320px]',
      reason: 'chart canvas needs a fixed pixel height',
    },
  ]);
  const allowed = runGuard(dir);
  assert.equal(allowed.status, 0, allowed.stdout + allowed.stderr);

  setRegistry(dir, [{ file: COMPONENT, token: 'h-[999px]', reason: 'no longer used' }]);
  const stale = runGuard(dir);
  assert.equal(stale.status, 1, stale.stdout + stale.stderr);
  assert.match(stale.stderr, /已无 h-\[999px\] 的使用/u);
});

test('static inline style is rejected, runtime-bound style is allowed', () => {
  const dir = fixture();
  edit(
    dir,
    [
      '<div class="flex w-[137px]" />',
      '<div style="padding: 8px" />',
      '<div :style="{ height: \'200px\' }" />',
      '<div :style="{ height: `${rowHeight}px` }" />',
      '<div :style="panelStyle" />',
      '',
    ].join('\n'),
  );
  const result = runGuard(dir);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /style="padding: 8px"/u);
  assert.match(result.stderr, /:style="\{ height: '200px' \}"/u);
  assert.match(result.stderr, /2 violation/u);
  assert.doesNotMatch(result.stderr, /Sample\.vue:[45]/u);
});

test('token references, colors and typography are outside the managed dimensions', () => {
  const dir = fixture();
  edit(
    dir,
    [
      '<div class="flex w-[137px]" />',
      '<div class="w-[var(--sidebar-width)] text-[#f4f4f5] text-[11px] bg-[hsl(var(--hover))]" />',
      '',
    ].join('\n'),
  );
  const result = runGuard(dir);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('collectViolations deduplicates per line and skips comments', () => {
  const findings = scanLine('// w-[7px] legacy note');
  assert.deepEqual(findings, []);
  const violations = collectViolations(
    [
      {
        file: COMPONENT,
        lines: [
          { line: 4, text: '<div class="w-[7px] w-[7px]" />' },
          { line: 5, text: '<div class="rounded-[3px]" />' },
        ],
      },
    ],
    [],
  );
  assert.deepEqual(
    violations.map((item) => [item.line, item.token, item.dimension]),
    [
      [4, 'w-[7px]', 'spacing'],
      [5, 'rounded-[3px]', 'radius'],
    ],
  );
});

test('parseAddedLines keeps new-file line numbers and ignores removed lines', () => {
  const diff = [
    'diff --git a/apps/web/src/New.vue b/apps/web/src/New.vue',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/apps/web/src/New.vue',
    '@@ -0,0 +1,2 @@',
    '+<div class="w-[137px]" />',
    '+<div />',
    'diff --git a/apps/web/src/Old.vue b/apps/web/src/Old.vue',
    '--- a/apps/web/src/Old.vue',
    '+++ b/apps/web/src/Old.vue',
    '@@ -3,2 +3,2 @@',
    '-<div class="mt-[9px]" />',
    '+<div class="mt-[5px]" />',
    ' <span />',
  ].join('\n');
  const parsed = parseAddedLines(diff);
  assert.deepEqual(parsed, [
    {
      file: 'apps/web/src/New.vue',
      lines: [
        { line: 1, text: '<div class="w-[137px]" />' },
        { line: 2, text: '<div />' },
      ],
    },
    { file: 'apps/web/src/Old.vue', lines: [{ line: 3, text: '<div class="mt-[5px]" />' }] },
  ]);
});

test('style expression classifier distinguishes literals from runtime values', () => {
  assert.equal(isStaticStyleExpression("'width: 10px'"), true);
  assert.equal(isStaticStyleExpression('{ maxHeight: 200 }'), true);
  assert.equal(isStaticStyleExpression('{ backgroundColor: option.color }'), false);
  assert.equal(isStaticStyleExpression('progressGlowStyle(progressPct)'), false);
  assert.equal(isStaticStyleExpression("'width: ' + width"), false);
});

test('registry validation rejects duplicates and missing reasons', () => {
  const readFile = () => '<div class="w-[7px]" />';
  const problems = validateExemptions(
    [
      { file: COMPONENT, token: 'w-[7px]', reason: 'a' },
      { file: COMPONENT, token: 'w-[7px]', reason: 'b' },
      { file: COMPONENT, token: 'h-[7px]', reason: '  ' },
    ],
    readFile,
  );
  assert.ok(problems.some((problem) => problem.kind === 'duplicate'));
  assert.ok(problems.some((problem) => /reason/u.test(problem.message)));
});
