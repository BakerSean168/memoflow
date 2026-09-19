/**
 * Explicit Governance Rule -> repository engineering audit adapter (GOV-1904).
 *
 * Only registry-declared, read-only audit scripts may be invoked. Unmapped
 * product rules remain visible but non-enforcing. Autofix is proposal-only.
 */

const CHECK_SCRIPT_RE = /^tools\/governance\/[a-z0-9][a-z0-9-]*-audit\.mjs$/;

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

export function validateEngineeringAdapterRegistry(registry) {
  object(registry, 'adapter registry');
  if (registry.schemaVersion !== 1 || !Array.isArray(registry.adapters)) {
    throw new Error('Unsupported engineering adapter registry');
  }
  const ruleKeys = new Set();
  const adapterIds = new Set();
  for (const adapter of registry.adapters) {
    object(adapter, 'adapter');
    if (typeof adapter.ruleKey !== 'string' || typeof adapter.adapterId !== 'string') {
      throw new Error('adapter ruleKey/adapterId are required');
    }
    if (ruleKeys.has(adapter.ruleKey) || adapterIds.has(adapter.adapterId)) {
      throw new Error('adapter registry contains duplicate ruleKey/adapterId');
    }
    ruleKeys.add(adapter.ruleKey);
    adapterIds.add(adapter.adapterId);
    if (!['full', 'partial'].includes(adapter.coverage))
      throw new Error('adapter coverage is unsupported');
    if (!CHECK_SCRIPT_RE.test(adapter.checkScript) || adapter.checkScript.includes('..')) {
      throw new Error('adapter checkScript must be a tools/governance/*-audit.mjs path');
    }
    object(adapter.proposal, 'adapter proposal');
    if (adapter.proposal.kind !== 'review-required') {
      throw new Error('autofix adapter must be proposal-only');
    }
    if (!Array.isArray(adapter.proposal.suggestedActions)) {
      throw new Error('adapter proposal suggestedActions must be an array');
    }
  }
  return registry;
}

export async function runMappedEngineeringChecks({ bundle, registry, executeCheck }) {
  const validated = validateEngineeringAdapterRegistry(registry);
  const adapterByRule = new Map(validated.adapters.map((adapter) => [adapter.ruleKey, adapter]));
  const resultByAdapter = new Map();

  for (const adapter of validated.adapters) {
    if (!bundle.rules.some((rule) => rule.engineering.ruleKey === adapter.ruleKey)) continue;
    resultByAdapter.set(adapter.adapterId, await executeCheck(adapter));
  }

  const rules = bundle.rules.map((rule) => {
    const adapter = adapterByRule.get(rule.engineering.ruleKey);
    if (!adapter) {
      return {
        ruleKey: rule.engineering.ruleKey,
        severity: rule.engineering.severity,
        mapping: 'unmapped',
        enforcement: 'none',
        check: null,
      };
    }
    return {
      ruleKey: rule.engineering.ruleKey,
      severity: rule.engineering.severity,
      mapping: 'mapped',
      enforcement: adapter.coverage,
      adapterId: adapter.adapterId,
      description: adapter.description,
      check: resultByAdapter.get(adapter.adapterId),
    };
  });

  return {
    bundle: {
      kind: bundle.kind,
      schemaVersion: bundle.schemaVersion,
      semanticHash: bundle.semanticHash,
    },
    adapterRegistryVersion: validated.schemaVersion,
    summary: {
      totalRules: rules.length,
      mappedRules: rules.filter((rule) => rule.mapping === 'mapped').length,
      unmappedRules: rules.filter((rule) => rule.mapping === 'unmapped').length,
      failedChecks: rules.filter((rule) => rule.check?.status === 'failed').length,
    },
    rules,
  };
}

export function createAutofixProposalReport({ report, registry }) {
  const adapterById = new Map(registry.adapters.map((adapter) => [adapter.adapterId, adapter]));
  return {
    kind: 'memoflow.governance-autofix-proposals',
    schemaVersion: 1,
    bundleSemanticHash: report.bundle.semanticHash,
    mutationPolicy: 'proposal-only',
    proposals: report.rules
      .filter((rule) => rule.mapping === 'mapped' && rule.check?.status === 'failed')
      .map((rule) => {
        const adapter = adapterById.get(rule.adapterId);
        return {
          ruleKey: rule.ruleKey,
          adapterId: rule.adapterId,
          coverage: rule.enforcement,
          directMutation: false,
          kind: adapter.proposal.kind,
          summary: adapter.proposal.summary,
          suggestedActions: [...adapter.proposal.suggestedActions],
          checkEvidence: {
            exitCode: rule.check.exitCode,
            stdout: rule.check.stdout,
            stderr: rule.check.stderr,
          },
        };
      }),
  };
}
