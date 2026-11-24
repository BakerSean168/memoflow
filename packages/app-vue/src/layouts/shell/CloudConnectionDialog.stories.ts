import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide, ref } from 'vue';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type {
  CloudAuthDesktopClientPort,
  DesktopCloudConnectionAttempt,
} from '@memoflow/cloud-auth-contracts';
import { ok, type Result } from '@memoflow/transport-contracts/result';
import type { ElectronBridge } from '@memoflow/ipc-client';
import { DESKTOP_BRIDGE_KEY, DESKTOP_CLOUD_AUTH_SERVICE_KEY } from '../../di/keys';
import CloudConnectionDialog from './CloudConnectionDialog.vue';

const originProfileId = 'profile-local-1';

function attempt(
  overrides: Partial<DesktopCloudConnectionAttempt> = {},
): DesktopCloudConnectionAttempt {
  return {
    attemptId: 'attempt-story-1',
    originProfileId,
    result: null,
    userCode: 'WXYZ-4821',
    verificationUrl: 'https://app.memo.test/auth/device?user_code=WXYZ-4821',
    expiresAt: '2030-01-01T00:00:00.000Z',
    status: 'awaiting_authorization',
    error: null,
    ...overrides,
  };
}

const connectedAttempt = attempt({
  status: 'connected',
  userCode: '',
  result: { targetProfileId: originProfileId, activation: 'active' },
});

interface DialogDoubleOptions {
  /** Attempt restored when the dialog opens; `connected` restores as ready by design. */
  current?: DesktopCloudConnectionAttempt | null;
  /** What "Continue in browser" returns; defaults to a pending device attempt. */
  begin?: DesktopCloudConnectionAttempt;
  /** What the first status poll returns; a pending promise keeps "connecting" stable. */
  poll?: () => Promise<Result<DesktopCloudConnectionAttempt>>;
}

/**
 * Service double: it records the device-flow shape but never reaches an auth
 * server. `getSession` stays empty so a completed attempt only updates the UI.
 */
function createService(options: DialogDoubleOptions = {}): CloudAuthDesktopClientPort {
  return {
    beginCloudConnection: async () => ok(options.begin ?? attempt()),
    getCurrentCloudConnection: async () => ok(options.current ?? null),
    getCloudConnectionStatus: async () =>
      options.poll ? options.poll() : ok(options.current ?? attempt()),
    cancelCloudConnection: async () => ok(undefined),
    getSession: async () => ok({ account: null, session: null }),
    signOut: async () => ok(undefined),
  };
}

function createBridge(): ElectronBridge {
  return {
    invoke: async () => ok(undefined),
  } as unknown as ElectronBridge;
}

function renderDialog(options: DialogDoubleOptions = {}) {
  return {
    components: { CloudConnectionDialog },
    setup() {
      const open = ref(true);
      provide(DESKTOP_CLOUD_AUTH_SERVICE_KEY as symbol, createService(options));
      provide(DESKTOP_BRIDGE_KEY as symbol, createBridge());
      return { open, intent: 'add_account' as const };
    },
    template: `
      <div class="flex min-h-[34rem] items-start justify-center bg-background p-6">
        <CloudConnectionDialog v-model:open="open" profile-name="Guest 4827" :intent="intent" />
      </div>
    `,
  };
}

const meta = {
  title: 'Business/AppVue/CloudConnectionDialog',
  component: CloudConnectionDialog,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { open: true, profileName: 'Guest 4827' },
  render: () => renderDialog(),
} satisfies Meta<typeof CloudConnectionDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing in flight: the dialog explains browser continuation and offers Continue. */
export const Ready: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByTestId('cloud-connection-dialog');
    await waitFor(() =>
      expect(page.getByTestId('cloud-connection-status')).toHaveTextContent('Ready to connect'),
    );
    await expect(page.getByTestId('cloud-connection-continue')).toBeEnabled();
  },
};

/** Waiting for browser confirmation keeps the device code and cancel actions visible. */
export const Connecting: Story = {
  render: () =>
    renderDialog({
      current: attempt(),
      // The dialog polls every 1.2s; the double stays pending so the state is stable.
      poll: () => new Promise<Result<DesktopCloudConnectionAttempt>>(() => undefined),
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByTestId('cloud-connection-pending');
    await expect(page.getByTestId('cloud-connection-status')).toHaveTextContent(
      'Waiting for browser confirmation',
    );
    await expect(page.getByTestId('cloud-connection-pending')).toHaveTextContent('WXYZ-4821');
    await expect(page.getByTestId('cloud-connection-cancel')).toBeVisible();
  },
};

/** A failed or denied attempt reports the reason and switches the footer to Retry. */
export const Failed: Story = {
  render: () =>
    renderDialog({
      current: attempt({
        status: 'failed',
        userCode: '',
        error: { code: 'network', message: 'The authorization server did not answer.' },
      }),
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const status = await page.findByTestId('cloud-connection-status');
    await expect(status).toHaveTextContent('Connection failed');
    await expect(page.getByRole('alert')).toHaveTextContent(
      'The authorization server did not answer.',
    );
    await expect(page.getByTestId('cloud-connection-continue')).toHaveTextContent('Retry');
  },
};

/** Retrying a failed attempt starts a fresh device flow and shows its new code. */
export const RetryAfterFailure: Story = {
  render: () =>
    renderDialog({
      current: attempt({
        status: 'expired',
        userCode: '',
        error: { code: 'expired', message: 'The previous code expired.' },
      }),
      begin: attempt({
        attemptId: 'attempt-story-2',
        userCode: 'LMNO-9034',
      }),
      poll: () => new Promise<Result<DesktopCloudConnectionAttempt>>(() => undefined),
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByTestId('cloud-connection-continue'));
    const pending = await page.findByTestId('cloud-connection-pending');
    await expect(pending).toHaveTextContent('LMNO-9034');
    await expect(page.getByTestId('cloud-connection-status')).toHaveTextContent(
      'Waiting for browser confirmation',
    );
  },
};

/** A completed attempt for the current Profile shows the connected state and sync note. */
export const Connected: Story = {
  render: () =>
    renderDialog({
      current: null,
      begin: connectedAttempt,
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByTestId('cloud-connection-continue'));
    await waitFor(() =>
      expect(page.getByTestId('cloud-connection-status')).toHaveTextContent(
        'Cloud account connected',
      ),
    );
    await expect(page.getByTestId('cloud-connection-dialog')).toBeVisible();
  },
};
