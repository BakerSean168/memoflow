import { describe, expect, it } from 'vitest';
import {
  GOVERNANCE_RULE_BUNDLE_HASH_ALGORITHM,
  GOVERNANCE_RULE_BUNDLE_KIND,
  GOVERNANCE_RULE_BUNDLE_SCHEMA_VERSION,
  GovernanceRuleBundleSchema,
} from './governance-rule-bundle';

describe('GovernanceRuleBundle contract (GOV-1903)', () => {
  it('accepts the versioned hash-addressed empty bundle', () => {
    expect(
      GovernanceRuleBundleSchema.safeParse({
        kind: GOVERNANCE_RULE_BUNDLE_KIND,
        schemaVersion: GOVERNANCE_RULE_BUNDLE_SCHEMA_VERSION,
        hashAlgorithm: GOVERNANCE_RULE_BUNDLE_HASH_ALGORITHM,
        semanticHash: `sha256:${'0'.repeat(64)}`,
        rules: [],
      }).success,
    ).toBe(true);
  });

  it('rejects unversioned or non-sha256 bundle identities', () => {
    const base = {
      kind: GOVERNANCE_RULE_BUNDLE_KIND,
      schemaVersion: GOVERNANCE_RULE_BUNDLE_SCHEMA_VERSION,
      hashAlgorithm: GOVERNANCE_RULE_BUNDLE_HASH_ALGORITHM,
      semanticHash: `sha256:${'0'.repeat(64)}`,
      rules: [],
    } as const;

    expect(GovernanceRuleBundleSchema.safeParse({ ...base, schemaVersion: 2 }).success).toBe(false);
    expect(
      GovernanceRuleBundleSchema.safeParse({ ...base, semanticHash: 'sha256:short' }).success,
    ).toBe(false);
    expect(GovernanceRuleBundleSchema.safeParse({ ...base, exportedAt: Date.now() }).success).toBe(
      false,
    );
  });
});
