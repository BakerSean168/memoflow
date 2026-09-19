export const AccountStatus = {
  Active: 'Active',
  Closed: 'Closed',
} as const;

export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];
