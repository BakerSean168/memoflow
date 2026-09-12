/**
 * Goal Application Module (Client)
 *
 * Constructor-injected application service for goal management.
 * Uses Result<T> pattern for consistent error handling.
 */

// ===== Port Interfaces =====
export type { IGoalApiClient } from './ports/goal-api-client.port';

// ===== Constructor-Injected Service (Result-based) =====
export { GoalClientService, createGoalClientService } from './goal-client-service';
export type { GoalClientPort } from './goal-client-service';
export { createGoalServiceFromHttpClient } from './goal-http-service-factory';
