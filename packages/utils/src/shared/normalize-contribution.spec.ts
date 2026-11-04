import { describe, expect, it } from 'vitest';
import { normalizeContribution } from './normalize-contribution';

describe('normalizeContribution', () => {
  it('returns an empty array for missing input', () => {
    expect(normalizeContribution()).toEqual([]);
    expect(normalizeContribution(undefined)).toEqual([]);
  });

  it('wraps a single value', () => {
    const value = { start: async () => {}, stop: async () => {} };
    expect(normalizeContribution(value)).toEqual([value]);
  });

  it('copies array input instead of returning it by reference', () => {
    const value = { start: async () => {}, stop: async () => {} };
    const input = [value];
    const normalized = normalizeContribution(input);

    expect(normalized).toEqual([value]);
    expect(normalized).not.toBe(input);
  });
});
