import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { userEvent, within } from 'storybook/test';
import {
  DesktopProfileImportChannels as Channels,
  type DesktopProfileImportView,
  type ProfileSummary,
} from '@memoflow/desktop-contracts';
import type { ElectronBridge } from '@memoflow/ipc-client';
import { DESKTOP_BRIDGE_KEY } from '../../di/keys';
import ProfileImportDialog from './ProfileImportDialog.vue';

const target: ProfileSummary = {
  profileId: 'p_0123456789abcdef01234567',
  profileKind: 'registered',
  displayName: 'Work',
  avatarSeed: 'work',
  avatarUrl: null,
  identifierHint: 'alex@example.com',
  cloudAccountId: 'cloud-account-1',
  lastActiveAt: 1,
  hasCredential: false,
  remembered: false,
};

const source: ProfileSummary = {
  profileId: 'p_89abcdef0123456789abcdef',
  profileKind: 'local',
  displayName: 'Personal',
  avatarSeed: 'personal',
  avatarUrl: null,
  identifierHint: null,
  cloudAccountId: null,
  lastActiveAt: 2,
  hasCredential: false,
  remembered: false,
};

const digest = 'a'.repeat(64);

function preflightRecord(
  blockers: DesktopProfileImportView['blockers'] = [],
): DesktopProfileImportView {
  const requestId = 'import-7f3a91c2';
  return {
    requestId,
    targetProfileId: target.profileId,
    sourceProfileId: source.profileId,
    phase: 'preflight',
    plan: {
      schemaVersion: 1,
      operationId: 'operation-2026-11-14',
      requestId,
      batchId: 'batch-2026-11-14',
      sourceDigest: digest,
      effectiveDigest: digest,
      blockers,
      preview: {
        batchId: 'batch-2026-11-14',
        dryRun: true,
        capabilities: [
          {
            key: 'account-profile',
            schemaVersion: 1,
            created: 1,
            updated: 0,
            skipped: 0,
            warnings: [],
          },
          { key: 'labels', schemaVersion: 1, created: 6, updated: 0, skipped: 1, warnings: [] },
          { key: 'goals', schemaVersion: 1, created: 4, updated: 0, skipped: 0, warnings: [] },
          { key: 'tasks', schemaVersion: 1, created: 23, updated: 0, skipped: 2, warnings: [] },
          { key: 'schedules', schemaVersion: 1, created: 8, updated: 0, skipped: 0, warnings: [] },
        ],
        created: { labels: 6, goals: 4, tasks: 23, schedules: 8 },
        updated: {},
        skipped: { labels: 1, tasks: 2 },
        warnings: [],
      },
    },
    blockers,
    deleteSource: false,
    serverVerified: false,
    localVerified: false,
    sourceUnchanged: true,
  };
}

function createBridge(records: DesktopProfileImportView[]) {
  return {
    invoke: async (channel: string) => {
      if (channel === Channels.LIST) return { ok: true, data: records };
      return { ok: false, error: { code: 'IMPORT_NOT_FOUND', message: 'No import record' } };
    },
  } as unknown as ElectronBridge;
}

const meta = {
  title: 'Business/AppVue/ProfileImportDialog',
  component: ProfileImportDialog,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    target,
    profiles: [target, source],
  },
  render: (args, { parameters }) => ({
    components: { ProfileImportDialog },
    setup() {
      provide(
        DESKTOP_BRIDGE_KEY,
        createBridge((parameters.records as DesktopProfileImportView[] | undefined) ?? []),
      );
      return { args };
    },
    template: `<ProfileImportDialog v-bind="args" />`,
  }),
} satisfies Meta<typeof ProfileImportDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SelectSource: Story = {};

export const PreflightPlan: Story = {
  parameters: { records: [preflightRecord()] },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByText('Import history and recovery'));
    await userEvent.click(await page.findByText(/Preview ready; nothing copied yet/));
    await page.findByText('Confirm copy');
    await page.findByText(/Tasks:/);
  },
};

export const BlockersKeepSource: Story = {
  parameters: {
    records: [
      preflightRecord([{ capability: 'goals', reason: 'preserved_target', field: 'goals' }]),
    ],
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByText('Import history and recovery'));
    await userEvent.click(await page.findByText(/Preview ready; nothing copied yet/));
    await page.findByTestId('profile-import-blockers');
  },
};
