import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/transport-contracts/result';
import { DESKTOP_STARTUP_SERVICE_KEY } from '@setting-ui-test-host/di/keys';
import enSetting from '@setting-ui-test-host/locales/en-US/setting';
import zhSetting from '@setting-ui-test-host/locales/zh-CN/setting';
import type { DesktopStartupSnapshot } from '@memoflow/desktop-contracts';
import DesktopStartupSettingsSection from './DesktopStartupSettingsSection.vue';

const initial = (): DesktopStartupSnapshot => ({
  autoLaunch: { available: true, enabled: false },
  closeToTray: true,
  startHidden: true,
});
function harness(locale = 'en-US') {
  let listener: (snapshot: DesktopStartupSnapshot) => void = () => {};
  const off = vi.fn();
  const service = {
    get: vi.fn(async () => ok(initial())),
    update: vi.fn(async () =>
      ok({
        success: true,
        snapshot: { ...initial(), autoLaunch: { available: true, enabled: true } },
      }),
    ),
    subscribe: vi.fn((fn: typeof listener) => {
      listener = fn;
      return off;
    }),
  };
  const wrapper = mount(DesktopStartupSettingsSection, {
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale,
          messages: { 'en-US': { setting: enSetting }, 'zh-CN': { setting: zhSetting } },
        }),
      ],
      provide: { [DESKTOP_STARTUP_SERVICE_KEY as symbol]: service },
      stubs: {
        Switch: defineComponent({
          props: ['modelValue', 'disabled'],
          emits: ['update:modelValue'],
          setup:
            (props, { emit, attrs }) =>
            () =>
              h('button', {
                ...attrs,
                disabled: props.disabled,
                'aria-checked': props.modelValue,
                onClick: () => emit('update:modelValue', !props.modelValue),
              }),
        }),
      },
    },
  });
  return { wrapper, service, off, emit: (value: DesktopStartupSnapshot) => listener(value) };
}

describe('DesktopStartupSettingsSection', () => {
  it.each(['en-US', 'zh-CN'])(
    'loads, toggles and localizes startup settings (%s)',
    async (locale) => {
      const h = harness(locale);
      await flushPromises();
      expect(h.wrapper.text()).not.toContain('setting.startup');
      expect(
        h.wrapper.get('[data-testid="startup-startHidden"]').attributes('disabled'),
      ).toBeDefined();
      await h.wrapper.get('[data-testid="startup-autoLaunch"]').trigger('click');
      await flushPromises();
      expect(h.service.update).toHaveBeenCalledWith({ autoLaunch: true });
      expect(h.wrapper.get('[data-testid="startup-autoLaunch"]').attributes('aria-checked')).toBe(
        'true',
      );
      h.emit({ ...initial(), closeToTray: false });
      await flushPromises();
      expect(h.wrapper.get('[data-testid="startup-closeToTray"]').attributes('aria-checked')).toBe(
        'false',
      );
      h.wrapper.unmount();
      expect(h.off).toHaveBeenCalledOnce();
    },
  );
  it('restores actual state and displays failure instead of claiming success', async () => {
    const h = harness();
    await flushPromises();
    h.service.update.mockResolvedValueOnce(ok({ success: false, snapshot: initial() }));
    await h.wrapper.get('[data-testid="startup-autoLaunch"]').trigger('click');
    await flushPromises();
    expect(h.wrapper.get('[data-testid="startup-error"]').text()).toContain('Could not save');
    expect(h.wrapper.get('[data-testid="startup-autoLaunch"]').attributes('aria-checked')).toBe(
      'false',
    );
    h.emit({ ...initial(), autoLaunch: { available: false, enabled: false } });
    await flushPromises();
    expect(
      h.wrapper.get('[data-testid="startup-autoLaunch"]').attributes('disabled'),
    ).toBeDefined();
    h.wrapper.unmount();
  });
  it('writes the window preferences and re-reads actual state on a transport failure', async () => {
    const h = harness();
    await flushPromises();
    h.emit({ ...initial(), autoLaunch: { available: true, enabled: true } });
    await flushPromises();
    await h.wrapper.get('[data-testid="startup-startHidden"]').trigger('click');
    await flushPromises();
    expect(h.service.update).toHaveBeenLastCalledWith({ startHidden: false });
    await h.wrapper.get('[data-testid="startup-closeToTray"]').trigger('click');
    await flushPromises();
    expect(h.service.update).toHaveBeenLastCalledWith({ closeToTray: false });
    h.service.update.mockRejectedValueOnce(new Error('IPC disconnected'));
    await h.wrapper.get('[data-testid="startup-autoLaunch"]').trigger('click');
    await flushPromises();
    expect(h.service.get).toHaveBeenCalledTimes(2);
    expect(h.wrapper.find('[data-testid="startup-error"]').exists()).toBe(true);
    expect(h.wrapper.get('[data-testid="startup-autoLaunch"]').attributes('aria-checked')).toBe(
      'false',
    );
    h.wrapper.unmount();
  });

  it('disables switches while a mutation is pending', async () => {
    const h = harness();
    await flushPromises();
    let resolve!: (value: Awaited<ReturnType<typeof h.service.update>>) => void;
    h.service.update.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await h.wrapper.get('[data-testid="startup-autoLaunch"]').trigger('click');
    expect(
      h.wrapper.get('[data-testid="startup-closeToTray"]').attributes('disabled'),
    ).toBeDefined();
    resolve(ok({ success: true, snapshot: initial() }));
    await flushPromises();
    expect(
      h.wrapper.get('[data-testid="startup-closeToTray"]').attributes('disabled'),
    ).toBeUndefined();
    h.wrapper.unmount();
  });
});
