/**
 * Account UI - public surface
 *
 * Owns the Account and Authentication render surfaces extracted from app-vue.
 * Every host capability is reached through `account-ui-host`; the package never
 * imports the host application.
 *
 * @module @memoflow/account-ui
 */

export * from './account';
export * from './authentication';
export type { AccountUiHost } from './account-ui-host';
