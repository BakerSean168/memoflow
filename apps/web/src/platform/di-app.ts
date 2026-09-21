/**
 * Web Platform - full app DI container.
 *
 * Feature services are created via each package's public client seam.
 * Feature services are created via each package's public `client` seam.
 * Heavy feature services are loaded on demand so the post-login app shell
 * does not pay for every module up front.
 */

import type { App } from 'vue';
import { createCloudAuthHttpClient } from '@memoflow/cloud-auth';
import {
  ACCOUNT_SERVICE_KEY,
  AUTH_SERVICE_KEY,
  GOAL_SERVICE_KEY,
  LABEL_SERVICE_KEY,
  NOTIFICATION_SERVICE_KEY,
  REPOSITORY_SERVICE_KEY,
  ROUTINE_SERVICE_KEY,
  RULE_SERVICE_KEY,
  SCHEDULE_SERVICE_KEY,
  SETTING_SERVICE_KEY,
  DATA_PORTABILITY_SERVICE_KEY,
  AI_CLIENT_KEY,
  AI_ASSISTANT_RUNTIME_KEY,
  AI_RUNTIME_USAGE_KEY,
  AI_WORKFLOW_RUNTIME_KEY,
  TASK_SERVICE_KEY,
  MODULE_CAPSULES_KEY,
  LOGOUT_HANDLER_KEY,
  ASSISTANT_SURFACE_KEY,
  defaultModuleCapsules,
  useAuthenticationStore,
} from '@memoflow/app-vue/web-core';
import { resultHttpClient } from './http';
import { createLazyService } from './lazy-service';
import { clearWebServerStateIdentity } from './server-state';

const authService = createCloudAuthHttpClient(resultHttpClient, {
  baseUrl: window.location.origin,
});

const accountService = createLazyService(async () => {
  const { createAccountHttpClient } = await import('@memoflow/account/client');
  return createAccountHttpClient(resultHttpClient);
});

const ruleService = createLazyService(async () => {
  const { createGovernanceHttpClient } = await import('@memoflow/governance/client');
  return createGovernanceHttpClient(resultHttpClient);
});

const goalService = createLazyService(async () => {
  const { createGoalHttpClient } = await import('@memoflow/goal/client');
  return createGoalHttpClient(resultHttpClient);
});

const labelService = createLazyService(async () => {
  const { createLabelHttpClient } = await import('@memoflow/label/client');
  return createLabelHttpClient(resultHttpClient);
});

const notificationService = createLazyService(async () => {
  const { createNotificationHttpClient } = await import('@memoflow/notification/client');
  return createNotificationHttpClient(resultHttpClient);
});

const repositoryService = createLazyService(async () => {
  const { createRepositoryHttpClient } = await import('@memoflow/repository/client');
  return createRepositoryHttpClient(resultHttpClient);
});

const routineService = createLazyService(async () => {
  const { createRoutineHttpClient } = await import('@memoflow/reminder/client');
  return createRoutineHttpClient(resultHttpClient);
});

const scheduleService = createLazyService(async () => {
  const { createScheduleHttpClient } = await import('@memoflow/schedule/client');
  return createScheduleHttpClient(resultHttpClient);
});

const settingService = createLazyService(async () => {
  const { createSettingHttpClient } = await import('@memoflow/setting/client');
  return createSettingHttpClient(resultHttpClient);
});

const dataPortabilityService = createLazyService(async () => {
  const { createDataPortabilityHttpClient } = await import('@memoflow/data-portability/client');
  return createDataPortabilityHttpClient(resultHttpClient);
});

const aiClient = createLazyService(async () => {
  const { createAIHttpClient } = await import('@memoflow/ai/client');
  return createAIHttpClient(resultHttpClient);
});

const aiAssistantRuntime = createLazyService(async () => {
  const { createAssistantRuntimeHttpClient } = await import('@memoflow/ai/client');
  return createAssistantRuntimeHttpClient(resultHttpClient);
});

const aiWorkflowRuntime = createLazyService(async () => {
  const { createWorkflowRuntimeHttpClient } = await import('@memoflow/ai/client');
  return createWorkflowRuntimeHttpClient(resultHttpClient);
});

const aiRuntimeUsage = createLazyService(async () => {
  const { createRuntimeUsageHttpClient } = await import('@memoflow/ai/client');
  return createRuntimeUsageHttpClient(resultHttpClient);
});

const taskService = createLazyService(async () => {
  const { createTaskHttpClient } = await import('@memoflow/task/client');
  return createTaskHttpClient(resultHttpClient);
});

export function installAppServices(app: App): void {
  app.provide(ACCOUNT_SERVICE_KEY, accountService);
  app.provide(AUTH_SERVICE_KEY, authService);
  app.provide(RULE_SERVICE_KEY, ruleService);
  app.provide(GOAL_SERVICE_KEY, goalService);
  app.provide(LABEL_SERVICE_KEY, labelService);
  app.provide(NOTIFICATION_SERVICE_KEY, notificationService);
  app.provide(REPOSITORY_SERVICE_KEY, repositoryService);
  app.provide(ROUTINE_SERVICE_KEY, routineService);
  app.provide(SCHEDULE_SERVICE_KEY, scheduleService);
  app.provide(SETTING_SERVICE_KEY, settingService);
  app.provide(DATA_PORTABILITY_SERVICE_KEY, dataPortabilityService);
  app.provide(AI_CLIENT_KEY, aiClient);
  app.provide(AI_ASSISTANT_RUNTIME_KEY, aiAssistantRuntime);
  app.provide(AI_RUNTIME_USAGE_KEY, aiRuntimeUsage);
  app.provide(AI_WORKFLOW_RUNTIME_KEY, aiWorkflowRuntime);
  app.provide(TASK_SERVICE_KEY, taskService);

  // V2 shell capsule navigation (UI_REDESIGN_V2_PLAN §2.2 / Brief §12-4)
  app.provide(MODULE_CAPSULES_KEY, defaultModuleCapsules);
  // Residual 349: Web host advertises the 'web' assistant surface to shared Vue.
  app.provide(ASSISTANT_SURFACE_KEY, 'web');
  app.provide(LOGOUT_HANDLER_KEY, async () => {
    const authStore = useAuthenticationStore();
    // Stop realtime sources first, then clear the identity cache (plan §3.1).
    clearWebServerStateIdentity(authStore.getIdentityId ?? '');
    await authService.signOut();
    authStore.reset();
    window.location.replace('/auth');
  });
}
