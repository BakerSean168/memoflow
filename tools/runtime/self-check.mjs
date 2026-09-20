import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getRuntimeProfile,
  loadRuntimeProfiles,
  resolveProdLikeHostPorts,
} from './load-profiles.mjs';

function readEnv(path) {
  const values = new Map();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    values.set(
      key,
      rest
        .join('=')
        .replace(/\s+#.*$/u, '')
        .trim(),
    );
  }
  return values;
}

const doc = loadRuntimeProfiles();
assert.deepEqual(doc.primaryEnvironments, ['host-dev', 'prod-like', 'staging', 'prod']);

const hostDev = getRuntimeProfile('host-dev');
assert.equal(hostDev.hostGroup, 'gcp-dev');
assert.equal(hostDev.composeProject, 'memoflow-host-dev');
assert.equal(hostDev.ports.web, 21000);
assert.equal(hostDev.ports.api, 21001);
assert.equal(hostDev.ports.powersync, 21002);
assert.equal(hostDev.ports.postgres, 21010);
assert.equal(hostDev.ports.redis, 21011);

const sharedEnv = readEnv('.env');
assert.equal(sharedEnv.has('API_PORT'), false, 'root .env must not shadow environment API_PORT');
assert.equal(sharedEnv.has('API_HOST'), false, 'root .env must not shadow environment API_HOST');

const developmentEnv = readEnv('.env.development');
assert.equal(developmentEnv.get('VITE_DEV_PORT'), String(hostDev.ports.web));
assert.equal(developmentEnv.get('API_PORT'), String(hostDev.ports.api));
assert.equal(developmentEnv.get('POWERSYNC_HOST_PORT'), String(hostDev.ports.powersync));
assert.equal(developmentEnv.get('POSTGRES_HOST_PORT'), String(hostDev.ports.postgres));
assert.equal(developmentEnv.get('REDIS_HOST_PORT'), String(hostDev.ports.redis));
assert.equal(developmentEnv.get('DB_PORT'), String(hostDev.ports.postgres));
assert.equal(developmentEnv.get('REDIS_PORT'), String(hostDev.ports.redis));
assert.equal(developmentEnv.get('PROXY_TARGET_URL'), `http://localhost:${hostDev.ports.api}`);
assert.equal(developmentEnv.get('POWERSYNC_URL'), `http://localhost:${hostDev.ports.powersync}`);

const prodLike = getRuntimeProfile('prod-like');
assert.equal(prodLike.composeProject, 'memoflow-prod-like');
assert.equal(prodLike.ports.api, 20201);
assert.equal(getRuntimeProfile('staging').composeProject, 'memoflow-staging');
assert.equal(getRuntimeProfile('staging').ports.web, 20250);
assert.equal(getRuntimeProfile('prod').composeProject, 'memoflow');
assert.equal(getRuntimeProfile('prod').localProbe, false);

const resolved = resolveProdLikeHostPorts({
  API_HOST_PORT: '3000',
  WEB_HOST_PORT: '5173',
  POWERSYNC_HOST_PORT: '8080',
  POSTGRES_HOST_PORT: '5432',
  REDIS_HOST_PORT: '6379',
});

assert.equal(resolved.ok, true);
assert.equal(resolved.forced.API_HOST_PORT, '20201');
assert.equal(resolved.forced.WEB_HOST_PORT, '20200');
assert.equal(resolved.forced.POWERSYNC_HOST_PORT, '20202');
assert.equal(resolved.forced.POSTGRES_HOST_PORT, '20210');
assert.equal(resolved.forced.REDIS_HOST_PORT, '20211');
assert.ok(resolved.warnings.length >= 5);

console.log('tools/runtime self-check OK');
