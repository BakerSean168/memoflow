import { LocalAgentModelVisibilityContextSchema } from '@memoflow/ai-contracts';
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue';

const STORAGE_PREFIX = 'ai:native-model-hidden:v2';
const MAX_HIDDEN_MODELS = 200;
// Shared within this renderer so a Settings toggle immediately invalidates
// the Composer's discovered-model projection without another Agent probe.
const revision = ref(0);

function storageKey(identity: string, instanceId: string, context: string | undefined): string {
  return identity && instanceId && LocalAgentModelVisibilityContextSchema.safeParse(context).success
    ? `${STORAGE_PREFIX}:${encodeURIComponent(identity)}:${encodeURIComponent(instanceId)}:${context}`
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
 * instance and verified probe context. Legacy v1 entries have no trustworthy
 * native context and are deliberately not reused or migrated. This does not change
 * the native model catalog, credentials, or an existing conversation model identity.
 */
export function useNativeModelVisibility(
  resolveIdentity: () => string,
  resolveContext: () => string | undefined,
) {
  const canPersist = computed(
    () =>
      Boolean(resolveIdentity()) &&
      LocalAgentModelVisibilityContextSchema.safeParse(resolveContext()).success,
  );
  function isVisible(instanceId: string, modelId: string, context = resolveContext()): boolean {
    // Reactive dependency shared by all mounted Settings and Composer consumers.
    void revision.value;
    return !readHidden(storageKey(resolveIdentity(), instanceId, context)).includes(modelId);
  }
  function setVisible(instanceId: string, modelId: string, visible: boolean): boolean {
    const key = storageKey(resolveIdentity(), instanceId, resolveContext());
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
