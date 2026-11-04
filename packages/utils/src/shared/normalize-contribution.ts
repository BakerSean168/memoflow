/**
 * Sole single-or-array runtime contribution normalizer for module composition roots.
 * undefined/null → []; array → copy; single value → one-element array.
 */

function isContributionArray<T>(value: T | readonly T[]): value is readonly T[] {
  return Array.isArray(value);
}

export function normalizeContribution<T>(input?: T | readonly T[]): readonly T[] {
  if (!input) {
    return [];
  }

  return isContributionArray(input) ? Array.from(input) : [input];
}
