import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import SettingsNavigation from './SettingsNavigation.vue';
import enSetting from '@setting-ui-test-host/locales/en-US/setting';

/**
 * Issue #927: the settings shell search narrows the section navigation by section
 * name. It is a navigation filter, not a full-text search inside a section.
 */
const items = [
  { value: 'shortcuts', label: 'Keyboard shortcuts' },
  { value: 'appearance', label: 'Appearance & Language' },
  { value: 'ai', label: 'AI' },
];

function mountNavigation() {
  return mount(SettingsNavigation, {
    props: { items, active: 'appearance' },
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'en-US',
          messages: { 'en-US': { setting: enSetting } },
        }),
      ],
    },
  });
}

describe('SettingsNavigation', () => {
  it('lists every section and marks the active one', () => {
    const wrapper = mountNavigation();

    expect(wrapper.findAll('[data-testid^="settings-tab-"]')).toHaveLength(items.length);
    expect(wrapper.get('[data-testid="settings-tab-appearance"]').attributes('aria-current')).toBe(
      'page',
    );
    expect(wrapper.find('[data-testid="settings-tab-ai"]').attributes('aria-current')).toBe(
      undefined,
    );
  });

  it('filters sections by name, case-insensitively, and reports no matches', async () => {
    const wrapper = mountNavigation();
    const search = wrapper.get('[data-testid="settings-nav-search"]');

    await search.setValue('keyb');
    expect(wrapper.findAll('[data-testid^="settings-tab-"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="settings-tab-shortcuts"]').exists()).toBe(true);

    await search.setValue('  APPEARANCE ');
    expect(wrapper.findAll('[data-testid^="settings-tab-"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="settings-tab-appearance"]').exists()).toBe(true);

    await search.setValue('knowledge repository');
    expect(wrapper.findAll('[data-testid^="settings-tab-"]')).toHaveLength(0);
    expect(wrapper.get('[data-testid="settings-nav-empty"]').text()).toBe('No matching sections');
  });

  it('clears the filter from the clear button, Escape and a section pick', async () => {
    const wrapper = mountNavigation();
    const search = wrapper.get('[data-testid="settings-nav-search"]');

    await search.setValue('ai');
    await wrapper.get('[data-testid="settings-nav-search-clear"]').trigger('click');
    expect((search.element as HTMLInputElement).value).toBe('');
    expect(wrapper.findAll('[data-testid^="settings-tab-"]')).toHaveLength(items.length);

    await search.setValue('appearance');
    await search.trigger('keydown', { key: 'Escape' });
    expect((search.element as HTMLInputElement).value).toBe('');

    // Picking a filtered row emits the section and restores the full list.
    await search.setValue('shortcuts');
    await wrapper.get('[data-testid="settings-tab-shortcuts"]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['shortcuts']]);
    expect((search.element as HTMLInputElement).value).toBe('');
    expect(wrapper.findAll('[data-testid^="settings-tab-"]')).toHaveLength(items.length);
  });
});
