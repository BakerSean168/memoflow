# @memoflow/utils

Core utility library for the MemoFlow application, providing cross-platform support for logging, domain modeling, event handling, and frontend utilities.

## 📦 Installation

```bash
pnpm add @memoflow/utils
```

## 🛠️ Modules

### 1. Logging System (`logger`)

A robust, cross-platform logging system based on Winston (Node.js) and Console/HTTP (Browser).

**Features:**

- **Cross-Platform**: Unified `ILogger` interface.
- **Node.js**: Uses `winston` with daily file rotation (`logs/app-YYYY-MM-DD.log`).
- **Browser**: Uses `ConsoleTransport` for dev tools and `HttpTransport` to send logs to the API.
- **Isolation**: Node.js specific code is isolated in `@memoflow/utils/winston`.

**Usage:**

```typescript
import { createLogger } from '@memoflow/utils';

const logger = createLogger('MyContext');

logger.info('Hello world', { foo: 'bar' });
logger.error('Something went wrong', new Error('Oops'));
```

**Configuration (API):**

```typescript
import { LoggerFactory } from '@memoflow/utils';
import { WinstonLogger } from '@memoflow/utils/winston';

LoggerFactory.registerProvider((context) => new WinstonLogger(context));
```

### 2. Domain Core (`domain`)

Base classes for Domain-Driven Design (DDD).

- **Entity**: Base class for entities with UUID identity.
- **AggregateRoot**: Base class for aggregate roots, supporting domain events.
- **ValueObject**: Base class for immutable value objects.
- **EventBus**: Global event bus for domain events.

**Usage:**

```typescript
import { Entity, ValueObject } from '@memoflow/utils';

class UserId extends ValueObject { ... }

class User extends Entity<UserId> { ... }
```

### 3. Runtime Event System (`domain`)

`CrossPlatformEventBus` is a **runtime-local**, typed event bus backed by [Emittery](https://github.com/sindresorhus/emittery). It is used for ADR-033 notification-style reactions inside one JavaScript runtime.

- **`send(type, payload)`**: fire-and-forget notification. The caller does not wait for subscribers and subscriber failures are isolated/logged.
- **`dispatch(type, payload, metadata?)`**: delivery-scoped async publish. The returned promise belongs only to this emission and completes after all subscribers finish; reliable repository publishing uses this seam.
- **`on` / `off` / `destroy`**: subscribe and lifecycle cleanup.
- **Type safety**: business events remain defined through MemoFlow event maps/contracts; Emittery's internal `{ name, data }` envelope is not exposed to feature handlers.

This is **not** a distributed event bus. API, Electron main, and browser renderer each have their own runtime-local instance. Request/response uses Ports, HTTP, or Electron IPC; durable cross-process delivery uses the existing Outbox/Queue infrastructure.

**Usage:**

```typescript
import { eventBus } from '@memoflow/utils/domain';

// Notification-style subscriber.
eventBus.on('task:instance-completed', async (event) => {
  await updateProjection(event);
});

// Fire-and-forget business notification.
eventBus.send('task:instance-completed', payload);

// Infrastructure that must know this delivery completed.
await eventBus.dispatch('task:instance-completed', payload, {
  aggregateId: taskId,
  idempotencyKey,
});
```

See ADR-033 and ADR-064 for the communication and delivery boundaries.

### 4. Frontend Utilities (`frontend`)

Helper functions for frontend development.

- **apiUtils**: `getEnvironmentConfig`, `createAuthHeader`, `exponentialBackoff`, etc.
- **debounce / throttle**: Function rate limiting.

**Usage:**

```typescript
import { getEnvironmentConfig, createAuthHeader } from '@memoflow/utils';

const config = getEnvironmentConfig();
const headers = createAuthHeader(token);
```

### 5. General Utilities

- **Time/Date**: `Time`, `Date` helpers.
- **UUID**: UUID generation.
- **Response**: Standard API response wrappers (`Result`, `Either`).
