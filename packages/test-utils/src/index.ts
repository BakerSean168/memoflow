/**
 * @memoflow/test-utils
 *
 * Unified testing utilities for the MemoFlow monorepo.
 *
 * Sub-modules:
 * - helpers:  Random data generators, Result matchers, async waitFor
 * - mocks:    Proxy-based repository/event-bus mock factories
 * - fixtures: Lightweight shared test data factories (account, base helpers)
 * - setup:    Fast-test hooks, browser mocks, and database lifecycle management
 *
 * @example
 * ```typescript
 * // Import everything
 * import { createMockRepo, anIdentityId } from '@memoflow/test-utils';
 *
 * // Or import from sub-modules for tree-shaking
 * import { anIdentityId } from '@memoflow/test-utils/fixtures';
 * import { createMockRepo } from '@memoflow/test-utils/mocks';
 * import { ensureTestDatabase } from '@memoflow/test-utils/setup';
 * ```
 */

// Helpers
export {
  generateUUID,
  randomString,
  randomEmail,
  randomNumber,
  timestampFrom,
  TimeOffset,
} from './helpers/random.js';

export { waitFor } from './helpers/wait-for.js';

// Result matchers: side-effect module — import directly in vitest setup files:
//   import '@memoflow/test-utils/helpers/result-matchers';

// Mocks
export { createMockRepo, createMockEventBus } from './mocks/repository-mock.factory.js';

// Fixtures
export {
  // Base
  withDefaults,
  timestamps,
  numericTimestamps,
  titleFor,
  // Account
  aUuid,
  aPrefixedUuid,
  anIdentityId,
  TEST_IDENTITY_ID,
} from './fixtures/index.js';

// Setup (re-export selectively to avoid pulling in node:child_process for unit tests)
export { applyFastTestEnv, registerFastTestHooks } from './setup/fast.js';
export { installCommonBrowserMocks, createMatchMediaMock } from './setup/browser.js';
export { createTestPinia, installVuePiniaTestHarness, mountWithPinia } from './setup/vue.js';
export type {} from './setup/database.js';

// Test-only package shims

