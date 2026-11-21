/** @vitest-environment happy-dom */
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import { productionLocaleMessages } from '../../../locales/production-messages';
import NoteCapsulePreview from './NoteCapsulePreview.vue';

describe('Knowledge capsule connection entry', () => {
  it('explains context references and opens the knowledge hub without a second catalog', async () => {
    const wrapper = mount(NoteCapsulePreview, {
      global: {
        plugins: [
          createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages }),
        ],
      },
    });
    expect(wrapper.text()).toContain('Type @');
    expect(wrapper.find('input, textarea').exists()).toBe(false);
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('view-all')).toHaveLength(1);
    wrapper.unmount();
  });
});
