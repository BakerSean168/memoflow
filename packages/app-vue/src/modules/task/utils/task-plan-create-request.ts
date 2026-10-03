import {
  CreateTaskPlanSchema,
  TaskGoalProgressConfigurationSchema,
  type CreateTaskPlanReq,
} from '@memoflow/contracts/task';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import type { TaskPlanViewModel } from '../components/types';
import { toTaskPlanSchedulePayload } from './task-plan-presentation';

/** Full-create owner boundary, shared by native validation and the owner command callback. */
export function buildTaskPlanCreateRequest(
  vm: TaskPlanViewModel,
  id?: CreateTaskPlanReq['id'],
): CreateTaskPlanReq {
  return CreateTaskPlanSchema.parse({
    ...(id ? { id } : {}),
    name: vm.title,
    description: vm.description ?? null,
    schedule: toTaskPlanSchedulePayload(vm),
    reminderConfig: vm.reminderConfig ?? null,
    importance: vm.importance ?? ImportanceLevel.Moderate,
    labelIds: vm.labelIds ?? vm.labels?.map((label) => label.id) ?? [],
    goalBinding: vm.goalBinding?.goalId
      ? {
          goalId: vm.goalBinding.goalId,
          keyResultId: vm.goalBinding.keyResultId ?? null,
          progressRule: vm.goalBinding.keyResultId
            ? TaskGoalProgressConfigurationSchema.parse(vm.goalBinding).progressRule
            : null,
        }
      : null,
    checklist: vm.checklist,
  });
}
