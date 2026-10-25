import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const fmtBin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fmt.mjs');

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'quality-fmt-'));
  const git = (args) =>
    execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', ...args], {
      cwd: dir,
      encoding: 'utf8',
    });
  git(['init', '-q']);
  writeFileSync(path.join(dir, '.prettierrc'), '{"semi":true,"singleQuote":true}\n');
  writeFileSync(path.join(dir, '.prettierignore'), 'ignored-dir\n');
  writeFileSync(path.join(dir, 'bad.ts'), 'export const x = "a"\n');
  writeFileSync(path.join(dir, 'good.ts'), "export const y = 'b';\n");
  execFileSync('mkdir', ['-p', path.join(dir, 'ignored-dir')]);
  writeFileSync(path.join(dir, 'ignored-dir', 'also-bad.ts'), 'export const z = "c"\n');
  writeFileSync(path.join(dir, 'note.txt'), 'plain text\n');
  git(['add', '-A']);
  git(['commit', '-qm', 'init']);
  return dir;
}

function runFmt(dir, extra) {
  return spawnSync(process.execPath, [fmtBin, '--root', dir, ...extra], { encoding: 'utf8' });
}

test('fmt --all --check flags only the unformatted managed file and writes a receipt', () => {
  const dir = fixture();
  const result = runFmt(dir, ['--all', '--check', '--receipt', 'reports/fmt.json']);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const receipt = JSON.parse(readFileSync(path.join(dir, 'reports/fmt.json'), 'utf8'));
  assert.equal(receipt.kind, 'quality-fmt-receipt-v1');
  assert.deepEqual(receipt.filesDifferent, ['bad.ts']);
  assert.equal(receipt.skipped.unsupported, 3); // .prettierrc, .prettierignore, note.txt
  assert.equal(receipt.skipped.ignored, 1); // ignored-dir/also-bad.ts
  assert.ok(receipt.digest);
});

test('fmt --all --write formats in place; a later check passes', () => {
  const dir = fixture();
  const write = runFmt(dir, ['--all', '--write']);
  assert.equal(write.status, 0, write.stdout + write.stderr);
  assert.equal(readFileSync(path.join(dir, 'bad.ts'), 'utf8'), "export const x = 'a';\n");
  const check = runFmt(dir, ['--all', '--check']);
  assert.equal(check.status, 0, check.stdout + check.stderr);
});
