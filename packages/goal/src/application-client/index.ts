/**
 * Goal Application Module (Client)
 *
 * Constructor-injected application service for goal management.
 * Uses Result<T> pattern for consistent error handling.
 */

// ===== Port Interfaces =====
export type { IGoalApiClient } from './ports/goal-api-client.port';

// ===== Data & Rules =====
export {
  BUILT_IN_TEMPLATES,
  getTemplatesByCategory,
  getTemplatesByRole,
  getTemplatesByIndustry,
  getTemplateById,
} from './goal-templates';

export type { GoalTemplate, KeyResultTemplate } from './goal-templates';

// ===== Constructor-Injected Service (Result-based) =====
export { GoalClientService, createGoalClientService } from './goal-client-service';
export type { GoalClientPort } from './goal-client-service';
export { createGoalServiceFromHttpClient } from './goal-http-service-factory';
