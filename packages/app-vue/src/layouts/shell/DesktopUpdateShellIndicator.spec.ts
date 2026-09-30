/** @vitest-environment happy-dom */

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fail, ok, ResultCode } from '@memoflow/contracts/result';
import type { DesktopUpdateSnapshotDTO } from '@memoflow/contracts/electron';
import { DESKTOP_UPDATE_SERVICE_KEY } from '../../di/keys';
import type { DesktopUpdateService } from '../../di/types';
import DesktopUpdateShellIndicator from './DesktopUpdateShellIndicator.vue';
import enShell from '../../locales/en-US/shell';
import zhShell from '../../locales/zh-CN/shell';

enableAutoUnmount(afterEach);

function snapshot(state: DesktopUpdateSnapshotDTO['state']): DesktopUpdateSnapshotDTO {
  return {
    state,
    currentVersion: '1.2.0',
    channel: 'stable',
    owner: 'memoflow-direct',
    capabilities: {
      canCheck: true,
      canBackgroundCheck: true,
      canDownload: true,
      canSelfInstall: true,
      canAutoDownload: true,
      installAuthority: 'memoflow',
    },
  };
}

const release = {
  version: '1.3.0',
  channel: 'stable' as const,
  publishedAt: null,
  releaseNotes: null,
  releaseNotesUrl: null,
};

const readySnapshot = snapshot({
  type: 'ready',
  intent: 'background',
  release,
});

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': { shell: enShell },
    'zh-CN': { shell: zhShell },
  },
});

function createService(initial: DesktopUpdateSnapshotDTO) {
  const listeners = new Set<(snapshot: DesktopUpdateSnapshotDTO) => void>();
  const unsubscribe = vi.fn((listener: (snapshot: DesktopUpdateSnapshotDTO) => void) => {
    listeners.delete(listener);
  });

  const service: DesktopUpdateService = {
    getSnapshot: vi.fn(async () => ok(initial)),
    check: vi.fn(async () => ok(initial)),
    restartAndInstall: vi.fn(async () => ok(initial)),
    subscribe(listener) {
      listeners.add(listener);
      return () => unsubscribe(listener);
    },
  };

  return {
    service,
    unsubscribe,
    listeners,
    emit(next: DesktopUpdateSnapshotDTO) {
      for (const listener of listeners) listener(next);
    },
  };
}

