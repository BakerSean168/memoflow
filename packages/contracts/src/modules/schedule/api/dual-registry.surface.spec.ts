/**
 * Dual registry suite (elegance E3b tax cut).
 * Merged 8 dual-retired surface locks from this directory.
 * Behavior/assertions preserved; individual *-dual.surface.spec.ts removed.
 * Sources: schedule-batch-res-dual.surface.spec.ts, schedule-conflict-result-dual.surface.spec.ts, schedule-dto-dual.surface.spec.ts, schedule-nested-vo-dual.surface.spec.ts, schedule-query-params-dual.surface.spec.ts, schedule-request-dual.surface.spec.ts, schedule-response-dual.surface.spec.ts, schedule-task-request-dual.surface.spec.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// --- merged from schedule-batch-res-dual.surface.spec.ts ---
{
  /**
   * Residual 717: schedule batch operation response dual body retired.
   * ScheduleBatchOperationResponseDTO reuses ScheduleBatchOperationResponseSchema only.
   */
  describe('schedule batch response dual retired (residual 717)', () => {
    const apiDir = __dirname;
    const dto = readFileSync(resolve(apiDir, 'requests/schedule-task-requests.ts'), 'utf8');
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../scheduler/src/api/routes.ts'),
      'utf8',
    );

    it('exports ScheduleBatchOperationResponseSchema as sole batch response shape', () => {
      expect(responseSchemas).toContain('Residual 717');
      expect(responseSchemas).toContain(
        'export const ScheduleBatchOperationResponseSchema',
      );
    });

    it('semantic DTO is z.infer alias without interface dual body', () => {
      expect(dto).toContain('Residual 717');
      expect(dto).toContain(
        'export type ScheduleBatchOperationResponseDTO = z.infer<',
      );
      expect(dto).toContain('typeof ScheduleBatchOperationResponseSchema');
      expect(dto).not.toMatch(/export interface ScheduleBatchOperationResponseDTO\b/);
      expect(dto).not.toMatch(/export interface BatchOperationResponseDTO\b/);
    });

    it('keeps the batch response schema internal to Scheduler worker operations', () => {
      expect(routes).not.toContain('ScheduleBatchOperationResponseSchema');
      expect(routes).not.toContain('/tasks/batch');
    });
  });
}

