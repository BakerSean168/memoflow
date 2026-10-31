import { installAiUiHost } from '@memoflow/app-vue/di/ai-ui-host';
import { createApp, defineComponent, h, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { ok } from '@memoflow/transport-contracts/result';
import { _getCommandPaletteState } from '@memoflow/ui-vue-shadcn';
import { Toaster } from 'vue-sonner';
import ConversationSidebar from '@memoflow/app-vue/layouts/shell/ConversationSidebar.vue';
import { useAIChatSession } from '@memoflow/ai-ui/composables/useAIChatSession';
import { productionLocaleMessages } from '@memoflow/app-vue/locales/production-messages';
import { useKeyboardRuntime } from '@memoflow/app-vue/shared/keyboard/runtime';
import '../../../../../apps/web/src/styles/index.css';

// The production sidebar and Owner run against in-memory service doubles only.
installAiUiHost();
const params = new URLSearchParams(location.search);
const fail = params.has('fail');
const calls = ref<string[]>([]);
const profile = ref('one');
const opened = ref('');
let releaseWrite: () => void = () => {};
const settledWrites = ref(0);
const seeds = ['a', 'b', 'c', 'd'].map((id, i) => ({
  id,
  name: `Conversation ${id.toUpperCase()}`,
  identityId: 'test',
  status: 'Active' as const,
  createdAt: i,
  updatedAt: i,
  messageCount: 0,
  lastMessageAt: null,
}));
const service = {
  updateConversation: async (id: string, patch: { status: string }) => {
    calls.value.push(`${id}:${patch.status}`);
    if (params.has('hold') && calls.value.length === 1)
      await new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
    else await new Promise((resolve) => setTimeout(resolve, 160));
    settledWrites.value++;
    if (fail && id === 'b') throw new Error('Simulated offline write');
    return ok({ ...seeds.find((item) => item.id === id)!, ...patch });
  },
  deleteConversation: async (id: string) => {
    calls.value.push(`${id}:Deleted`);
    return ok(null);
  },
};
const Session = defineComponent({
  setup() {
    const session = useAIChatSession({
      service: service as never,
      runtime: { listAttention: async () => [], deleteConversation: async () => true } as never,
      usageRuntime: {} as never,
      surface: 'web',
      getDefaultConversationName: () => 'New chat',
    });
    seeds.forEach((item) => session.syncConversationSummary(item as never));
    return () =>
      h(ConversationSidebar, {
        activeProfileId: profile.value,
        activeConversationId: opened.value,
        groups: [
          {
            labelKey: 'shell.conversation.today',
            items: session.conversationList.value
              .filter((item) => item.status !== 'Archived' && ['a', 'b'].includes(item.id))
              .map((item) => ({ id: item.id, title: item.name })),
          },
          {
            labelKey: 'shell.conversation.earlier',
            items: session.conversationList.value
              .filter((item) => item.status !== 'Archived' && ['c', 'd'].includes(item.id))
              .map((item) => ({ id: item.id, title: item.name })),
          },
        ],
        archivedConversations: session.conversationList.value
          .filter((item) => item.status === 'Archived')
          .map((item) => ({ id: item.id, title: item.name })),
        onSelectConversation: (id: string) => {
          opened.value = id;
        },
        bulkAction: async (action, ids) => {
          if (action === 'archive') return session.archiveConversations(ids);
          if (action === 'restore') return session.restoreConversations(ids);
          if (!confirm(`Permanently delete ${ids.length} conversations? This cannot be undone.`))
            return [];
          const results = [];
          for (const id of ids)
            results.push({
              id,
              success: Boolean(
                await session.deleteConversation(
                  id,
                  service as never,
                  () => {},
                  () => {},
                ),
              ),
            });
          return results;
        },
      });
  },
});
createApp(
  defineComponent({
    setup() {
      useKeyboardRuntime();
      return () =>
        h('main', {}, [
          h(
            'button',
            {
              'data-testid': 'switch-profile',
              onClick: () => {
                profile.value = profile.value === 'one' ? 'two' : 'one';
              },
            },
            'Switch Profile',
          ),
          h('output', { 'data-testid': 'opened' }, opened.value),
          h(
            'button',
            { 'data-testid': 'release-write', onClick: () => releaseWrite() },
            'Finish test write',
          ),
          h('output', { 'data-testid': 'settled' }, String(settledWrites.value)),
          h('output', { 'data-testid': 'palette' }, String(_getCommandPaletteState().open)),
          h('output', { 'data-testid': 'calls' }, calls.value.join(',')),
          h('textarea', { 'data-testid': 'editor', 'aria-label': 'Draft' }),
          h(
            'div',
            { style: { width: params.has('narrow') ? '208px' : '300px', height: '600px' } },
            [h(Session, { key: profile.value })],
          ),
          h(Toaster),
        ]);
    },
  }),
)
  .use(createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages }))
  .mount('#app');
