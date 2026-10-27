# ADR-028: Workspace Package Resolution Strategy

**Status:** Accepted
**Date:** 2026-03-09
**Context:** Nx monorepo workspace package resolution across TypeScript, Vite, package exports, and Nx build orchestration.

## Context

MemoFlow is an Nx + pnpm monorepo with three different resolution environments running at the same time:

- TypeScript compiler and IDE navigation (`tsconfig.workspace-src.json`, project `tsconfig.json`)
- Browser and renderer bundlers (`apps/web` and `apps/desktop` via Vite)
- Package consumers at build/runtime (`package.json` `exports` pointing to `dist`)

The workspace currently mixes two useful but different strategies:

- Development-time source resolution for selected workspace packages
- Build-time package resolution through `node_modules` and package `exports`

This mixed mode is valid, but without an explicit standard it creates repeated confusion:

1. TypeScript can resolve a package, but Vite cannot.
2. A workspace package appears available through root `tsconfig` paths, but the app has not declared it as a dependency.
3. Development succeeds because a package is aliased to `src`, but build behavior depends on `dist` and `exports`.
4. Subpath imports such as `@memoflow/ai/application-client` work in one app but fail in another because only one Vite config knows about the source alias.

Recent examples in this repository include:

- `apps/web/tsconfig.json` resolving selected packages to source for typing and IDE support.
- `apps/web/vite.config.ts` resolving selected runtime imports to source for development.
- Workspace packages such as `@memoflow/ai` and `旧聚合契约包（已退役）` exposing build artifacts through `package.json` `exports`.

We need one documented rule set that explains when to use `tsconfig`, when to use Vite aliasing, when to rely on `exports`, and how Nx build ordering supports the final production path.

## Decision

We adopt a **dual-channel resolution strategy**:

- **Development:** apps may resolve selected workspace packages directly to `src` for fast iteration and HMR.
- **Build and package consumption:** apps and external consumers resolve workspace packages through package `exports` and built `dist` artifacts.

This is not an accidental hybrid. It is the official architecture.

## Detailed Rules

### 1. `tsconfig` is the source-of-truth for compile-time workspace source resolution

`tsconfig.workspace-src.json` and package/app-level `tsconfig.json` files define how TypeScript and IDEs resolve workspace source imports.

Use `tsconfig` paths for:

- package-to-package source references inside the monorepo
- editor navigation and refactoring
- type-checking against source during development
- build tools that honor TypeScript path mapping

Do not assume `tsconfig` paths are sufficient for:

- Vite browser runtime resolution
- Node runtime resolution
- package consumers outside the TypeScript compiler

Rule:

- If TypeScript must understand a workspace import from source, add or inherit an appropriate `paths` mapping.

### 2. Vite alias is the source-of-truth for app runtime source resolution in development

For browser-based or renderer-based apps, runtime module resolution is ultimately controlled by the bundler.
If an app should consume a workspace package directly from `src` during development, Vite must know how to resolve that import.

Use Vite alias for:

- app-to-package development-time runtime imports
- selected subpath imports that should point to source in `serve` mode
- packages that need HMR or deep source integration in the app shell

Rule:

- If `apps/web` or `apps/desktop` runs a workspace package from source in development, the import must be resolvable by Vite, not just by TypeScript.

### 3. `package.json` dependencies remain mandatory even when development uses source aliases

Source aliasing does not replace dependency declaration.
If an app imports a workspace package at runtime, that package must still be listed in the app's `package.json` dependencies.

Why:

- build and release flows must be able to consume the package through normal package resolution
- dependency graphs should remain explicit
- the app must not rely on transitive or accidental availability

Rule:

- Every workspace package imported by an app at runtime must appear in that app's `dependencies` unless it is strictly type-only and erased from emitted output.

### 4. `package.json` `exports` is the source-of-truth for build-time and consumer-facing entrypoints

Every reusable workspace package must publish its supported public surface through `exports`.
This includes root entrypoints and any supported subpaths such as:

