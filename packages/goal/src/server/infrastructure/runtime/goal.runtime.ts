/**
 * Goal runtime contributions for server transports.
 * 目标模块服务端传输层的运行时贡献。
 *
 * This file keeps side effects explicit and reversible.
 * Instead of globally registering initialization tasks, the goal module
 * now owns its event subscriptions through a small runtime object.
 *
 * 这个文件让副作用显式且可逆。
 * 目标模块不再通过全局初始化任务注册监听器，而是通过一个轻量的
 * runtime 对象管理自身事件订阅生命周期。
 *
 * Replaces: `api/initialization.ts` (registerGoalInitializationTasks)
 * 替代: `api/initialization.ts` (registerGoalInitializationTasks)
 */

import { createLogger } from '@memoflow/utils/logger';
import type { GoalModuleRuntimeContribution } from '../goal.module';

const logger = createLogger('GoalRuntime');

/**
 * Runtime contribution contract used by module transports.
 * 模块传输层使用的运行时贡献契约。
 */
/**
 * Creates an instance-owned runtime contribution.
 * 创建实例级 runtime 贡献对象。
 *
 * Current behavior is logging-only (same as the old initialization.ts).
 * Future event handlers (e.g. task-completion → goal-progress) can be added
 * here using the shared eventBus.on/off lifecycle pattern.
 *
 * 当前行为仅做日志记录（与旧 initialization.ts 相同）。
 * 未来的事件处理器（如任务完成 → 目标进度）可以按照同一 runtime lifecycle 模式
 * 在这里使用 eventBus.on/off 添加。
 */
export function createGoalRuntimeContribution(): GoalModuleRuntimeContribution {
  let started = false;

  return {
    start(): void {
      if (started) {
        return;
      }

      // Future: subscribe to domain events here
      // 未来: 在这里订阅领域事件

      started = true;
      logger.info('[Goal] Runtime contribution started');
    },

    stop(): void {
      if (!started) {
        return;
      }

      // Future: unsubscribe from domain events here
      // 未来: 在这里取消领域事件订阅

      started = false;
      logger.info('[Goal] Runtime contribution stopped');
    },
  };
}
