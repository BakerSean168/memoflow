import { nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { LocalAgentClient } from '@memoflow/ai/client';
import type {
  AssistantRuntimeChoice,
  LocalAgentConnection,
  LocalAgentStatus,
} from '@memoflow/contracts/ai';
import { LocalAgentConnectionSchema } from '@memoflow/contracts/ai';
import { useLocalAssistantChoices } from './useLocalAssistantChoices';

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

function ready(modelId: string): LocalAgentStatus {
  return { status: 'ready', models: [{ id: modelId, name: modelId }] };
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
    ...overrides,
  };
}

describe('local assistant choices: profile and discovery isolation', () => {
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
    await options.refresh();
    expect(options.loading.value).toBe(true);

    const secondRefresh = options.refresh();
    expect(options.status.value).toBeNull();
    expect(options.canSend.value).toBe(false);
    previousProbe.resolve(ready('model-a'));
    await Promise.resolve();
    expect(options.status.value).toBeNull();

    nextSnapshot.resolve([connection('Profile B')]);
    await secondRefresh;
    nextProbe.resolve(ready('model-b'));
    await Promise.resolve();
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
    await options.refresh();
    await options.refresh();
    staleProbe.resolve(ready('model-a'));
    await Promise.resolve();
    expect(options.error.value).toBe(true);
    expect(options.status.value).toBeNull();
    expect(options.connections.value).toEqual([]);
    expect(options.canSend.value).toBe(false);
  });
});
