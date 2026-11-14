/**
 * Theme-token bridge for ECharts.
 *
 * ECharts paints to canvas, so it cannot consume `hsl(var(--chart-1))` CSS
 * strings directly. Read the design-token channel values from the chart's own
 * theme scope instead of hard-coding hex literals, and re-read them when the
 * renderer toggles light/dark or the accent attribute.
 *
 * Token mechanism: `packages/ui-core/src/styles/theme.css` publishes
 * `--chart-1…--chart-5`, `--primary`, `--info`, `--success`, `--warning` and
 * `--destructive` as bare HSL channels. `createChartTheme` turns whichever
 * reader it is given into the palette ECharts accepts.
 */
import {
  computed,
  getCurrentInstance,
  onMounted,
  onScopeDispose,
  ref,
  type ComputedRef,
} from 'vue';

/** Categorical series slots, in stable order. All values are theme tokens. */
const SERIES_TOKENS = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--info',
  '--success',
  '--warning',
] as const;

const REACTIVE_ATTRIBUTES = ['class', 'data-accent', 'data-theme', 'style'] as const;

export interface ChartTheme {
  /** Categorical series colors (at least five theme slots when tokens resolve). */
  readonly series: readonly string[];
  readonly foreground: string;
  readonly background: string;
  readonly border: string;
  readonly primary: string;
  readonly primaryForeground: string;
  readonly success: string;
  readonly warning: string;
  readonly info: string;
  readonly destructive: string;
}

/**
 * Theme tokens store HSL channels without the `hsl()` wrapper (`12 76% 61%`).
 * ECharts' parser wants the functional form, so normalize before handing the
 * value over. Already-functional CSS colors pass through unchanged.
 */
export function normalizeHslToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('(')) return trimmed;
  const channels = trimmed.split(/\s+/);
  if (channels.length !== 3) return trimmed;
  return `hsl(${channels.join(', ')})`;
}

/** Build the palette from any token reader (real DOM or a test double). */
export function createChartTheme(read: (token: string) => string): ChartTheme {
  const color = (token: string) => normalizeHslToken(read(token));
  return {
    series: SERIES_TOKENS.map(color).filter((value) => value.length > 0),
    foreground: color('--muted-foreground'),
    background: color('--background'),
    border: color('--border-strong'),
    primary: color('--primary'),
    primaryForeground: color('--primary-foreground'),
    success: color('--success'),
    warning: color('--warning'),
    info: color('--info'),
    destructive: color('--destructive'),
  };
}

/** Read one CSS custom property from an element's computed style. */
export function readToken(element: Element | null | undefined, token: string): string {
  if (!element || typeof window === 'undefined') return '';
  return window.getComputedStyle(element).getPropertyValue(token);
}

/** Read the chart palette from an element's theme scope. */
export function readChartTheme(element?: Element | null): ChartTheme {
  const scope = element ?? (typeof document === 'undefined' ? null : document.documentElement);
  return createChartTheme((token) => readToken(scope, token));
}

function resolveChartRoot(instance: ReturnType<typeof getCurrentInstance>): Element | null {
  const root = instance?.proxy?.$el;
  return root instanceof Element ? root : null;
}

/**
 * Reactive palette bound to the calling component's own theme scope. The chart
 * root inherits tokens from its containing `.dark` / `[data-accent]` surface,
 * so scoped stories and the real renderer both resolve the active theme.
 */
export function useChartTheme(): ComputedRef<ChartTheme> {
  const instance = getCurrentInstance();
  const revision = ref(0);
  let observer: MutationObserver | null = null;

  const root = () => resolveChartRoot(instance);

  onMounted(() => {
    // The root element only exists after the first render; re-read once it does.
    revision.value += 1;
    if (typeof MutationObserver === 'undefined') return;

    observer = new MutationObserver(() => {
      revision.value += 1;
    });

    let node: Element | null = root();
    while (node) {
      observer.observe(node, { attributes: true, attributeFilter: [...REACTIVE_ATTRIBUTES] });
      node = node.parentElement;
    }
  });

  onScopeDispose(() => observer?.disconnect());

  return computed(() => {
    void revision.value;
    return readChartTheme(root());
  });
}
