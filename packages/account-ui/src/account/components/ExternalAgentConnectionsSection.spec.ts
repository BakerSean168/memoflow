import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/transport-contracts/result';
import account from '@account-ui-test-host/locales/en-US/account';
import { EXTERNAL_AGENT_SERVICE_KEY } from '@account-ui-test-host/di/keys';
import ExternalAgentConnectionsSection from './ExternalAgentConnectionsSection.vue';

const summary = {
  id: '5b5d8a2b-9934-4be8-8e07-3f62ed122e15',
  name: 'daily agent',
  prefix: 'mfp_AbCdEfG',
  audience: 'https://api.memo.test/mcp',
  scopes: ['goals:read'],
  createdAt: '2026-11-16T00:00:00.000Z',
  expiresAt: '2027-02-14T00:00:00.000Z',
  revokedAt: null,
};

afterEach(() => {
  document.body.innerHTML = '';
});

function fixture() {
  const service = {
    capabilities: vi.fn().mockResolvedValue(ok({ oauth: false })),
    listPats: vi.fn().mockResolvedValue(ok([])),
    listConnections: vi.fn().mockResolvedValue(ok([])),
    createPat: vi.fn().mockResolvedValue(ok({ ...summary, secret: 'mfp_secret' })),
    revokePat: vi.fn().mockResolvedValue(ok(undefined)),
    revokeConnection: vi.fn().mockResolvedValue(ok(undefined)),
    consentRequest: vi.fn(),
    decideConsent: vi.fn(),
  };
  const wrapper = mount(ExternalAgentConnectionsSection, {
    attachTo: document.body,
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'en-US',
          messages: { 'en-US': { account, errors: {} } },
        }),
      ],
      provide: { [EXTERNAL_AGENT_SERVICE_KEY as symbol]: service },
    },
  });
  return { wrapper, service };
}

async function nameToken(wrapper: ReturnType<typeof fixture>['wrapper'], name: string) {
  const input = wrapper.get('#external-pat-name');
  await input.setValue(name);
}

async function submit(wrapper: ReturnType<typeof fixture>['wrapper']) {
  await wrapper.get('form').trigger('submit');
  await flushPromises();
}

describe('ExternalAgentConnectionsSection PAT issuing (#970)', () => {
  it('defaults to a read-only 90-day token and hides the write warning', async () => {
    const { wrapper, service } = fixture();
    await flushPromises();

    expect(wrapper.findAll('[data-testid^="pat-scope-"]')).toHaveLength(8);
    expect(wrapper.find('[data-testid="pat-write-warning"]').exists()).toBe(false);

    await nameToken(wrapper, 'daily agent');
    await submit(wrapper);

    expect(service.createPat).toHaveBeenCalledWith({
      name: 'daily agent',
      expiresInDays: 90,
      scopes: ['goals:read', 'tasks:read'],
    });
  });

  it('sends checked write scopes with the chosen 365-day expiry and warns once', async () => {
    const { wrapper, service } = fixture();
    await flushPromises();

    await wrapper.get('[data-testid="pat-scope-goals:write"] [role="checkbox"]').trigger('click');
    await wrapper.get('[data-testid="pat-expiry-365"] [role="radio"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="pat-write-warning"]').text()).toContain(
      'can write directly within the granted scopes',
    );

    await nameToken(wrapper, 'daily agent');
    await submit(wrapper);

    expect(service.createPat).toHaveBeenCalledWith({
      name: 'daily agent',
      expiresInDays: 365,
      scopes: ['goals:read', 'goals:write', 'tasks:read'],
    });
  });

  it('offers every existing routine scope for issuing', async () => {
    const { wrapper, service } = fixture();
    await flushPromises();

    for (const scope of ['tasks:write', 'routines:read', 'routines:write']) {
      await wrapper.get(`[data-testid="pat-scope-${scope}"] [role="checkbox"]`).trigger('click');
    }
    await nameToken(wrapper, 'full writer');
    await submit(wrapper);

    expect(service.createPat).toHaveBeenCalledWith({
      name: 'full writer',
      expiresInDays: 90,
      scopes: ['goals:read', 'tasks:read', 'tasks:write', 'routines:read', 'routines:write'],
    });
  });

  it('offers notification and schedule read scopes for issuing (#995)', async () => {
    const { wrapper, service } = fixture();
    await flushPromises();

    for (const scope of ['notifications:read', 'schedules:read']) {
      await wrapper.get(`[data-testid="pat-scope-${scope}"] [role="checkbox"]`).trigger('click');
    }
    await nameToken(wrapper, 'domain reader');
    await submit(wrapper);

    expect(service.createPat).toHaveBeenCalledWith({
      name: 'domain reader',
      expiresInDays: 90,
      scopes: ['goals:read', 'tasks:read', 'notifications:read', 'schedules:read'],
    });
  });
});
