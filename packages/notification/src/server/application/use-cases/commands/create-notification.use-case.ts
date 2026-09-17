import { randomUUID } from 'crypto';
import type {
  NotificationActionDTO,
  NotificationClientDTO,
  NotificationMetadataDTO,
  NotificationNavigationIntentDTO,
  NotificationType,
  NotificationCategory,
  RelatedEntityType,
  NotificationChannelType,
} from '@memoflow/contracts/notification';
import {
  NotificationChannelType as ChannelType,
  NotificationDeliveryPlanOutcome,
} from '@memoflow/contracts/notification';
import type { IdentityId } from '@memoflow/contracts/primitives';
import type { ImportanceLevel, UrgencyLevel } from '@memoflow/contracts/shared';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import { buildIdempotencyKeyString } from '@memoflow/contracts/reliable-messaging';
import type {
  INotificationRepository,
  INotificationPreferenceRepository,
  NotificationOutboxDispatchPlan,
} from '../../../domain/repositories';
import { Notification } from '../../../domain/aggregates/notification';
import { NotificationPolicy, type NotificationDeliveryDecision } from '../../../domain/services/notification-policy';
import { NotificationWorkflowCatalog } from '../../../domain/services/notification-workflow-catalog';
import {
  SystemDeliveryGuard,
  type SystemDeliveryGuardPort,
} from '../../../domain/services/system-delivery-guard';
import { toNotificationClientDTO } from './notification-dto-converters';
import type { UserTimeContextPort } from '@memoflow/time';

export class CreateNotificationUseCase {
  private readonly policy = new NotificationPolicy();

  constructor(
    private readonly notificationRepository: INotificationRepository,
    private readonly preferenceRepository: INotificationPreferenceRepository,
    private readonly closureChecker: (identityId: string) => Promise<boolean>,
    private readonly userTimeContextPort: UserTimeContextPort,
    private readonly clock: () => Date = () => new Date(),
    private readonly workflowCatalog: NotificationWorkflowCatalog = new NotificationWorkflowCatalog(),
    private readonly systemDeliveryGuard: SystemDeliveryGuardPort = new SystemDeliveryGuard(),
  ) {
    if (!closureChecker) {
      throw new Error('[FAIL-CLOSED] CreateNotificationUseCase requires closureChecker');
    }
  }

