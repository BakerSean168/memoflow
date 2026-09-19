import type { GoalScheduleProjectionEventMap } from '@memoflow/goal/schedule-projection';
import { GOAL_SCHEDULING_OWNER_TYPE } from '@memoflow/goal/schedule-projection';
import type { RoutineScheduleProjectionEventMap } from '@memoflow/reminder/schedule-projection/routine';
import { ROUTINE_SCHEDULING_OWNER_TYPE } from '@memoflow/reminder/schedule-projection/routine';
import type { TaskScheduleProjectionEventMap } from '@memoflow/task/schedule-projection';
import { TASK_SCHEDULING_OWNER_TYPE } from '@memoflow/task/schedule-projection';
import {
  createTypedEventPublisher,
  createTypedEventSubscriber,
  eventBus,
} from '@memoflow/utils/domain';
import {
  ScheduledHandlerRegistry,
  createScheduledInvocationSchedulingPort,
} from '@memoflow/scheduler';
import {
  createRoutineWallClockExecutionSource,
  createRoutineWallClockScheduledHandler,
} from '@memoflow/reminder/schedule-execution/routine';
import type {
  CreateScheduleOrchestrationModuleOptions,
  ScheduleOrchestrationModule,
} from '../ports/projection';
import {
  defineProjectionRepairLane,
  type ProjectionRepairLane,
} from '../runtime/projection-repair-runtime';
import { createCompositeRuntimeContribution } from '../runtime/composite-runtime';
import { createGoalProjectionRuntime } from '../runtime/goal-projection-runtime';
import { createProjectionRepairRuntime } from '../runtime/projection-repair-runtime';
import { createRoutineProjectionRuntime } from '../runtime/routine-projection-runtime';
import { createTaskProjectionRuntime } from '../runtime/task-projection-runtime';
import { createRoutineOverrideChangedPublishingStore } from './routine-override-changing-store';

/**
 * System scheduling composition after R4-2201C.
 *
 * Legacy Reminder projection/execution is deliberately absent. Task,
 * Goal and canonical Routine are the only scheduled owner lanes.
 */
export function createScheduleOrchestrationModule(
  options: CreateScheduleOrchestrationModuleOptions,
): ScheduleOrchestrationModule {
  const invocationRepository = options.scheduler.invocationRepository;
  const schedulingPort = createScheduledInvocationSchedulingPort(invocationRepository);
  const handlerRegistry = new ScheduledHandlerRegistry();

  const incrementalRuntimes = [
    createTaskProjectionRuntime({
      source: options.taskProjection.source,
      schedulingPort,
      taskEvents: createTypedEventSubscriber<TaskScheduleProjectionEventMap>(eventBus),
    }),
    createGoalProjectionRuntime({
      source: options.goalProjection.source,
      schedulingPort,
      goalEvents: createTypedEventSubscriber<GoalScheduleProjectionEventMap>(eventBus),
    }),
  ];

  const repairLanes: ProjectionRepairLane[] = [
    defineProjectionRepairLane<{ planId: string; identityId: string }>({
      source: 'task',
      enumerate: () => options.taskProjection.source.listPlanRefs(),
      describe: (ref) => `${ref.identityId}/${ref.planId}`,
      repair: async (ref) => {
        const plan = await options.taskProjection.source.buildPlanProjection(
          ref.planId,
          ref.identityId,
        );
        return schedulingPort.reconcile(plan.owner, plan.desired);
      },
      buildOwner: (ref) => options.taskProjection.source.buildPlanOwner(ref.planId, ref.identityId),
      listSchedulerOwners: () =>
        invocationRepository.listOwnersByType(TASK_SCHEDULING_OWNER_TYPE),
      removeOwner: (owner) => schedulingPort.removeOwner(owner),
      describeOwner: (owner) => `${owner.identityId}/${owner.id}`,
    }),
    defineProjectionRepairLane<{ goalId: string; identityId: string }>({
      source: 'goal',
      enumerate: () => options.goalProjection.source.listGoalRefs(),
      describe: (ref) => `${ref.identityId}/${ref.goalId}`,
      repair: async (ref) => {
        const plan = await options.goalProjection.source.buildGoalPlan(ref.goalId, ref.identityId);
        return schedulingPort.reconcile(plan.owner, plan.desired);
      },
      buildOwner: (ref) => options.goalProjection.source.buildGoalOwner(ref.goalId, ref.identityId),
      listSchedulerOwners: () =>
        invocationRepository.listOwnersByType(GOAL_SCHEDULING_OWNER_TYPE),
      removeOwner: (owner) => schedulingPort.removeOwner(owner),
      describeOwner: (owner) => `${owner.identityId}/${owner.id}`,
    }),
  ];

  const routineProjection = options.routineProjection;
  const routineSource = options.execution.routineSource;
  if (routineProjection && routineSource) {
    const routineCommittedPublisher =
      createTypedEventPublisher<RoutineScheduleProjectionEventMap>(eventBus);
    const routineExecutionSource = createRoutineWallClockExecutionSource({
      ...routineSource,
      publishOccurrenceCommitted: (event) => {
        routineCommittedPublisher.send('routine:occurrence-committed', event);
      },
    });
    handlerRegistry.register(
      createRoutineWallClockScheduledHandler({ executionSource: routineExecutionSource }),
    );
    incrementalRuntimes.push(
      createRoutineProjectionRuntime({
        source: routineProjection.source,
        schedulingPort,
        routineEvents: createTypedEventSubscriber<RoutineScheduleProjectionEventMap>(eventBus),
      }),
    );
    repairLanes.push(
      defineProjectionRepairLane<{ routineId: string; identityId: string }>({
        source: 'routine',
        enumerate: () => routineProjection.source.listRoutineRefs(),
        describe: (ref) => `${ref.identityId}/${ref.routineId}`,
        repair: async (ref) => {
          const plan = await routineProjection.source.buildRoutinePlan(
            ref.routineId,
            ref.identityId,
          );
          return schedulingPort.reconcile(plan.owner, plan.desired);
        },
        buildOwner: (ref) =>
          routineProjection.source.buildRoutineOwner(ref.routineId, ref.identityId),
        listSchedulerOwners: () =>
          invocationRepository.listOwnersByType(ROUTINE_SCHEDULING_OWNER_TYPE),
        removeOwner: (owner) => schedulingPort.removeOwner(owner),
        describeOwner: (owner) => `${owner.identityId}/${owner.id}`,
      }),
    );
  }

  const projectionRepairRuntime = createProjectionRepairRuntime(repairLanes);
  const runtimeContributions = [...incrementalRuntimes, projectionRepairRuntime];

  const routineOverridePublisher =
    createTypedEventPublisher<RoutineScheduleProjectionEventMap>(eventBus);
  const routineOverrideStore = options.routineOverrideStore
    ? createRoutineOverrideChangedPublishingStore({
        store: options.routineOverrideStore,
        publish: (event) => {
          routineOverridePublisher.send('routine:override-changed', event);
        },
      })
    : undefined;

  return {
    projectionRuntime: createCompositeRuntimeContribution(runtimeContributions),
    projectionRepairMetrics: projectionRepairRuntime.metrics,
    schedulingPort,
    handlerRegistry,
    ...(routineOverrideStore ? { routineOverrideStore } : {}),
  };
}
