import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProductExpandableSection from './ProductExpandableSection.vue';

describe('ProductExpandableSection', () => {
  it('emits a controlled open state from its shared trigger', async () => {
    const wrapper = mount(ProductExpandableSection, {
      props: { open: false },
      slots: {
        trigger: '<button data-testid="trigger">Key Results</button>',
        default: '<div data-testid="body">Editor</div>',
      },
    });

    await wrapper.get('[data-testid="trigger"]').trigger('click');
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([true]);
  });

  it('uses reduced-motion-safe transition classes when expanded', () => {
    const wrapper = mount(ProductExpandableSection, {
      props: { open: true },
      slots: {
        trigger: '<button>Toggle</button>',
        default: '<div>Editor</div>',
      },
    });
    const content = wrapper.get('[data-testid="product-expandable-content"]');
    expect(content.classes()).toContain('duration-200');
    expect(content.classes()).toContain('motion-reduce:transition-none');
  });
});
