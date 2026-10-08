import { mount } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { _setOpen } from '@memoflow/ui-vue-shadcn';
import { keyboard, useKeyboardRuntime } from './runtime';
import { vKeyboardList } from './list-adapter';

const disposers: Array<() => void> = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  keyboard.closePreview();
  keyboard.helpOpen.value = false;
  keyboard.recorder.value = null;
  keyboard.applyKeymap({ version: 1, overrides: {} });
  _setOpen(false);
  document.body.innerHTML = '';
});
function press(target: Element, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}
function host(template: string) {
  const open = vi.fn();
  const wrapper = mount(
    defineComponent({
      directives: { keyboardList: vKeyboardList },
      setup() {
        useKeyboardRuntime();
        return { open, keyboard };
      },
      template,
    }),
    { attachTo: document.body },
  );
  disposers.push(() => wrapper.unmount());
  return { wrapper, open };
}
describe('one keyboard runtime', () => {
  it('navigates an explicit list, selects, opens and ignores edits and hidden lists', () => {
    const { wrapper, open } = host(
      '<div><input /><div v-keyboard-list="{ selectable: true }"><button data-keyboard-item="a" @click="open(\'a\')">A</button><button data-keyboard-item="b" @click="open(\'b\')">B</button></div></div>',
    );
    const list = wrapper.get('[data-keyboard-list]').element;
    press(list, 'j');
    expect(document.activeElement?.getAttribute('data-keyboard-item')).toBe('a');
    expect(document.activeElement?.hasAttribute('tabindex')).toBe(false);
    press(document.activeElement!, 'J', { shiftKey: true });
    expect(wrapper.findAll('[data-keyboard-selected="true"]')).toHaveLength(2);
    press(document.activeElement!, 'Enter');
    expect(open).toHaveBeenCalledWith('b');
    press(wrapper.get('input').element, 'j');
    expect(open).toHaveBeenCalledTimes(1);
    (list as HTMLElement).style.display = 'none';
    expect(press(list, 'j').defaultPrevented).toBe(false);
  });
  it('protects contenteditable, IME and recorder, and gives confirmation dialogs priority', () => {
    const preview = vi.fn();
    disposers.push(keyboard.register('module.goal.preview', preview));
    const { wrapper } = host(
      '<div><div contenteditable="true"><span>输入</span></div><div role="alertdialog"><button>确认</button></div></div>',
    );
    press(wrapper.get('span').element, '1');
    press(document.body, '1');
    expect(preview).not.toHaveBeenCalled();
    wrapper.get('[role="alertdialog"]').element.remove();
    press(document.body, '1', { isComposing: true });
    press(document.body, '1', { ctrlKey: true, altKey: true });
    expect(preview).not.toHaveBeenCalled();
    const record = vi.fn();
    keyboard.recorder.value = record;
    press(document.body, '1');
    expect(record).toHaveBeenCalledTimes(1);
    expect(preview).not.toHaveBeenCalled();
    expect(press(document.body, 'Tab').defaultPrevented).toBe(false);
    expect(keyboard.recorder.value).toBeNull();
    press(document.body, '1');
    expect(preview).toHaveBeenCalledTimes(1);
  });
  it('opens a preview without changing the page; Enter enters its module or selected item', async () => {
    const enter = vi.fn();
    keyboard.setPreviewEntry(enter);
    disposers.push(keyboard.register('module.goal.preview', () => keyboard.togglePreview('goal')));
    const { wrapper, open } = host(
      '<div><button data-original>Original</button><div v-if="keyboard.preview.value === \'goal\'" data-capsule-preview-content="goal" role="dialog"><div v-keyboard-list><button data-keyboard-item="goal-a" @click="open(\'goal-a\')">Goal</button></div></div></div>',
    );
    const original = wrapper.get('[data-original]').element;
    press(original, '1');
    await nextTick();
    press(original, 'Enter');
    expect(enter).toHaveBeenCalledTimes(1);
    press(original, 'j');
    press(document.activeElement!, 'Enter');
    expect(open).toHaveBeenCalledWith('goal-a');
    press(document.activeElement!, 'Escape');
    expect(keyboard.preview.value).toBeNull();
  });
  it('honors live overrides and stops listening when the eager host unmounts', () => {
    const preview = vi.fn();
    disposers.push(keyboard.register('module.goal.preview', preview));
    const { wrapper } = host('<div />');
    keyboard.applyKeymap({ version: 1, overrides: { 'module.goal.preview': ['G'] } });
    press(document.body, '1');
    press(document.body, 'g');
    expect(preview).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    press(document.body, 'g');
    expect(preview).toHaveBeenCalledTimes(1);
  });
  it('allows the focused day list inside its dialog, with no workspace command leakage', () => {
    const preview = vi.fn();
    disposers.push(keyboard.register('module.goal.preview', preview));
    const { wrapper, open } = host(
      '<div role="dialog"><div v-keyboard-list><button data-keyboard-item="event" @click="open()">Event</button></div></div>',
    );
    press(wrapper.get('[data-keyboard-list]').element, 'j');
    press(document.activeElement!, '1');
    expect(preview).not.toHaveBeenCalled();
    press(document.activeElement!, 'Enter');
    expect(open).toHaveBeenCalledTimes(1);
  });
  it('leaves open select listboxes in control of their typeahead keys', () => {
    const create = vi.fn();
    disposers.push(keyboard.register('conversation.new', create));
    const { wrapper } = host(
      '<div><div role="listbox"><div role="option" tabindex="0">Name</div></div></div>',
    );
    press(wrapper.get('[role="option"]').element, 'n');
    expect(create).not.toHaveBeenCalled();
    wrapper.get('[role="listbox"]').element.remove();
    press(document.body, 'n');
    expect(create).toHaveBeenCalledTimes(1);
  });
});
