import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPath, globToRegExp, isIgnored, parseNameStatusZ } from '../lib/git-files.mjs';

test('parseNameStatusZ parses modify/add/delete', () => {
  const text = 'M\0src/a.ts\0A\0src/b.ts\0D\0src/c.ts\0';
  assert.deepEqual(parseNameStatusZ(text), [
    { status: 'M', path: 'src/a.ts' },
    { status: 'A', path: 'src/b.ts' },
    { status: 'D', path: 'src/c.ts' },
  ]);
});

test('parseNameStatusZ parses renames with old and new paths', () => {
  const text = 'R100\0src/old.ts\0src/new.ts\0M\0src/x.ts\0';
  assert.deepEqual(parseNameStatusZ(text), [
    { status: 'R', oldPath: 'src/old.ts', path: 'src/new.ts' },
    { status: 'M', path: 'src/x.ts' },
  ]);
});

test('globToRegExp honors anchored directory patterns', () => {
  const re = globToRegExp('/dist');
  assert.equal(re.test('dist/app.js'), true);
  assert.equal(re.test('apps/web/dist/app.js'), false);
});

test('globToRegExp honors ** segments and bare basenames', () => {
  assert.equal(isIgnored(['**/.pytest-temp'], 'apps/ai-service/.pytest-temp/x'), true);
  assert.equal(isIgnored(['pnpm-lock.yaml'], 'pnpm-lock.yaml'), true);
  assert.equal(isIgnored(['pnpm-lock.yaml'], 'packages/a/pnpm-lock.yaml'), true);
  assert.equal(
    isIgnored(
      ['packages/database/src/generated'],
      'packages/database/src/generated/prisma/index.js',
    ),
    true,
  );
  assert.equal(
    isIgnored(['packages/database/src/generated'], 'packages/database/src/other.ts'),
    false,
  );
});

test('classifyPath: ignored wins, then extension support', () => {
  const patterns = ['/dist', 'pnpm-lock.yaml'];
  assert.equal(classifyPath('dist/a.ts', patterns), 'ignored');
  assert.equal(classifyPath('pnpm-lock.yaml', patterns), 'ignored');
  assert.equal(classifyPath('src/a.ts', patterns), 'checkable');
  assert.equal(classifyPath('src/logo.png', patterns), 'unsupported');
});

test('parsePorcelainZ parses tracked changes and skips untracked', async () => {
  const { parsePorcelainZ } = await import('../lib/git-files.mjs');
  const text = ' M\0src/a.ts\0A \0src/b.ts\0 D\0src/c.ts\0??\0src/new.ts\0';
  // tokens are "<code> <path>" joined without separator beyond the code prefix
  const parsed = parsePorcelainZ(' M src/a.ts\0A  src/b.ts\0 D src/c.ts\0?? src/new.ts\0');
  assert.deepEqual(parsed, [
    { status: 'M', path: 'src/a.ts' },
    { status: 'A', path: 'src/b.ts' },
    { status: 'D', path: 'src/c.ts' },
  ]);
  assert.ok(text.length > 0);
});
