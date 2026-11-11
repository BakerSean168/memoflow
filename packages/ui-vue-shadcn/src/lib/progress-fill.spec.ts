import { describe, expect, it } from 'vitest';
import { progressFillStyle } from './progress-fill';

const GRADIENT =
  'linear-gradient(90deg, hsl(var(--progress-fill)) 0%, hsl(var(--primary)) 55%, hsl(var(--progress-fill-end)) 100%)';

describe('progressFillStyle', () => {
  it.each([
    [0, 'inset(0 100% 0 0)'],
    [10, 'inset(0 90% 0 0)'],
    [50, 'inset(0 50% 0 0)'],
    [90, 'inset(0 10% 0 0)'],
    [100, 'inset(0 0% 0 0)'],
  ])('anchors the full-width gradient and reveals %s%% with %s', (value, clipPath) => {
    expect(progressFillStyle(value)).toEqual({
      backgroundImage: GRADIENT,
      clipPath,
      ...(value >= 100 ? { boxShadow: '0 0 10px hsl(var(--progress-fill-end) / 0.45)' } : {}),
    });
  });

  it('adds the completion glow only at 100', () => {
    expect(progressFillStyle(100).boxShadow).toBe('0 0 10px hsl(var(--progress-fill-end) / 0.45)');
    expect(progressFillStyle(90).boxShadow).toBeUndefined();
  });

  it.each([
    [-5, 'inset(0 100% 0 0)'],
    [250, 'inset(0 0% 0 0)'],
  ])('clamps the out-of-range value %s', (value, clipPath) => {
    expect(progressFillStyle(value)).toEqual({
      backgroundImage: GRADIENT,
      clipPath,
      ...(value >= 100 ? { boxShadow: '0 0 10px hsl(var(--progress-fill-end) / 0.45)' } : {}),
    });
  });

  it.each([null, undefined, Number.NaN])('treats %s as 0', (value) => {
    expect(progressFillStyle(value)).toEqual({
      backgroundImage: GRADIENT,
      clipPath: 'inset(0 100% 0 0)',
    });
  });
});
