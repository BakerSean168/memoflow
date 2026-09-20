import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProductAutoTextarea from './ProductAutoTextarea.vue';

describe('ProductAutoTextarea', () => {
  it('truncates overflowing input and emits limit feedback', async () => {
    const wrapper = mount(ProductAutoTextarea, {
      props: { modelValue: '', maxLength: 5 },
    });
    const textarea = wrapper.get('textarea');
    await textarea.setValue('abcdef');

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['abcde']);
    expect(wrapper.emitted('limit-exceeded')?.at(-1)).toEqual([5]);
    expect((textarea.element as HTMLTextAreaElement).value).toBe('abcde');
  });

  it('defers model updates while IME composition is active', async () => {
    const wrapper = mount(ProductAutoTextarea, {
      props: { modelValue: '', maxLength: 2 },
    });
    const textarea = wrapper.get('textarea');

    await textarea.trigger('compositionstart');
    (textarea.element as HTMLTextAreaElement).value = '中文中';
    await textarea.trigger('input');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    await textarea.trigger('compositionend');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['中文']);
    expect(wrapper.emitted('limit-exceeded')?.at(-1)).toEqual([2]);
  });

  it('does not show the browser resize handle', () => {
    const wrapper = mount(ProductAutoTextarea, { props: { modelValue: '' } });
    expect(wrapper.get('textarea').classes()).toContain('resize-none');
  });
});
