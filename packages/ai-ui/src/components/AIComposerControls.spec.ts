import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
/** @vitest-environment jsdom */
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { productionLocaleMessages } from '@ai-ui-test-host/locales/production-messages';
import { SERVER_STATE_IDENTITY_SCOPE_KEY } from '@ai-ui-test-host/platform/server-state';
import AIComposerControls from './AIComposerControls.vue';

vi.mock('@memoflow/ui-vue-shadcn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/ui-vue-shadcn')>();
  const { defineComponent, h } = await import('vue');
  const passthrough = (name: string) =>
    defineComponent({
      name,
      inheritAttrs: false,
      setup(_props, { slots, attrs }) {
        return () => h('div', attrs, slots.default?.());
      },
    });
  return {
    ...actual,
    Popover: passthrough('Popover'),
    PopoverTrigger: passthrough('PopoverTrigger'),
    PopoverContent: passthrough('PopoverContent'),
  };
});

const agents = [
  {
    id: 'agent:mastra',
    name: 'Mastra',
    driver: 'mastra' as const,
    enabled: true,
    configured: true,
  },
  {
    id: 'agent:work',
    name: 'Mastra',
    driver: 'mastra' as const,
    enabled: true,
    configured: true,
  },
  {
    id: 'local:codex',
    name: 'Codex Work',
    driver: 'codex' as const,
    enabled: true,
    configured: false,
  },
];
const models = [
  {
    key: 'agent:mastra::google-connection::gpt-4.1',
    agentInstanceId: 'mastra',
    agentKey: 'agent:mastra',
    providerId: 'google-connection',
    providerName: 'Google',
    modelId: 'gpt-4.1',
    modelName: 'Model Alpha',
  },
  {
    key: 'agent:mastra::google-connection::gemini-flash',
    agentInstanceId: 'mastra',
    agentKey: 'agent:mastra',
    providerId: 'google-connection',
    providerName: 'Google',
    modelId: 'gemini-flash',
    modelName: 'Gemini Flash',
  },
  {
    key: 'agent:work::other-connection::gpt-4.1',
    agentInstanceId: 'work',
    agentKey: 'agent:work',
    providerId: 'other-connection',
    providerName: 'AnyRouter',
    modelId: 'gpt-4.1',
    modelName: 'Model Alpha',
  },
];
function setup(overrides: Record<string, unknown> = {}, identityScope = 'profile-a') {
  return mount(AIComposerControls, {
    props: {
      agents,
      selectedAgentId: 'agent:mastra',
      models,
      selectedModelKey: models[0]!.key,
      native: false,
      disabled: false,
      ...overrides,
    },
    global: {
      provide: {
        [SERVER_STATE_IDENTITY_SCOPE_KEY as symbol]: () => identityScope,
      },
      plugins: [
        createI18n({
          legacy: false,
          locale: 'zh-CN',
          messages: productionLocaleMessages,
        }),
      ],
    },
  });
}
const openModels = async (wrapper: ReturnType<typeof setup>) => {
  (
    wrapper.vm as unknown as {
      setMenu: (menu: 'models', open: boolean) => void;
    }
  ).setMenu('models', true);
  await nextTick();
};

