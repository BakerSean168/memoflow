/**
 * Task Application Module (Client)
 *
 * Constructor-injected application service for task management.
 * Uses Result<T> pattern for consistent error handling.
 */

// ===== Port Interfaces =====
export type { ITaskPlanApiClient, TaskPlanListParams } from './ports/task-plan-api-client.port';
export type { ITaskOccurrenceApiClient } from './ports/task-occurrence-api-client.port';
export type { TaskClientPort } from './task-client.port';

// ===== Client Service =====
export { TaskClientService, createTaskClientService } from './task-client-service';
export { createTaskServiceFromHttpClient } from './task-http-service-factory';
