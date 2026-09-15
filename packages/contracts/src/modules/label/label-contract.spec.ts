import { describe, expect, it } from 'vitest';
import {
  CreateLabelReqSchema,
  LabelClientDTOSchema,
  LabelColorSchema,
  LabelPortableItemV3Schema,
} from './index';

describe('Label contract primitives', () => {
  it('canonicalizes valid six-digit RGB hex colors to lowercase', () => {
    expect(LabelColorSchema.parse('#A1B2C3')).toBe('#a1b2c3');
    expect(CreateLabelReqSchema.parse({ name: 'Work', color: '#ABCDEF' })).toEqual({
      name: 'Work',
      color: '#abcdef',
    });
  });

  it.each(['#fff', '#12345g', 'red', 'var(--accent)', 'rgb(1,2,3)', ''])(
    'rejects arbitrary or non-six-digit color %s',
    (color) => {
      expect(LabelColorSchema.safeParse(color).success).toBe(false);
      expect(CreateLabelReqSchema.safeParse({ name: 'Work', color }).success).toBe(false);
    },
  );

  it('normalizes before enforcing the canonical label name length', () => {
    const ligatures = 'ﬃ'.repeat(17);
    expect(CreateLabelReqSchema.safeParse({ name: ligatures }).success).toBe(false);
    expect(CreateLabelReqSchema.parse({ name: ` ${'ﬃ'.repeat(16)} ` }).name).toBe('ffi'.repeat(16));
  });

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
    expect(CreateLabelReqSchema.parse({ name: '\u00a8' }).name).toBe('\u0308');
    expect(
      LabelPortableItemV3Schema.parse({ ref: 'labels:1', name: '\u00a8', color: null }).name,
    ).toBe('\u0308');
  });

  it('keeps null color valid and client DTO strict with finite Instant-like timestamps', () => {
    expect(CreateLabelReqSchema.parse({ name: 'Work', color: null })).toEqual({
      name: 'Work',
      color: null,
    });
    expect(
      LabelClientDTOSchema.safeParse({
        id: 'label-1',
        name: 'Work',
        color: '#3B82F6',
        createdAt: 1,
        updatedAt: 2,
        identityId: 'must-not-leak',
      }).success,
    ).toBe(false);
    expect(
      LabelClientDTOSchema.safeParse({
        id: 'label-1',
        name: 'Work',
        color: '#3b82f6',
        createdAt: Number.NaN,
        updatedAt: 2,
      }).success,
    ).toBe(false);
  });
});
