#!/usr/bin/env node
import assert from 'node:assert/strict';

const EXACT_REF = /^[a-z0-9][a-z0-9._:/-]+@sha256:[0-9a-f]{64}$/u;
const RELEASE_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;
const APP_SERVICES = Object.freeze(['api', 'web', 'migrator']);

function replaceServiceImage(text, name, next) {
  if (!EXACT_REF.test(next)) throw new Error(`invalid immutable image reference for ${name}`);
  const section = new RegExp(
    `(^  ${name}:\\s*\\n)([\\s\\S]*?)(?=^  [a-z][a-z0-9_-]*:\\s*$|(?![\\s\\S]))`,
    'gm',
  );
  let seen = 0;
  const result = text.replace(section, (_, heading, body) => {
    seen += 1;
    const images = body.match(/^    image:[^\n]*$/gm) ?? [];
    if (images.length !== 1) throw new Error(`expected one ${name} image declaration`);
    const updated = body.replace(/^    image:[^\n]*$/m, `    image: ${next}`);
    return heading + updated;
  });
  if (seen !== 1) throw new Error(`expected one ${name} service definition; found ${seen}`);
  return result;
}

export function renderOracle2ComposeCandidate(current, releaseImages) {
  if (typeof current !== 'string' || !/^services:\s*$/mu.test(current)) {
    throw new Error('Oracle2 Compose must define services');
  }
  let next = current;
  for (const name of APP_SERVICES) {
    next = replaceServiceImage(next, name, releaseImages?.[name]);
  }
  return next;
}

export function renderOracle2EnvCandidate(current, version) {
  if (typeof current !== 'string' || !RELEASE_VERSION.test(version)) {
    throw new Error('invalid Oracle2 release version');
  }
  const lines = current.match(/^APP_VERSION=.*$/gm) ?? [];
  if (lines.length !== 1) {
    throw new Error('Oracle2 production env must have exactly one APP_VERSION declaration');
  }
  return current.replace(/^APP_VERSION=.*$/m, `APP_VERSION=${version}`);
}

function normalized(value) {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalized(value[key])]),
    );
  }
  return value;
}

/**
 * Confirm that the deployment candidate changes ONLY the three application
 * images and API APP_VERSION. This rejects accidental volume, network, port,
 * bind-mount, healthcheck or CPA-Caddy ownership drift before any container is
 * stopped or any migrator is started.
 */
export function assertOracle2ComposeCandidate(currentConfig, nextConfig, releaseImages, version) {
  if (!currentConfig?.services || !nextConfig?.services) {
    throw new Error('Docker Compose config JSON must contain services');
  }
  const expected = structuredClone(currentConfig);
  for (const name of APP_SERVICES) {
    const reference = releaseImages?.[name];
    if (!EXACT_REF.test(reference ?? '')) throw new Error(`invalid immutable ${name} reference`);
    if (!expected.services[name] || !nextConfig.services[name]) {
      throw new Error(`missing ${name} service`);
    }
    expected.services[name].image = reference;
  }
  if (!RELEASE_VERSION.test(version)) throw new Error('invalid release version');
  expected.services.api.environment.APP_VERSION = version;
  const active = Object.keys(nextConfig.services).sort();
  if (active.join(',') !== 'api,migrator,postgres,powersync,redis,web') {
    throw new Error('Oracle2 candidate must preserve exactly six services and no owned Caddy');
  }
  assert.deepEqual(
    normalized(nextConfig),
    normalized(expected),
    'Oracle2 candidate changed infrastructure outside application images/version',
  );
  return true;
}

export function releaseImageRefs(productionSet, registry, namespace) {
  if (productionSet?.schema !== 'memoflow.production-set/v1') {
    throw new Error('invalid production-set schema');
  }
  if (!/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(productionSet.releaseTag ?? '')) {
    throw new Error('invalid production release tag');
  }
  const images = {};
  for (const name of APP_SERVICES) {
    const entry = productionSet.images?.[name];
    const repository = `${registry}/${namespace}/memoflow-${name}`;
    const reference = `${entry?.repository}@${entry?.digest}`;
    if (entry?.repository !== repository || !EXACT_REF.test(reference)) {
      throw new Error(`invalid ${name} immutable production image`);
    }
    images[name] = reference;
  }
  return { images, version: productionSet.releaseTag.slice(1) };
}
