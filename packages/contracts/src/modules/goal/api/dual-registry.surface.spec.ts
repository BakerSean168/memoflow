/**
 * Dual registry suite (elegance E3b tax cut).
 * Merged 16 dual-retired surface locks from this directory.
 * Behavior/assertions preserved; individual *-dual.surface.spec.ts removed.
 * Sources: dead-res-dual.surface.spec.ts, export-import-goals-res-dual.surface.spec.ts, focus-mode-dual.surface.spec.ts, focus-session-client-dto-dual.surface.spec.ts, focus-session-res-dual.surface.spec.ts, focus-status-history-res-dual.surface.spec.ts, goal-aggregate-client-dto-dual.surface.spec.ts, goal-entity-client-dto-dual.surface.spec.ts, goal-id-params-dual.surface.spec.ts, goal-list-res-dual.surface.spec.ts, goal-record-client-dto-dual.surface.spec.ts, goal-reminder-config-dual.surface.spec.ts, goal-reminder-request-dual.surface.spec.ts, key-result-progress-snapshot-dual.surface.spec.ts, query-goal-folders-res-dual.surface.spec.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// --- merged from dead-res-dual.surface.spec.ts ---
{
  /**
   * Residual 263/290: drop unused contracts *Res identity dual aliases that had no
   * protocol/call-site consumers (canonical *DTO / operation types only).
   */
  describe('contracts dead *Res dual single-track surface', () => {
    const goalApi = __dirname;
    const modules = resolve(goalApi, '../..');

    const files: Array<[string, string[]]> = [
      [
        resolve(goalApi, 'goal-review.dto.ts'),
        ['CreateGoalReviewRes', 'UpdateGoalReviewRes', 'GetGoalReviewRes', 'DeleteGoalReviewRes'],
      ],
      [resolve(goalApi, 'goal-record.dto.ts'), ['CreateGoalRecordRes', 'DeleteGoalRecordRes']],
      [resolve(goalApi, 'key-result.dto.ts'), ['UpdateKeyResultRes', 'UpdateKeyResultProgressRes']],
      [resolve(modules, 'ai/api/ai-provider-config.dto.ts'), ['RefreshAIProviderModelsRes']],
      [
        resolve(modules, 'repository/api/knowledge-repository-connection.dto.ts'),
        ['CreateKnowledgeRepositoryConnectionRes'],
      ],
      [resolve(modules, 'task/api/task-schedule.dto.ts'), ['ToggleTaskCompletionRes']],
      [resolve(modules, 'setting/api/sync.dto.ts'), ['SyncSettingsRes']],
      [resolve(modules, 'governance/api/rule-revisions.ts'), ['GetRuleRevisionRes']],
      // residual 290
      [
        resolve(goalApi, 'goal-crud.dto.ts'),
        ['BatchUpdateGoalStatusRes', 'BatchMoveGoalsRes', 'BatchDeleteGoalsRes'],
      ],
      [resolve(modules, 'repository/aggregates/local-vault-binding.ts'), ['SelectLocalVaultRes']],
    ];

    it('does not export dead *Res identity dual aliases', () => {
      for (const [file, names] of files) {
        const src = readFileSync(file, 'utf8');
        for (const name of names) {
          expect(src, file).not.toMatch(new RegExp(`export type ${name}\\s*=`));
        }
      }
    });
  });
}

// --- merged from export-import-goals-res-dual.surface.spec.ts ---
{
  /**
   * Residual 791: ExportGoalsRes / ImportGoalsRes dual bodies retired.
   * Sole *ResSchema + z.infer (export data string|Uint8Array union).
   */
  describe('export/import goals res duals retired (residual 791)', () => {
    const apiDir = __dirname;
    const dto = readFileSync(resolve(apiDir, 'goal-crud.dto.ts'), 'utf8');

    it('owns export/import ResSchema and z.infer aliases', () => {
      expect(dto).toContain('Residual 791');
      expect(dto).toContain('export const ExportGoalsResSchema = z.object({');
      expect(dto).toContain('export type ExportGoalsRes = z.infer<typeof ExportGoalsResSchema>');
      expect(dto).toContain('export const ImportGoalsResSchema = z.object({');
      expect(dto).toContain('export type ImportGoalsRes = z.infer<typeof ImportGoalsResSchema>');
      expect(dto).not.toMatch(/export interface ExportGoalsRes\b/);
      expect(dto).not.toMatch(/export interface ImportGoalsRes\b/);
    });

    it('export data is string|Uint8Array union; import errors optional array', () => {
      expect(dto).toContain('z.custom<Uint8Array>((val) => val instanceof Uint8Array)');
      expect(dto).toContain('filename: z.string()');
      expect(dto).toContain('mimeType: z.string()');
      expect(dto).toContain('importedCount: z.number()');
      expect(dto).toContain('skippedCount: z.number()');
      expect(dto).toContain('line: z.number()');
      expect(dto).toContain('error: z.string()');
    });
  });
}

