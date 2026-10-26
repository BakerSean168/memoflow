import { describe, expect, it } from 'vitest';
import {
  KEY_RESULT_DESCRIPTION_MAX_LENGTH,
  KEY_RESULT_TITLE_MAX_LENGTH,
} from '../value-objects/key-result-limits';
import { KeyResultInputSchema } from './key-result-input.schema';
import { UpdateKeyResultSchema } from './key-result.dto';

describe('key result text limits', () => {
  const baseInput = {
    title: 'KR',
    description: null,
    initialValue: 0,
    currentValue: 0,
    targetValue: 1,
    unit: null,
    weight: 3,
  };

  it('accepts the boundary and rejects longer create values', () => {
    expect(
      KeyResultInputSchema.safeParse({
        ...baseInput,
        title: 'x'.repeat(KEY_RESULT_TITLE_MAX_LENGTH),
        description: 'y'.repeat(KEY_RESULT_DESCRIPTION_MAX_LENGTH),
      }).success,
    ).toBe(true);

    expect(
      KeyResultInputSchema.safeParse({
        ...baseInput,
        title: 'x'.repeat(KEY_RESULT_TITLE_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);

    expect(
      KeyResultInputSchema.safeParse({
        ...baseInput,
        description: 'y'.repeat(KEY_RESULT_DESCRIPTION_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it('applies the same limits to standalone KR updates', () => {
    expect(
      UpdateKeyResultSchema.safeParse({
        expectedVersion: 1,
        title: 'x'.repeat(KEY_RESULT_TITLE_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);

    expect(
      UpdateKeyResultSchema.safeParse({
        expectedVersion: 1,
        description: 'y'.repeat(KEY_RESULT_DESCRIPTION_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});
