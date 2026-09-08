import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** TASK-2203: Task is Action + Execution, not a project-management graph. */
describe('Task vNext simplified domain surface', () => {
  const taskSrc = resolve(__dirname, '../..');
  const taskRoot = resolve(taskSrc, '..');
  const contractsTask = resolve(taskRoot, '../contracts/src/modules/task');
  const template = readFileSync(resolve(__dirname, 'aggregates/task-plan.ts'), 'utf8');
  const templateState = readFileSync(resolve(__dirname, 'aggregates/task-plan.state.ts'), 'utf8');
  const module = readFileSync(resolve(taskSrc, 'server/infrastructure/task.module.ts'), 'utf8');
  const rpcMap = readFileSync(resolve(contractsTask, 'protocol/task-rpc-map.ts'), 'utf8');
  const templateContract = readFileSync(resolve(contractsTask, 'api/task-plan.dto.ts'), 'utf8');

  it('retires folder, hierarchy, dependency graph, and dynamic-priority domain artifacts', () => {
    for (const path of [
      'aggregates/task-dependency.ts',
      'repositories/i-task-dependency-repository.ts',
      'repositories/i-task-folder-repository.ts',
      'services/task-dependency-policy.ts',
      'services/priority-calculator.service.ts',
      'value-objects/task-dependency-id.ts',
      'value-objects/task-folder-id.ts',
      'value-objects/subtask-id.ts',
    ]) {
      expect(existsSync(resolve(__dirname, path))).toBe(false);
    }
    expect(template).not.toMatch(
      /getPriority\(|getPriorityScore|addSubtask|parentTaskId|markAsBlocked|dependencyStatus|blockingReason/,
    );
    expect(templateState).not.toMatch(
      /folderId|parentTaskId|dependencyStatus|isBlocked|blockingReason/,
    );
  });

  it('retires project-management application and transport surfaces', () => {
    expect(module).not.toMatch(/TaskDependency|TaskFolder|TaskPlanGraph|ByPriority/);
    expect(rpcMap).not.toMatch(/template:graph|dependency:/);
    expect(templateContract).not.toMatch(/folderId|parentTaskId|QueryTaskPlanGraphRes/);
  });

  it('keeps user priority as importance and preserves execution capabilities', () => {
    expect(templateState).toContain('importance: ImportanceLevel');
    expect(templateState).toContain('checklist: ChecklistItemDefinition[]');
    expect(templateState).toContain('goalBinding: TaskGoalBinding | null');
    expect(templateState).toContain('schedule: TaskPlanSchedule');
    expect(templateState).not.toMatch(/taskType:|timeConfig:|recurrenceRule:/);
    expect(templateState).toContain('reminderConfig: TaskReminderConfig | null');
    expect(template).not.toMatch(/priority:\s*this\.getPriority|priority:\s*priority\?\.score/);
  });
});
