export type BusinessTabDensity = 'comfortable' | 'compact' | 'icon';

const FIXED_CHROME_BUDGET = 76;
const WORKFLOW_CHROME_BUDGET = 88;

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
  workflowAvailable: boolean,
): BusinessTabDensity {
  if (tabCount <= 0) return 'comfortable';

  const width = Number.isFinite(panelWidth) ? Math.max(0, panelWidth) : 720;
  const workflowBudget = workflowAvailable ? WORKFLOW_CHROME_BUDGET : 0;
  const available = Math.max(0, width - FIXED_CHROME_BUDGET - workflowBudget);
  const averageTabWidth = available / tabCount;

  if (averageTabWidth < 58) return 'icon';
  if (averageTabWidth < 108) return 'compact';
  return 'comfortable';
}
