import { installAiUiHost } from '@memoflow/app-vue/di/ai-ui-host';
import { SERVER_STATE_IDENTITY_SCOPE_KEY } from '@memoflow/app-vue/platform/server-state';
import { createApp, defineComponent, h, ref, onBeforeUnmount } from 'vue';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory } from 'vue-router';
import { productionLocaleMessages } from '@memoflow/app-vue/locales/production-messages';
import AIComposerControls from '@memoflow/ai-ui/components/AIComposerControls.vue';
import AILocalRequestCard from '@memoflow/ai-ui/components/AILocalRequestCard.vue';
import { useComposerModelSelection } from '@memoflow/ai-ui/composables/useComposerModelSelection';
import type { UseComposerModelSelectionOptions } from '@memoflow/ai-ui/composables/useComposerModelSelection';
import type { AssistantRuntimeEvent, AssistantRuntimeChoice } from '@memoflow/ai-contracts';
import '../../../../../apps/web/src/styles/index.css';

installAiUiHost();
const seed = await fetch('/__runtime/state').then((result) => result.json());
const Root = defineComponent({
  setup() {
    const events = ref<AssistantRuntimeEvent[]>([]);
    const running = ref(false);
    const failure = ref('');
    const conversationId = ref(seed.conversationId);
    const identity = ref('runtime-861-isolated');
    const runtimeChoice = ref<AssistantRuntimeChoice>({
      runtimeKind: 'local_agent',
      connectionId: seed.connectionId,
      modelId: 'fixture/model',
    });
    const model = {
      key: 'model',
      agentKey: `local:${seed.connectionId}`,
      agentInstanceId: 'codex',
      providerId: seed.connectionId,
      providerName: 'Pi',
      modelId: 'fixture/model',
      modelName: 'Acceptance model',
      reasoningEfforts: ['low', 'medium', 'high'],
    };
    const snapshot = ref({
      instances: [
        {
          instanceId: 'codex',
          driver: 'pi',
          name: 'Pi acceptance',
          enabled: true,
          legacyConnectionId: seed.connectionId,
          revision: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      bindings: [],
    });
    const entries = ref({
      codex: {
        instanceId: 'codex',
        agentKey: model.agentKey,
        status: 'ready',
        models: [model],
      },
    });
    // Discovery is fixed; the actual production composer selection owner is used below.
    const selection = useComposerModelSelection({
      providers: ref([]),
      loadProviders: async () => [],
      resolveIdentity: () => identity.value,
      catalog: {
        snapshot,
        entries,
        loading: ref(false),
        refresh: async () => {},
      },
      chatSession: {
        runtimeChoice,
        chatLoading: running,
        chatConversationId: conversationId,
        chatTimeline: ref([]),
      },
      localChoices: {
        models: ref([{ id: 'fixture/model', name: 'Acceptance model' }]),
        defaultChoice: ref(runtimeChoice.value),
        refresh: async () => {},
      },
      isWorkflowSelectionLocked: () => false,
    } as unknown as UseComposerModelSelectionOptions);
    selection.composerInitializing.value = false;
    const timer = setInterval(async () => {
      const state = await fetch('/__runtime/state').then((result) => result.json());
      events.value = state.events;
      running.value = state.running;
      failure.value = state.failure ?? '';
    }, 100);
    onBeforeUnmount(() => clearInterval(timer));
    return () => {
      const requestEvent = events.value.find(
        (event) => event.type === 'assistant.request.required',
      );
      const pending =
        requestEvent &&
        requestEvent.type === 'assistant.request.required' &&
        !events.value.some(
          (event) =>
            event.type === 'assistant.request.resolved' &&
            event.data.requestId === requestEvent.data.requestId,
        );
      return h('main', { class: 'mx-auto max-w-3xl p-12 space-y-4' }, [
        h(
          'h1',
          { class: 'text-lg font-medium' },
          'Runtime permissions · isolated development acceptance',
        ),
        h(
          'p',
          { class: 'text-sm text-muted-foreground' },
          'Production composer + LocalAgentRuntime + PiDriver. Deterministic protocol peer executes a bounded Node command. No provider inference or live credentials.',
        ),
        h('p', { 'data-testid': 'conversation', class: 'text-xs' }, conversationId.value),
        h('div', { class: 'rounded-xl border p-4' }, [
          h(AIComposerControls, {
            agents: selection.composerAgents.value,
            selectedAgentId: model.agentKey,
            models: [model],
            catalog: entries.value,
            selectedModelKey: 'model',
            native: true,
            permissionMode: selection.permissionMode.value,
            disabled: running.value,
            onPermission: selection.selectPermission,
          }),
        ]),
        h('div', { class: 'flex gap-2' }, [
          h(
            'button',
            {
              'data-testid': 'switch-thread',
              class: 'rounded-md border px-3 py-1 text-xs',
              onClick: () => {
                conversationId.value =
                  conversationId.value === seed.conversationId
                    ? 'other-thread'
                    : seed.conversationId;
              },
            },
            'Switch acceptance thread',
          ),
          h(
            'button',
            {
              'data-testid': 'switch-profile',
              class: 'rounded-md border px-3 py-1 text-xs',
              onClick: () => {
                identity.value =
                  identity.value === 'runtime-861-isolated'
                    ? 'other-profile'
                    : 'runtime-861-isolated';
              },
            },
            'Switch acceptance profile',
          ),
        ]),
        h(
          'button',
          {
            'data-testid': 'run-command',
            class: 'rounded-md bg-primary px-4 py-2 text-primary-foreground',
            disabled: running.value,
            onClick: () =>
              fetch(`/__runtime/start?mode=${selection.permissionMode.value}`, {
                method: 'POST',
              }),
          },
          'Run verification command',
        ),
        pending && requestEvent?.type === 'assistant.request.required'
          ? h(AILocalRequestCard, {
              request: {
                request: requestEvent.data,
                status: 'pending',
                runId: requestEvent.runId,
                conversationId: conversationId.value,
              },
              onRespond: () =>
                fetch(
                  `/__runtime/approve?runId=${requestEvent.runId}&requestId=${requestEvent.data.requestId}`,
                  { method: 'POST' },
                ),
            })
          : null,
        h(
          'pre',
          {
            'data-testid': 'runtime-log',
            class: 'whitespace-pre-wrap text-xs',
          },
          JSON.stringify(
            {
              running: running.value,
              failure: failure.value,
              events: events.value,
            },
            null,
            2,
          ),
        ),
      ]);
    };
  },
});
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: Root }],
});
await router.push('/');
const app = createApp(Root);
app.provide(SERVER_STATE_IDENTITY_SCOPE_KEY, () => 'runtime-861-isolated');
app
  .use(router)
  .use(
    createI18n({
      legacy: false,
      locale: 'en-US',
      messages: productionLocaleMessages,
    }),
  )
  .mount('#app');
