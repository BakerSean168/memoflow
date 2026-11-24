import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { ok } from '@memoflow/transport-contracts/result';
import type {
  DesktopUpdateDiagnosticsDTO,
  DesktopUpdateReleaseDTO,
  DesktopUpdateSnapshotDTO,
} from '@memoflow/desktop-contracts';
import { settingUiHost } from '../setting-ui-host';
import DesktopUpdateSettingsSection from './DesktopUpdateSettingsSection.vue';

const current = {
  version: '1.4.2',
  channel: 'stable' as const,
  publishedAt: '2026-11-20T10:00:00.000Z',
  releaseNotes: '## What changed\n\n- Faster local search\n- Fixed a scheduling edge case',
  releaseNotesUrl: 'https://example.invalid/releases/1.5.0',
};

const capabilities = {
  canCheck: true,
  canBackgroundCheck: true,
  canDownload: true,
  canSelfInstall: true,
  canAutoDownload: true,
  installAuthority: 'memoflow' as const,
};

function release(overrides: Partial<DesktopUpdateReleaseDTO> = {}): DesktopUpdateReleaseDTO {
  return { ...current, ...overrides };
}

function snapshot(
  state: DesktopUpdateSnapshotDTO['state'],
  version = '1.4.2',
): DesktopUpdateSnapshotDTO {
  return {
    state,
    currentVersion: version,
    channel: 'stable',
    owner: 'memoflow-direct',
    capabilities,
  };
}

function diagnostics(
  state: DesktopUpdateDiagnosticsDTO['state'],
  overrides: Partial<DesktopUpdateDiagnosticsDTO> = {},
): DesktopUpdateDiagnosticsDTO {
  return {
    currentVersion: '1.4.2',
    targetVersion: null,
    owner: 'memoflow-direct',
    capabilities,
    feedClass: 'github',
    lastCheckedAt: null,
    lastCheckResult: null,
    state,
    failure: null,
    installReceipt: { status: 'none', requestedAt: null },
    ...overrides,
  };
}

function renderSection(
  initial: DesktopUpdateSnapshotDTO,
  detail: DesktopUpdateDiagnosticsDTO,
) {
  return {
    components: { DesktopUpdateSettingsSection },
    setup() {
      const listeners = new Set<(value: DesktopUpdateSnapshotDTO) => void>();
      provide(
        settingUiHost.DESKTOP_UPDATE_SERVICE_KEY as symbol,
        {
          getSnapshot: async () => ok(initial),
          getDiagnostics: async () => ok(detail),
          check: async () => ok(initial),
          restartAndInstall: async () => ok(initial),
          subscribe: (listener: (value: DesktopUpdateSnapshotDTO) => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        } as never,
      );
      return {};
    },
    template: '<div style="max-width: 900px"><DesktopUpdateSettingsSection /></div>',
  };
}

const meta = {
  title: 'Business/Setting/DesktopUpdateSettingsSection',
  component: DesktopUpdateSettingsSection,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof DesktopUpdateSettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Updater idle and ready to check, with the troubleshooting summary below. */
export const ReadyToCheck: Story = {
  render: () =>
    renderSection(
      snapshot({
        type: 'idle',
        currentVersion: '1.4.2',
        lastCheckedAt: null,
        lastOutcome: null,
      }),
      diagnostics('idle'),
    ),
};

/** Update downloading with progress, release notes and the copyable diagnostics. */
export const Downloading: Story = {
  render: () =>
    renderSection(
      snapshot({
        type: 'downloading',
        intent: 'background',
        release: release(),
        progress: {
          percent: 42,
          transferredBytes: 44_040_192,
          totalBytes: 104_857_600,
          bytesPerSecond: 2_097_152,
        },
      }),
      diagnostics('downloading', {
        targetVersion: '1.5.0',
        lastCheckedAt: '2026-11-24T09:00:00.000Z',
        lastCheckResult: 'update-available',
      }),
    ),
};

/** Download finished: the restart action is the primary, pending step. */
export const ReadyToRestart: Story = {
  render: () =>
    renderSection(
      snapshot({
        type: 'ready',
        intent: 'explicit',
        release: release({ version: '1.5.0' }),
      }),
      diagnostics('ready', {
        targetVersion: '1.5.0',
        lastCheckedAt: '2026-11-24T09:00:00.000Z',
        lastCheckResult: 'update-available',
        installReceipt: { status: 'restart-requested', requestedAt: null },
      }),
    ),
};

/** A failed install keeps the failure message and support diagnostics visible. */
export const InstallFailed: Story = {
  render: () =>
    renderSection(
      snapshot({
        type: 'failed',
        operation: 'install',
        failure: {
          code: 'signature-invalid',
          message: 'The downloaded package could not be verified.',
          retryable: true,
        },
        recoverableTo: 'available',
        release: release({ version: '1.5.0' }),
      }),
      diagnostics('failed', {
        targetVersion: '1.5.0',
        lastCheckedAt: '2026-11-24T09:00:00.000Z',
        lastCheckResult: 'update-available',
        failure: {
          operation: 'install',
          code: 'signature-invalid',
          retryable: true,
          recoverableTo: 'available',
        },
      }),
    ),
};

/** Updates are disabled for this installation: no action, only the explanation. */
export const Disabled: Story = {
  render: () =>
    renderSection(
      snapshot({ type: 'disabled', reason: 'managed-externally' }),
      diagnostics('disabled'),
    ),
};
