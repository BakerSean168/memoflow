import { existsSync } from 'node:fs';
import path from 'node:path';

const VALID_STATUSES = new Set(['active', 'staged']);

export function validateVnextRetirementManifest(manifest) {
  const errors = [];
  if (manifest?.version !== 1) errors.push('manifest.version must equal 1');
  if (!Array.isArray(manifest?.entries)) {
    errors.push('manifest.entries must be an array');
    return errors;
  }

  const ids = new Set();
  for (const [index, entry] of manifest.entries.entries()) {
    const prefix = `entries[${index}]`;
    if (typeof entry?.id !== 'string' || entry.id.length === 0)
      errors.push(`${prefix}.id is required`);
    if (ids.has(entry?.id)) errors.push(`${prefix}.id duplicates ${entry.id}`);
    ids.add(entry?.id);
    if (!VALID_STATUSES.has(entry?.status))
      errors.push(`${prefix}.status must be active or staged`);
    if (typeof entry?.decision !== 'string' || entry.decision.length === 0)
      errors.push(`${prefix}.decision is required`);
    if (!Array.isArray(entry?.forbiddenPaths) || entry.forbiddenPaths.length === 0) {
      errors.push(`${prefix}.forbiddenPaths must be a non-empty array`);
    }
  }
  return errors;
}

export function findVnextRetirementViolations(root, manifest) {
  const violations = [];
  for (const entry of manifest.entries ?? []) {
    if (entry.status !== 'active') continue;
    for (const relativePath of entry.forbiddenPaths ?? []) {
      if (existsSync(path.join(root, relativePath))) {
        violations.push({ id: entry.id, decision: entry.decision, relativePath });
      }
    }
  }
  return violations;
}
