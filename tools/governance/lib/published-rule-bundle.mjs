/**
 * GovernanceRuleBundle pinned-snapshot helpers (GOV-1904).
 * Serialized bundle only: no Governance runtime, Prisma, PowerSync or network access.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

export const BUNDLE_KIND = 'memoflow.governance-rule-bundle';
export const BUNDLE_SCHEMA_VERSION = 1;
const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => compareText(a, b))
        .map(([key, item]) => [key, normalize(item)]),
    );
  }
  return value;
}

export function canonicalBundleJson(value) {
  return JSON.stringify(normalize(value));
}

export function computeBundleHash(bundle) {
  const payload = { kind: bundle.kind, schemaVersion: bundle.schemaVersion, rules: bundle.rules };
  return `sha256:${createHash('sha256').update(canonicalBundleJson(payload), 'utf8').digest('hex')}`;
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function string(value, label, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
}

function sortedStrings(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} must be a string array`);
  }
  for (let index = 1; index < value.length; index += 1) {
    if (compareText(value[index - 1], value[index]) > 0) {
      throw new Error(`${label} must use canonical sorted order`);
    }
  }
}

function uuid(value, label) {
  string(value, label);
  if (!UUID_RE.test(value)) throw new Error(`${label} must be a UUID`);
}

function validateRule(rule, index) {
  const label = `bundle.rules[${index}]`;
  object(rule, label);
  string(rule.code, `${label}.code`);
  string(rule.title, `${label}.title`);
  string(rule.description, `${label}.description`);
  if (!['Mandatory', 'Recommended'].includes(rule.severity)) {
    throw new Error(`${label}.severity is unsupported`);
  }
  sortedStrings(rule.tags, `${label}.tags`);
  string(rule.liveReferenceLocation, `${label}.liveReferenceLocation`, true);
  if (!Array.isArray(rule.goodExamples) || !Array.isArray(rule.badExamples)) {
    throw new Error(`${label} examples must be arrays`);
  }

  const provenance = object(rule.provenance, `${label}.provenance`);
  uuid(provenance.ruleId, `${label}.provenance.ruleId`);
  uuid(provenance.authorId, `${label}.provenance.authorId`);
  if (!Number.isInteger(provenance.revisionCount) || provenance.revisionCount < 0) {
    throw new Error(`${label}.provenance.revisionCount must be non-negative`);
  }
  if (provenance.latestRevision !== null) {
    const revision = object(provenance.latestRevision, `${label}.provenance.latestRevision`);
    uuid(revision.revisionId, `${label}.provenance.latestRevision.revisionId`);
    sortedStrings(revision.changedFields, `${label}.provenance.latestRevision.changedFields`);
  } else if (provenance.revisionCount !== 0) {
    throw new Error(`${label}.provenance.latestRevision is required when revisionCount > 0`);
  }

  const engineering = object(rule.engineering, `${label}.engineering`);
  if (engineering.ruleKey !== rule.code || engineering.severity !== rule.severity) {
    throw new Error(`${label}.engineering must mirror code/severity`);
  }
  sortedStrings(engineering.tags, `${label}.engineering.tags`);
  if (canonicalBundleJson(engineering.tags) !== canonicalBundleJson(rule.tags)) {
    throw new Error(`${label}.engineering.tags must equal tags`);
  }
  if (engineering.referencePath !== rule.liveReferenceLocation) {
    throw new Error(`${label}.engineering.referencePath must equal liveReferenceLocation`);
  }
}

export function validatePublishedBundle(bundle, expectedHash) {
  object(bundle, 'bundle');
  if (bundle.kind !== BUNDLE_KIND || bundle.schemaVersion !== BUNDLE_SCHEMA_VERSION) {
    throw new Error('Unsupported Governance rule bundle kind/schemaVersion');
  }
  if (bundle.hashAlgorithm !== 'sha256' || !HASH_RE.test(bundle.semanticHash)) {
    throw new Error('Governance rule bundle requires sha256 semanticHash');
  }
  if (!Array.isArray(bundle.rules)) throw new Error('bundle.rules must be an array');
  bundle.rules.forEach(validateRule);
  for (let index = 1; index < bundle.rules.length; index += 1) {
    if (compareText(bundle.rules[index - 1].code, bundle.rules[index].code) > 0) {
      throw new Error('bundle.rules must use canonical sorted order');
    }
  }
  const hash = computeBundleHash(bundle);
  if (hash !== bundle.semanticHash)
    throw new Error(`Governance rule bundle hash mismatch: ${hash}`);
  if (expectedHash !== undefined && expectedHash !== bundle.semanticHash) {
    throw new Error(`Pinned hash mismatch: ${expectedHash}`);
  }
  return bundle;
}

export function resolveRepositoryBundlePath(root, bundlePath) {
  if (typeof bundlePath !== 'string' || bundlePath.length === 0)
    throw new Error('bundle path is required');
  if (bundlePath.includes('://') || bundlePath.startsWith('/')) {
    throw new Error('Governance bundle source must be a repository-relative file');
  }
  const fullPath = resolve(root, bundlePath);
  const relPath = relative(root, fullPath);
  if (relPath === '..' || relPath.startsWith(`..${sep}`))
    throw new Error('bundle path escapes repository root');
  return { fullPath, relPath: relPath.replaceAll('\\', '/') };
}

export function loadPinnedBundle({ root, bundlePath, gitState, expectedHash }) {
  const { fullPath, relPath } = resolveRepositoryBundlePath(root, bundlePath);
  const gitPinned = gitState?.tracked === true && gitState?.clean === true;
  const hashPinned = typeof expectedHash === 'string' && HASH_RE.test(expectedHash);
  if (!gitPinned && !hashPinned) {
    throw new Error(`Governance bundle '${relPath}' is not pinned`);
  }
  const bundle = validatePublishedBundle(JSON.parse(readFileSync(fullPath, 'utf8')), expectedHash);
  return { bundle, relPath, pinKind: gitPinned ? 'git-clean' : 'explicit-hash' };
}
