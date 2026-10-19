import { nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalAgentClient } from '@memoflow/ai/client';
import type {
  AssistantRuntimeChoice,
  LocalAgentAuthState,
  LocalAgentConnection,
  LocalAgentStatus,
} from '@memoflow/contracts/ai';
import { LocalAgentConnectionSchema } from '@memoflow/contracts/ai';
import { useLocalAssistantChoices } from './useLocalAssistantChoices';
import { useNativeModelVisibility } from './nativeModelVisibility';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function connection(name: string, enabled = true): LocalAgentConnection {
  return LocalAgentConnectionSchema.parse({
    id: 'shared-connection',
    driver: 'codex',
    name,
    executablePath: 'codex',
    enabled,
    writeScopes: [],
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  });
}

function ready(modelId: string): Extract<LocalAgentStatus, { status: 'ready' }> {
  return {
    status: 'ready',
    models: [{ id: modelId, name: modelId }],
    modelVisibilityContext: 'mvc1:' + 'a'.repeat(64),
  };
}

function idleAuth(): LocalAgentAuthState {
  return {
    phase: 'idle',
    flowId: null,
    authorizationUrl: null,
    expiresAt: null,
    failure: null,
  };
}

function clientStub(overrides: Partial<LocalAgentClient> = {}): LocalAgentClient {
  return {
    listConnections: vi.fn(async () => [connection('Profile A')]),
    getDefaultChoice: vi.fn(async () => ({ runtimeKind: 'builtin' })),
    setDefaultChoice: vi.fn(async () => undefined),
    saveConnection: vi.fn(async () => connection('Profile A')),
    deleteConnection: vi.fn(async () => undefined),
    probeConnection: vi.fn(async () => ready('model-a')),
    probeDefaultDriver: vi.fn(async () => ready('model-a')),
    listConversations: vi.fn(async () => []),
    createConversation: vi.fn(async () => {
      throw new Error('unused');
    }),
    respond: vi.fn(async () => false),
    startLogin: vi.fn(async () => idleAuth()),
    loginStatus: vi.fn(async () => idleAuth()),
    cancelLogin: vi.fn(async () => idleAuth()),
    completeLogin: vi.fn(async () => idleAuth()),
    signOut: vi.fn(async () => idleAuth()),
    ...overrides,
  };
}

afterEach(() => localStorage.clear());

