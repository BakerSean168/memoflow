---
tags: [plan, archive, governance, engineering-governance, migration]
description: PVC-GOV-7902 repository-native engineering input architecture and implementation evidence
created: 2026-10-02T00:00:00+00:00
updated: 2026-10-02T00:00:00+00:00
---

# PVC-GOV-7902 — Engineering Governance input decoupling

## Decision and inspected evidence (before implementation)

Baseline: `9f4f943b958`, branch `product/vnext-gov-7902`. GOV-7901 remains accepted as a
non-destructive baseline. ADR-113 remains Proposed; destructiveAllowed remains false;
GOV-7903 is blocked. AGENT Governance-first policy and Product presence guards stay active.

The existing CLI loads a hash-pinned serialized Product bundle through
`lib/published-rule-bundle.mjs`. Its validator requires UUID rule/author/revision provenance
and mirrored engineering metadata. The shared engineering adapter actually consumes only
ruleKey and severity, dispatching DDD-003 through an explicit package-internal-boundary runner.
No title, examples, tags, or reference path controls execution. The five-rule published snapshot
has DDD-001/002 Mandatory, DDD-003 Mandatory, and DDD-004/005 Recommended. All five express
engineering standards, but only DDD-003 enforces anything, and only with partial coverage.
The remaining four must stay visible as unmapped/non-enforcing, regardless of severity.

Source of truth: `tools/governance/engineering-rules.json`, kind
`memoflow.engineering-rules`, schemaVersion 1. This hand-maintained repository source owns
flat code/title/description/severity/tags/referencePath/goodExamples/badExamples.
It preserves the legacy engineering descriptions and illustrative examples, but removes all
Product persistence provenance and redundant mirrored fields. Reference paths describe surviving
Goal/Task/contracts owner evidence and are never imported or read by the input loader.
`pinned-engineering-rules.json` owns the native semantic hash. The Product published snapshot,
legacy pin and bridge remain migration compatibility/parity evidence until GOV-7903.

Canonical identity includes kind, schemaVersion and all rule metadata plus embedded adapter mappings; object keys use lexical
order, rules use unique sorted code, tags use unique sorted text. Validation rejects unknown
fields, malformed examples, unsupported kind/severity/hash, duplicate keys, ordering drift,
non-relative/escaping reference/source paths, and symlink escapes before reading source files.
Native input requires independent pin agreement; no network, DB or exporter.

## Implementation boundaries and sequence

1. B1/B2: add native schema/loader, source and pins. Expose flat-rule engineering execution in
   the existing pure adapter; retain legacy wrapper and output identity. Add a native default CLI
   with the same explicit runner allowlist and proposal-only behavior. Audit traversal reads
   ordinary package source as audit subjects, not Product semantics or persistence input.
2. B3: schema/hash/path negative tests; all-five-rule semantic parity for pass/failure report,
   check and review-required proposals. Exclude intentionally different source identity hashes,
   Product provenance and retargeted evidence paths from parity; preserve all report rule fields.
   Copy the complete native import closure to a temporary minimal repository without Product
   package/contracts/schema/export/snapshot, deny network and writes in child processes, and
   run all three CLI modes over passing and failing real-owner source fixtures.
3. B4: record a proposed smallest-real-owner vertical-slice policy here only. It would select a
   real owner, characterize behavior, verify one slice, verify a second owner, then generalize.
   Activation and replacement of active reference tests require accepted ADR-113. Existing
   physical-presence guards are decision gates, never engineering rule semantics.
4. B5: after focused parity passes, switch the normal root CLI and input pins to native files;
   preserve cache behavior, standalone audits and once-only non-cacheable GOV-7901 drift audit.
   Full root governance still includes Product presence/docs compatibility until ADR acceptance.
5. B6: retarget the six inventoried maintained docs to native rule truth and surviving evidence;
   preserve Product-specific usage and decision history, explicitly labeled as such.
