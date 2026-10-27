/**
 * DI Barrel — re-exports all injection keys, types, and navigation defaults.
 *
 * @module di
 */
export * from './keys';
export type * from './types';
export { defaultModuleCapsules } from './navigation';

export { installAccountUiHost } from './account-ui-host';
export { installGoalUiHost } from './goal-ui-host';
export { installTaskUiHost } from './task-ui-host';
export { installNotificationUiHost } from './notification-ui-host';
export { installSettingUiHost } from './setting-ui-host';
export { installRepositoryUiHost } from './repository-ui-host';
export { installRoutineUiHost } from './routine-ui-host';

export { installAiUiHost } from './ai-ui-host';
