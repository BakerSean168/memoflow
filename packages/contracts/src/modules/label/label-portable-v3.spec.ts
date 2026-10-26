import { describe, expect, it } from 'vitest';
import { LabelPortableItemV3Schema } from './index';

describe('Label portable contract primitives', () => {
  it('normalizes portable names before enforcing the canonical length', () => {
    const ligatures = 'ﬃ'.repeat(17);
    expect(
      LabelPortableItemV3Schema.safeParse({
        ref: 'labels:1',
        name: ligatures,
        color: null,
      }).success,
    ).toBe(false);
    expect(
      LabelPortableItemV3Schema.parse({
        ref: 'labels:1',
        name: ` ${'ﬃ'.repeat(16)} `,
        color: null,
      }).name,
    ).toBe('ffi'.repeat(16));
  });

  it('trims whitespace introduced by NFKC normalization', () => {
    expect(
      LabelPortableItemV3Schema.parse({ ref: 'labels:1', name: '\u00a8', color: null }).name,
    ).toBe('\u0308');
  });
});
