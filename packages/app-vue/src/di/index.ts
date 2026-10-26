/**
 * DI Barrel — re-exports all injection keys, types, and navigation defaults.
 *
 * @module di
 */
export * from './keys';
export type * from './types';
export { defaultModuleCapsules } from './navigation';

export { installGoalUiHost } from './goal-ui-host';
