/**
 * Dual registry suite (elegance E3b tax cut).
 * Merged 6 dual-retired surface locks from this directory.
 * Behavior/assertions preserved; individual *-dual.surface.spec.ts removed.
 * Sources: notification-batch-result-dual.surface.spec.ts, notification-ids-batch-dual.surface.spec.ts, notification-preference-calendar-prefs-client-dto-dual.surface.spec.ts, unread-count-res-dual.surface.spec.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// --- merged from notification-batch-result-dual.surface.spec.ts ---
{
  /**
   * Residual 799: BatchOperationResultDTO dual body retired.
   * Sole NotificationBatchResultSchema + z.infer (updatedCount/deletedCount optional).
   */
  describe('notification batch result dual retired (residual 799)', () => {
    const apiDir = __dirname;
    const dto = readFileSync(resolve(apiDir, '../dtos/batch-result.dto.ts'), 'utf8');
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const batchDto = readFileSync(resolve(apiDir, 'notification-batch.dto.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../notification/src/api/routes.ts'),
      'utf8',
    );

    it('owns BatchOperationResultDTO as z.infer of NotificationBatchResultSchema', () => {
      expect(dto).toContain('Residual 799');
      expect(dto).toContain("from '../api/response-schemas'");
      expect(dto).toContain(
        'export type BatchOperationResultDTO = z.infer<typeof NotificationBatchResultSchema>',
      );
      expect(dto).not.toMatch(/export interface BatchOperationResultDTO\b/);
    });

    it('NotificationBatchResultSchema is sole batch-result shape with optional counts', () => {
      expect(responseSchemas).toContain('Residual 799');
      expect(responseSchemas).toContain('export const NotificationBatchResultSchema = z.object({');
      expect(responseSchemas).toContain('updatedCount: z.number().optional()');
      expect(responseSchemas).toContain('deletedCount: z.number().optional()');
    });

    it('batch Res aliases and OpenAPI routes reuse the sole batch result shape', () => {
      expect(batchDto).toContain('Residual 799');
      expect(batchDto).toContain('export type MarkAsReadBatchRes = BatchOperationResultDTO');
      expect(batchDto).toContain(
        'export type DeleteNotificationsBatchRes = BatchOperationResultDTO',
      );
      expect(batchDto).toContain(
        'export type CleanupOldNotificationsRes = BatchOperationResultDTO',
      );
      expect(routes).toContain('NotificationBatchResultSchema');
      const hits = routes.split('NotificationBatchResultSchema').length - 1;
      expect(hits).toBeGreaterThanOrEqual(3);
    });
  });
}

// --- merged from notification-ids-batch-dual.surface.spec.ts ---
{
  /**
   * Residual 671: notification mark-read / batch-delete request dual bodies retired.
   * Both operations use NotificationIdsBatchSchema only.
   * Soft residual 799: BatchOperationResultDTO dual retired via NotificationBatchResultSchema
   * (see notification-batch-result-dual surface; not asserted here to avoid dual-surface lock drift).
   */
  describe('notification ids batch request dual retired (residual 671)', () => {
    const apiDir = __dirname;
    const dto = readFileSync(resolve(apiDir, 'notification-batch.dto.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../notification/src/api/routes.ts'),
      'utf8',
    );
    const controller = readFileSync(
      resolve(
        apiDir,
        '../../../../../notification/src/server/transport/notification.controller.ts',
      ),
      'utf8',
    );

    it('exports a single shared notification id-batch schema', () => {
      expect(dto).toContain('Residual 671');
      expect(dto).toContain('export const NotificationIdsBatchSchema');
      expect(dto).toContain(
        'export type MarkAsReadBatchReq = z.infer<typeof NotificationIdsBatchSchema>',
      );
      expect(dto).toContain(
        'export type DeleteNotificationsBatchReq = z.infer<typeof NotificationIdsBatchSchema>',
      );
      expect(dto).not.toMatch(/export const MarkAsReadBatchSchema\b/);
      expect(dto).not.toMatch(/export const DeleteNotificationsBatchSchema\b/);
    });

    it('routes and controller use the shared id-batch schema for both ops (Phase 4)', () => {
      // Phase 4: batch routes bind NotificationIdsBatchSchema through the
      // validation adapters; the controller accepts inferred input types.
      expect(routes).toContain('NotificationIdsBatchSchema');
      expect(routes).not.toContain('MarkAsReadBatchSchema');
      expect(routes).not.toContain('DeleteNotificationsBatchSchema');
      expect(routes).toContain('routeWithValidation');
      expect(controller).toContain('MarkAsReadBatchReq');
      expect(controller).toContain('DeleteNotificationsBatchReq');
      expect(controller).not.toContain('MarkAsReadBatchSchema');
      expect(controller).not.toContain('DeleteNotificationsBatchSchema');
      const routeHits = routes.split('schema: NotificationIdsBatchSchema').length - 1;
      expect(routeHits).toBeGreaterThanOrEqual(2);
      expect(controller).not.toContain('NotificationIdsBatchSchema.safeParse');
    });
  });
}

