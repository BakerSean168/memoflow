/**
 * Dual registry suite (elegance E3b tax cut).
 * Merged 9 dual-retired surface locks from this directory.
 * Behavior/assertions preserved; individual *-dual.surface.spec.ts removed.
 * Sources: reminder-group-history-client-dto-dual.surface.spec.ts, reminder-hours-stats-dual.surface.spec.ts, reminder-list-res-dual.surface.spec.ts, reminder-operation-res-dual.surface.spec.ts, reminder-schedule-list-res-dual.surface.spec.ts, reminder-template-active-time-schedule-execution-dual.surface.spec.ts, reminder-template-request-active-time-dual.surface.spec.ts, reminder-trigger-notification-dual.surface.spec.ts, time-slot-dual.surface.spec.ts
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// --- merged from reminder-group-history-client-dto-dual.surface.spec.ts ---
{
  /**
   * Residual 827: ReminderGroupClientDTO / ReminderHistoryClientDTO dual bodies retired.
   * Sole *ResponseSchema + z.infer (semantic ClientDTO is z.infer alias).
   */
  describe('reminder group/history client dto duals retired (residual 827)', () => {
    const apiDir = __dirname;
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const group = readFileSync(
      resolve(apiDir, '../aggregates/reminder-group-client.ts'),
      'utf8',
    );
    const history = readFileSync(
      resolve(apiDir, '../entities/reminder-history-client.ts'),
      'utf8',
    );
    const groupRoutes = readFileSync(
      resolve(apiDir, '../../../../../reminder/src/api/routes/reminder-group.routes.ts'),
      'utf8',
    );
    const templateRoutes = readFileSync(
      resolve(apiDir, '../../../../../reminder/src/api/routes/reminder-template.routes.ts'),
      'utf8',
    );

    it('owns ReminderGroupClientDTO as z.infer of ReminderGroupResponseSchema', () => {
      expect(group).toContain('Residual 827');
      expect(group).toContain("from '../api/response-schemas'");
      expect(group).toContain(
        'export type ReminderGroupClientDTO = z.infer<typeof ReminderGroupResponseSchema>',
      );
      expect(group).not.toMatch(/export interface ReminderGroupClientDTO\b/);
      expect(responseSchemas).toContain('Residual 827');
      expect(responseSchemas).toContain(
        'export const ReminderGroupResponseSchema = z.object({',
      );
      expect(responseSchemas).toContain('stats: GroupStatsSchema');
    });

    it('owns ReminderHistoryClientDTO as z.infer of ReminderHistoryResponseSchema', () => {
      expect(history).toContain('Residual 827');
      expect(history).toContain("from '../api/response-schemas'");
      expect(history).toContain(
        'export type ReminderHistoryClientDTO = z.infer<typeof ReminderHistoryResponseSchema>',
      );
      expect(history).not.toMatch(/export interface ReminderHistoryClientDTO\b/);
      expect(responseSchemas).toContain(
        'export const ReminderHistoryResponseSchema = z.object({',
      );
      expect(responseSchemas).toContain(
        'notificationChannels: z.array(z.enum(NotificationChannel)).nullable()',
      );
    });

    it('OpenAPI group/history routes and list envelopes use ResponseSchemas', () => {
      expect(groupRoutes).toContain('ReminderGroupResponseSchema');
      expect(groupRoutes).toContain(
        "successResponse(ReminderGroupResponseSchema, '创建成功')",
      );
      expect(templateRoutes).toContain('ReminderHistoryResponseSchema');
      expect(templateRoutes).toContain(
        "successResponse(z.array(ReminderHistoryResponseSchema), '获取成功')",
      );
      expect(responseSchemas).toContain('groups: z.array(ReminderGroupResponseSchema)');
    });
  });
}

