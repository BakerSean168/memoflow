import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useConfirm } from '@memoflow/ui-vue-shadcn';
import {
  isKnowledgeRepositoryNotConfiguredFailure,
  type GitHubInstallationRepositoryDTO,
  type KnowledgeRemoteBindingClientDTO,
} from '@memoflow/repository-contracts';
import { unwrapOrThrowError } from '@memoflow/transport-contracts/result';
import { repositoryUiHost } from '../repository-ui-host';

const INTENT_KEY = 'memoflow:knowledge-repository:web-installation-intent';

/** Connection management only. Repository content is always read-only on Web. */
export function useGitHubKnowledgeConnection() {
  const service = repositoryUiHost.useStrictInject(
    repositoryUiHost.REPOSITORY_SERVICE_KEY,
    'RepositoryService',
  );
  const route = useRoute();
  const router = useRouter();
  const { t } = useI18n();
  const connections = ref<KnowledgeRemoteBindingClientDTO[]>([]);
  const repositories = ref<GitHubInstallationRepositoryDTO[]>([]);
  const installationId = ref<string | null>(null);
  const pending = ref(false);
  const busy = ref(false);
  const loaded = ref(false);
  const notConfigured = ref(false);
  const error = ref('');
  let generation = 0;
  let disposed = false;
  let active = true;
  let popup: Window | null = null;

  function remembered(value?: string | null): string | null {
    try {
      if (value === null) sessionStorage.removeItem(INTENT_KEY);
      else if (value !== undefined) sessionStorage.setItem(INTENT_KEY, value);
      return sessionStorage.getItem(INTENT_KEY);
    } catch {
      return null;
    }
  }
  function closePopup() {
    try {
      popup?.close();
    } catch {
      /* Provider popup may already be closed. */
    }
    popup = null;
  }
  function report(failure: unknown) {
    error.value = repositoryUiHost.translateResultError(failure, t, {
      fallbackKey: 'common.operationFailed',
    });
  }
  function isCurrent(epoch: number) {
    return !disposed && active && epoch === generation;
  }
  async function action(work: (epoch: number) => Promise<void>) {
    if (busy.value || disposed || !active) return;
    const epoch = generation;
    busy.value = true;
    error.value = '';
    try {
      await work(epoch);
    } catch (failure) {
      if (isCurrent(epoch)) report(failure);
    } finally {
      if (isCurrent(epoch)) busy.value = false;
    }
  }
  async function load(epoch: number) {
    const result = await service.listKnowledgeRepositoryConnections();
    if (!isCurrent(epoch)) return;
    loaded.value = true;
    if (!result.ok && isKnowledgeRepositoryNotConfiguredFailure(result.error)) {
      notConfigured.value = true;
      connections.value = [];
      error.value = '';
      return;
    }
    if (!result.ok) throw unwrapOrThrowError(result);
    notConfigured.value = false;
    connections.value = result.data.connections.filter((connection) => !connection.disconnectedAt);
  }
  async function finalize(intentId: string, epoch = generation) {
    const result = await service.finalizeKnowledgeRepositoryInstallationIntent(intentId);
    if (!isCurrent(epoch)) return;
    if (!result.ok) throw unwrapOrThrowError(result);
    installationId.value = result.data.installationId;
    repositories.value = result.data.repositories;
    pending.value = false;
    closePopup();
  }
  async function poll(intentId: string, expiresAt: number, epoch: number) {
    if (!isCurrent(epoch)) return;
    pending.value = true;
    try {
      while (isCurrent(epoch) && Date.now() < expiresAt) {
        const result = await service.getKnowledgeRepositoryInstallationIntentStatus(intentId);
        if (!isCurrent(epoch)) return;
        if (result.ok) {
          if (['CallbackReceived', 'Finalized'].includes(result.data.status)) {
            await finalize(intentId, epoch);
            return;
          }
          if (result.data.status === 'Consumed') {
            pending.value = false;
            remembered(null);
            closePopup();
            await load(epoch);
            return;
          }
          if (result.data.status === 'Expired') break;
        } else if (!['SERVICE_UNAVAILABLE', 'RATE_LIMITED'].includes(result.error.code)) {
          throw unwrapOrThrowError(result);
        }
        if (popup?.closed) {
          cancelAuthorization();
          return;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 1500));
      }
      if (isCurrent(epoch)) {
        pending.value = false;
        remembered(null);
        closePopup();
        error.value = t('setting.knowledgeRepository.installationExpired');
      }
    } catch (failure) {
      if (isCurrent(epoch)) {
        pending.value = false;
        closePopup();
        report(failure);
      }
    }
  }
  function cancelAuthorization() {
    generation += 1;
    busy.value = false;
    pending.value = false;
    remembered(null);
    closePopup();
  }
  async function connect() {
    if (busy.value || pending.value || notConfigured.value || !active || disposed) return;
    // Open in the click stack so browser popup protection does not swallow authorization.
    generation += 1;
    repositories.value = [];
    installationId.value = null;
    popup = window.open(
      'about:blank',
      'memoflow-github-installation',
      'popup=yes,width=900,height=720,resizable=yes,scrollbars=yes',
    );
    if (!popup) {
      error.value = t('setting.knowledgeRepository.popupBlocked');
      return;
    }
    await action(async (epoch) => {
      const result = await service.startKnowledgeRepositoryInstallation({
        clientKind: 'web',
        returnUrl: new URL(router.resolve('/repository').href, window.location.origin).toString(),
      });
      if (!isCurrent(epoch)) return;
      if (!result.ok) {
        closePopup();
        if (isKnowledgeRepositoryNotConfiguredFailure(result.error)) {
          notConfigured.value = true;
          return;
        }
        throw unwrapOrThrowError(result);
      }
      remembered(result.data.intentId);
      if (result.data.requiresExternalBrowser === false) {
        await finalize(result.data.intentId, epoch);
        return;
      }
      if (!popup || popup.closed) throw new Error(t('setting.knowledgeRepository.popupBlocked'));
      popup.location.replace(result.data.installationUrl);
      void poll(result.data.intentId, result.data.expiresAt, epoch);
    });
    if (error.value) closePopup();
  }
  function canConnect(repository: GitHubInstallationRepositoryDTO) {
    return (
      repository.private &&
      !repository.archived &&
      !repository.disabled &&
      repository.permissions.pull
    );
  }
  async function choose(repository: GitHubInstallationRepositoryDTO) {
    if (pending.value || !installationId.value || !canConnect(repository)) return;
    await action(async (epoch) => {
      const result = await service.connectKnowledgeRepository({
        installationId: installationId.value!,
        githubRepositoryId: repository.id,
      });
      if (!isCurrent(epoch)) return;
      if (!result.ok) throw unwrapOrThrowError(result);
      repositories.value = [];
      installationId.value = null;
      remembered(null);
      if (isCurrent(epoch)) await load(epoch);
    });
  }
  async function refresh(connection: KnowledgeRemoteBindingClientDTO) {
    await action(async (epoch) => {
      const result = await service.refreshKnowledgeRepositoryObservation(connection.id);
      if (!isCurrent(epoch)) return;
      if (!result.ok) throw unwrapOrThrowError(result);
      connections.value = connections.value.map((item) =>
        item.id === connection.id ? result.data : item,
      );
    });
  }
  async function disconnect(connection: KnowledgeRemoteBindingClientDTO) {
    if (
      !(await useConfirm({
        title: t('repository.hub.disconnectTitle'),
        description: t('repository.hub.disconnectDescription'),
        confirmText: t('repository.localVault.detach'),
        cancelText: t('common.cancel'),
      }))
    )
      return;
    await action(async (epoch) => {
      const result = await service.disconnectKnowledgeRepository(connection.id, false);
      if (!result.ok) throw unwrapOrThrowError(result);
      if (isCurrent(epoch)) await load(epoch);
    });
  }
  async function restore(epoch: number) {
    if (!isCurrent(epoch)) return;
    const callbackKeys = [
      'installation_intent',
      'state',
      'installation_id',
      'setup_action',
    ] as const;
    const callback = callbackKeys.map((key) => route.query[key]);
    const queryIntent =
      typeof route.query.installation_intent === 'string' ? route.query.installation_intent : null;
    const legacyCallback =
      typeof route.query.state === 'string' && typeof route.query.installation_id === 'string';
    const intent = queryIntent ?? (legacyCallback ? null : remembered());
    if (intent) {
      remembered(intent);
      const status = await service.getKnowledgeRepositoryInstallationIntentStatus(intent);
      if (!isCurrent(epoch)) return;
      if (status.ok) {
        if (['CallbackReceived', 'Finalized'].includes(status.data.status))
          await finalize(intent, epoch);
        else if (status.data.status === 'Pending') void poll(intent, status.data.expiresAt, epoch);
        else {
          remembered(null);
          await load(epoch);
        }
      } else if (['NOT_FOUND', 'VALIDATION_ERROR'].includes(status.error.code)) remembered(null);
      else throw unwrapOrThrowError(status);
    } else if (
      typeof route.query.state === 'string' &&
      typeof route.query.installation_id === 'string'
    ) {
      const result = await service.completeKnowledgeRepositoryInstallation({
        state: route.query.state,
        installationId: route.query.installation_id,
        setupAction: route.query.setup_action === 'update' ? 'update' : 'install',
      });
      if (!isCurrent(epoch)) return;
      if (!result.ok) throw unwrapOrThrowError(result);
      installationId.value = result.data.installationId;
      repositories.value = result.data.repositories;
    }
    if (
      !isCurrent(epoch) ||
      callbackKeys.some((key, index) => route.query[key] !== callback[index])
    )
      return;
    const query = { ...route.query };
    for (const key of callbackKeys) delete query[key];
    if (Object.keys(query).length !== Object.keys(route.query).length)
      await router.replace({ query });
  }
  function reload() {
    return action(async (epoch) => {
      await load(epoch);
      if (isCurrent(epoch) && !notConfigured.value) await restore(epoch);
    });
  }
  onMounted(() => {
    void reload();
  });
  onActivated(() => {
    if (!active) {
      active = true;
      void reload();
    }
  });
  onDeactivated(() => {
    active = false;
    generation += 1;
    busy.value = false;
    pending.value = false;
    closePopup();
  });
  onBeforeUnmount(() => {
    disposed = true;
    generation += 1;
    closePopup();
  });
  return {
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
    cancelAuthorization,
    reload,
  };
}