- `@memoflow/ai/application-client`
- `@memoflow/ai-client/infrastructure-client`
- `@memoflow/ai-contracts`

Rule:

- If a path is intended for runtime consumption outside direct source aliasing, it must be declared in `exports` and backed by a built `dist` file.

### 5. Development source resolution must be explicit and selective

Not every package should automatically be sourced from `src` in app runtime.
Development source aliasing is allowed for packages that benefit from direct app integration, such as:

- UI packages
- app-framework packages such as `@memoflow/app-vue`
- client-side application/infrastructure layers used directly by the app shell

Packages that are better consumed as built artifacts may continue to resolve through normal package resolution.

Rule:

- Source aliases should be explicit and intentional, not blanket aliases for all workspace packages.

### 6. Build mode must converge on package outputs

The final build path must validate the real package surface.
That means application builds should rely on package dependencies, `exports`, and built `dist` outputs.

Rule:

- Production builds are the validation point for package boundaries. They must not rely exclusively on source aliasing to succeed.

### 7. Nx orchestrates package readiness, not bundler path semantics

Nx `dependsOn: ["^build"]` ensures upstream packages are built before an app build or serve task that requires them.
This supports the build-time `dist` path, but it does not automatically teach Vite how to resolve source imports.

Rule:

- Use Nx to guarantee build order.
- Use `tsconfig` for compile-time source awareness.
- Use Vite alias for development-time runtime source resolution.
- Use `exports` for built/runtime package boundaries.

## Responsibilities by Layer

### Root `tsconfig.base.json` and `tsconfig.workspace-src.json`

Responsible for:

- compiler baseline and shared TypeScript conventions (`tsconfig.base.json`)
- monorepo-wide development-time workspace source map (`tsconfig.workspace-src.json`)
- package-to-package source development ergonomics

Not responsible for:

- browser runtime resolution
- validating published package entrypoints

### App / Package `tsconfig.json`

Responsible for:

- app/package-local path overrides
- narrowing or extending source-visible package paths
- aligning editor/type-checking with the project's development mode

### App `vite.config.ts`

Responsible for:

- development-time runtime resolution in `serve`
- explicit source aliasing for selected workspace packages
- making app runtime behavior match intended development ergonomics

Recommended practice:

- prefer conditional aliases for `serve` mode when the long-term target is build-time `dist` consumption

### Package `package.json`

Responsible for:

- declaring public API surface through `exports`
- pointing consumers to `dist`
- making subpath usage explicit and stable

### Package build pipeline (`tsup`, `vite build`, etc.)

Responsible for:

- generating the `dist` files referenced by `exports`
- preserving runtime-valid package boundaries

### Nx configuration

Responsible for:

- ensuring dependency builds happen in the correct order
- caching and task orchestration
- making build-mode package consumption practical

## Standard Operating Model

### Package-to-package development

When one workspace package depends on another shared package such as `旧聚合契约包（已退役）` or `@memoflow/utils`:

- declare the dependency in the package's `package.json`
- use `tsconfig` paths so TypeScript can resolve source during development
- expose the consumer-facing surface of the dependency package through `exports`
- do not require Vite, because these are package builds rather than app bundling concerns

### App-to-package development

When `apps/web` or `apps/desktop` imports a workspace package for runtime use:

- declare the dependency in the app's `package.json`
- ensure TypeScript can resolve the import in the app `tsconfig`
- if development should run directly from source, add Vite alias coverage for the runtime import path
- if a subpath import is used in app runtime, alias the exact subpath when needed

### App build and release

When building an app for verification, packaging, or release:

- upstream packages must build first through Nx
- the app should be able to resolve package imports through package dependencies and `exports`
- this build is the final verification of the package contract

## Examples

### Example A: Package depending on shared contracts

`packages/ai` depends on `旧聚合契约包（已退役）`.

Expected setup:

- `packages/ai/package.json` declares `旧聚合契约包（已退役）`
- `packages/ai/tsconfig.json` inherits the workspace source map for development
- `@memoflow/package-contracts.json` exports built entrypoints from `dist`

