import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import type { PermissionCommand, PermissionSnapshot } from '@memoflow/ai-contracts';
import { settingUiHost } from '../setting-ui-host';
import { productionLocaleMessages } from '@setting-ui-test-host/locales/production-messages';
import AIPermissionSettings from './AIPermissionSettings.vue';

function setup(extraRules: PermissionSnapshot['rules'] = []) {
  let state: PermissionSnapshot = {
    settings: { preset: 'confirm_each', agentPresets: {}, revision: 1 },
    rules: [
      {
        id: 'legacy-denial',
        agentId: 'codex',
        object: 'goal',
        action: 'update',
        effect: 'deny',
        source: 'migration',
        createdAt: 1000,
      },
      ...extraRules,
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
      },
    },
  });
  return { wrapper, permissions };
}
describe('AI permissions integrated under AI Provider settings', () => {
  it('shows three modes with a single, clear global read/write summary', async () => {
    const { wrapper, permissions } = setup();
    await flushPromises();
    expect(wrapper.findAll('[data-testid^="ai-permission-preset-"]')).toHaveLength(3);
    expect(wrapper.get('[data-testid="ai-permission-current-preset"]').text()).toContain(
      '需要确认',
    );
    expect(wrapper.find('[data-testid="ai-permission-agent-codex"]').exists()).toBe(false);
    await wrapper.get('[data-testid="ai-permission-preset-full_auto"]').trigger('click');
    await flushPromises();
    expect(permissions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'settings',
        settings: expect.objectContaining({ preset: 'full_auto', agentPresets: {} }),
      }),
    );
    wrapper.unmount();
  });

  it('maps one object write exception to create, update and delete without exposing CRUD', async () => {
    const { wrapper, permissions } = setup();
    await flushPromises();
    expect(wrapper.findAll('[data-testid^="ai-permission-cell-"]')).toHaveLength(12);
    await wrapper.get('[data-testid="ai-permission-cell-goal-write"]').setValue('deny');
    await flushPromises();
    expect(permissions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'settings',
        settings: expect.objectContaining({
          preset: 'custom',
          customMatrix: expect.objectContaining({
            goal: { read: 'allow', create: 'deny', update: 'deny', delete: 'deny' },
          }),
        }),
      }),
    );
    expect(wrapper.find('[data-testid="ai-permission-cell-ai_permission-write"]').exists()).toBe(
      false,
    );
    wrapper.unmount();
  });

  it('configures the bulk threshold in the high-risk section and keeps it across preset saves', async () => {
    const { wrapper, permissions } = setup();
    await flushPromises();
    const section = wrapper.get('[data-testid="ai-permission-high-risk"]');
    expect(section.text()).toContain('高风险操作');
    expect(section.text()).toContain('当场确认');
    const input = wrapper.get('[data-testid="ai-permission-bulk-threshold"]');
    expect((input.element as HTMLInputElement).value).toBe('10');
    (input.element as HTMLInputElement).value = '25';
    await input.trigger('change');
    await flushPromises();
    expect(permissions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'settings',
        settings: expect.objectContaining({ bulkThreshold: 25 }),
      }),
    );
    await wrapper.get('[data-testid="ai-permission-preset-full_auto"]').trigger('click');
    await flushPromises();
    expect(permissions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'settings',
        settings: expect.objectContaining({ preset: 'full_auto', bulkThreshold: 25 }),
      }),
    );
    wrapper.unmount();
  });

  it('preserves but lets users revoke migrated deny rules without agent-level configuration', async () => {
    const { wrapper, permissions } = setup();
    await flushPromises();
    expect(wrapper.get('[data-testid="ai-permission-revoke-legacy-denial"]').text()).toContain(
      '撤销',
    );
    await wrapper.get('[data-testid="ai-permission-revoke-legacy-denial"]').trigger('click');
    await flushPromises();
    expect(permissions).toHaveBeenLastCalledWith({
      action: 'revoke',
      ruleId: 'legacy-denial',
    });
    expect(wrapper.find('[data-testid="ai-permission-revoke-legacy-denial"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
