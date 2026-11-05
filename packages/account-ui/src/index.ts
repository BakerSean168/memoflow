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
/**
 * Host boundary types only. The runtime host port (and the
 * `accountUiHost` singleton bound through it) lives in the `/host` entry so a
 * second bundled copy cannot diverge from the bound instance.
 */
export type { AccountUiHost, ProfileEditorIntent } from './account-ui-host';