describe('local assistant choices: profile and discovery isolation', () => {
  it('awaits the selected connection discovery before refresh completes', async () => {
    const probe = deferred<LocalAgentStatus>();
    const choice = ref<AssistantRuntimeChoice>({
      runtimeKind: 'local_agent',
      connectionId: 'shared-connection',
      modelId: 'model-a',
    });
    const options = useLocalAssistantChoices(
      clientStub({ probeConnection: vi.fn(() => probe.promise) }),
      choice,
    );
    let completed = false;
    const refresh = options.refresh().then(() => {
      completed = true;
    });
    await vi.waitFor(() => expect(options.loading.value).toBe(true));
    expect(completed).toBe(false);
    expect(options.canSend.value).toBe(false);
    probe.resolve(ready('model-a'));
    await refresh;
    expect(completed).toBe(true);
    expect(options.canSend.value).toBe(true);
  });
  it('hiding an Agent model immediately blocks new sends without changing a saved conversation choice', async () => {
    const scope = ref('desktop-profile-a');
    const choice = ref<AssistantRuntimeChoice>({
      runtimeKind: 'local_agent',
      connectionId: 'shared-connection',
      modelId: 'model-a',
    });
    const options = useLocalAssistantChoices(clientStub(), choice, () => scope.value);
    await options.refresh();
    await Promise.resolve();
    expect(options.models.value.map((model) => model.id)).toEqual(['model-a']);
    expect(options.canSend.value).toBe(true);

    const settings = useNativeModelVisibility(
      () => scope.value,
      () =>
        options.status.value?.status === 'ready'
          ? options.status.value.modelVisibilityContext
          : undefined,
    );
    expect(settings.setVisible('shared-connection', 'model-a', false)).toBe(true);
    expect(options.models.value).toEqual([]);
    expect(options.canSend.value).toBe(false);
    expect(choice.value).toMatchObject({ modelId: 'model-a' });
    // A different Desktop Profile cannot inherit the visibility preference.
    scope.value = 'desktop-profile-b';
    await nextTick();
    expect(options.models.value.map((model) => model.id)).toEqual(['model-a']);
    expect(options.canSend.value).toBe(true);
    scope.value = 'desktop-profile-a';
    await nextTick();
    expect(options.canSend.value).toBe(false);
  });
  it('ignores an old in-flight probe when refreshing a reused connection ID', async () => {
    const previousProbe = deferred<LocalAgentStatus>();
    const nextSnapshot = deferred<LocalAgentConnection[]>();
    const nextProbe = deferred<LocalAgentStatus>();
    const listConnections = vi
      .fn<LocalAgentClient['listConnections']>()
      .mockResolvedValueOnce([connection('Profile A')])
      .mockImplementationOnce(() => nextSnapshot.promise);
    const probeConnection = vi
      .fn<LocalAgentClient['probeConnection']>()
      .mockImplementationOnce(() => previousProbe.promise)
      .mockImplementationOnce(() => nextProbe.promise);
    const choice = ref<AssistantRuntimeChoice>({
      runtimeKind: 'local_agent',
      connectionId: 'shared-connection',
      modelId: 'model-a',
    });
    const options = useLocalAssistantChoices(
      clientStub({ listConnections, probeConnection }),
      choice,
    );
    const firstRefresh = options.refresh();
    await vi.waitFor(() => expect(options.loading.value).toBe(true));

    const secondRefresh = options.refresh();
    expect(options.status.value).toBeNull();
    expect(options.canSend.value).toBe(false);
    previousProbe.resolve(ready('model-a'));
    await firstRefresh;
    expect(options.status.value).toBeNull();

    nextSnapshot.resolve([connection('Profile B')]);
    await vi.waitFor(() => expect(probeConnection).toHaveBeenCalledTimes(2));
    nextProbe.resolve(ready('model-b'));
    await secondRefresh;
    expect(options.connections.value[0]?.name).toBe('Profile B');
    expect(options.models.value.map((model) => model.id)).toEqual(['model-b']);
    expect(options.canSend.value).toBe(false);
    choice.value = {
      runtimeKind: 'local_agent',
      connectionId: 'shared-connection',
      modelId: 'model-b',
    };
    await nextTick();
    expect(options.canSend.value).toBe(true);
  });

  it('does not overwrite a newer profile snapshot with an earlier refresh result', async () => {
    const older = deferred<LocalAgentConnection[]>();
    const newer = deferred<LocalAgentConnection[]>();
    const listConnections = vi
      .fn<LocalAgentClient['listConnections']>()
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);
    const choice = ref<AssistantRuntimeChoice>({ runtimeKind: 'builtin' });
    const options = useLocalAssistantChoices(clientStub({ listConnections }), choice);
    const first = options.refresh();
    const second = options.refresh();
    newer.resolve([connection('Profile B')]);
    await second;
    older.resolve([connection('Profile A')]);
    await first;
    expect(options.connections.value.map((item) => item.name)).toEqual(['Profile B']);
    expect(options.error.value).toBe(false);
  });

  it('does not allow an explicit probe during a pending profile refresh', async () => {
    const nextSnapshot = deferred<LocalAgentConnection[]>();
    const listConnections = vi
      .fn<LocalAgentClient['listConnections']>()
      .mockResolvedValueOnce([connection('Profile A')])
      .mockImplementationOnce(() => nextSnapshot.promise);
    const probeConnection = vi
      .fn<LocalAgentClient['probeConnection']>()
      .mockResolvedValueOnce(ready('model-a'))
      .mockResolvedValueOnce(ready('model-b'));
    const choice = ref<AssistantRuntimeChoice>({
      runtimeKind: 'local_agent',
      connectionId: 'shared-connection',
      modelId: 'model-a',
    });
    const options = useLocalAssistantChoices(
      clientStub({ listConnections, probeConnection }),
      choice,
    );
    await options.refresh();
    await Promise.resolve();
    expect(options.canSend.value).toBe(true);
    expect(probeConnection).toHaveBeenCalledTimes(1);

    const next = options.refresh();
    await options.probe('shared-connection');
    await Promise.resolve();
    expect(options.status.value).toBeNull();
    expect(options.canSend.value).toBe(false);
    expect(probeConnection).toHaveBeenCalledTimes(1);

    nextSnapshot.resolve([connection('Profile B')]);
    await next;
    await Promise.resolve();
    expect(probeConnection).toHaveBeenCalledTimes(2);
    expect(options.models.value.map((model) => model.id)).toEqual(['model-b']);
    expect(options.canSend.value).toBe(false);
  });

  it('fails closed on a snapshot error and keeps stale probe results non-sendable', async () => {
    const staleProbe = deferred<LocalAgentStatus>();
    const listConnections = vi
      .fn<LocalAgentClient['listConnections']>()
      .mockResolvedValueOnce([connection('Profile A')])
      .mockRejectedValueOnce(new Error('Profile switched'));
    const choice = ref<AssistantRuntimeChoice>({
      runtimeKind: 'local_agent',
      connectionId: 'shared-connection',
      modelId: 'model-a',
    });
    const options = useLocalAssistantChoices(
      clientStub({
        listConnections,
        probeConnection: vi.fn(() => staleProbe.promise),
      }),
      choice,
    );
    const firstRefresh = options.refresh();
    await vi.waitFor(() => expect(options.loading.value).toBe(true));
    await options.refresh();
    staleProbe.resolve(ready('model-a'));
    await firstRefresh;
    expect(options.error.value).toBe(true);
    expect(options.status.value).toBeNull();
    expect(options.connections.value).toEqual([]);
    expect(options.canSend.value).toBe(false);
  });
});

