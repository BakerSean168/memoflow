import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProductPropertyChip from './ProductPropertyChip.vue';

describe('ProductPropertyChip', () => {
  it('renders a compact property trigger and exposes active state accessibly', () => {
    const wrapper = mount(ProductPropertyChip, {
      props: { active: true },
      slots: { default: 'Schedule', icon: '<span data-testid="icon">S</span>' },
    });

    const button = wrapper.get('button');
    expect(button.attributes('data-slot')).toBe('product-property-chip');
    expect(button.attributes('aria-pressed')).toBe('true');
    expect(button.text()).toContain('Schedule');
    expect(wrapper.get('[data-testid="icon"]').exists()).toBe(true);
  });

  it('does not invent aria-pressed for value chips that are not toggle controls', () => {
    const wrapper = mount(ProductPropertyChip, { slots: { default: 'Target: Q4' } });
    expect(wrapper.get('button').attributes('aria-pressed')).toBeUndefined();
  });
});
