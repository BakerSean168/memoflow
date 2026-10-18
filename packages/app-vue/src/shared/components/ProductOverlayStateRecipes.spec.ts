import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProductSurfaceState from './ProductSurfaceState.vue';

describe('product overlay and state recipes', () => {
  it('exposes collection, workspace, and dialog state families with stable semantics', () => {
    const loading = mount(ProductSurfaceState, {
      props: {
        family: 'workspace',
        kind: 'loading',
        title: 'Loading workspace',
      },
    });
    expect(loading.attributes('data-state-family')).toBe('workspace');
    expect(loading.attributes('aria-busy')).toBe('true');
    expect(loading.attributes('role')).toBe('status');

    const error = mount(ProductSurfaceState, {
      props: {
        family: 'collection',
        kind: 'error',
        title: 'Unable to load',
      },
    });
    expect(error.attributes('data-state-family')).toBe('collection');
    expect(error.attributes('role')).toBe('alert');

    const empty = mount(ProductSurfaceState, {
      props: {
        family: 'dialog',
        kind: 'empty',
        title: 'Nothing generated',
      },
    });
    expect(empty.attributes('data-state-family')).toBe('dialog');
    expect(empty.text()).toContain('Nothing generated');
  });
});
