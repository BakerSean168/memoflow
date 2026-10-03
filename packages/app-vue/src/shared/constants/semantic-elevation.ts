export type SemanticElevation = 'inset' | 'raised' | 'floating' | 'floating-interactive';

const SEMANTIC_ELEVATION_CLASS: Record<SemanticElevation, string> = {
  inset: 'shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.52)]',
  raised:
    'shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.52),inset_0_1px_0_hsl(var(--foreground)/0.025)]',
  floating:
    'shadow-[0_16px_40px_-24px_hsl(var(--foreground)/0.42),inset_0_1px_0_hsl(var(--foreground)/0.03)]',
  'floating-interactive':
    'shadow-[0_18px_46px_-24px_hsl(var(--foreground)/0.42),inset_0_1px_0_hsl(var(--foreground)/0.03)] hover:shadow-[0_20px_50px_-24px_hsl(var(--foreground)/0.46),inset_0_1px_0_hsl(var(--foreground)/0.03)]',
};

export function semanticElevationClass(elevation: SemanticElevation): string {
  return SEMANTIC_ELEVATION_CLASS[elevation];
}
