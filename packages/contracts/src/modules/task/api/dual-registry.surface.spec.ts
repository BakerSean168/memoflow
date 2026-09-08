/**
 * Dual registry suite (elegance E3b tax cut).
 * Merged 13 dual-retired surface locks from this directory.
 * Behavior/assertions preserved; individual *-dual.surface.spec.ts removed.
 * Sources: recurrence-rule-dual.surface.spec.ts, task-goal-binding-dual.surface.spec.ts, task-goal-binding-reminder-dual.surface.spec.ts, task-occurrence-schedule-task-client-dto-dual.surface.spec.ts, task-occurrence-range-op-res-dual.surface.spec.ts, task-occurrence-res-dual.surface.spec.ts, task-time-config-dual.surface.spec.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// --- merged from recurrence-rule-dual.surface.spec.ts ---
{
  /**
   * Residual 743: task recurrence-rule dual body retired.
   * RecurrenceRuleDTO reuses RecurrenceConfigSchema only.
   * Domain RecurrenceRule (Instant endDate) stays separate interface from transfer DTO schema.
   */
  describe('task recurrence-rule dual retired (residual 743)', () => {
    const apiDir = __dirname;
    const vo = readFileSync(resolve(apiDir, '../value-objects/recurrence-rule.ts'), 'utf8');
    const templateDto = readFileSync(resolve(apiDir, 'task-plan.dto.ts'), 'utf8');

    it('exports RecurrenceConfigSchema as sole shape from VO module', () => {
      expect(vo).toContain('Residual 743');
      expect(vo).toContain('export const RecurrenceConfigSchema = z');
    });

    it('semantic DTO is z.infer alias without interface dual body', () => {
      expect(vo).toContain(
        'export type RecurrenceRuleDTO = z.infer<typeof RecurrenceConfigSchema>',
      );
      expect(vo).not.toMatch(/export interface RecurrenceRuleDTO\b/);
      expect(vo).toContain('export interface RecurrenceRule {');
    });

    it('task-plan.dto re-exports VO-owned schema (no local dual body)', () => {
      expect(templateDto).toContain('Residual 743');
      expect(templateDto).toContain("from '../value-objects/recurrence-rule'");
      expect(templateDto).toContain('export { RecurrenceConfigSchema }');
      expect(templateDto).not.toMatch(/const RecurrenceConfigSchema(?::[^=]+)? = z/);
      expect(templateDto).toContain('recurrenceRule: RecurrenceConfigSchema');
    });
  });
}


// --- merged from task-goal-binding-dual.surface.spec.ts ---
{
  /**
   * Residual 667: bind-to-goal request dual body retired.
   * Live bind-goal OpenAPI/controller parse TaskGoalBindingSchema only.
   * Residual 739: TaskGoalBindingSchema ownership moved to value-objects;
   * task-plan.dto re-exports the VO-owned schema (no local dual body).
   */
  describe('task bind-to-goal request dual retired (residual 667)', () => {
    const apiDir = __dirname;
    const dto = readFileSync(resolve(apiDir, 'task-plan.dto.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../task/src/api/routes/task-plan.routes.ts'),
      'utf8',
    );
    const controller = readFileSync(
      resolve(apiDir, '../../../../../task/src/server/transport/task-plan.controller.ts'),
      'utf8',
    );

    it('does not export a separate bind-to-goal zod dual body', () => {
      expect(dto).toContain('Residual 667');
      // Residual 739: schema is re-exported from VO (not a local export const dual).
      expect(dto).toMatch(
        /export \{[^}]*TaskGoalBindingSchema[^}]*\}|export const TaskGoalBindingSchema\b/,
      );
      expect(dto).toContain('export type BindToGoalReq = z.infer<typeof TaskGoalBindingSchema>');
      expect(dto).not.toMatch(/export const BindToGoalSchema\b/);
    });

    it('routes and controller use TaskGoalBindingSchema for bind-goal (Phase 4)', () => {
      expect(routes).toContain('BindTaskToGoalInvocationSchema');
      expect(routes).not.toContain('BindToGoalSchema');
      expect(controller).toContain('BindToGoalReq');
      expect(controller).not.toContain('BindToGoalSchema');
      // The invocation schema nests the VO-owned TaskGoalBindingSchema.
      expect(routes).toMatch(/BindTaskToGoalInvocationSchema\.shape\.body/);
    });
  });
}

