import type {
  PortableCapability,
  PortableCapabilityExecutionContext,
  PortableCapabilityReceipt,
} from '@memoflow/contracts/data-portability';
import {
  NotificationChannelType,
  NotificationDeliveryPreferencePortablePayloadV3Schema,
  type NotificationChannelType as NotificationChannel,
  type NotificationDeliveryPreferencePortablePayloadV3,
} from '@memoflow/contracts/notification';
import { NotificationPreference } from '../domain/aggregates/notification-preference';
import type { INotificationPreferenceRepository } from '../domain/repositories';

const CHANNELS = Object.values(NotificationChannelType) as readonly NotificationChannel[];

type ChannelFlags = NotificationDeliveryPreferencePortablePayloadV3['globalChannels'];

function orderedChannelFlags(source: ReadonlyMap<NotificationChannel, boolean>): ChannelFlags {
  const result: Partial<Record<NotificationChannel, boolean>> = {};
  for (const channel of CHANNELS) {
    const enabled = source.get(channel);
    if (enabled !== undefined) result[channel] = enabled;
  }
  return NotificationDeliveryPreferencePortablePayloadV3Schema.shape.globalChannels.parse(result);
}

function orderedWorkflowOverrides(
  source: ReadonlyMap<string, Map<NotificationChannel, boolean>>,
): NotificationDeliveryPreferencePortablePayloadV3['workflowOverrides'] {
  const result: Record<string, ChannelFlags> = {};
  for (const workflowKey of [...source.keys()].sort()) {
    const channels = source.get(workflowKey);
    if (!channels) continue;
    result[workflowKey] = orderedChannelFlags(channels);
  }
  return result;
}

function normalizePayload(
  payload: NotificationDeliveryPreferencePortablePayloadV3,
): NotificationDeliveryPreferencePortablePayloadV3 {
  const parsed = NotificationDeliveryPreferencePortablePayloadV3Schema.parse(payload);
  const globalMap = new Map<NotificationChannel, boolean>();
  for (const [channel, enabled] of Object.entries(parsed.globalChannels)) {
    if (enabled !== undefined) globalMap.set(channel as NotificationChannel, enabled);
  }
  const workflowMap = new Map<string, Map<NotificationChannel, boolean>>();
  for (const workflowKey of Object.keys(parsed.workflowOverrides).sort()) {
    const channels = new Map<NotificationChannel, boolean>();
    for (const [channel, enabled] of Object.entries(parsed.workflowOverrides[workflowKey] ?? {})) {
      if (enabled !== undefined) channels.set(channel as NotificationChannel, enabled);
    }
    workflowMap.set(workflowKey, channels);
  }
  return {
    globalChannels: orderedChannelFlags(globalMap),
    workflowOverrides: orderedWorkflowOverrides(workflowMap),
  };
}

function projectPreference(
  preference: NotificationPreference,
): NotificationDeliveryPreferencePortablePayloadV3 {
  return NotificationDeliveryPreferencePortablePayloadV3Schema.parse({
    globalChannels: orderedChannelFlags(preference.globalChannels),
    workflowOverrides: orderedWorkflowOverrides(preference.workflowOverrides),
  });
}

function payloadsEqual(
  left: NotificationDeliveryPreferencePortablePayloadV3,
  right: NotificationDeliveryPreferencePortablePayloadV3,
): boolean {
  return JSON.stringify(normalizePayload(left)) === JSON.stringify(normalizePayload(right));
}

function replaceDeliveryChoices(
  preference: NotificationPreference,
  payload: NotificationDeliveryPreferencePortablePayloadV3,
): void {
  const target = normalizePayload(payload);

  for (const channel of CHANNELS) {
    if (preference.getGlobalChannel(channel) !== undefined) {
      preference.clearGlobalChannel(channel);
    }
  }
  for (const [workflowKey, channels] of preference.workflowOverrides) {
    for (const channel of channels.keys()) {
      preference.clearWorkflowChannelOverride(workflowKey, channel);
    }
  }

  for (const [channel, enabled] of Object.entries(target.globalChannels)) {
    if (enabled !== undefined) {
      preference.setGlobalChannel(channel as NotificationChannel, enabled);
    }
  }
  for (const [workflowKey, channels] of Object.entries(target.workflowOverrides)) {
    for (const [channel, enabled] of Object.entries(channels)) {
      if (enabled !== undefined) {
        preference.setWorkflowChannelOverride(workflowKey, channel as NotificationChannel, enabled);
      }
    }
  }
}

/**
 * Notification-owned portability for the stable delivery-choice layer only.
 *
 * ADR-088 has not yet finalized QuietHours/SystemDeliveryGuard, so the current
 * doNotDisturb/rateLimit fields are deliberately preserved in-place and never
 * serialized by this capability.
 */
export class NotificationDeliveryPreferencePortableService {
  constructor(private readonly repository: INotificationPreferenceRepository) {}

  async export(
    identityId: string,
  ): Promise<NotificationDeliveryPreferencePortablePayloadV3 | null> {
    const preference = await this.repository.findByIdentityId(identityId);
    return preference ? projectPreference(preference) : null;
  }

  async dryRun(
    identityId: string,
    payload: NotificationDeliveryPreferencePortablePayloadV3,
  ): Promise<PortableCapabilityReceipt> {
    const target = normalizePayload(payload);
    const current = await this.repository.findByIdentityId(identityId);
    if (!current) return { created: 1, updated: 0, skipped: 0, warnings: [] };
    if (payloadsEqual(projectPreference(current), target)) {
      return { created: 0, updated: 0, skipped: 1, warnings: [] };
    }
    return { created: 0, updated: 1, skipped: 0, warnings: [] };
  }

  async apply(
    identityId: string,
    payload: NotificationDeliveryPreferencePortablePayloadV3,
  ): Promise<PortableCapabilityReceipt> {
    const target = normalizePayload(payload);
    const current = await this.repository.findByIdentityId(identityId);
    if (current && payloadsEqual(projectPreference(current), target)) {
      return { created: 0, updated: 0, skipped: 1, warnings: [] };
    }

    const preference =
      current ?? NotificationPreference.create({ identityId: identityId as never });
    replaceDeliveryChoices(preference, target);
    await this.repository.save(preference);
    return current
      ? { created: 0, updated: 1, skipped: 0, warnings: [] }
      : { created: 1, updated: 0, skipped: 0, warnings: [] };
  }
}

/** V3 capability registered by the host-owned Data Portability registry. */
export class NotificationDeliveryPreferencePortableCapability implements PortableCapability<NotificationDeliveryPreferencePortablePayloadV3> {
  readonly key = 'notification-delivery-preferences' as const;
  readonly schemaVersion = 3;
  readonly payloadSchema = NotificationDeliveryPreferencePortablePayloadV3Schema;

  constructor(private readonly service: NotificationDeliveryPreferencePortableService) {}

  export(
    context: PortableCapabilityExecutionContext,
  ): Promise<NotificationDeliveryPreferencePortablePayloadV3 | null> {
    return this.service.export(context.identityId);
  }

  dryRun(
    payload: NotificationDeliveryPreferencePortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    return this.service.dryRun(context.identityId, payload);
  }

  apply(
    payload: NotificationDeliveryPreferencePortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    return this.service.apply(context.identityId, payload);
  }
}

export function createNotificationDeliveryPreferencePortableCapability(
  repository: INotificationPreferenceRepository,
): NotificationDeliveryPreferencePortableCapability {
  return new NotificationDeliveryPreferencePortableCapability(
    new NotificationDeliveryPreferencePortableService(repository),
  );
}
