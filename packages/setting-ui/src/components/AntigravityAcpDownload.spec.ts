import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { SystemChannels } from '@memoflow/desktop-contracts';
import { DESKTOP_BRIDGE_KEY } from '@setting-ui-test-host/di/keys';
import enSetting from '@setting-ui-test-host/locales/en-US/setting';
import AntigravityAcpDownload from './AntigravityAcpDownload.vue';

const WINDOWS_DOWNLOAD =
  'https://dl.google.com/agy-extensions/releases/windows/agy-acp-server-1.4.0-windows-x86_64.zip';
const REGISTRY =
  'https://github.com/agentclientprotocol/registry/blob/main/antigravity-acp/agent.json';

afterEach(() => vi.unstubAllGlobals());

function render(
  options: {
    windows?: boolean;
    disabled?: boolean;
    invoke?: ReturnType<typeof vi.fn>;
    bridge?: boolean;
  } = {},
) {
  vi.stubGlobal('navigator', { userAgent: options.windows ? 'Windows NT 10.0' : 'Macintosh' });
  const invoke = options.invoke ?? vi.fn(async () => ({ ok: true, data: { opened: true } }));
  const wrapper = mount(AntigravityAcpDownload, {
    props: { disabled: options.disabled ?? false },
    global: {
      plugins: [
        createI18n({ legacy: false, locale: 'en', messages: { en: { setting: enSetting } } }),
      ],
      provide: options.bridge === false ? {} : { [DESKTOP_BRIDGE_KEY as symbol]: { invoke } },
    },
  });
  return { wrapper, invoke };
}

describe('official Antigravity ACP download entry', () => {
  it('opens the pinned Google Windows x64 archive only after an explicit click', async () => {
    const { wrapper, invoke } = render({ windows: true });
    expect(wrapper.find('[data-testid="ai-agy-acp-download"]').exists()).toBe(true);
    expect(invoke).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="ai-agy-download-windows"]').trigger('click');
    expect(invoke).toHaveBeenCalledWith(SystemChannels.OPEN_EXTERNAL_URL, {
      url: WINDOWS_DOWNLOAD,
    });
    await wrapper.get('[data-testid="ai-agy-download-registry"]').trigger('click');
    expect(invoke).toHaveBeenLastCalledWith(SystemChannels.OPEN_EXTERNAL_URL, { url: REGISTRY });
    wrapper.unmount();
  });

  it('does not suggest Windows x64 on other platforms and blocks disabled setup', async () => {
    const other = render();
    expect(other.wrapper.find('[data-testid="ai-agy-download-windows"]').exists()).toBe(false);
    await other.wrapper.get('[data-testid="ai-agy-download-registry"]').trigger('click');
    expect(other.invoke).toHaveBeenCalledWith(SystemChannels.OPEN_EXTERNAL_URL, {
      url: REGISTRY,
    });
    other.wrapper.unmount();
    const disabled = render({ windows: true, disabled: true });
    await disabled.wrapper.get('[data-testid="ai-agy-download-windows"]').trigger('click');
    expect(disabled.invoke).not.toHaveBeenCalled();
    disabled.wrapper.unmount();
  });

  it('requires the Desktop bridge and reports an external-browser failure', async () => {
    const web = render({ windows: true, bridge: false });
    expect(web.wrapper.find('[data-testid="ai-agy-acp-download"]').exists()).toBe(false);
    web.wrapper.unmount();
    const failed = render({ windows: true, invoke: vi.fn(async () => ({ ok: false })) });
    await failed.wrapper.get('[data-testid="ai-agy-download-windows"]').trigger('click');
    await failed.wrapper.vm.$nextTick();
    expect(failed.wrapper.get('[data-testid="ai-agy-download-error"]').text()).toContain(
      'Could not open',
    );
    failed.wrapper.unmount();
  });
});
