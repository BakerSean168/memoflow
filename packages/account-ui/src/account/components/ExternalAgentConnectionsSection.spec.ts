import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/transport-contracts/result';
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
  lastUsedAt: null,
};
const revokedSummary = {
  ...summary,
  id: '15d9a2d0-51be-4e31-9d4b-14b0a92b5e11',
  name: 'revoked agent',
  prefix: 'mfp_Revoked',
  revokedAt: '2026-11-17T00:00:00.000Z',
};
const expiredSummary = {
  ...summary,
  id: 'b2c3c4d5-e6f7-4a8b-9c0d-1e2f3a4b5c6d',
  name: 'expired agent',
  prefix: 'mfp_Expired',
  expiresAt: '2020-01-01T00:00:00.000Z',
};

afterEach(() => {
  document.body.innerHTML = '';
});

function fixture(
  list: unknown[] = [],
  props: { summary?: boolean; view?: 'all' | 'oauth' | 'tokens' } = {},
  capabilities: unknown = ok({ oauth: false }),
) {
  const service = {
    capabilities: vi.fn().mockResolvedValue(capabilities),
    listPats: vi.fn().mockResolvedValue(ok(list)),
    listConnections: vi.fn().mockResolvedValue(ok([])),
    createPat: vi.fn().mockResolvedValue(ok({ ...summary, secret: 'mfp_secret' })),
    revokePat: vi.fn().mockResolvedValue(ok(undefined)),
    revokeConnection: vi.fn().mockResolvedValue(ok(undefined)),
    consentRequest: vi.fn(),
    decideConsent: vi.fn(),
  };
  const wrapper = mount(ExternalAgentConnectionsSection, {
    props,
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

type Wrapper = ReturnType<typeof fixture>['wrapper'];

function query<T extends Element>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

function get<T extends Element>(selector: string): T {
  const element = query<T>(selector);
  if (!element) throw new Error(`expected ${selector} to be rendered`);
  return element;
}

async function openCreate(wrapper: Wrapper) {
  await wrapper.get('[data-testid="pat-create-open"]').trigger('click');
  await flushPromises();
}

async function click(selector: string) {
  get<HTMLElement>(selector).click();
  await flushPromises();
}

async function nameToken(name: string) {
  const input = get<HTMLInputElement>('#external-pat-name');
  input.value = name;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await flushPromises();
}

async function submit() {
  get<HTMLFormElement>('#external-pat-name')
    .closest('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await flushPromises();
}

describe('ExternalAgentConnectionsSection PAT issuing (#970)', () => {
  it('keeps credentials and management actions off the summary and loads details only on the subpage', async () => {
    const { wrapper, service } = fixture([summary], { summary: true });
    await flushPromises();
    expect(wrapper.text()).not.toContain(summary.prefix);
    expect(wrapper.find('[data-testid="pat-create-open"]').exists()).toBe(false);
    expect(service.listPats).not.toHaveBeenCalled();
    expect(service.listConnections).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="account-connections-open"]').trigger('click');
    expect(wrapper.emitted('open')).toEqual([['tokens']]);
    wrapper.unmount();
  });

  it('hides the summary entry when the gateway capability is disabled', async () => {
    const { wrapper } = fixture(
      [],
      { summary: true },
      fail({ code: 'EAG_SERVICE_DISABLED', message: 'Disabled' }),
    );
    await flushPromises();
    expect(wrapper.find('[data-testid="account-connections-open"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps OAuth apps and access tokens on separate subpages', async () => {
    const { wrapper } = fixture([summary], { view: 'oauth' }, ok({ oauth: true }));
    await flushPromises();
    expect(wrapper.find('[data-testid="pat-create-open"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain(summary.prefix);
    wrapper.unmount();
  });

  it('opens the create form only after the create button is used and closes it again', async () => {
    const { wrapper, service } = fixture();
    await flushPromises();

    expect(query('#external-pat-name')).toBeNull();
    expect(wrapper.text()).toContain('Create token');

    await openCreate(wrapper);
    expect(query('#external-pat-name')).not.toBeNull();
    expect(document.querySelectorAll('[data-testid^="pat-scope-"]')).toHaveLength(13);

    await click('[data-testid="pat-create-cancel"]');
    expect(query('#external-pat-name')).toBeNull();
    expect(service.createPat).not.toHaveBeenCalled();
  });

  it('defaults to a read-only 90-day token and hides the write warning', async () => {
    const { wrapper, service } = fixture();
    await flushPromises();
    await openCreate(wrapper);

    expect(query('[data-testid="pat-write-warning"]')).toBeNull();

    await nameToken('daily agent');
    await submit();

    expect(service.createPat).toHaveBeenCalledWith({
      name: 'daily agent',
      expiresInDays: 90,
      scopes: ['goals:read', 'tasks:read'],
      idempotencyKey: expect.any(String),
    });
  });

  it('sends checked write scopes with the chosen 365-day expiry and warns once', async () => {
    const { wrapper, service } = fixture();
    await flushPromises();
    await openCreate(wrapper);

    await click('[data-testid="pat-scope-goals:write"] [role="checkbox"]');
    await click('[data-testid="pat-expiry-365"] [role="radio"]');

    expect(get('[data-testid="pat-write-warning"]').textContent).toContain(
      'can write directly within the granted scopes',
    );

    await nameToken('daily agent');
    await submit();

    expect(service.createPat).toHaveBeenCalledWith({
      name: 'daily agent',
      expiresInDays: 365,
      scopes: ['goals:read', 'goals:write', 'tasks:read'],
      idempotencyKey: expect.any(String),
    });
  });

  it('offers every existing routine scope for issuing', async () => {
    const { wrapper, service } = fixture();
    await flushPromises();
    await openCreate(wrapper);

    for (const scope of ['tasks:write', 'routines:read', 'routines:write']) {
      await click(`[data-testid="pat-scope-${scope}"] [role="checkbox"]`);
    }
    await nameToken('full writer');
    await submit();

    expect(service.createPat).toHaveBeenCalledWith({
      name: 'full writer',
      expiresInDays: 90,
      scopes: ['goals:read', 'tasks:read', 'tasks:write', 'routines:read', 'routines:write'],
      idempotencyKey: expect.any(String),
    });
  });

  it('offers notification and schedule read scopes for issuing (#995)', async () => {
    const { wrapper, service } = fixture();
    await flushPromises();
    await openCreate(wrapper);

    for (const scope of ['notifications:read', 'schedules:read']) {
      await click(`[data-testid="pat-scope-${scope}"] [role="checkbox"]`);
    }
    await nameToken('domain reader');
    await submit();

    expect(service.createPat).toHaveBeenCalledWith({
      name: 'domain reader',
      expiresInDays: 90,
      scopes: ['goals:read', 'tasks:read', 'notifications:read', 'schedules:read'],
      idempotencyKey: expect.any(String),
    });
  });

  it('offers the schedules:write scope and warns before issuing it (#1076)', async () => {
    const { wrapper, service } = fixture();
    await flushPromises();
    await openCreate(wrapper);

    await click('[data-testid="pat-scope-schedules:write"] [role="checkbox"]');
    expect(get('[data-testid="pat-write-warning"]').textContent).toContain(
      'can write directly within the granted scopes',
    );
    await nameToken('calendar writer');
    await submit();

    expect(service.createPat).toHaveBeenCalledWith({
      name: 'calendar writer',
      expiresInDays: 90,
      scopes: ['goals:read', 'tasks:read', 'schedules:write'],
      idempotencyKey: expect.any(String),
    });
  });

  it('offers relations:read scope for issuing', async () => {
    const { wrapper, service } = fixture();
    await flushPromises();
    await openCreate(wrapper);

    await click('[data-testid="pat-scope-relations:read"] [role="checkbox"]');
    await nameToken('relation reader');
    await submit();

    expect(service.createPat).toHaveBeenCalledWith({
      name: 'relation reader',
      expiresInDays: 90,
      scopes: ['goals:read', 'tasks:read', 'relations:read'],
      idempotencyKey: expect.any(String),
    });
  });

  it('issues the read-only ai:read scope without the write warning', async () => {
    const { wrapper, service } = fixture();
    await flushPromises();
    await openCreate(wrapper);

    await click('[data-testid="pat-scope-ai:read"] [role="checkbox"]');
    await nameToken('ai reader');
    await submit();

    expect(service.createPat).toHaveBeenCalledWith({
      name: 'ai reader',
      expiresInDays: 90,
      scopes: ['goals:read', 'tasks:read', 'ai:read'],
      idempotencyKey: expect.any(String),
    });
    expect(query('[data-testid="pat-write-warning"]')).toBeNull();
  });

  it('shows the new secret once inside the dialog, copies it, and lists the token after closing', async () => {
    const { wrapper, service } = fixture();
    service.listPats.mockResolvedValueOnce(ok([])).mockResolvedValue(ok([summary]));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    await flushPromises();

    await openCreate(wrapper);
    await nameToken('daily agent');
    await submit();

    expect(get<HTMLTextAreaElement>('#external-pat-secret').value).toBe('mfp_secret');
    expect(get('[data-testid="pat-create-secret"]').textContent).toContain(
      'will not be shown again after you close this dialog',
    );

    await click('[data-testid="pat-copy-secret"]');
    expect(writeText).toHaveBeenCalledWith('mfp_secret');
    expect(get('[data-testid="pat-copy-secret"]').textContent).toContain('Copied');

    await click('[data-testid="pat-create-done"]');
    expect(query('[data-testid="pat-create-dialog"]')).toBeNull();
    expect(query('#external-pat-secret')).toBeNull();
    expect(wrapper.text()).toContain('daily agent');
    expect(wrapper.text()).toContain('mfp_AbCdEfG');
  });

  it('sends one request while a creation is pending and rotates the key per intent', async () => {
    const { wrapper, service } = fixture();
    let settle!: (value: unknown) => void;
    service.createPat.mockReturnValueOnce(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    await flushPromises();
    await openCreate(wrapper);
    await nameToken('slow agent');
    await submit();
    await submit();
    expect(service.createPat).toHaveBeenCalledTimes(1);
    expect(get<HTMLButtonElement>('[data-testid="pat-create-submit"]').disabled).toBe(true);

    settle(ok({ ...summary, secret: 'mfp_secret', replayed: false }));
    await flushPromises();
    expect(get<HTMLTextAreaElement>('#external-pat-secret').value).toBe('mfp_secret');

    await click('[data-testid="pat-create-done"]');
    await openCreate(wrapper);
    await nameToken('second agent');
    await submit();
    const [first, second] = service.createPat.mock.calls.map(
      ([input]) => (input as { idempotencyKey: string }).idempotencyKey,
    );
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
  });

  it('explains a replayed creation when the one-time secret is no longer available', async () => {
    const { wrapper, service } = fixture();
    service.createPat.mockResolvedValueOnce(ok({ ...summary, replayed: true }));
    await flushPromises();
    await openCreate(wrapper);

    await nameToken('retried agent');
    await submit();

    expect(query('#external-pat-secret')).toBeNull();
    expect(get('[data-testid="pat-create-replayed"]').textContent).toContain(
      'already created by an earlier submission',
    );
  });
});

describe('ExternalAgentConnectionsSection PAT list (#1010)', () => {
  it('shows the last successful use and an explicit empty state before first use (#1029)', async () => {
    const used = {
      ...summary,
      id: 'c1a2b3c4-d5e6-4f70-8192-a3b4c5d6e7f8',
      name: 'active agent',
      prefix: 'mfp_Used',
      lastUsedAt: '2026-11-18T09:30:00.000Z',
    };
    const fresh = {
      ...summary,
      id: 'd2b3c4d5-e6f7-4a81-9b03-b4c5d6e7f809',
      name: 'fresh agent',
      prefix: 'mfp_Fresh',
    };
    const { wrapper } = fixture([used, fresh]);
    await flushPromises();

    const lines = wrapper
      .findAll('[data-testid="pat-last-used"]')
      .map((node) => node.text())
      .filter((text) => text.length > 0);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^last used \S/);
    expect(lines[1]).toBe('Never used');
  });

  it('hides revoked and expired tokens from the list', async () => {
    const { wrapper } = fixture([summary, revokedSummary, expiredSummary]);
    await flushPromises();

    expect(wrapper.text()).toContain('daily agent');
    expect(wrapper.text()).not.toContain('revoked agent');
    expect(wrapper.text()).not.toContain('expired agent');
    expect(wrapper.findAll('[data-testid="pat-revoke-open"]')).toHaveLength(1);
  });

  it('asks for confirmation before revoking and removes the token after success', async () => {
    const { wrapper, service } = fixture([summary]);
    service.listPats.mockResolvedValueOnce(ok([summary])).mockResolvedValue(ok([]));
    await flushPromises();

    await click('[data-testid="pat-revoke-open"]');
    expect(get('[data-testid="pat-revoke-dialog"]').textContent).toContain('Revoke daily agent?');
    expect(service.revokePat).not.toHaveBeenCalled();

    await click('[data-testid="pat-revoke-confirm"]');
    expect(service.revokePat).toHaveBeenCalledWith(summary.id);
    expect(query('[data-testid="pat-revoke-dialog"]')).toBeNull();
    expect(wrapper.text()).not.toContain('daily agent');
  });

  it('keeps the token when the revoke confirmation is cancelled', async () => {
    const { wrapper, service } = fixture([summary]);
    await flushPromises();

    await click('[data-testid="pat-revoke-open"]');
    await click('[data-testid="pat-revoke-cancel"]');

    expect(query('[data-testid="pat-revoke-dialog"]')).toBeNull();
    expect(service.revokePat).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('daily agent');
  });
});
