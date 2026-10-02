<template>
  <Dialog :open="open && mountedActive" @update:open="handleOpenChange">
    <ProductDialogShell
      :open="open && mountedActive"
      size="lg"
      test-id="knowledge-capture-native-dialog"
    >
      <template #title>{{ t('repository.capture.title') }}</template>
      <template #description>{{ t('repository.capture.description') }}</template>

      <div class="space-y-4" data-testid="knowledge-capture-native-form">
        <div class="space-y-1.5">
          <Label for="knowledge-capture-title">{{ t('repository.capture.noteTitle') }}</Label>
          <Input
            id="knowledge-capture-title"
            :model-value="draft.title"
            :disabled="busy"
            data-testid="knowledge-capture-native-title"
            @update:model-value="updateText('title', $event)"
          />
        </div>

        <div class="space-y-1.5">
          <Label for="knowledge-capture-topic">{{ t('repository.capture.topic') }}</Label>
          <Input
            id="knowledge-capture-topic"
            :model-value="draft.topic"
            :disabled="busy"
            data-testid="knowledge-capture-native-topic"
            @update:model-value="updateText('topic', $event)"
          />
        </div>

        <div class="space-y-1.5">
          <Label for="knowledge-capture-path">{{ t('repository.capture.path') }}</Label>
          <Input
            id="knowledge-capture-path"
            :model-value="draft.targetSubpath"
            :disabled="busy"
            placeholder="notes/example.md"
            data-testid="knowledge-capture-native-path"
            @update:model-value="updateText('targetSubpath', $event)"
          />
          <p class="text-xs text-muted-foreground">
            {{ t('repository.capture.pathHint') }}
          </p>
        </div>

        <div class="space-y-1.5">
          <Label>{{ t('repository.capture.source') }}</Label>
          <Select
            :model-value="selectedSourceKey"
            :disabled="busy || sourceOptions.length === 0"
            @update:model-value="updateSource"
          >
            <SelectTrigger data-testid="knowledge-capture-native-source">
              <SelectValue :placeholder="t('repository.capture.sourcePlaceholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="option in sourceOptions" :key="option.key" :value="option.key">
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-1.5">
          <Label for="knowledge-capture-tags">{{ t('repository.capture.tags') }}</Label>
          <Input
            id="knowledge-capture-tags"
            :model-value="draft.tags.join(', ')"
            :disabled="busy"
            data-testid="knowledge-capture-native-tags"
            @update:model-value="updateTags"
          />
        </div>

        <div class="space-y-1.5">
          <Label for="knowledge-capture-markdown">{{ t('repository.capture.markdown') }}</Label>
          <Textarea
            id="knowledge-capture-markdown"
            :model-value="draft.markdown"
            :disabled="busy"
            rows="14"
            class="min-h-56 font-mono text-sm"
            data-testid="knowledge-capture-native-markdown"
            @update:model-value="updateText('markdown', $event)"
          />
        </div>

        <p
          v-if="validationError"
          class="text-sm text-destructive"
          role="alert"
          data-testid="knowledge-capture-native-error"
        >
          {{ validationError }}
        </p>
      </div>

      <template #footer>
        <Button
          variant="ghost"
          :disabled="busy"
          data-testid="knowledge-capture-native-cancel"
          @click="handleCancel"
        >
          {{ t('common.cancel') }}
        </Button>
        <Button
          :disabled="busy || !submitCoordinator || sourceOptions.length === 0"
          data-testid="knowledge-capture-native-confirm"
          @click="handleConfirm"
        >
          {{ busy ? t('repository.capture.confirming') : t('repository.capture.confirm') }}
        </Button>
      </template>
    </ProductDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  Button,
  Dialog,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@memoflow/ui-vue-shadcn';
