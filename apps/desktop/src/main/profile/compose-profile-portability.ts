import type { IElectronDatabase } from '@memoflow/desktop-contracts';
import { createSystemClock } from '@memoflow/time';
import { createAccountPowerSyncPortableCapability } from '@memoflow/account';
import { createSettingPowerSyncModule } from '@memoflow/setting';
import { createGoalPowerSyncPortableCapability } from '@memoflow/goal';
import { createTaskPowerSyncPortableCapability } from '@memoflow/task';
import {
  createSchedulePortableCapability,
  createSchedulePowerSyncRepositories,
} from '@memoflow/schedule';
import {
  createAIConversationPortableCapability,
  createAIPowerSyncRepositories,
} from '@memoflow/ai';
import {
  createRoutinePortableCapability,
  createRoutinePowerSyncRepositories,
} from '@memoflow/routine';
import { createNotificationPowerSyncPortability } from '@memoflow/notification';
import {
  createLabelPortableCapability,
  LabelService,
  PowerSyncLabelRepository,
} from '@memoflow/label';
import { createDataPortabilityModule } from '@memoflow/data-portability';
import {
  createDesktopConversationMessagesPortableCapability,
  createDesktopMessageExportPort,
  type DesktopMessageExportPort,
} from './desktop-message-archive';

export interface ComposeProfilePortabilityOptions {
  /** Export-side read port for the local Mastra transcript sidecar. */
  readonly messageExportPort?: DesktopMessageExportPort;
}

/** Repository-only composition: never starts module runtimes or a second PowerSync instance. */
export function composeProfilePortability(
  db: IElectronDatabase,
  exportedAt: string,
  options: ComposeProfilePortabilityOptions = {},
) {
  const setting = createSettingPowerSyncModule(db);
  const notification = createNotificationPowerSyncPortability(db);
  const clock = createSystemClock();
  const messageExportPort = options.messageExportPort ?? createDesktopMessageExportPort(null);
  return createDataPortabilityModule({
    productVersion: 'profile-import-v1',
    nowIsoString: () => exportedAt,
    portableCapabilities: [
      setting.portableCapability,
      createAccountPowerSyncPortableCapability(db, setting.userTimeContextPort),
      notification.portableCapability,
      createLabelPortableCapability(new LabelService(new PowerSyncLabelRepository(db), { clock })),
      createGoalPowerSyncPortableCapability(db),
      createTaskPowerSyncPortableCapability(db),
      createSchedulePortableCapability(createSchedulePowerSyncRepositories(db).scheduleRepository),
      createRoutinePortableCapability(createRoutinePowerSyncRepositories(db)),
      notification.portableFactCapability,
      createAIConversationPortableCapability(
        createAIPowerSyncRepositories(db).conversationRepository,
      ),
      createDesktopConversationMessagesPortableCapability(messageExportPort),
    ],
  }).portableCapabilityCoordinator;
}