// --- merged from goal-aggregate-client-dto-dual.surface.spec.ts ---
{
  /** Residual 819: GoalClientDTO uses the sole GoalClientDTOSchema + z.infer. */
  describe('goal aggregate client dto dual retired (residual 819)', () => {
    const apiDir = __dirname;
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const goal = readFileSync(resolve(apiDir, '../aggregates/goal-client.ts'), 'utf8');

    it('owns GoalClientDTO as z.infer of GoalClientDTOSchema', () => {
      expect(goal).toContain('Residual 819');
      expect(goal).toContain("from '../api/response-schemas'");
      expect(goal).toContain('export type GoalClientDTO = z.infer<typeof GoalClientDTOSchema>');
      expect(goal).not.toMatch(/export interface GoalClientDTO\b/);
      expect(responseSchemas).toContain('export const GoalClientDTOSchema = z.object({');
      expect(responseSchemas).toContain('labels: z.array(GoalLabelProjectionSchema)');
      expect(responseSchemas).not.toContain('GoalFolderClientDTOSchema');
    });

    it('list and aggregate envelopes nest the canonical Goal read model', () => {
      expect(responseSchemas).toContain('data: z.array(GoalClientDTOSchema)');
      expect(responseSchemas).toContain('goal: GoalAggregateReadModelSchema');
      expect(responseSchemas).toContain('keyResults: z.array(KeyResultClientDTOSchema).nullable()');
      expect(responseSchemas).toContain('reviews: z.array(GoalReviewClientDTOSchema).nullable()');
    });
  });
}

// --- merged from goal-entity-client-dto-dual.surface.spec.ts ---
{
  /**
   * Residual 817: KeyResultClientDTO / GoalReviewClientDTO dual bodies retired.
   * Sole *ClientDTOSchema + z.infer (no ZodType<Interface> dual annotation).
   */
  describe('goal entity client dto duals retired (residual 817)', () => {
    const apiDir = __dirname;
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const keyResult = readFileSync(resolve(apiDir, '../entities/key-result-client.ts'), 'utf8');
    const review = readFileSync(resolve(apiDir, '../entities/goal-review-client.ts'), 'utf8');

    it('owns KeyResultClientDTO as z.infer of KeyResultClientDTOSchema', () => {
      expect(keyResult).toContain('Residual 817');
      expect(keyResult).toContain(
        'export type KeyResultClientDTO = z.infer<typeof KeyResultClientDTOSchema>',
      );
      expect(keyResult).not.toMatch(/export interface KeyResultClientDTO\b/);
      expect(responseSchemas).toContain('Residual 817');
      expect(responseSchemas).toContain('export const KeyResultClientDTOSchema = z.object({');
      expect(responseSchemas).not.toMatch(
        /export const KeyResultClientDTOSchema:\s*z\.ZodType<KeyResultClientDTO>/,
      );
    });

    it('owns GoalReviewClientDTO as z.infer of GoalReviewClientDTOSchema', () => {
      expect(review).toContain('Residual 817');
      expect(review).toContain(
        'export type GoalReviewClientDTO = z.infer<typeof GoalReviewClientDTOSchema>',
      );
      expect(review).not.toMatch(/export interface GoalReviewClientDTO\b/);
      expect(responseSchemas).toContain('export const GoalReviewClientDTOSchema = z.object({');
      expect(responseSchemas).not.toMatch(
        /export const GoalReviewClientDTOSchema:\s*z\.ZodType<GoalReviewClientDTO>/,
      );
      expect(responseSchemas).toContain('systemContext: GoalReviewSystemContextSchema');
      expect(responseSchemas).not.toContain('keyResultSnapshots:');
    });

    it('list envelopes nest KeyResult/GoalReview ClientDTOSchema arrays', () => {
      expect(responseSchemas).toContain('data: z.array(KeyResultClientDTOSchema)');
      expect(responseSchemas).toContain('data: z.array(GoalReviewClientDTOSchema)');
    });
  });
}

