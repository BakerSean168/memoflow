export type SemanticTone = 'primary' | 'info' | 'success' | 'warning' | 'destructive' | 'muted';

const SEMANTIC_TONE_SURFACE_CLASS: Record<SemanticTone, string> = {
  primary: 'bg-primary/10 text-primary',
  info: 'bg-info/10 text-info',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  muted: 'bg-muted text-muted-foreground',
};

export function semanticToneSurfaceClass(tone: SemanticTone): string {
  return SEMANTIC_TONE_SURFACE_CLASS[tone];
}
