export type SemanticTone = 'primary' | 'info' | 'success' | 'warning' | 'destructive' | 'muted';

const SEMANTIC_TONE_SURFACE_CLASS: Record<SemanticTone, string> = {
  primary: 'bg-primary/10 text-primary',
  info: 'bg-info/10 text-info',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  muted: 'bg-muted text-muted-foreground',
};

const SEMANTIC_TONE_STATUS_CLASS: Record<SemanticTone, string> = {
  primary: 'bg-primary/8 text-foreground',
  info: 'bg-info/8 text-foreground',
  success: 'bg-success/8 text-foreground',
  warning: 'bg-warning/8 text-foreground',
  destructive: 'bg-destructive/8 text-destructive',
  muted: 'bg-muted/45 text-muted-foreground',
};

const SEMANTIC_TONE_BORDER_CLASS: Record<SemanticTone, string> = {
  primary: 'border-l-primary/70',
  info: 'border-l-info/70',
  success: 'border-l-success/70',
  warning: 'border-l-warning/70',
  destructive: 'border-l-destructive/70',
  muted: 'border-l-muted-foreground/45',
};

export function semanticToneSurfaceClass(tone: SemanticTone): string {
  return SEMANTIC_TONE_SURFACE_CLASS[tone];
}

export function semanticToneStatusClass(tone: SemanticTone): string {
  return SEMANTIC_TONE_STATUS_CLASS[tone];
}

export function semanticToneBorderClass(tone: SemanticTone): string {
  return SEMANTIC_TONE_BORDER_CLASS[tone];
}
