/** @vitest-environment happy-dom */

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ModuleHeader from './ModuleHeader.vue';

describe('ModuleHeader product-surface grammar', () => {
  it('defaults detail/inspect composition to the entity family and preserves caller attrs', () => {
    const wrapper = mount(ModuleHeader, {
      attrs: { 'data-testid': 'owner-detail-toolbar' },
      slots: {
        leading: '<span data-testid="leading">Back</span>',
        actions: '<button data-testid="action">More</button>',
      },
    });

    const header = wrapper.get('header');
    expect(header.attributes('data-testid')).toBe('owner-detail-toolbar');
    expect(header.attributes('data-surface-header-family')).toBe('entity');
    expect(wrapper.get('[data-testid="leading"]').text()).toBe('Back');
    expect(wrapper.get('[data-testid="action"]').text()).toBe('More');
  });

  it('lets collection and diagnostic owners select their legal family without changing slots', () => {
    for (const family of ['collection', 'diagnostic'] as const) {
      const wrapper = mount(ModuleHeader, {
        props: { family },
        slots: { subnav: '<nav data-testid="subnav">Filters</nav>' },
      });

      expect(wrapper.get('header').attributes('data-surface-header-family')).toBe(family);
      expect(wrapper.get('[data-testid="subnav"]').text()).toBe('Filters');
    }
  });
});
