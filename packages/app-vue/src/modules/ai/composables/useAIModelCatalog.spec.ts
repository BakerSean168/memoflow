import { effectScope, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type {
  AgentInstance,
  AgentRegistrySnapshot,
  LocalAgentStatus,
} from '@memoflow/contracts/ai';
import { useAIModelCatalog, listSelectableModels, isModelSelectable } from './useAIModelCatalog';

const instance = (
  instanceId: string,
  driver: AgentInstance['driver'],
  enabled = true,
  legacyConnectionId?: string,
): AgentInstance => ({
  instanceId,
  driver,
  enabled,
  name: instanceId,
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
  ...(legacyConnectionId ? { legacyConnectionId } : {}),
});
const ready = (id: string): LocalAgentStatus => ({ status: 'ready', models: [{ id, name: id }] });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function setup() {
  const identity = ref('profile-a');
  const snapshot: AgentRegistrySnapshot = {
    instances: [
      instance('mastra', 'mastra'),
      instance('codex', 'codex'),
      instance('work', 'codex', true, 'conn-work'),
      instance('off', 'pi', false, 'conn-off'),
    ],
    bindings: [{ instanceId: 'mastra', connectionId: 'provider', modelId: 'alpha' }],
  };
  const registry = { list: vi.fn(async () => snapshot) };
  const native = {
    probeDefaultDriver: vi.fn(async () => ready('default-model')),
    probeConnection: vi.fn(async () => ready('work-model')),
  };
  const refreshProviderModels = vi.fn(async () => ({
    models: [
      { id: 'alpha', name: 'Alpha' },
      { id: 'beta', name: 'Beta' },
    ],
  }));
  const scope = effectScope();
  const catalog = scope.run(() =>
    useAIModelCatalog({
      resolveIdentity: () => identity.value,
      registry,
      native,
      refreshProviderModels,
    }),
  )!;
  return { identity, snapshot, registry, native, refreshProviderModels, catalog, scope };
}
describe('identity-scoped read-only model catalog', () => {
  it('aggregates every enabled instance from real discovery without selecting or materializing connections', async () => {
    const { catalog, native, refreshProviderModels, scope } = setup();
    await catalog.refresh();
    expect(Object.keys(catalog.entries.value)).toEqual(['mastra', 'codex', 'work']);
    expect(listSelectableModels(catalog.entries.value).map((m) => m.modelId)).toEqual([
      'alpha',
      'beta',
      'default-model',
      'work-model',
    ]);
    expect(isModelSelectable(catalog.entries.value, 'work', 'work-model')).toBe(true);
    expect(isModelSelectable(catalog.entries.value, 'off', 'work-model')).toBe(false);
    expect(native.probeDefaultDriver).toHaveBeenCalledExactlyOnceWith('codex');
    expect(native.probeConnection).toHaveBeenCalledExactlyOnceWith('conn-work');
    expect(refreshProviderModels).toHaveBeenCalledExactlyOnceWith('provider');
    scope.stop();
  });
  it('publishes per-instance loading, empty, unavailable and error independently', async () => {
    const { catalog, native, scope } = setup();
    const pending = deferred<LocalAgentStatus>();
    native.probeDefaultDriver.mockImplementationOnce(() => pending.promise);
    native.probeConnection.mockRejectedValueOnce(new Error('offline'));
    const refresh = catalog.refresh();
    await vi.waitFor(() => expect(catalog.entries.value.codex?.status).toBe('loading'));
    await vi.waitFor(() => expect(catalog.entries.value.work?.status).toBe('error'));
    expect(isModelSelectable(catalog.entries.value, 'codex', 'cached')).toBe(false);
    pending.resolve({ status: 'login_required', message: 'Sign in' });
    await refresh;
    expect(catalog.entries.value.codex).toMatchObject({
      status: 'unavailable',
      reason: 'login_required',
      models: [],
    });
    native.probeDefaultDriver.mockResolvedValueOnce({ status: 'ready', models: [] });
    await catalog.refresh();
    expect(catalog.entries.value.codex).toMatchObject({ status: 'ready', models: [] });
    scope.stop();
  });
  it('ignores old epochs even when an older probe finishes last', async () => {
    const { catalog, native, scope } = setup();
    const old = deferred<LocalAgentStatus>();
    native.probeDefaultDriver.mockImplementationOnce(() => old.promise);
    const first = catalog.refresh();
    await vi.waitFor(() => expect(native.probeDefaultDriver).toHaveBeenCalledTimes(1));
    await catalog.refresh();
    old.resolve(ready('stale-model'));
    await first;
    expect(catalog.entries.value.codex?.models.map((m) => m.modelId)).toEqual(['default-model']);
    scope.stop();
  });
  it('immediately isolates identity switches and rejects late results with reused instance ids', async () => {
    const { catalog, native, identity, scope } = setup();
    const old = deferred<LocalAgentStatus>();
    native.probeDefaultDriver.mockImplementationOnce(() => old.promise);
    const first = catalog.refresh();
    await vi.waitFor(() => expect(native.probeDefaultDriver).toHaveBeenCalledTimes(1));
    identity.value = 'profile-b';
    expect(catalog.entries.value).toEqual({});
    await catalog.refresh();
    old.resolve(ready('profile-a-only'));
    await first;
    expect(catalog.entries.value.codex?.models.map((m) => m.modelId)).toEqual(['default-model']);
    scope.stop();
  });
  it('filters disabled instances after refresh without deleting user preferences', async () => {
    const { catalog, snapshot, scope } = setup();
    await catalog.refresh();
    snapshot.instances[2]!.enabled = false;
    await catalog.refresh();
    expect(catalog.entries.value.work).toBeUndefined();
    snapshot.instances[2]!.enabled = true;
    await catalog.refresh();
    expect(isModelSelectable(catalog.entries.value, 'work', 'work-model')).toBe(true);
    scope.stop();
  });
});
