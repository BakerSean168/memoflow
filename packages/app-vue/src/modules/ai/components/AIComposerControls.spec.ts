import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import { Select } from '@memoflow/ui-vue-shadcn';
import { productionLocaleMessages } from '../../../locales/production-messages';
import AIComposerControls from './AIComposerControls.vue';

const agents = [
  {
    id: 'agent:mastra',
    name: 'Personal Mastra',
    driver: 'mastra' as const,
    enabled: true,
    configured: true,
  },
  {
    id: 'agent:work',
    name: 'Work Mastra',
    driver: 'mastra' as const,
    enabled: true,
    configured: false,
  },
];
const models = [
  {
    key: 'agent:mastra::provider-1::model-a',
    agentInstanceId: 'mastra',
    providerId: 'provider-1',
    providerName: 'Personal',
    modelId: 'model-a',
    modelName: 'Model A',
  },
  {
    key: 'agent:mastra::provider-1::model-b',
    agentInstanceId: 'mastra',
    providerId: 'provider-1',
    providerName: 'Personal',
    modelId: 'model-b',
    modelName: 'Model B',
  },
];
function setup(overrides: Record<string, unknown> = {}) {
  return mount(AIComposerControls, {
    props: {
      agents,
      selectedAgentId: 'agent:mastra',
      models,
      selectedModelKey: models[0].key,
      permissionMode: 'supervised',
      native: false,
      disabled: false,
      ...overrides,
    },
    global: {
      stubs: { teleport: true },
      plugins: [createI18n({ legacy: false, locale: 'zh-CN', messages: productionLocaleMessages })],
    },
  });
}
describe('T3 three-part Agent / model / permissions composer', () => {
  it('always shows three independent controls with the Agent display name, not a vendor', async () => {
    const wrapper = setup();
    expect(wrapper.get('[data-testid="ai-chat-agent-selector"]').text()).toContain(
      'Personal Mastra',
    );
    expect(wrapper.find('[data-testid="ai-chat-model-selector"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="ai-chat-permission-selector"]').text()).toContain('需要确认');
    const selectors = wrapper.findAllComponents(Select);
    expect(selectors).toHaveLength(3);
    selectors[0].vm.$emit('update:modelValue', 'agent:work');
    selectors[1].vm.$emit('update:modelValue', models[1].key);
    selectors[2].vm.$emit('update:modelValue', 'read-only');
    expect(wrapper.emitted('selectAgent')).toEqual([['agent:work']]);
    expect(wrapper.emitted('selectModel')).toEqual([[models[1].key]]);
    expect(wrapper.emitted('permission')).toEqual([['read-only']]);
    wrapper.unmount();
  });
  it('keeps Agent and permissions visible when an instance has no models', async () => {
    const wrapper = setup({ models: [], selectedModelKey: '' });
    expect(wrapper.find('[data-testid="ai-chat-agent-selector"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="ai-chat-model-selector"]').text()).toContain('未配置模型');
    expect(wrapper.find('[data-testid="ai-chat-permission-selector"]').exists()).toBe(true);
    await wrapper.get('[data-testid="ai-chat-model-selector"]').trigger('click');
    expect(wrapper.emitted('settings')).toHaveLength(1);
    wrapper.unmount();
  });
  it('offers only permission modes that the current runtime actually enforces', () => {
    const mastra = setup();
    const native = setup({ native: true });
    expect((mastra.vm as unknown as { permissionModes: string[] }).permissionModes).toEqual([
      'supervised',
      'read-only',
    ]);
    expect((native.vm as unknown as { permissionModes: string[] }).permissionModes).toEqual([
      'supervised',
      'auto-approve',
    ]);
    mastra.unmount();
    native.unmount();
  });
  it('locks all three controls while a message is executing', () => {
    const wrapper = setup({ disabled: true });
    for (const testid of [
      'ai-chat-agent-selector',
      'ai-chat-model-selector',
      'ai-chat-permission-selector',
    ]) {
      expect(wrapper.get(`[data-testid="${testid}"]`).attributes('disabled')).toBeDefined();
    }
    wrapper.unmount();
  });
});
