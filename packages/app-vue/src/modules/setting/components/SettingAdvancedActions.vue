<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between">
      <CardTitle class="flex items-center">
        <Settings2 class="h-5 w-5 mr-2" />
        {{ t('setting.advanced.title') }}
      </CardTitle>
    </CardHeader>

    <Separator />

    <CardContent class="p-4 space-y-6">
      <!-- Export/Import Settings -->
      <div class="grid grid-cols-1 gap-3 @2xl/panel:grid-cols-2">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" class="w-full">
              <Download class="h-4 w-4 mr-2" />
              {{ t('setting.advanced.exportSettings') }}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem @click="emit('exportJSON')">
              <FileJson class="h-4 w-4 mr-2" />
              {{ t('setting.advanced.exportJSON') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="emit('exportCSV')">
              <FileText class="h-4 w-4 mr-2" />
              {{ t('setting.advanced.exportCSV') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" class="w-full" @click="emit('import')">
          <Upload class="h-4 w-4 mr-2" />
          {{ t('setting.advanced.importSettings') }}
        </Button>
      </div>

      <!-- Importable business-data backup. This is not a server-data disclosure export. -->
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
            <Download class="h-4 w-4 mr-2" />
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
            <Upload class="h-4 w-4 mr-2" />
            {{
              importingData
                ? t('setting.advanced.importingPortableData')
                : t('setting.advanced.importPortableData')
            }}
          </Button>
        </div>
      </div>

      <!-- Server-only, read-only disclosure. It has no import route. -->
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
          <Download class="h-4 w-4 mr-2" />
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

      <!-- Backup & Restore -->
      <div class="grid grid-cols-1 gap-3 @2xl/panel:grid-cols-2">
        <Button variant="outline" class="w-full" @click="emit('createBackup')">
          <Save class="h-4 w-4 mr-2" />
          {{ t('setting.advanced.createBackup') }}
        </Button>

        <DropdownMenu v-if="backups && backups.length > 0">
          <DropdownMenuTrigger as-child>
            <Button variant="outline" class="w-full">
              <RotateCcw class="h-4 w-4 mr-2" />
              {{ t('setting.advanced.restoreBackup') }}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              v-for="backup in backups"
              :key="backup.key"
              @click="emit('restoreBackup', backup.key)"
            >
              <div class="flex flex-col">
                <span>{{ backup.label }}</span>
                <span class="text-xs text-muted-foreground">{{ formatProductDateTime(backup.time) }}</span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button v-else variant="outline" class="w-full" disabled>
          <RotateCcw class="h-4 w-4 mr-2" />
          {{ t('setting.advanced.restoreBackupNoBackups') }}
        </Button>
      </div>

      <Separator />

      <!-- Cloud Sync -->
      <div class="space-y-4">
        <h3 class="text-sm font-medium flex items-center">
          <Cloud class="h-4 w-4 mr-2" />
          {{ t('setting.advanced.cloudSync') }}
        </h3>

        <div class="grid grid-cols-1 gap-3 @2xl/panel:grid-cols-2">
          <Button variant="outline" class="w-full" :disabled="syncing" @click="emit('cloudSync')">
            <CloudUpload class="h-4 w-4 mr-2" />
            {{ syncing ? t('setting.advanced.syncing') : t('setting.advanced.syncAllDevices') }}
          </Button>

          <Button variant="outline" class="w-full" @click="emit('showVersionHistory')">
            <History class="h-4 w-4 mr-2" />
            {{ t('setting.advanced.viewVersionHistory') }}
          </Button>
        </div>

        <!-- Sync Status -->
        <Card v-if="syncStatus" variant="outline">
          <CardContent class="pt-6">
            <div class="space-y-2">
              <div class="text-xs text-muted-foreground">
                {{ t('setting.advanced.lastSynced') }}
              </div>
              <div class="text-sm">{{ formatProductDateTime(syncStatus.lastSyncedAt) }}</div>
              <Progress :value="(syncStatus.versionCount / 20) * 100" class="h-2" />
              <div class="text-xs">
                {{ t('setting.advanced.version') }}: {{ syncStatus.versionCount }}/20
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@memoflow/ui-vue-shadcn';
import { Button } from '@memoflow/ui-vue-shadcn';
import { Separator } from '@memoflow/ui-vue-shadcn';
import { Progress } from '@memoflow/ui-vue-shadcn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@memoflow/ui-vue-shadcn';
import {
  Settings2,
  Download,
  Upload,
  Save,
  RotateCcw,
  Cloud,
  CloudUpload,
  History,
  FileJson,
  FileText,
} from '@lucide/vue';
import { formatProductDateTime } from '../../../shared/utils/product-time';

const { t } = useI18n();

interface SyncStatus {
  lastSyncedAt: number;
  versionCount: number;
  hasConflicts: boolean;
}

interface Backup {
  key: string;
  label: string;
  time: number;
}

interface Props {
  backups?: Backup[];
  syncStatus?: SyncStatus | null;
  syncing?: boolean;
  exportingData?: boolean;
  importingData?: boolean;
  dataPortabilityAvailable?: boolean;
  serverDataDisclosureAvailable?: boolean;
  exportingServerDataDisclosure?: boolean;
  dataPortabilityResult?: string | null;
}

defineProps<Props>();

const emit = defineEmits<{
  exportJSON: [];
  exportCSV: [];
  import: [];
  exportAllData: [];
  exportServerDataDisclosure: [];
  importAllData: [];
  createBackup: [];
  restoreBackup: [key: string];
  cloudSync: [];
  showVersionHistory: [];
}>();

</script>
