<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-[600px]" :aria-describedby="undefined">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2 font-semibold">
          <Download class="h-5 w-5" />
          {{ t('goal.exportDialog.title') }}
        </DialogTitle>
      </DialogHeader>

      <Separator />

      <div class="space-y-4 pt-2">
        <div>
          <Label>{{ t('goal.exportDialog.format') }}</Label>
          <Select v-model="format">
            <SelectTrigger class="mt-1.5">
              <SelectValue :placeholder="t('goal.exportDialog.format')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="option in formatOptions" :key="option.value" :value="option.value">
                <div class="flex items-center gap-2">
                  <component :is="option.icon" class="h-4 w-4" />
                  <div>
                    <div>{{ option.title }}</div>
                    <div class="text-xs text-muted-foreground">{{ option.description }}</div>
                  </div>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div v-if="format === 'png'">
          <Label>{{ t('goal.exportDialog.resolution') }}</Label>
          <Select v-model="resolution">
            <SelectTrigger class="mt-1.5">
              <SelectValue :placeholder="t('goal.exportDialog.resolution')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in resolutionOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.title }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>{{ t('goal.exportDialog.bgColor') }}</Label>
          <Select v-model="backgroundColor">
            <SelectTrigger class="mt-1.5">
              <SelectValue :placeholder="t('goal.exportDialog.bgColor')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="option in bgOptions" :key="option.value" :value="option.value">
                {{ option.title }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div v-if="format === 'pdf'" class="flex items-center space-x-2">
          <Checkbox id="include-metadata" v-model="includeMetadata" />
          <Label for="include-metadata" class="text-sm font-normal cursor-pointer">
            {{ t('goal.exportDialog.includeMetadata') }}
          </Label>
        </div>

        <Alert v-if="format === 'svg'">
          <Info class="h-4 w-4" />
          <AlertTitle>{{ t('goal.exportDialog.svgNote') }}</AlertTitle>
          <AlertDescription> {{ t('goal.exportDialog.svgNoteDesc') }} </AlertDescription>
        </Alert>
      </div>

      <Separator />

      <DialogFooter>
        <Button variant="outline" @click="close">{{ t('goal.exportDialog.cancel') }}</Button>
        <Button :disabled="isExporting" @click="handleExport">
          <Loader2 v-if="isExporting" class="mr-2 h-4 w-4 animate-spin" />
          <Download v-else class="mr-2 h-4 w-4" />
          {{ isExporting ? t('goal.exportDialog.exporting') : t('goal.exportDialog.export') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ExportOptions } from '../../utils/dag-export';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Separator,
  Button,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Checkbox,
  Label,
  Alert,
  AlertTitle,
  AlertDescription,
} from '@memoflow/ui-vue-shadcn';
import { Download, Image, SquareDashedKanban, FileText, Info, Loader2 } from '@lucide/vue';

const emit = defineEmits<{
  export: [options: ExportOptions];
}>();

const isOpen = ref(false);
const isExporting = ref(false);
const format = ref<'png' | 'svg' | 'pdf'>('png');
const resolution = ref<string>('2');
const backgroundColor = ref('white');
const includeMetadata = ref(true);

const { t } = useI18n();

const formatOptions = computed(() => [
  {
    title: t('goal.exportDialog.png'),
    value: 'png',
    icon: Image,
    description: t('goal.exportDialog.pngDesc'),
  },
  {
    title: t('goal.exportDialog.svg'),
    value: 'svg',
    icon: SquareDashedKanban,
    description: t('goal.exportDialog.svgDesc'),
  },
  {
    title: t('goal.exportDialog.pdf'),
    value: 'pdf',
    icon: FileText,
    description: t('goal.exportDialog.pdfDesc'),
  },
]);

const resolutionOptions = computed(() => [
  { title: t('goal.exportDialog.standard') + ' (1x)', value: '1' },
  { title: t('goal.exportDialog.hd') + ' (2x)', value: '2' },
  { title: t('goal.exportDialog.ultra') + ' (3x)', value: '3' },
]);

const bgOptions = computed(() => [
  { title: t('goal.exportDialog.bgWhite'), value: 'white' },
  { title: t('goal.exportDialog.bgTransparent'), value: 'transparent' },
]);

async function handleExport() {
  isExporting.value = true;

  try {
    emit('export', {
      format: format.value,
      resolution: Number(resolution.value) as 1 | 2 | 3,
      backgroundColor: backgroundColor.value,
      includeMetadata: includeMetadata.value,
    });
  } finally {
    // Keep loading state until parent confirms success/error
    setTimeout(() => {
      isExporting.value = false;
    }, 500);
  }
}

function open() {
  isOpen.value = true;
}

function close() {
  isOpen.value = false;
  isExporting.value = false;
}

defineExpose({ open, close });
</script>
