import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Notification ownership surface (stage-6 residual 126):
 * Residual 178 collapses bare findById dual method.
 * get/mark-read/delete/batch paths must never authorize by bare
 * notification primary key alone.
 */
describe('notification ownership surface', () => {
  const port = readFileSync(
    resolve(__dirname, '../../../../domain/repositories/i-notification-repository.ts'),
    'utf8',
  );
  const prisma = readFileSync(resolve(__dirname, '../notification-prisma.repository.ts'), 'utf8');
  const powersync = readFileSync(
    resolve(__dirname, '../../powersync/notification-powersync.repository.ts'),
    'utf8',
  );
  const queryService = readFileSync(
    resolve(
      __dirname,
      '../../../../application/services/notification-query-application-service.ts',
    ),
    'utf8',
  );
  const markRead = readFileSync(
    resolve(
      __dirname,
      '../../../../application/use-cases/commands/mark-notification-as-read.use-case.ts',
    ),
    'utf8',
  );
  const maintenance = readFileSync(
    resolve(
      __dirname,
      '../../../../application/services/notification-maintenance-application-service.ts',
    ),
    'utf8',
  );
  const routes = readFileSync(resolve(__dirname, '../../../../../api/routes.ts'), 'utf8');
  const electron = readFileSync(resolve(__dirname, '../../../../../electron/index.ts'), 'utf8');
  const module = readFileSync(resolve(__dirname, '../../../notification.module.ts'), 'utf8');
  it('uses the application use case/repository fence after retiring the legacy domain-service authority', () => {
    expect(port).toContain('findByIdempotencyKey(identityId: string, idempotencyKey: string)');
    expect(prisma).toContain('identityId_idempotencyKey');
    expect(powersync).toContain('identity_id = ? AND idempotency_key = ?');
  });

  it('port drops bare findById dual method (residual 178)', () => {
    expect(port).not.toMatch(/findById\(\s*\n\s*id: string,/);
    expect(port).not.toContain(
      'findById(id: string, options?: { includeChildren?: boolean }): Promise<Notification | null>;',
    );
    expect(prisma).not.toMatch(/async findById\(\s*\n\s*id: string,/);
    expect(powersync).not.toMatch(/async findById\(\s*\n\s*id: string,/);
  });

  it('port findByIdForIdentity requires identityId', () => {
    expect(port).toContain('findByIdForIdentity(');
    expect(port).toContain('findByIdForIdentity(\n    identityId: string,\n    id: string,');
  });

  it('prisma filters by id + identityId', () => {
    expect(prisma).toContain('where: { id, identityId }');
    expect(prisma).toContain('async findByIdForIdentity(');
  });

  it('mark-read and delete load via findByIdForIdentity', () => {
    expect(markRead).toContain('findByIdForIdentity(identityId, id)');
    expect(markRead).toContain('execute(id: string, identityId: string)');
    expect(maintenance).toContain('findByIdForIdentity(identityId, id)');
    expect(maintenance).toContain('findByIdForIdentity(data.identityId, id)');
  });

  it('module api retires arbitrary Fact update authority while preserving identity-scoped mutations', () => {
    expect(module).not.toContain('UpdateNotificationUseCase');
    expect(module).not.toContain('updateNotification:');
    expect(module).toContain('getNotification: async (id, identityId) =>');
    expect(module).toContain('deleteNotification: async (id, identityId) =>');
    expect(module).toContain('markAsRead: async (id, identityId) =>');
    expect(module).toContain('batchDelete: async (data, identityId) =>');
  });

  it('HTTP and Electron notification get/delete/mark-read pass identity context (Phase 4)', () => {
    // Read/query routes keep expressAdapter with controller-side identity scope.
    expect(routes).toContain('controller.get(req.params!.id, ctx)');

    // Phase 4: mutation routes bind contract invocation schemas through the
    // validation-aware registrar; the controller still receives the canonical
    // identity-bearing context.
    expect(routes).toContain('routeWithValidation');
    expect(routes).toMatch(/controller\.delete\(data\.params\.id, ctx\)/);
    expect(routes).toMatch(/controller\.markAsRead\(data\.params\.id, ctx\)/);
    expect(routes).toMatch(/controller\.batchDelete\(data, ctx\)/);
    expect(electron).toContain('withAuthenticatedValidation');
    expect(electron).toMatch(
      /NotificationChannels\.GET[\s\S]*controller\.get\([\s\S]*requestContext/,
    );
    expect(electron).toMatch(
      /NotificationChannels\.MARK_READ[\s\S]*controller\.markAsRead\([\s\S]*requestContext/,
    );
    expect(electron).toMatch(
      /NotificationChannels\.DELETE[\s\S]*controller\.delete\([\s\S]*requestContext/,
    );
    expect(electron).not.toContain('controller.get(id));');
    expect(electron).not.toContain('controller.markAsRead(id));');
  });

  it('port delete/related/markMany require identityId (residual 150)', () => {
    expect(port).toContain(
      'findByRelatedEntity(\n    identityId: string,\n    relatedEntityType: string,',
    );
    expect(port).toContain('delete(identityId: string, id: string): Promise<void>;');
    expect(port).toContain('deleteMany(identityId: string, ids: string[]): Promise<void>;');
    expect(port).toContain('softDelete(identityId: string, id: string): Promise<void>;');
    expect(port).toContain('exists(identityId: string, id: string): Promise<boolean>;');
    expect(port).toContain('markManyAsRead(identityId: string, ids: string[]): Promise<void>;');
  });

  it('prisma delete/related/markMany filter by identityId (residual 150)', () => {
    expect(prisma).toContain('async findByRelatedEntity(');
    expect(prisma).toContain('identityId,\n        relatedEntityType,\n        relatedEntityId,');
    expect(prisma).toContain('async delete(identityId: string, id: string)');
    expect(prisma).toContain('where: { id, identityId }');
    expect(prisma).toContain('where: { id: { in: ids }, identityId }');
    expect(prisma).toContain(
      "throw new Error('Notification not found for the current identity.');",
    );
  });

  it('powersync delete/related filter by identity_id (residual 150)', () => {
    expect(powersync).toContain('DELETE FROM notifications WHERE id = ? AND identity_id = ?');
    expect(powersync).toContain(
      'DELETE FROM notifications WHERE identity_id = ? AND id IN (${placeholders})',
    );
    expect(powersync).toContain('related_entity_type = ?');
    expect(powersync).toContain('related_entity_id = ?');
  });

  it('query and maintenance paths pass identity into related/delete after domain-service retirement', () => {
    expect(queryService).toContain(
      'findByRelatedEntity(\n          query.identityId,\n          query.relatedEntityType,',
    );
    expect(maintenance).toContain('deleteMany(data.identityId, expiredIds)');
  });
});
