/**
 * Desktop Platform DI — IPC Adapter Injection
 */
import type { App } from 'vue';
import { ref } from 'vue';
import { createResultIpcClient } from '@memoflow/ipc-client';
import { toast } from 'vue-sonner';
import { getI18nGlobal } from '@memoflow/app-vue/plugins/i18n';
import { createAccountIpcClient } from '@memoflow/account/client';
import { createCloudAuthIpcClient } from '@memoflow/cloud-auth';
import { createGoalIpcClient } from '@memoflow/goal/client';
import { createLabelIpcClient } from '@memoflow/label/client';
import { createGovernanceIpcClient } from '@memoflow/governance/client';
import { createTaskIpcClient } from '@memoflow/task/client';
import { createScheduleIpcClient } from '@memoflow/schedule/client';
import { createReminderIpcClient } from '@memoflow/reminder/client';
import { createRepositoryIpcClient } from '@memoflow/repository/client';
import { createNotificationIpcClient } from '@memoflow/notification/client';
import { createSettingIpcClient } from '@memoflow/setting/client';
import {
  createAIIpcClient,
  createAssistantRuntimeIpcClient,
  createRuntimeUsageIpcClient,
  createWorkflowRuntimeIpcClient,
} from '@memoflow/ai/client';
import { createDataPortabilityIpcClient } from '@memoflow/data-portability/client';
import {
  ACCOUNT_SERVICE_KEY,
  DESKTOP_CLOUD_AUTH_SERVICE_KEY,
  GOAL_SERVICE_KEY,
  LABEL_SERVICE_KEY,
  TASK_SERVICE_KEY,
  SCHEDULE_SERVICE_KEY,
  REMINDER_SERVICE_KEY,
  REPOSITORY_SERVICE_KEY,
  NOTIFICATION_SERVICE_KEY,
  SETTING_SERVICE_KEY,
  AI_CLIENT_KEY,
  AI_ASSISTANT_RUNTIME_KEY,
  AI_RUNTIME_USAGE_KEY,
  AI_WORKFLOW_RUNTIME_KEY,
  RULE_SERVICE_KEY,
  DASHBOARD_SERVICE_KEY,
  DATA_PORTABILITY_SERVICE_KEY,
  DESKTOP_AUTH_API_KEY,
  DESKTOP_BRIDGE_KEY,
  DESKTOP_NOTIFICATION_DEVICE_PREFERENCE_KEY,
  MODULE_CAPSULES_KEY,
  LOGOUT_HANDLER_KEY,
  PROFILE_LOCK_HANDLER_KEY,
  DESKTOP_ACCESS_SNAPSHOT_KEY,
  ASSISTANT_SURFACE_KEY,
  defaultModuleCapsules,
} from '@memoflow/app-vue/di';
import { createDashboardIpcAdapter } from '@memoflow/app-vue/modules/dashboard/adapters';
import { useAuthenticationStore } from '@memoflow/app-vue/modules/authentication';
import { useAccountStore } from '@memoflow/app-vue/modules/account';
import { readDesktopAccessSnapshot } from '@memoflow/app-vue/desktop';
// Residual 941: host bridge via requireElectronBridge sole helper.
import { requireElectronBridge } from './electron-bridge';
import { clearDesktopServerStateIdentity } from './server-state';
import {
  ProfileAccessChannels,
  WindowChannels,
  type DesktopNotificationPreferencePatch,
} from '@memoflow/contracts/electron';
import { fromIpcResult, isOk, type IpcResult } from '@memoflow/contracts/result';

function getAppT(): (key: string) => string {
  try {
    return getI18nGlobal().t;
  } catch {
    return (key: string) => key;
  }
}

