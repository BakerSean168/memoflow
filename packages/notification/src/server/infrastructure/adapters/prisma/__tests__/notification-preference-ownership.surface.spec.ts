import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('notification preference ownership and product/operations split', () => {
  const preferencePort = readFileSync(
    resolve(__dirname, '../../../../domain/repositories/i-notification-preference-repository.ts'), 'utf8');
  const prisma = readFileSync(resolve(__dirname, '../notification-preference-prisma.repository.ts'), 'utf8');
  const powersync = readFileSync(resolve(__dirname, '../../powersync/notification-preference-powersync.repository.ts'), 'utf8');
  const useCase = readFileSync(resolve(__dirname, '../../../../application/use-cases/commands/update-notification-preference.use-case.ts'), 'utf8');
  const inboxPort = readFileSync(resolve(__dirname, '../../../../application/notification-inbox.port.ts'), 'utf8');
  const operationsPort = readFileSync(resolve(__dirname, '../../../../application/notification-operations.port.ts'), 'utf8');
  const moduleSource = readFileSync(resolve(__dirname, '../../../notification.module.ts'), 'utf8');
  const routes = readFileSync(resolve(__dirname, '../../../../../api/routes.ts'), 'utf8');
  const controller = readFileSync(resolve(__dirname, '../../../../transport/notification.controller.ts'), 'utf8');
  const electron = readFileSync(resolve(__dirname, '../../../../../electron/index.ts'), 'utf8');
  const channels = readFileSync(resolve(__dirname, '../../../../../../../contracts/src/electron/ipc-channels.ts'), 'utf8');
  const clientPort = readFileSync(resolve(__dirname, '../../../../../application-client/ports/notification-api-client.port.ts'), 'utf8');
  const httpAdapter = readFileSync(resolve(__dirname, '../../../../../infrastructure-client/adapters/http/notification-http.adapter.ts'), 'utf8');
  const ipcAdapter = readFileSync(resolve(__dirname, '../../../../../infrastructure-client/adapters/ipc/notification-ipc.adapter.ts'), 'utf8');

  it('preference persistence never authorizes by bare preference primary key', () => {
    expect(preferencePort).toContain('findByIdForIdentity(identityId: string, id: string)');
    expect(preferencePort).toContain('delete(identityId: string, id: string)');
    expect(preferencePort).not.toContain('findById(id: string)');
    expect(prisma).toContain('where: { id, identityId }');
    expect(powersync).toContain('WHERE id = ? AND identity_id = ? LIMIT 1');
  });

  it('updatePreferences takes host identity and canonical QuietHours only', () => {
    expect(useCase).toMatch(/async execute\(\s*identityId: string,\s*input: UpdateNotificationPreferenceReq,/);
    expect(inboxPort).toContain('updatePreferences(dto: unknown, identityId: string)');
    expect(moduleSource).toContain('updatePreferences: async (dto, identityId) =>');
    expect(moduleSource).toMatch(/updateNotificationPreference\.execute\(\s*identityId,/);
    expect(useCase).toContain('input.quietHours');
    expect(useCase).not.toContain('setDoNotDisturb');
    expect(useCase).not.toContain('setRateLimit');
  });

  it('splits product Inbox capability from operational diagnostics/replay', () => {
    for (const operation of ['queryDeadLetters', 'replayDeadLetter', 'getDeliveryReceipts', 'getOperationTimeline', 'getOperationAudit']) {
      expect(inboxPort).not.toContain(operation);
      expect(operationsPort).toContain(operation);
    }
    for (const productMethod of ['createNotification', 'markAsRead', 'archive', 'getPreferences', 'executeAction']) {
      expect(inboxPort).toContain(productMethod);
      expect(operationsPort).not.toContain(productMethod);
    }
    expect(moduleSource).toContain('readonly api: NotificationInboxPort');
    expect(moduleSource).toContain('readonly operations: NotificationOperationsPort');
  });

  it('HTTP/Electron preference and typed action transport remain identity scoped', () => {
    expect(channels).toContain("PREFERENCES_GET: 'notification:preferences:get'");
    expect(channels).toContain("PREFERENCES_UPDATE: 'notification:preferences:update'");
    expect(channels).toContain("EXECUTE_ACTION: 'notification:execute-action'");
    expect(routes).toContain("path: '/preferences'");
    expect(routes).toContain("path: '/actions'");
    expect(routes).toContain('controller.getPreferences(ctx)');
    expect(routes).toContain('controller.executeAction(data.notificationId, data.actionKey, ctx)');
    expect(controller).toContain('return this.inbox.updatePreferences(input, ctx.identityId)');
    expect(controller).toContain('return this.inbox.executeAction(notificationId, actionKey, ctx.identityId)');
    expect(electron).toContain('NotificationChannels.EXECUTE_ACTION');
    expect(electron).toContain('controller.executeAction(data.notificationId, data.actionKey, requestContext)');
  });

  it('client preference adapters keep identity out of the request body', () => {
    expect(clientPort).toContain('getPreferences(): Promise<Result<NotificationPreferenceClientDTO>>;');
    expect(clientPort).toMatch(/updatePreferences\(\s*request: UpdateNotificationPreferenceReq,/);
    expect(clientPort).not.toMatch(/getPreferences\(\s*identityId/);
    expect(httpAdapter).toContain('`${this.baseUrl}/preferences`');
    expect(ipcAdapter).toContain('NotificationChannels.PREFERENCES_GET');
    expect(ipcAdapter).toContain('NotificationChannels.PREFERENCES_UPDATE');
  });
});
