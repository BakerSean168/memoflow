<template>
  <Dialog :open="modelValue" @update:open="(v) => emit('update:modelValue', v)">
    <DialogContent class="max-w-[800px]" @interact-outside.prevent>
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <LayoutGrid class="h-5 w-5 text-primary" />
          {{ t('task.templateSelection.title') }}
        </DialogTitle>
      </DialogHeader>

      <div class="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4 py-4">
        <div v-if="loading" class="col-span-full text-center py-8">
          <Loader2 class="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
          <p class="text-base">{{ t('task.templateSelection.loading') }}</p>
        </div>

        <div v-else-if="templates.length === 0" class="col-span-full text-center py-8">
          <FolderOpen class="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <p class="text-base text-muted-foreground">
            {{ t('task.templateSelection.noTemplates') }}
          </p>
        </div>

        <Card
          v-else
          v-for="template in templates"
          :key="template.id"
          class="cursor-pointer transition-all duration-300 border-2 hover:shadow-md"
          :class="selectedId === template.id ? 'border-primary bg-primary/5' : 'border-transparent'"
          @click="selectedId = template.id"
        >
          <CardContent class="text-center p-4">
            <div
              class="h-16 w-16 rounded-full bg-primary flex items-center justify-center mx-auto mb-3"
            >
              <FileText class="h-8 w-8 text-primary-foreground" />
            </div>
            <h3 class="text-lg font-semibold mb-2">{{ template.title }}</h3>
            <p class="text-sm text-muted-foreground">
              {{ template.description || t('task.templateSelection.noDescription') }}
            </p>
          </CardContent>
        </Card>
      </div>

      <DialogFooter>
        <div class="flex-1" />
        <Button variant="ghost" @click="emit('cancel')">{{
          t('task.templateSelection.cancel')
        }}</Button>
        <Button :disabled="!selectedId" @click="confirmSelection">
          {{ t('task.templateSelection.useTemplate') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Card,
  CardContent,
  Button,
} from '@memoflow/ui-vue-shadcn';
import { LayoutGrid, Loader2, FolderOpen, FileText } from '@lucide/vue';
import type { TaskPlanViewModel } from '../types';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    templates: TaskPlanViewModel[];
    loading?: boolean;
  }>(),
  {
    loading: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [templateId: string];
  cancel: [];
}>();

const selectedId = ref('');

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      selectedId.value = '';
    }
  },
);

const confirmSelection = () => {
  if (!selectedId.value) return;
  emit('confirm', selectedId.value);
};
</script>
