import {
  AccountStatus as AccountStatusContract,
  type AccountStatus as IAccountStatus,
} from '@memoflow/contracts/account';

export type AccountStatus = IAccountStatus & { readonly __brand: unique symbol };

const VALUES: IAccountStatus[] = Object.values(AccountStatusContract);

export const AccountStatus = {
  Active: 'Active' as AccountStatus,
  Closed: 'Closed' as AccountStatus,

  of(value: string): AccountStatus {
    if (!this.isValid(value)) {
      throw new Error(`Invalid account status: ${value}`);
    }
    return value;
  },

  isValid(value: string): value is AccountStatus {
    return VALUES.includes(value as IAccountStatus);
  },

  getAll(): AccountStatus[] {
    return VALUES as AccountStatus[];
  },

  isActive(status: AccountStatus): boolean {
    return status === this.Active;
  },

  isClosed(status: AccountStatus): boolean {
    return status === this.Closed;
  },

  canLogin(status: AccountStatus): boolean {
    return status === this.Active;
  },
};
