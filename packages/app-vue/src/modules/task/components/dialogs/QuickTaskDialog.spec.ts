import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const confirmMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock('@memoflow/ui-vue-shadcn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/ui-vue-shadcn')>();
  return { ...actual, useConfirm: confirmMock };
});

import QuickTaskDialog from './QuickTaskDialog.vue';

const passThrough = (name: string, tag = 'div') =>
  defineComponent({
    name,
    setup(_props, { slots, attrs }) {
      return () => h(tag, attrs, slots.default?.());
    },
  });

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: {
        cancel: 'Cancel',
        unsavedChangesTitle: 'Discard unsaved changes?',
        unsavedChangesDescription: 'Closing will discard changes.',
        discardChanges: 'Discard changes',
      },
      task: {
        quickTask: {
          title: 'Quick task',
          subtitle: 'Create a task for today',
          name: 'Task',
          placeholder: 'What needs doing?',
          todayAllDay: 'Today · All day',
          create: 'Create',
        },
      },
    },
  },
});

function mountDialog() {
  return mount(QuickTaskDialog, {
    props: { modelValue: true },
    global: {
      plugins: [i18n],
      stubs: {
        Dialog: passThrough('Dialog'),
        DialogContent: passThrough('DialogContent'),
        DialogDescription: passThrough('DialogDescription'),
        DialogFooter: passThrough('DialogFooter'),
        DialogHeader: passThrough('DialogHeader'),
        DialogTitle: passThrough('DialogTitle'),
        Button: passThrough('Button', 'button'),
        Input: defineComponent({
          name: 'QuickTaskInputStub',
          props: ['modelValue'],
          emits: ['update:modelValue'],
          setup(props, { emit, attrs }) {
            return () =>
              h('input', {
                ...attrs,
                value: props.modelValue,
                onInput: (event: Event) =>
                  emit('update:modelValue', (event.target as HTMLInputElement).value),
              });
          },
        }),
        Label: passThrough('Label', 'label'),
        Zap: true,
      },
    },
  });
}

describe('QuickTaskDialog', () => {
  beforeEach(() => {
    confirmMock.mockReset();
    confirmMock.mockResolvedValue(true);
  });
  it('keeps capture title-only with a fixed Today / All day default', () => {
    const wrapper = mountDialog();
    expect(wrapper.findAll('input')).toHaveLength(1);
    expect(wrapper.find('textarea, select').exists()).toBe(false);
    expect(wrapper.text()).toContain('Today · All day');
    expect(wrapper.findComponent({ name: 'TaskPlanForm' }).exists()).toBe(false);
  });

  it('rejects blank titles and prevents another save while pending', async () => {
    const wrapper = mountDialog();
    await wrapper.get('input').setValue('   ');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('save')).toBeUndefined();
    await wrapper.get('input').setValue('Keep this draft');
    await wrapper.setProps({ saving: true });
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('save')).toBeUndefined();
    expect(wrapper.get('input').element.value).toBe('Keep this draft');
    expect(
      wrapper.get('[data-testid="quick-task-save-button"]').attributes('disabled'),
    ).toBeDefined();
  });

  it('submits a trimmed title from the compact form', async () => {
    const wrapper = mountDialog();
    await wrapper.get('[data-testid="quick-task-title-input"]').setValue('  Ship review  ');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('save')).toEqual([[{ title: 'Ship review' }]]);
  });

  it('clears the draft when reopened', async () => {
    const wrapper = mountDialog();
    await wrapper.get('[data-testid="quick-task-title-input"]').setValue('Unsaved');
    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });

    expect(
      (wrapper.get('[data-testid="quick-task-title-input"]').element as HTMLInputElement).value,
    ).toBe('');
  });

  it('reports dirty only while the title differs from its opening baseline', async () => {
    const wrapper = mountDialog();
    expect(wrapper.emitted('dirty-change')?.at(-1)).toEqual([false]);

    await wrapper.get('[data-testid="quick-task-title-input"]').setValue('Unsaved');
    expect(wrapper.emitted('dirty-change')?.at(-1)).toEqual([true]);

    await wrapper.get('[data-testid="quick-task-title-input"]').setValue('');
    expect(wrapper.emitted('dirty-change')?.at(-1)).toEqual([false]);
  });

  it('confirms before discarding a dirty draft and then clears it', async () => {
    const wrapper = mountDialog();
    await wrapper.get('input').setValue('Unsaved');
    await wrapper.get('button[type="button"]').trigger('click');
    await Promise.resolve();

    expect(confirmMock).toHaveBeenCalledOnce();
    expect(wrapper.emitted('cancel')).toEqual([[]]);
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    expect(wrapper.emitted('dirty-change')?.at(-1)).toEqual([false]);
    expect(wrapper.get('input').element.value).toBe('');
  });

  it('keeps a dirty draft open when discard confirmation is rejected', async () => {
    confirmMock.mockResolvedValueOnce(false);
    const wrapper = mountDialog();
    await wrapper.get('input').setValue('Keep me');
    await wrapper.get('button[type="button"]').trigger('click');
    await Promise.resolve();

    expect(confirmMock).toHaveBeenCalledOnce();
    expect(wrapper.emitted('cancel')).toBeUndefined();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.get('input').element.value).toBe('Keep me');
    expect(wrapper.emitted('dirty-change')?.at(-1)).toEqual([true]);
  });
});
