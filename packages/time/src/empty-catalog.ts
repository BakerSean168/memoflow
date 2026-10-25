/**
 * Time empty-label catalog (ADR-037 P1).
 * Empty is product copy, not a second Format implementation.
 * L5 passes resolved strings (or kinds via app helpers) into Style.empty overrides.
 */

export type TimeEmptyKind = 'emdash' | 'dash' | 'notSet' | 'na' | 'unknown' | 'blank';

/** Default literal table (EN / neutral). Apps may override via resolveEmptyLabel options. */
export const DEFAULT_EMPTY_LITERALS: Readonly<Record<TimeEmptyKind, string>> = Object.freeze({
  emdash: '—',
  dash: '-',
  notSet: 'Not set',
  na: 'N/A',
  unknown: 'Unknown',
  blank: '',
});

export interface ResolveEmptyLabelOptions {
  /** Override literals for any kind (e.g. i18n). */
  literals?: Partial<Record<TimeEmptyKind, string>>;
  /**
   * Optional translator for kinds that prefer i18n keys.
   * When provided, `notSet` / `unknown` prefer these over literals if returned non-empty.
   */
  translate?: (kind: TimeEmptyKind) => string | undefined;
}

/**
 * Resolve a catalog kind to the display string used as Style.empty.display / EmptyLabel.
 */
export function resolveEmptyLabel(kind: TimeEmptyKind, options?: ResolveEmptyLabelOptions): string {
  const fromT = options?.translate?.(kind);
  if (fromT != null && fromT !== '') {
    return fromT;
  }
  if (options?.literals?.[kind] != null) {
    return options.literals[kind]!;
  }
  return DEFAULT_EMPTY_LITERALS[kind];
}

export function isTimeEmptyKind(value: unknown): value is TimeEmptyKind {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(DEFAULT_EMPTY_LITERALS, value)
  );
}
