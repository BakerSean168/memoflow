import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * App-vue source locks: deterministic retirement / boundary contracts that were
 * previously encoded as `readFileSync` + `toContain` unit specs inside app-vue.
 * They assert source structure, not behaviour, so they live in governance.
 *
 * Entry shape:
 *   { id, decision, origin, locks: [
 *       { file, stripComments?, forbid?: Matcher[], require?: Matcher[] },
 *       { absentPaths?: string[], presentPaths?: string[] },
 *       { scan: { root, extensions, exclude? }, stripComments?, forbid } ] }
 *   A scan lock applies its forbid matchers to every file under `root` whose
 *   extension is listed and whose path contains none of the `exclude` substrings.
 *   Matcher = string (literal substring) | { pattern, flags? } (RegExp)
 *
 * A file lock may name `files: string[]` instead of `file`; the matchers then run
 * against the files' contents joined with '\n' (one lock over a combined surface).
 *
 * Optional file-lock refinements (Phase 5 of #488, for locks that used to slice
 * or count source text):
 *   region: narrows the checked text before every matcher runs
 *     { pattern, flags? }  -> first RegExp match, or null (a failed lock) when
 *                             it does not match, even if the lock only forbids
 *     { start, end }       -> source.slice(source.indexOf(start), source.indexOf(end))
 *     { start, length }    -> `length` chars from indexOf(start); start must exist
 *   count: [{ pattern, flags?, equals?, min? }] global match count bounds
 *   order: [{ tokens: string[], chained? }] every token is present and each
 *     appears after the previous one. chained (default true) searches each token
 *     from the previous token's index; chained:false compares first occurrences.
 */

/** Remove block and line comments so prose never trips a token lock. */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\/.*$/g, '');
}

function describeMatcher(matcher) {
  return typeof matcher === 'string'
    ? JSON.stringify(matcher)
    : `/${matcher.pattern}/${matcher.flags ?? ''}`;
}

function matches(source, matcher) {
  if (typeof matcher === 'string') return source.includes(matcher);
  return new RegExp(matcher.pattern, matcher.flags ?? '').test(source);
}

function validMatcher(matcher) {
  if (typeof matcher === 'string') return matcher.length > 0;
  if (!matcher || typeof matcher.pattern !== 'string') return false;
  try {
    new RegExp(matcher.pattern, matcher.flags ?? '');
    return true;
  } catch {
    return false;
  }
}

export function validateSourceLockManifest(manifest) {
  const errors = [];
  if (manifest?.version !== 1) errors.push('version must be 1');
  if (!Array.isArray(manifest?.entries) || manifest.entries.length === 0) {
    errors.push('entries must be a non-empty array');
    return errors;
  }
  const ids = new Set();
  manifest.entries.forEach((entry, index) => {
    const prefix = `entries[${index}]`;
    if (typeof entry?.id !== 'string' || entry.id.length === 0)
      errors.push(`${prefix}.id is required`);
    if (ids.has(entry?.id)) errors.push(`${prefix}.id duplicates ${entry.id}`);
    ids.add(entry?.id);
    if (typeof entry?.decision !== 'string' || entry.decision.length === 0)
      errors.push(`${prefix}.decision is required`);
    if (!Array.isArray(entry?.locks) || entry.locks.length === 0) {
      errors.push(`${prefix}.locks must be a non-empty array`);
      return;
    }
    entry.locks.forEach((lock, lockIndex) => {
      const lockPrefix = `${prefix}.locks[${lockIndex}]`;
      if (typeof lock?.reason !== 'string' || lock.reason.trim().length === 0)
        errors.push(`${lockPrefix}.reason is required`);
      const hasFile =
        typeof lock?.file === 'string' ||
        (Array.isArray(lock?.files) &&
          lock.files.length > 1 &&
          lock.files.every((file) => typeof file === 'string'));
      const hasPaths = Array.isArray(lock?.absentPaths) || Array.isArray(lock?.presentPaths);
      const hasScan = lock?.scan !== undefined;
      if ([hasFile, hasPaths, hasScan].filter(Boolean).length !== 1)
        errors.push(`${lockPrefix} must declare exactly one of file, absent/presentPaths or scan`);
      if (hasScan) {
        if (
          typeof lock.scan?.root !== 'string' ||
          !Array.isArray(lock.scan?.extensions) ||
          lock.scan.extensions.length === 0
        )
          errors.push(`${lockPrefix}.scan needs root and extensions`);
        if (lock.require !== undefined) errors.push(`${lockPrefix}.scan supports forbid only`);
        if (
          !Array.isArray(lock.forbid) ||
          lock.forbid.length === 0 ||
          !lock.forbid.every(validMatcher)
        )
          errors.push(`${lockPrefix}.scan needs valid forbid matchers`);
      }
      if (hasFile) {
        const all = [...(lock.forbid ?? []), ...(lock.require ?? [])];
        if (all.length === 0 && !lock.count?.length && !lock.order?.length)
          errors.push(`${lockPrefix} declares no forbid/require/count/order matcher`);
        errors.push(...validateRefinements(lock, lockPrefix));
        all.forEach((matcher) => {
          if (!validMatcher(matcher))
            errors.push(`${lockPrefix} has invalid matcher ${JSON.stringify(matcher)}`);
        });
      }
    });
  });
  return errors;
}

