import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const VALID_STATUSES = new Set(['active', 'staged']);

function hasSourcePath(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) return false;

  try {
    const repositoryRoot = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (path.resolve(repositoryRoot) !== path.resolve(root)) return true;

    return (
      execFileSync(
        'git',
        ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '--', relativePath],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim().length > 0
    );
  } catch {
    // Fixture roots and exported source trees may not be Git worktrees. In
    // those environments physical presence remains the conservative signal.
    return true;
  }
}

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
    if (
      entry?.requiredPaths !== undefined &&
      (!Array.isArray(entry.requiredPaths) || entry.requiredPaths.length === 0)
    ) {
      errors.push(`${prefix}.requiredPaths must be a non-empty array when provided`);
    }
  }
  return errors;
}

export function findVnextRetirementViolations(root, manifest) {
  const violations = [];
  for (const entry of manifest.entries ?? []) {
    if (entry.status !== 'active') continue;
    for (const relativePath of entry.forbiddenPaths ?? []) {
      if (hasSourcePath(root, relativePath)) {
        violations.push({ id: entry.id, decision: entry.decision, relativePath });
      }
    }
    for (const relativePath of entry.requiredPaths ?? []) {
      if (!existsSync(path.join(root, relativePath))) {
        violations.push({
          id: entry.id,
          decision: entry.decision,
          relativePath,
          missingRequired: true,
        });
      }
    }
  }
  return violations;
}
