/**
 * MSW Handlers - Aggregated Export
 *
 * Combine all module handlers in one array for use with `setupWorker`.
 *
 * @example
 * ```ts
 * import { handlers } from './handlers';
 * const worker = setupWorker(...handlers);
 * ```
 */

import { goalHandlers } from './goal.handlers';
import { accountHandlers } from './account.handlers';
import { taskHandlers } from './task.handlers';
import { scheduleHandlers } from './schedule.handlers';
import { notificationHandlers } from './notification.handlers';
import { repositoryHandlers } from './repository.handlers';
import { settingHandlers } from './setting.handlers';
import { powersyncHandlers } from './powersync.handlers';

export const handlers = [
  ...goalHandlers,
  ...accountHandlers,
  ...taskHandlers,
  ...scheduleHandlers,
  ...notificationHandlers,
  ...repositoryHandlers,
  ...settingHandlers,
  ...powersyncHandlers,
];
