<template>
  <Card data-testid="data-transfer-actions">
    <CardHeader>
      <CardTitle class="flex items-center">
        <DatabaseBackup class="mr-2 h-5 w-5" />
        {{ t('setting.advanced.title') }}
      </CardTitle>
    </CardHeader>

    <CardContent class="space-y-6 p-4">
      <div class="space-y-2">
        <p class="text-xs leading-5 text-muted-foreground">
          {{ t('setting.advanced.preferenceDataDescription') }}
        </p>
        <div class="grid grid-cols-1 gap-3 @2xl/panel:grid-cols-2">
          <Button variant="outline" class="w-full" @click="emit('exportJSON')">
            <Download class="mr-2 h-4 w-4" />
            {{ t('setting.advanced.exportSettings') }}
          </Button>
          <Button variant="outline" class="w-full" @click="emit('import')">
            <Upload class="mr-2 h-4 w-4" />
            {{ t('setting.advanced.importSettings') }}
          </Button>
        </div>
      </div>

      <div v-if="dataPortabilityAvailable" class="space-y-2">
        <p class="text-xs leading-5 text-muted-foreground" data-testid="portable-data-scope">
          {{ t('setting.advanced.portableDataDescription') }}
        </p>
        <div class="grid grid-cols-1 gap-3 @2xl/panel:grid-cols-2">
          <Button
            variant="outline"
            class="w-full"
            :disabled="exportingData"
            @click="emit('exportAllData')"
          >
            <Download class="mr-2 h-4 w-4" />
            {{
              exportingData
                ? t('setting.advanced.exportingPortableData')
                : t('setting.advanced.exportPortableData')
            }}
          </Button>
          <Button
            variant="outline"
            class="w-full"
            :disabled="importingData"
            @click="emit('importAllData')"
          >
            <Upload class="mr-2 h-4 w-4" />
            {{
              importingData
                ? t('setting.advanced.importingPortableData')
                : t('setting.advanced.importPortableData')
            }}
          </Button>
        </div>
      </div>

      <div v-if="serverDataDisclosureAvailable" class="space-y-2">
        <p class="text-xs leading-5 text-muted-foreground" data-testid="server-data-scope">
          {{ t('setting.advanced.serverDataDisclosureDescription') }}
        </p>
        <Button
          variant="outline"
          class="w-full"
          :disabled="exportingServerDataDisclosure"
          @click="emit('exportServerDataDisclosure')"
        >
          <Download class="mr-2 h-4 w-4" />
          {{
            exportingServerDataDisclosure
              ? t('setting.advanced.exportingServerDataDisclosure')
              : t('setting.advanced.exportServerDataDisclosure')
          }}
        </Button>
      </div>

      <p v-if="dataPortabilityResult" class="text-xs text-muted-foreground">
        {{ dataPortabilityResult }}
      </p>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@memoflow/ui-vue-shadcn';
import { DatabaseBackup, Download, Upload } from '@lucide/vue';

const { t } = useI18n();

defineProps<{
  exportingData?: boolean;
  importingData?: boolean;
  dataPortabilityAvailable?: boolean;
  serverDataDisclosureAvailable?: boolean;
  exportingServerDataDisclosure?: boolean;
  dataPortabilityResult?: string | null;
}>();

const emit = defineEmits<{
  exportJSON: [];
  import: [];
  exportAllData: [];
  exportServerDataDisclosure: [];
  importAllData: [];
}>();
</script>
