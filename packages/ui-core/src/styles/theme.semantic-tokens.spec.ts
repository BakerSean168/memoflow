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

  it('keeps chart slots and brand gold tokens outside the accent switching set', () => {
    const root = block(':root');
    expect(declare(root, 'chart-2')).toBe('173 58% 39%');
    expect(declare(block('.dark'), 'chart-2')).toBe('160 60% 45%');
    expect(declare(root, 'brand-gold-via')).toBe('37 91% 55%');
  });
});
