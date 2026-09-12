# `@memoflow/relation`

Shared cross-module Relation owner for MemoFlow (ADR-069, ADR-090, GOAL-7206).

## Role

`@memoflow/relation` owns durable generic edges and their Prisma/PowerSync persistence parity. Product features consume typed facades rather than exposing arbitrary relation strings to UI code.

The first product facade is Goal Knowledge:

```text
Goal --related--> KnowledgeDocument
```

It exposes only `linkGoalKnowledge`, `unlinkGoalKnowledge`, `listGoalKnowledge`, and `listGoalsForKnowledge` through HTTP/IPC client ports.

## Stable Knowledge identity

A durable Note endpoint is always:

```text
SubjectRef { type: 'note', id: KnowledgeDocumentId }
```

`KnowledgeDocumentId` is the ADR-090 stable `kdoc_<uuid>` identity. A relative path, `KnowledgeNoteProjection.id`, or another path-derived projection identifier is never persisted as the Relation endpoint.

`KnowledgeDocumentRef` may carry the Knowledge Space needed to resolve the document at the typed Goal Knowledge boundary, but the persisted relation tuple stores only the stable document identity. Rename/move therefore changes the current projection/path, not the relation identity.

Resolution is owner-controlled:

- Cloud/API uses Repository's active-binding + document-identity resolver.
- Desktop uses the Local Vault binding/scan resolver.
- Ambiguous duplicate identity is fail-closed rather than selecting a path heuristically.

## Persistence and sync

Both lanes implement the same `RelationRepository` behavior:

- Prisma/PostgreSQL for Cloud/API.
- PowerSync/SQLite for Desktop.

Goal Workspace uses the typed stable-edge read path rather than generic Relation DTOs. Pagination is owner-bounded at persistence: Prisma executes filtered `count + take/skip`; PowerSync executes filtered `COUNT(*) + LIMIT/OFFSET`. An unresolved KnowledgeDocument therefore remains a paged stable edge for Workspace to surface as `Missing` instead of being filtered before counting.

PowerSync syncs `relations` by `identity_id`. Offline upload is immutable-edge semantics: PUT creates/idempotently reconciles, DELETE is identity-scoped, and PATCH is rejected. The API re-validates `SubjectRef`, so an offline client cannot bypass the stable Note identity contract.

## Goal deletion boundary

Goal does **not** depend on this package and does not own generic Relation persistence. Goal owns only a narrow `GoalRelationCleanupPort` plus a deletion transaction runner contract. API/Desktop composition injects a transaction-scoped Relation cleanup adapter.

Therefore Goal soft/permanent delete and unlinking edges that reference that Goal commit or roll back in the same business-database transaction. The linked KnowledgeDocument is never deleted. This is distinct from ADR-090 Knowledge-document deletion: deleting a Knowledge document does not silently delete inbound Goal/Task relations, so historical/unresolved links remain repairable.

## Ownership guards

The old Goal-owned `IRelationRepository`, Relation use cases, Prisma adapter/mapper, and `relation.create` manifest command were destructively retired. No compatibility or shadow owner remains.

Verification:

```bash
pnpm nx run relation:test
pnpm nx run relation:test:integration
pnpm nx run relation:typecheck
pnpm nx run relation:build
node tools/governance/shared-relation-ownership-audit.mjs
```