// --- merged from task-goal-binding-reminder-dual.surface.spec.ts ---
{
  /** ADR-056: Goal link owns one schema; contribution is a nested optional rule. */
  describe('task goal-link/reminder canonical schemas', () => {
    const apiDir = __dirname;
    const binding = readFileSync(resolve(apiDir, '../value-objects/task-goal-binding.ts'), 'utf8');
    const reminder = readFileSync(
      resolve(apiDir, '../value-objects/task-reminder-config.ts'),
      'utf8',
    );
    const templateDto = readFileSync(resolve(apiDir, 'task-plan.dto.ts'), 'utf8');

    it('exports one ADR-056 link schema with nested contribution and the reminder schema', () => {
      expect(binding).toContain('export const TaskGoalLinkSchema = z.object({');
      expect(binding).toContain('contribution: GoalContributionRuleSchema.nullable().optional().default(null)');
      expect(binding).toContain('export const TaskGoalBindingSchema = TaskGoalLinkSchema');
      expect(binding).not.toContain('goalRecordValue:');
      expect(binding).not.toContain('progressTrigger:');
      expect(reminder).toContain('export const TaskReminderConfigSchema = z');
    });

    it('semantic DTOs are z.infer aliases without interface dual bodies', () => {
      expect(binding).toContain(
        'export type TaskGoalBindingDTO = z.infer<typeof TaskGoalBindingSchema>',
      );
      expect(binding).toContain('export type TaskGoalLinkDTO = z.infer<typeof TaskGoalLinkSchema>');
      expect(binding).not.toMatch(/export interface TaskGoalBindingDTO\b/);
      expect(reminder).toContain(
        'export type TaskReminderConfigDTO = z.infer<typeof TaskReminderConfigSchema>',
      );
      expect(reminder).not.toMatch(/export interface TaskReminderConfigDTO\b/);
    });

    it('task-plan.dto re-exports VO-owned schemas (no local dual bodies)', () => {
      expect(templateDto).toContain('Residual 739');
      expect(templateDto).toContain("from '../value-objects/task-goal-binding'");
      expect(templateDto).toContain("from '../value-objects/task-reminder-config'");
      expect(templateDto).toContain('export { TaskReminderConfigSchema, TaskGoalBindingSchema }');
      expect(templateDto).not.toMatch(/const TaskGoalBindingSchema = z\.object\(\{/);
      expect(templateDto).not.toMatch(/const TaskReminderConfigSchema(?::[^=]+)? = z/);
      expect(templateDto).toContain('goalBinding: TaskGoalBindingSchema');
      expect(templateDto).toContain('reminderConfig: TaskReminderConfigSchema');
      expect(templateDto).toContain(
        'export type BindToGoalReq = z.infer<typeof TaskGoalBindingSchema>',
      );
    });
  });
}


// --- merged from task-occurrence-schedule-task-client-dto-dual.surface.spec.ts ---
{
  /**
   * Residual 831: TaskOccurrenceClientDTO / ScheduleTaskClientDTO
   * dual bodies retired. Sole *ResponseSchema + z.infer.
   * TaskFolder transport contracts are retired; TaskPlanHistory remains independently covered.
   */
  describe('task/schedule client dto duals retired (residual 831)', () => {
    const taskApi = __dirname;
    const scheduleApi = resolve(taskApi, '../../schedule/api');
    const instance = readFileSync(
      resolve(taskApi, '../aggregates/task-occurrence-client.ts'),
      'utf8',
    );
    const scheduleTask = readFileSync(
      resolve(taskApi, '../../schedule/aggregates/schedule-task-client.ts'),
      'utf8',
    );
    const taskSchemas = readFileSync(resolve(taskApi, 'response-schemas.ts'), 'utf8');
    const scheduleSchemas = readFileSync(resolve(scheduleApi, 'response-schemas.ts'), 'utf8');


    it('owns TaskOccurrenceClientDTO as z.infer of TaskOccurrenceResponseSchema', () => {
      expect(instance).toContain('Residual 831');
      expect(instance).toContain(
        'export type TaskOccurrenceClientDTO = z.infer<typeof TaskOccurrenceResponseSchema>',
      );
      expect(instance).not.toMatch(/export interface TaskOccurrenceClientDTO\b/);
      expect(taskSchemas).toContain('export const TaskOccurrenceResponseSchema = z.object({');
      expect(taskSchemas).toContain('timeConfig: TaskTimeConfigSchema');
      const instRoutes = readFileSync(
        resolve(taskApi, '../../../../../task/src/api/routes/task-occurrence.routes.ts'),
        'utf8',
      );
      expect(instRoutes).toContain('TaskOccurrenceResponseSchema');
      expect(instRoutes).toContain("successResponse(TaskOccurrenceResponseSchema, '获取成功')");
    });

    it('owns ScheduleTaskClientDTO as z.infer of ScheduleTaskResponseSchema', () => {
      expect(scheduleTask).toContain('Residual 831');
      expect(scheduleTask).toContain(
        'export type ScheduleTaskClientDTO = z.infer<typeof ScheduleTaskResponseSchema>',
      );
      expect(scheduleTask).not.toMatch(/export interface ScheduleTaskClientDTO\b/);
      expect(scheduleSchemas).toContain('Residual 831');
      expect(scheduleSchemas).toContain('export const ScheduleTaskResponseSchema = z.object({');
      expect(scheduleSchemas).toContain(
        'executions: z.array(ScheduleExecutionResponseSchema).nullable()',
      );
      const routes = readFileSync(
        resolve(scheduleApi, '../../../../../scheduler/src/api/routes.ts'),
        'utf8',
      );
      expect(routes).toContain("successResponse(ScheduleTaskResponseSchema, '获取成功')");
      expect(routes).not.toContain("successResponse(ScheduleTaskResponseSchema, '创建成功')");
    });
  });
}

// --- merged from task-occurrence-range-op-res-dual.surface.spec.ts ---
{
  /**
   * Residual 789: GetTaskOccurrencesByRangeRes / TaskOccurrenceOperationRes dual bodies retired.
   * Sole *ResSchema + z.infer nesting TaskOccurrenceResponseSchema.
   */
  describe('task instance range/op res duals retired (residual 789)', () => {
    const apiDir = __dirname;
    const dto = readFileSync(resolve(apiDir, 'task-occurrence.dto.ts'), 'utf8');
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');

    it('owns by-range and operation ResSchema + z.infer aliases', () => {
      expect(dto).toContain('Residual 789');
      expect(dto).toContain('export const GetTaskOccurrencesByRangeResSchema = z.object({');
      expect(dto).toContain(
        'export type GetTaskOccurrencesByRangeRes = z.infer<typeof GetTaskOccurrencesByRangeResSchema>',
      );
      expect(dto).toContain('export const TaskOccurrenceOperationResSchema = z.object({');
      expect(dto).toContain(
        'export type TaskOccurrenceOperationRes = z.infer<typeof TaskOccurrenceOperationResSchema>',
      );
      expect(dto).toContain('data: z.array(TaskOccurrenceResponseSchema)');
      expect(dto).toContain('instance: TaskOccurrenceResponseSchema');
      expect(dto).not.toMatch(/export interface GetTaskOccurrencesByRangeRes\b/);
      expect(dto).not.toMatch(/export interface TaskOccurrenceOperationRes\b/);
    });

    it('nests TaskOccurrenceResponseSchema from response-schemas', () => {
      expect(responseSchemas).toContain('export const TaskOccurrenceResponseSchema = z.object({');
      expect(dto).toContain("from './response-schemas'");
      expect(dto).toContain('TaskOccurrenceResponseSchema');
    });
  });
}

// --- merged from task-occurrence-res-dual.surface.spec.ts ---
{
  /**
   * Residual 262: task contracts drop identity dual response aliases and
   * TaskDomainEvent alias of TaskCreatedEvent.
   */
  describe('task instance Res dual single-track surface', () => {
    const apiDir = __dirname;
    const instanceDto = readFileSync(resolve(apiDir, 'task-occurrence.dto.ts'), 'utf8');
    const rpcMap = readFileSync(resolve(apiDir, '../protocol/task-rpc-map.ts'), 'utf8');
    const eventsIndex = readFileSync(resolve(apiDir, '../domain/events/index.ts'), 'utf8');

    it('does not dual-alias Complete/Skip TaskOccurrenceRes', () => {
      expect(instanceDto).not.toMatch(/export type CompleteTaskOccurrenceRes\s*=/);
      expect(instanceDto).not.toMatch(/export type SkipTaskOccurrenceRes\s*=/);
      // Soft residual 789: operation Res dual retired — ResSchema + z.infer only.
      expect(instanceDto).toContain('Residual 789');
      expect(instanceDto).toContain('export const TaskOccurrenceOperationResSchema = z.object({');
      expect(instanceDto).toContain(
        'export type TaskOccurrenceOperationRes = z.infer<typeof TaskOccurrenceOperationResSchema>',
      );
      expect(instanceDto).not.toMatch(/export interface TaskOccurrenceOperationRes\b/);
    });

    it('rpc map uses shared TaskOccurrenceResponse alias for complete/skip (Phase 4)', () => {
      // Phase 4: the RPC map uses channel-aligned keys and the exported
      // inferred response alias (ADR-047: maps import inferred types from
      // `../api` only) instead of kebab keys + OperationRes or inline z.infer.
      expect(rpcMap).toMatch(
        /'task:instance:complete':\s*\[\s*CompleteTaskOccurrenceInvocation,\s*TaskOccurrenceResponse/,
      );
      expect(rpcMap).toMatch(
        /'task:instance:skip':\s*\[\s*SkipTaskOccurrenceInvocation,\s*TaskOccurrenceResponse/,
      );
      expect(rpcMap).toContain('TaskOccurrenceResponse');
      expect(rpcMap).not.toContain('z.infer');
      expect(rpcMap).not.toContain('CompleteTaskOccurrenceRes');
      expect(rpcMap).not.toContain('SkipTaskOccurrenceRes');
    });

    it('does not dual-export TaskDomainEvent = TaskCreatedEvent', () => {
      expect(eventsIndex).not.toContain('TaskDomainEvent');
      expect(eventsIndex).toContain('TaskCreatedEvent');
    });
  });
}

// --- merged from task-time-config-dual.surface.spec.ts ---
{
  /**
   * Residual 747: task time-config dual body retired.
   * TaskTimeConfigDTO reuses TaskTimeConfigSchema only.
   * Domain TaskTimeConfig (Instant startDate + startDay Ymd) — ADR-037; schema is transfer sole.
   *
   * Soft residual 831: TaskOccurrenceClientDTO dual retired via TaskOccurrenceResponseSchema
   * (see task-occurrence-dependency-schedule-task-client-dto-dual surface).
   */
  describe('task time-config dual retired (residual 747)', () => {
    const apiDir = __dirname;
    const vo = readFileSync(resolve(apiDir, '../value-objects/task-time-config.ts'), 'utf8');
    const templateDto = readFileSync(resolve(apiDir, 'task-plan.dto.ts'), 'utf8');

    it('exports TaskTimeConfigSchema as sole shape from VO module', () => {
      expect(vo).toContain('Residual 747');
      expect(vo).toContain('export const TaskTimeConfigSchema = z');
    });

    it('semantic DTO is z.infer alias without interface dual body', () => {
      expect(vo).toContain('export type TaskTimeConfigDTO = z.infer<typeof TaskTimeConfigSchema>');
      expect(vo).not.toMatch(/export interface TaskTimeConfigDTO\b/);
      expect(vo).toContain('export interface TaskTimeConfig {');
      expect(vo).toContain('startDate: Instant | null');
    });

    it('task-plan.dto re-exports VO-owned schema (no local dual body)', () => {
      expect(templateDto).toContain('Residual 747');
      expect(templateDto).toContain("from '../value-objects/task-time-config'");
      expect(templateDto).toContain('export { TaskTimeConfigSchema }');
      expect(templateDto).not.toMatch(/const TaskTimeConfigSchema(?::[^=]+)? = z/);
      expect(templateDto).toContain('timeConfig: TaskTimeConfigSchema');
    });
  });
}