// --- merged from notification-preference-calendar-prefs-client-dto-dual.surface.spec.ts ---
{
  /**
   * Residual 829: NotificationPreferenceClientDTO / CalendarEntryClientDTO /
   * UserReminderPreferencesClientDTO dual bodies retired.
   * Sole *ResponseSchema + z.infer (semantic ClientDTO is z.infer alias).
   */
  describe('preference/calendar client dto duals retired (residual 829)', () => {
    const notifApi = __dirname;
    const scheduleApi = resolve(notifApi, '../../schedule/api');
    const reminderApi = resolve(notifApi, '../../reminder/api');
    const notifAgg = resolve(notifApi, '../aggregates/notification-preference-client.ts');
    const scheduleAgg = resolve(notifApi, '../../schedule/aggregates/calendar-entry-client.ts');
    const reminderAgg = resolve(
      notifApi,
      '../../reminder/aggregates/user-reminder-preferences-server.ts',
    );

    it('owns NotificationPreferenceClientDTO as z.infer of NotificationPreferenceResponseSchema', () => {
      const aggregate = readFileSync(notifAgg, 'utf8');
      const schemas = readFileSync(resolve(notifApi, 'response-schemas.ts'), 'utf8');
      const routes = readFileSync(
        resolve(notifApi, '../../../../../notification/src/api/routes.ts'),
        'utf8',
      );
      expect(aggregate).toContain('Residual 829');
      expect(aggregate).toContain(
        'export type NotificationPreferenceClientDTO = z.infer<typeof NotificationPreferenceResponseSchema>',
      );
      expect(aggregate).not.toMatch(/export interface NotificationPreferenceClientDTO\b/);
      expect(schemas).toContain('Residual 829');
      expect(schemas).toContain('export const NotificationPreferenceResponseSchema = z.object({');
      expect(routes).toContain("successResponse(NotificationPreferenceResponseSchema, '获取成功')");
    });

    it('owns CalendarEntryClientDTO as z.infer of CalendarEntryResponseSchema', () => {
      const aggregate = readFileSync(scheduleAgg, 'utf8');
      const schemas = readFileSync(resolve(scheduleApi, 'response-schemas.ts'), 'utf8');
      const routes = readFileSync(
        resolve(scheduleApi, '../../../../../schedule/src/api/schedule-event.routes.ts'),
        'utf8',
      );
      expect(aggregate).toContain('Residual 829');
      expect(aggregate).toContain(
        'export type CalendarEntryClientDTO = z.infer<typeof CalendarEntryResponseSchema>',
      );
      expect(aggregate).not.toMatch(/export interface CalendarEntryClientDTO\b/);
      expect(schemas).toContain('Residual 829');
      expect(schemas).toContain('export const CalendarEntryResponseSchema = z.object({');
      expect(routes).toContain('CalendarEntryResponseSchema');
      expect(routes).toContain("successResponse(z.array(CalendarEntryResponseSchema), '获取成功')");
    });

    it('owns UserReminderPreferencesClientDTO as z.infer of UserReminderPreferencesResponseSchema', () => {
      const aggregate = readFileSync(reminderAgg, 'utf8');
      const schemas = readFileSync(resolve(reminderApi, 'response-schemas.ts'), 'utf8');
      const routes = readFileSync(
        resolve(
          reminderApi,
          '../../../../../reminder/src/api/routes/reminder-preferences.routes.ts',
        ),
        'utf8',
      );
      expect(aggregate).toContain('Residual 829');
      expect(aggregate).toContain(
        'export type UserReminderPreferencesClientDTO = z.infer<typeof UserReminderPreferencesResponseSchema>',
      );
      expect(aggregate).not.toMatch(/export interface UserReminderPreferencesClientDTO\b/);
      expect(aggregate).toMatch(/export interface UserReminderPreferencesServerDTO\b/);
      expect(schemas).toContain('Residual 829');
      expect(schemas).toContain('export const UserReminderPreferencesResponseSchema = z.object({');
      expect(routes).toContain(
        "successResponse(UserReminderPreferencesResponseSchema, '获取成功')",
      );
    });
  });
}

// --- merged from unread-count-res-dual.surface.spec.ts ---
{
  /**
   * Residual 801: UnreadCountResponse dual body retired.
   * Sole UnreadCountResponseSchema + z.infer owned by contracts response-schemas.
   * Notification package port re-exports the contracts type (no local interface dual).
   *
   * Soft residual 829: NotificationPreferenceClientDTO dual retired via NotificationPreferenceResponseSchema
   * (see notification-preference-calendar-prefs-client-dto-dual surface).
   */
  describe('notification unread count res dual retired (residual 801)', () => {
    const apiDir = __dirname;
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const port = readFileSync(
      resolve(
        apiDir,
        '../../../../../notification/src/application-client/ports/notification-api-client.port.ts',
      ),
      'utf8',
    );
    const routes = readFileSync(
      resolve(apiDir, '../../../../../notification/src/api/routes.ts'),
      'utf8',
    );

    it('owns UnreadCountResponse as z.infer of UnreadCountResponseSchema', () => {
      expect(responseSchemas).toContain('Residual 801');
      expect(responseSchemas).toContain('export const UnreadCountResponseSchema = z.object({');
      expect(responseSchemas).toContain(
        'export type UnreadCountResponse = z.infer<typeof UnreadCountResponseSchema>',
      );
      expect(responseSchemas).toContain('count: z.number()');
    });

    it('notification port re-exports contracts UnreadCountResponse without interface dual', () => {
      expect(port).toContain('Residual 801');
      expect(port).toContain('UnreadCountResponse');
      expect(port).toContain("from '@memoflow/contracts/notification'");
      expect(port).toContain('export type { UnreadCountResponse }');
      expect(port).not.toMatch(/export interface UnreadCountResponse\b/);
    });

    it('OpenAPI routes use UnreadCountResponseSchema only', () => {
      expect(routes).toContain('UnreadCountResponseSchema');
      const hits = routes.split('UnreadCountResponseSchema').length - 1;
      expect(hits).toBeGreaterThanOrEqual(2);
    });
  });
}