This package build scenario does not require Vite aliasing.

### Example B: Web app consuming `@memoflow/ai/application-client`

If `apps/web` imports `@memoflow/ai/application-client` at runtime:

- `apps/web/package.json` must declare `@memoflow/ai`
- Vite must know how to resolve the import during development if the app is meant to run AI directly from source
- `@memoflow/ai/package.json` must export `./application-client`
- `nx build web` must be able to consume the built `dist` entrypoint

### Example C: TypeScript works but Vite fails

If an import exists in `tsconfig` paths but the app's Vite config does not understand it, then:

- IDE navigation may work
- type-checking may work
- browser runtime can still fail with `Failed to resolve import`

This is expected behavior, not a bug in TypeScript.

## Implementation Guidance

### Preferred pattern for apps

For app runtime imports, prefer this sequence:

1. Add the workspace package to app `dependencies`.
2. Ensure the package exposes the needed subpaths in `exports`.
3. Add app `tsconfig` source mappings when source development is desired.
4. Add Vite aliases for the exact runtime imports that should resolve to source in development.
5. Keep build flows validating package `dist` outputs.

### Recommended Vite pattern

The preferred long-term implementation is conditional aliasing:

```ts
export default defineConfig(({ command }) => {
  const isDev = command === 'serve';

  return {
    resolve: {
      alias: isDev
        ? {
            '@memoflow/ai/application-client': path.resolve(
              __dirname,
              '../../packages/ai/src/application-client/index.ts',
            ),
          }
        : {},
    },
  };
});
```

This makes development use source while letting build mode validate package output behavior.

## Migration Plan

### Document and normalize the rule set

- adopt this ADR
- stop treating `tsconfig`, Vite alias, and `exports` as interchangeable
- require explicit dependency declarations for app runtime imports

### Audit app dependencies and aliases

- identify workspace packages used by `apps/web` and `apps/desktop`
- ensure each app declares all runtime workspace dependencies explicitly
- align Vite aliases with the intended development-source whitelist

### Prefer conditional dev-only aliasing where practical

- keep development ergonomics for selected packages
- reduce accidental reliance on source aliasing during build
- use build failures as package contract validation signals

### Keep package `exports` authoritative

- ensure every supported subpath has a matching built file
- reject undocumented or accidental deep imports

## Consequences

### Positive

- clearer separation between compile-time and runtime resolution
- fewer cases where TypeScript succeeds but Vite fails
- stronger package boundary validation during builds
- faster development loops for selected packages without sacrificing package correctness
- more predictable onboarding for future contributors

### Negative

- some imports need to be represented in more than one place (`dependencies`, `tsconfig`, and sometimes Vite alias)
- app configuration becomes more explicit and therefore more verbose
- teams must maintain discipline about which packages are source-aliased in development

## Alternatives Considered

### Alternative A: Always consume built `dist` outputs, even in development

Rejected because:

- local iteration slows down
- HMR and cross-package UI work become less ergonomic
- developers must rebuild workspace packages more often

### Alternative B: Always consume workspace source everywhere

Rejected because:

- build/release paths stop validating real package outputs
- package `exports` become under-tested
- runtime behavior drifts away from published package boundaries

### Alternative C: Rely on `tsconfig` paths only

Rejected because:

- it does not solve bundler runtime resolution
- it produces misleading success in IDE and type-checking while app runtime still fails

## Summary

MemoFlow officially uses:

- `tsconfig` for compile-time workspace source awareness
- Vite alias for development-time app runtime source resolution
- `package.json` dependencies for explicit ownership
- `package.json` `exports` plus built `dist` for final package boundaries
- Nx `^build` orchestration to make build-mode package consumption reliable

In short:

- **dev can use source**
- **build must validate dist**
- **TypeScript paths do not replace Vite alias**
- **Vite alias does not replace dependency declarations**
- **dependency declarations do not replace `exports`**
