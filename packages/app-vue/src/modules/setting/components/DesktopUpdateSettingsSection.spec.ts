import { defineComponent, h, nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type {
  DesktopUpdateDiagnosticsDTO,
  DesktopUpdateSnapshotDTO,
} from '@memoflow/contracts/electron';
import { DESKTOP_UPDATE_SERVICE_KEY } from '../../../di/keys';
import type { DesktopUpdateService } from '../../../di/types';
import enSetting from '../../../locales/en-US/setting';
import DesktopUpdateSettingsSection from './DesktopUpdateSettingsSection.vue';

function snapshot(
  state: DesktopUpdateSnapshotDTO['state'] = {
    type: 'idle',
    currentVersion: '1.2.0',
    lastCheckedAt: null,
    lastOutcome: null,
  },
): DesktopUpdateSnapshotDTO {
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

function createHarness(initial = snapshot()) {
  const listeners = new Set<(value: DesktopUpdateSnapshotDTO) => void>();
  const unsubscribe = vi.fn((listener: (value: DesktopUpdateSnapshotDTO) => void) => {
    listeners.delete(listener);
  });

  const diagnostics: DesktopUpdateDiagnosticsDTO = {
    currentVersion: initial.currentVersion,
    targetVersion: null,
    owner: initial.owner,
    capabilities: initial.capabilities,
    feedClass: 'github',
    state: initial.state.type,
    lastCheckedAt: null,
    lastCheckResult: null,
    failure: null,
    installReceipt: { status: 'none', requestedAt: null },
  };
  const getDiagnostics = vi.fn(async () => ok(diagnostics));
  const getSnapshot = vi.fn(async () => ok(initial));
  const check = vi.fn(async () =>
    ok(
      snapshot({
        type: 'idle',
        currentVersion: '1.2.0',
        lastCheckedAt: '2026-09-30T12:00:00.000Z',
        lastOutcome: 'up-to-date',
      }),
    ),
  );
  const restartAndInstall = vi.fn(async () =>
    ok(
      snapshot({
        type: 'restarting',
        release: {
          version: '1.3.0',
          channel: 'stable',
          publishedAt: null,
          releaseNotes: null,
          releaseNotesUrl: null,
        },
      }),
    ),
  );

  const service: DesktopUpdateService = {
    getSnapshot,
    getDiagnostics,
    check,
    restartAndInstall,
    subscribe(listener) {
      listeners.add(listener);
      return () => unsubscribe(listener);
    },
  };

  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        setting: enSetting,
      },
    },
  });

  const wrapper = mount(DesktopUpdateSettingsSection, {
    global: {
      plugins: [i18n],
      provide: {
        [DESKTOP_UPDATE_SERVICE_KEY as symbol]: service,
      },
      stubs: {
        Card: defineComponent({
          setup(_, { slots }) {
            return () => h('div', slots.default?.());
          },
        }),
        CardHeader: defineComponent({
          setup(_, { slots }) {
            return () => h('div', slots.default?.());
          },
        }),
        CardTitle: defineComponent({
          setup(_, { slots }) {
            return () => h('h3', slots.default?.());
          },
        }),
        CardDescription: defineComponent({
          setup(_, { slots }) {
            return () => h('p', slots.default?.());
          },
        }),
        CardContent: defineComponent({
          setup(_, { slots }) {
            return () => h('div', slots.default?.());
          },
        }),
        Badge: defineComponent({
          setup(_, { slots }) {
            return () => h('span', slots.default?.());
          },
        }),
        Button: defineComponent({
          inheritAttrs: false,
          props: {
            disabled: { type: Boolean, default: false },
          },
          emits: ['click'],
          setup(props, { attrs, emit, slots }) {
            return () =>
              h(
                'button',
                {
                  ...attrs,
                  disabled: props.disabled,
                  onClick: () => emit('click'),
                },
                slots.default?.(),
              );
          },
        }),
        Progress: defineComponent({
          props: {
            modelValue: { type: Number, default: 0 },
          },
          setup(props, { attrs }) {
            return () =>
              h('div', {
                ...attrs,
                'data-progress': String(props.modelValue),
              });
          },
        }),
      },
    },
  });

  return {
    wrapper,
    service,
    getSnapshot,
    getDiagnostics,
    check,
    restartAndInstall,
    unsubscribe,
    emit(next: DesktopUpdateSnapshotDTO) {
      for (const listener of listeners) listener(next);
    },
  };
}

