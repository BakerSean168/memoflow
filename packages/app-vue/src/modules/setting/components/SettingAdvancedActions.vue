<template>
  <SettingsSection :title="t('setting.advanced.title')" test-id="data-transfer-actions">
    <SettingsPropertyRow
      :label="t('setting.advanced.exportSettings')"
      :description="t('setting.advanced.preferenceDataDescription')"
      layout="stacked"
    >
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
    </SettingsPropertyRow>

    <SettingsPropertyRow
      v-if="dataPortabilityAvailable"
      :label="t('setting.advanced.exportPortableData')"
      :description="t('setting.advanced.portableDataDescription')"
      layout="stacked"
      test-id="portable-data-scope"
    >
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
    </SettingsPropertyRow>

    <SettingsPropertyRow
      v-if="serverDataDisclosureAvailable"
      :label="t('setting.advanced.exportServerDataDisclosure')"
      :description="t('setting.advanced.serverDataDisclosureDescription')"
      layout="stacked"
      test-id="server-data-scope"
    >
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
    </SettingsPropertyRow>

    <SettingsStatusBlock
      v-if="dataPortabilityResult"
      kind="info"
      :description="dataPortabilityResult"
      class="mt-4"
    />
  </SettingsSection>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button } from '@memoflow/ui-vue-shadcn';
import { Download, Upload } from '@lucide/vue';
import {
  SettingsPropertyRow,
  SettingsSection,
  SettingsStatusBlock,
} from '../../../components/shared/settings';

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
