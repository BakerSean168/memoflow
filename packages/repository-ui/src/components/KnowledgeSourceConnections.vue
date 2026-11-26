<template>
  <main class="h-full overflow-auto bg-background" data-testid="knowledge-connection-workspace">
    <div class="mx-auto w-full max-w-3xl space-y-8 px-5 py-7 sm:px-8 sm:py-10">
      <header class="space-y-2">
        <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {{ t('repository.hub.webLabel') }}
        </p>
        <h1 class="text-xl font-semibold tracking-tight">{{ t('repository.hub.title') }}</h1>
        <p class="max-w-xl text-sm leading-6 text-muted-foreground">
          {{ t('repository.hub.webDescription') }}
        </p>
      </header>
      <section
        class="rounded-xl border border-border/70 p-5"
        aria-labelledby="knowledge-source-title"
      >
        <div class="flex items-center justify-between gap-3">
          <h2 id="knowledge-source-title" class="flex items-center gap-2 text-sm font-medium">
            <GitBranch class="h-4 w-4" />{{ t('repository.hub.githubSource') }}
          </h2>
          <span class="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{{
            t('repository.hub.readOnly')
          }}</span>
        </div>
        <p v-if="!loaded" class="mt-5 text-sm text-muted-foreground" role="status">
          {{ t('common.loading') }}
        </p>
        <div
          v-else-if="notConfigured"
          class="mt-5 space-y-2"
          data-testid="knowledge-not-configured"
        >
          <p class="text-sm font-medium">{{ t('repository.hub.unavailableTitle') }}</p>
          <p class="text-sm leading-6 text-muted-foreground">
            {{ t('repository.hub.unavailableDescription') }}
          </p>
        </div>
        <div
          v-else-if="!connections.length"
          class="mt-5 space-y-3"
          data-testid="knowledge-not-connected"
        >
          <p class="text-sm text-muted-foreground">{{ t('repository.hub.webEmpty') }}</p>
          <Button :disabled="busy || pending" @click="connect"
            ><Link2 class="mr-2 h-4 w-4" />{{ t('repository.hub.connectGitHub') }}</Button
          >
        </div>
        <div
          v-for="connection in connections"
          :key="connection.id"
          class="mt-5 border-t border-border/60 pt-5 first:border-t-0"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 space-y-1">
              <a
                class="break-all text-sm font-medium underline-offset-4 hover:underline"
                :href="repositoryUrl(connection)"
                target="_blank"
                rel="noopener noreferrer"
                >{{
                  connection.observation?.repositoryFullName ??
                  connection.repositoryFullNameSnapshot
                }}</a
              >
              <p class="text-xs text-muted-foreground">
                {{ connection.observation?.defaultBranch ?? '—' }} ·
                {{
                  t(
                    `setting.knowledgeRepository.projectionStatus.${connection.projectionCheckpoint?.state ?? 'Unknown'}`,
                  )
                }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                :disabled="busy"
                :title="t('repository.hub.refresh')"
                :aria-label="t('repository.hub.refresh')"
                @click="refresh(connection)"
                ><RefreshCw class="h-4 w-4" :class="{ 'animate-spin': busy }"
              /></Button>
              <Button
                variant="ghost"
                size="icon"
                :disabled="busy"
                :title="t('repository.localVault.detach')"
                :aria-label="t('repository.localVault.detach')"
                @click="disconnect(connection)"
                ><Unplug class="h-4 w-4"
              /></Button>
            </div>
          </div>
          <p
            v-if="connection.observation?.eligibility.state === 'Blocked'"
            class="mt-3 text-sm text-amber-700 dark:text-amber-400"
            role="status"
          >
            {{
              t(
                `setting.knowledgeRepository.providerBlockReason.${connection.observation.eligibility.reason}`,
              )
            }}
          </p>
        </div>
        <p v-if="pending" class="mt-4 text-sm text-muted-foreground" role="status">
          {{ t('setting.knowledgeRepository.installationPending') }}
          <Button variant="ghost" size="sm" @click="cancelAuthorization">{{
            t('repository.hub.cancelAuthorization')
          }}</Button>
        </p>
        <div v-if="repositories.length" class="mt-5 space-y-2 border-t border-border/60 pt-4">
          <h3 class="text-sm font-medium">{{ t('repository.hub.chooseRepository') }}</h3>
          <div
            v-for="repository in repositories"
            :key="repository.id"
            class="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"
          >
            <span class="min-w-0 break-all text-sm">{{ repository.fullName }}</span>
            <Button
              size="sm"
              variant="outline"
              :disabled="busy || !canConnect(repository)"
              @click="choose(repository)"
              >{{ t('repository.hub.connect') }}</Button
            >
          </div>
          <p class="text-xs text-muted-foreground">
            {{ t('repository.hub.privateRepositoryHint') }}
          </p>
        </div>
        <div
          v-if="error"
          class="mt-4 flex items-center justify-between gap-3 text-sm text-destructive"
          role="alert"
        >
          <p>{{ error }}</p>
          <Button variant="ghost" size="sm" :disabled="busy" @click="reload">{{
            t('common.retry')
          }}</Button>
        </div>
      </section>
      <section
        v-if="linkedNote"
        class="rounded-xl border border-border/70 p-5"
        data-testid="knowledge-linked-note"
      >
        <p class="text-sm font-medium">{{ linkedNote.title }}</p>
        <p class="mt-1 break-all text-xs text-muted-foreground">{{ linkedNote.path }}</p>
        <a
          :href="linkedNote.url"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-3 inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
          >{{ t('repository.hub.openGitHub') }}<ExternalLink class="h-4 w-4"
        /></a>
      </section>
      <p v-else-if="linkedNoteError" class="px-1 text-sm text-muted-foreground" role="status">
        {{ linkedNoteError }}
      </p>
      <section class="space-y-3 px-1">
        <h2 class="flex items-center gap-2 text-sm font-medium">
          <AtSign class="h-4 w-4" />{{ t('repository.hub.contextTitle') }}
        </h2>
        <p class="text-sm leading-6 text-muted-foreground">
          {{ t('repository.hub.contextDescription') }}
        </p>
        <p class="text-xs leading-5 text-muted-foreground">{{ t('repository.hub.webSyncHint') }}</p>
      </section>
    </div>
  </main>
</template>
<script setup lang="ts">
import { inject, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { repositoryUiHost } from '../repository-ui-host';
import { useI18n } from 'vue-i18n';
import { AtSign, ExternalLink, GitBranch, Link2, RefreshCw, Unplug } from '@lucide/vue';
import { Button } from '@memoflow/ui-vue-shadcn';
import type { KnowledgeRemoteBindingClientDTO } from '@memoflow/repository-contracts';
import { useGitHubKnowledgeConnection } from '../composables/useGitHubKnowledgeConnection';
const { t } = useI18n();
const route = useRoute();
const service = inject(repositoryUiHost.REPOSITORY_SERVICE_KEY)!;
const linkedNote = ref<{ title: string; path: string; url: string } | null>(null);
const linkedNoteError = ref('');
let active = true;
let epoch = 0;
const {
  connections,
  repositories,
  pending,
  busy,
  loaded,
  notConfigured,
  error,
  connect,
  canConnect,
  choose,
  refresh,
  disconnect,
  reload,
  cancelAuthorization,
} = useGitHubKnowledgeConnection();
function repositoryUrl(connection: KnowledgeRemoteBindingClientDTO) {
  const name = connection.observation?.repositoryFullName ?? connection.repositoryFullNameSnapshot;
  return `https://github.com/${name.split('/').map(encodeURIComponent).join('/')}`;
}
async function resolveLinkedNote() {
  const generation = ++epoch;
  linkedNote.value = null;
  linkedNoteError.value = '';
  const reference = route.query.note;
  if (!active || route.name !== 'repository' || typeof reference !== 'string') return;
  try {
    const result = await service.resolveKnowledgeNoteReference({ reference });
    if (!active || generation !== epoch) return;
    if (!result.ok) {
      linkedNoteError.value = t('repository.hub.noteUnavailable');
      return;
    }
    const note = result.data;
    const connection = connections.value.find((item) => item.id === note.connectionId);
    if (!connection) return;
    linkedNote.value = {
      title: note.title,
      path: note.relativePath,
      url: `${repositoryUrl(connection)}/blob/${encodeURIComponent(note.commitSha)}/${note.relativePath.split('/').map(encodeURIComponent).join('/')}`,
    };
  } catch {
    if (active && generation === epoch) linkedNoteError.value = t('repository.hub.noteUnavailable');
  }
}
watch(
  () => [route.query.note, connections.value],
  () => {
    void resolveLinkedNote();
  },
  { immediate: true },
);
onActivated(() => {
  active = true;
  void resolveLinkedNote();
});
onDeactivated(() => {
  active = false;
  epoch += 1;
});
onBeforeUnmount(() => {
  active = false;
  epoch += 1;
});
</script>
