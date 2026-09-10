import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Notification settings preference surface (stage-6 residual 199):
 * Settings UI loads/updates NotificationPreference through client port methods
 * that never accept identityId dual-track arguments.
 */
describe('notification settings preference surface', () => {
  const settings = readFileSync(resolve(__dirname, './NotificationSettings.vue'), 'utf8');
  const composable = readFileSync(
    resolve(__dirname, '../../notification/composables/useNotificationPreferences.ts'),
    'utf8',
  );
  const clientPort = readFileSync(
    resolve(
      __dirname,
      '../../../../../notification/src/application-client/ports/notification-api-client.port.ts',
    ),
    'utf8',
  );

  it('settings mounts module channel card and loads preferences on mount', () => {
    expect(settings).toContain('data-testid="notification-delivery-card"');
    expect(settings).toContain('useNotificationPreferences');
    expect(settings).toContain('loadPreferences');
    expect(settings).toContain('setGlobalChannel');
    expect(settings).toContain('void loadPreferences();');
  });

  it('composable calls service.getPreferences/updatePreferences without identity args', () => {
    expect(composable).toContain('await service.getPreferences()');
    expect(composable).toContain('await service.updatePreferences(request)');
    expect(composable).not.toMatch(/getPreferences\(\s*identityId/);
    expect(composable).not.toMatch(/updatePreferences\([\s\S]*identityId/);
    expect(composable).toContain('Identity is never passed from the UI');
  });

  it('client port keeps identity-free preference methods (residual 197/199)', () => {
    expect(clientPort).toContain(
      'getPreferences(): Promise<Result<NotificationPreferenceClientDTO>>;',
    );
    expect(clientPort).toMatch(
      /updatePreferences\(\s*request: UpdateNotificationPreferenceReq,/,
    );
  });
});
