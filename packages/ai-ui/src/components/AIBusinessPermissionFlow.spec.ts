import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
// Test-only cross-layer journey, using an in-memory database and loopback MCP.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createPermissionFlowFixture } from '@memoflow/ai/testing';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { expect, it, vi } from 'vitest';
import { productionLocaleMessages } from '@ai-ui-test-host/locales/production-messages';
import AILocalRequestCard from './AILocalRequestCard.vue';
import type { LocalAgentRequestResponse } from '@memoflow/ai-contracts';

it('confirm each → business card → always allow → same operation executes without another card', async () => {
  let wrapper: VueWrapper | undefined;
  let cards = 0;
  const fixture = await createPermissionFlowFixture((request) => {
    cards++;
    wrapper = mount(AILocalRequestCard, {
      props: {
        request: { request, conversationId: 'chat', runId: 'run', status: 'pending' },
        onRespond: (response: LocalAgentRequestResponse['response']) => {
          if (response.type === 'permission') fixture.respond(response.decision);
        },
      },
      global: {
        plugins: [
          createI18n({ legacy: false, locale: 'zh-CN', messages: productionLocaleMessages }),
        ],
      },
    });
  });
  try {
    const first = fixture.call();
    await vi.waitFor(() => expect(wrapper).toBeDefined());
    expect(fixture.writes).toBe(0);
    await wrapper!.get('[data-testid="ai-permission-allow-always"]').trigger('click');
    expect(await first).toContain('saved');
    await flushPromises();
    expect((await fixture.snapshot()).rules.filter((rule) => rule.source === 'user')).toHaveLength(
      1,
    );
    expect(await fixture.call()).toContain('saved');
    expect(fixture.writes).toBe(2);
    expect(cards).toBe(1);
  } finally {
    wrapper?.unmount();
    await fixture.dispose();
  }
});