// --- merged from reminder-hours-stats-dual.surface.spec.ts ---
{
  /**
   * Residual 733: reminder active-hours / group-stats dual bodies retired.
   * ActiveHoursConfigDTO / GroupStatsDTO reuse *Schema only (VO-owned).
    *
   * Soft residual 827: ReminderGroupClientDTO dual retired via ReminderGroupResponseSchema
   * (see reminder-group-history-client-dto-dual surface).
    *
   * Soft residual 833: ActiveTimeConfigSchema also re-exported from VO (activatedAt)
   * (see reminder-template-active-time-schedule-execution-dual surface).
   */
  describe('reminder hours/stats dual retired (residual 733)', () => {
    const apiDir = __dirname;
    const hours = readFileSync(
      resolve(apiDir, '../value-objects/active-hours-config.ts'),
      'utf8',
    );
    const stats = readFileSync(resolve(apiDir, '../value-objects/group-stats.ts'), 'utf8');
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');

    it('exports hours/stats schemas as sole shapes from VO modules', () => {
      expect(hours).toContain('Residual 733');
      expect(hours).toContain('export const ActiveHoursConfigSchema = z.object({');
      expect(stats).toContain('Residual 733');
      expect(stats).toContain('export const GroupStatsSchema = z.object({');
    });

    it('semantic DTOs are z.infer aliases without interface dual bodies', () => {
      expect(hours).toContain(
        'export type ActiveHoursConfigDTO = z.infer<typeof ActiveHoursConfigSchema>',
      );
      expect(hours).not.toMatch(/export interface ActiveHoursConfigDTO\b/);
      expect(stats).toContain(
        'export type GroupStatsDTO = z.infer<typeof GroupStatsSchema>',
      );
      expect(stats).not.toMatch(/export interface GroupStatsDTO\b/);
    });

    it('response-schemas re-exports VO-owned schemas (no local dual bodies)', () => {
      expect(responseSchemas).toContain('Residual 733');
      expect(responseSchemas).toContain("from '../value-objects/active-hours-config'");
      expect(responseSchemas).toContain("from '../value-objects/group-stats'");
      expect(responseSchemas).toContain(
        'export { ActiveHoursConfigSchema, GroupStatsSchema, ActiveTimeConfigSchema }',
      );
      expect(responseSchemas).not.toMatch(
        /const ActiveHoursConfigSchema = z\.object\(\{/,
      );
      expect(responseSchemas).not.toMatch(
        /const GroupStatsSchema = z\.object\(\{/,
      );
      expect(responseSchemas).toContain('activeHours: ActiveHoursConfigSchema.nullable()');
      expect(responseSchemas).toContain('stats: GroupStatsSchema');
    });
  });
}

// --- merged from reminder-list-res-dual.surface.spec.ts ---
{
  /**
   * Residual 693: reminder list response dual bodies retired.
   * ReminderTemplateListRes / ReminderGroupListRes reuse *ListResponseSchema only.
   *
   * Soft residual 827: ReminderGroupClientDTO / ReminderHistoryClientDTO duals retired
   * (see reminder-group-history-client-dto-dual surface).
    *
   * Soft residual 833: ReminderTemplateClientDTO dual retired via ReminderTemplateResponseSchema; ActiveTime uses activatedAt
   * (see reminder-template-active-time-schedule-execution-dual surface).
   */
  describe('reminder list response dual retired (residual 693)', () => {
    const apiDir = __dirname;
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const templateDto = readFileSync(resolve(apiDir, 'reminder-template.dto.ts'), 'utf8');
    const groupDto = readFileSync(resolve(apiDir, 'reminder-group.dto.ts'), 'utf8');
    const templateRoutes = readFileSync(
      resolve(apiDir, '../../../../../reminder/src/api/routes/reminder-template.routes.ts'),
      'utf8',
    );
    const groupRoutes = readFileSync(
      resolve(apiDir, '../../../../../reminder/src/api/routes/reminder-group.routes.ts'),
      'utf8',
    );

    it('exports list Response schemas with template/group arrays', () => {
      expect(responseSchemas).toContain('Residual 693');
      expect(responseSchemas).toContain('export const ReminderTemplateListResponseSchema');
      expect(responseSchemas).toContain('export const ReminderGroupListResponseSchema');
      expect(responseSchemas).toContain('templates: z.array(ReminderTemplateResponseSchema)');
      expect(responseSchemas).toContain('groups: z.array(ReminderGroupResponseSchema)');
    });

    it('semantic list Res types are z.infer aliases without interface dual bodies', () => {
      expect(templateDto).toContain('Residual 693');
      expect(templateDto).toContain(
        'export type ReminderTemplateListRes = z.infer<typeof ReminderTemplateListResponseSchema>',
      );
      expect(templateDto).not.toMatch(/export interface ReminderTemplateListRes\b/);

      expect(groupDto).toContain('Residual 693');
      expect(groupDto).toContain(
        'export type ReminderGroupListRes = z.infer<typeof ReminderGroupListResponseSchema>',
      );
      expect(groupDto).not.toMatch(/export interface ReminderGroupListRes\b/);
    });

    it('OpenAPI reminder routes use list Response schemas only', () => {
      expect(templateRoutes).toContain('ReminderTemplateListResponseSchema');
      expect(templateRoutes).toContain('successResponse(ReminderTemplateListResponseSchema');
      expect(groupRoutes).toContain('ReminderGroupListResponseSchema');
      expect(groupRoutes).toContain('successResponse(ReminderGroupListResponseSchema');
    });
  });
}

// --- merged from reminder-operation-res-dual.surface.spec.ts ---
{
  /**
   * Residual 635: ReminderOperationRes / ReminderTriggerRes dual envelopes retired.
   * Reminder control success bodies use DTO / void / Result only (no { ok } dual-track).
   */
  const here = dirname(fileURLToPath(import.meta.url));

  function read(name: string): string {
    return readFileSync(join(here, name), 'utf8');
  }

  describe('reminder operation dual envelopes retired (residual 635)', () => {
    it('reminder-group.dto does not define ok dual operation responses', () => {
      const source = read('reminder-group.dto.ts');
      expect(source).toContain('Residual 635');
      expect(source).not.toMatch(/export interface ReminderOperationRes/);
      expect(source).not.toMatch(/export interface ReminderTriggerRes/);
      expect(source).not.toMatch(/export interface TemplateScheduleStatusRes/);
      expect(source).not.toMatch(/ok:\s*boolean/);
      expect(source).toContain('CreateReminderGroupRes = ReminderGroupClientDTO');
    });

    it('reminder RPC map uses DTO/void success bodies not OperationRes duals', () => {
      const rpc = readFileSync(join(here, '../protocol/reminder-rpc-map.ts'), 'utf8');
      expect(rpc).not.toContain('ReminderOperationRes');
      expect(rpc).not.toContain('ReminderTriggerRes');
      expect(rpc).toContain("'reminder:delete-template': [{ templateId: ReminderTemplateId }, void]");
      expect(rpc).toContain('ReminderTemplateClientDTO');
      expect(rpc).toContain('ReminderGroupClientDTO');
    });
  });
}

// --- merged from reminder-schedule-list-res-dual.surface.spec.ts ---
{
  /**
   * Residual 775: upcoming/today reminder schedule list Res duals retired.
   * Shared ReminderScheduleListResSchema; semantic Res are z.infer aliases.
   */
  describe('reminder schedule list res duals retired (residual 775)', () => {
    const apiDir = __dirname;
    const dto = readFileSync(resolve(apiDir, 'reminder-template.dto.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../reminder/src/api/routes/reminder-template.routes.ts'),
      'utf8',
    );

    it('owns shared list ResSchema and z.infer aliases', () => {
      expect(dto).toContain('Residual 775');
      expect(dto).toContain(
        'export const ReminderScheduleListResSchema = z.object({',
      );
      expect(dto).toContain(
        'export const GetUpcomingRemindersResSchema = ReminderScheduleListResSchema',
      );
      expect(dto).toContain(
        'export const GetReminderTodayScheduleResSchema = ReminderScheduleListResSchema',
      );
      expect(dto).toContain(
        'export type GetUpcomingRemindersRes = z.infer<typeof GetUpcomingRemindersResSchema>',
      );
      expect(dto).toContain(
        'export type GetReminderTodayScheduleRes = z.infer<typeof GetReminderTodayScheduleResSchema>',
      );
      expect(dto).not.toMatch(/export interface GetUpcomingRemindersRes\b/);
      expect(dto).not.toMatch(/export interface GetReminderTodayScheduleRes\b/);
    });

    it('OpenAPI routes use shared Res schemas without inline dual bodies', () => {
      expect(routes).toContain('GetUpcomingRemindersResSchema');
      expect(routes).toContain('GetReminderTodayScheduleResSchema');
      expect(routes).toContain(
        "successResponse(GetUpcomingRemindersResSchema, '获取成功')",
      );
      expect(routes).toContain(
        "successResponse(GetReminderTodayScheduleResSchema, '获取成功')",
      );
      expect(routes).not.toMatch(
        /successResponse\(\s*z\.object\(\{\s*data:\s*z\.array\(ReminderTodayScheduleItemSchema\)/,
      );
    });

    it('list items nest ReminderTodayScheduleItemSchema', () => {
      expect(dto).toContain(
        'export const ReminderTodayScheduleItemSchema = z.object({',
      );
      expect(dto).toContain(
        'data: z.array(ReminderTodayScheduleItemSchema)',
      );
    });
  });
}

// --- merged from reminder-template-active-time-schedule-execution-dual.surface.spec.ts ---
{
  /**
   * Residual 833: ActiveTimeConfigDTO / ReminderTemplateClientDTO / ScheduleExecutionClientDTO
   * dual bodies retired. Sole *Schema + z.infer; ActiveTime transport is activatedAt (not startDate/endDate).
    *
   * Soft residual 835: request ActiveTime dual also retired (Create/Update use ActiveTimeConfigSchema)
   * (see reminder-template-request-active-time-dual surface).
   */
  describe('reminder template activeTime + schedule execution duals retired (residual 833)', () => {
    const reminderApi = __dirname;
    const scheduleApi = resolve(reminderApi, '../../schedule/api');
    const activeTimeVo = readFileSync(
      resolve(reminderApi, '../value-objects/active-time-config.ts'),
      'utf8',
    );
    const template = readFileSync(
      resolve(reminderApi, '../aggregates/reminder-template-client.ts'),
      'utf8',
    );
    const execution = readFileSync(
      resolve(reminderApi, '../../schedule/entities/schedule-execution-client.ts'),
      'utf8',
    );
    const reminderSchemas = readFileSync(resolve(reminderApi, 'response-schemas.ts'), 'utf8');
    const scheduleSchemas = readFileSync(resolve(scheduleApi, 'response-schemas.ts'), 'utf8');

    it('owns ActiveTimeConfigDTO as z.infer(activatedAt); response reuses VO schema', () => {
      expect(activeTimeVo).toContain('Residual 833');
      expect(activeTimeVo).toContain('export const ActiveTimeConfigSchema = z.object({');
      expect(activeTimeVo).toContain('activatedAt: z.number()');
      expect(activeTimeVo).toContain(
        'export type ActiveTimeConfigDTO = z.infer<typeof ActiveTimeConfigSchema>',
      );
      expect(activeTimeVo).not.toMatch(/export interface ActiveTimeConfigDTO\b/);
      expect(activeTimeVo).not.toMatch(/startDate\s*:/);
      expect(activeTimeVo).not.toMatch(/endDate\s*:/);
      expect(reminderSchemas).toContain('Residual 833');
      expect(reminderSchemas).toContain("from '../value-objects/active-time-config'");
      expect(reminderSchemas).toContain('activeTime: ActiveTimeConfigSchema');
      expect(reminderSchemas).not.toMatch(/const ActiveTimeConfigSchema = z\.object/);
      expect(reminderSchemas).not.toMatch(/startDate: z\.number\(\)/);
      expect(reminderSchemas).not.toMatch(/endDate: z\.number\(\)/);
    });

    it('owns ReminderTemplateClientDTO as z.infer of ReminderTemplateResponseSchema', () => {
      expect(template).toContain('Residual 833');
      expect(template).toContain(
        'export type ReminderTemplateClientDTO = z.infer<typeof ReminderTemplateResponseSchema>',
      );
      expect(template).not.toMatch(/export interface ReminderTemplateClientDTO\b/);
      expect(reminderSchemas).toContain(
        'export const ReminderTemplateResponseSchema = z.object({',
      );
      expect(reminderSchemas).toContain('history: z.array(z.lazy(() => ReminderHistoryResponseSchema)).nullable()');
    });

    it('owns ScheduleExecutionClientDTO as z.infer of exported ScheduleExecutionResponseSchema', () => {
      expect(execution).toContain('Residual 833');
      expect(execution).toContain(
        'export type ScheduleExecutionClientDTO = z.infer<typeof ScheduleExecutionResponseSchema>',
      );
      expect(execution).not.toMatch(/export interface ScheduleExecutionClientDTO\b/);
      expect(scheduleSchemas).toContain('Residual 833');
      expect(scheduleSchemas).toContain(
        'export const ScheduleExecutionResponseSchema = z.object({',
      );
      expect(scheduleSchemas).not.toMatch(
        /const ScheduleExecutionResponseSchema:\s*z\.ZodType</,
      );
      expect(scheduleSchemas).toContain(
        'executions: z.array(ScheduleExecutionResponseSchema).nullable()',
      );
    });
  });
}

// --- merged from reminder-template-request-active-time-dual.surface.spec.ts ---
{
  /**
   * Residual 835: Create/Update ReminderTemplate request ActiveTime dual retired.
   * Request reuses ActiveTimeConfigSchema (activatedAt); no startDate/endDate request dual.
   * Create/update use-cases pass activeTime through without startDate mapping.
   */
  describe('reminder template request activeTime dual retired (residual 835)', () => {
    const apiDir = __dirname;
    const dto = readFileSync(resolve(apiDir, 'reminder-template.dto.ts'), 'utf8');
    const createUc = readFileSync(
      resolve(
        apiDir,
        '../../../../../reminder/src/server/application/use-cases/commands/create-reminder-template.use-case.ts',
      ),
      'utf8',
    );
    const updateUc = readFileSync(
      resolve(
        apiDir,
        '../../../../../reminder/src/server/application/use-cases/commands/update-reminder-template.use-case.ts',
      ),
      'utf8',
    );
    const dialog = readFileSync(
      resolve(
        apiDir,
        '../../../../../app-vue/src/modules/reminder/components/TemplateDialog.vue',
      ),
      'utf8',
    );

    it('CreateReminderTemplateSchema reuses ActiveTimeConfigSchema (activatedAt)', () => {
      expect(dto).toContain('Residual 835');
      expect(dto).toContain("from '../value-objects/active-time-config'");
      expect(dto).toContain('activeTime: ActiveTimeConfigSchema');
      expect(dto).not.toMatch(/activeTime:\s*z\.object\(\{\s*startDate:/);
      expect(dto).not.toMatch(/endDate:\s*z\.number\(\)\.nullable\(\)/);
    });

    it('create/update use-cases pass activeTime without startDate mapping', () => {
      expect(createUc).toContain('activeTime: input.activeTime');
      expect(createUc).not.toMatch(/activatedAt:\s*input\.activeTime\.startDate/);
      expect(updateUc).toContain('activeTime: request.activeTime');
      expect(updateUc).not.toMatch(/activatedAt:\s*request\.activeTime\.startDate/);
    });

    it('TemplateDialog create payload uses activatedAt only', () => {
      expect(dialog).toContain('Residual 835');
      expect(dialog).toContain('activatedAt: Date.now()');
      expect(dialog).not.toMatch(/startDate:\s*Date\.now\(\)/);
      expect(dialog).not.toMatch(/endDate:\s*null/);
    });
  });
}

// --- merged from reminder-trigger-notification-dual.surface.spec.ts ---
{
  /**
   * Residual 735: reminder trigger/notification config dual bodies retired.
   * TriggerConfigDTO / NotificationConfigDTO (+ nested) reuse *Schema only.
   */
  describe('reminder trigger/notification dual retired (residual 735)', () => {
    const apiDir = __dirname;
    const trigger = readFileSync(
      resolve(apiDir, '../value-objects/trigger-config.ts'),
      'utf8',
    );
    const notification = readFileSync(
      resolve(apiDir, '../value-objects/notification-config.ts'),
      'utf8',
    );
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');

    it('exports trigger/notification schemas as sole shapes from VO modules', () => {
      expect(trigger).toContain('Residual 735');
      expect(trigger).toContain('export const TriggerConfigSchema = z.object({');
      expect(trigger).toContain('export const FixedTimeTriggerSchema = z.object({');
      expect(notification).toContain('Residual 735');
      expect(notification).toContain(
        'export const NotificationConfigSchema = z.object({',
      );
    });

    it('semantic DTOs are z.infer aliases without interface dual bodies', () => {
      expect(trigger).toContain(
        'export type TriggerConfigDTO = z.infer<typeof TriggerConfigSchema>',
      );
      expect(trigger).not.toMatch(/export interface TriggerConfigDTO\b/);
      expect(trigger).not.toMatch(/export interface FixedTimeTrigger\b/);
      expect(trigger).not.toMatch(/export interface IntervalTrigger\b/);
      expect(notification).toContain(
        'export type NotificationConfigDTO = z.infer<typeof NotificationConfigSchema>',
      );
      expect(notification).not.toMatch(/export interface NotificationConfigDTO\b/);
      expect(notification).not.toMatch(/export interface SoundConfig\b/);
      expect(notification).not.toMatch(/export interface VibrationConfig\b/);
      expect(notification).not.toMatch(/export interface NotificationActionConfig\b/);
    });

    it('response-schemas re-exports VO-owned schemas (no local dual bodies)', () => {
      expect(responseSchemas).toContain('Residual 735');
      expect(responseSchemas).toContain("from '../value-objects/trigger-config'");
      expect(responseSchemas).toContain("from '../value-objects/notification-config'");
      expect(responseSchemas).toContain(
        'export { TriggerConfigSchema, NotificationConfigSchema }',
      );
      expect(responseSchemas).not.toMatch(
        /const TriggerConfigSchema = z\.object\(\{/,
      );
      expect(responseSchemas).not.toMatch(
        /const NotificationConfigSchema = z\.object\(\{/,
      );
      expect(responseSchemas).toContain('trigger: TriggerConfigSchema');
      expect(responseSchemas).toContain(
        'notificationConfig: NotificationConfigSchema',
      );
    });
  });
}

// --- merged from time-slot-dual.surface.spec.ts ---
{
  /**
   * Residual 751: reminder TimeSlot dual body retired.
   * TimeSlotDTO reuses TimeSlotSchema only.
    *
   * Soft residual 829: UserReminderPreferencesClientDTO dual retired via UserReminderPreferencesResponseSchema
   * (see notification-preference-calendar-prefs-client-dto-dual surface).
    *
   * Soft residual 833: ActiveTimeConfigDTO dual retired via ActiveTimeConfigSchema (activatedAt)
   * (see reminder-template-active-time-schedule-execution-dual surface).
   */
  describe('reminder time-slot dual retired (residual 751)', () => {
    const apiDir = __dirname;
    const vo = readFileSync(resolve(apiDir, '../value-objects/time-slot.ts'), 'utf8');
    const aggregate = readFileSync(
      resolve(apiDir, '../aggregates/user-reminder-preferences-server.ts'),
      'utf8',
    );
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');

    it('exports TimeSlotSchema as sole shape from VO module', () => {
      expect(vo).toContain('Residual 751');
      expect(vo).toContain('export const TimeSlotSchema = z.object({');
    });

    it('semantic DTO is z.infer alias without interface dual body', () => {
      expect(vo).toContain(
        'export type TimeSlotDTO = z.infer<typeof TimeSlotSchema>',
      );
      expect(vo).not.toMatch(/export interface TimeSlotDTO\b/);
      expect(aggregate).toContain("from '../value-objects/time-slot'");
      expect(aggregate).not.toMatch(/export interface TimeSlotDTO\b/);
    });

    it('response-schemas re-exports VO-owned schema (no local dual body)', () => {
      expect(responseSchemas).toContain('Residual 751');
      expect(responseSchemas).toContain("from '../value-objects/time-slot'");
      expect(responseSchemas).toContain('export { TimeSlotSchema }');
      expect(responseSchemas).not.toMatch(/const TimeSlotSchema = z\.object\(\{/);
      expect(responseSchemas).toContain('bestTimeSlots: z.array(TimeSlotSchema)');
      expect(responseSchemas).toContain('worstTimeSlots: z.array(TimeSlotSchema)');
    });
  });
}