import { ProductDialogShell } from '../../../shared/components';
import { useKnowledgeNativeSurfaceRegistration } from '../../../layouts/shell/useKnowledgeNativeSurface';
import { usePanelSurfaceStatus } from '../../../layouts/shell/usePanelSurfaceStatus';
import type { PanelSurfaceStatus } from '../../../layouts/shell/useAppShellStore';
import type { KnowledgeDraft } from '@memoflow/contracts/ai';
import {
  knowledgeCaptureSourceKey,
  nativeDraftFromKnowledgeDraft,
  parseKnowledgeCaptureNativeDraft,
  type KnowledgeCaptureNativeDraft,
  type KnowledgeCaptureNativeEditSession,
  type KnowledgeCaptureNativePatch,
  type KnowledgeCaptureNativeSubmitContext,
  type KnowledgeCaptureSourceOption,
} from '../composables/knowledgeCaptureNativeEditSession';

const props = defineProps<{
  open: boolean;
  sourceOptions: KnowledgeCaptureSourceOption[];
  defaultSourceKey?: string;
}>();
const emit = defineEmits<{
  (event: 'update:open', open: boolean): void;
}>();

const { t } = useI18n();
const route = useRoute();
const host = useKnowledgeNativeSurfaceRegistration();
const blankDraft = (): KnowledgeCaptureNativeDraft => ({
  title: '',
  topic: '',
  markdown: '',
  targetSubpath: '',
  tags: [],
  duplicateRisk: '',
});

const draft = ref<KnowledgeCaptureNativeDraft>(blankDraft());
const dirty = ref(false);
const busy = ref(false);
const validationError = ref('');
const surfaceStatus = computed<PanelSurfaceStatus>(() =>
  props.open ? (busy.value ? 'busy' : dirty.value ? 'dirty' : 'clean') : 'clean',
);
usePanelSurfaceStatus(surfaceStatus);

let active = false;
const mountedActive = ref(true);
let sessionGeneration = 0;
let session: KnowledgeCaptureNativeEditSession | null = null;
let unregister: (() => void) | null = null;
const submitCoordinator = ref<(() => Promise<void>) | null>(null);
let cancelCoordinator: (() => Promise<void>) | null = null;

function cloneDraft(value = draft.value): KnowledgeCaptureNativeDraft {
  return {
    ...value,
    tags: [...value.tags],
    ...(value.source ? { source: { ...value.source } } : {}),
  };
}

function setDraft(next: KnowledgeCaptureNativeDraft, markDirty = true): void {
  draft.value = cloneDraft(next);
  if (markDirty) dirty.value = true;
  validationError.value = '';
}

function resolveDefaultSource() {
  const preferred =
    props.sourceOptions.find((option) => option.key === props.defaultSourceKey) ??
    (props.sourceOptions.length === 1 ? props.sourceOptions[0] : undefined);
  return preferred?.source;
}

function createSession(): KnowledgeCaptureNativeEditSession {
  const generation = ++sessionGeneration;
  function assertActive(): void {
    if (!active || generation !== sessionGeneration)
      throw new Error('Knowledge capture review is closed');
  }
  return {
    patch(changes: KnowledgeCaptureNativePatch) {
      assertActive();
      if (busy.value) throw new Error('Knowledge capture review is busy');
      setDraft({
        ...cloneDraft(),
        ...changes,
        tags: changes.tags ? [...changes.tags] : [...draft.value.tags],
      });
    },
    projectDraft(workflowDraft: KnowledgeDraft) {
      assertActive();
      if (busy.value) throw new Error('Knowledge capture review is busy');
      if (dirty.value) throw new Error('Knowledge capture review has unsaved owner edits');
      const projected = nativeDraftFromKnowledgeDraft(workflowDraft);
      const source = projected.source ?? resolveDefaultSource();
      setDraft({ ...projected, ...(source ? { source } : {}) }, false);
    },
    async focus(field) {
      assertActive();
      await nextTick();
      const selector =
        field === 'markdown'
          ? '[data-testid="knowledge-capture-native-markdown"]'
          : field === 'targetSubpath'
            ? '[data-testid="knowledge-capture-native-path"]'
            : field === 'source'
              ? '[data-testid="knowledge-capture-native-source"]'
              : '[data-testid="knowledge-capture-native-title"]';
      const element = document.querySelector<HTMLElement>(selector);
      element?.focus();
    },
    readDraftState() {
      assertActive();
      return { draft: cloneDraft(), dirty: dirty.value, busy: busy.value };
    },
    async requestSubmit(context?: KnowledgeCaptureNativeSubmitContext) {
      assertActive();
      const current = cloneDraft();
      if (context && JSON.stringify(context.expectedDraft) !== JSON.stringify(current)) {
        throw new Error('Knowledge capture draft changed before confirmation');
      }
      try {
        const validated = parseKnowledgeCaptureNativeDraft(current);
        if (
          !props.sourceOptions.some(
            (option) =>
              validated.source && option.key === knowledgeCaptureSourceKey(validated.source),
          )
        ) {
          throw new Error('Selected Knowledge source is no longer available');
        }
        validationError.value = '';
        return validated;
      } catch (error) {
        validationError.value =
          error instanceof Error ? error.message : t('repository.capture.validationFailed');
        return null;
      }
    },
    requestCancel() {
      assertActive();
      if (busy.value) throw new Error('Knowledge capture review is busy');
      emit('update:open', false);
    },
    coordinateSubmit(submit, cancel) {
      assertActive();
      submitCoordinator.value = submit;
      cancelCoordinator = cancel;
    },
    setEditingBlocked(blocked) {
      assertActive();
      busy.value = blocked;
    },
  };
}

