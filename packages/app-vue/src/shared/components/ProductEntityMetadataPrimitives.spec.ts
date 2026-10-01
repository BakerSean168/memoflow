import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ProductEntityIdentity from './ProductEntityIdentity.vue';
import ProductMetadataRow from './ProductMetadataRow.vue';
import ProductMoreProperties from './ProductMoreProperties.vue';

describe('product entity metadata primitives', () => {
  it('keeps entity identity presentation-only', () => {
    const wrapper = mount(ProductEntityIdentity, {
      slots: {
        default: '<h1 data-testid="identity-title">Quarterly plan</h1>',
      },
    });

    expect(wrapper.get('[data-slot="product-entity-identity"]').classes()).toContain('space-y-1');
    expect(wrapper.get('[data-testid="identity-title"]').text()).toBe('Quarterly plan');
  });

  it('provides the canonical metadata label/value grid without owning domain content', () => {
    const wrapper = mount(ProductMetadataRow, {
      props: { label: 'Labels' },
      slots: {
        default:
          '<div class="flex min-w-0 flex-wrap items-center gap-1.5"><button data-testid="metadata-value">Backend</button></div>',
      },
    });

    expect(wrapper.get('[data-slot="product-metadata-row"]').classes()).toContain(
      'grid-cols-[6.5rem_minmax(0,1fr)]',
    );
    expect(wrapper.get('[data-slot="product-metadata-label"]').text()).toBe('Labels');
    expect(wrapper.get('[data-testid="metadata-value"]').text()).toBe('Backend');
  });

  it('owns only the shared more-properties trigger chrome', () => {
    const wrapper = mount(ProductMoreProperties, {
      props: {
        label: 'More properties',
        testId: 'more-properties',
      },
      slots: {
        default: '<button data-testid="domain-action">Domain action</button>',
      },
    });

    const trigger = wrapper.get('[data-testid="more-properties"]');
    expect(trigger.attributes('aria-label')).toBe('More properties');
    expect(trigger.attributes('data-slot')).toBe('product-more-properties-trigger');
  });
});