6. Inventory evolution: preserve baseline and historical accepted counts; explicitly lock new
   KEEP_ENGINEERING paths, split shared adapter/metadata from legacy parity paths, classify
   retained legacy evidence according to its compatibility role, keep B4 and root Product-docs
   residuals MIGRATE_FIRST. Update exact classification locks and tests together, without
   changing scan patterns, containment, ownership checks or destructive decision gate.

## B4 replacement policy and acceptance tests — proposal only

Activation requires accepted ADR-113 and a separately reviewed AGENT.md change. Choose the
smallest real owner vertical slice, add characterization tests, implement and verify it,
repeat on a second real owner, and only then promote shared abstractions.

Replacement acceptance tests would require named owner paths, behavior characterization,
passing owner boundary/transport tests, evidence for the second owner and preservation of
repository audits. They would replace Product physical-presence/reference-first assertions
only after ADR acceptance. Current tests instead lock the unchanged Governance-first text,
Proposed decision gate, destructiveAllowed=false and retained physical-presence tests.

## Validation and completion evidence

Accepted and frozen by independent ChatGPT Web review. No Product runtime,
DB/PowerSync/UI/route/IPC behavior, AGENT activation or ADR-113 status changes are made.

| Closure | Concrete evidence                                                                                                                                    | Residual gate                                                                     |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| B1      | Native CLI + six-module built-in-only import closure; explicit runner allowlist; one partial mapping and four non-enforcing rules                    | Product legacy wrapper retained as comparison evidence                            |
| B2      | Native source preserves all five titles/descriptions/severities/tags/examples; strict shape/path/hash validation and independent semantic pin        | Legacy snapshot/pins stay physically present                                      |
| B3      | Mock pass/fail parity plus direct legacy/native CLI check/report/proposal parity over actual Goal source, with injected DB import for failure        | No live DB/exporter/network used                                                  |
| B4      | Real-owner policy and replacement acceptance criteria proposed above; two tests lock active policy/Proposed gate                                     | ADR-113 acceptance required for activation; active presence tests unchanged       |
| B5      | Root command uses native adapter/source/pin/source-audit/import-closure audit; root stays cacheable; inventory dependency non-cacheable exactly once | Product documentation/presence and global standalone audits retain baseline scope |
| B6      | Exactly six inventoried maintained docs use native inputs and explicitly label retained Product compatibility/history                                | AGENT reference policy documentation cannot be retired before ADR acceptance      |

Parity compares all five rules, summary/mapping/severity/enforcement/check status, runner
metadata and failed-check review-required proposal summary/actions/evidence. Allowed source
identity differences are native kind/semanticHash, removed Product UUID/revision provenance
and surviving owner reference paths. Direct CLI comparisons exclude only the first check
identity line, report bundle identity and proposal bundleSemanticHash. Native audit subjects
exclude Governance, while the standalone/legacy default continues to include it; audited-file
counts therefore describe their respective subject sets on the retained full repository.
The passing/failing parity fixtures contain identical real owner subjects so all check evidence
matches exactly. This scope distinction preserves the global audit without requiring the
retiring Product package as an Engineering rule subject.

Isolation copies exactly six active modules and native source/pin, then adds Goal source
and a test-only network denial preload. No Product package/contracts/schema/export/published
snapshot is present. Node permissions deny filesystem writes/subprocesses/workers; preload
blocks fetch/WebSocket and HTTP/HTTPS/TCP/TLS/UDP/DNS APIs. Deliberate write/fetch/TCP probes
fail. Before/after file snapshots detect mutation and additions. AST closure tests reject
external/static/dynamic/re-export dependencies, writable fs imports, symlink escapes and
Product paths introduced even in subject scanners. Only two exact database specifier literals
used to diagnose subject violations are exempt from path-literal checks.

