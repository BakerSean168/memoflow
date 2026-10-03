import { isReactive, reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import type { TaskPlanClientDTO } from '@memoflow/contracts/task';
import { mapTaskPlanDtoToViewModel } from './task-plan-presentation';

function taskPlan(overrides: Partial<TaskPlanClientDTO> = {}): TaskPlanClientDTO {
  return {
    id: 'ITaskPlanId_11111111-1111-4111-8111-111111111111' as TaskPlanClientDTO['id'],
    identityId:
      'IdentityId_22222222-2222-4222-8222-222222222222' as TaskPlanClientDTO['identityId'],
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
    checklist: [],
    labels: [],
    status: 'Active',
    outcome: 'Open',
    completionPolicy: 'AllOccurrences',
    closedAt: null,
    archivedAt: null,
    abandonedReason: null,
    version: 1,
    createdAt: 1 as TaskPlanClientDTO['createdAt'],
    updatedAt: 1 as TaskPlanClientDTO['updatedAt'],
    deletedAt: null,
    occurrenceCount: 0,
    completedOccurrenceCount: 0,
    pendingOccurrenceCount: 0,
    dueOccurrenceCount: 0,
    completedDueOccurrenceCount: 0,
    completionWindowDays: 30,
    futurePendingOccurrenceCount: 0,
    singleOccurrenceStatus: null,
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

  it.each([
    ['Succeeded', 'task.templateCard.outcomeSucceeded'],
    ['Failed', 'task.templateCard.outcomeFailed'],
    ['Abandoned', 'task.templateCard.outcomeAbandoned'],
  ] as const)('presents closed outcome %s independently from lifecycle Closed', (outcome, key) => {
    const vm = mapTaskPlanDtoToViewModel(
      taskPlan({ status: 'Closed', outcome, closedAt: 2 }),
      ((value: string) => value) as never,
    );

    expect(vm.statusText).toBe('task.templateCard.statusClosed');
    expect(vm.outcome).toBe(outcome);
    expect(vm.outcomeText).toBe(key);
    expect(vm.stateText).toBe(key);
    expect(vm.isClosed).toBe(true);
  });

  it('keeps archive visibility metadata independent from lifecycle/outcome presentation', () => {
    const vm = mapTaskPlanDtoToViewModel(
      taskPlan({ status: 'Active', outcome: 'Open', archivedAt: 3 }),
      ((value: string) => value) as never,
    );

    expect(vm.stateText).toBe('task.templateCard.statusActive');
    expect(vm.isArchived).toBe(true);
    expect(vm.isClosed).toBe(false);
  });
});
