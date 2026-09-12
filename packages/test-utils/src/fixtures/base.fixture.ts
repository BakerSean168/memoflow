/**
 * Base fixture utilities
 *
 * Provides foundational helpers for building domain-specific fixtures.
 * All fixture factories follow the "defaults + overrides" pattern:
 * every property has a sensible default, and callers can override any subset.
 */

import { generateUUID, randomString, timestampFrom, TimeOffset } from '../helpers/random.js';

/**
 * Merge defaults with overrides, applying the override for any key that is explicitly provided.
 * This is a shallow merge — nested objects are replaced, not deeply merged.
 */
export function withDefaults<T extends Record<string, unknown>>(
  defaults: T,
  overrides?: Partial<T>,
): T {
  if (!overrides) return { ...defaults };
  return { ...defaults, ...overrides };
}

/**
 * Standard timestamp set for aggregate/entity state.
 * Generates createdAt slightly in the past and updatedAt = createdAt.
 */
export function timestamps(offsetMs = -TimeOffset.MINUTE) {
  const now = timestampFrom(offsetMs);
  return {
    createdAt: new Date(now),
    updatedAt: new Date(now),
    deletedAt: null,
  };
}

/**
 * Standard timestamp set using numeric (epoch ms) timestamps.
 * Used by aggregates that store timestamps as numbers (e.g., TaskOccurrence).
 */
export function numericTimestamps(offsetMs = -TimeOffset.MINUTE) {
  const now = timestampFrom(offsetMs);
  return {
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * Generate a sequential title for test readability.
 *
 * @example titleFor('Task') => "Task xK4mBn"
 */
export function titleFor(prefix: string): string {
  return `${prefix} ${randomString(6)}`;
}
