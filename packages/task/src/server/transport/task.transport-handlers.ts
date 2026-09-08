/**
 * Task transport handler mapping.
 * 任务模块传输层处理器映射。
 *
 * This file converts the module facade into the function signatures required by
 * controllers. It is shared by HTTP and Electron transports so the mapping is
 * defined once.
 *
 * 这个文件把模块门面转换成控制器所需的函数签名。
 * HTTP 和 Electron 共用这一层，避免重复定义同样的 handler 映射。
 */

import type { TaskApplicationPort } from '../application';
import type { TaskOccurrenceUseCases } from './task-occurrence.controller';
import type { TaskPlanUseCases } from './task-plan.controller';

/**
 * All controller use-case interfaces grouped together.
 * 所有控制器用例接口的统一分组。
 */
export interface TaskTransportHandlers {
  readonly template: TaskPlanUseCases;
  readonly instance: TaskOccurrenceUseCases;
}

/**
 * Creates transport handlers from the module application port.
 * 从模块应用端口创建传输层处理器。
 *
 * This is intentionally boring — it maps the flat module API to the
 * controller-specific use-case interfaces.
 *
 * 这层映射故意做得"无聊" — 把扁平的模块 API 映射到控制器专用的用例接口。
 */
export function createTaskTransportHandlers(api: TaskApplicationPort): TaskTransportHandlers {
  return {
    template: {
      createTemplate: api.createTaskPlan,
      getTemplate: api.getTaskPlan,
      listTemplates: api.listTaskPlans,
      updateTemplate: api.updateTaskPlan,
      deleteTemplate: api.deleteTaskPlan,
      activateTemplate: api.activateTaskPlan,
      pauseTemplate: api.pauseTaskPlan,
      archiveTemplate: api.archiveTaskPlan,
      abandonPlan: api.abandonTaskPlan,
      generateInstances: api.generateTaskOccurrences,
      bindToGoal: api.bindTaskToGoal,
      unbindFromGoal: api.unbindTaskFromGoal,
      listInstancesByTemplate: api.listTaskOccurrencesByTemplate,
    },
    instance: {
      getTaskOccurrence: api.getTaskOccurrence,
      listByAccount: api.listTaskOccurrencesByAccount,
      listByTemplate: api.listTaskOccurrencesByTemplate,
      listByStatus: api.listTaskOccurrencesByStatus,
      getByDateRange: api.getTaskOccurrencesByDateRange,
      complete: api.completeTaskOccurrence,
      uncomplete: api.uncompleteTaskOccurrence,
      skip: api.skipTaskOccurrence,
      markMissed: api.markTaskOccurrenceMissed,
      start: api.startTaskOccurrence,
      deleteInstance: api.deleteTaskOccurrence,
      reschedule: api.rescheduleTaskOccurrence,
    },
  };
}
