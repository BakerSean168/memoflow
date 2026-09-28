import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  GITHUB_KNOWLEDGE_APP_ENV_KEYS,
  inspectGithubKnowledgeAppEnv,
  loadHostDevEnv,
  resolveHostDevEnvPath,
} from './host-dev-env.mjs';

test('resolves one machine-scoped host-dev env across worktrees', () => {
  assert.equal(
    resolveHostDevEnvPath({}, '/home/example'),
    '/home/example/.config/memoflow/host-dev.env',
  );
});

test('loads shared values without overriding explicit process values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memoflow-host-dev-env-'));
  const filePath = join(dir, 'host-dev.env');
  writeFileSync(
    filePath,
    [
      'GITHUB_APP_ID=shared-app-id',
      'GITHUB_APP_SLUG=shared-slug',
      'GITHUB_APP_PRIVATE_KEY="line-1\\nline-2"',
      'GITHUB_APP_WEBHOOK_SECRET=shared-hook-secret',
      'GITHUB_INSTALLATION_ROUTE_KEY=host-dev',
      'GITHUB_OAUTH_CLIENT_ID=shared-oauth-client',
      '',
    ].join('\n'),
  );
  chmodSync(filePath, 0o600);

  const env = { GITHUB_APP_ID: 'explicit-app-id' };
  const result = loadHostDevEnv({ env, filePath });

  assert.equal(result.loaded, true);
  assert.equal(result.insecurePermissions, false);
  assert.equal(env.GITHUB_APP_ID, 'explicit-app-id');
  assert.equal(env.GITHUB_APP_SLUG, 'shared-slug');
  assert.equal(env.GITHUB_APP_PRIVATE_KEY, 'line-1\nline-2');
  assert.equal(env.GITHUB_OAUTH_CLIENT_ID, 'shared-oauth-client');
  assert.equal(result.githubKnowledgeApp.configured, true);
});

test('reports a partial GitHub knowledge App configuration without exposing values', () => {
  const status = inspectGithubKnowledgeAppEnv({
    GITHUB_APP_ID: 'configured',
    GITHUB_APP_SLUG: 'configured',
  });

  assert.equal(status.configured, false);
  assert.equal(status.partial, true);
  assert.deepEqual(status.present, ['GITHUB_APP_ID', 'GITHUB_APP_SLUG']);
  assert.deepEqual(
    status.missing,
    GITHUB_KNOWLEDGE_APP_ENV_KEYS.filter(
      (key) => key !== 'GITHUB_APP_ID' && key !== 'GITHUB_APP_SLUG',
    ),
  );
});
