import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChartTheme, normalizeHslToken, readChartTheme, readToken } from './chart-theme';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('normalizeHslToken', () => {
  it('turns bare HSL channel tokens into functional CSS colors', () => {
    expect(normalizeHslToken('12 76% 61%')).toBe('hsl(12, 76%, 61%)');
    expect(normalizeHslToken('  240 5.9% 90%  ')).toBe('hsl(240, 5.9%, 90%)');
  });

  it('leaves functional or non-channel values untouched', () => {
    expect(normalizeHslToken('hsl(12, 76%, 61%)')).toBe('hsl(12, 76%, 61%)');
    expect(normalizeHslToken('#ffffff')).toBe('#ffffff');
    expect(normalizeHslToken('')).toBe('');
  });
});

describe('createChartTheme', () => {
  it('reads every palette slot through the provided token reader', () => {
    const tokens: Record<string, string> = {
      '--chart-1': '12 76% 61%',
      '--chart-2': '173 58% 39%',
      '--chart-3': '197 37% 24%',
      '--chart-4': '43 74% 66%',
      '--chart-5': '27 87% 67%',
      '--info': '212 84% 46%',
      '--success': '151 60% 26%',
      '--warning': '32 95% 44%',
      '--primary': '37 91% 40%',
      '--muted-foreground': '240 3.8% 44%',
      '--border-strong': '240 5.9% 80%',
      '--primary-foreground': '28 45% 10%',
      '--destructive': '0 84.2% 60.2%',
    };

    const theme = createChartTheme((token) => tokens[token] ?? '');

    expect(theme.series).toHaveLength(8);
    expect(theme.series[0]).toBe('hsl(12, 76%, 61%)');
    expect(theme.series[5]).toBe('hsl(212, 84%, 46%)');
    expect(theme.primary).toBe('hsl(37, 91%, 40%)');
    expect(theme.foreground).toBe('hsl(240, 3.8%, 44%)');
    expect(theme.success).toBe('hsl(151, 60%, 26%)');
  });

  it('drops unresolved slots instead of emitting invalid colors', () => {
    const theme = createChartTheme(() => '');
    expect(theme.series).toEqual([]);
    expect(theme.primary).toBe('');
  });
});

describe('readChartTheme', () => {
  it('reads computed custom properties from a theme scope', () => {
    const scope = document.createElement('div');
    document.body.append(scope);

    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () =>
        ({
          getPropertyValue: (token: string) =>
            token === '--chart-1' ? '220 70% 50%' : token === '--primary' ? '262 83% 52%' : '',
        }) as unknown as CSSStyleDeclaration,
    );

    const theme = readChartTheme(scope);
    expect(readToken(scope, '--chart-1')).toBe('220 70% 50%');
    expect(theme.series).toEqual(['hsl(220, 70%, 50%)']);
    expect(theme.primary).toBe('hsl(262, 83%, 52%)');
  });

  it('returns empty values when no DOM is available', () => {
    expect(readToken(null, '--chart-1')).toBe('');
  });
});

describe('goal-ui chart color sources', () => {
  const chartComponents = [
    '../components/echarts/KrCompletionChart.vue',
    '../components/echarts/KrWeightDistributionChart.vue',
    '../components/echarts/PeriodBarChart.vue',
    '../components/weight-snapshot/WeightTrendChart.vue',
  ];

  it('resolves every chart color from theme tokens instead of hex literals', () => {
    for (const relativePath of chartComponents) {
      const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
      expect(source, relativePath).toContain('useChartTheme');
      expect(source, relativePath).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    }
  });
});
