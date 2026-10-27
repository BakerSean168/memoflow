import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import task from '@task-ui-test-host/locales/zh-CN/task';
import type { TaskPlanViewModel } from '../../types';
import BasicInfoSection from './BasicInfoSection.vue';
import TaskPlanForm from '../TaskPlanForm.vue';
import { installTaskUiHost } from '@task-ui-test-host/di/task-ui-host';
installTaskUiHost();


vi.mock('@task-ui-test-host/shared/composables/useLabelCatalog', () => ({
  useLabelCatalog: () => ({
    labels: ref([]),
    options: ref([]),
    isLoading: ref(false),
    createLabel: vi.fn(),
  }),
}));

const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': { task } } });

function plan(title = ''): TaskPlanViewModel {
  return {
    id: 'plan-1',
    title,
    description: '保留草稿',
    status: 'Active',
    schedule: { kind: 'OneTime', date: '2026-10-16', timing: { kind: 'AllDay' } },
    importance: 'Moderate',
    goalBinding: null,
    reminderConfig: null,
    checklist: [],
  };
}

function mountSection(modelValue = plan(), readonly = false) {
  const wrapper = mount(BasicInfoSection, {
    attachTo: document.body,
    props: {
      modelValue,
      readonly,
      'onUpdate:modelValue': (value: TaskPlanViewModel): void => {
        void wrapper.setProps({ modelValue: value });
      },
    },
    global: { plugins: [i18n] },
  });
  wrappers.push(wrapper);
  return wrapper;
}

const wrappers: VueWrapper[] = [];
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

describe('BasicInfoSection title feedback', () => {
  it('reserves a single line before blur, shows an associated error, and clears it after correction', async () => {
    const wrapper = mountSection();
    const input = wrapper.get('textarea');
    const slot = wrapper.get('[aria-live="polite"]');
    const slotElement = slot.element;

    expect(slot.classes()).toContain('min-h-4');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(input.attributes('aria-invalid')).toBeUndefined();
    expect(input.attributes('aria-describedby')).toBeUndefined();
    expect(wrapper.emitted('update:validation')).toEqual([[false]]);

    await input.trigger('blur');

    const error = wrapper.get('[data-testid="task-title-validation-error"]');
    expect(error.text()).toBe(task.basicInfo.titleRequired);
    expect(error.attributes('title')).toBe(task.basicInfo.titleRequired);
    expect(error.classes()).toEqual(expect.arrayContaining(['truncate', 'leading-4']));
    expect(input.attributes('aria-invalid')).toBe('true');
    expect(input.attributes('aria-describedby')).toBe(error.attributes('id'));
    expect(error.attributes('id')).toBeTruthy();
    expect(slot.element).toBe(slotElement);
    expect(slot.classes()).toContain('min-h-4');

    await input.setValue('整理本周计划');

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(input.attributes('aria-invalid')).toBeUndefined();
    expect(input.attributes('aria-describedby')).toBeUndefined();
    expect(wrapper.get('[aria-live="polite"]').element).toBe(slotElement);
    expect(slot.classes()).toContain('min-h-4');
    expect(wrapper.emitted('update:modelValue')).toEqual([[plan('整理本周计划')]]);
    expect(wrapper.emitted('update:validation')).toEqual([[false], [true]]);
  });

  it('keeps whitespace invalid without exposing an error until blur, including after switching plans', async () => {
    const wrapper = mountSection();
    const input = wrapper.get('textarea');

    await input.setValue('   ');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(input.attributes('aria-describedby')).toBeUndefined();
    expect(wrapper.emitted('update:validation')?.at(-1)).toEqual([false]);

    await input.trigger('blur');
    expect(wrapper.get('[role="alert"]').text()).toBe(task.basicInfo.titleRequired);

    await wrapper.setProps({ modelValue: { ...plan(), id: 'plan-2' } });
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(input.attributes('aria-invalid')).toBeUndefined();
    expect(input.attributes('aria-describedby')).toBeUndefined();

    await input.trigger('blur');
    expect(wrapper.get('[role="alert"]').text()).toBe(task.basicInfo.titleRequired);
  });

  it('opts the actual textarea into focus-visible feedback without reporting untouched errors on focus', async () => {
    const wrapper = mountSection();
    const input = wrapper.get('textarea');

    // happy-dom verifies focusability and the CSS contract, not browser Tab navigation or paint.
    input.element.focus();
    await nextTick();

    expect(document.activeElement).toBe(input.element);
    expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id'));
    expect(input.classes()).toEqual(
      expect.arrayContaining(['focus-visible:ring-2', 'focus-visible:ring-ring']),
    );
    expect(input.classes()).not.toContain('focus-visible:ring-0');
    expect(input.attributes('aria-invalid')).toBeUndefined();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('retains the 100-character input limit and the remaining draft fields', async () => {
    const wrapper = mountSection();
    const input = wrapper.get('textarea');
    await input.setValue('任'.repeat(101));

    expect(input.element.value).toBe('任'.repeat(100));
    expect(wrapper.emitted('update:modelValue')).toEqual([[plan('任'.repeat(100))]]);
    expect(wrapper.emitted('update:validation')?.at(-1)).toEqual([true]);
    await input.trigger('blur');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('disables the title while saving and ignores attempted draft changes', async () => {
    const wrapper = mountSection(plan('保存中的标题'), true);
    const input = wrapper.get('textarea');
    expect(input.attributes('disabled')).toBeDefined();
    // Also exercise the guard if an input event is dispatched programmatically.
    input.element.value = '不应写入';
    input.element.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(wrapper.props('modelValue')).toEqual(plan('保存中的标题'));
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('update:validation')).toEqual([[true]]);
  });

  it('propagates real title validity and draft updates through the parent form and preserves submit guards', async () => {
    const wrapper = mount(TaskPlanForm, {
      props: {
        modelValue: plan(),
        'onUpdate:modelValue': (modelValue: TaskPlanViewModel): void => {
          void wrapper.setProps({ modelValue });
        },
      },
      global: {
        plugins: [i18n],
        stubs: {
          TimeConfigSection: true,
          RecurrenceSection: true,
          ReminderSection: true,
          KeyResultLinksSection: true,
          ChecklistSection: true,
          LabelPicker: true,
        },
      },
    });
    wrappers.push(wrapper);
    const input = wrapper.get('[data-testid="task-plan-title-input"]');

    expect(wrapper.vm.validate()).toBe(false);
    await input.trigger('blur');
    expect(wrapper.vm.validate()).toBe(false);
    expect(wrapper.emitted('submit')).toBeUndefined();

    await input.setValue('保存此任务');
    expect(wrapper.vm.validate()).toBe(true);
    expect(wrapper.emitted('update:validation')?.at(-1)).toEqual([{ isValid: true }]);
    expect(wrapper.emitted('update:modelValue')).toEqual([[plan('保存此任务')]]);

    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toEqual([[]]);

    await wrapper.setProps({ readonly: true });
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toEqual([[]]);
    expect(wrapper.props('modelValue')).toEqual(plan('保存此任务'));

    await wrapper.setProps({ readonly: false });
    await input.setValue('');
    expect(wrapper.vm.validate()).toBe(false);
    expect(wrapper.emitted('update:validation')?.at(-1)).toEqual([{ isValid: false }]);
    expect(wrapper.get('[role="alert"]').text()).toBe(task.basicInfo.titleRequired);
  });
});
