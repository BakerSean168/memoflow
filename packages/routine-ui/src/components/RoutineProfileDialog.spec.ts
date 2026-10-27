import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it } from 'vitest';
import { productionLocaleMessages } from '@routine-ui-test-host/locales/production-messages';
import RoutineProfileDialog from './RoutineProfileDialog.vue';

enableAutoUnmount(afterEach);
const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: productionLocaleMessages });

describe('RoutineProfileDialog business pane', () => {
  it('retains the real modal Dialog for independent callers', () => {
    const wrapper = mount(RoutineProfileDialog, {
      props: { open: true },
      global: { plugins: [i18n] },
    });
    expect(wrapper.getComponent({ name: 'DialogRoot' }).props('modal')).toBe(true);
    expect(wrapper.find('[data-editor-presentation="pane"]').exists()).toBe(false);
  });

  it('keeps empty title feedback quiet until blur, clears it on correction and preserves the save guard', async () => {
    const wrapper = mount(RoutineProfileDialog, {
      props: { open: true, presentation: 'panel' },
      global: { plugins: [i18n] },
    });
    expect(wrapper.get('[data-editor-presentation="pane"]').attributes('aria-modal')).toBe('false');
    const name = wrapper.get('textarea');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(name.attributes('aria-describedby')).toBeUndefined();
    await name.trigger('blur');
    expect(wrapper.get('[role="alert"]').text()).toBeTruthy();
    expect(name.attributes('aria-invalid')).toBe('true');
    expect(name.attributes('aria-describedby')).toBe(
      wrapper.get('[role="alert"]').attributes('id'),
    );
    await name.setValue('  工作  ');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('save')).toEqual([[{ name: '工作', description: null }]]);
    await wrapper.setProps({ saving: true });
    await wrapper.get('form').trigger('submit');
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('save')).toHaveLength(1);
    expect(wrapper.emitted('update:open')).toBeUndefined();
  });
});
