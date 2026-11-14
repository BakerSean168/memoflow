/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./theme.css', import.meta.url)), 'utf8');

const SWITCHING_TOKENS = [
  'primary',
  'primary-foreground',
  'primary-hover',
  'ring',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-ring',
  'progress-fill',
  'progress-fill-end',
] as const;

const CHART_TOKENS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'] as const;

interface AccentValues {
  light: Record<(typeof SWITCHING_TOKENS)[number], string>;
  dark: Record<(typeof SWITCHING_TOKENS)[number], string>;
}

/** Final values from the Issue #909 palette table (B.5). */
const ACCENTS: Record<string, AccentValues> = {
  'brand-gold': {
    light: {
      primary: '37 91% 40%',
      'primary-foreground': '28 45% 10%',
      'primary-hover': '37 91% 38%',
      ring: '37 91% 40%',
      'sidebar-primary': '37 91% 40%',
      'sidebar-primary-foreground': '28 45% 10%',
      'sidebar-ring': '37 91% 40%',
      'progress-fill': '37 91% 40%',
      'progress-fill-end': '37 91% 34%',
    },
    dark: {
      primary: '37 91% 55%',
      'primary-foreground': '28 45% 10%',
      'primary-hover': '37 91% 62%',
      ring: '37 91% 55%',
      'sidebar-primary': '37 91% 55%',
      'sidebar-primary-foreground': '28 45% 10%',
      'sidebar-ring': '37 91% 55%',
      'progress-fill': '37 91% 63%',
      'progress-fill-end': '37 91% 51%',
    },
  },
  'linear-indigo': {
    light: {
      primary: '235 58% 56%',
      'primary-foreground': '0 0% 100%',
      'primary-hover': '235 58% 50%',
      ring: '235 58% 56%',
      'sidebar-primary': '235 58% 56%',
      'sidebar-primary-foreground': '0 0% 100%',
      'sidebar-ring': '235 58% 56%',
      'progress-fill': '235 58% 56%',
      'progress-fill-end': '235 58% 50%',
    },
    dark: {
      primary: '235 58% 60%',
      'primary-foreground': '0 0% 100%',
      'primary-hover': '235 58% 54%',
      ring: '235 58% 60%',
      'sidebar-primary': '235 58% 60%',
      'sidebar-primary-foreground': '0 0% 100%',
      'sidebar-ring': '235 58% 60%',
      'progress-fill': '235 58% 68%',
      'progress-fill-end': '235 58% 56%',
    },
  },
  'ocean-blue': {
    light: {
      primary: '199 89% 34%',
      'primary-foreground': '0 0% 100%',
      'primary-hover': '199 89% 28%',
      ring: '199 89% 34%',
      'sidebar-primary': '199 89% 34%',
      'sidebar-primary-foreground': '0 0% 100%',
      'sidebar-ring': '199 89% 34%',
      'progress-fill': '199 89% 34%',
      'progress-fill-end': '199 89% 28%',
    },
    dark: {
      primary: '199 89% 60%',
      'primary-foreground': '199 100% 8%',
      'primary-hover': '199 89% 66%',
      ring: '199 89% 60%',
      'sidebar-primary': '199 89% 60%',
      'sidebar-primary-foreground': '199 100% 8%',
      'sidebar-ring': '199 89% 60%',
      'progress-fill': '199 89% 68%',
      'progress-fill-end': '199 89% 56%',
    },
  },
  'emerald-green': {
    light: {
      primary: '160 84% 26%',
      'primary-foreground': '0 0% 100%',
      'primary-hover': '160 84% 20%',
      ring: '160 84% 26%',
      'sidebar-primary': '160 84% 26%',
      'sidebar-primary-foreground': '0 0% 100%',
      'sidebar-ring': '160 84% 26%',
      'progress-fill': '160 84% 26%',
      'progress-fill-end': '160 84% 20%',
    },
    dark: {
      primary: '160 70% 52%',
      'primary-foreground': '160 50% 8%',
      'primary-hover': '160 70% 58%',
      ring: '160 70% 52%',
      'sidebar-primary': '160 70% 52%',
      'sidebar-primary-foreground': '160 50% 8%',
      'sidebar-ring': '160 70% 52%',
      'progress-fill': '160 70% 60%',
      'progress-fill-end': '160 70% 48%',
    },
  },
  'rose-red': {
    light: {
      primary: '347 77% 48%',
      'primary-foreground': '0 0% 100%',
      'primary-hover': '347 77% 42%',
      ring: '347 77% 48%',
      'sidebar-primary': '347 77% 48%',
      'sidebar-primary-foreground': '0 0% 100%',
      'sidebar-ring': '347 77% 48%',
      'progress-fill': '347 77% 48%',
      'progress-fill-end': '347 77% 42%',
    },
    dark: {
      primary: '347 77% 52%',
      'primary-foreground': '0 0% 100%',
      'primary-hover': '347 77% 46%',
      ring: '347 77% 52%',
      'sidebar-primary': '347 77% 52%',
      'sidebar-primary-foreground': '0 0% 100%',
      'sidebar-ring': '347 77% 52%',
      'progress-fill': '347 77% 60%',
      'progress-fill-end': '347 77% 48%',
    },
  },
  violet: {
    light: {
      primary: '262 83% 52%',
      'primary-foreground': '0 0% 100%',
      'primary-hover': '262 83% 46%',
      ring: '262 83% 52%',
      'sidebar-primary': '262 83% 52%',
      'sidebar-primary-foreground': '0 0% 100%',
      'sidebar-ring': '262 83% 52%',
      'progress-fill': '262 83% 52%',
      'progress-fill-end': '262 83% 46%',
    },
    dark: {
      primary: '262 83% 58%',
      'primary-foreground': '0 0% 100%',
      'primary-hover': '262 83% 62%',
      ring: '262 83% 58%',
      'sidebar-primary': '262 83% 58%',
      'sidebar-primary-foreground': '0 0% 100%',
      'sidebar-ring': '262 83% 58%',
      'progress-fill': '262 83% 66%',
      'progress-fill-end': '262 83% 56%',
    },
  },
};

