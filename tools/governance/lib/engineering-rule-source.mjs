/** Repository-native engineering source: Node built-ins only; pinned, read-only local JSON. */
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

export const ENGINEERING_RULE_KIND = 'memoflow.engineering-rules';
export const ENGINEERING_RULE_SOURCE = 'tools/governance/engineering-rules.json';
export const ENGINEERING_RULE_PINS = 'tools/governance/pinned-engineering-rules.json';
const HASH_RE = /^sha256:[0-9a-f]{64}$/;

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => compare(a, b))
        .map(([key, item]) => [key, normalize(item)]),
    );
  }
  return value;
}

export function canonicalEngineeringRuleJson(value) {
  return JSON.stringify(normalize(value));
}

export function computeEngineeringRuleHash(source) {
  const payload = {
    kind: source.kind,
    schemaVersion: source.schemaVersion,
    rules: source.rules,
    adapters: source.adapters,
  };
  return `sha256:${createHash('sha256').update(canonicalEngineeringRuleJson(payload), 'utf8').digest('hex')}`;
}

function shape(value, keys, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  ) {
    throw new Error(`${label} requires exactly: ${keys.join(', ')}`);
  }
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${label} requires non-empty text`);
}

export function validateEngineeringRulePath(value) {
  text(value, 'repository-relative path');
  if (
    /[\x00-\x1f\x7f\\:?#*\[\]{}]/.test(value) ||
    path.posix.isAbsolute(value) ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error('Source/reference path must be repository-relative without escapes');
  }
  return value;
}

/** Containment and file type precede reading, including symlink sources/pins. */
export function resolveEngineeringRuleFile(root, relativePath) {
  validateEngineeringRulePath(relativePath);
  const realRoot = realpathSync(root);
  const fullPath = realpathSync(path.join(realRoot, relativePath));
  const rel = path.relative(realRoot, fullPath);
  if (
    rel === '..' ||
    rel.startsWith(`..${path.sep}`) ||
    path.isAbsolute(rel) ||
    !statSync(fullPath).isFile()
  ) {
    throw new Error('Engineering rule file escapes repository or is not a file');
  }
  return fullPath;
}

export function validateEngineeringRuleSource(source, expectedHash) {
  shape(source, ['kind', 'schemaVersion', 'rules', 'adapters'], 'engineering source');
  if (source.kind !== ENGINEERING_RULE_KIND || source.schemaVersion !== 1) {
    throw new Error('Unsupported engineering rule kind/schemaVersion');
  }
  if (!Array.isArray(source.rules) || !source.rules.length)
    throw new Error('Engineering rules must be a non-empty array');
  let previous = '';
  for (const rule of source.rules) {
    shape(
      rule,
      [
        'code',
        'title',
        'description',
        'severity',
        'tags',
        'referencePath',
        'goodExamples',
        'badExamples',
      ],
      'engineering rule',
    );
    for (const field of ['code', 'title', 'description']) text(rule[field], field);
    if (!/^[A-Z][A-Z0-9]*-\d{3}$/.test(rule.code)) throw new Error('Invalid engineering code');
    if (compare(previous, rule.code) >= 0)
      throw new Error('Engineering rule keys must be unique in canonical sorted order');
    previous = rule.code;
    if (!['Mandatory', 'Recommended'].includes(rule.severity))
      throw new Error('Unsupported engineering severity');
    if (!Array.isArray(rule.tags)) throw new Error('Engineering tags must be an array');
    rule.tags.forEach((tag, index) => {
      text(tag, 'tag');
      if (index > 0 && compare(rule.tags[index - 1], tag) >= 0)
        throw new Error('Tags must be unique in canonical sorted order');
    });
    validateEngineeringRulePath(rule.referencePath);
    for (const [field, type] of [
      ['goodExamples', 'GoodExample'],
      ['badExamples', 'BadExample'],
    ]) {
      if (!Array.isArray(rule[field])) throw new Error(`${field} must be an array`);
      for (const example of rule[field]) {
        shape(example, ['language', 'type', 'content', 'caption'], field);
        for (const key of ['language', 'content', 'caption']) text(example[key], `${field}.${key}`);
        if (example.type !== type) throw new Error(`Unsupported ${field} type`);
      }
    }
  }
  if (!Array.isArray(source.adapters)) throw new Error('Adapters must be an array');
  const keys = new Set(source.rules.map((rule) => rule.code));
  let previousAdapter = '';
  for (const adapter of source.adapters) {
    shape(
      adapter,
      ['ruleKey', 'adapterId', 'coverage', 'checkScript', 'description', 'proposal'],
      'adapter',
    );
    if (!keys.has(adapter.ruleKey) || compare(previousAdapter, adapter.ruleKey) >= 0) {
      throw new Error('Adapter keys must reference rules in unique sorted order');
    }
    previousAdapter = adapter.ruleKey;
    if (
      adapter.ruleKey !== 'DDD-003' ||
      adapter.adapterId !== 'package-internal-boundary' ||
      adapter.coverage !== 'partial' ||
      adapter.checkScript !== 'tools/governance/package-internal-boundary-audit.mjs'
    ) {
      throw new Error('Unsupported engineering mapping contract');
    }
    validateEngineeringRulePath(adapter.checkScript);
    text(adapter.description, 'adapter description');
    shape(adapter.proposal, ['kind', 'summary', 'suggestedActions'], 'proposal');
    if (adapter.proposal.kind !== 'review-required')
      throw new Error('Proposal must require review');
    text(adapter.proposal.summary, 'proposal summary');
    if (
      !Array.isArray(adapter.proposal.suggestedActions) ||
      !adapter.proposal.suggestedActions.length
    ) {
      throw new Error('Proposal actions must be a non-empty array');
    }
    adapter.proposal.suggestedActions.forEach((action) => text(action, 'proposal action'));
  }
  const semanticHash = computeEngineeringRuleHash(source);
  if (expectedHash !== undefined && expectedHash !== semanticHash)
    throw new Error('Engineering source pinned hash mismatch');
  return { ...source, semanticHash };
}

export function loadEngineeringRuleSource({ root, sourcePath = ENGINEERING_RULE_SOURCE }) {
  const fullPath = resolveEngineeringRuleFile(root, sourcePath);
  const pins = JSON.parse(
    readFileSync(resolveEngineeringRuleFile(root, ENGINEERING_RULE_PINS), 'utf8'),
  );
  shape(pins, ['schemaVersion', 'sources'], 'engineering pins');
  if (pins.schemaVersion !== 1 || !Array.isArray(pins.sources) || !pins.sources.length)
    throw new Error('Unsupported engineering pins');
  const paths = new Set();
  for (const pin of pins.sources) {
    shape(pin, ['path', 'semanticHash'], 'engineering pin');
    validateEngineeringRulePath(pin.path);
    if (paths.has(pin.path)) throw new Error('Duplicate engineering pin path');
    paths.add(pin.path);
    if (typeof pin.semanticHash !== 'string' || !HASH_RE.test(pin.semanticHash))
      throw new Error('Invalid engineering pin hash');
  }
  const pin = pins.sources.find((entry) => entry.path === sourcePath);
  if (!pin) throw new Error(`Engineering source '${sourcePath}' is not repository-pinned`);
  return validateEngineeringRuleSource(
    JSON.parse(readFileSync(fullPath, 'utf8')),
    pin.semanticHash,
  );
}
