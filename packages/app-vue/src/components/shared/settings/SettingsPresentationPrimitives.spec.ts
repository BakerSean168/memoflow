import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SettingsDangerZone from './SettingsDangerZone.vue';
import SettingsObjectCard from './SettingsObjectCard.vue';
import SettingsPropertyRow from './SettingsPropertyRow.vue';
import SettingsSection from './SettingsSection.vue';
import SettingsStatusBlock from './SettingsStatusBlock.vue';

const settingsRoot = resolve(__dirname, '../../../modules/setting/components');

describe('settings presentation primitives', () => {
  it('keeps section chrome lightweight while exposing title, description, and actions', () => {
    const wrapper = mount(SettingsSection, {
      props: {
        title: 'Appearance',
        description: 'Presentation preferences',
        testId: 'settings-section',
      },
      slots: {
        default: '<div data-testid="body">body</div>',
        actions: '<button data-testid="action">save</button>',
      },
    });

    const section = wrapper.get('[data-testid="settings-section"]');
    expect(section.classes()).toContain('border-b');
    expect(section.classes().join(' ')).not.toContain('rounded-lg');
    expect(wrapper.text()).toContain('Appearance');
    expect(wrapper.get('[data-testid="body"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="action"]').exists()).toBe(true);
  });

  it('uses one property-row grammar for inline and stacked controls', () => {
    const inline = mount(SettingsPropertyRow, {
      props: { label: 'Theme', description: 'Choose a theme', htmlFor: 'theme' },
      slots: { default: '<button id="theme">Auto</button>' },
    });
    expect(inline.get('label').attributes('for')).toBe('theme');
    expect(inline.text()).toContain('Choose a theme');
    expect(inline.get('button').text()).toBe('Auto');

    const stacked = mount(SettingsPropertyRow, {
      props: { label: 'Nickname', layout: 'stacked' },
      slots: { default: '<input data-testid="control" />' },
    });
    expect(stacked.get('[data-testid="control"]').exists()).toBe(true);
    expect(stacked.get('[class*="space-y-2"]').exists()).toBe(true);
  });

  it('provides consistent loading and error semantics without owner behavior', () => {
    const loading = mount(SettingsStatusBlock, {
      props: { kind: 'loading', testId: 'loading' },
    });
    expect(loading.get('[data-testid="loading"]').attributes('aria-busy')).toBe('true');
    expect(loading.get('[data-testid="loading"]').attributes('role')).toBe('status');

    const error = mount(SettingsStatusBlock, {
      props: { kind: 'error', description: 'Unable to load', testId: 'error' },
    });
    expect(error.get('[data-testid="error"]').attributes('role')).toBe('alert');
    expect(error.text()).toContain('Unable to load');
  });

  it('reserves object cards for bounded complex objects and danger zones for destructive actions', () => {
    const objectCard = mount(SettingsObjectCard, {
      props: { testId: 'object-card' },
      slots: { default: 'Provider connection' },
    });
    expect(objectCard.get('[data-testid="object-card"]').classes()).toContain('rounded-lg');

    const danger = mount(SettingsDangerZone, {
      props: { title: 'Reset preferences', description: 'This resets saved preferences.' },
      slots: { actions: '<button data-testid="reset">Reset</button>' },
    });
    expect(danger.text()).toContain('Reset preferences');
    expect(danger.get('[data-testid="reset"]').exists()).toBe(true);
  });

  it('migrates canonical preference surfaces off heavy cards and native selects', () => {
    const appearance = readFileSync(resolve(settingsRoot, 'AppearanceSettings.vue'), 'utf8');
    const locale = readFileSync(resolve(settingsRoot, 'LocaleSettings.vue'), 'utf8');
    const reset = readFileSync(resolve(settingsRoot, 'SettingsResetSection.vue'), 'utf8');
    const preferences = readFileSync(
      resolve(settingsRoot, 'UserPreferenceSettingsSection.vue'),
      'utf8',
    );
    const account = readFileSync(
      resolve(settingsRoot, '../../account/components/AccountProfileSection.vue'),
      'utf8',
    );
    const dialogShell = readFileSync(resolve(__dirname, 'SettingsDialogShell.vue'), 'utf8');

    expect(appearance).toContain('<SettingsSection');
    expect(appearance).toContain('<SettingsPropertyRow');
    expect(appearance).not.toContain('<Card');

    expect(locale).toContain('<SettingsSection');
    expect(locale).toContain('<SettingsPropertyRow');
    expect(locale).not.toContain('<Card');

    expect(reset).toContain('<SettingsDangerZone');
    expect(reset).toContain('<Select');
    expect(reset).not.toContain('<select');
    expect(reset).not.toContain('<Card');

    expect(preferences).toContain('<SettingsStatusBlock');

    expect(account).toContain('<SettingsSection');
    expect(account).toContain('<SettingsDangerZone');

    expect(dialogShell).toContain('<DialogContent');
    expect(dialogShell).toContain('<DialogFooter');
    expect(dialogShell).toContain("size?: 'default' | 'wide'");
    expect(dialogShell).toContain(':class="bodyClass"');
  });

  it('converges AI and Knowledge owner sections on shared settings presentation grammar', () => {
    const ai = readFileSync(resolve(settingsRoot, 'AISettings.vue'), 'utf8');
    const knowledge = readFileSync(
      resolve(settingsRoot, 'KnowledgeRepositorySettings.vue'),
      'utf8',
    );

    expect(ai).toContain('<SettingsSection');
    expect(ai).toContain('<SettingsObjectCard');
    expect(ai).toContain('<SettingsStatusBlock');
    expect(ai).toContain('<SettingsDialogShell');
    expect(ai).toContain('useAI()');
    expect(ai).toContain('commitProviderOnboarding');
    expect(ai).not.toContain('<Card');
    expect(ai).not.toContain('<DialogContent');
    expect(ai).not.toMatch(/(?:amber|emerald)-\d+/);

    expect(knowledge).toContain('<SettingsSection');
    expect(knowledge).toContain('<SettingsObjectCard');
    expect(knowledge).toContain('<SettingsStatusBlock');
    expect(knowledge).toContain('<SettingsDialogShell');
    expect(knowledge).toContain('service.startKnowledgeRepositoryInstallation');
    expect(knowledge).toContain('service.syncKnowledgeRepository');
    expect(knowledge).not.toContain('<Card');
    expect(knowledge).not.toContain('<DialogContent');
    expect(knowledge).not.toMatch(/(?:amber|emerald)-\d+/);
  });
});
