export const ImportanceLevel = {
  Vital: 'Vital',
  Important: 'Important',
  Moderate: 'Moderate',
  Minor: 'Minor',
  Trivial: 'Trivial',
} as const;
export type ImportanceLevel = (typeof ImportanceLevel)[keyof typeof ImportanceLevel];
