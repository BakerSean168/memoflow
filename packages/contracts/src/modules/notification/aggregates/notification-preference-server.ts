import type {
  NotificationGlobalChannelPreferencesDTO,
  NotificationWorkflowOverridesDTO,
} from '../value-objects/notification-workflow';
import type { QuietHoursDTO } from '../value-objects/quiet-hours';
import type { IdentityId, NotificationPreferenceId, TransferDate } from '../../../primitives';

/** User-owned notification preferences. Platform delivery guards are not user state. */
export interface NotificationPreferenceServerDTO {
  id: NotificationPreferenceId;
  identityId: IdentityId;
  globalChannels: NotificationGlobalChannelPreferencesDTO;
  workflowOverrides: NotificationWorkflowOverridesDTO;
  quietHours?: QuietHoursDTO | null;
  version: number;
  createdAt: TransferDate;
  updatedAt: TransferDate;
  deletedAt: TransferDate | null;
}