interface ChartPalette {
  light: readonly string[];
  dark: readonly string[];
}

/**
 * Chart ramps per accent. `chart-1` anchors the accent hue; `chart-2…5` spread
 * across the hue ring, keeping clear of the success/warning/destructive/info
 * hue ranges where an alternative exists. Brand gold keeps the base ramp.
 */
const CHART_PALETTES: Record<string, ChartPalette> = {
  'brand-gold': {
    light: ['12 76% 61%', '173 58% 39%', '197 37% 24%', '43 74% 41%', '27 87% 48%'],
    dark: ['220 70% 50%', '160 60% 45%', '30 80% 55%', '280 65% 60%', '340 75% 55%'],
  },
  'linear-indigo': {
    light: ['235 68% 55%', '285 55% 48%', '325 55% 38%', '100 50% 42%', '65 62% 37%'],
    dark: ['235 60% 58%', '285 55% 55%', '325 55% 52%', '100 50% 55%', '65 60% 52%'],
  },
  'ocean-blue': {
    light: ['199 78% 47%', '240 58% 48%', '285 55% 38%', '330 52% 52%', '70 62% 37%'],
    dark: ['199 72% 58%', '240 58% 60%', '285 55% 55%', '330 52% 56%', '70 60% 50%'],
  },
  'emerald-green': {
    light: ['160 70% 38%', '105 50% 43%', '65 62% 37%', '240 55% 48%', '285 52% 52%'],
    dark: ['160 62% 52%', '105 45% 50%', '65 60% 55%', '240 55% 60%', '285 52% 56%'],
  },
  'rose-red': {
    light: ['347 72% 48%', '65 62% 37%', '180 48% 38%', '240 55% 48%', '285 52% 52%'],
    dark: ['347 70% 58%', '65 60% 52%', '180 45% 55%', '240 55% 60%', '285 52% 56%'],
  },
  violet: {
    light: ['262 68% 52%', '310 55% 48%', '100 50% 40%', '65 62% 37%', '180 48% 38%'],
    dark: ['262 62% 58%', '310 55% 55%', '100 50% 55%', '65 60% 52%', '180 45% 56%'],
  },
};

function block(selector: string): string {
  const pattern = new RegExp(
    `^  ${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([\\s\\S]*?)^  \\}`,
    'm',
  );
  const match = css.match(pattern);
  expect(match, `missing CSS block: ${selector}`).not.toBeNull();
  return match![1]!;
}

