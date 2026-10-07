import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import errors from '../../../../packages/app-vue/src/locales/zh-CN/errors';
import { ok, fail } from '@memoflow/contracts/result';
import { EXTERNAL_AGENT_SERVICE_KEY } from '@memoflow/app-vue/di';
import { AUTH_WEB_SERVICE_KEY } from './service';
import ExternalAgentAuthorizationView from './ExternalAgentAuthorizationView.vue';

vi.mock('./capabilities', () => ({ loadWebAuthCapabilities: async () => ({ github: true }) }));
vi.mock('./github-popup-sign-in', () => ({ startGithubPopupSignIn: vi.fn() }));
function fixture(loggedIn = true) {
  const auth = {
    getSession: vi
      .fn()
      .mockResolvedValue(
        ok({ account: loggedIn ? { email: 'fixture@example.test', emailVerified: true } : null }),
      ),
  };
  const service = {
    consentRequest: vi.fn().mockResolvedValue(
      ok({
        clientId: 'https://client.example.test/meta',
        name: 'Fixture client',
        scopes: ['goals:read'],
        lifetimeDays: 90,
        resource: 'https://memo.example.test/mcp',
      }),
    ),
    decideConsent: vi.fn().mockResolvedValue(fail({ code: 'EAG_CONSENT_INVALID' })),
  };
  const wrapper = mount(ExternalAgentAuthorizationView, {
    global: {
      plugins: [createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': { errors } } })],
      provide: {
        [AUTH_WEB_SERVICE_KEY as symbol]: auth,
        [EXTERNAL_AGENT_SERVICE_KEY as symbol]: service,
      },
      stubs: { Button: { template: '<button><slot /></button>' } },
    },
  });
  return { wrapper, service, auth };
}
describe('external agent consent', () => {
  beforeEach(() =>
    window.history.replaceState({}, '', '/auth/external-agent?client_id=fixture&sig=signed-query'),
  );
  it('shows only validated requested permissions and requires an explicit decision', async () => {
    const f = fixture();
    await flushPromises();
    expect(f.service.consentRequest).toHaveBeenCalledWith('client_id=fixture&sig=signed-query');
    expect(f.wrapper.text()).toContain('查看你的 Goals');
    expect(f.wrapper.text()).not.toContain('查看你的 Tasks');
    expect(f.service.decideConsent).not.toHaveBeenCalled();
    await f.wrapper.get('[data-testid="oauth-consent-allow"]').trigger('click');
    await flushPromises();
    expect(f.service.decideConsent).toHaveBeenCalledWith(
      'client_id=fixture&sig=signed-query',
      true,
    );
    expect(f.wrapper.get('[role="alert"]').text()).toContain('重新连接');
  });
  it('preserves the signed request through login without approving it', async () => {
    const f = fixture(false);
    await flushPromises();
    const href = f.wrapper.get('a').attributes('href');
    expect(new URL(href, window.location.origin).searchParams.get('returnTo')).toBe(
      '/auth/external-agent?client_id=fixture&sig=signed-query',
    );
    expect(f.service.consentRequest).not.toHaveBeenCalled();
    expect(f.service.decideConsent).not.toHaveBeenCalled();
  });
  it('does not render an approval button for an invalid or expired signed request', async () => {
    const f = fixture();
    f.service.consentRequest.mockResolvedValue(fail({ code: 'EAG_CONSENT_INVALID' }));
    await flushPromises();
    expect(f.wrapper.find('[data-testid="oauth-consent-allow"]').exists()).toBe(false);
    expect(f.wrapper.get('[role="alert"]').text()).toContain('已过期或无效');
  });
});

it('offers retry for transient failures and sign-in for an expired session', async () => {
  const f = fixture();
  f.service.consentRequest.mockResolvedValue(fail({ code: 'EAG_NETWORK_ERROR' }));
  await flushPromises();
  expect(f.wrapper.get('[role="alert"]').text()).toContain('重试');
  f.service.consentRequest.mockResolvedValue(fail({ code: 'EAG_UNAUTHORIZED' }));
  await f.wrapper.get('[role="alert"] button').trigger('click');
  await flushPromises();
  expect(f.wrapper.get('[role="alert"] a').attributes('href')).toContain('/auth?');
  expect(f.wrapper.find('[data-testid="oauth-consent-allow"]').exists()).toBe(false);
});
