/**
 * Progress fill recipe shared by the Progress primitive and product-owned
 * progress tracks.
 *
 * The gradient is anchored to the full track width and revealed from the left
 * with clip-path, so the visible leading edge always shows the band colour at
 * the current percentage instead of a scaled-down copy of the whole gradient.
 */

const PROGRESS_FILL_GRADIENT =
  'linear-gradient(90deg, hsl(var(--progress-fill)) 0%, hsl(var(--primary)) 55%, hsl(var(--progress-fill-end)) 100%)';

const PROGRESS_COMPLETION_GLOW = 'drop-shadow(0 0 6px hsl(var(--progress-fill-end) / 0.55))';

function clampProgress(value: number | null | undefined): number {
  const numeric = typeof value === 'number' && !Number.isNaN(value) ? value : 0;

  return Math.min(100, Math.max(0, numeric));
}

export function progressFillStyle(value: number | null | undefined): Record<string, string> {
  const hiddenPercent = Math.round((100 - clampProgress(value)) * 1000) / 1000;

  return {
    backgroundImage: PROGRESS_FILL_GRADIENT,
    clipPath: `inset(0 ${hiddenPercent}% 0 0)`,
  };
}

/**
 * Completion glow for the track, not the fill: a filter on the root paints
 * outside its own box and therefore survives the track's overflow clipping.
 */
export function progressGlowStyle(value: number | null | undefined): Record<string, string> {
  return clampProgress(value) >= 100 ? { filter: PROGRESS_COMPLETION_GLOW } : {};
}
