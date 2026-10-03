---
tags: [plan, archive, ai, composer, shell]
description: PVC-AI-8201 composer host and semantic elevation cleanup
created: 2026-10-02T12:24:00+00:00
updated: 2026-10-02T12:32:00+00:00
---

# PVC-AI-8201 — Composer host/elevation cleanup

## Evidence

Baseline: `2b08fb3078c`.

`AIChatView.vue` currently renders the same `AIFooterComposer` contract twice:

1. inside a `Teleport` when `shellComposerMount` is available;
2. as a local `v-else` fallback when the shell mount is absent.

The two branches duplicate the full prop/event/ref contract even though they represent one logical
composer owner. This is the remaining RUI-12 mount-path drift.

The composer surface itself is already on the product semantic elevation vocabulary:
`AIFooterComposer.vue` uses `semanticElevationClass('floating')`, while attachment/context chips
and mention surfaces use the shared semantic elevation helper. There is no composer-specific
`rgba(...)` or bespoke `box-shadow` value to retire. Mobile sidebar shadow styling is unrelated
and remains out of scope.

## Target structure

Use one `Teleport` and one `AIFooterComposer` instance:

- `to = shellComposerMount ?? 'body'`;
- `disabled = !shellComposerMount`.

Vue renders disabled Teleport content at its declaration site, preserving the current local fallback
without a second composer branch. When the shell mount exists, the same component instance is
teleported to the shell-owned composer host.

## Protected behavior

- composerOnly mode;
- composer ref/focus behavior;
- send/stop;
- model selection/settings;
- attachments/file picker/paste;
- Goal/Task/Knowledge context references and @mentions;
- responsive composer density;
- shell composer host placement.

No workflow intent, runtime, API, keyboard, or product behavior changes belong in this ticket.

## Verification

- view contract locks exactly one `AIFooterComposer` render declaration;
- view contract locks disabled Teleport fallback and shell target;
- existing `AIFooterComposer` tests continue to cover semantic floating elevation;
- focused AI view/composer tests;
- uncached App-Vue typecheck;
- targeted lint/format/inventory/diff;
- governance check before acceptance.

## Acceptance — 2026-10-02

AI-8201 is accepted and frozen. `AIChatView` now owns exactly one logical
`AIFooterComposer` declaration. The single Vue `Teleport` targets the shell composer host when it
exists and uses `disabled` local rendering when it does not, so the same component/ref/prop/event
contract serves both host states.

No composer product behavior changed. Attachments, context entities, model selection, send/stop,
settings, file upload and responsive density remain on the same bindings. `AIFooterComposer`
already used the shared `semanticElevationClass('floating')` token, so no visual shadow rewrite was
necessary and no bespoke `rgba(...)` composer elevation was introduced.

Validation:

- focused App-Vue composer/shell matrix: **3 files / 39 tests passed**;
- uncached `app-vue:typecheck` passed with all 28 dependency tasks;
- targeted ESLint and Prettier passed;
- test inventory passed: **1,345 files**;
- `git diff --check` passed;
- full `pnpm governance:check` passed, including 34 runtime/governance tests and the 22/22
  HARD-7101 behavior matrix.
