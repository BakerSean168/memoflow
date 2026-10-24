# ADR-016: Apps as Containers & Atomic Architecture

## Status

Accepted (updated 2026-05-26)

## Context

The project uses an Nx Monorepo structure, but there is a risk of treating it as a "Polyrepo" by putting too much logic inside `apps/`.
This leads to:

1.  Low code reusability (logic trapped in `apps/web` cannot be used in `apps/desktop`).
2.  Slow CI/CD (changing one component rebuilds the whole app).
3.  Blurred architectural boundaries.

## Decision

We adopt the **"Apps as Containers"** philosophy, combined with strict **DDD Layering**.

### 1. The Role of `apps/`

Applications are **strictly containers** — runtime shells that wire packages together.

- **Allowed Content**:
  - Entry points (`main.ts`, `index.tsx`, `app.py`).
  - Dependency Injection configuration (wiring domain to infrastructure).
  - Environment variables config.
  - Global routing maps.
  - Runtime-specific integration (Electron IPC, Express middleware, Expo routing).
- **FORBIDDEN Content**:
  - Business Logic.
  - Domain Entities.
  - Complex UI Components (move to `packages/ui-*` or `packages/feature-*`).

### 2. Apps-as-Containers Matrix

| App          | Runtime             | Files | Role                                                                  | Thick logic to extract                                                                                                  |
| ------------ | ------------------- | ----- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `mobile`     | React Native / Expo | 32    | **Pure container** — re-exports from `@memoflow/app-react`            | None. Reference implementation.                                                                                         |
| `web`        | Vue 3 / Vite        | 48    | **Thin container** — standard framework bootstrap                     | None significant. `platform/di-app.ts` is standard DI wiring.                                                           |
| `api`        | Express / Node      | 55    | **Server container** — registers domain modules via `ApiBootstrapper` | Inline schedule source executor (~150 lines, duplicated from desktop). App-local `modules/` (powersync, dashboard, ai). |
| `desktop`    | Electron            | 137   | **Desktop container** — two-phase shell/profile runtime               | Schedule source executor (duplicated from api). Desktop-specific `profile/`, `lifecycle/`, `auth/` infrastructure.      |
| `ai-service` | FastAPI / Python    | 57    | **Service container** — wires AI orchestration                        | Business services (`GoalPlanningService`, `KnowledgeNoteService`, etc.) live inline rather than in packages.            |

**Target state**: All apps should trend toward `mobile`/`web` levels of thinness. Runtime-specific integration
(Electron IPC, Express middleware) is legitimate app content; business logic is not.

### 3. Atomic Packages with DDD

We organize our `packages/` to support both horizontal scaling (Features) and vertical layering (DDD).

- **Feature Modules** (e.g., `packages/task`, `packages/goal`) are the atomic units of business logic.
- **Layers** (enforced by `@nx/enforce-module-boundaries`):
  - `layer:shared`: Pure primitives, no external deps.
  - `layer:infra`: Technical plumbing, depends on shared only.
  - `layer:domain`: Business logic + composition root (api/module.ts, electron-entry).
  - `layer:ui`: Presentation, can consume all layers.
  - `layer:app`: Application shells, can consume everything.

### 4. Dependency Rule

Apps depend on Packages. Packages do NOT depend on Apps.

### 5. Known Duplication Hotspots

The schedule source executor logic (dispatching reminders, goals, tasks to notification) is duplicated
between `apps/api` and `apps/desktop`. This should be extracted to a shared package when the schedule
module's server-side shape stabilizes.

## Consequences

- **Positive**:
  - Sharing logic between API and Desktop is trivial — same package, different runtime adapter.
  - `mobile` proves the thin-container model works at scale.
  - Enforces loose coupling via layer tags.
- **Negative**:
  - Requires more boilerplate to "wire up" the app in `main.ts`.
  - Desktop's multi-profile architecture legitimately needs more app-local code than other apps.