// --- merged from goal-id-params-dual.surface.spec.ts ---
{
  /**
   * Residual 677: goal-scoped list request dual bodies retired.
   * GetGoalReviewsReq / GetKeyResultsReq reuse GoalIdParamsSchema only.
   */
  describe('goal id params list dual retired (residual 677)', () => {
    const apiDir = __dirname;
    const crud = readFileSync(resolve(apiDir, 'goal-crud.dto.ts'), 'utf8');
    const review = readFileSync(resolve(apiDir, 'goal-review.dto.ts'), 'utf8');
    const keyResult = readFileSync(resolve(apiDir, 'key-result.dto.ts'), 'utf8');

    it('exports a single shared GoalIdParamsSchema', () => {
      expect(crud).toContain('Residual 677');
      expect(crud).toContain('export const GoalIdParamsSchema');
      expect(crud).toMatch(
        /export const GoalIdParamsSchema\s*=\s*z\.object\(\{\s*goalId:\s*brandedId<GoalId>\(\)/,
      );
    });

    it('review and key-result list reqs reuse GoalIdParamsSchema without dual bodies', () => {
      expect(review).toContain(
        'export type GetGoalReviewsReq = z.infer<typeof GoalIdParamsSchema>',
      );
      expect(review).not.toMatch(/export const GetGoalReviewsSchema\b/);
      expect(review).toContain("import { GoalIdParamsSchema } from './goal-crud.dto'");

      expect(keyResult).toContain('Residual 677');
      expect(keyResult).toContain(
        'export type GetKeyResultsReq = z.infer<typeof GoalIdParamsSchema>',
      );
      expect(keyResult).not.toMatch(/export const GetKeyResultsSchema\b/);
      expect(keyResult).toContain("import { GoalIdParamsSchema } from './goal-crud.dto'");
    });
  });
}

// --- merged from goal-list-res-dual.surface.spec.ts ---
{
  /**
   * Residual 689: goal list response dual bodies retired.
   * GetKeyResultsRes / GetGoalRecordsRes / GetGoalReviewsRes reuse *ListResSchema only (ClientDTO items).
 
   * Soft residual 815: GoalRecordClientDTO dual retired via GoalRecordClientDTOSchema
   * (see goal-record-client-dto-dual surface).
   * Soft residual 817: KeyResultClientDTO / GoalReviewClientDTO duals retired
   * (see goal-entity-client-dto-dual surface).
   * Soft residual 819: GoalClientDTO / GoalFolderClientDTO duals retired
   * (see goal-aggregate-client-dto-dual surface).*/
  describe('goal list response dual retired (residual 689)', () => {
    const apiDir = __dirname;
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const keyResult = readFileSync(resolve(apiDir, 'key-result.dto.ts'), 'utf8');
    const record = readFileSync(resolve(apiDir, 'goal-record.dto.ts'), 'utf8');
    const review = readFileSync(resolve(apiDir, 'goal-review.dto.ts'), 'utf8');

    it('exports list Res schemas with ClientDTO item arrays', () => {
      expect(responseSchemas).toContain('Residual 689');
      expect(responseSchemas).toContain('export const KeyResultListResSchema');
      expect(responseSchemas).toContain('export const GoalRecordListResSchema');
      expect(responseSchemas).toContain('export const GoalReviewListResSchema');
      expect(responseSchemas).toContain('data: z.array(KeyResultClientDTOSchema)');
      expect(responseSchemas).toContain('data: z.array(GoalRecordClientDTOSchema)');
      expect(responseSchemas).toContain('data: z.array(GoalReviewClientDTOSchema)');
    });

    it('semantic list Res types are z.infer aliases without interface dual bodies', () => {
      expect(keyResult).toContain('Residual 689');
      expect(keyResult).toContain(
        'export type GetKeyResultsRes = z.infer<typeof KeyResultListResSchema>',
      );
      expect(keyResult).not.toMatch(/export interface GetKeyResultsRes\b/);

      expect(record).toContain('Residual 689');
      expect(record).toContain(
        'export type GetGoalRecordsRes = z.infer<typeof GoalRecordListResSchema>',
      );
      expect(record).not.toMatch(/export interface GetGoalRecordsRes\b/);

      expect(review).toContain(
        'export type GetGoalReviewsRes = z.infer<typeof GoalReviewListResSchema>',
      );
      expect(review).not.toMatch(/export interface GetGoalReviewsRes\b/);
      expect(review).not.toMatch(/GoalReviewServerDTO/);
    });
  });
}

// --- merged from goal-record-client-dto-dual.surface.spec.ts ---
{
  /**
   * Residual 815: GoalRecordClientDTO dual body retired.
   * Sole GoalRecordClientDTOSchema + z.infer.
   */
  describe('goal record client dto dual retired (residual 815)', () => {
    const apiDir = __dirname;
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const aggregate = readFileSync(resolve(apiDir, '../aggregates/goal-record-client.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../goal/src/api/routes/goal-record.routes.ts'),
      'utf8',
    );

    it('owns GoalRecordClientDTO as z.infer of GoalRecordClientDTOSchema', () => {
      expect(aggregate).toContain('Residual 815');
      expect(aggregate).toContain("from '../api/response-schemas'");
      expect(aggregate).toContain(
        'export type GoalRecordClientDTO = z.infer<typeof GoalRecordClientDTOSchema>',
      );
      expect(aggregate).not.toMatch(/export interface GoalRecordClientDTO\b/);
    });

    it('GoalRecordClientDTOSchema owns value/valueAfter/comment fields', () => {
      expect(responseSchemas).toContain('Residual 815');
      expect(responseSchemas).toContain('export const GoalRecordClientDTOSchema = z.object({');
      expect(responseSchemas).toContain('value: z.number()');
      expect(responseSchemas).toContain('valueAfter: z.number()');
      expect(responseSchemas).toContain('comment: z.string().nullable()');
      expect(responseSchemas).toContain('keyResultId: brandedId<KeyResultId>()');
      expect(responseSchemas).toContain('goalId: brandedId<GoalId>()');
    });

    it('OpenAPI record mutations return aggregate receipts and list envelopes own record DTOs', () => {
      expect(routes).toContain('GoalMutationReceiptSchema');
      expect(responseSchemas).toContain('data: z.array(GoalRecordClientDTOSchema)');
      expect(responseSchemas).toContain('records: z.array(GoalRecordClientDTOSchema)');
      expect(responseSchemas).toContain('upserted: z.array(GoalRecordClientDTOSchema)');
    });
  });
}

// --- merged from goal-reminder-config-dual.surface.spec.ts ---
{
  /**
   * Residual 741: goal reminder-config dual bodies retired.
   * GoalReminderConfigDTO / ReminderTrigger reuse *Schema only.
   */
  describe('goal reminder-config dual retired (residual 741)', () => {
    const apiDir = __dirname;
    const vo = readFileSync(resolve(apiDir, '../value-objects/goal-reminder-config.ts'), 'utf8');
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');

    it('exports reminder-config schemas as sole shapes from VO module', () => {
      expect(vo).toContain('Residual 741');
      expect(vo).toContain('export const ReminderTriggerSchema = z.object({');
      expect(vo).toContain('export const GoalReminderConfigDTOSchema = z.object({');
    });

    it('semantic DTOs are z.infer aliases without interface dual bodies', () => {
      expect(vo).toContain('export type ReminderTrigger = z.infer<typeof ReminderTriggerSchema>');
      expect(vo).not.toMatch(/export interface ReminderTrigger\b/);
      expect(vo).toContain(
        'export type GoalReminderConfigDTO = z.infer<typeof GoalReminderConfigDTOSchema>',
      );
      expect(vo).not.toMatch(/export interface GoalReminderConfigDTO\b/);
    });

    it('response-schemas re-exports VO-owned schemas (no local dual bodies)', () => {
      expect(responseSchemas).toContain('Residual 741');
      expect(responseSchemas).toContain("from '../value-objects/goal-reminder-config'");
      expect(responseSchemas).toContain(
        'export { GoalReminderConfigDTOSchema, ReminderTriggerSchema }',
      );
      expect(responseSchemas).not.toMatch(/const ReminderTriggerSchema = z\.object\(\{/);
      expect(responseSchemas).not.toMatch(/const GoalReminderConfigDTOSchema = z\.object\(\{/);
      expect(responseSchemas).toContain('reminderConfig: GoalReminderConfigDTOSchema.nullable()');
    });
  });
}

// --- merged from goal-reminder-request-dual.surface.spec.ts ---
{
  /**
   * Residual 753: goal create/update reminder-config request dual retired.
   * Request reuses residual 741 VO schemas with request-only min/max refinements.
   */
  describe('goal reminder-config request dual retired (residual 753)', () => {
    const apiDir = __dirname;
    const crud = readFileSync(resolve(apiDir, 'goal-crud.dto.ts'), 'utf8');
    const vo = readFileSync(resolve(apiDir, '../value-objects/goal-reminder-config.ts'), 'utf8');

    it('imports VO-owned reminder schemas (no local dual bodies)', () => {
      expect(crud).toContain('Residual 753');
      expect(crud).toContain("from '../value-objects/goal-reminder-config'");
      expect(crud).toContain('GoalReminderConfigDTOSchema');
      expect(crud).toContain('ReminderTriggerSchema');
      expect(crud).not.toMatch(/const ReminderTriggerSchema = z\.object\(\{/);
      expect(crud).not.toMatch(/const GoalReminderConfigSchema = z\.object\(\{/);
    });

    it('composes request-only refinements on VO schemas', () => {
      expect(crud).toContain(
        'const GoalReminderConfigRequestSchema = GoalReminderConfigDTOSchema.extend({',
      );
      expect(crud).toContain('ReminderTriggerSchema.extend({ value: z.number().min(0) })');
      expect(crud).toContain('.max(10)');
      expect(crud).toContain(
        'reminderConfig: GoalReminderConfigRequestSchema.nullable().optional()',
      );
    });

    it('VO residual 741 ownership remains the sole transport/response shapes', () => {
      expect(vo).toContain('Residual 741');
      expect(vo).toContain('export const ReminderTriggerSchema = z.object({');
      expect(vo).toContain('export const GoalReminderConfigDTOSchema = z.object({');
    });
  });
}

// --- merged from key-result-progress-snapshot-dual.surface.spec.ts ---
{
  /**
   * Residual 737: goal key-result progress/snapshot dual bodies retired.
   * KeyResultProgressDTO / KeyResultSnapshotDTO reuse *DTOSchema only.
   */
  describe('goal key-result progress/snapshot dual retired (residual 737)', () => {
    const apiDir = __dirname;
    const progress = readFileSync(
      resolve(apiDir, '../value-objects/key-result-progress.ts'),
      'utf8',
    );
    const snapshot = readFileSync(
      resolve(apiDir, '../value-objects/key-result-snapshot.ts'),
      'utf8',
    );
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');

    it('exports canonical Measurement V2 progress/snapshot schemas from VO modules', () => {
      expect(progress).toContain('export const KeyResultProgressDTOSchema = z.object({');
      expect(progress).toContain('startingValue: z.number()');
      expect(progress).toContain('aggregationMethod: z.enum(KeyResultCalculationMethod)');
      expect(snapshot).toContain('export const KeyResultSnapshotDTOSchema = z.object({');
      expect(snapshot).toContain('progressPercentage: z.number().min(0).max(100)');
    });

    it('semantic DTOs are z.infer aliases without interface dual bodies', () => {
      expect(progress).toContain(
        'export type KeyResultProgressDTO = z.infer<typeof KeyResultProgressDTOSchema>',
      );
      expect(progress).not.toMatch(/export interface KeyResultProgressDTO\b/);
      expect(snapshot).toContain(
        'export type KeyResultSnapshot = z.infer<typeof KeyResultSnapshotDTOSchema>',
      );
      expect(snapshot).toContain('export type KeyResultSnapshotDTO = KeyResultSnapshot');
      expect(snapshot).not.toMatch(/export interface KeyResultSnapshotDTO\b/);
    });

    it('response-schemas re-exports VO-owned schemas (no local dual bodies)', () => {
      expect(responseSchemas).toContain('Residual 737');
      expect(responseSchemas).toContain("from '../value-objects/key-result-progress'");
      expect(responseSchemas).toContain("from '../value-objects/key-result-snapshot'");
      expect(responseSchemas).toContain(
        'export { KeyResultProgressDTOSchema, KeyResultSnapshotDTOSchema }',
      );
      expect(responseSchemas).not.toMatch(/const KeyResultProgressDTOSchema = z\.object\(\{/);
      expect(responseSchemas).not.toMatch(/const KeyResultSnapshotDTOSchema = z\.object\(\{/);
      expect(responseSchemas).toContain('progress: KeyResultProgressDTOSchema');
      expect(responseSchemas).toContain('systemContext: GoalReviewSystemContextSchema');
      expect(responseSchemas).not.toContain('keyResultSnapshots:');
    });
  });
}