Inventory current ownership is 55 groups / 781 unique exact paths: RETIRE 29/193,
KEEP_ENGINEERING 5/386, SHARED 18/193, MIGRATE_FIRST 3/9. GOV-7901's accepted 54/770
historical evidence stays unchanged. The scanner's text/binary patterns, containment,
source/generated checks, live-Git enumeration and destructive decision gate remain intact.
The real inventory regression timeout is aligned to its existing 30-second Git timeout after
it exceeded the default five seconds during concurrent full-gate execution.

| Required validation                                                              | Result                                                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Focused native schema/hash/path, independence/parity, policy proposal, inventory | PASS: 4 files / 85 tests (49 source, 16 independence, 2 proposal, 18 inventory) |
| Legacy bundle hard guards/CLI/adapter/published snapshot                         | PASS: all four suites, 14 tests, in full governance-tools run                   |
| Governance-tools full suite                                                      | PASS: 24 files / 244 tests                                                      |
| Direct native source/pin and active dependency closure audits                    | PASS: six active modules, built-ins only                                        |
| GOV-7901 exact inventory audit                                                   | PASS: 55 groups / 781 paths, Proposed / destructiveAllowed=false                |
| pnpm test:inventory and pnpm test:inventory:check                                | PASS: 1,349 files / 67 governance                                               |
| pnpm test:targets:check and docs config                                          | PASS                                                                            |
| Targeted ESLint / Prettier / git diff --check                                    | PASS; final ESLint has no warnings                                              |
| Uncached full memoflow:governance-check                                          | PASS: root plus all seven dependency tasks; inventory target exactly once       |
| Protected diff from 9f4f943b958: apps/packages/docker/AGENT.md/ADR-113           | Empty                                                                           |

Full gate command: `NX_DAEMON=false pnpm nx run memoflow:governance-check --skip-nx-cache --output-style=static`.
Local validation logs: `/tmp/gov7902-full-governance.log`, `/tmp/gov7902-focused-final.log`,
`/tmp/gov7902-eslint-final.log`; these are not repository input artifacts. Nx's historical
flaky-task hint for test-system-v2:test:governance did not represent a failure in this run.

No unresolved implementation P0/P1/P2 finding remains. Independent review confirmed the native
Engineering input closure, parity guarantees, root gate switch and non-destructive ADR boundary.
B4 activation and B5/B6 Product reference-policy/presence residuals remain blocked by Proposed
ADR-113; GOV-7903 cannot execute without a separately accepted decision.

## Exact dirty implementation files (27)

- `docs/governance/CHANGE_PLAYBOOK.md`
- `docs/governance/DECISIONS.md`
- `docs/governance/QUICK_REFERENCE.md`
- `docs/governance/README.md`
- `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md`
- `docs/plan/active/2026-10-02-pvc-gov-7901-governance-retirement-inventory.md`
- `docs/plan/active/2026-10-02-pvc-gov-7902-engineering-governance-input-decoupling.md`
- `docs/standards/repository-layer-spec.md`
- `project.json`
- `tools/governance/README.md`
- `tools/governance/__tests__/engineering-input-independence.test.mjs`
- `tools/governance/__tests__/engineering-reference-policy-proposal.test.mjs`
- `tools/governance/__tests__/engineering-rule-source.test.mjs`
- `tools/governance/__tests__/governance-rule-bundle-hard-guards.test.mjs`
- `tools/governance/__tests__/product-governance-retirement-inventory.test.mjs`
- `tools/governance/engineering-input-dependency-audit.mjs`
- `tools/governance/engineering-rule-adapter.mjs`
- `tools/governance/engineering-rule-source-audit.mjs`
- `tools/governance/engineering-rules.json`
- `tools/governance/lib/engineering-rule-runner.mjs`
- `tools/governance/lib/engineering-rule-source.mjs`
- `tools/governance/lib/governance-rule-engineering-adapter.mjs`
- `tools/governance/lib/package-internal-boundary-runner.mjs`
- `tools/governance/pinned-engineering-rules.json`
- `tools/governance/product-governance-retirement-inventory-audit.mjs`
- `tools/governance/product-governance-retirement-inventory.json`
- `tools/test-system-v2/test-inventory.json`
