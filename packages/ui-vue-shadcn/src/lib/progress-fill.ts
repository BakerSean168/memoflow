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

export function progressFillStyle(value: number | null | undefined): Record<string, string> {
  const numeric = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  const percent = Math.min(100, Math.max(0, numeric));
  const hiddenPercent = Math.round((100 - percent) * 1000) / 1000;
  const style: Record<string, string> = {
    backgroundImage: PROGRESS_FILL_GRADIENT,
    clipPath: `inset(0 ${hiddenPercent}% 0 0)`,
  };

  if (percent >= 100) {
    style.boxShadow = '0 0 10px hsl(var(--progress-fill-end) / 0.45)';
  }

  return style;
}
