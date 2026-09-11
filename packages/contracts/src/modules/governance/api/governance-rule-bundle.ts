/**
 * Version-pinned Governance rule-bundle contract (GOV-1903).
 *
 * Product Governance owns live Rule/RuleRevision state. Engineering governance
 * may only consume an explicitly exported bundle whose semantic payload is
 * deterministic and hash-addressable.
 */
import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type { IdentityId, RuleId, RuleRevisionId } from '../../../primitives';
import { ChangeType } from '../value-objects/change-type';
import { Language } from '../value-objects/language';
import { RuleSeverity } from '../value-objects/rule-severity';
import { SnippetType } from '../value-objects/snippet-type';

export const GOVERNANCE_RULE_BUNDLE_KIND = 'memoflow.governance-rule-bundle' as const;
export const GOVERNANCE_RULE_BUNDLE_SCHEMA_VERSION = 1 as const;
export const GOVERNANCE_RULE_BUNDLE_HASH_ALGORITHM = 'sha256' as const;

export const GovernanceRuleBundleSnippetSchema = z
  .object({
    language: z.enum(Language),
    type: z.enum(SnippetType),
    content: z.string(),
    caption: z.string().nullable(),
  })
  .strict();

export const GovernanceRuleBundleRevisionSchema = z
  .object({
    revisionId: brandedId<RuleRevisionId>(),
    revisionNumber: z.number().int().positive(),
    authorId: brandedId<IdentityId>(),
    changeType: z.enum(ChangeType),
    changedFields: z.array(z.string()),
    previousValues: z.record(z.string(), z.unknown()),
    newValues: z.record(z.string(), z.unknown()),
    createdAt: z.number().int(),
  })
  .strict();

export const GovernanceRuleBundleEntrySchema = z
  .object({
    code: z.string(),
    title: z.string(),
    description: z.string(),
    severity: z.enum(RuleSeverity),
    tags: z.array(z.string()),
    liveReferenceLocation: z.string().nullable(),
    goodExamples: z.array(GovernanceRuleBundleSnippetSchema),
    badExamples: z.array(GovernanceRuleBundleSnippetSchema),
    provenance: z
      .object({
        ruleId: brandedId<RuleId>(),
        authorId: brandedId<IdentityId>(),
        createdAt: z.number().int(),
        updatedAt: z.number().int(),
        revisionCount: z.number().int().nonnegative(),
        latestRevision: GovernanceRuleBundleRevisionSchema.nullable(),
      })
      .strict(),
    engineering: z
      .object({
        ruleKey: z.string(),
        severity: z.enum(RuleSeverity),
        tags: z.array(z.string()),
        referencePath: z.string().nullable(),
      })
      .strict(),
  })
  .strict();

/** Semantic payload covered by `semanticHash`. No wall-clock export timestamp is allowed. */
export const GovernanceRuleBundlePayloadSchema = z
  .object({
    kind: z.literal(GOVERNANCE_RULE_BUNDLE_KIND),
    schemaVersion: z.literal(GOVERNANCE_RULE_BUNDLE_SCHEMA_VERSION),
    rules: z.array(GovernanceRuleBundleEntrySchema),
  })
  .strict();

export const GovernanceRuleBundleSchema = GovernanceRuleBundlePayloadSchema.extend({
  hashAlgorithm: z.literal(GOVERNANCE_RULE_BUNDLE_HASH_ALGORITHM),
  semanticHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
}).strict();

export type GovernanceRuleBundlePayload = z.infer<typeof GovernanceRuleBundlePayloadSchema>;
export type GovernanceRuleBundle = z.infer<typeof GovernanceRuleBundleSchema>;
export type GovernanceRuleBundleEntry = z.infer<typeof GovernanceRuleBundleEntrySchema>;

export type ExportGovernanceRuleBundleReq = Record<string, never>;
export type ExportGovernanceRuleBundleRes = GovernanceRuleBundle;
