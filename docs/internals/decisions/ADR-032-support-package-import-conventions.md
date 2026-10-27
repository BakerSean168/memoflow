# ADR-032: Support Package Import Conventions

## Status

Accepted

## Context

Support packages (`@memoflow/utils`, `旧聚合契约包（已退役）`, `@memoflow/app-vue`, etc.) grew organically
and developed "god barrel" exports — a single root `index.ts` that re-exports everything. This creates:

- **Coupling**: consumers pull in the entire surface area even when they only need `createLogger`
- **Ambiguity**: no signal about which domain a symbol belongs to
- **Bundle risk**: tree-shaking helps but isn't guaranteed across all bundlers

The `@memoflow/utils/result` subpath (96 files) proves the subpath pattern works when adopted early.
All other subpaths had near-zero adoption while 250 files imported from the root barrel.

## Decision

### 1. Prefer subpath imports for `@memoflow/utils`

Import from the specific subpath, not the root barrel:

```typescript
// Before
import { createLogger, AggregateRoot, BusinessRuleViolationError } from '@memoflow/utils';

// After
import { createLogger } from '@memoflow/utils/logger';
import { AggregateRoot } from '@memoflow/utils/domain';
import { BusinessRuleViolationError } from '@memoflow/utils/errors';
```

Available subpaths:

| Subpath                      | Contents                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `@memoflow/utils/logger`     | `createLogger`, `ILogger`, `LoggerFactory`, `LogLevel`                                     |
| `@memoflow/utils/domain`     | `Entity`, `AggregateRoot`, `ValueObject`, `eventBus`, `createIdType`                       |
| `@memoflow/utils/errors`     | `DomainError`, `BusinessRuleViolationError`, `NotFoundError`, `mapInfraErrorToResultError` |
| `@memoflow/utils/shared`     | `generateUUID`, `toDateOrNull`, `parseJson`, `envConfig`                                   |
| `@memoflow/utils/result`     | `ok`, `fail`, `Result`, `expressAdapter`, `ipcAdapter`, `RouteRegistrar`                   |
| `@memoflow/utils/frontend`   | `getEnvironmentConfig`, `LoadingState`, `debounce/throttle`                                |
| `@memoflow/utils/validation` | `FormValidator`, `BuiltinValidators`                                                       |
| `@memoflow/utils/lifecycle`  | `InitializationManager`, `InitializationPhase`, `WebInitializationManager`, `ModuleGroup`  |

An ESLint `no-restricted-imports` warning enforces this for new code.

### 2. Unified client service creation language

Client-side services follow a consistent factory convention across all packages:

```typescript
// Factory function pattern — Result-only transport ports
export function createXxxServiceFromHttpClient(httpClient: IResultHttpClient): IXxxService {
  return new XxxHttpClientService(httpClient);
}
```

This convention applies to both Web (HTTP) and Desktop (IPC) transport. First-party
clients use `IResultHttpClient` / `IResultIpcClient` only (no throw-style dual client).

| Package            | Factory                                      |
| ------------------ | -------------------------------------------- |
| `authentication`   | `createAuthenticationServiceFromHttpClient`  |
| `account`          | `createAccountServiceFromHttpClient`         |
| `task`             | `createTaskServiceFromHttpClient`            |
| `goal`             | `createGoalServiceFromHttpClient`            |
| `schedule`         | `createScheduleServiceFromHttpClient`        |
| `reminder`         | `createReminderServiceFromHttpClient`        |
| `notification`     | `createNotificationServiceFromHttpClient`    |
| `repository`       | `createRepositoryServiceFromHttpClient`      |
| `setting`          | `createSettingServiceFromHttpClient`         |
| `ai`               | `createAIServiceFromHttpClient`              |
| `data-portability` | `createDataPortabilityServiceFromHttpClient` |

Desktop uses Result IPC factories such as `createXxxIpcClient(resultIpcClient)` with the same port shape.

**Why not force a shared factory across React and Vue?** Web uses `createLazyService()` for
code-splitting (dynamic import), while React's `AppProvider` eagerly creates services at startup.
Forcing a shared factory would break Web's lazy-loading. The shared language is the naming
convention, not a shared implementation.

### 3. App shell root export guidance

`@memoflow/app-vue` and `@memoflow/app-react` are app shells, not libraries. Their root exports
should be constrained to:

- **DI keys** (`InjectionKey<T>`)
- **Plugin install functions**
- **Router factory**
- **Shared layout components**

Feature-module code should be imported directly from the feature subpath
(e.g., `@memoflow/app-vue/modules/repository`), not from the root barrel.

## Consequences

- All consumers migrated from `@memoflow/utils` root barrel to specific subpaths
- Root barrel now uses explicit named exports (no `export *`)
- New code is guided by ESLint warnings toward subpath imports
- Client service factories follow a predictable naming pattern across all packages
- `InitializationManager` etc. available via `@memoflow/utils/lifecycle` subpath

## Migration notes

- The `@memoflow/utils` root barrel uses explicit named exports (no `export *`) and emits ESLint warnings for root-barrel imports
- `InitializationManager`, `InitializationPhase`, `InitializationTask` are available via `@memoflow/utils/lifecycle`
- All consumers have been migrated to subpath imports — no files import from the root barrel
