/**
 * DI Barrel — re-exports all injection keys, types, and navigation defaults.
 *
 * @module di
 */
export * from './keys';
export type * from './types';
export { defaultModuleCapsules } from './navigation';

export { installGoalUiHost } from './goal-ui-host';
export { installNotificationUiHost } from './notification-ui-host';
export { installSettingUiHost } from './setting-ui-host';
export { installRoutineUiHost } from './routine-ui-host';