it('uses the current probe context and preserves the selected historical model across account changes', async () => {
  const choice = ref<AssistantRuntimeChoice>({
    runtimeKind: 'local_agent',
    connectionId: 'shared-connection',
    modelId: 'model-a',
  });
  const client = clientStub();
  const options = useLocalAssistantChoices(client, choice, () => 'profile');
  await options.refresh();
  await Promise.resolve();
  const visibility = useNativeModelVisibility(
    () => 'profile',
    () =>
      options.status.value?.status === 'ready'
        ? options.status.value.modelVisibilityContext
        : undefined,
  );
  expect(visibility.setVisible('shared-connection', 'model-a', false)).toBe(true);
  expect(options.canSend.value).toBe(false);
  vi.mocked(client.probeConnection).mockResolvedValueOnce({
    ...ready('model-a'),
    modelVisibilityContext: 'mvc1:' + 'b'.repeat(64),
  });
  await options.probe('shared-connection');
  expect(options.canSend.value).toBe(true);
  expect(options.models.value.map((model) => model.id)).toEqual(['model-a']);
  await options.probe('shared-connection');
  expect(options.canSend.value).toBe(false);
  expect(choice.value).toEqual({
    runtimeKind: 'local_agent',
    connectionId: 'shared-connection',
    modelId: 'model-a',
  });
  expect(client.setDefaultChoice).not.toHaveBeenCalled();
  expect(client.saveConnection).not.toHaveBeenCalled();
});

it('retains the catalog after a request limit and scopes its observation to the selected model', async () => {
  const choice = ref<AssistantRuntimeChoice>({
    runtimeKind: 'local_agent',
    connectionId: 'shared-connection',
    modelId: 'model-a',
  });
  const client = clientStub({
    probeConnection: vi.fn(async () => ({
      ...ready('model-a'),
      lastExecutionFailure: {
        code: 'LOCAL_AGENT_QUOTA_EXHAUSTED' as const,
        modelId: 'model-a',
        occurredAt: 1,
      },
    })),
  });
  const options = useLocalAssistantChoices(client, choice, () => 'profile');
  await options.refresh();
  await Promise.resolve();
  expect(options.lastExecutionFailure.value?.code).toBe('LOCAL_AGENT_QUOTA_EXHAUSTED');
  expect(options.models.value.map((m) => m.id)).toEqual(['model-a']);
  expect(options.canSend.value).toBe(true); // An explicit user retry remains possible; discovery is not quota proof.
  choice.value = {
    runtimeKind: 'local_agent',
    connectionId: 'shared-connection',
    modelId: 'different-model',
  };
  await nextTick();
  await Promise.resolve();
  expect(options.lastExecutionFailure.value).toBeUndefined();
});
