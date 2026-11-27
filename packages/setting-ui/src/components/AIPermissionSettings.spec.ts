import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import type { PermissionCommand, PermissionSnapshot } from '@memoflow/ai-contracts';
import { Select } from '@memoflow/ui-vue-shadcn';
import { settingUiHost } from '../setting-ui-host';
import { productionLocaleMessages } from '@setting-ui-test-host/locales/production-messages';
import { SERVER_STATE_IDENTITY_SCOPE_KEY } from '@setting-ui-test-host/platform/server-state';
import AIPermissionSettings from './AIPermissionSettings.vue';

function setup(extraRules: PermissionSnapshot['rules'] = []) {
  const identityScope = ref('profile-a');
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
    audit: [
      {
        id: 'audit-1',
        occurredAt: 2000,
        agentId: 'codex',
        conversationId: null,
        operationId: 'op-inline-excluded',
        object: 'task',
        action: 'update',
        decision: 'ask',
        decidedBy: 'preset',
        ruleId: null,
        execution: 'succeeded',
      },
    ],
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
        [SERVER_STATE_IDENTITY_SCOPE_KEY as symbol]: () => identityScope.value,
      },
    },
  });
  return { wrapper, permissions, identityScope };
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
    expect(wrapper.findAll('[data-testid^="ai-permission-cell-"]')).toHaveLength(14);
    const cellSelect = wrapper
      .findAllComponents(Select)
      .find((candidate) =>
        candidate.find('[data-testid="ai-permission-cell-goal-write"]').exists(),
      );
    expect(cellSelect).toBeDefined();
    cellSelect!.vm.$emit('update:modelValue', 'deny');
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
    expect(wrapper.get('[data-testid="ai-permission-cell-goal-write"]').classes()).toEqual(
      expect.arrayContaining(['h-8', 'text-xs', 'min-w-24']),
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

  it('keeps high-risk confirmation visible, hides inline activity list, and emits open-activity', async () => {
    const { wrapper } = setup();
    await flushPromises();
    expect(wrapper.find('[data-testid="ai-permission-activity"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('op-inline-excluded');
    const bulkDetails = wrapper.get('[data-testid="ai-permission-bulk-settings"]');
    expect((bulkDetails.element as HTMLDetailsElement).open).toBe(false);
    const highRisk = wrapper.get('[data-testid="ai-permission-high-risk"]');
    expect(highRisk.text()).toContain('永久删除');
    expect(highRisk.text()).toContain('AI 无法修改权限设置');
    await wrapper.get('[data-testid="ai-permission-open-activity"]').trigger('click');
    expect(wrapper.emitted('open-activity')).toHaveLength(1);
    wrapper.unmount();
  });

  it('discards stale snapshot responses after identity switches and shows error when snapshot fails', async () => {
    let resolveProfileA!: (snapshot: PermissionSnapshot) => void;
    const identityScope = ref('profile-a');
    const permissions = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<PermissionSnapshot>((resolve) => {
            resolveProfileA = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error('permission load failed'));
    const wrapper = mount(AIPermissionSettings, {
      global: {
        plugins: [
          createI18n({ legacy: false, locale: 'zh-CN', messages: productionLocaleMessages }),
        ],
        provide: {
          [settingUiHost.AI_LOCAL_AGENT_KEY as symbol]: { permissions },
          [SERVER_STATE_IDENTITY_SCOPE_KEY as symbol]: () => identityScope.value,
        },
      },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="ai-permissions-loading"]').exists()).toBe(true);

    identityScope.value = 'profile-b';
    await flushPromises();
    expect(wrapper.find('[data-testid="ai-permissions-error"]').exists()).toBe(true);

    resolveProfileA({
      settings: { preset: 'full_auto', agentPresets: {}, revision: 1 },
      rules: [],
      audit: [],
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="ai-permission-current-preset"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
