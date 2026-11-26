import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { onBeforeUnmount, provide } from 'vue';
import { expect, screen, userEvent, waitFor } from 'storybook/test';
import { ok, fail } from '@memoflow/transport-contracts/result';
import type { LocalVaultGitChange, LocalVaultNoteSummaryDTO } from '@memoflow/repository-contracts';
import GlobalConfirmDialog from '@repository-ui-test-host/shared/components/GlobalConfirmDialog.vue';
import { repositoryUiHost } from '../repository-ui-host';
import LocalVaultWorkspaceView from './LocalVaultWorkspaceView.vue';
import { createStoryVaultSnapshot } from '../story-fixtures';

type Mode =
  | 'bound'
  | 'unbound'
  | 'missing'
  | 'error'
  | 'loading'
  | 'empty'
  | 'not-git'
  | 'git-unavailable';
const documentIds = [
  'kdoc_550e8400-e29b-41d4-a716-446655440101',
  'kdoc_550e8400-e29b-41d4-a716-446655440102',
];
const notes = [
  {
    relativePath: 'Goals/weekly-review.md',
    title: '每周知识回顾',
    knowledgeDocumentId: documentIds[0],
  },
  {
    relativePath: 'Projects/memoflow-workflow.md',
    title: 'MemoFlow 工作流改进',
    knowledgeDocumentId: documentIds[1],
  },
  { relativePath: 'Inbox/ai-note.md', title: 'AI 整理的研究笔记', knowledgeDocumentId: null },
  { relativePath: 'Design/knowledge-panel.md', title: '知识面板布局', knowledgeDocumentId: null },
].map((note) => ({
  ...note,
  excerpt: '',
  contentHash: note.relativePath,
  aliases: [],
  tags: [],
  outgoingLinks: [],
  size: 128,
  updatedAt: 1,
})) as LocalVaultNoteSummaryDTO[];
const changes: LocalVaultGitChange[] = [
  { relativePath: notes[1]!.relativePath, status: 'modified' },
  { relativePath: notes[2]!.relativePath, status: 'added' },
  { relativePath: 'Archive/obsolete-note.md', status: 'deleted' },
  { relativePath: notes[3]!.relativePath, previousPath: 'Design/old-layout.md', status: 'renamed' },
];

function installVaultPort(mode: Mode) {
  const configured = createStoryVaultSnapshot(mode === 'missing' ? 'Missing' : 'Available');
  configured.binding.displayName = 'Thought Forest';
  configured.binding.rootPath = '/Users/baker/Notes/Thought Forest';
  let binding = mode === 'unbound' ? null : configured;
  provide(repositoryUiHost.REPOSITORY_SERVICE_KEY, {
    getLocalVaultBinding: async () => {
      if (mode === 'loading') return new Promise(() => undefined);
      if (mode === 'error')
        return fail({ code: 'INTERNAL_ERROR', message: '暂时无法读取本地知识库，请刷新重试。' });
      return ok(binding);
    },
    scanLocalVault: async () =>
      ok({
        binding: configured.binding,
        health: configured.health,
        notes: mode === 'empty' ? [] : notes,
        scannedAt: 1,
      }),
    getLocalVaultGitChanges: async () =>
      ok({
        bindingId: configured.binding.id,
        state:
          mode === 'not-git'
            ? 'not-repository'
            : mode === 'git-unavailable'
              ? 'unavailable'
              : 'ready',
        changes: ['empty', 'not-git', 'git-unavailable'].includes(mode) ? [] : changes,
        observedAt: 1,
      }),
    selectLocalVault: async () => {
      binding = { ...configured, health: { ...configured.health, state: 'Available' } };
      return ok(binding);
    },
    detachLocalVault: async () => {
      binding = null;
      return ok(undefined);
    },
    openLocalVaultInObsidian: async () => ok(undefined),
  } as never);
  const original = repositoryUiHost.useKnowledgeBusinessLinks;
  repositoryUiHost.useKnowledgeBusinessLinks = () => async () =>
    mode === 'empty'
      ? []
      : [
          {
            documentId: documentIds[0]!,
            subjectType: 'goal',
            subjectId: 'goal-knowledge',
            title: '建立可持续的知识管理习惯',
          },
          {
            documentId: documentIds[1]!,
            subjectType: 'goal',
            subjectId: 'goal-memoflow',
            title: '优化 MemoFlow 工作流',
          },
        ];
  onBeforeUnmount(() => {
    repositoryUiHost.useKnowledgeBusinessLinks = original;
  });
}

const meta = {
  title: 'Business/Repository/LocalVaultWorkspaceView',
  component: LocalVaultWorkspaceView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  globals: { theme: 'dark', locale: 'zh-CN' },
  render: (_args, { parameters }) => ({
    components: { LocalVaultWorkspaceView, GlobalConfirmDialog },
    setup() {
      installVaultPort((parameters.mode ?? 'bound') as Mode);
      return {};
    },
    template:
      '<div class="h-screen bg-background text-foreground"><LocalVaultWorkspaceView /><GlobalConfirmDialog /></div>',
  }),
} satisfies Meta<typeof LocalVaultWorkspaceView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const BoundAndAvailable: Story = {};
export const UnboundVault: Story = { parameters: { mode: 'unbound' } };
export const BoundButMissing: Story = { parameters: { mode: 'missing' } };
export const LoadFailure: Story = { parameters: { mode: 'error' } };
export const Loading: Story = { parameters: { mode: 'loading' } };
export const EmptyWorkspace: Story = { parameters: { mode: 'empty' } };
export const NotAGitRepository: Story = { parameters: { mode: 'not-git' } };
export const GitUnavailable: Story = { parameters: { mode: 'git-unavailable' } };
export const LightTheme: Story = { globals: { theme: 'light', locale: 'zh-CN' } };
export const VaultMenu: Story = {
  play: async () => {
    await screen.findByTestId('knowledge-note-list');
    await userEvent.click(screen.getByTestId('local-vault-menu'));
    await screen.findByTestId('local-vault-menu-content');
  },
};
export const WorkspaceChanges: Story = {
  play: async () => {
    await screen.findByTestId('knowledge-note-list');
    await userEvent.click(screen.getByTestId('knowledge-note-filter'));
    await userEvent.click(await screen.findByTestId('knowledge-note-filter-changes'));
    const deleted = document.querySelector('[data-note-path="Archive/obsolete-note.md"] button');
    await expect(deleted).toBeDisabled();
  },
};
export const LinkedNotes: Story = {
  play: async () => {
    await screen.findByTestId('knowledge-note-list');
    await userEvent.click(screen.getByTestId('knowledge-note-filter'));
    await userEvent.click(await screen.findByTestId('knowledge-note-filter-linked'));
    await waitFor(() => expect(document.querySelectorAll('[data-note-path]')).toHaveLength(2));
  },
};
