import { describe, expect, it } from 'vitest';
import { resolveEmptyLabel } from '@memoflow/time';

describe('Product date-time presentation boundary', () => {
  it('keeps empty catalog meanings distinct', () => {
    expect(resolveEmptyLabel('dash')).toBe('-');
    expect(resolveEmptyLabel('na')).toBe('N/A');
  });
});
