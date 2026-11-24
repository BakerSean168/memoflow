import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { REPOSITORY_SERVICE_KEY } from '@repository-ui-test-host/di/keys';
import type { IRepositoryService } from '@repository-ui-test-host/di/types';
import LocalVaultWorkspaceView from './LocalVaultWorkspaceView.vue';
import { createStoryVaultSnapshot, storyVaultWrites } from '../story-fixtures';

type VaultStoryParameters = {
  mode?: 'bound' | 'unbound' | 'missing' | 'error' | 'loading';
};

function installVaultPort(parameters: VaultStoryParameters) {
  const mode = parameters.mode ?? 'bound';
  provide(REPOSITORY_SERVICE_KEY, {
    getLocalVaultBinding: async () => {
      if (mode === 'loading') return new Promise(() => {});
      if (mode === 'error')
        return { ok: false, error: { code: 'OFFLINE', message: 'Vault host is unavailable' } };
      if (mode === 'unbound') return { ok: true, data: null };
      return {
        ok: true,
        data: createStoryVaultSnapshot(mode === 'missing' ? 'Missing' : 'Available'),
      };
    },
    listLocalVaultWrites: async () =>
      mode === 'missing' ? { ok: true, data: [] } : { ok: true, data: storyVaultWrites },
  } as unknown as IRepositoryService);
}

const meta = {
  title: 'Business/Repository/LocalVaultWorkspaceView',
  component: LocalVaultWorkspaceView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  render: (_args, { parameters }) => ({
    components: { LocalVaultWorkspaceView },
    setup() {
      installVaultPort(parameters);
      return {};
    },
    template: `<div style="height: 980px" data-testid="local-vault-story-surface">
      <LocalVaultWorkspaceView />
    </div>`,
  }),
} satisfies Meta<typeof LocalVaultWorkspaceView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BoundAndAvailable: Story = {};

export const UnboundVault: Story = {
  parameters: { mode: 'unbound' },
};

export const BoundButMissing: Story = {
  parameters: { mode: 'missing' },
};

export const LoadFailure: Story = {
  parameters: { mode: 'error' },
};

export const Loading: Story = {
  parameters: { mode: 'loading' },
};