function declare(source: string, token: string): string {
  const match = source.match(new RegExp(`--${token}:\\s*([^;]+);`));
  expect(match, `missing declaration: --${token}`).not.toBeNull();
  return match![1]!.trim();
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function parseHsl(value: string): Hsl {
  const match = value.match(/(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  expect(match, `invalid HSL channels: ${value}`).not.toBeNull();
  return { h: Number(match![1]), s: Number(match![2]), l: Number(match![3]) };
}

function channelLuminance(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance({ h, s, l }: Hsl): number {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = (((h % 360) + 360) % 360) / 60;
  const secondary = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;
  if (huePrime < 1) {
    red = chroma;
    green = secondary;
  } else if (huePrime < 2) {
    red = secondary;
    green = chroma;
  } else if (huePrime < 3) {
    green = chroma;
    blue = secondary;
  } else if (huePrime < 4) {
    green = secondary;
    blue = chroma;
  } else if (huePrime < 5) {
    red = secondary;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondary;
  }
  const offset = lightness - chroma / 2;
  const linear = [red + offset, green + offset, blue + offset].map(channelLuminance);
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

/** WCAG contrast ratio, used for the graphical-object 3:1 floor. */
function contrastRatio(foreground: Hsl, background: Hsl): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function hueDistance(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
}

describe('accent-driven theme tokens', () => {
  it('publishes a neutral surface ramp and separate overlay/card layers', () => {
    for (const token of [
      '--surface:',
      '--surface-raised:',
      '--surface-overlay:',
      '--hover:',
      '--selected:',
      '--border-subtle:',
      '--border-strong:',
      '--foreground-muted:',
      '--foreground-subtle:',
      '--primary-hover:',
    ]) {
      expect(css).toContain(token);
    }
    const dark = block('.dark');
    expect(dark).toContain('--background: 0 0% 5.5%');
    expect(dark).toContain('--card: 0 0% 8%');
    expect(dark).toContain('--popover: 0 0% 11%');
    expect(dark).toContain('--border: 0 0% 17%');
  });

  it('uses the brand gold as the baseline for :root and .dark', () => {
    const root = block(':root');
    const dark = block('.dark');
    for (const token of SWITCHING_TOKENS) {
      expect(declare(root, token)).toBe(ACCENTS['brand-gold']!.light[token]);
      expect(declare(dark, token)).toBe(ACCENTS['brand-gold']!.dark[token]);
    }
  });

  it('provides complete light and dark blocks for every non-default accent', () => {
    for (const [accent, values] of Object.entries(ACCENTS)) {
      if (accent === 'brand-gold') continue;
      const light = block(`:root[data-accent='${accent}']`);
      const dark = block(`.dark[data-accent='${accent}']`);
      for (const token of SWITCHING_TOKENS) {
        expect(declare(light, token), `${accent} light --${token}`).toBe(values.light[token]);
        expect(declare(dark, token), `${accent} dark --${token}`).toBe(values.dark[token]);
      }
    }
  });

  it('keeps linear indigo dark primary at the legacy 235 58% 60% value', () => {
    expect(declare(block(`.dark[data-accent='linear-indigo']`), 'primary')).toBe('235 58% 60%');
  });

  it('keeps the brand gold chart ramp and brand tokens on the base blocks', () => {
    const root = block(':root');
    const dark = block('.dark');
    const brandGold = CHART_PALETTES['brand-gold']!;
    for (const [index, token] of CHART_TOKENS.entries()) {
      expect(declare(root, token), `brand gold light --${token}`).toBe(brandGold.light[index]);
      expect(declare(dark, token), `brand gold dark --${token}`).toBe(brandGold.dark[index]);
    }
    expect(declare(root, 'brand-gold-via')).toBe('37 91% 55%');
  });

  it('switches all five chart slots with every non-default accent', () => {
    const brandGold = CHART_PALETTES['brand-gold']!;
    for (const [accent, palette] of Object.entries(CHART_PALETTES)) {
      if (accent === 'brand-gold') continue;
      const light = block(`:root[data-accent='${accent}']`);
      const dark = block(`.dark[data-accent='${accent}']`);
      for (const [index, token] of CHART_TOKENS.entries()) {
        expect(declare(light, token), `${accent} light --${token}`).toBe(palette.light[index]);
        expect(declare(dark, token), `${accent} dark --${token}`).toBe(palette.dark[index]);
        expect(declare(light, token), `${accent} light --${token} reuses brand gold`).not.toBe(
          brandGold.light[index],
        );
        expect(declare(dark, token), `${accent} dark --${token} reuses brand gold`).not.toBe(
          brandGold.dark[index],
        );
      }
    }
  });

  it('keeps every chart slot at 3:1 or better against its block background', () => {
    const backgrounds = {
      light: parseHsl(declare(block(':root'), 'background')),
      dark: parseHsl(declare(block('.dark'), 'background')),
    };
    for (const [accent, palette] of Object.entries(CHART_PALETTES)) {
      for (const mode of ['light', 'dark'] as const) {
        for (const [index, token] of CHART_TOKENS.entries()) {
          const ratio = contrastRatio(parseHsl(palette[mode][index]!), backgrounds[mode]);
          expect(ratio, `${accent} ${mode} --${token} contrast`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('anchors chart-1 on the accent hue and keeps the ramp hues apart', () => {
    for (const [accent, values] of Object.entries(ACCENTS)) {
      if (accent === 'brand-gold') continue;
      for (const mode of ['light', 'dark'] as const) {
        const primaryHue = parseHsl(values[mode].primary).h;
        const hues = CHART_PALETTES[accent]![mode].map((value) => parseHsl(value).h);
        expect(
          hueDistance(hues[0]!, primaryHue),
          `${accent} ${mode} --chart-1 hue`,
        ).toBeLessThanOrEqual(15);
        for (let i = 0; i < hues.length; i += 1) {
          for (let j = i + 1; j < hues.length; j += 1) {
            expect(
              hueDistance(hues[i]!, hues[j]!),
              `${accent} ${mode} chart ${i + 1}/${j + 1} hue distance`,
            ).toBeGreaterThanOrEqual(30);
          }
        }
      }
    }
  });
});
