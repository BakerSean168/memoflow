import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeBundleHash,
  loadPinnedBundle,
  resolveRepositoryBundlePath,
  validatePublishedBundle,
} from '../lib/published-rule-bundle.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const FIXTURE_PATH = 'tools/governance/__fixtures__/governance-rule-bundle.v1.json';
const fixture = () => JSON.parse(readFileSync(path.join(ROOT, FIXTURE_PATH), 'utf8'));

describe('published GovernanceRuleBundle pin/hash boundary (GOV-1904)', () => {
  it('accepts the deterministic fixture only with a matching explicit pin', () => {
    const bundle = fixture();
    const loaded = loadPinnedBundle({
      root: ROOT,
      bundlePath: FIXTURE_PATH,
      gitState: { tracked: false, clean: false },
      expectedHash: bundle.semanticHash,
    });
    expect(loaded.pinKind).toBe('explicit-hash');
    expect(computeBundleHash(loaded.bundle)).toBe(bundle.semanticHash);
  });

  it('rejects semantic tampering even when the declared hash is left unchanged', () => {
    const bundle = fixture();
    bundle.rules[0].title = 'tampered';
    expect(() => validatePublishedBundle(bundle, bundle.semanticHash)).toThrow(/hash mismatch/);
  });

  it('rejects non-canonical ordering and mirrored engineering metadata drift', () => {
    const unsorted = fixture();
    unsorted.rules.reverse();
    unsorted.semanticHash = computeBundleHash(unsorted);
    expect(() => validatePublishedBundle(unsorted, unsorted.semanticHash)).toThrow(/sorted order/);

    const drifted = fixture();
    drifted.rules[0].engineering.severity = 'Recommended';
    drifted.semanticHash = computeBundleHash(drifted);
    expect(() => validatePublishedBundle(drifted, drifted.semanticHash)).toThrow(
      /mirror code\/severity/,
    );
  });

  it('rejects live/absolute/escaping paths and unpinned files', () => {
    expect(() => resolveRepositoryBundlePath(ROOT, 'https://example.test/bundle.json')).toThrow(
      /repository-relative/,
    );
    expect(() => resolveRepositoryBundlePath(ROOT, '/tmp/bundle.json')).toThrow(
      /repository-relative/,
    );
    expect(() => resolveRepositoryBundlePath(ROOT, '../bundle.json')).toThrow(/escapes repository/);
    expect(() =>
      loadPinnedBundle({
        root: ROOT,
        bundlePath: FIXTURE_PATH,
        gitState: { tracked: false, clean: false },
      }),
    ).toThrow(/not pinned/);
  });
});
