import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** TASK-2203: Task is Action + Execution, not a project-management graph. */
describe('Task vNext simplified domain surface', () => {
  const taskSrc = resolve(__dirname, '../..');
  const taskRoot = resolve(taskSrc, '..');
  const contractsTask = resolve(taskRoot, '../contracts/src/modules/task');
  const plan = readFileSync(resolve(__dirname, 'aggregates/task-plan.ts'), 'utf8');
  const templateState = readFileSync(resolve(__dirname, 'aggregates/task-plan.state.ts'), 'utf8');
  const integrationHelpers = readFileSync(
    resolve(__dirname, '../../__tests__/integration-helpers.ts'),
    'utf8',
  );
  const planRepositoryPort = readFileSync(
    resolve(__dirname, 'repositories/i-task-plan-repository.ts'),
    'utf8',
  );
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
    expect(plan).not.toMatch(
      /getPriority\(|getPriorityScore|addSubtask|parentTaskId|markAsBlocked|dependencyStatus|blockingReason/,
    );
    expect(templateState).not.toMatch(
      /folderId|parentTaskId|dependencyStatus|isBlocked|blockingReason/,
    );
  });

  it('retires project-management application and transport surfaces', () => {
    expect(module).not.toMatch(/TaskDependency|TaskFolder|TaskPlanGraph|ByPriority/);
    expect(rpcMap).not.toMatch(/plan:graph|dependency:/);
    expect(templateContract).not.toMatch(/folderId|parentTaskId|QueryTaskPlanGraphRes/);
  });

  it('keeps TaskPlan independent from TaskOccurrence ownership', () => {
    expect(plan).not.toMatch(
      /private _instances|addInstance\(|removeInstance\(|getAllInstances\(/,
    );
    expect(plan).not.toMatch(/createInstance\(|generateOccurrences\(|getInstanceForDate\(/);
    expect(planRepositoryPort).not.toContain('findByIdWithChildren');
  });

  it('keeps materialization cursor-free at product and domain boundaries (TASK-7304)', () => {
    const serverContract = readFileSync(
      resolve(contractsTask, 'aggregates/task-plan-server.ts'),
      'utf8',
    );
    const clientContract = readFileSync(
      resolve(contractsTask, 'aggregates/task-plan-client.ts'),
      'utf8',
    );
    const responseSchema = readFileSync(resolve(contractsTask, 'api/response-schemas.ts'), 'utf8');
    const generationService = readFileSync(
      resolve(__dirname, 'services/task-occurrence-generation-service.ts'),
      'utf8',
    );
    const outcomeEvaluator = readFileSync(
      resolve(__dirname, 'services/task-plan-outcome-evaluator.ts'),
      'utf8',
    );
    const portableTask = readFileSync(
      resolve(taskRoot, '../contracts/src/modules/data-portability/dtos/portable-tasks.dto.ts'),
      'utf8',
    );

    for (const source of [
      templateState,
      serverContract,
      clientContract,
      responseSchema,
      portableTask,
    ]) {
      expect(source).not.toMatch(/lastGeneratedDate|generateAheadDays/);
    }
    expect(plan).not.toMatch(/recordGenerationHorizon|lastGeneratedDate|generateAheadDays/);
    expect(planRepositoryPort).not.toContain('findNeedGenerateOccurrences');
    expect(planRepositoryPort).toContain('findActiveRecurringPlansForMaterialization');
    expect(generationService).not.toMatch(
      /recordGenerationHorizon|lastGeneratedDate|shouldRefillInstances|calculateRefillTargetDate/,
    );
    expect(generationService).toContain('existingOccurrences');
    expect(outcomeEvaluator).not.toContain('lastGeneratedDate');
    expect(outcomeEvaluator).toContain('recurrenceDatesBetween');
  });

  it('keeps user priority as importance and preserves execution capabilities', () => {
    expect(templateState).toContain('importance: ImportanceLevel');
    expect(templateState).toContain('checklist: ChecklistItemDefinition[]');
    expect(templateState).toContain('goalBinding: TaskGoalBinding | null');
    expect(templateState).toContain('schedule: TaskPlanSchedule');
    expect(templateState).not.toMatch(/taskType:|timeConfig:|recurrenceRule:/);
    expect(templateState).toContain('reminderConfig: TaskReminderConfig | null');
    expect(plan).not.toMatch(/priority:\s*this\.getPriority|priority:\s*priority\?\.score/);
  });

  it('locks TASK-7309 legacy deletion and canonical physical names', () => {
    const activeSources = [
      plan,
      templateState,
      readFileSync(resolve(contractsTask, 'api/response-schemas.ts'), 'utf8'),
      readFileSync(resolve(contractsTask, 'api/task-plan.dto.ts'), 'utf8'),
      readFileSync(resolve(taskRoot, '../contracts/src/electron/ipc-channels.ts'), 'utf8'),
      readFileSync(resolve(taskRoot, '../database/prisma/schema/task.prisma'), 'utf8'),
      readFileSync(resolve(taskRoot, '../powersync-schema/src/index.ts'), 'utf8'),
      integrationHelpers,
    ];
    const source = activeSources.join('\n');
    expect(source).not.toMatch(/\bTaskTemplate\b|\bTaskInstance\b|\btemplateId\b|\binstanceId\b/);
    expect(source).not.toMatch(
      /\bTaskStatistic\b|\btaskStatistic\b|\btask_statistics\b|task_templates|task_instances|task_template_history/,
    );
    expect(source).not.toMatch(/task_template_id|task_instance_id|status\s*[:=].*\b(blocked|cancelled)\b/);
    expect(source).toContain('task_plans');
    expect(source).toContain('task_occurrences');
    expect(source).toContain('task_plan_history');
    expect(source).toContain('task_plan_id');
    expect(source).toContain('task_occurrence_id');
    expect(plan).not.toMatch(/\b(startDate|dueDate|completedAt|actualMinutes)\b/);
    expect(plan).not.toMatch(/\bnote\s*:/);
    expect(plan).not.toMatch(/createOneTimeTask|createRecurringTask|fromLegacy/);
  });
});