describe('DesktopUpdateSettingsSection', () => {
  it('shows safe diagnostics and bounded failure without URLs, paths or messages', async () => {
    const harness = createHarness();
    await flushPromises();
    const card = () => harness.wrapper.get('[data-testid="desktop-update-troubleshooting"]');
    expect(card().text()).toContain('1.2.0');
    expect(card().text()).toContain('github');
    expect(card().text()).toContain('—');
    expect(card().text()).toContain('none');
    const result = await harness.getDiagnostics();
    harness.getDiagnostics.mockResolvedValue(
      ok({
        ...result.data,
        targetVersion: '1.3.0',
        state: 'failed',
        lastCheckedAt: '2026-10-01T12:00:00.000Z',
        lastCheckResult: 'failed',
        failure: {
          operation: 'check',
          code: 'feed-unavailable',
          retryable: true,
          recoverableTo: 'idle',
        },
        installReceipt: { status: 'restart-requested', requestedAt: '2026-10-01T12:00:00.000Z' },
      }),
    );
    await harness.wrapper.get('[data-testid="desktop-update-primary-action"]').trigger('click');
    await flushPromises();
    expect(card().text()).toContain('1.3.0');
    expect(card().text()).toContain('2026-10-01T12:00:00.000Z');
    expect(card().text()).toContain('restart-requested');
    expect(
      harness.wrapper.get('[data-testid="desktop-update-diagnostics-failure"]').text(),
    ).toContain('check · feed-unavailable');
    expect(card().text()).not.toMatch(/https?:|file:|\/private|token=|release notes/i);
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the canonical snapshot and reports explicit up-to-date feedback', async () => {
    const harness = createHarness();
    await flushPromises();

    expect(harness.getSnapshot).toHaveBeenCalledTimes(1);
    expect(
      harness.wrapper.get('[data-testid="desktop-update-status"]').attributes('data-state'),
    ).toBe('idle');

    await harness.wrapper.get('[data-testid="desktop-update-primary-action"]').trigger('click');
    await flushPromises();

    expect(harness.check).toHaveBeenCalledTimes(1);
    expect(harness.getDiagnostics).toHaveBeenCalledTimes(2);
    expect(
      harness.wrapper.get('[data-testid="desktop-update-status"]').attributes('data-state'),
    ).toBe('up-to-date');
  });

  it('uses the sole restart-and-install action when Ready', async () => {
    const harness = createHarness(
      snapshot({
        type: 'ready',
        intent: 'background',
        release: {
          version: '1.3.0',
          channel: 'stable',
          publishedAt: null,
          releaseNotes: 'Release notes',
          releaseNotesUrl: null,
        },
      }),
    );
    await flushPromises();

    expect(
      harness.wrapper.get('[data-testid="desktop-update-status"]').attributes('data-state'),
    ).toBe('ready');
    await harness.wrapper.get('[data-testid="desktop-update-primary-action"]').trigger('click');
    await flushPromises();

    expect(harness.restartAndInstall).toHaveBeenCalledTimes(1);
    expect(harness.getDiagnostics).toHaveBeenCalledTimes(2);
    expect(
      harness.wrapper.get('[data-testid="desktop-update-status"]').attributes('data-state'),
    ).toBe('restarting');
  });

  it('reacts to validated push snapshots without polling', async () => {
    const harness = createHarness();
    await flushPromises();

    harness.emit(
      snapshot({
        type: 'downloading',
        intent: 'background',
        release: {
          version: '1.3.0',
          channel: 'stable',
          publishedAt: null,
          releaseNotes: null,
          releaseNotesUrl: null,
        },
        progress: {
          percent: 63,
          transferredBytes: 630,
          totalBytes: 1000,
          bytesPerSecond: 100,
        },
      }),
    );
    await nextTick();

    expect(
      harness.wrapper.get('[data-testid="desktop-update-status"]').attributes('data-state'),
    ).toBe('downloading');
    expect(
      harness.wrapper.get('[data-testid="desktop-update-progress"]').attributes('data-progress'),
    ).toBe('63');
    expect(harness.getDiagnostics).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes from the Desktop state stream on unmount', async () => {
    const harness = createHarness();
    await flushPromises();

    harness.wrapper.unmount();

    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
