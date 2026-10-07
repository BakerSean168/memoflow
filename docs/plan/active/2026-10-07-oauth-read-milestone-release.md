---
tags: [plan, active, release, oauth]
description: Integrate and deliver the verified OAuth read milestone through the existing release pipeline
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# OAuth read milestone release

The owner approved including OAuth and the six read tools in the next v0.15.0 release, retaining unsigned-pilot macOS artifacts. Write tools are outside this release.

## Implementation and acceptance

1. Integrate the three read-gateway commits with current main; regenerate the test inventory from both sides.
2. Verify canonical production Compose passes optional EAG flags, audience, client allowlist and cursor secret into the API. Keep defaults disabled; enable only in the production-owned secret environment. Staging already loads its owned secret env file.
3. Run affected checks, real prod-like validation and independent Standards/Spec review against the integrated candidate.
4. Merge through the current main quality gates; update the existing release PR and publish only after exact-SHA CI/candidate, Desktop/Docker lanes and release postflight pass.
5. Select the Published release through Deploy Production; require a fresh database backup, migrator success, exact image provenance, public health and OAuth read/revoke acceptance.

## Engineering invariants

- Goal and Task remain business owners; the gateway projects only authorized read outcomes. Existing executable contracts and API env schema own runtime validation.
- OAuth grants, connections and revocation remain in the existing persistent authorization boundary; no session/credential bypass, DCR expansion or write tools.
- Source main SHA, immutable candidate digests, release identity and selected production runtime must agree. Production Compose stays in the versioned delivery path, not a host-edited fork.
- A release is not a deployment. Existing watcher backup/migrator/failure states remain authoritative; never reset production data or blindly roll back an incompatible schema.
- Previous local branches, stashes and uncommitted files are preserved in verified host-local archives before post-delivery cleanup. Unmerged historical experiments are evaluated against current owner semantics, not blindly merged.

## Initial evidence

Base: `b74b3c5a035f4931cf3c6432002d5122b8c84f36`; read implementation: `5d4515f7a98a3763175635062b048120bd70628b`. The only textual integration conflict is generated `tools/test-system-v2/test-inventory.json`. Canonical production Compose currently omits EAG environment values; enabling them only in its host env would not reach the API.


## Historical branch parity retained

Review of `core-vnext/w3-goal-scheduling` found one valid change absent from the canonical runtime: Goal activation, reopening and abandonment emit `goal:status-changed`, without `goal:updated`. Restore that event mapping and lifecycle subscription using the current owner projection. The regression verifies reminder removal/restoration and unsubscribe behavior; the old Goal payload/model and retired scheduler paths are not reintroduced.

Final validation also replaces test-only cross-project relative/dynamic imports with public static entrypoints. The synthetic AppImage handoff test keeps its explicit timeout scenario at two seconds, while allowing ten seconds for process startup in successful and invariant-failure scenarios under full-suite load.
