import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KeyboardHelp from './KeyboardHelp.vue';
import { keyboard } from '../keyboard/runtime';
import { displayChord } from '../keyboard/keymap';

enableAutoUnmount((unmount) => {
  afterEach(async () => {
    unmount();
    await flushPromises();
    document.body.replaceChildren();
  });
});
afterEach(async () => {
  keyboard.helpOpen.value = false;
  keyboard.applyKeymap({ version: 1, overrides: {} });
  await flushPromises();
});

describe('KeyboardHelp', () => {
  it('shows effective bindings, updates live, and excludes unbound commands', async () => {
    mount(KeyboardHelp, { attachTo: document.body });
    expect(document.querySelector('[data-testid="keyboard-help"]')).toBeNull();
    keyboard.helpOpen.value = true;
    await flushPromises();
    const row = () =>
      [...document.querySelectorAll('dl > div')].find((element) =>
        element.querySelector('dt')?.textContent?.includes('进入目标'),
      );
    expect(row()?.querySelector('dd')?.textContent).toContain('Alt+1');
    keyboard.applyKeymap({ version: 1, overrides: { 'module.goal.activate': ['Alt+G'] } });
    await flushPromises();
    expect(row()?.querySelector('dd')?.textContent).toContain(
      displayChord('Alt+G', keyboard.engine.host),
    );
    keyboard.applyKeymap({ version: 1, overrides: {}, disabled: ['module.goal.activate'] });
    await flushPromises();
    expect(row()).toBeUndefined();
  });

  it('closes with Escape and routes customization to the registered settings action', async () => {
    const customize = vi.fn();
    const dispose = keyboard.register('app.shortcuts', customize);
    const wrapper = mount(KeyboardHelp, { attachTo: document.body });
    try {
      keyboard.helpOpen.value = true;
      await flushPromises();
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
      dialog.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      );
      await flushPromises();
      expect(keyboard.helpOpen.value).toBe(false);
      keyboard.helpOpen.value = true;
      await flushPromises();
      const button = [...document.querySelectorAll('button')].find((element) =>
        element.textContent?.includes('自定义快捷键'),
      )!;
      button.click();
      await flushPromises();
      expect(keyboard.helpOpen.value).toBe(false);
      expect(customize).toHaveBeenCalledTimes(1);
    } finally {
      wrapper.unmount();
      dispose();
    }
  });
});
