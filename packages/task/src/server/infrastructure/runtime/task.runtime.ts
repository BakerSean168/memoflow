/**
 * Task runtime contributions for server transports.
 * 任务模块服务端传输层的运行时贡献。
 *
 * This file keeps side effects explicit and reversible.
 * Instead of globally registering initialization tasks with InitializationManager,
 * the task module now owns its event subscriptions through a small runtime object.
 *
 * 这个文件让副作用显式且可逆。
 * 任务模块不再通过全局 InitializationManager 注册监听器，而是通过一个轻量的
 * runtime 对象管理自身事件订阅生命周期。
 */

import { eventBus } from '@memoflow/utils/domain';
import { createTypedEventSubscriber } from '@memoflow/utils/domain';
import { createLogger } from '@memoflow/utils/logger';
import type { TaskEventMap } from '@memoflow/contracts/task';
import type { TaskModuleRuntimeContribution } from '../task.module';

const logger = createLogger('TaskRuntime');

type TaskRuntimeEventMap = Pick<
  TaskEventMap,
  | 'task:instance-generated'
  | 'task:instance-completed'
  | 'task:instance-skipped'
  | 'task:instance-deleted'
>;

const taskEvents = createTypedEventSubscriber<TaskRuntimeEventMap>(eventBus);

/**
 * Runtime contribution contract used by module transports.
 * 模块传输层使用的运行时贡献契约。
 */
const taskEventHandlers = {
  'task:instance-generated': (event) => {
    logger.info(`[Task] Instances generated for template: ${event.templateId}`, {
      templateId: event.templateId,
      instanceCount: event.instanceCount,
      strategy: event.strategy,
    });
  },
  'task:instance-completed': (event) => {
    logger.info(`[Task] Instance completed: ${event.taskOccurrenceId}`);
  },
  'task:instance-skipped': (event) => {
    logger.info(`[Task] Instance skipped: ${event.taskOccurrenceId}`);
  },
  'task:instance-deleted': (event) => {
    logger.info(`[Task] Instance deleted: ${event.taskOccurrenceId}`);
  },
} satisfies {
  [K in keyof TaskRuntimeEventMap]: (event: TaskRuntimeEventMap[K]) => void;
};

/**
 * Creates an instance-owned runtime contribution.
 * 创建实例级 runtime 贡献对象。
 *
 * Replaces the old global initialization pattern with an explicit start/stop lifecycle.
 *
 * 替代旧的全局初始化方式，使用显式的 start/stop 生命周期。
 */
export function createTaskRuntimeContribution(): TaskModuleRuntimeContribution {
  let started = false;

  return {
    async start(): Promise<void> {
      if (started) {
        return;
      }

      taskEvents.on('task:instance-generated', taskEventHandlers['task:instance-generated']);
      taskEvents.on('task:instance-completed', taskEventHandlers['task:instance-completed']);
      taskEvents.on('task:instance-skipped', taskEventHandlers['task:instance-skipped']);
      taskEvents.on('task:instance-deleted', taskEventHandlers['task:instance-deleted']);

      started = true;
      logger.info('[Task] Runtime contribution started');
    },

    async stop(): Promise<void> {
      if (!started) {
        return;
      }

      taskEvents.off('task:instance-generated', taskEventHandlers['task:instance-generated']);
      taskEvents.off('task:instance-completed', taskEventHandlers['task:instance-completed']);
      taskEvents.off('task:instance-skipped', taskEventHandlers['task:instance-skipped']);
      taskEvents.off('task:instance-deleted', taskEventHandlers['task:instance-deleted']);

      started = false;
      logger.info('[Task] Runtime contribution stopped');
    },
  };
}
