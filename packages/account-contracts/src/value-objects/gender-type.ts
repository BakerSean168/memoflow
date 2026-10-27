export const GenderType = {
  Male: 'Male',
  Female: 'Female',
  Other: 'Other',
  PreferNotToSay: 'PreferNotToSay',
} as const;

export type GenderType = (typeof GenderType)[keyof typeof GenderType];
