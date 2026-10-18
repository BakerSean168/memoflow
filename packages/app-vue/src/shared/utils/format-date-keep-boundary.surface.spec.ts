import { describe, expect, it } from 'vitest';
import { DEFAULT_EMPTY_LITERALS, resolveEmptyLabel } from '@memoflow/time';

describe('Product date presentation boundary', () => {
  it('keeps semantic empty labels distinct', () => {
    expect(resolveEmptyLabel('notSet')).toBe(DEFAULT_EMPTY_LITERALS.notSet);
    expect(resolveEmptyLabel('dash')).toBe(DEFAULT_EMPTY_LITERALS.dash);
    expect(resolveEmptyLabel('na')).toBe(DEFAULT_EMPTY_LITERALS.na);
    expect(resolveEmptyLabel('unknown')).toBe(DEFAULT_EMPTY_LITERALS.unknown);
  });
});
