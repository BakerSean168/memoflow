/**
 * Shared Database Infrastructure Adapter
 *
 * NOTE: These exports are only available in the main process.
 * This file exists for structural completeness but should not be imported
 * from the renderer process.
 *
 * The actual database operations are done via:
 * - Main process: import from '../../main/database' directly
 * - Renderer process: use IPC calls to communicate with main process
 */

// Main-process only exports - import directly from main/database when needed
export const MAIN_PROCESS_ONLY = true;
