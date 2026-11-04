import { describe, expect, it } from 'vitest';
import { isRecord } from './guards';

describe('isRecord', () => {
  it('accepts plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ value: 1 })).toBe(true);
  });

  it('rejects null, primitives and array values', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord('value')).toBe(false);
    expect(isRecord(1)).toBe(false);
    expect(isRecord([])).toBe(false);
  });
});
