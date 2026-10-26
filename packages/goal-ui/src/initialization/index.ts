/**
 * Goal module startup hook
 *
 * Replaces the old `registerGoalInitializationTasks()` pattern.
 * Each runtime (web, desktop renderer) explicitly calls this during startup.
 */

import { createLogger } from '@memoflow/utils/logger';
import { useGoalStore } from '../stores/goal-store';

const logger = createLogger('goal:init');

/**
 * Creates a startup hook for the goal module.
 * Call this in the runtime composition root, not via global InitializationManager.
 */
export function createGoalStartupHook(): { start(): void; stop(): void } {
  let started = false;

  return {
    start() {
      if (started) return;
      started = true;

      // Goal module loads lazily through composables — no eager init needed.
      // Future: subscribe to domain events (e.g. task-completion → goal-progress) here.

      logger.info('Goal module initialized');
    },

    stop() {
      if (!started) return;
      started = false;

      try {
        const store = useGoalStore();
        store.$reset();
        logger.info('Goal module data cleaned up');
      } catch {
        // Store may not be initialized yet
      }
    },
  };
}
