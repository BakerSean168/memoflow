<script setup lang="ts">
/**
 * Note capsule quick workspace.
 *
 * This surface is optimized for retrieval: search recent projected/Vault notes,
 * open a note directly, and leave repository management to the full module.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowRight, FileText, Link2, Search } from '@lucide/vue';
import { Input } from '@memoflow/ui-vue-shadcn';
import { useRecentKnowledgeNotes } from '../../../modules/repository/composables/useRecentKnowledgeNotes';
import {
  CapsulePreviewFooter,
  CapsulePreviewHeader,
  CapsulePreviewShell,
  CapsulePreviewState,
} from '../../../shared/components';

const LOAD_LIMIT = 40;
const DISPLAY_LIMIT = 8;

defineEmits<{
  'view-all': [];
  select: [id: string];
}>();

const { t } = useI18n();
const recentNotes = useRecentKnowledgeNotes();

const query = ref('');

const totalCount = computed(() => recentNotes.notes.value.length);
const isLoading = computed(() => recentNotes.isLoading.value);
const localError = computed(() => recentNotes.error.value);
const emailVerificationRequired = computed(() => recentNotes.emailVerificationRequired.value);
const errorMessageKey = computed(() => recentNotes.errorMessageKey.value);

const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  const source = recentNotes.notes.value;
  if (!needle) return source.slice(0, DISPLAY_LIMIT);
  return source
    .filter((item) =>
      [item.title, item.path]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase().includes(needle)),
    )
    .slice(0, DISPLAY_LIMIT);
});

const verificationDegradeMessage = computed(() => {
  if (!emailVerificationRequired.value) return null;
  const key = errorMessageKey.value ?? 'errors.EMAIL_VERIFICATION_REQUIRED';
  return t(key);
});

function titleOf(item: { title: string; path: string; id: string }) {
  return item.title || item.path || item.id;
}

async function load(force = false) {
  if (force) await recentNotes.load(LOAD_LIMIT);
  else await recentNotes.ensure(LOAD_LIMIT);
}

onMounted(() => {
  void load();
});
</script>

<template>
  <CapsulePreviewShell
    max-height="30rem"
    data-testid="note-capsule-preview"
    data-capsule-workspace="note"
  >
    <CapsulePreviewHeader
      :title="t('nav.capsule.note')"
      :subtitle="t('shell.noteWorkspace.recent')"
    >
      <template #actions>
        <span
          class="rounded-full bg-muted/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
          data-testid="note-capsule-count"
        >
          {{ totalCount }}
        </span>
      </template>

      <div class="relative mt-2">
        <Search
          class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          v-model="query"
          class="h-8 pl-8 text-xs"
          :placeholder="t('shell.noteWorkspace.searchPlaceholder')"
          data-testid="note-capsule-search"
        />
      </div>
    </CapsulePreviewHeader>

    <CapsulePreviewState
      v-if="isLoading && recentNotes.notes.value.length === 0"
      kind="loading"
      data-testid="note-capsule-loading"
    >
      <div v-for="i in 4" :key="i" class="h-10 animate-pulse rounded-lg bg-muted/70" />
    </CapsulePreviewState>

    <CapsulePreviewState
      v-else-if="emailVerificationRequired"
      kind="info"
      data-testid="note-capsule-email-verification"
    >
      <p class="text-[11px] font-medium text-foreground">
        {{ verificationDegradeMessage ?? t('common.emailVerificationRequired') }}
      </p>
      <p class="text-[10px] text-muted-foreground">
        {{ t('common.emailVerificationRequiredHint') }}
      </p>
    </CapsulePreviewState>

    <CapsulePreviewState v-else-if="localError" kind="error" data-testid="note-capsule-error">
      <p class="max-w-64 text-[11px] leading-4 text-muted-foreground">{{ localError }}</p>
      <button
        type="button"
        class="text-[11px] font-medium text-primary"
        data-testid="note-capsule-retry"
        @click="load(true)"
      >
        {{ t('common.retry') }}
      </button>
    </CapsulePreviewState>

    <CapsulePreviewState
      v-else-if="filtered.length === 0"
      kind="empty"
      data-testid="note-capsule-empty"
    >
      <FileText class="h-6 w-6 text-muted-foreground/45" />
      <p class="text-[11px] text-muted-foreground">
        {{ query.trim() ? t('shell.noteWorkspace.noMatches') : t('shell.preview.noteEmpty') }}
      </p>
    </CapsulePreviewState>

    <ul
      v-else
      class="min-h-0 flex-1 space-y-0.5 overflow-y-auto py-1.5 pr-0.5"
      data-testid="note-capsule-list"
    >
      <li v-for="item in filtered" :key="item.id">
        <button
          type="button"
          class="group flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/55"
          :data-testid="'note-capsule-item-' + item.id"
          @click="$emit('select', String(item.id))"
        >
          <FileText class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1">
            <span class="flex min-w-0 items-center gap-1.5">
              <span class="min-w-0 flex-1 truncate text-[11px] font-medium leading-4">
                {{ titleOf(item) }}
              </span>
              <Link2
                v-if="item.knowledgeDocumentId"
                class="h-3 w-3 shrink-0 text-muted-foreground/70"
                :aria-label="t('shell.noteWorkspace.stableReference')"
              />
            </span>
            <span class="mt-0.5 block truncate text-[10px] text-muted-foreground">
              {{ item.path || t('shell.preview.noteResource') }}
            </span>
          </span>
        </button>
      </li>
    </ul>

    <CapsulePreviewFooter>
      <button
        type="button"
        class="flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        data-testid="note-capsule-view-all"
        @click="$emit('view-all')"
      >
        {{ t('shell.noteWorkspace.viewAll') }}
        <ArrowRight class="h-3.5 w-3.5" />
      </button>
    </CapsulePreviewFooter>
  </CapsulePreviewShell>
</template>
