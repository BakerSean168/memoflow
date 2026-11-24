import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { KNOWLEDGE_REPOSITORY_NOT_CONFIGURED_REASON } from '@memoflow/repository-contracts';
import { REPOSITORY_SERVICE_KEY } from '@repository-ui-test-host/di/keys';
import type { IRepositoryService } from '@repository-ui-test-host/di/types';
import KnowledgeProjectionWorkspaceView from './KnowledgeProjectionWorkspaceView.vue';
import { createStoryRemoteConnection } from '../story-fixtures';

type ProjectionStoryParameters = {
  mode?: 'connected' | 'empty' | 'not-configured' | 'error' | 'loading';
};

function installProjectionPort(parameters: ProjectionStoryParameters) {
  const mode = parameters.mode ?? 'connected';
  provide(REPOSITORY_SERVICE_KEY, {
    listKnowledgeRepositoryConnections: async () => {
      if (mode === 'loading') return new Promise(() => {});
      if (mode === 'not-configured')
        return {
          ok: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'GitHub App is not configured',
            context: { reason: KNOWLEDGE_REPOSITORY_NOT_CONFIGURED_REASON },
          },
        };
      if (mode === 'error')
        return { ok: false, error: { code: 'OFFLINE', message: 'GitHub is unreachable' } };
      if (mode === 'empty') return { ok: true, data: { connections: [] } };
      return {
        ok: true,
        data: {
          connections: [
            createStoryRemoteConnection(),
            createStoryRemoteConnection({
              id: 'story-connection-2',
              name: 'memoflow/design-notes',
              eligibility: 'Blocked',
              state: 'Lagging',
            }),
          ],
        },
      };
    },
  } as unknown as IRepositoryService);
}

const meta = {
  title: 'Business/Repository/KnowledgeProjectionWorkspaceView',
  component: KnowledgeProjectionWorkspaceView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  render: (_args, { parameters }) => ({
    components: { KnowledgeProjectionWorkspaceView },
    setup() {
      installProjectionPort(parameters);
      return {};
    },
    template: `<div style="height: 980px" data-testid="knowledge-projection-story-surface">
      <KnowledgeProjectionWorkspaceView />
    </div>`,
  }),
} satisfies Meta<typeof KnowledgeProjectionWorkspaceView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConnectedReadOnly: Story = {};

export const NoConnections: Story = {
  parameters: { mode: 'empty' },
};

export const ProviderNotConfigured: Story = {
  parameters: { mode: 'not-configured' },
};

export const LoadFailure: Story = {
  parameters: { mode: 'error' },
};

export const Loading: Story = {
  parameters: { mode: 'loading' },
};
