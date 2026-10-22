import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const ORACLE_PROJECT = 'memoflow-oracle2';
export const CONTROL_IMAGE = 'ghcr.io/bakersean168/memoflow-production-runtime:production-selected';
export const APP_SERVICES = Object.freeze(['api', 'web', 'migrator']);
export const RUNTIME_SERVICES = Object.freeze(['postgres', 'redis', 'powersync', 'caddy']);
export const LIVE_SERVICES = Object.freeze(['api', 'web', 'powersync', 'postgres', 'redis']);
export const FULL_SHA = /^[a-f0-9]{40}$/u;
export const DIGEST = /^sha256:[0-9a-f]{64}$/u;
export const RELEASE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/u;

export function sha256(bytes) {
  return 'sha256:' + createHash('sha256').update(bytes).digest('hex');
}

export function releaseVersion(releaseTag) {
  const match = RELEASE_TAG.exec(releaseTag ?? '');
  if (!match) throw new Error('unsupported production release tag');
  return match.slice(1).map(Number);
}

export function requireVersionForward(currentTag, nextTag) {
  const current = releaseVersion(currentTag);
  const next = releaseVersion(nextTag);
  for (let i = 0; i < 3; i += 1) {
    if (next[i] > current[i]) return;
    if (next[i] < current[i])
      throw new Error('production downgrade requires manual recovery approval');
  }
  throw new Error('reselection of same version with another production-set is not allowed');
}

export function verifyControlArtifact(image, manifestBytes, registry, namespace) {
  if (image?.Architecture !== 'arm64') throw new Error('Oracle2 requires arm64 control artifact');
  const labels = image?.Config?.Labels ?? {};
  const releaseSha = labels['io.memoflow.release.revision'];
  const controlSha = labels['org.opencontainers.image.revision'];
  const expectedRawHash = labels['io.memoflow.production-set.sha256'];
  const expectedSetDigest = labels['io.memoflow.production-set.digest'];
  if (!FULL_SHA.test(releaseSha ?? '') || !FULL_SHA.test(controlSha ?? '')) {
    throw new Error('control release/control-plane SHA label invalid');
  }
  if (!DIGEST.test(expectedRawHash ?? '') || !DIGEST.test(expectedSetDigest ?? '')) {
    throw new Error('control production-set digest label invalid');
  }
  if (sha256(manifestBytes) !== expectedRawHash) {
    throw new Error('production-set bytes differ from control image SHA256 label');
  }
  const selected = JSON.parse(manifestBytes.toString('utf8'));
  if (
    selected.schema !== 'memoflow.production-set/v1' ||
    selected.gitSha !== releaseSha ||
    selected.controlPlaneSha !== controlSha ||
    selected.digest !== expectedSetDigest
  ) {
    throw new Error('production-set identity does not match OCI control labels');
  }
  const version = releaseVersion(selected.releaseTag);
  if (selected.version !== version.join('.')) throw new Error('production-set version mismatch');
  if (labels['org.opencontainers.image.version'] !== selected.releaseTag) {
    throw new Error('control artifact release version mismatch');
  }
  if (typeof registry !== 'string' || !registry || !/^[a-z0-9._-]+$/iu.test(registry)) {
    throw new Error('invalid host production registry');
  }
  if (typeof namespace !== 'string' || !/^[a-z0-9._/-]+$/iu.test(namespace)) {
    throw new Error('invalid host production namespace');
  }
  const images = {};
  for (const service of APP_SERVICES) {
    const entry = selected.images?.[service];
    const wantedRepository = registry + '/' + namespace + '/memoflow-' + service;
    if (entry?.repository !== wantedRepository || !DIGEST.test(entry.digest ?? '')) {
      throw new Error('selected ' + service + ' immutable image does not match registry');
    }
    images[service] = 'ghcr.io/bakersean168/memoflow-' + service + '@' + entry.digest;
  }
  for (const service of RUNTIME_SERVICES) {
    const entry = selected.runtime?.[service];
    if (
      entry?.repository !== registry + '/' + namespace + '/memoflow-' + service ||
      !DIGEST.test(entry?.digest ?? '')
    ) {
      throw new Error('selected ' + service + ' runtime image is unpinned');
    }
  }
  return {
    selected,
    releaseSha,
    controlSha,
    productionSetDigest: expectedSetDigest,
    imageRefs: images,
  };
}

export function runtimePins(selected) {
  const pinned = {};
  for (const service of RUNTIME_SERVICES) {
    const entry = selected?.runtime?.[service];
    if (!DIGEST.test(entry?.digest ?? ''))
      throw new Error('missing ' + service + ' runtime digest');
    pinned[service] = entry.repository + '@' + entry.digest;
  }
  return pinned;
}

export function requireStaticRuntime(previous, incoming) {
  assert.deepEqual(
    runtimePins(incoming),
    runtimePins(previous),
    'Oracle2 datastore, PowerSync and shared CPA Caddy image changes need their own rollout',
  );
}

export function assertAlreadyDeployed(state, current, containers, caddy) {
  if (state?.status !== 'DEPLOYED') throw new Error('watcher state is not DEPLOYED');
  if (
    current.composeHash !== state.composeHash ||
    current.envHash !== state.envHash ||
    current.appVersion !== state.version
  ) {
    throw new Error('Oracle2 production Compose/env drift; operator review required');
  }
  for (const service of LIVE_SERVICES) {
    const container = containers?.[service];
    if (container?.State?.Health?.Status !== 'healthy') {
      throw new Error('Oracle2 ' + service + ' not healthy');
    }
    const reference = container?.Config?.Image;
    if (reference !== current.serviceImages?.[service]) {
      throw new Error('Oracle2 ' + service + ' running image differs from canonical Compose');
    }
    if (['api', 'web'].includes(service) && reference !== state.appImages?.[service]) {
      throw new Error('Oracle2 ' + service + ' does not run selected digest');
    }
  }
  for (const service of ['postgres', 'redis']) {
    if (containers[service]?.Id !== state.dataIds?.[service]) {
      throw new Error('Oracle2 ' + service + ' container replaced; do not silently adopt');
    }
  }
  if (!caddy?.State?.Running || caddy?.Id !== state.dataIds?.caddy) {
    throw new Error('shared CPA Caddy changed without watcher approval');
  }
  return true;
}

export function redactMessage(error) {
  const input = error instanceof Error ? error.message : String(error);
  return input.split(/[\r\n]/u, 1)[0].slice(0, 250);
}