describe('DesktopUpdateShellIndicator', () => {
  it('renders nothing when the host does not provide Desktop Update capability', async () => {
    const wrapper = mount(DesktopUpdateShellIndicator, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="desktop-update-shell-indicator"]').exists()).toBe(false);
  });

  it('surfaces Ready from the canonical snapshot and opens update settings on click', async () => {
    const harness = createService(readySnapshot);
    const wrapper = mount(DesktopUpdateShellIndicator, {
      global: {
        plugins: [i18n],
        provide: {
          [DESKTOP_UPDATE_SERVICE_KEY as symbol]: harness.service,
        },
      },
    });
    await flushPromises();

    const indicator = wrapper.get('[data-testid="desktop-update-shell-indicator"]');
    expect(indicator.attributes('data-state')).toBe('ready');
    expect(indicator.text()).toContain('1.3.0');

    await indicator.trigger('click');
    expect(wrapper.emitted('open-updates')).toHaveLength(1);
    expect(harness.service.check).not.toHaveBeenCalled();
    expect(harness.service.restartAndInstall).not.toHaveBeenCalled();
  });

  it('stays silent during background work and appears when a push reaches Ready', async () => {
    const harness = createService(
      snapshot({
        type: 'downloading',
        intent: 'background',
        release,
        progress: {
          percent: 50,
          transferredBytes: 500,
          totalBytes: 1000,
          bytesPerSecond: 100,
        },
      }),
    );
    const wrapper = mount(DesktopUpdateShellIndicator, {
      global: {
        plugins: [i18n],
        provide: {
          [DESKTOP_UPDATE_SERVICE_KEY as symbol]: harness.service,
        },
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="desktop-update-shell-indicator"]').exists()).toBe(false);

    harness.emit(readySnapshot);
    await flushPromises();

    expect(
      wrapper.get('[data-testid="desktop-update-shell-indicator"]').attributes('data-state'),
    ).toBe('ready');
  });

  it('surfaces recoverable install failure and releases the subscription on unmount', async () => {
    const harness = createService(
      snapshot({
        type: 'failed',
        operation: 'install',
        failure: {
          code: 'install-handoff-failed',
          message: 'Installer handoff failed.',
          retryable: true,
        },
        recoverableTo: 'ready',
        release,
      }),
    );
    const wrapper = mount(DesktopUpdateShellIndicator, {
      global: {
        plugins: [i18n],
        provide: {
          [DESKTOP_UPDATE_SERVICE_KEY as symbol]: harness.service,
        },
      },
    });
    await flushPromises();

    expect(
      wrapper.get('[data-testid="desktop-update-shell-indicator"]').attributes('data-state'),
    ).toBe('attention');

    await wrapper.get('[data-testid="desktop-update-shell-indicator"]').trigger('click');
    expect(wrapper.emitted('open-updates')).toHaveLength(1);
    expect(harness.service.restartAndInstall).not.toHaveBeenCalled();

    wrapper.unmount();
    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
    expect(harness.listeners.size).toBe(0);
  });

  it('keeps a newer pushed Ready snapshot when the initial read resolves late', async () => {
    const initial = snapshot({ type: 'preparing', intent: 'background', release });
    const harness = createService(initial);
    let resolveRead!: (result: Awaited<ReturnType<DesktopUpdateService['getSnapshot']>>) => void;
    vi.mocked(harness.service.getSnapshot).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    );
    const wrapper = mount(DesktopUpdateShellIndicator, {
      global: {
        plugins: [i18n],
        provide: { [DESKTOP_UPDATE_SERVICE_KEY as symbol]: harness.service },
      },
    });

    harness.emit(readySnapshot);
    await flushPromises();
    resolveRead(ok(initial));
    await flushPromises();

    expect(
      wrapper.get('[data-testid="desktop-update-shell-indicator"]').attributes('data-state'),
    ).toBe('ready');

    harness.emit(initial);
    await flushPromises();
    expect(wrapper.find('[data-testid="desktop-update-shell-indicator"]').exists()).toBe(false);
  });

  it('releases a pending subscription and mounts again with exactly one listener', async () => {
    const harness = createService(readySnapshot);
    let resolveRead!: (result: Awaited<ReturnType<DesktopUpdateService['getSnapshot']>>) => void;
    vi.mocked(harness.service.getSnapshot).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    );
    const options = {
      global: {
        plugins: [i18n],
        provide: { [DESKTOP_UPDATE_SERVICE_KEY as symbol]: harness.service },
      },
    };
    const wrapper = mount(DesktopUpdateShellIndicator, options);
    expect(harness.listeners.size).toBe(1);
    wrapper.unmount();
    expect(harness.listeners.size).toBe(0);
    resolveRead(ok(readySnapshot));
    await flushPromises();
    expect(wrapper.find('[data-testid="desktop-update-shell-indicator"]').exists()).toBe(false);

    const remounted = mount(DesktopUpdateShellIndicator, options);
    await flushPromises();
    expect(harness.listeners.size).toBe(1);
    expect(remounted.get('[data-testid="desktop-update-shell-indicator"]').exists()).toBe(true);
    remounted.unmount();
    expect(harness.listeners.size).toBe(0);
    expect(harness.unsubscribe).toHaveBeenCalledTimes(2);
  });

  it('stays silent after a failed read and still accepts later pushes', async () => {
    const harness = createService(readySnapshot);
    vi.mocked(harness.service.getSnapshot).mockResolvedValueOnce(
      fail({ code: ResultCode.INTERNAL_ERROR, message: 'Snapshot unavailable' }),
    );
    const wrapper = mount(DesktopUpdateShellIndicator, {
      global: {
        plugins: [i18n],
        provide: { [DESKTOP_UPDATE_SERVICE_KEY as symbol]: harness.service },
      },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="desktop-update-shell-indicator"]').exists()).toBe(false);

    harness.emit(readySnapshot);
    await flushPromises();
    expect(wrapper.get('[data-testid="desktop-update-shell-indicator"]').exists()).toBe(true);
  });

  it('keeps all shell update locale keys symmetric and translated', () => {
    expect(Object.keys(enShell.update).sort()).toEqual(Object.keys(zhShell.update).sort());
    for (const messages of [enShell.update, zhShell.update]) {
      expect(messages.ready).toContain('{version}');
      expect(messages.attention).not.toBe('');
      expect(messages.openSettings).not.toBe('');
    }
  });
});