export function installDesktopAppServices(app: App): void {
  const bridge = requireElectronBridge('installDesktopAppServices');

  const resultIpcClient = createResultIpcClient({ bridge });

  app.provide(ACCOUNT_SERVICE_KEY, createAccountIpcClient(resultIpcClient));

  const cloudAuth = createCloudAuthIpcClient(resultIpcClient);
  app.provide(DESKTOP_CLOUD_AUTH_SERVICE_KEY, cloudAuth);

  app.provide(GOAL_SERVICE_KEY, createGoalIpcClient(resultIpcClient));
  app.provide(LABEL_SERVICE_KEY, createLabelIpcClient(resultIpcClient));

  app.provide(TASK_SERVICE_KEY, createTaskIpcClient(resultIpcClient));

  app.provide(SCHEDULE_SERVICE_KEY, createScheduleIpcClient(resultIpcClient));

  app.provide(REMINDER_SERVICE_KEY, createReminderIpcClient(resultIpcClient));

  app.provide(REPOSITORY_SERVICE_KEY, createRepositoryIpcClient(resultIpcClient));

  app.provide(NOTIFICATION_SERVICE_KEY, createNotificationIpcClient(resultIpcClient));
  app.provide(DESKTOP_NOTIFICATION_DEVICE_PREFERENCE_KEY, {
    get: () => resultIpcClient.invoke('desktop:notification:device-preference:get'),
    update: (patch: DesktopNotificationPreferencePatch) =>
      resultIpcClient.invoke('desktop:notification:device-preference:update', patch),
    reset: () => resultIpcClient.invoke('desktop:notification:device-preference:reset'),
  });

  app.provide(SETTING_SERVICE_KEY, createSettingIpcClient(resultIpcClient));

  app.provide(AI_CLIENT_KEY, createAIIpcClient(resultIpcClient));
  app.provide(AI_ASSISTANT_RUNTIME_KEY, createAssistantRuntimeIpcClient(resultIpcClient));
  app.provide(AI_RUNTIME_USAGE_KEY, createRuntimeUsageIpcClient(resultIpcClient));
  app.provide(AI_WORKFLOW_RUNTIME_KEY, createWorkflowRuntimeIpcClient(resultIpcClient));

  app.provide(RULE_SERVICE_KEY, createGovernanceIpcClient(resultIpcClient));

  app.provide(DATA_PORTABILITY_SERVICE_KEY, createDataPortabilityIpcClient(resultIpcClient));

  app.provide(DASHBOARD_SERVICE_KEY, createDashboardIpcAdapter(resultIpcClient));
  // V2 shell capsule navigation (UI_REDESIGN_V2_PLAN §2.2 / Brief §12-4)
  app.provide(MODULE_CAPSULES_KEY, defaultModuleCapsules);
  // Residual 349: Desktop renderer advertises the 'desktop' assistant surface.
  app.provide(ASSISTANT_SURFACE_KEY, 'desktop');

  // Generic desktop bridge used by business IPC recovery and window controls.
  app.provide(DESKTOP_AUTH_API_KEY, bridge);
  app.provide(DESKTOP_BRIDGE_KEY, bridge);
  const desktopAccessSnapshot = ref<Awaited<ReturnType<typeof readDesktopAccessSnapshot>>>(null);
  app.provide(DESKTOP_ACCESS_SNAPSHOT_KEY, desktopAccessSnapshot);
  void readDesktopAccessSnapshot(bridge).then((snapshot) => {
    desktopAccessSnapshot.value = snapshot;
  });
  app.provide(PROFILE_LOCK_HANDLER_KEY, async () => {
    // 锁定/切换 profile：先清空当前 identity 的 query cache，避免下一 profile 数据闪现。
    clearDesktopServerStateIdentity(useAccountStore().getCurrentAccountId ?? '');
    const lockResult = fromIpcResult(
      (await bridge.invoke(ProfileAccessChannels.LOCK)) as IpcResult<null>,
    );
    if (!isOk(lockResult)) throw new Error(getAppT()('common.operationFailed'));
    const transitionResult = fromIpcResult(
      (await bridge.invoke(WindowChannels.TRANSITION_TO_PROFILE_ACCESS)) as IpcResult<null>,
    );
    if (!isOk(transitionResult)) throw new Error(getAppT()('common.operationFailed'));
  });
  app.provide(LOGOUT_HANDLER_KEY, async () => {
    console.info('[Desktop Logout] Handler invoked');
    // 登出：先清空当前 identity 的 query cache（§3.1）。
    clearDesktopServerStateIdentity(useAccountStore().getCurrentAccountId ?? '');
    try {
      await bridge.invoke('cloud-auth:sign-out');

      const authStore = useAuthenticationStore();
      console.info('[Desktop Logout] Resetting auth store');
      authStore.reset();
    } catch (error) {
      console.error('[Desktop Logout] Failed to disconnect cloud account', error);
      toast.error('退出登录失败', {
        description: getAppT()('common.operationFailed'),
      });
      throw error;
    }
  });
}
