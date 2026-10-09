import type { IElectronDatabase } from '@memoflow/contracts/electron';
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
} from '@memoflow/reminder';
import { createNotificationPowerSyncPortability } from '@memoflow/notification';
import {
  createLabelPortableCapability,
  LabelService,
  PowerSyncLabelRepository,
} from '@memoflow/label';
import { createDataPortabilityModule } from '@memoflow/data-portability';

/** Repository-only composition: never starts module runtimes or a second PowerSync instance. */
export function composeProfilePortability(db: IElectronDatabase, exportedAt: string) {
  const setting = createSettingPowerSyncModule(db);
  const notification = createNotificationPowerSyncPortability(db);
  const clock = createSystemClock();
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
    ],
  }).portableCapabilityCoordinator;
}
