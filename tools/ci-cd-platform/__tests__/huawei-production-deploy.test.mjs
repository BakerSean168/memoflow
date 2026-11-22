import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const source = readFileSync(path.join(root, 'deployment/production/huawei/deploy.sh'), 'utf8');

test('Huawei release artifact includes app-only executor and fails closed on runtime drift', () => {
  const dockerfile = readFileSync(
    path.join(root, 'deployment/production/Dockerfile.runtime'),
    'utf8',
  );
  assert.match(
    dockerfile,
    /COPY deployment\/production\/huawei\/deploy\.sh \/runtime\/production\/huawei\/deploy\.sh/u,
  );
  assert.match(
    dockerfile,
    /COPY deployment\/production\/huawei\/enable-oauth\.sh \/runtime\/production\/huawei\/enable-oauth\.sh/u,
  );
  assert.match(source, /production-selected/u);
  assert.match(source, /sha256sum/u);
  assert.match(source, /HUAWEI_CANDIDATE=SAFE|verify-candidate\.py/u);
  assert.match(source, /pg_dump/u);
  assert.match(source, /record BLOCKED/u);
  assert.match(source, /flock -n 9/u);
  assert.doesNotMatch(
    source,
    /docker compose down|down -v|up -d.*postgres|rm -rf.*postgres-prod-data/u,
  );
});

test('Huawei validator permits only immutable app images, version and new OAuth-write default', () => {
  const run = spawnSync(
    'python3',
    ['-m', 'unittest', 'discover', '-s', 'deployment/production/huawei', '-p', 'test_*.py'],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 20_000,
    },
  );
  assert.equal(run.status, 0, run.stderr || run.error?.message);
  assert.match(run.stderr, /Ran 4 tests/u);
});
