export interface ResponsiveSegmentedFilterOption {
  readonly value: string;
  readonly label: string;
  readonly count?: number;
  readonly countTestId?: string;
  readonly itemTestId?: string;
  readonly disabled?: boolean;
}
