import { isReactive, reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import type { TaskPlanClientDTO } from '@memoflow/contracts/task';
import { mapTaskPlanDtoToViewModel } from './task-plan-presentation';

function taskPlan(overrides: Partial<TaskPlanClientDTO> = {}): TaskPlanClientDTO {
  return {
    id: 'ITaskPlanId_11111111-1111-4111-8111-111111111111' as TaskPlanClientDTO['id'],
    identityId: 'IdentityId_22222222-2222-4222-8222-222222222222' as TaskPlanClientDTO['identityId'],
    name: 'Reactive task',
    description: null,
    schedule: {
      kind: 'OneTime',
      date: '2026-09-10' as TaskPlanClientDTO['schedule'] extends { date: infer T } ? T : never,
      timing: { kind: 'AllDay' },
    },
    reminderConfig: null,
    importance: 'Moderate',
    goalBinding: null,
    labels: [],
    status: 'Active',
    outcome: 'Open',
    completionPolicy: 'AllOccurrences',
    closedAt: null,
    archivedAt: null,
    abandonedReason: null,
    lastGeneratedDate: null,
    generateAheadDays: null,
    version: 1,
    createdAt: 1 as TaskPlanClientDTO['createdAt'],
    updatedAt: 1 as TaskPlanClientDTO['updatedAt'],
    deletedAt: null,
    instanceCount: 0,
    completedInstanceCount: 0,
    pendingInstanceCount: 0,
    dueInstanceCount: 0,
    completedDueInstanceCount: 0,
    completionWindowDays: 30,
    futurePendingInstanceCount: 0,
    singleInstanceStatus: null,
    completionRate: 0,
    ...overrides,
  };
}

describe('mapTaskPlanDtoToViewModel', () => {
  it('materializes a canonical plain schedule from a reactive query DTO', () => {
    const dto = reactive(taskPlan());
    expect(isReactive(dto.schedule)).toBe(true);

    const vm = mapTaskPlanDtoToViewModel(dto, ((key: string) => key) as never);

    expect(vm.schedule).toEqual({
      kind: 'OneTime',
      date: '2026-09-10',
      timing: { kind: 'AllDay' },
    });
    expect(isReactive(vm.schedule)).toBe(false);
    expect(vm.schedule).not.toBe(dto.schedule);
  });
});
