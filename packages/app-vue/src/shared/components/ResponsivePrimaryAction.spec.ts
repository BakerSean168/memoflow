/** @vitest-environment happy-dom */

import { shallowMount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { Plus } from '@lucide/vue';
import ResponsivePrimaryAction from './ResponsivePrimaryAction.vue';

describe('ResponsivePrimaryAction', () => {
  it('keeps one 32px accessible icon action without a visible label at any width', () => {
    const wrapper = shallowMount(ResponsivePrimaryAction, {
      props: { label: 'New plan', icon: Plus },
      attrs: { 'data-testid': 'create-entry' },
    });

    expect(wrapper.attributes('aria-label')).toBe('New plan');
    expect(wrapper.attributes('data-testid')).toBe('create-entry');
    expect(wrapper.attributes('title')).toBe('New plan');
  });
});
