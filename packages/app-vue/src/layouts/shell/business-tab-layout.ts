export type BusinessTabDensity = 'comfortable' | 'compact' | 'icon';

const FIXED_CHROME_BUDGET = 76;

/**
 * Resolve how much information each BusinessPanel tab may render.
 *
 * The product caps business tabs at eight. Instead of exposing a native
 * horizontal scrollbar, the strip degrades label density while preserving the
 * active tab as the strongest context signal.
 */
export function resolveBusinessTabDensity(
  panelWidth: number,
  tabCount: number,
): BusinessTabDensity {
  if (tabCount <= 0) return 'comfortable';

  const width = Number.isFinite(panelWidth) ? Math.max(0, panelWidth) : 720;
  const available = Math.max(0, width - FIXED_CHROME_BUDGET);
  const averageTabWidth = available / tabCount;

  if (averageTabWidth < 58) return 'icon';
  if (averageTabWidth < 108) return 'compact';
  return 'comfortable';
}
