/**
 * Shared Infrastructure Index
 *
 * Aggregates all infrastructure exports (database, DI, etc.)
 *
 * NOTE: Database and Container exports are only available in the main process.
 * Renderer process should use IPC calls.
 */

export { MAIN_PROCESS_ONLY as DB_MAIN_PROCESS_ONLY } from './database';
export { MAIN_PROCESS_ONLY as DI_MAIN_PROCESS_ONLY } from './containers';
