/**
 * Account / Identity test fixtures
 *
 * Provides factory functions for generating test IdentityId values
 * and minimal account-related test data.
 *
 * NOTE: Full Account aggregate fixtures (anAccount, aLoadedAccount, etc.)
 * are intentionally NOT placed here to avoid a circular dependency
 * between test-utils and @memoflow/account. Instead, each test file in the
 * account module creates its own local helpers following the pattern
 * established in the task module tests.
 */

import { IdentityId } from '@memoflow/utils/domain';

/**
 * Residual 1033: sole anIdentityId fixture helper (task testing re-exports).
 * Generate a branded IdentityId for tests.
 * Uses the domain's own `IdentityId.generate()` to ensure the prefix format is correct.
 *
 * @param value - Optional raw string to cast (e.g., 'test-user-123')
 */
export function anIdentityId(value?: string): IdentityId {
  if (value) return IdentityId.of(value);
  return IdentityId.generate();
}

/**
 * Well-known test identity for deterministic assertions.
 * Use this when you need the same identity across related test objects.
 */
export const TEST_IDENTITY_ID = IdentityId.of('IdentityId_550e8400-e29b-41d4-a716-446655440001');