// --- merged from schedule-conflict-result-dual.surface.spec.ts ---
{
  /**
   * Residual 725: schedule conflict detection result dual bodies retired.
   * ConflictDetectionResult / ConflictDetail / ConflictSuggestion reuse *Schema only.
   */
  describe('schedule conflict result dual retired (residual 725)', () => {
    const apiDir = __dirname;
    const vo = readFileSync(
      resolve(apiDir, '../value-objects/conflict-detection-result.ts'),
      'utf8',
    );
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../schedule/src/api/schedule-event.routes.ts'),
      'utf8',
    );
    const residual679 = readFileSync(
      resolve(apiDir, 'dual-registry.surface.spec.ts'),
      'utf8',
    );

    it('exports conflict schemas as sole shapes from value-object module', () => {
      expect(vo).toContain('Residual 725');
      expect(vo).toContain('export const ConflictDetailSchema = z.object({');
      expect(vo).toContain('export const ConflictSuggestionSchema = z.object({');
      expect(vo).toContain('export const ConflictDetectionResultSchema = z.object({');
    });

    it('semantic types are z.infer aliases without interface dual bodies', () => {
      expect(vo).toContain(
        'export type ConflictDetail = z.infer<typeof ConflictDetailSchema>',
      );
      expect(vo).toContain(
        'export type ConflictSuggestion = z.infer<typeof ConflictSuggestionSchema>',
      );
      expect(vo).toContain(
        'export type ConflictDetectionResult = z.infer<typeof ConflictDetectionResultSchema>',
      );
      expect(vo).not.toMatch(/export interface ConflictDetail\b/);
      expect(vo).not.toMatch(/export interface ConflictSuggestion\b/);
      expect(vo).not.toMatch(/export interface ConflictDetectionResult\b/);
    });

    it('response-schemas re-exports VO schemas; routes use ConflictDetectionResultSchema', () => {
      expect(responseSchemas).toContain('Residual 725');
      expect(responseSchemas).toContain(
        "from '../value-objects/conflict-detection-result'",
      );
      expect(responseSchemas).not.toMatch(
        /const ConflictDetailSchema = z\.object\(\{/,
      );
      expect(responseSchemas).not.toMatch(
        /export const ConflictDetectionResultSchema = z\.object\(\{/,
      );
      expect(routes).toContain('ConflictDetectionResultSchema');
      // residual 679 name dual stay locked
      expect(residual679).toContain('Residual 679');
      expect(residual679).toContain('ConflictDetectionResultSchema');
    });
  });
}

// --- merged from schedule-dto-dual.surface.spec.ts ---
{
  /**
   * Residual 260: schedule detail response dual aliases are gone.
   * Callers use ScheduleTaskClientDTO / ScheduleExecutionClientDTO directly.
    *
   * Soft residual 833: ScheduleExecutionClientDTO dual retired via ScheduleExecutionResponseSchema
   * (see reminder-template-active-time-schedule-execution-dual surface).
   */
  describe('schedule Schedule*DTO dual single-track surface', () => {
    const apiDir = __dirname;
    const taskReq = readFileSync(resolve(apiDir, 'requests/schedule-task-requests.ts'), 'utf8');
    const execReq = readFileSync(
      resolve(apiDir, 'requests/schedule-execution-requests.ts'),
      'utf8',
    );
    const rpcMap = readFileSync(resolve(apiDir, '../protocol/schedule-rpc-map.ts'), 'utf8');

    it('does not dual-alias ScheduleTaskDTO / ScheduleExecutionDTO', () => {
      expect(taskReq).not.toMatch(/export type ScheduleTaskDTO\s*=/);
      expect(execReq).not.toMatch(/export type ScheduleExecutionDTO\s*=/);
      expect(taskReq).not.toContain('export type ScheduleTaskDTO');
      expect(execReq).not.toContain('export type ScheduleExecutionDTO');
    });

    it('list/detail transport shapes use ClientDTO names (not dead list duals)', () => {
      expect(rpcMap).toContain('ScheduleTaskClientDTO');
      expect(rpcMap).toContain('ScheduleExecutionClientDTO');
      expect(taskReq).not.toMatch(/export interface ScheduleTaskListResponseDTO\b/);
      expect(execReq).not.toMatch(/export interface ScheduleExecutionListResponseDTO\b/);
      expect(execReq).not.toMatch(/export interface ExecutionHistoryStatsDTO\b/);
    });
  });

  /**
   * Residual 631: schedule operation success/error dual envelopes retired.
   * Delete RPC success bodies are `null` (transport data:null), same as governance/reminder void deletes.
   */
  describe('schedule operation response dual retired (residual 631)', () => {
    const apiDir = __dirname;
    const requestsIndex = readFileSync(resolve(apiDir, 'requests/index.ts'), 'utf8');
    const rpcMap = readFileSync(resolve(apiDir, '../protocol/schedule-rpc-map.ts'), 'utf8');

    it('does not export ScheduleOperationSuccess/Error dual DTOs', () => {
      expect(requestsIndex).not.toContain('common-responses');
      expect(requestsIndex).not.toContain('ScheduleOperationSuccessResponseDTO');
      expect(requestsIndex).not.toContain('ScheduleErrorResponseDTO');
    });

    it('keeps event delete null-bodied while raw worker delete is not a public RPC', () => {
      expect(rpcMap).toContain('Residual 631');
      expect(rpcMap).toContain("'schedule:delete': [{ scheduleId: ScheduleId }, null]");
      expect(rpcMap).not.toContain("'schedule-task:delete'");
      expect(rpcMap).not.toContain('ScheduleOperationSuccessResponseDTO');
      expect(rpcMap).not.toContain('common-responses');
    });
  });

  /**
   * Residual 639: shared BatchOperationResponseDTO dual name retired.
   * Schedule batch results use ScheduleBatchOperationResponseDTO only.
   */
  describe('schedule batch operation response dual name retired (residual 639)', () => {
    const apiDir = __dirname;
    const taskReq = readFileSync(resolve(apiDir, 'requests/schedule-task-requests.ts'), 'utf8');
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const sharedDtosIndex = readFileSync(
      resolve(apiDir, '../../../shared/dtos/index.ts'),
      'utf8',
    );

    it('does not export shared BatchOperationResponseDTO dual', () => {
      expect(sharedDtosIndex).not.toMatch(/export\s+type\s*\{\s*BatchOperationResponseDTO/);
      expect(sharedDtosIndex).not.toContain('batch-operation-res');
      expect(sharedDtosIndex).toContain('Residual 641');
    });

    it('schedule uses ScheduleBatchOperationResponseDTO / Schema only', () => {
      expect(taskReq).toContain('Residual 639');
      expect(taskReq).toContain('Residual 717');
      expect(taskReq).toContain(
        'export type ScheduleBatchOperationResponseDTO = z.infer<',
      );
      expect(taskReq).toContain('typeof ScheduleBatchOperationResponseSchema');
      expect(taskReq).not.toMatch(/export interface ScheduleBatchOperationResponseDTO\b/);
      expect(taskReq).not.toMatch(/export interface BatchOperationResponseDTO\b/);
      expect(responseSchemas).toContain('ScheduleBatchOperationResponseSchema');
      expect(responseSchemas).not.toMatch(/export const BatchOperationResponseSchema\b/);
    });
  });

  /**
   * Residual 665: schedule batch-delete OpenAPI schema dual retired.
   * Raw ScheduleTask batch mutation routes are no longer part of the product transport.
   */
  describe('schedule batch-delete response schema dual retired (residual 665)', () => {
    const apiDir = __dirname;
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../scheduler/src/api/routes.ts'),
      'utf8',
    );

    it('does not export a separate batch-delete response schema dual', () => {
      expect(responseSchemas).toContain('Residual 665');
      expect(responseSchemas).not.toMatch(/export const BatchDeleteResponseSchema\b/);
      expect(responseSchemas).toContain('export const ScheduleBatchOperationResponseSchema');
    });

    it('does not publish raw worker batch or batch-delete HTTP routes', () => {
      expect(routes).not.toContain('BatchDeleteResponseSchema');
      expect(routes).not.toContain('ScheduleBatchOperationResponseSchema');
      expect(routes).not.toContain('/tasks/batch');
      expect(routes).not.toContain('/tasks/batch/delete');
    });
  });

  /**
   * Residual 663: schedule dead list/stats ResponseDTO duals + detect-conflicts wrapper dual retired.
   * Live detect-conflicts / get-conflicts bodies are ConflictDetectionResult (RPC + client + OpenAPI).
   */
  describe('schedule list/stats + detect-conflicts dual retired (residual 663)', () => {
    const apiDir = __dirname;
    const taskReq = readFileSync(resolve(apiDir, 'requests/schedule-task-requests.ts'), 'utf8');
    const execReq = readFileSync(
      resolve(apiDir, 'requests/schedule-execution-requests.ts'),
      'utf8',
    );
    const scheduleReq = readFileSync(resolve(apiDir, 'requests/schedule-requests.ts'), 'utf8');
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const rpcMap = readFileSync(resolve(apiDir, '../protocol/schedule-rpc-map.ts'), 'utf8');

    it('does not export dead task/execution list or stats ResponseDTO duals', () => {
      expect(taskReq).toContain('Residual 663');
      expect(execReq).toContain('Residual 663');
      expect(taskReq).not.toMatch(/export interface ScheduleTaskListResponseDTO\b/);
      expect(execReq).not.toMatch(/export interface ScheduleExecutionListResponseDTO\b/);
      expect(execReq).not.toMatch(/export interface ExecutionHistoryStatsDTO\b/);
    });

    it('detect-conflicts has no { result } response dual wrapper', () => {
      expect(scheduleReq).toContain('Residual 663');
      expect(scheduleReq).not.toMatch(/export interface DetectConflictsResponseDTO\b/);
      expect(responseSchemas).toContain('Residual 663');
      expect(responseSchemas).not.toMatch(
        /DetectConflictsResponseSchema\s*=\s*z\.object\(\{\s*result:/,
      );
      expect(rpcMap).toContain('ConflictDetectionResult');
      expect(rpcMap).toMatch(
        /'schedule:detect-conflicts':\s*\[[\s\S]*ConflictDetectionResult[\s\S]*?\]/,
      );
    });
  });

  /**
   * Residual 679: detect-conflicts OpenAPI schema name dual retired.
   * Routes document ConflictDetectionResultSchema directly (no DetectConflictsResponseSchema alias).
   */
  describe('schedule detect-conflicts response schema name dual retired (residual 679)', () => {
    const apiDir = __dirname;
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../schedule/src/api/schedule-event.routes.ts'),
      'utf8',
    );

    it('does not export DetectConflictsResponseSchema name dual', () => {
      expect(responseSchemas).toContain('Residual 679');
      expect(responseSchemas).not.toMatch(/export const DetectConflictsResponseSchema\b/);
      // Residual 725: ConflictDetectionResultSchema is re-exported from VO module.
      expect(responseSchemas).toMatch(
        /export \{\s*[\s\S]*ConflictDetectionResultSchema/,
      );
      expect(responseSchemas).toContain('ConflictDetectionResultSchema');
    });

    it('detect and get-conflicts routes use ConflictDetectionResultSchema only', () => {
      expect(routes).not.toContain('DetectConflictsResponseSchema');
      expect(routes).toContain('ConflictDetectionResultSchema');
      const sharedSchemaHits =
        routes.split('successResponse(ConflictDetectionResultSchema').length - 1;
      expect(sharedSchemaHits).toBeGreaterThanOrEqual(2);
    });
  });
}

// --- merged from schedule-nested-vo-dual.surface.spec.ts ---
{
  /**
   * Residual 749: schedule nested VO dual bodies retired.
   * ScheduleConfig/ExecutionInfo/RetryPolicy/TaskMetadata DTOs reuse *Schema only.
   * Request modules keep local partial schemas (different shapes/validation).
   */
  describe('schedule nested VO dual retired (residual 749)', () => {
    const apiDir = __dirname;
    const scheduleConfig = readFileSync(
      resolve(apiDir, '../value-objects/schedule-config.ts'),
      'utf8',
    );
    const executionInfo = readFileSync(
      resolve(apiDir, '../value-objects/execution-info.ts'),
      'utf8',
    );
    const retryPolicy = readFileSync(
      resolve(apiDir, '../value-objects/retry-policy.ts'),
      'utf8',
    );
    const taskMetadata = readFileSync(
      resolve(apiDir, '../value-objects/task-metadata.ts'),
      'utf8',
    );
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const requests = readFileSync(
      resolve(apiDir, 'requests/schedule-task-requests.ts'),
      'utf8',
    );

    it('exports nested VO schemas as sole shapes from VO modules', () => {
      expect(scheduleConfig).toContain('Residual 749');
      expect(scheduleConfig).toContain('export const ScheduleConfigSchema = z.object({');
      expect(executionInfo).toContain('Residual 749');
      expect(executionInfo).toContain('export const ExecutionInfoSchema = z.object({');
      expect(retryPolicy).toContain('Residual 749');
      expect(retryPolicy).toContain('export const RetryPolicySchema = z.object({');
      expect(taskMetadata).toContain('Residual 749');
      expect(taskMetadata).toContain('export const TaskMetadataSchema = z.object({');
    });

    it('semantic DTOs are z.infer aliases without interface dual bodies', () => {
      expect(scheduleConfig).toContain(
        'export type ScheduleConfigDTO = z.infer<typeof ScheduleConfigSchema>',
      );
      expect(scheduleConfig).not.toMatch(/export interface ScheduleConfigDTO\b/);
      expect(executionInfo).toContain(
        'export type ExecutionInfoDTO = z.infer<typeof ExecutionInfoSchema>',
      );
      expect(executionInfo).not.toMatch(/export interface ExecutionInfoDTO\b/);
      expect(retryPolicy).toContain(
        'export type RetryPolicyDTO = z.infer<typeof RetryPolicySchema>',
      );
      expect(retryPolicy).not.toMatch(/export interface RetryPolicyDTO\b/);
      expect(taskMetadata).toContain(
        'export type TaskMetadataDTO = z.infer<typeof TaskMetadataSchema>',
      );
      expect(taskMetadata).not.toMatch(/export interface TaskMetadataDTO\b/);
    });

    it('response-schemas re-exports VO-owned schemas (no local dual bodies)', () => {
      expect(responseSchemas).toContain('Residual 749');
      expect(responseSchemas).toContain("from '../value-objects/schedule-config'");
      expect(responseSchemas).toContain("from '../value-objects/execution-info'");
      expect(responseSchemas).toContain("from '../value-objects/retry-policy'");
      expect(responseSchemas).toContain("from '../value-objects/task-metadata'");
      expect(responseSchemas).toContain('export {');
      expect(responseSchemas).toContain('ScheduleConfigSchema');
      expect(responseSchemas).not.toMatch(
        /const ScheduleConfigSchema = z\.object\(\{/,
      );
      expect(responseSchemas).not.toMatch(
        /const ExecutionInfoSchema = z\.object\(\{/,
      );
      expect(responseSchemas).not.toMatch(
        /const RetryPolicySchema = z\.object\(\{/,
      );
      expect(responseSchemas).not.toMatch(
        /const TaskMetadataSchema = z\.object\(\{/,
      );
      expect(responseSchemas).toContain('schedule: ScheduleConfigSchema');
      expect(responseSchemas).toContain('execution: ExecutionInfoSchema');
      expect(responseSchemas).toContain('retryPolicy: RetryPolicySchema');
      expect(responseSchemas).toContain('metadata: TaskMetadataSchema');
    });

    it('request module keeps local partial schemas (not response dual reuse)', () => {
      // Soft residual lock: request validation intentionally differs from response DTOs.
      expect(requests).toContain('const ScheduleConfigSchema = z.object({');
      expect(requests).toContain('startDate: z.number().nullable().optional()');
      expect(requests).toContain('const RetryPolicySchema = z.object({');
      // Request retry policy omits required response field `enabled`.
      expect(requests).not.toMatch(
        /const RetryPolicySchema = z\.object\(\{[^}]*enabled:/s,
      );
    });
  });
}

// --- merged from schedule-query-params-dual.surface.spec.ts ---
{
  /**
   * Residual 703: schedule query params dual bodies retired.
   * ScheduleTask/Execution QueryParamsDTO reuse *QueryParamsSchema only.
   */
  describe('schedule query params dual retired (residual 703)', () => {
    const apiDir = __dirname;
    const task = readFileSync(resolve(apiDir, 'requests/schedule-task-requests.ts'), 'utf8');
    const execution = readFileSync(
      resolve(apiDir, 'requests/schedule-execution-requests.ts'),
      'utf8',
    );
    const routes = readFileSync(
      resolve(apiDir, '../../../../../scheduler/src/api/routes.ts'),
      'utf8',
    );
    const controller = readFileSync(
      resolve(apiDir, '../../../../../scheduler/src/server/transport/schedule.controller.ts'),
      'utf8',
    );

    it('exports query params schemas as sole query shapes', () => {
      expect(task).toContain('export const ScheduleTaskQueryParamsSchema = z.object({');
      expect(execution).toContain(
        'export const ScheduleExecutionQueryParamsSchema = z.object({',
      );
    });

    it('semantic QueryParamsDTO types are z.infer aliases without interface dual bodies', () => {
      expect(task).toContain('Residual 703');
      expect(task).toContain(
        'export type ScheduleTaskQueryParamsDTO = z.infer<typeof ScheduleTaskQueryParamsSchema>',
      );
      expect(task).not.toMatch(/export interface ScheduleTaskQueryParamsDTO\b/);

      expect(execution).toContain('Residual 703');
      expect(execution).toContain(
        'export type ScheduleExecutionQueryParamsDTO = z.infer<typeof ScheduleExecutionQueryParamsSchema>',
      );
      expect(execution).not.toMatch(/export interface ScheduleExecutionQueryParamsDTO\b/);
    });

    it('routes and controller parse query schemas only', () => {
      expect(routes).toContain('ScheduleTaskQueryParamsSchema');
      expect(controller).toContain('ScheduleTaskQueryParamsSchema');
    });
  });
}

// --- merged from schedule-request-dual.surface.spec.ts ---
{
  /**
   * Residual 707: schedule request dual bodies retired.
   * Create/Update/DetectConflicts/GetByTimeRange/ResolveConflict Request
   * reuse *RequestSchema only.
   */
  describe('schedule request dual retired (residual 707)', () => {
    const apiDir = __dirname;
    const requests = readFileSync(resolve(apiDir, 'requests/schedule-requests.ts'), 'utf8');
    it('exports request schemas as sole request shapes', () => {
      expect(requests).toContain('Residual 707');
      expect(requests).toContain('export const CreateScheduleRequestSchema = z.object({');
      expect(requests).toContain('export const UpdateScheduleRequestSchema = z.object({');
      expect(requests).toContain('export const DetectConflictsRequestSchema = z.object({');
      expect(requests).toContain(
        'export const GetSchedulesByTimeRangeRequestSchema = z.object({',
      );
      expect(requests).toContain('export const ResolveConflictRequestSchema = z.object({');
    });

    it('semantic Request types are z.infer aliases without interface dual bodies', () => {
      expect(requests).toContain(
        'export type CreateScheduleRequest = z.infer<typeof CreateScheduleRequestSchema>',
      );
      expect(requests).toContain(
        'export type UpdateScheduleRequest = z.infer<typeof UpdateScheduleRequestSchema>',
      );
      expect(requests).toContain(
        'export type DetectConflictsRequest = z.infer<typeof DetectConflictsRequestSchema>',
      );
      expect(requests).toContain(
        'export type GetSchedulesByTimeRangeRequest = z.infer<',
      );
      expect(requests).toContain('typeof GetSchedulesByTimeRangeRequestSchema');
      expect(requests).toContain(
        'export type ResolveConflictRequest = z.infer<typeof ResolveConflictRequestSchema>',
      );
      expect(requests).not.toMatch(/export interface CreateScheduleRequest\b/);
      expect(requests).not.toMatch(/export interface UpdateScheduleRequest\b/);
      expect(requests).not.toMatch(/export interface DetectConflictsRequest\b/);
      expect(requests).not.toMatch(/export interface GetSchedulesByTimeRangeRequest\b/);
      expect(requests).not.toMatch(/export interface ResolveConflictRequest\b/);
    });

    it('keeps internal identity query types as explicit server-side shapes', () => {
      expect(requests).toContain('export interface GetSchedulesByTimeRangeInternalQuery');
      expect(requests).toContain('export interface DetectConflictsInternalQuery');
      expect(requests).toContain('identityId: IdentityId');
    });

    it('OpenAPI schedule-event routes and controller parse request schemas only', () => {
      const eventRoutes = readFileSync(
        resolve(apiDir, '../../../../../schedule/src/api/schedule-event.routes.ts'),
        'utf8',
      );
      const controller = readFileSync(
        resolve(
          apiDir,
          '../../../../../schedule/src/server/transport/schedule-event.controller.ts',
        ),
        'utf8',
      );
      expect(eventRoutes).toContain('CreateScheduleRequestSchema');
      expect(eventRoutes).toContain('DetectConflictsRequestSchema');
      expect(eventRoutes).toContain('ResolveConflictRequestSchema');
      expect(controller).toContain('CreateScheduleRequestSchema.safeParse');
      expect(controller).toContain('DetectConflictsRequestSchema.safeParse');
      expect(controller).toContain('ResolveConflictRequestSchema.safeParse');
    });
  });
}

// --- merged from schedule-response-dual.surface.spec.ts ---
{
  /**
   * Residual 715: schedule create/resolve response dual bodies retired.
   * CreateScheduleResponseDTO / ResolveConflictResponseDTO / AppliedResolution
   * reuse *ResponseSchema only.
    *
   * Soft residual 829: CalendarEntryClientDTO dual retired via CalendarEntryResponseSchema
   * (see notification-preference-calendar-prefs-client-dto-dual surface).
    *
   * Soft residual 831: ScheduleTaskClientDTO dual retired via ScheduleTaskResponseSchema
   * (see task-occurrence-dependency-schedule-task-client-dto-dual surface).
    *
   * Soft residual 833: ScheduleExecutionResponseSchema exported without ZodType dual; nested under ScheduleTask
   * (see reminder-template-active-time-schedule-execution-dual surface).
   */
  describe('schedule response dual retired (residual 715)', () => {
    const apiDir = __dirname;
    const requests = readFileSync(resolve(apiDir, 'requests/schedule-requests.ts'), 'utf8');
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../schedule/src/api/schedule-event.routes.ts'),
      'utf8',
    );

    it('exports create/resolve response schemas as sole response shapes', () => {
      expect(responseSchemas).toContain('Residual 715');
      expect(responseSchemas).toContain('export const CreateScheduleResponseSchema');
      expect(responseSchemas).toContain('export const ResolveConflictResponseSchema');
      expect(responseSchemas).toContain('export const AppliedResolutionSchema');
    });

    it('semantic response types are z.infer aliases without interface dual bodies', () => {
      expect(requests).toContain('Residual 715');
      expect(requests).toContain(
        'export type CreateScheduleResponseDTO = z.infer<typeof CreateScheduleResponseSchema>',
      );
      expect(requests).toContain(
        'export type ResolveConflictResponseDTO = z.infer<typeof ResolveConflictResponseSchema>',
      );
      expect(requests).toContain(
        'export type AppliedResolution = z.infer<typeof AppliedResolutionSchema>',
      );
      expect(requests).not.toMatch(/export interface CreateScheduleResponseDTO\b/);
      expect(requests).not.toMatch(/export interface ResolveConflictResponseDTO\b/);
      expect(requests).not.toMatch(/export interface AppliedResolution\b/);
    });

    it('OpenAPI schedule-event routes use create/resolve response schemas', () => {
      expect(routes).toContain('CreateScheduleResponseSchema');
      expect(routes).toContain('ResolveConflictResponseSchema');
      expect(routes).toContain('successResponse(CreateScheduleResponseSchema');
      expect(routes).toContain('successResponse(ResolveConflictResponseSchema');
    });
  });
}

// --- merged from schedule-task-request-dual.surface.spec.ts ---
{
  /**
   * Residual 709: schedule-task request dual bodies retired.
   * Create/Update/Config/Metadata/Batch Request reuse *RequestSchema only.
   */
  describe('schedule-task request dual retired (residual 709)', () => {
    const apiDir = __dirname;
    const dto = readFileSync(resolve(apiDir, 'requests/schedule-task-requests.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../scheduler/src/api/routes.ts'),
      'utf8',
    );
    const controller = readFileSync(
      resolve(apiDir, '../../../../../scheduler/src/server/transport/schedule.controller.ts'),
      'utf8',
    );

    it('exports schedule-task request schemas as sole request shapes', () => {
      expect(dto).toContain('Residual 709');
      expect(dto).toContain('export const CreateScheduleTaskRequestSchema = z.object({');
      expect(dto).toContain('export const UpdateScheduleTaskRequestSchema = z.object({');
      expect(dto).toContain('export const UpdateScheduleConfigRequestSchema = z.object({');
      expect(dto).toContain('export const UpdateTaskMetadataRequestSchema = z.object({');
      expect(dto).toContain(
        'export const BatchScheduleTaskOperationRequestSchema = z.object({',
      );
    });

    it('semantic Request types are z.infer aliases without interface dual bodies', () => {
      expect(dto).toContain(
        'export type CreateScheduleTaskRequest = z.infer<typeof CreateScheduleTaskRequestSchema>',
      );
      expect(dto).toContain(
        'export type UpdateScheduleTaskRequest = z.infer<typeof UpdateScheduleTaskRequestSchema>',
      );
      expect(dto).toContain(
        'export type UpdateScheduleConfigRequest = z.infer<typeof UpdateScheduleConfigRequestSchema>',
      );
      expect(dto).toContain(
        'export type UpdateTaskMetadataRequest = z.infer<typeof UpdateTaskMetadataRequestSchema>',
      );
      expect(dto).toContain(
        'export type BatchScheduleTaskOperationRequest = z.infer<',
      );
      expect(dto).toContain('typeof BatchScheduleTaskOperationRequestSchema');
      expect(dto).not.toMatch(/export interface CreateScheduleTaskRequest\b/);
      expect(dto).not.toMatch(/export interface UpdateScheduleTaskRequest\b/);
      expect(dto).not.toMatch(/export interface UpdateScheduleConfigRequest\b/);
      expect(dto).not.toMatch(/export interface UpdateTaskMetadataRequest\b/);
      expect(dto).not.toMatch(/export interface BatchScheduleTaskOperationRequest\b/);
    });

    it('keeps ScheduleBatchOperationResponseDTO semantic type (residual 639/717 schedule-scoped)', () => {
      expect(dto).toContain('Residual 639');
      expect(dto).toContain('Residual 717');
      expect(dto).toContain(
        'export type ScheduleBatchOperationResponseDTO = z.infer<',
      );
      expect(dto).not.toMatch(/export interface ScheduleBatchOperationResponseDTO\b/);
    });

    it('public routes/controller use query schema only and do not expose raw worker mutations', () => {
      expect(routes).not.toContain('CreateScheduleTaskRequestSchema');
      expect(routes).not.toContain('UpdateScheduleTaskRequestSchema');
      expect(routes).not.toContain('BatchScheduleTaskOperationRequestSchema');
      expect(controller).toContain('ScheduleTaskQueryParamsSchema');
      expect(controller).not.toContain('CreateScheduleTaskRequestSchema');
      expect(controller).not.toContain('UpdateScheduleTaskRequestSchema');
    });
  });
}
