import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SettingsDangerZone from './SettingsDangerZone.vue';
import SettingsObjectCard from './SettingsObjectCard.vue';
import SettingsPropertyRow from './SettingsPropertyRow.vue';
import SettingsSection from './SettingsSection.vue';
import SettingsStatusBlock from './SettingsStatusBlock.vue';

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

  it.each([
    ['loading', 'bg-muted/45 text-muted-foreground', 'status', 'true'],
    ['error', 'bg-destructive/8 text-destructive', 'alert', undefined],
    ['info', 'bg-info/8 text-foreground', 'status', undefined],
    ['success', 'bg-success/8 text-foreground', 'status', undefined],
  ] as const)(
    'maps %s to semantic status tone and accessibility state',
    (kind, classes, role, busy) => {
      const wrapper = mount(SettingsStatusBlock, { props: { kind } });
      expect(wrapper.classes()).toEqual(expect.arrayContaining(classes.split(' ')));
      expect(wrapper.attributes('role')).toBe(role);
      expect(wrapper.attributes('aria-busy')).toBe(busy);
      wrapper.unmount();
    },
  );

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
});
