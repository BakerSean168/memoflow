<template>
  <div class="px-2 py-1.5">
    <Input
      v-model="query"
      class="h-8"
      :placeholder="t('goal.detail.searchKnowledge')"
      :disabled="disabled"
      @keydown.stop
    />
  </div>

  <DropdownMenuSeparator />

  <DropdownMenuItem v-if="loading" disabled>
    <Loader2 class="mr-2 h-4 w-4 animate-spin" />
    {{ t('common.loading') }}
  </DropdownMenuItem>

  <template v-else>
    <DropdownMenuCheckboxItem
      v-for="note in visibleCandidates"
      :key="note.documentId"
      :model-value="linkedIds.includes(note.documentId)"
      :disabled="disabled || savingDocumentId === note.documentId"
      @update:model-value="toggleKnowledge(note)"
      @select.prevent
    >
      <Loader2
        v-if="savingDocumentId === note.documentId"
        class="mr-2 h-3.5 w-3.5 animate-spin text-muted-foreground"
      />
      <FileText v-else class="mr-2 h-3.5 w-3.5 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate">{{ note.title }}</span>
    </DropdownMenuCheckboxItem>
  </template>

  <DropdownMenuItem v-if="!loading && visibleCandidates.length === 0" disabled>
    {{ query.trim() ? t('goal.detail.noKnowledgeMatches') : t('goal.detail.noStableKnowledge') }}
  </DropdownMenuItem>

  <DropdownMenuSeparator />
  <DropdownMenuItem @click="openKnowledge">
    <BookOpen class="mr-2 h-4 w-4 text-muted-foreground" />
    {{ t('goal.detail.openKnowledgeToManage') }}
  </DropdownMenuItem>

  <p v-if="displayErrorMessage" class="px-2 py-1.5 text-xs text-destructive" role="alert">
    {{ displayErrorMessage }}
  </p>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { BookOpen, FileText, Loader2 } from '@lucide/vue';
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Input,
} from '@memoflow/ui-vue-shadcn';
import {
  GoalKnowledgeLinkReqSchema,
  GoalKnowledgeListReqSchema,
} from '@memoflow/contracts/relation';
import { GOAL_KNOWLEDGE_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { useReferenceableKnowledgeNotes } from '../../repository/composables/useReferenceableKnowledgeNotes';

interface KnowledgeCandidate {
  documentId: string;
  knowledgeSpaceId: string;
  title: string;
}

const props = withDefaults(
  defineProps<{
    goalId: string;
    linkedDocumentIds: string[];
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{ changed: [] }>();
const { t } = useI18n();
const router = useRouter();
const relations = useStrictInject(GOAL_KNOWLEDGE_SERVICE_KEY, 'GoalKnowledgeService');
const referenceableKnowledge = useReferenceableKnowledgeNotes();

const linkedIds = ref<string[]>([...props.linkedDocumentIds]);
const savingDocumentId = ref<string | null>(null);
const errorMessage = ref('');
const query = ref('');
let searchTimer: ReturnType<typeof setTimeout> | null = null;

const loading = computed(() => referenceableKnowledge.isLoading.value);
const displayErrorMessage = computed(
  () => errorMessage.value || referenceableKnowledge.error.value || '',
);
const visibleCandidates = computed<KnowledgeCandidate[]>(() =>
  referenceableKnowledge.notes.value.slice(0, 24).map((note) => ({
    documentId: note.documentId,
    knowledgeSpaceId: note.knowledgeSpaceId,
    title: note.title,
  })),
);

async function loadLinkedKnowledge(): Promise<void> {
  const linkedResult = await relations.listGoalKnowledge(
    GoalKnowledgeListReqSchema.parse({ goalId: props.goalId }),
  );
  if (!linkedResult.ok) {
    errorMessage.value = linkedResult.error.message;
    return;
  }
  linkedIds.value = linkedResult.data.map((relation) => relation.knowledgeDocument.documentId);
}

async function loadCandidates(search = query.value): Promise<void> {
  errorMessage.value = '';
  await referenceableKnowledge.load({ query: search, limit: 24 });
}

async function toggleKnowledge(note: KnowledgeCandidate): Promise<void> {
  if (props.disabled || savingDocumentId.value) return;
  const request = GoalKnowledgeLinkReqSchema.parse({
    goalId: props.goalId,
    knowledgeDocument: {
      knowledgeSpaceId: note.knowledgeSpaceId,
      documentId: note.documentId,
    },
  });
  savingDocumentId.value = note.documentId;
  errorMessage.value = '';
  try {
    const wasLinked = linkedIds.value.includes(note.documentId);
    const result = wasLinked
      ? await relations.unlinkGoalKnowledge(request)
      : await relations.linkGoalKnowledge(request);
    if (!result.ok) {
      errorMessage.value = result.error.message;
      return;
    }
    linkedIds.value = wasLinked
      ? linkedIds.value.filter((id) => id !== note.documentId)
      : [...linkedIds.value, note.documentId];
    emit('changed');
  } finally {
    savingDocumentId.value = null;
  }
}

function openKnowledge(): void {
  void router.push('/repository');
}

watch(query, (value) => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTimer = null;
    void loadCandidates(value);
  }, 180);
});

onMounted(() => {
  void Promise.all([loadLinkedKnowledge(), loadCandidates()]);
});

onBeforeUnmount(() => {
  referenceableKnowledge.cancel();
  if (searchTimer) clearTimeout(searchTimer);
});
</script>
