import { computed, defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import {
  createSettingsSectionResetRegistry,
  provideSettingsSectionReset,
  useSettingsSectionReset,
} from './useSettingsSectionReset';

/**
 * Issue #927: the settings shell exposes one restore action per section, but the
 * section keeps ownership of the mutation. These tests pin the registration
 * contract the shell relies on to decide whether the button is shown.
 */
describe('settings section reset registry', () => {
  it('tracks registered actions reactively', () => {
    const registry = createSettingsSectionResetRegistry();
    const action = vi.fn();
    const canReset = computed(() => registry.has('appearance'));

    expect(canReset.value).toBe(false);
    expect(registry.action('appearance')).toBeUndefined();

    registry.register('appearance', action);
    expect(canReset.value).toBe(true);
    expect(registry.action('appearance')).toBe(action);

    registry.unregister('appearance');
    expect(canReset.value).toBe(false);
    expect(registry.action('appearance')).toBeUndefined();
  });

  it('registers a section action while mounted and drops it on unmount', () => {
    const registry = createSettingsSectionResetRegistry();
    const action = vi.fn();
    const Section = defineComponent({
      setup() {
        useSettingsSectionReset('shortcuts', action);
        return () => h('div');
      },
    });
    const Shell = defineComponent({
      setup() {
        provideSettingsSectionReset(registry);
        return () => h(Section);
      },
    });

    const wrapper = mount(Shell);
    expect(registry.action('shortcuts')).toBe(action);

    wrapper.unmount();
    expect(registry.action('shortcuts')).toBeUndefined();
  });

  it('stays inert without an enclosing settings shell', () => {
    const Section = defineComponent({
      setup() {
        useSettingsSectionReset('shortcuts', vi.fn());
        return () => h('div');
      },
    });

    const wrapper = mount(Section);
    expect(() => wrapper.unmount()).not.toThrow();
  });
});
