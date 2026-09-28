import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'ProductDateTimePicker.vue'), 'utf8');

describe('ProductDateTimePicker', () => {
  it('uses one exact-day calendar instead of Goal timeframe precision tabs', () => {
    expect(source).toContain('<Calendar');
    expect(source).toContain('appearance="linear"');
    expect(source).not.toContain('ProductTemporalPickerSurface');
    expect(source).not.toContain('ToggleGroup');
    expect(source).not.toContain('quarter');
    expect(source).not.toContain('halfYear');
  });

  it('keeps date and precise hour/minute editing in one dialog surface', () => {
    expect(source).toContain('<DialogContent');
    expect(source).toContain('hourDraft');
    expect(source).toContain('minuteDraft');
    expect(source).toContain('inputmode="numeric"');
    expect(source).toContain('getProductTime().input.combine');
    expect(source).toContain('formatProductDateTime');
  });

  it('prevents applying values at or before its minimum instant', () => {
    expect(source).toContain('draftInstant.value <= effectiveMinValue.value');
    expect(source).toContain(':disabled="disabled || !canApply"');
    expect(source).toContain('pastTimeText');
  });
});
