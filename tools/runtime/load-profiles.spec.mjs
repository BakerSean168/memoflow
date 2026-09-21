import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveProdLikeHostPorts } from './load-profiles.mjs';

const machinePorts = {
  API_HOST_PORT: '12136',
  WEB_HOST_PORT: '12137',
  POWERSYNC_HOST_PORT: '12139',
  POSTGRES_HOST_PORT: '12140',
  REDIS_HOST_PORT: '12141',
};

test('keeps the shared prod-like SSOT by default', () => {
  const result = resolveProdLikeHostPorts(machinePorts);

  assert.equal(result.ok, true);
  assert.equal(result.forced.API_HOST_PORT, '20201');
  assert.equal(result.forced.WEB_HOST_PORT, '20200');
});

test('accepts an explicit machine-local port range', () => {
  const result = resolveProdLikeHostPorts(machinePorts, { allowMachineOverride: true });

  assert.equal(result.ok, true);
  assert.deepEqual(result.forced, machinePorts);
});

test('rejects duplicate or reserved machine-local ports', () => {
  const result = resolveProdLikeHostPorts(
    {
      ...machinePorts,
      WEB_HOST_PORT: '12136',
      REDIS_HOST_PORT: '20221',
    },
    { allowMachineOverride: true },
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /duplicates (API|WEB)_HOST_PORT/u);
  assert.match(result.errors.join('\n'), /reserved host port/u);
});

test('primary environments use non-overlapping port ownership on the same host group', async () => {
  const { loadRuntimeProfiles } = await import('./load-profiles.mjs');
  const doc = loadRuntimeProfiles();
  const owners = new Map();

  for (const name of doc.primaryEnvironments ?? []) {
    const profile = doc.profiles[name];
    assert.ok(profile, `missing primary environment ${name}`);
    for (const port of Object.values(profile.ports ?? {})) {
      const key = `${profile.hostGroup}:${port}`;
      assert.equal(owners.has(key), false, `${name} collides with ${owners.get(key)} at ${key}`);
      owners.set(key, name);
    }
  }
});

test('GCP primary environment ports stay inside their assigned blocks', async () => {
  const { getRuntimeProfile } = await import('./load-profiles.mjs');
  for (const name of ['host-dev', 'prod-like', 'staging']) {
    const profile = getRuntimeProfile(name);
    const [start, end] = profile.portBlock.split('-').map(Number);
    for (const port of Object.values(profile.ports ?? {})) {
      assert.ok(port >= start && port <= end, `${name}:${port} escapes ${profile.portBlock}`);
    }
  }
});
