import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const compose = path.join(repoRoot, 'deployment/production/docker-compose.production.yml');
const required = [...readFileSync(compose, 'utf8').matchAll(/\$\{([A-Z_]+):\?/gu)];
const fixtureEnv = Object.fromEntries(required.map(([, name]) => [name, 'fixture']));

function apiEnvironment(overrides = {}) {
  const result = spawnSync('docker', ['compose', '-f', compose, 'config', '--format', 'json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      COMPOSE_DISABLE_ENV_FILE: '1',
      ...fixtureEnv,
      ...overrides,
    },
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(result.stdout).services.api.environment;
}

test('production keeps external OAuth access disabled until the operator enables it', () => {
  const environment = apiEnvironment();
  assert.equal(environment.EAG_READ_PILOT_ENABLED, '0');
  assert.equal(environment.EAG_OAUTH_ENABLED, '0');
  assert.equal(environment.EAG_CURSOR_SECRET, '');
});

test('production delivers the selected OAuth audience, scopes and credentials to the API', () => {
  const selected = {
    EAG_READ_PILOT_ENABLED: '1',
    EAG_OAUTH_ENABLED: '1',
    EAG_TASK_READ_ENABLED: '1',
    EAG_AUDIENCE: 'https://api.example.test/mcp',
    EAG_CURSOR_SECRET: 'fixture-cursor-secret-at-least-32-characters',
    EAG_OAUTH_CLIENT_IDS: 'https://client.example.test/oauth/client.json',
  };
  const environment = apiEnvironment(selected);
  for (const [name, value] of Object.entries(selected)) {
    assert.equal(environment[name], value, `${name} must reach the API container`);
  }
});
