import { mount, flushPromises } from '@vue/test-utils';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18nPlugin, loadLocaleMessages } from '@memoflow/app-vue/plugins/i18n';
import { ok, fail } from '@memoflow/transport-contracts/result';
import { EXTERNAL_AGENT_SERVICE_KEY } from '@memoflow/app-vue/di';
import { AUTH_WEB_SERVICE_KEY } from './service';
import ExternalAgentAuthorizationView from './ExternalAgentAuthorizationView.vue';

vi.mock('./capabilities', () => ({ loadWebAuthCapabilities: async () => ({ github: true }) }));
vi.mock('./github-popup-sign-in', () => ({ startGithubPopupSignIn: vi.fn() }));
let messages: Awaited<ReturnType<typeof loadLocaleMessages>>;
beforeAll(async () => {
  messages = await loadLocaleMessages('zh-CN');
});
function fixture(loggedIn = true, scopes = ['goals:read'], existingScopes: string[] = []) {
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
        clientHost: 'client.example.test',
        name: 'Fixture client',
        scopes,
        existingScopes,
        writeEnabled: true,
        lifetimeDays: 90,
        resource: 'https://memo.example.test/mcp',
      }),
    ),
    decideConsent: vi.fn().mockResolvedValue(fail({ code: 'EAG_CONSENT_INVALID' })),
  };
  const wrapper = mount(ExternalAgentAuthorizationView, {
    global: {
      plugins: [createI18nPlugin('zh-CN', messages)],
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
  it('shows the exact host and only validated requested permissions, and requires an explicit decision', async () => {
    const f = fixture();
    await flushPromises();
    expect(f.service.consentRequest).toHaveBeenCalledWith('client_id=fixture&sig=signed-query');
    expect(f.wrapper.text()).toContain('client.example.test');
    expect(f.wrapper.text()).toContain('读取目标和关键结果');
    expect(f.wrapper.text()).not.toContain('读取任务');
    expect(f.wrapper.text()).toContain('允许只读访问');
    expect(f.service.decideConsent).not.toHaveBeenCalled();
    await f.wrapper.get('[data-testid="oauth-consent-allow"]').trigger('click');
    await flushPromises();
    expect(f.service.decideConsent).toHaveBeenCalledWith(
      'client_id=fixture&sig=signed-query',
      true,
      ['goals:read'],
    );
    expect(f.wrapper.get('[role="alert"]').text()).toContain('重新连接');
  });
  it('groups reads and writes by domain, leaves writes unchecked, and never offers an "allow all" primary action', async () => {
    const f = fixture(true, ['goals:read', 'goals:write', 'tasks:write', 'offline_access']);
    await flushPromises();
    const text = f.wrapper.text();
    expect(text).toContain('目标');
    expect(text).toContain('任务');
    expect(text).toContain('仅允许只读');
    expect(text).toContain('写入');
    expect(text).not.toContain('允许全部');
    // Default selection excludes every write scope.
    expect(f.wrapper.get('[data-testid="oauth-consent-allow"]').text()).toBe('允许只读访问');
    await f.wrapper.get('[data-testid="oauth-consent-allow"]').trigger('click');
    await flushPromises();
    expect(f.service.decideConsent).toHaveBeenLastCalledWith(
      'client_id=fixture&sig=signed-query',
      true,
      ['goals:read', 'offline_access'],
    );
  });
  it('lets the user pick a write domain, switches the primary label to "允许写入", and can downgrade to read-only', async () => {
    const f = fixture(true, ['goals:read', 'goals:write']);
    await flushPromises();
    const boxes = f.wrapper.findAll('[role="checkbox"]');
    expect(boxes).toHaveLength(2);
    await boxes[1].trigger('click');
    expect(f.wrapper.get('[data-testid="oauth-consent-allow"]').text()).toContain('允许写入');
    await f.wrapper.get('[data-testid="oauth-consent-readonly"]').trigger('click');
    expect(f.wrapper.get('[data-testid="oauth-consent-allow"]').text()).toBe('允许只读访问');
    await boxes[1].trigger('click');
    await f.wrapper.get('[data-testid="oauth-consent-allow"]').trigger('click');
    await flushPromises();
    expect(f.service.decideConsent).toHaveBeenLastCalledWith(
      'client_id=fixture&sig=signed-query',
      true,
      ['goals:read', 'goals:write'],
    );
  });
  it('highlights scopes that were not already granted', async () => {
    const f = fixture(true, ['goals:read', 'tasks:write'], ['goals:read']);
    await flushPromises();
    expect(f.wrapper.text()).toContain('本次新增授权');
    expect(f.wrapper.text()).toContain('tasks:write');
    expect(f.wrapper.text()).toContain('新增');
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
