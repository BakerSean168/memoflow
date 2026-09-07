import { createContext, type PropsWithChildren, useContext, useRef } from 'react';

import type { AccountClientPort } from '@memoflow/account/client';
import { createAccountHttpClient } from '@memoflow/account/client';
import type { AIClientPort, AssistantRuntimeClient } from '@memoflow/ai/client';
import { createAIHttpClient, createAssistantRuntimeHttpClient } from '@memoflow/ai/client';
import type { GoalClientPort } from '@memoflow/goal/client';
import { createGoalHttpClient } from '@memoflow/goal/client';
import type { NotificationClientPort } from '@memoflow/notification/client';
import { createNotificationHttpClient } from '@memoflow/notification/client';
import type { ReminderClientPort } from '@memoflow/reminder/client';
import { createReminderHttpClient } from '@memoflow/reminder/client';
import type { ScheduleClientPort } from '@memoflow/schedule/client';
import { createScheduleHttpClient } from '@memoflow/schedule/client';
import type { SchedulerClientPort } from '@memoflow/scheduler/client';
import { createSchedulerServiceFromHttpClient } from '@memoflow/scheduler/client';
import type { SettingClientPort } from '@memoflow/setting/client';
import { createSettingHttpClient } from '@memoflow/setting/client';
import type { TaskClientPort } from '@memoflow/task/client';
import { createTaskHttpClient } from '@memoflow/task/client';
import type { IResultHttpClient } from '@memoflow/http-client';

import { useAppSession } from './app-session-provider';

export type AppClientRegistry = {
  httpClient: IResultHttpClient;
  accountService: AccountClientPort;
  aiClient: AIClientPort;
  aiAssistantRuntime: AssistantRuntimeClient;
  goalService: GoalClientPort;
  notificationService: NotificationClientPort;
  reminderService: ReminderClientPort;
  scheduleService: ScheduleClientPort;
  schedulerService: SchedulerClientPort;
  settingService: SettingClientPort;
  taskService: TaskClientPort;
};

const AppClientRegistryContext = createContext<AppClientRegistry | null>(null);

export function createAppClientRegistry(httpClient: IResultHttpClient): AppClientRegistry {
  return {
    httpClient,
    accountService: createAccountHttpClient(httpClient),
    aiClient: createAIHttpClient(httpClient),
    aiAssistantRuntime: createAssistantRuntimeHttpClient(httpClient),
    goalService: createGoalHttpClient(httpClient),
    notificationService: createNotificationHttpClient(httpClient),
    reminderService: createReminderHttpClient(httpClient),
    scheduleService: createScheduleHttpClient(httpClient),
    schedulerService: createSchedulerServiceFromHttpClient(httpClient),
    settingService: createSettingHttpClient(httpClient),
    taskService: createTaskHttpClient(httpClient),
  };
}

export function AppClientRegistryProvider({ children }: PropsWithChildren) {
  const { createAuthorizedHttpClient } = useAppSession();
  const registryRef = useRef<AppClientRegistry | null>(null);

  if (!registryRef.current) {
    registryRef.current = createAppClientRegistry(createAuthorizedHttpClient());
  }

  return (
    <AppClientRegistryContext.Provider value={registryRef.current}>
      {children}
    </AppClientRegistryContext.Provider>
  );
}

export function useAppClientRegistry() {
  const context = useContext(AppClientRegistryContext);

  if (!context) {
    throw new Error('useAppClientRegistry must be used inside AppClientRegistryProvider.');
  }

  return context;
}
