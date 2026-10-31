import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { expect, it, vi } from 'vitest';
import { aiUiHost } from '../ai-ui-host';
import { productionLocaleMessages } from '@ai-ui-test-host/locales/production-messages';
import AIBusinessPermissionSelector from './AIBusinessPermissionSelector.vue';

it('raises only this conversation and clears its temporary authorization when switching', async () => {
  const permissions = vi.fn(async () => ({
    settings: { preset: 'on_demand', agentPresets: {}, revision: 1 },
    rules: [],
    audit: [],
  }));
  const wrapper = mount(AIBusinessPermissionSelector, {
    props: { conversationId: 'first', agentId: 'codex', disabled: false },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'zh-CN', messages: productionLocaleMessages })],
      provide: { [aiUiHost.AI_LOCAL_AGENT_KEY as symbol]: { permissions } },
      stubs: {
        Popover: { template: '<div><slot /></div>' },
        PopoverContent: { template: '<div><slot /></div>' },
        PopoverTrigger: { template: '<div><slot /></div>' },
      },
    },
  });
  await flushPromises();
  expect(wrapper.get('[data-testid="ai-chat-business-permission-selector"]').text()).toBe(
    '按需授权',
  );
  await wrapper.get('[data-testid="ai-business-permission-option-full_auto"]').trigger('click');
  await flushPromises();
  expect(permissions).toHaveBeenLastCalledWith({
    action: 'conversation',
    conversationId: 'first',
    preset: 'full_auto',
  });
  expect(wrapper.get('[data-testid="ai-chat-business-permission-selector"]').text()).toBe(
    '完全自动',
  );
  await wrapper.setProps({ conversationId: 'second' });
  await flushPromises();
  expect(permissions).toHaveBeenCalledWith({
    action: 'conversation',
    conversationId: 'first',
    preset: null,
  });
  expect(wrapper.get('[data-testid="ai-chat-business-permission-selector"]').text()).toBe(
    '按需授权',
  );
  wrapper.unmount();
});