function activate(): void {
  active = true;
  dirty.value = false;
  busy.value = false;
  validationError.value = '';
  submitCoordinator.value = null;
  cancelCoordinator = null;
  draft.value = blankDraft();
  const source = resolveDefaultSource();
  if (source) draft.value.source = { ...source };
  unregister?.();
  session = createSession();
  unregister = host?.register(route.fullPath, session) ?? null;
}

watch([() => props.sourceOptions, () => props.defaultSourceKey], () => {
  if (!active || busy.value || draft.value.source) return;
  const source = resolveDefaultSource();
  if (source) draft.value.source = { ...source };
});

function deactivate(): void {
  active = false;
  ++sessionGeneration;
  session = null;
  unregister?.();
  unregister = null;
  submitCoordinator.value = null;
  cancelCoordinator = null;
  busy.value = false;
}

watch(
  [() => props.open, () => route.fullPath],
  ([open], [wasOpen]) => {
    if (open && mountedActive.value) {
      if (!wasOpen || !active) activate();
      else if (host && session) {
        unregister?.();
        unregister = host.register(route.fullPath, session);
      }
    } else {
      deactivate();
    }
  },
  { immediate: true },
);

function updateText(
  field: 'title' | 'topic' | 'targetSubpath' | 'markdown',
  value: string | number,
): void {
  if (!active || busy.value) return;
  setDraft({ ...cloneDraft(), [field]: String(value) });
}

function updateTags(value: string | number): void {
  if (!active || busy.value) return;
  const tags = String(value)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  setDraft({ ...cloneDraft(), tags: [...new Set(tags)] });
}

const selectedSourceKey = computed(() =>
  draft.value.source ? knowledgeCaptureSourceKey(draft.value.source) : undefined,
);

function updateSource(key: unknown): void {
  if (!active || busy.value || typeof key !== 'string') return;
  const option = props.sourceOptions.find((item) => item.key === key);
  if (!option) return;
  setDraft({ ...cloneDraft(), source: { ...option.source } });
}

async function handleConfirm(): Promise<void> {
  if (!submitCoordinator.value || busy.value) return;
  await submitCoordinator.value();
}

async function handleCancel(): Promise<void> {
  if (busy.value) return;
  if (cancelCoordinator) await cancelCoordinator();
  else emit('update:open', false);
}

function handleOpenChange(next: boolean): void {
  if (!next && !busy.value) void handleCancel();
}

onDeactivated(() => {
  mountedActive.value = false;
  deactivate();
});
onActivated(() => {
  mountedActive.value = true;
  if (props.open && !active) activate();
});
onBeforeUnmount(deactivate);
</script>
