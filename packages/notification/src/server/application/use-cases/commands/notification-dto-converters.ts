import type {
  NotificationServerDTO,
  NotificationClientDTO,
  NotificationPreferenceServerDTO,
  NotificationPreferenceClientDTO,
} from '@memoflow/contracts/notification';

export function toNotificationClientDTO(serverDTO: NotificationServerDTO): NotificationClientDTO {
  return { ...serverDTO };
}

export function toNotificationPreferenceClientDTO(
  serverDTO: NotificationPreferenceServerDTO,
): NotificationPreferenceClientDTO {
  return {
    id: serverDTO.id,
    identityId: serverDTO.identityId,
    globalChannels: serverDTO.globalChannels,
    workflowOverrides: serverDTO.workflowOverrides,
    doNotDisturb: serverDTO.doNotDisturb ?? null,
    rateLimit: serverDTO.rateLimit ?? null,
    version: serverDTO.version,
    createdAt: serverDTO.createdAt,
    updatedAt: serverDTO.updatedAt,
    deletedAt: serverDTO.deletedAt,
  };
}