function validateRefinements(lock, lockPrefix) {
  const errors = [];
  const region = lock.region;
  if (region !== undefined) {
    const byPattern = typeof region?.pattern === 'string' && validMatcher(region);
    const bySlice =
      typeof region?.start === 'string' &&
      region.start.length > 0 &&
      (typeof region.end === 'string' ? region.end.length > 0 : Number.isInteger(region.length));
    if (!byPattern && !bySlice)
      errors.push(`${lockPrefix}.region must be {pattern} or {start,end} or {start,length}`);
  }
  for (const [index, count] of (lock.count ?? []).entries()) {
    if (!validMatcher({ pattern: count?.pattern, flags: count?.flags }))
      errors.push(`${lockPrefix}.count[${index}] has an invalid pattern`);
    if (!Number.isInteger(count?.equals) && !Number.isInteger(count?.min))
      errors.push(`${lockPrefix}.count[${index}] needs equals or min`);
  }
  for (const [index, order] of (lock.order ?? []).entries()) {
    if (
      !Array.isArray(order?.tokens) ||
      order.tokens.length < 2 ||
      !order.tokens.every((token) => typeof token === 'string' && token.length > 0)
    )
      errors.push(`${lockPrefix}.order[${index}] needs at least two string tokens`);
  }
  return errors;
}

/** Apply a lock's region; returns null when the region does not match. */
export function applyRegion(source, region) {
  if (!region) return source;
  if (typeof region.pattern === 'string') {
    return source.match(new RegExp(region.pattern, region.flags ?? ''))?.[0] ?? null;
  }
  const start = source.indexOf(region.start);
  if (start < 0) return null;
  if (typeof region.end === 'string') {
    const end = source.indexOf(region.end, start + region.start.length);
    return end < 0 ? null : source.slice(start, end);
  }
  return source.slice(start, start + region.length);
}

export function countMatches(source, count) {
  const flags = (count.flags ?? '').replace('g', '') + 'g';
  return (source.match(new RegExp(count.pattern, flags)) ?? []).length;
}

export function orderHolds(source, order) {
  const chained = order.chained !== false;
  let previous = -1;
  for (const [index, token] of order.tokens.entries()) {
    const at = source.indexOf(token, chained && index > 0 ? previous : 0);
    if (at < 0 || (index > 0 && at <= previous)) return false;
    previous = at;
  }
  return true;
}

export function findSourceLockViolations(root, manifest) {
  const violations = [];
  for (const entry of manifest.entries) {
    for (const lock of entry.locks) {
      for (const relativePath of lock.absentPaths ?? []) {
        if (existsSync(path.join(root, relativePath)))
          violations.push({ id: entry.id, file: relativePath, detail: 'retired path exists' });
      }
      for (const relativePath of lock.presentPaths ?? []) {
        if (!existsSync(path.join(root, relativePath)))
          violations.push({ id: entry.id, file: relativePath, detail: 'required path missing' });
      }
      if (lock.scan) {
        violations.push(...scanViolations(root, entry.id, lock));
        continue;
      }
      const files = typeof lock.file === 'string' ? [lock.file] : lock.files;
      if (!Array.isArray(files)) continue;
      const missing = files.filter((file) => !existsSync(path.join(root, file)));
      if (missing.length > 0) {
        for (const file of missing)
          violations.push({ id: entry.id, file, detail: 'locked file missing' });
        continue;
      }
      const lockFile = files.join(' + ');
      const raw = files.map((file) => readFileSync(path.join(root, file), 'utf8')).join('\n');
      const source = applyRegion(lock.stripComments ? stripComments(raw) : raw, lock.region);
      if (source === null) {
        violations.push({ id: entry.id, file: lockFile, detail: 'region did not match' });
        continue;
      }
      for (const matcher of lock.forbid ?? []) {
        if (matches(source, matcher))
          violations.push({
            id: entry.id,
            file: lockFile,
            detail: `forbidden ${describeMatcher(matcher)}`,
          });
      }
      for (const count of lock.count ?? []) {
        const found = countMatches(source, count);
        const ok = Number.isInteger(count.equals) ? found === count.equals : found >= count.min;
        if (!ok)
          violations.push({
            id: entry.id,
            file: lockFile,
            detail: `count /${count.pattern}/ is ${found}, expected ${
              Number.isInteger(count.equals) ? count.equals : `>= ${count.min}`
            }`,
          });
      }
      for (const order of lock.order ?? []) {
        if (!orderHolds(source, order))
          violations.push({
            id: entry.id,
            file: lockFile,
            detail: `order ${order.tokens.map((token) => JSON.stringify(token)).join(' < ')} broken`,
          });
      }
      for (const matcher of lock.require ?? []) {
        if (!matches(source, matcher))
          violations.push({
            id: entry.id,
            file: lockFile,
            detail: `required ${describeMatcher(matcher)} missing`,
          });
      }
    }
  }
  return violations;
}

function walk(directory, output = []) {
  for (const dirent of readdirSync(directory, { withFileTypes: true })) {
    if (dirent.name === 'node_modules' || dirent.name === 'dist') continue;
    const full = path.join(directory, dirent.name);
    if (dirent.isDirectory()) walk(full, output);
    else output.push(full);
  }
  return output;
}

function scanViolations(root, id, lock) {
  const scanRoot = path.join(root, lock.scan.root);
  if (!existsSync(scanRoot)) return [{ id, file: lock.scan.root, detail: 'scan root missing' }];
  const violations = [];
  for (const absolute of walk(scanRoot)) {
    const relativePath = path.relative(root, absolute).split(path.sep).join('/');
    if (!lock.scan.extensions.some((extension) => relativePath.endsWith(extension))) continue;
    if ((lock.scan.exclude ?? []).some((fragment) => relativePath.includes(fragment))) continue;
    const raw = readFileSync(absolute, 'utf8');
    const source = lock.stripComments ? stripComments(raw) : raw;
    for (const matcher of lock.forbid) {
      if (matches(source, matcher))
        violations.push({
          id,
          file: relativePath,
          detail: `forbidden ${describeMatcher(matcher)}`,
        });
    }
  }
  return violations;
}
