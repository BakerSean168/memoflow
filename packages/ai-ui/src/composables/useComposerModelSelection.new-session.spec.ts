import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
import { computed, defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRegistrySnapshotSchema } from '@memoflow/ai-contracts';
import type { AssistantRuntimeChoice } from '@memoflow/ai-contracts';
import enAI from '@ai-ui-test-host/locales/en-US/aiAssistant';
import enErrors from '@ai-ui-test-host/locales/en-US/errors';
import { useComposerModelSelection } from './useComposerModelSelection';
import type { useAIModelCatalog } from './useAIModelCatalog';
import { writeNewSessionDefault, writeStickySelection } from './newSessionSelection';

const toastWarning = vi.hoisted(() => vi.fn());
vi.mock('vue-sonner', () => ({
  toast: { warning: toastWarning, error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const identity = 'desktop-profile-a';
const nativeSelection = {
  runtimeKind: 'local_agent' as const,
  connectionId: 'connection-claude',
  modelId: 'sonnet',
};
const mastraSelection = {
  runtimeKind: 'builtin' as const,
  agentInstanceId: 'mastra',
  modelKey: 'agent:mastra::provider-1::model-a',
};

function mounted(options: { conversationId?: string; timeline?: unknown[] } = {}) {
  const runtimeChoice = ref<AssistantRuntimeChoice>({ runtimeKind: 'builtin' });
  const chatConversationId = ref(options.conversationId ?? '');
  const chatTimeline = ref(options.timeline ?? []);
  const snapshot = ref<ReturnType<typeof AgentRegistrySnapshotSchema.parse> | null>(null);
  const catalog = {
    snapshot: computed(() => snapshot.value),
    entries: computed(() => ({})),
    loading: computed(() => false),
    providerCatalogs: computed(() => ({})),
    nativeStatuses: computed(() => ({})),
    refresh: vi.fn(async () => {}),
    ensureLoaded: vi.fn(async () => {}),
  } as unknown as ReturnType<typeof useAIModelCatalog>;
  const localChoices = {
    models: ref([]),
    defaultChoice: ref<AssistantRuntimeChoice>({ runtimeKind: 'builtin' }),
    connections: ref([]),
    refresh: vi.fn(async () => {}),
    probe: vi.fn(async () => {}),
  } as unknown as Parameters<typeof useComposerModelSelection>[0]['localChoices'];
  let composer: ReturnType<typeof useComposerModelSelection> | undefined;
  const Host = defineComponent({
    setup() {
      composer = useComposerModelSelection({
        providers: ref([]) as never,
        loadProviders: async () => [],
        resolveIdentity: () => identity,
        catalog,
        chatSession: {
          runtimeChoice,
          chatLoading: ref(false),
          chatConversationId,
          chatTimeline: chatTimeline as never,
        },
        localChoices,
        isWorkflowSelectionLocked: () => false,
      });
      return () => h('div');
    },
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null } }],
  });
  const wrapper = mount(Host, {
    global: {
      plugins: [
        router,
        createI18n({
          legacy: false,
          locale: 'en-US',
          messages: { 'en-US': { aiAssistant: enAI, errors: enErrors } },
        }),
      ],
    },
  });
  return {
    wrapper,
    composer: composer!,
    runtimeChoice,
    chatConversationId,
    /** Publish the Agent directory after the first apply, as the real view does. */
    setSnapshot(value: ReturnType<typeof AgentRegistrySnapshotSchema.parse> | null) {
      snapshot.value = value;
    },
  };
}

const emptySnapshot = () => AgentRegistrySnapshotSchema.parse({ instances: [], bindings: [] });
const claudeSnapshot = () =>
  AgentRegistrySnapshotSchema.parse({
    instances: [
      {
        instanceId: 'claude',
        driver: 'claude',
        name: 'Claude Code',
        accentColor: '#6469da',
        enabled: true,
        legacyConnectionId: 'connection-claude',
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    bindings: [],
  });

beforeEach(() => {
  localStorage.clear();
  toastWarning.mockClear();
});
afterEach(() => localStorage.clear());

describe('composer new-session initialisation', () => {
  it('applies the enabled explicit default to an empty composer', () => {
    writeNewSessionDefault({ enabled: true, selection: nativeSelection }, identity);
    const view = mounted();
    expect(view.composer.applyNewSessionSelection()).toBe('applied');
    expect(view.runtimeChoice.value).toEqual(nativeSelection);
  });

  it('falls back to sticky memory and notices once when the explicit default is gone', () => {
    writeNewSessionDefault(
      {
        enabled: true,
        selection: { runtimeKind: 'local_agent', connectionId: 'removed-agent', modelId: 'x' },
      },
      identity,
    );
    writeStickySelection(nativeSelection, identity);
    const view = mounted();
    expect(view.composer.applyNewSessionSelection()).toBe('applied');
    // The directory arrives and proves the default Agent is gone.
    view.setSnapshot(emptySnapshot());
    expect(view.runtimeChoice.value).toEqual(nativeSelection);
    expect(toastWarning).toHaveBeenCalledTimes(1);
    view.setSnapshot(claudeSnapshot());
    expect(toastWarning).toHaveBeenCalledTimes(1);
  });

  it('replaces a pending explicit default with sticky memory once the directory loads', () => {
    writeNewSessionDefault(
      {
        enabled: true,
        selection: { runtimeKind: 'local_agent', connectionId: 'removed-agent', modelId: 'x' },
      },
      identity,
    );
    writeStickySelection(mastraSelection, identity);
    const view = mounted();
    expect(view.composer.applyNewSessionSelection()).toBe('applied');
    // Nothing verifies the default yet, so it is presented as the pending choice.
    expect(view.runtimeChoice.value).toEqual({
      runtimeKind: 'local_agent',
      connectionId: 'removed-agent',
      modelId: 'x',
    });
    view.setSnapshot(emptySnapshot());
    expect(view.runtimeChoice.value).toEqual({ runtimeKind: 'builtin' });
    expect(toastWarning).toHaveBeenCalledTimes(1);
  });

  it('leaves an existing conversation selection untouched', () => {
    writeStickySelection(nativeSelection, identity);
    const view = mounted({ conversationId: 'conversation-1' });
    expect(view.composer.applyNewSessionSelection()).toBe('none');
    expect(view.runtimeChoice.value).toEqual({ runtimeKind: 'builtin' });
  });

  it('keeps the untouched empty state when both layers are absent', () => {
    const view = mounted();
    expect(view.composer.applyNewSessionSelection()).toBe('none');
    expect(view.runtimeChoice.value).toEqual({ runtimeKind: 'builtin' });
  });

  it('records the runtime permission as sticky memory under the Agent hard cap', () => {
    writeStickySelection(nativeSelection, identity);
    const view = mounted();
    view.setSnapshot(claudeSnapshot());
    view.composer.applyNewSessionSelection();
    view.composer.selectPermission('full-access');
    const stored = JSON.parse(
      localStorage.getItem('ai:composer:sticky-selection:v1:desktop-profile-a') ?? 'null',
    );
    expect(stored).toMatchObject({ ...nativeSelection, permissionMode: 'full-access' });
  });
});
