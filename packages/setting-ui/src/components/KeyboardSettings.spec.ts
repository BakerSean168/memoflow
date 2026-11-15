import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keyboard } from '@setting-ui-test-host/shared/keyboard/runtime';
import { settingUiHost } from '../setting-ui-host';
import KeyboardSettings from './KeyboardSettings.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      setting: {
        keyboard: {
          title: '快捷键',
          description: '此设备 · 当前用户配置。',
          hints: '数字键预览，Enter 进入。',
          searchPlaceholder: '搜索命令或快捷键…',
          searchAria: '搜索快捷键',
          import: '导入',
          export: '导出',
          restoreDefaults: '恢复默认',
          importAria: '导入快捷键配置',
          storageFallback: '{error}；当前使用默认键位。',
          recordAria: '录制：{title}',
          unbound: '未绑定',
          disableAria: '禁用：{title}',
          enableAria: '启用：{title}',
          disable: '禁用',
          enable: '启用',
          resetAria: '重置：{title}',
          reset: '重置',
          empty: '没有匹配的快捷键',
          notes: '快捷键说明。',
          listSeparator: '、',
          invalidKeymap: '无效配置',
          saved: '已保存到此设备，即时生效',
          saveFailed: '保存失败',
          fileTooLarge: '配置文件不能超过 64 KB',
          importConflicts: '导入配置存在冲突：{chords}',
          importFailed: '导入失败',
          scopes: { app: '应用', workspace: '工作区', preview: '预览', list: '列表' },
          recorder: {
            title: '录制快捷键',
            description: '按下新的按键组合。',
            waiting: '等待按键…',
            idle: '按 Esc 返回后重新录制',
            conflict: '与 {titles} 冲突。可替换其绑定，或录制其他按键。',
            cancel: '取消',
            replace: '替换冲突绑定',
            save: '保存',
          },
          restoreConfirm: {
            title: '恢复默认快捷键',
            description: '清除此设备当前用户的所有自定义键位？',
            confirm: '恢复默认',
            cancel: '取消',
          },
          importConfirm: {
            title: '导入快捷键',
            description: '将替换此设备的自定义配置（{count} 条覆盖）。',
            confirm: '导入',
            cancel: '取消',
          },
        },
      },
    },
  },
});
const mountOptions = { global: { plugins: [i18n] }, attachTo: document.body };

// The device-keymap persistence seam is host-owned after the setting-ui
// extraction, so the spec spies on the bound host member instead of mocking
// the retired app-vue module path. Persistence behaviour under test is unchanged.
vi.spyOn(settingUiHost, 'saveDeviceKeymap').mockImplementation(async (value: unknown) => {
  keyboard.applyKeymap(value);
});
afterEach(() => {
  keyboard.applyKeymap({ version: 1, overrides: {} });
  keyboard.recorder.value = null;
  document.body.innerHTML = '';
});
describe('shortcut settings', () => {
  it('records, reports conflicts, explicitly replaces and updates all effective bindings', async () => {
    const wrapper = mount(KeyboardSettings, mountOptions);
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
    const wrapper = mount(KeyboardSettings, mountOptions);
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