  async execute(params: {
    identityId: string;
    workflowKey?: string;
    topic?: string;
    idempotencyKey?: string;
    title: string;
    content: string;
    /** Compatibility projection only. WorkflowDefinition owns canonical semantics. */
    type?: NotificationType;
    category?: NotificationCategory;
    importance?: ImportanceLevel;
    urgency?: UrgencyLevel;
    relatedEntityType?: RelatedEntityType;
    relatedEntityId?: string;
    navigationIntent?: NotificationNavigationIntentDTO | null;
    actions?: NotificationActionDTO[];
    metadata?: NotificationMetadataDTO;
    channels?: NotificationChannelType[];
    expiresAt?: number | null;
    correlationId?: string | null;
    causationId?: string | null;
  }): Promise<Result<NotificationClientDTO>> {
    if (await this.closureChecker(params.identityId)) {
      return error('FORBIDDEN', 'Account is closed or closure in progress');
    }

    const workflowKey = params.workflowKey?.trim();
    if (!workflowKey) {
      return error('VALIDATION_ERROR', 'workflowKey is required; category-based workflow inference is retired');
    }
    const workflow = this.workflowCatalog.resolve(workflowKey, params.topic);
    const idempotencyKey = params.idempotencyKey?.trim() || `notification:${randomUUID()}`;

    if (params.idempotencyKey) {
      const existing = await this.notificationRepository.findByIdempotencyKey(
        params.identityId,
        idempotencyKey,
      );
      if (existing) return ok(toNotificationClientDTO(existing.toServerDTO()));
    }

    const preference = await this.preferenceRepository.findByIdentityId(params.identityId);
    // Resolve identity-scoped Product Time before any wall-clock suppression decision.
    // QuietHours itself carries the selected IANA timezone, while this port is the
    // canonical identity time seam and prevents host-local fallback from creeping in.
    await this.userTimeContextPort.getUserTimeContext(params.identityId);
    const requestedChannels = [...new Set(params.channels ?? [ChannelType.InApp])];
    const now = this.clock();
    const notification = Notification.create({
      identityId: params.identityId as IdentityId,
      workflowKey: workflow.workflowKey,
      topic: workflow.topicKey ?? workflow.workflowKey,
      idempotencyKey,
      title: params.title,
      content: params.content,
      type: workflow.legacyProjection.type,
      category: workflow.legacyProjection.category,
      importance: params.importance ?? workflow.presentationDefaults.importance,
      urgency: params.urgency ?? workflow.presentationDefaults.urgency,
      relatedEntityType: params.relatedEntityType ?? null,
      relatedEntityId: params.relatedEntityId ?? null,
      navigationIntent: params.navigationIntent ?? null,
      actions: params.actions,
      metadata: params.metadata,
      expiresAt: params.expiresAt,
      correlationId: params.correlationId ?? null,
      causationId: params.causationId ?? null,
    });

    const outboxDispatches: NotificationOutboxDispatchPlan[] = [];
    const deliveryDecisions: NotificationDeliveryDecision[] = [];

    for (const channelType of requestedChannels) {
      let decision = this.policy.evaluate({
        workflow,
        channel: channelType,
        preference,
        quietHours: preference?.quietHours,
        now,
      });

      if (
        decision.outcome === NotificationDeliveryPlanOutcome.Enqueued
        || decision.outcome === NotificationDeliveryPlanOutcome.Deferred
      ) {
        const usage = await this.notificationRepository.getDeliveryUsage(
          params.identityId,
          workflow.workflowKey,
          channelType,
          now,
        );
        const guardDecision = this.systemDeliveryGuard.evaluate({
          workflowKey: workflow.workflowKey,
          channel: channelType,
          usage,
        });
        if (guardDecision) {
          decision = {
            channel: channelType,
            outcome: guardDecision.outcome,
            reason: guardDecision.reason,
          };
        }
      }

      deliveryDecisions.push(decision);

      if (
        decision.outcome === NotificationDeliveryPlanOutcome.Suppressed
        || decision.outcome === NotificationDeliveryPlanOutcome.RateLimited
        || decision.outcome === NotificationDeliveryPlanOutcome.Disabled
        || decision.outcome === NotificationDeliveryPlanOutcome.Unsupported
      ) {
        continue;
      }
      if (decision.outcome === NotificationDeliveryPlanOutcome.Deferred && !decision.retryAt) {
        continue;
      }

      const occurrenceKey = `${idempotencyKey}:${channelType}`;
      const dispatchIdempotencyKey = buildIdempotencyKeyString({
        identityId: params.identityId,
        source: 'notification',
        occurrenceKey,
      });
      outboxDispatches.push({
        operationId: randomUUID(),
        identityId: params.identityId,
        source: 'notification',
        occurrenceKey,
        channel: channelType,
        payloadJson: JSON.stringify({
          notificationId: String(notification.id),
          workflowKey: workflow.workflowKey,
          topic: workflow.topicKey ?? workflow.workflowKey,
          title: params.title,
          content: params.content,
          type: workflow.legacyProjection.type,
          category: workflow.legacyProjection.category,
          channelType,
          navigationIntent: params.navigationIntent ?? null,
          actions: params.actions ?? null,
        }),
        idempotencyKey: dispatchIdempotencyKey,
        ...(decision.outcome === NotificationDeliveryPlanOutcome.Deferred
          ? { deferUntil: decision.retryAt }
          : {}),
      });
    }

    try {
      await this.notificationRepository.save(notification, outboxDispatches, deliveryDecisions);
    } catch (cause) {
      if (params.idempotencyKey) {
        const racedExisting = await this.notificationRepository.findByIdempotencyKey(
          params.identityId,
          idempotencyKey,
        );
        if (racedExisting) return ok(toNotificationClientDTO(racedExisting.toServerDTO()));
      }
      throw cause;
    }
    return ok(toNotificationClientDTO(notification.toServerDTO()));
  }
}
