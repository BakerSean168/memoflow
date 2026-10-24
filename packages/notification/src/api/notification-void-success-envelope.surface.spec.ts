import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Notification void/batch envelope surface (stage-6 residual 92):
 * single delete uses z.null()/ok(null);
 * batch delete/cleanup use BatchOperationResultDTO { deletedCount }
 * Soft residual 799: BatchOperationResultDTO is z.infer of NotificationBatchResultSchema (contracts).
 * (no { success, affected } dual-track); mark-all/batch-read align count shapes.
 */
describe('notification void success envelope surface', () => {
  const routes = readFileSync(resolve(__dirname, './routes.ts'), 'utf8');
  const controller = readFileSync(
    resolve(__dirname, '../server/transport/notification.controller.ts'),
    'utf8',
  );
  const electron = readFileSync(resolve(__dirname, '../electron/index.ts'), 'utf8');
  const maintenance = readFileSync(
    resolve(
      __dirname,
      '../server/application/services/notification-maintenance-application-service.ts',
    ),
    'utf8',
  );
  const responseSchemas = readFileSync(
    resolve(__dirname, '../../../contracts/src/modules/notification/api/response-schemas.ts'),
    'utf8',
  );

  it('OpenAPI single delete uses z.null(); batch uses NotificationBatchResultSchema', () => {
    expect(routes).toContain("successResponse(z.null(), '删除成功')");
    expect(routes).toContain("successResponse(NotificationBatchResultSchema, '删除成功')");
    expect(routes).toContain("successResponse(NotificationBatchResultSchema, '清理成功')");
    expect(responseSchemas).toContain('deletedCount: z.number().optional()');
    expect(responseSchemas).toContain('updatedCount: z.number().optional()');
  });

  it('maintenance service returns deletedCount without success boolean dual-track', () => {
    expect(maintenance).toContain('deletedCount');
    expect(maintenance).not.toContain('success: true');
    expect(maintenance).not.toContain('affected:');
  });

  it('controller normalizes void delete and count envelopes', () => {
    expect(controller).toMatch(/async delete[\s\S]*?Promise<Result<null>>/);
    expect(controller).toContain('return ok(null)');
    expect(controller).toContain('return ok({ count })');
    expect(controller).toContain('return ok({ updatedCount })');
    expect(controller).toContain('return ok({ deletedCount:');
  });

  it('Desktop IPC DELETE normalizes to ok(null)', () => {
    expect(electron).toContain('NotificationChannels.DELETE');
    expect(electron).toContain('return ok(null)');
  });
});
