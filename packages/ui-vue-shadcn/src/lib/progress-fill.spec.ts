import { describe, expect, it } from 'vitest';
import { progressFillStyle, progressGlowStyle } from './progress-fill';

const GRADIENT =
  'linear-gradient(90deg, hsl(var(--progress-fill)) 0%, hsl(var(--primary)) 55%, hsl(var(--progress-fill-end)) 100%)';
const GLOW = 'drop-shadow(0 0 6px hsl(var(--progress-fill-end) / 0.55))';

describe('progressFillStyle', () => {
  it.each([
    [0, 'inset(0 100% 0 0)'],
    [10, 'inset(0 90% 0 0)'],
    [50, 'inset(0 50% 0 0)'],
    [90, 'inset(0 10% 0 0)'],
    [100, 'inset(0 0% 0 0)'],
  ])('anchors the full-width gradient and reveals %s%% with %s', (value, clipPath) => {
    expect(progressFillStyle(value)).toEqual({ backgroundImage: GRADIENT, clipPath });
  });

  it('keeps the completion glow off the fill so the track can paint it', () => {
    expect(progressFillStyle(100)).not.toHaveProperty('boxShadow');
    expect(progressFillStyle(90)).not.toHaveProperty('boxShadow');
  });

  it.each([
    [-5, 'inset(0 100% 0 0)'],
    [250, 'inset(0 0% 0 0)'],
  ])('clamps the out-of-range value %s', (value, clipPath) => {
    expect(progressFillStyle(value)).toEqual({ backgroundImage: GRADIENT, clipPath });
  });

  it.each([null, undefined, Number.NaN])('treats %s as 0', (value) => {
    expect(progressFillStyle(value)).toEqual({
      backgroundImage: GRADIENT,
      clipPath: 'inset(0 100% 0 0)',
    });
  });
});

describe('progressGlowStyle', () => {
  it('adds the track drop-shadow at 100', () => {
    expect(progressGlowStyle(100)).toEqual({ filter: GLOW });
  });

  it.each([0, 10, 50, 90])('stays empty below completion (%s)', (value) => {
    expect(progressGlowStyle(value)).toEqual({});
  });

  it.each([
    [250, { filter: GLOW }],
    [-5, {}],
    [Number.POSITIVE_INFINITY, { filter: GLOW }],
    [Number.NEGATIVE_INFINITY, {}],
  ])('clamps %s like the fill', (value, expected) => {
    expect(progressGlowStyle(value)).toEqual(expected);
  });

  it.each([null, undefined, Number.NaN])('treats %s as 0', (value) => {
    expect(progressGlowStyle(value)).toEqual({});
  });
});
