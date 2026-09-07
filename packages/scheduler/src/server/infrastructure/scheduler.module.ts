import type { IScheduleExecutionRepository, IScheduleTaskRepository } from '../domain';
import {
  BatchDeleteScheduleTasksUseCase,
  BatchOperateScheduleTasksUseCase,
  CancelScheduleTaskUseCase,
  CompleteScheduleTaskUseCase,
  CreateScheduleTaskUseCase,
  DeleteScheduleTaskUseCase,
  GetDueScheduleTasksUseCase,
  ListScheduleTasksBySourceUseCase,
  PauseScheduleTaskUseCase,
  ResumeScheduleTaskUseCase,
  GetScheduleTaskUseCase,
  ListScheduleTasksByAccountUseCase,
  ListScheduleTasksByStatusUseCase,
  TriggerScheduleTaskUseCase,
  UpdateScheduleTaskUseCase,
  UpdateScheduleTaskMetadataUseCase,
} from '../application/use-cases';
import type { SchedulerApplicationPort } from '../application';
import { ScheduleTaskStatus, SourceModule } from '@memoflow/contracts/schedule';

export interface SchedulerModuleRuntimeContribution {
  start(): Promise<void> | void;
  stop(): Promise<void> | void;
}

export type SchedulerRuntimeContributionsInput =
  | SchedulerModuleRuntimeContribution
  | readonly SchedulerModuleRuntimeContribution[];

export interface SchedulerModuleDependencies {
  readonly scheduleTaskRepository: IScheduleTaskRepository;
  readonly scheduleExecutionRepository: IScheduleExecutionRepository;
  readonly runtimeContributions?: SchedulerRuntimeContributionsInput;
}

export interface SchedulerModuleUseCases {
  readonly createScheduleTask: CreateScheduleTaskUseCase;
  readonly updateScheduleTask: UpdateScheduleTaskUseCase;
  readonly deleteScheduleTask: DeleteScheduleTaskUseCase;
  readonly pauseScheduleTask: PauseScheduleTaskUseCase;
  readonly resumeScheduleTask: ResumeScheduleTaskUseCase;
  readonly triggerScheduleTask: TriggerScheduleTaskUseCase;
  readonly completeScheduleTask: CompleteScheduleTaskUseCase;
  readonly cancelScheduleTask: CancelScheduleTaskUseCase;
  readonly getScheduleTask: GetScheduleTaskUseCase;
  readonly getDueScheduleTasks: GetDueScheduleTasksUseCase;
  readonly listScheduleTasksByAccount: ListScheduleTasksByAccountUseCase;
  readonly listScheduleTasksBySource: ListScheduleTasksBySourceUseCase;
  readonly listScheduleTasksByStatus: ListScheduleTasksByStatusUseCase;
  readonly batchDeleteScheduleTasks: BatchDeleteScheduleTasksUseCase;
  readonly batchOperateScheduleTasks: BatchOperateScheduleTasksUseCase;
  readonly updateScheduleTaskMetadata: UpdateScheduleTaskMetadataUseCase;
}

export interface SchedulerModuleInstance {
  readonly scheduleTaskRepository: IScheduleTaskRepository;
  readonly scheduleExecutionRepository: IScheduleExecutionRepository;
  readonly useCases: SchedulerModuleUseCases;
  readonly api: SchedulerApplicationPort;
  start(): Promise<void>;
  dispose(): Promise<void>;
}

export function createSchedulerUseCases(
  dependencies: SchedulerModuleDependencies,
): SchedulerModuleUseCases {
  const { scheduleTaskRepository } = dependencies;
  const deleteScheduleTask = new DeleteScheduleTaskUseCase(scheduleTaskRepository);
  const pauseScheduleTask = new PauseScheduleTaskUseCase(scheduleTaskRepository);
  const resumeScheduleTask = new ResumeScheduleTaskUseCase(scheduleTaskRepository);
  const cancelScheduleTask = new CancelScheduleTaskUseCase(scheduleTaskRepository);
  const updateScheduleTask = new UpdateScheduleTaskUseCase(scheduleTaskRepository);

  return {
    createScheduleTask: new CreateScheduleTaskUseCase(scheduleTaskRepository),
    updateScheduleTask,
    deleteScheduleTask,
    pauseScheduleTask,
    resumeScheduleTask,
    triggerScheduleTask: new TriggerScheduleTaskUseCase(scheduleTaskRepository),
    completeScheduleTask: new CompleteScheduleTaskUseCase(scheduleTaskRepository),
    cancelScheduleTask,
    getScheduleTask: new GetScheduleTaskUseCase(scheduleTaskRepository),
    getDueScheduleTasks: new GetDueScheduleTasksUseCase(scheduleTaskRepository),
    listScheduleTasksByAccount: new ListScheduleTasksByAccountUseCase(scheduleTaskRepository),
    listScheduleTasksBySource: new ListScheduleTasksBySourceUseCase(scheduleTaskRepository),
    listScheduleTasksByStatus: new ListScheduleTasksByStatusUseCase(scheduleTaskRepository),
    batchDeleteScheduleTasks: new BatchDeleteScheduleTasksUseCase(deleteScheduleTask),
    batchOperateScheduleTasks: new BatchOperateScheduleTasksUseCase({
      pauseScheduleTask,
      resumeScheduleTask,
      cancelScheduleTask,
      updateScheduleTask,
    }),
    updateScheduleTaskMetadata: new UpdateScheduleTaskMetadataUseCase(scheduleTaskRepository),
  };
}

function normalizeRuntimeContributions(
  input?: SchedulerRuntimeContributionsInput,
): readonly SchedulerModuleRuntimeContribution[] {
  if (!input) return [];
  return Array.isArray(input) ? Array.from(input) : [input as SchedulerModuleRuntimeContribution];
}

export function createSchedulerModule(
  dependencies: SchedulerModuleDependencies,
): SchedulerModuleInstance {
  const useCases = createSchedulerUseCases(dependencies);
  const runtimeContributions = normalizeRuntimeContributions(dependencies.runtimeContributions);
  let started = false;
  const startedRuntimes: SchedulerModuleRuntimeContribution[] = [];

  const api: SchedulerApplicationPort = {
    listTasks: async (query, ctx) => {
      if (query.status) {
        return useCases.listScheduleTasksByStatus.execute(
          query.status as ScheduleTaskStatus,
          ctx.identityId,
        );
      }
      if (query.sourceModule && query.sourceEntityId) {
        return useCases.listScheduleTasksBySource.execute(
          query.sourceModule as SourceModule,
          query.sourceEntityId as string,
          ctx.identityId,
        );
      }
      return useCases.listScheduleTasksByAccount.execute(ctx.identityId);
    },
    getTask: async (id, ctx) => useCases.getScheduleTask.execute(id, ctx.identityId),
    getDueTasks: async () => useCases.getDueScheduleTasks.execute(),
  };

  return {
    scheduleTaskRepository: dependencies.scheduleTaskRepository,
    scheduleExecutionRepository: dependencies.scheduleExecutionRepository,
    useCases,
    api,
    async start() {
      if (started) return;
      try {
        for (const runtime of runtimeContributions) {
          await runtime.start();
          startedRuntimes.push(runtime);
        }
      } catch (error) {
        for (const runtime of [...startedRuntimes].reverse()) await runtime.stop();
        startedRuntimes.length = 0;
        throw error;
      }
      started = true;
    },
    async dispose() {
      if (!started) return;
      for (const runtime of [...startedRuntimes].reverse()) await runtime.stop();
      startedRuntimes.length = 0;
      started = false;
    },
  };
}
