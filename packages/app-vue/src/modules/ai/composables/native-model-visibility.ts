import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue';

const STORAGE_PREFIX = 'ai:native-model-hidden:v1';
const MAX_HIDDEN_MODELS = 200;
// Shared within this renderer so a Settings toggle immediately invalidates
// the Composer's discovered-model projection without another Agent probe.
const revision = ref(0);

function storageKey(identity: string, instanceId: string): string {
  return identity && instanceId
    ? `${STORAGE_PREFIX}:${encodeURIComponent(identity)}:${encodeURIComponent(instanceId)}`
    : '';
}

function readHidden(key: string): string[] {
  if (!key) return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value
      .filter((modelId): modelId is string => typeof modelId === 'string' && Boolean(modelId))
      .slice(0, MAX_HIDDEN_MODELS);
  } catch {
    return [];
  }
}

/**
 * Renderer-only display preference, scoped to the Desktop Profile and Agent
 * instance. It does not change the native model catalog, connection credentials,
 * or the model identity stored on an existing conversation.
 */
export function useNativeModelVisibility(resolveIdentity: () => string) {
  const canPersist = computed(() => Boolean(resolveIdentity()));
  function isVisible(instanceId: string, modelId: string): boolean {
    // Reactive dependency shared by all mounted Settings and Composer consumers.
    void revision.value;
    return !readHidden(storageKey(resolveIdentity(), instanceId)).includes(modelId);
  }
  function setVisible(instanceId: string, modelId: string, visible: boolean): boolean {
    const key = storageKey(resolveIdentity(), instanceId);
    if (!key || !modelId) return false;
    const hidden = readHidden(key);
    const next = visible
      ? hidden.filter((id) => id !== modelId)
      : [...hidden.filter((id) => id !== modelId), modelId].slice(-MAX_HIDDEN_MODELS);
    if (hidden.length === next.length && hidden.every((id, index) => id === next[index]))
      return true;
    try {
      localStorage.setItem(key, JSON.stringify(next));
      revision.value++;
      return true;
    } catch {
      // Denied storage is not silently represented as a persisted preference.
      return false;
    }
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(STORAGE_PREFIX)) revision.value++;
  };
  if (getCurrentInstance()) {
    onMounted(() => window.addEventListener('storage', onStorage));
    onBeforeUnmount(() => window.removeEventListener('storage', onStorage));
  }
  return { canPersist, isVisible, setVisible };
}
