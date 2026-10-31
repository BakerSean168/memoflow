import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import type { PermissionCommand, PermissionSnapshot } from '@memoflow/ai-contracts';
import { settingUiHost } from '../setting-ui-host';
import { productionLocaleMessages } from '@setting-ui-test-host/locales/production-messages';
import AIPermissionSettings from './AIPermissionSettings.vue';

function setup() {
  let state: PermissionSnapshot = {
    settings: { preset: 'on_demand', agentPresets: {}, revision: 1 },
    rules: [
      {
        id: 'grant',
        agentId: 'codex',
        object: 'goal',
        action: 'create',
        effect: 'allow',
        source: 'user',
        createdAt: 1000,
      },
    ],
    audit: [],
  };
  const permissions = vi.fn(async (command: PermissionCommand) => {
    if (command.action === 'settings') state = { ...state, settings: command.settings };
    if (command.action === 'revoke')
      state = { ...state, rules: state.rules.filter((rule) => rule.id !== command.ruleId) };
    return structuredClone(state);
  });
  const wrapper = mount(AIPermissionSettings, {
    global: {
      plugins: [createI18n({ legacy: false, locale: 'zh-CN', messages: productionLocaleMessages })],
      provide: {
        [settingUiHost.AI_LOCAL_AGENT_KEY as symbol]: { permissions },
        [settingUiHost.AI_AGENT_REGISTRY_KEY as symbol]: {
          list: async () => ({ instances: [{ instanceId: 'codex', name: 'Codex' }] }),
        },
      },
    },
  });
  return { wrapper, permissions };
}
describe('AI permission settings', () => {
  it('switches presets, edits a matrix cell as custom and keeps the AI settings row locked', async () => {
    const { wrapper, permissions } = setup();
    await flushPromises();
    await wrapper.get('[data-testid="ai-permission-preset-confirm_each"]').trigger('click');
    await flushPromises();
    expect(permissions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'settings',
        settings: expect.objectContaining({ preset: 'confirm_each' }),
      }),
    );
    await wrapper.get('[data-testid="ai-permission-cell-goal-create"]').setValue('deny');
    await flushPromises();
    expect(permissions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          preset: 'custom',
          customMatrix: expect.objectContaining({
            goal: expect.objectContaining({ create: 'deny' }),
          }),
        }),
      }),
    );
    expect(
      wrapper.get('[data-testid="ai-permission-cell-ai_permission-update"]').attributes('disabled'),
    ).toBeDefined();
    wrapper.unmount();
  });
  it('revokes the exact grant and supports inherited or separate Agent presets', async () => {
    const { wrapper, permissions } = setup();
    await flushPromises();
    await wrapper.get('[data-testid="ai-permission-revoke-grant"]').trigger('click');
    await flushPromises();
    expect(permissions).toHaveBeenLastCalledWith({ action: 'revoke', ruleId: 'grant' });
    expect(wrapper.find('[data-testid="ai-permission-revoke-grant"]').exists()).toBe(false);
    await wrapper.get('[data-testid="ai-permission-agent-codex"]').setValue('full_auto');
    await flushPromises();
    expect(permissions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ agentPresets: { codex: 'full_auto' } }),
      }),
    );
    await wrapper.get('[data-testid="ai-permission-agent-codex"]').setValue('inherit');
    await flushPromises();
    expect(permissions).toHaveBeenLastCalledWith(
      expect.objectContaining({ settings: expect.objectContaining({ agentPresets: {} }) }),
    );
    wrapper.unmount();
  });
});