describe('T3 model picker / conditional traits / enforced permissions', () => {
  beforeEach(() => localStorage.clear());

  it('hides inert model options and keeps native permission switching out of the composer', () => {
    const wrapper = setup();
    expect(wrapper.find('[data-testid="ai-chat-agent-selector"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ai-chat-model-selector"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-chat-traits-selector"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ai-chat-permission-selector"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="ai-chat-model-selector"]').text()).toContain('Model Alpha');
    expect(wrapper.find('[data-testid="ai-model-traits-menu"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('locks incompatible Agents and search results while leaving compatible models selectable', async () => {
    const wrapper = setup({
      agents: agents.map((agent) =>
        agent.id === 'agent:work' ? { ...agent, switchBlockedReason: 'incompatible' } : agent,
      ),
    });
    const blocked = wrapper.get('[data-testid="ai-model-picker-agent-agent:work"]');
    expect(blocked.attributes('aria-disabled')).toBe('true');
    expect(blocked.attributes('title')).toContain('当前会话暂不支持切换');
    await blocked.trigger('click');
    expect(wrapper.emitted('selectAgent')).toBeUndefined();
    await wrapper.get('[data-testid="ai-model-picker-search"]').setValue('Model Alpha');
    const rows = wrapper.findAll('[data-testid="ai-model-picker-option"]');
    expect(rows).toHaveLength(2);
    const lockedModel = rows.find((row) =>
      row.attributes('data-model-key')?.startsWith('agent:work'),
    )!;
    expect(lockedModel.attributes('disabled')).toBeDefined();
    await lockedModel.trigger('click');
    expect(wrapper.emitted('selectModel')).toBeUndefined();
    await rows
      .find((row) => row.attributes('data-model-key')?.startsWith('agent:mastra'))!
      .trigger('click');
    expect(wrapper.emitted('selectModel')).toEqual([[models[0]!.key, 'agent:mastra']]);
  });

  it('keeps enabled empty instances browsable and offers settings when all instances are disabled', async () => {
    const wrapper = setup({
      models: [],
      loading: true,
      agents: agents.filter((agent) => agent.driver === 'mastra'),
    });
    expect(wrapper.find('[data-testid="ai-composer-provider-unavailable"]').exists()).toBe(false);
    await wrapper.setProps({ loading: false });
    expect(wrapper.find('[data-testid="ai-chat-model-selector"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-chat-permission-selector"]').exists()).toBe(false);
    await wrapper.setProps({
      models,
      agents: agents.map((agent) => ({ ...agent, enabled: false })),
    });
    expect(wrapper.find('[data-testid="ai-chat-model-selector"]').exists()).toBe(false);
    await wrapper.get('[data-testid="ai-composer-provider-unavailable"]').trigger('click');
    expect(wrapper.emitted('settings')).toEqual([[]]);
    wrapper.unmount();
  });

  it('keeps the picker reachable when only the implicit native Codex is enabled', async () => {
    const wrapper = setup({
      agents: [agents[2]],
      models: [],
      selectedAgentId: '',
      selectedModelKey: '',
    });
    expect(wrapper.find('[data-testid="ai-composer-provider-unavailable"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="ai-chat-model-selector"]').exists()).toBe(true);
    await openModels(wrapper);
    expect(wrapper.get('[data-testid="ai-model-picker-empty-settings"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-model-picker-select-agent"]').exists()).toBe(false);
    expect(wrapper.emitted('selectAgent')).toBeUndefined();
    wrapper.unmount();
  });

  it('shows provider settings when enabled Mastra catalogs settle empty', () => {
    const wrapper = setup({
      agents: [agents[0]],
      models: [],
      selectedAgentId: 'agent:mastra',
      selectedModelKey: '',
      catalog: {
        mastra: {
          instanceId: 'mastra',
          agentKey: 'agent:mastra',
          status: 'ready',
          models: [],
        },
      },
    });
    expect(wrapper.find('[data-testid="ai-composer-provider-unavailable"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-chat-model-selector"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows one Gemini 3.8 Flash model with genuine ACP v1.4 thought_level choices', async () => {
    const nativeModel = {
      key: 'gemini-3.8-flash',
      agentKey: 'local:agy',
      providerId: 'agy-connection',
      providerName: 'Antigravity',
      modelId: 'gemini-3.8-flash',
      modelName: 'Gemini 3.8 Flash',
      reasoningEfforts: ['low', 'medium', 'high'],
      defaultReasoningEffort: 'medium',
    };
    const wrapper = setup({
      native: true,
      agents: [
        {
          id: 'local:agy',
          name: 'Antigravity (AGY)',
          driver: 'antigravity',
          enabled: true,
          configured: true,
        },
      ],
      selectedAgentId: 'local:agy',
      selectedModelKey: nativeModel.key,
      models: [nativeModel],
    });
    expect(wrapper.get('[data-testid="ai-chat-model-selector"]').text()).toContain(
      'Gemini 3.8 Flash',
    );
    expect(wrapper.get('[data-testid="ai-chat-model-effort-label"]').text()).toContain('medium');
    expect(wrapper.get('[data-testid="ai-model-picker-options"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid^="ai-traits-effort-"]')).toHaveLength(3);
    await wrapper.get('[data-testid="ai-traits-effort-high"]').trigger('click');
    expect(wrapper.emitted('modelOption')).toEqual([['reasoningEffort', 'high']]);
    wrapper.unmount();
  });

  it('does not show reasoning for a single fixed effort', () => {
    const model = { ...models[0]!, reasoningEfforts: ['high'] };
    const wrapper = setup({ native: true, models: [model] });
    expect(wrapper.find('[data-testid="ai-chat-traits-selector"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('combines Agent sidebar and model selection without losing the owning instance', async () => {
    const wrapper = setup();
    await openModels(wrapper);
    expect(wrapper.findAll('[data-testid="ai-model-picker-option"]')).toHaveLength(2);
    expect(wrapper.get('[data-testid="ai-model-picker-option"]').text()).toContain('Google');
    await wrapper.get('[data-testid="ai-model-picker-agent-agent:work"]').trigger('click');
    await nextTick();
    const row = wrapper.get('[data-testid="ai-model-picker-option"]');
    expect(row.text()).toContain('AnyRouter');
    expect(row.text()).toContain('work');
    await row.trigger('click');
    expect(wrapper.emitted('selectModel')).toEqual([[models[2]!.key, 'agent:work']]);
    expect(wrapper.emitted('selectAgent')).toBeUndefined();
    wrapper.unmount();
  });

  it('searches across providers while retaining same-ID connections', async () => {
    const wrapper = setup();
    await openModels(wrapper);
    await wrapper.get('[data-testid="ai-model-picker-search"]').setValue('model alpha');
    expect(wrapper.findAll('[data-testid="ai-model-picker-option"]')).toHaveLength(2);
    await wrapper.get('[data-testid="ai-model-picker-search"]').setValue('AnyRouter');
    expect(wrapper.findAll('[data-testid="ai-model-picker-option"]')).toHaveLength(1);
    expect(wrapper.get('[data-testid="ai-model-picker-option"]').text()).toContain('AnyRouter');
    wrapper.unmount();
  });

  it('favorites a tuple without switching models, persists favorite and filters its tab', async () => {
    const wrapper = setup();
    await openModels(wrapper);
    await wrapper.get('[data-testid="ai-model-picker-toggle-favorite"]').trigger('click');
    expect(wrapper.emitted('selectModel')).toBeUndefined();
    expect(localStorage.getItem('ai:composer:model-favorites:v1:profile-a')).toContain(
      models[0]!.key,
    );
    await wrapper.get('[data-testid="ai-model-picker-favorites"]').trigger('click');
    expect(wrapper.findAll('[data-testid="ai-model-picker-option"]')).toHaveLength(1);
    wrapper.unmount();

    const restored = setup();
    await openModels(restored);
    await restored.get('[data-testid="ai-model-picker-favorites"]').trigger('click');
    expect(restored.findAll('[data-testid="ai-model-picker-option"]')).toHaveLength(1);
    restored.unmount();
  });

  it('always fills the Favorites navigation star and fills row stars only when favorited', async () => {
    const wrapper = setup();
    await openModels(wrapper);
    const navigation = wrapper.get('[data-testid="ai-model-picker-favorites"]');
    expect(navigation.get('svg').classes()).toContain('fill-current');
    const row = wrapper.get('[data-testid="ai-model-picker-toggle-favorite"]');
    expect(row.get('svg').classes()).not.toContain('fill-current');
    await row.trigger('click');
    expect(row.get('svg').classes()).toContain('fill-current');
    await row.trigger('click');
    expect(row.get('svg').classes()).not.toContain('fill-current');
    await navigation.trigger('click');
    expect(navigation.get('svg').classes()).toContain('fill-current');
    wrapper.unmount();
  });

  it('hides disabled instances everywhere and restores their saved favorites on re-enable', async () => {
    const wrapper = setup();
    await openModels(wrapper);
    await wrapper.get('[data-testid="ai-model-picker-toggle-favorite"]').trigger('click');
    const saved = localStorage.getItem('ai:composer:model-favorites:v1:profile-a');
    await wrapper.setProps({
      agents: agents.map((a) => ({ ...a, enabled: a.id !== 'agent:mastra' })),
    });
    expect(wrapper.find('[data-testid="ai-model-picker-agent-agent:mastra"]').exists()).toBe(false);
    await wrapper.get('[data-testid="ai-model-picker-favorites"]').trigger('click');
    expect(wrapper.findAll('[data-testid="ai-model-picker-option"]')).toHaveLength(0);
    await wrapper.get('[data-testid="ai-model-picker-search"]').setValue('Google');
    expect(wrapper.findAll('[data-testid="ai-model-picker-option"]')).toHaveLength(0);
    expect(localStorage.getItem('ai:composer:model-favorites:v1:profile-a')).toBe(saved);
    await wrapper.setProps({ agents });
    await wrapper.get('[data-testid="ai-model-picker-favorites"]').trigger('click');
    expect(wrapper.findAll('[data-testid="ai-model-picker-option"]')).toHaveLength(1);
    wrapper.unmount();
  });

  it('browses another discovered native catalog and emits exactly one complete model choice', async () => {
    const native = {
      key: 'native-model',
      agentKey: 'local:codex',
      providerId: 'codex',
      providerName: 'Codex',
      modelId: 'native-model',
      modelName: 'Native Model',
    };
    const wrapper = setup({ models: [...models, native] });
    await openModels(wrapper);
    await wrapper.get('[data-testid="ai-model-picker-agent-local:codex"]').trigger('click');
    expect(wrapper.emitted('selectModel')).toBeUndefined();
    expect(wrapper.emitted('selectAgent')).toBeUndefined();
    expect(wrapper.props('selectedAgentId')).toBe('agent:mastra');
    expect(wrapper.get('[data-testid="ai-model-picker-option"]').text()).toContain('Native Model');
    await wrapper.get('[data-testid="ai-model-picker-option"]').trigger('click');
    expect(wrapper.emitted('selectModel')).toEqual([['native-model', 'local:codex']]);
    wrapper.unmount();
  });

  it('retains a native favorite when its implicit instance materializes a connection', async () => {
    const native = {
      key: 'native-model',
      agentKey: 'local:codex',
      agentInstanceId: 'codex',
      providerId: 'codex',
      providerName: 'Codex',
      modelId: 'native-model',
      modelName: 'Native Model',
    };
    const wrapper = setup({ selectedAgentId: 'local:codex', models: [native] });
    await openModels(wrapper);
    await wrapper.get('[data-testid="ai-model-picker-toggle-favorite"]').trigger('click');
    await wrapper.setProps({
      agents: agents.map((agent) =>
        agent.id === 'local:codex' ? { ...agent, id: 'local:uuid' } : agent,
      ),
      models: [{ ...native, agentKey: 'local:uuid' }],
    });
    await wrapper.get('[data-testid="ai-model-picker-favorites"]').trigger('click');
    expect(wrapper.findAll('[data-testid="ai-model-picker-option"]')).toHaveLength(1);
    expect(
      wrapper.get('[data-testid="ai-model-picker-toggle-favorite"]').attributes('aria-pressed'),
    ).toBe('true');
    wrapper.unmount();
  });

  it('isolates favorites between different identities on the same browser', async () => {
    const first = setup({}, 'profile-a');
    await openModels(first);
    await first.get('[data-testid="ai-model-picker-toggle-favorite"]').trigger('click');
    first.unmount();

    const second = setup({}, 'profile-b');
    await openModels(second);
    await second.get('[data-testid="ai-model-picker-favorites"]').trigger('click');
    expect(second.findAll('[data-testid="ai-model-picker-option"]')).toHaveLength(0);
    second.unmount();
  });

  it('browses an enabled native instance without selecting an empty Agent', async () => {
    const wrapper = setup();
    await openModels(wrapper);
    await wrapper.get('[data-testid="ai-model-picker-agent-local:codex"]').trigger('click');
    expect(wrapper.get('[data-testid="ai-model-picker-empty"]').text()).toContain(
      '此 Provider 暂无可用模型',
    );
    expect(wrapper.get('[data-testid="ai-model-picker-empty-settings"]').text()).toContain(
      '打开 Provider 设置',
    );
    expect(wrapper.find('[data-testid="ai-model-picker-select-agent"]').exists()).toBe(false);
    expect(wrapper.emitted('selectAgent')).toBeUndefined();
    wrapper.unmount();
  });

  it.each([
    ['loading', undefined, '正在获取模型'],
    ['error', 'discovery_failed', '模型目录加载失败'],
    ['unavailable', 'not_installed', '尚未安装'],
    ['unavailable', 'login_required', '登录此 Agent'],
    ['unavailable', 'unavailable', '当前环境无法发现'],
    ['ready', undefined, '暂无可用模型'],
  ] as const)(
    'renders an instance catalog in %s / %s state accurately',
    async (status, reason, message) => {
      const wrapper = setup({
        catalog: {
          codex: {
            instanceId: 'codex',
            agentKey: 'local:codex',
            status,
            reason,
            models: [],
          },
        },
      });
      await openModels(wrapper);
      await wrapper.get('[data-testid="ai-model-picker-agent-local:codex"]').trigger('click');
      expect(wrapper.get('[data-testid="ai-model-picker-empty"]').text()).toContain(message);
      expect(wrapper.emitted('selectModel')).toBeUndefined();
      expect(wrapper.find('[data-testid="ai-model-picker-recheck"]').exists()).toBe(
        status !== 'loading',
      );
      wrapper.unmount();
    },
  );

  it('navigates only enabled instance models by keyboard after filtering search', async () => {
    const wrapper = setup({
      agents: agents.map((agent) => ({
        ...agent,
        enabled: agent.id !== 'agent:work',
      })),
    });
    document.body.appendChild(wrapper.element);
    await openModels(wrapper);
    const search = wrapper.get('[data-testid="ai-model-picker-search"]');
    await search.setValue('Model Alpha');
    (search.element as HTMLInputElement).focus();
    await search.trigger('keydown', { key: 'ArrowDown' });
    const row = wrapper.get('[data-testid="ai-model-picker-option"]');
    expect(document.activeElement).toBe(row.element);
    expect(row.attributes('data-model-key')).toBe(models[0]!.key);
    await row.trigger('click');
    expect(wrapper.emitted('selectModel')).toEqual([[models[0]!.key, 'agent:mastra']]);
    wrapper.unmount();
  });

  it('keeps the same viewport-constrained panel geometry across models, empty Agents, favorites and searches', async () => {
    const wrapper = setup();
    await openModels(wrapper);
    const picker = wrapper.get('[data-testid="ai-model-picker"]');
    const frame = picker.get('div');
    expect(picker.classes()).toContain('w-[min(35rem,calc(100vw-1.5rem))]');
    expect(frame.classes()).toContain('h-[min(346px,calc(100dvh-80px))]');

    await wrapper.get('[data-testid="ai-model-picker-agent-local:codex"]').trigger('click');
    expect(wrapper.get('[data-testid="ai-model-picker-empty"]').exists()).toBe(true);
    await wrapper.get('[data-testid="ai-model-picker-favorites"]').trigger('click');
    expect(wrapper.get('[data-testid="ai-model-picker-empty"]').text()).toContain('尚无收藏模型');
    await wrapper.get('[data-testid="ai-model-picker-search"]').setValue('missing-model');
    expect(wrapper.get('[data-testid="ai-model-picker-empty"]').text()).toContain('没有匹配的模型');
    expect(wrapper.find('[data-testid="ai-model-picker-empty-settings"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="ai-model-picker"]').element).toBe(picker.element);
    expect(wrapper.get('[data-testid="ai-model-picker"]').get('div').element).toBe(frame.element);
    wrapper.unmount();
  });

  it('keeps every provider instance reachable when the sidebar overflows the panel height', async () => {
    // happy-dom applies no Tailwind cascade, so resolve the vertical overflow
    // utilities the same way Tailwind emits them: exactly one utility must be
    // present and it must map to a scrollable `overflow-y`.
    const verticalOverflow: Record<string, string> = {
      'overflow-auto': 'auto',
      'overflow-y-auto': 'auto',
      'overflow-scroll': 'scroll',
      'overflow-y-scroll': 'scroll',
      'overflow-hidden': 'hidden',
      'overflow-y-hidden': 'hidden',
      'overflow-visible': 'visible',
      'overflow-y-visible': 'visible',
      'overflow-clip': 'clip',
      'overflow-y-clip': 'clip',
    };
    const effectiveOverflowY = (element: Element) =>
      Array.from(element.classList)
        .filter((className) => className in verticalOverflow)
        .map((className) => verticalOverflow[className]);

    const manyAgents = Array.from({ length: 10 }, (_, index) => ({
      id: 'provider-' + (index + 1),
      name: 'Agent ' + (index + 1),
      driver: 'mastra' as const,
      enabled: true,
      configured: true,
    }));
    const wrapper = setup({ agents: manyAgents, selectedAgentId: manyAgents[0]!.id });
    document.body.appendChild(wrapper.element);
    await openModels(wrapper);

    const sidebar = wrapper.get('[data-testid="ai-model-picker-sidebar"]');
    const buttons = wrapper.findAll('[data-testid^="ai-model-picker-agent-"]');
    expect(buttons).toHaveLength(manyAgents.length);
    for (const button of buttons) expect(document.body.contains(button.element)).toBe(true);
    expect(effectiveOverflowY(sidebar.element)).toEqual(['auto']);

    const last = buttons.at(-1)!;
    expect(last.attributes('disabled')).toBeUndefined();
    for (const button of buttons) {
      (button.element as HTMLElement).focus();
      expect(document.activeElement).toBe(button.element);
    }
    // The last instance must be able to scroll into view inside the rail.
    expect(typeof (last.element as HTMLElement).scrollIntoView).toBe('function');
    (last.element as HTMLElement).scrollIntoView({ block: 'nearest' });
    (last.element as HTMLElement).focus();
    expect(document.activeElement).toBe(last.element);
    wrapper.unmount();
  });

  it('highlights the browsed sidebar item with a right-hand rail, not an active-model dot', async () => {
    const wrapper = setup();
    await openModels(wrapper);
    const selected = wrapper.get('[data-testid="ai-model-picker-agent-agent:mastra"]');
    expect(selected.attributes('aria-pressed')).toBe('true');
    expect(selected.classes()).toContain('hover:bg-foreground/10');
    expect(selected.find('[data-testid="ai-model-picker-active-indicator"]').exists()).toBe(true);

    await wrapper.get('[data-testid="ai-model-picker-agent-agent:work"]').trigger('click');
    expect(selected.attributes('aria-pressed')).toBe('false');
    expect(selected.find('[data-testid="ai-model-picker-active-indicator"]').exists()).toBe(false);
    expect(
      wrapper
        .get('[data-testid="ai-model-picker-agent-agent:work"]')
        .find('[data-testid="ai-model-picker-active-indicator"]')
        .exists(),
    ).toBe(true);
    expect(wrapper.findAll('[data-testid="ai-model-picker-active-indicator"]')).toHaveLength(1);

    await wrapper.get('[data-testid="ai-model-picker-favorites"]').trigger('click');
    expect(
      wrapper
        .get('[data-testid="ai-model-picker-favorites"]')
        .find('[data-testid="ai-model-picker-active-indicator"]')
        .exists(),
    ).toBe(true);
    expect(wrapper.findAll('[data-testid="ai-model-picker-active-indicator"]')).toHaveLength(1);
    wrapper.unmount();
  });

  it('explains configured-but-empty providers, opens Agent settings and does not mistake loading for failure', async () => {
    const wrapper = setup({ models: models.slice(0, 2) });
    await openModels(wrapper);
    await wrapper.get('[data-testid="ai-model-picker-agent-agent:work"]').trigger('click');
    const empty = wrapper.get('[data-testid="ai-model-picker-empty"]');
    expect(empty.text()).toContain('此 Provider 暂无可用模型');
    expect(empty.attributes('role')).toBe('status');
    await wrapper.get('[data-testid="ai-model-picker-empty-settings"]').trigger('click');
    expect(wrapper.emitted('settings')).toEqual([[]]);
    wrapper.unmount();

    const loading = setup({ models: models.slice(0, 2), loading: true });
    await openModels(loading);
    await loading.get('[data-testid="ai-model-picker-agent-agent:work"]').trigger('click');
    expect(loading.get('[data-testid="ai-model-picker-empty"]').text()).toContain('正在获取模型');
    expect(loading.find('[data-testid="ai-model-picker-empty-settings"]').exists()).toBe(false);
    await loading.setProps({ loading: false });
    expect(loading.get('[data-testid="ai-model-picker-empty"]').text()).toContain(
      '此 Provider 暂无可用模型',
    );
    expect(loading.get('[data-testid="ai-model-picker-empty-settings"]').exists()).toBe(true);
    loading.unmount();
  });

  it('does not offer Agent command and file permissions in either runtime composer', () => {
    for (const native of [true, false]) {
      const wrapper = setup({ native });
      expect(wrapper.find('[data-testid="ai-chat-permission-selector"]').exists()).toBe(false);
      wrapper.unmount();
    }
  });

  it('hides permission switching when the runtime only offers one mode', () => {
    const wrapper = setup();
    expect(wrapper.find('[data-testid="ai-chat-permission-selector"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('also hides Traits for a native Agent that reports no executable options', () => {
    const bare = {
      key: 'pi-model',
      agentKey: 'local:codex',
      providerId: 'pi',
      providerName: 'Pi',
      modelId: 'pi-model',
      modelName: 'Pi model',
    };
    const wrapper = setup({
      native: true,
      selectedAgentId: 'local:codex',
      selectedModelKey: bare.key,
      models: [bare],
    });
    expect(wrapper.find('[data-testid="ai-chat-traits-selector"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ai-chat-model-selector"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-chat-permission-selector"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows only discovered native effort and tier choices, never fabricated traits', async () => {
    const nativeModel = {
      key: 'codex-model',
      agentKey: 'local:codex',
      providerId: 'codex',
      providerName: 'Codex',
      modelId: 'gpt-test',
      modelName: 'Codex Test',
      reasoningEfforts: ['low', 'medium', 'super-high'],
      defaultReasoningEffort: 'medium',
      serviceTiers: [{ id: 'priority', name: 'Fast' }],
    };
    const wrapper = setup({
      native: true,
      selectedAgentId: 'local:codex',
      selectedModelKey: nativeModel.key,
      models: [nativeModel],
    });
    expect(wrapper.get('[data-testid="ai-chat-model-effort-label"]').text()).toContain('medium');
    expect(wrapper.get('[data-testid="ai-model-picker-options"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid^="ai-traits-effort-"]')).toHaveLength(3);
    await wrapper.get('[data-testid="ai-traits-effort-super-high"]').trigger('click');
    expect(wrapper.emitted('modelOption')).toEqual([['reasoningEffort', 'super-high']]);
    await wrapper.get('[data-testid="ai-traits-tier-priority"]').trigger('click');
    expect(wrapper.emitted('modelOption')).toEqual([
      ['reasoningEffort', 'super-high'],
      ['serviceTier', 'priority'],
    ]);
    wrapper.unmount();
  });

  it('disables model switching while a run is active', () => {
    const nativeModel = {
      key: 'model',
      agentKey: 'local:codex',
      providerId: 'codex',
      providerName: 'Codex',
      modelId: 'model',
      modelName: 'Model',
      reasoningEfforts: ['low', 'high'],
    };
    const wrapper = setup({
      disabled: true,
      native: true,
      models: [nativeModel],
      selectedAgentId: 'local:codex',
      selectedModelKey: 'model',
    });
    for (const id of ['ai-chat-model-selector']) {
      expect(wrapper.get('[data-testid="' + id + '"]').attributes('disabled')).toBeDefined();
    }
    wrapper.unmount();
  });
});

describe('integrated picker configuration', () => {
  it('selects the numbered filtered model only while open and respects blocked models', async () => {
    const wrapper = setup();
    const input = wrapper.get('[data-testid="ai-model-picker-search"]');
    await input.trigger('keydown', { key: '2', ctrlKey: true });
    expect(wrapper.emitted('selectModel')).toBeUndefined();
    await openModels(wrapper);
    await input.trigger('keydown', { key: '2', ctrlKey: true });
    expect(wrapper.emitted('selectModel')).toEqual([[models[1]!.key, 'agent:mastra']]);
    await input.setValue('Gemini');
    await input.trigger('keydown', { key: '1', ctrlKey: true });
    expect(wrapper.emitted('selectModel')?.at(-1)).toEqual([models[1]!.key, 'agent:mastra']);
    await wrapper.setProps({ disabled: true });
    await input.trigger('keydown', { key: '1', ctrlKey: true });
    expect(wrapper.emitted('selectModel')).toHaveLength(2);
    wrapper.unmount();
  });

  it('uses the existing permission event for built-in access and highlights the current value', async () => {
    const wrapper = setup({ permissionMode: 'read-only' });
    expect(
      wrapper.get('[data-testid="ai-model-picker-access-read-only"]').attributes('aria-pressed'),
    ).toBe('true');
    await wrapper.get('[data-testid="ai-model-picker-access-supervised"]').trigger('click');
    expect(wrapper.emitted('permission')).toEqual([['supervised']]);
    wrapper.unmount();
  });

  it('reports actual instance access without offering an ineffective native override', () => {
    const wrapper = setup({
      native: true,
      agents: [{ ...agents[0], nativePermissionMode: 'auto-approve' }],
    });
    expect(wrapper.get('[data-testid="ai-model-picker-native-access"]').text()).toBe('自动批准');
    expect(wrapper.find('[data-testid="ai-model-picker-access-supervised"]').exists()).toBe(false);
    expect(wrapper.emitted('permission')).toBeUndefined();
    wrapper.unmount();
  });

  it('uses the discovered default service tier and saved overrides without fabricating Fast', async () => {
    const wrapper = setup({
      native: true,
      models: [
        {
          ...models[0],
          serviceTiers: [{ id: 'priority', name: 'Fast' }],
          defaultServiceTier: 'priority',
        },
      ],
    });
    expect(wrapper.get('[data-testid="ai-traits-tier-priority"]').attributes('aria-pressed')).toBe(
      'true',
    );
    await wrapper.setProps({ nativeModelOptions: { serviceTier: 'default' } });
    expect(wrapper.get('[data-testid="ai-traits-tier-default"]').attributes('aria-pressed')).toBe(
      'true',
    );
    await wrapper.get('[data-testid="ai-traits-tier-priority"]').trigger('click');
    expect(wrapper.emitted('modelOption')).toEqual([['serviceTier', 'priority']]);
    wrapper.unmount();
  });
});
