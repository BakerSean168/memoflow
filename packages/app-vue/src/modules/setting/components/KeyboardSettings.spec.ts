import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keyboard } from '../../../shared/keyboard/runtime';
import KeyboardSettings from './KeyboardSettings.vue';

vi.mock('../../../shared/keyboard/device-keymap', () => ({
  saveDeviceKeymap: vi.fn(async (value: unknown) => {
    keyboard.applyKeymap(value);
  }),
}));
afterEach(() => {
  keyboard.applyKeymap({ version: 1, overrides: {} });
  keyboard.recorder.value = null;
  document.body.innerHTML = '';
});
describe('shortcut settings', () => {
  it('records, reports conflicts, explicitly replaces and updates all effective bindings', async () => {
    const wrapper = mount(KeyboardSettings, { attachTo: document.body });
    await wrapper.get('[aria-label="录制：进入目标"]').trigger('click');
    keyboard.recorder.value?.(new KeyboardEvent('keydown', { key: '2', altKey: true }));
    await flushPromises();
    expect(document.body.textContent).toContain('进入任务');
    expect(document.body.textContent).toContain('冲突');
    const replace = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '替换冲突绑定',
    )!;
    replace.click();
    await flushPromises();
    expect(keyboard.engine.bindings('module.goal.activate')).toEqual(['Alt+2']);
    expect(keyboard.engine.bindings('module.task.activate')).toEqual([]);
    expect(keyboard.recorder.value).toBeNull();
    wrapper.unmount();
  });
  it('does not save reserved browser keys and cancels recording on unmount', async () => {
    const wrapper = mount(KeyboardSettings, { attachTo: document.body });
    await wrapper.get('[aria-label="录制：进入目标"]').trigger('click');
    keyboard.recorder.value?.(new KeyboardEvent('keydown', { key: '1', ctrlKey: true }));
    await flushPromises();
    expect(document.body.textContent).toContain('浏览器保留');
    expect(
      [...document.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === '保存',
      )?.disabled,
    ).toBe(true);
    wrapper.unmount();
    expect(keyboard.recorder.value).toBeNull();
  });
});
