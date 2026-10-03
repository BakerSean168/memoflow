/** @vitest-environment happy-dom */

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProductSurfaceHeader from './ProductSurfaceHeader.vue';
import { PRODUCT_SURFACE_HEADER_FAMILIES } from './product-surface-header.types';

describe('ProductSurfaceHeader', () => {
  it('freezes the legal product-surface header families', () => {
    expect(PRODUCT_SURFACE_HEADER_FAMILIES).toEqual([
      'collection',
      'entity',
      'calendar',
      'document',
      'settings',
      'diagnostic',
    ]);
  });

  it.each(PRODUCT_SURFACE_HEADER_FAMILIES)(
    'exposes the %s family as a stable presentation contract',
    (family) => {
      const wrapper = mount(ProductSurfaceHeader, {
        props: { family },
        attrs: { 'data-testid': 'surface-header' },
        slots: { default: '<span>Header content</span>' },
      });

      const header = wrapper.get('header');
      expect(header.attributes('data-testid')).toBe('surface-header');
      expect(header.attributes('data-surface-header-family')).toBe(family);
      expect(header.classes()).toContain('border-b');
      expect(header.classes()).toContain('shrink-0');
    },
  );

  it('keeps family-specific geometry instead of forcing one literal header height', () => {
    const collection = mount(ProductSurfaceHeader, { props: { family: 'collection' } });
    const calendar = mount(ProductSurfaceHeader, { props: { family: 'calendar' } });
    const settings = mount(ProductSurfaceHeader, { props: { family: 'settings' } });

    expect(collection.get('header').classes()).toContain('min-h-11');
    expect(calendar.get('header').classes()).toContain('flex-wrap');
    expect(settings.get('header').classes()).toContain('min-h-12');
  });
});
