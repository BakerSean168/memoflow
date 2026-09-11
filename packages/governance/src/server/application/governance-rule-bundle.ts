/**
 * Governance deterministic published rule-bundle projection (GOV-1903).
 *
 * Owner: Governance application layer. This file converts live Rule/RuleRevision
 * domain state into a canonical, versioned, hash-addressable publication shape.
 * It must stay transport/persistence neutral, include no export wall clock, and
 * must never read or mutate Prisma/PowerSync directly.
 *
 * 治理应用层负责把 Rule/RuleRevision 投影为稳定、可哈希的发布包；这里不得直接读取或修改 Prisma/PowerSync，也不得引入导出时钟等非确定性字段。
 */
import { createHash } from 'node:crypto';
import {
  GOVERNANCE_RULE_BUNDLE_HASH_ALGORITHM,
  GOVERNANCE_RULE_BUNDLE_KIND,
  GOVERNANCE_RULE_BUNDLE_SCHEMA_VERSION,
  GovernanceRuleBundlePayloadSchema,
  GovernanceRuleBundleSchema,
  type GovernanceRuleBundle,
  type GovernanceRuleBundleEntry,
} from '@memoflow/contracts/governance';
import type { Rule } from '../domain/aggregates/rule';
import type { RuleRevision } from '../domain/entities/rule-revision';

/** Locale-independent UTF-16 code-unit ordering for cross-machine deterministic hashes. */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Recursively sorts object keys while preserving array order. */
function normalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item));
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, item]) => [key, normalizeJsonValue(item)]),
    );
  }

  return value;
}

/**
 * Stable JSON encoding used exclusively for Governance bundle semantic hashes.
 * 仅用于 Governance bundle 语义哈希的稳定 JSON 编码。
 * @param value - Value to normalize and encode. 待规范化并编码的值。
 * @returns Canonical JSON text. 规范 JSON 文本。
 */
export function canonicalGovernanceBundleJson(value: unknown): string {
  return JSON.stringify(normalizeJsonValue(value));
}

function normalizeSnippets(
  snippets: ReturnType<Rule['toClientDTO']>['goodExamples'],
): GovernanceRuleBundleEntry['goodExamples'] {
  return snippets
    .map((snippet) => ({
      language: snippet.language,
      type: snippet.type,
      content: snippet.content,
      caption: snippet.caption,
    }))
    .sort((left, right) =>
      compareText(canonicalGovernanceBundleJson(left), canonicalGovernanceBundleJson(right)),
    );
}

/**
 * Projects one live Rule + revision ledger into the deterministic published shape.
 * 将 live Rule 与 revision ledger 投影为确定性的发布条目。
 * @param rule - Active Governance rule to publish. 待发布规则。
 * @param revisions - Persisted revision ledger. 持久化修订账本。
 * @returns Canonical published bundle entry. 规范化发布条目。
 */
export function projectGovernanceRuleBundleEntry(
  rule: Rule,
  revisions: readonly RuleRevision[],
): GovernanceRuleBundleEntry {
  const dto = rule.toClientDTO();
  const tags = dto.tags.map((tag) => tag.value).sort(compareText);
  const orderedRevisions = [...revisions].sort(
    (left, right) =>
      left.revisionNumber - right.revisionNumber || compareText(String(left.id), String(right.id)),
  );
  const latestRevision =
    orderedRevisions.length > 0
      ? orderedRevisions[orderedRevisions.length - 1]!.toClientDTO()
      : null;

  return {
    code: dto.code,
    title: dto.title,
    description: dto.description,
    severity: dto.severity,
    tags,
    liveReferenceLocation: dto.liveReferenceLocation,
    goodExamples: normalizeSnippets(dto.goodExamples),
    badExamples: normalizeSnippets(dto.badExamples),
    provenance: {
      ruleId: dto.id,
      authorId: dto.authorId,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
      revisionCount: orderedRevisions.length,
      latestRevision: latestRevision
        ? {
            revisionId: latestRevision.id,
            revisionNumber: latestRevision.revisionNumber,
            authorId: latestRevision.authorId,
            changeType: latestRevision.changeType,
            changedFields: [...latestRevision.changedFields].sort(compareText),
            previousValues: normalizeJsonValue(latestRevision.previousValues) as Record<
              string,
              unknown
            >,
            newValues: normalizeJsonValue(latestRevision.newValues) as Record<string, unknown>,
            createdAt: latestRevision.createdAt,
          }
        : null,
    },
    engineering: {
      ruleKey: dto.code,
      severity: dto.severity,
      tags,
      referencePath: dto.liveReferenceLocation,
    },
  };
}

/**
 * Creates a byte-stable rule bundle from already-projected Active rules.
 * The hash covers only `{kind, schemaVersion, rules}` and therefore never
 * depends on export time, machine identity or JSON pretty-print settings.
 * 根据 Active Rule 条目创建字节稳定、可复现哈希的规则包。
 * @param entries - Projected Active-rule entries. Active Rule 投影条目。
 * @returns Validated versioned bundle with semantic SHA-256. 带语义 SHA-256 的版本化 bundle。
 */
export function createGovernanceRuleBundle(
  entries: readonly GovernanceRuleBundleEntry[],
): GovernanceRuleBundle {
  const payload = GovernanceRuleBundlePayloadSchema.parse({
    kind: GOVERNANCE_RULE_BUNDLE_KIND,
    schemaVersion: GOVERNANCE_RULE_BUNDLE_SCHEMA_VERSION,
    rules: [...entries].sort(
      (left, right) =>
        compareText(left.code, right.code) ||
        compareText(String(left.provenance.ruleId), String(right.provenance.ruleId)),
    ),
  });
  const semanticHash = `${GOVERNANCE_RULE_BUNDLE_HASH_ALGORITHM}:${createHash(
    GOVERNANCE_RULE_BUNDLE_HASH_ALGORITHM,
  )
    .update(canonicalGovernanceBundleJson(payload), 'utf8')
    .digest('hex')}`;

  return GovernanceRuleBundleSchema.parse({
    ...payload,
    hashAlgorithm: GOVERNANCE_RULE_BUNDLE_HASH_ALGORITHM,
    semanticHash,
  });
}
