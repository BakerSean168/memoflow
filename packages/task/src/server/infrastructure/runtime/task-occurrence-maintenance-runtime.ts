/**
 * TaskOccurrenceMaintenanceRuntime — 显式实例补充 worker（R2-3）。
 *
 * 原 P1-01：ListTaskPlansUseCase 在查询路径 fire-and-forget 补充实例
 * （列表查询产生写库副作用、并发打开列表重复生成）。本 worker 把补充
 * 逻辑移到显式定时任务：周期性对「需要生成到 horizon」的 Active 模板
 * 生成实例，列表查询保持纯读。
 */

import { createLogger } from '@memoflow/utils/logger';
import { TASK_INSTANCE_GENERATION_CONFIG } from '@memoflow/contracts/task';
import type { ITaskOccurrenceRepository, ITaskPlanRepository } from '../../domain/repositories';
import type { TaskModuleRuntimeContribution } from '../task.module';
import { TaskOccurrenceGenerationService } from '../../domain/services';
import { createTimeContext, createTimeFacade, type UserTimeContextPort } from '@memoflow/time';

const { TARGET_GENERATE_AHEAD_DAYS } = TASK_INSTANCE_GENERATION_CONFIG;

const DEFAULT_REFILL_INTERVAL_MS = 5 * 60 * 1000;

// Repository filtering is only a deterministic candidate superset. The actual
// generation horizon is calculated below in each identity's Product Time context.
const CANDIDATE_SCAN_TIME = createTimeFacade({
  context: createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
});

const logger = createLogger('TaskOccurrenceMaintenanceRuntime');

export interface TaskOccurrenceMaintenanceRuntimeDeps {
  readonly taskPlanRepository: ITaskPlanRepository;
  readonly taskOccurrenceRepository: ITaskOccurrenceRepository;
  readonly userTimeContextPort: UserTimeContextPort;
  /** 补充周期（默认 5 分钟）。 */
  readonly intervalMs?: number;
  /** 时间源（测试注入）。 */
  readonly now?: () => number;
  /** 生成服务（测试注入；默认新建）。 */
  readonly generationService?: TaskOccurrenceGenerationService;
}

export function createTaskOccurrenceMaintenanceRuntime(
  deps: TaskOccurrenceMaintenanceRuntimeDeps,
): TaskModuleRuntimeContribution {
  const generationService =
    deps.generationService ?? new TaskOccurrenceGenerationService();
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  async function refillPass(): Promise<void> {
    if (running) {
      return;
    }
    running = true;
    try {
      const now = (deps.now ?? Date.now)();
      const candidateHorizon = Number(
        CANDIDATE_SCAN_TIME.calendar.addDays(now, TARGET_GENERATE_AHEAD_DAYS + 1),
      );
      const templates = await deps.taskPlanRepository.findNeedGenerateInstances(candidateHorizon);

      for (const template of templates) {
        const timeContext = await deps.userTimeContextPort.getUserTimeContext(
          String(template.identityId),
        );
        const targetDate = Number(
          createTimeFacade({ context: timeContext }).calendar.addDays(
            now,
            TARGET_GENERATE_AHEAD_DAYS,
          ),
        );
        const instances = generationService.generateInstances(template, timeContext, {
          now,
          targetDate,
        });
        if (instances.length > 0) {
          await deps.taskOccurrenceRepository.saveMany(instances);
          await deps.taskPlanRepository.save(template);
        }
      }

      if (templates.length > 0) {
        logger.info(`[TaskMaintenance] Refill pass complete (${templates.length} templates)`);
      }
    } catch (error) {
      logger.error('[TaskMaintenance] Refill pass failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  }

  return {
    async start(): Promise<void> {
      if (timer) {
        return;
      }
      // 启动即对账：等待首轮 refill 完成再返回，宿主 start() 完成后
      // 维护已生效（避免"started 但补充还没跑"的窗口）。
      await refillPass();
      timer = setInterval(() => void refillPass(), deps.intervalMs ?? DEFAULT_REFILL_INTERVAL_MS);
      timer.unref?.();
    },

    async stop(): Promise<void> {
      if (!timer) {
        return;
      }
      clearInterval(timer);
      timer = null;
    },
  };
}
