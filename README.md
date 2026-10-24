# MemoFlow

> An AI workspace that carries you from thinking to doing: ideas from a conversation become goals, tasks, notes and schedules, with reminders on time and a record of what got done.

<p align="left">
  <strong>Language:</strong> English · <a href="./docs/zh-CN/README.md">Simplified Chinese</a>
</p>

<p align="left">
  <a href="https://memoflow.bakersean.top"><strong>Live Web App</strong></a> ·
  <a href="https://bakersean168.github.io/memoflow/"><strong>Project Page</strong></a> ·
  <a href="./docs/product/README.md"><strong>Product Docs</strong></a> ·
  <a href="./docs/architecture/README.md"><strong>Architecture</strong></a>
</p>

MemoFlow is an AI-first productivity workspace designed for long-term personal use. It does not place a chatbot next to a traditional todo application. Instead, AI conversations and business objects such as Goal, Task, Note, Schedule, Reminder, and Notification share the same product context: an intention can begin in conversation, move into a structured workspace for confirmation and editing, execute through product contracts, and return as a traceable outcome.

The repository contains the Web client, Electron Desktop client, API, shared domain packages, contracts, AI runtime, synchronization, and delivery infrastructure. It is a complete multi-surface product system rather than a frontend demo.

## Product model

```mermaid
flowchart LR
    A[Think / Ask AI] --> B[Goal · Task · Knowledge]
    B --> C[Schedule · Reminder]
    C --> D[Execution / Delivery]
    D --> E[Timeline · Outcome]
    E --> A
    B <--> F[Web + Desktop]
```

### What you can do

- **AI workspace** — maintain long-running conversations, open chat, and typed AI workflows for Goal / Task / Knowledge.
- **Goals & tasks** — turn direction into executable goals and tasks while preserving business state, relationships, and outcomes.
- **Notes / repository** — manage knowledge and resources as first-class workflow context.
- **Schedule & reminders** — connect tasks and plans to shared time semantics instead of maintaining an isolated calendar model.
- **Notifications & delivery** — track notification intent, attempt, and outcome through unified operation and delivery contracts.
- **Web + Desktop** — Vue Web and Electron Desktop share core business contracts; PowerSync supports the cross-device data path.

## Workspace experience

The desktop workspace follows a three-pane model:

```text
Conversation sidebar | AI collaboration | Business workspace
                     |                  | Goal / Task / Note /
                     |                  | Schedule / Reminder ...
```

The AI area is a persistent collaboration surface, while the business workspace owns structured state and provides room for editing. Global entry points can open Goal, Task, Note, Reminder, Schedule, and Notification directly; business tabs express current context instead of duplicating another navigation system.

See [`docs/product/workspace-ui.md`](./docs/product/workspace-ui.md) for the current workspace contract.

## Engineering highlights

| Concern                   | MemoFlow approach                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------- |
| Cross-surface consistency | centralized `@memoflow/contracts` + transport parity                                  |
| AI runtime                | TypeScript + Mastra, hosted inside the product runtime                                |
| Durable AI workflows      | typed workflow state, recovery/cancel paths, product-owned projections                |
| Modular business domains  | Goal / Task / Schedule / Reminder / Notification / Repository packages                |
| Multi-client data         | PostgreSQL + PowerSync + explicit offline/query-cache policy                          |
| Delivery semantics        | operation, occurrence, delivery intent/attempt/receipt contracts                      |
| Auditability              | unified operation timeline, replay and execution context                              |
| Quality gates             | Nx-governed lint/typecheck/test, browser flows, coverage/performance/delivery oracles |

## Architecture

```text
┌──────────────────────────────────────────────┐
│ Web (Vue)          Desktop (Electron + Vue) │
└───────────────┬───────────────┬──────────────┘
                │ shared contracts / client APIs
                ▼
┌──────────────────────────────────────────────┐
│ API / composition root                      │
│ Express · Zod · Prisma · Mastra runtime     │
└───────────────┬───────────────┬──────────────┘
                │               │
                ▼               ▼
          PostgreSQL          Redis
                │
                ▼
            PowerSync
```

The monorepo keeps product surfaces thin and pushes reusable business behavior into shared packages:

```text
apps/
├── api/        Express API + server composition
├── desktop/    Electron desktop client
├── web/        Vue web client
└── mobile/     Mobile container / future surface

packages/
├── contracts/  Public cross-layer contracts
├── ai/         Mastra-based AI runtime and workflows
├── goal/ task/ schedule/ reminder/ notification/ ...
├── app-vue/    Shared Vue application layer
├── ui-*/       UI primitives / adapters
└── utils/      Shared support code

docs/           Product, architecture, ADR, standards, deployment and plans
tools/          CI, governance, runtime and test-system tooling
```

## Tech stack

- **Language:** TypeScript 6
- **Workspace:** Nx 23, pnpm 11
- **Web:** Vue 3, Vite 8, Tailwind CSS 4, shadcn-vue
- **Desktop:** Electron 43 + Vue 3
- **API:** Express 5, Zod, Prisma
- **AI:** Mastra 1.x
- **Data:** PostgreSQL, Redis, PowerSync
- **Testing:** Vitest, Playwright, Storybook, axe-core
- **Delivery:** GitHub Actions, Docker Compose, Alibaba Cloud ACR + ECS

## Quick start

### Prerequisites

- Node.js 22.13+
- pnpm 11+
- Docker with Compose for local infrastructure

### Install and run

```bash
git clone https://github.com/BakerSean168/memoflow.git
cd memoflow
pnpm install
cp .env.example .env.local
pnpm docker:dev:up
pnpm nx run-many -t serve --projects=api,web --parallel=2
```

For Desktop development:

```bash
pnpm nx run desktop:serve-safe
```

`desktop:serve-safe` prepares dependencies and rebuilds Electron native modules. Once the environment is warm, `pnpm nx run desktop:serve` is the faster inner loop.

Full local-development guidance: [`docs/guides/development/local-development.md`](./docs/guides/development/local-development.md).

## Quality & verification

The repository treats product and architecture contracts as executable gates rather than README promises.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm e2e
pnpm docs:check
pnpm governance:check
```

CI also runs dedicated governance, integration, browser-flow, coverage, performance, and delivery observations before protected `main` can move.

## Production

The current Web production entry is **[memoflow.bakersean.top](https://memoflow.bakersean.top)**.

The GitHub Pages site is intentionally only the public **project showcase**. The actual product continues to use the existing production stack with Web/API/PowerSync/PostgreSQL/Redis behind the repository's deployment contracts.

See [`docs/deployment/README.md`](./docs/deployment/README.md) and [`docs/guides/development/release-workflow.md`](./docs/guides/development/release-workflow.md).

## Documentation map

- [`docs/getting-started/README.md`](./docs/getting-started/README.md) — onboarding.
- [`docs/product/README.md`](./docs/product/README.md) — product capabilities and module map.
- [`docs/product/workspace-ui.md`](./docs/product/workspace-ui.md) — current workspace experience.
- [`docs/architecture/README.md`](./docs/architecture/README.md) — architecture entry point.
- [`docs/architecture/adr/README.md`](./docs/architecture/adr/README.md) — architectural decisions.
- [`docs/standards/README.md`](./docs/standards/README.md) — engineering standards.
- [`docs/test/README.md`](./docs/test/README.md) — testing system.
- [`docs/deployment/README.md`](./docs/deployment/README.md) — production topology and operations.

## Repository status & license

MemoFlow is a **public source repository**, but it currently does **not** include an open-source license. Public visibility alone does not grant permission to copy, modify, or redistribute the code; copyright remains with the repository owner unless a license is added later.
