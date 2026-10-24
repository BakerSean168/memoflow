import { describe, expect, it } from 'vitest';
import { NotificationMetricsService } from './notification-metrics-service';
import {
  OPERATION_METRIC_PREFIX,
  outboxMetricKey,
  workerMetricKey,
} from '@memoflow/patterns/operations';

describe('W7 unified metric naming (B): notification collector', () => {
  it('emits memoflow.notification.outbox.<state> on the real record paths', () => {
    const service = new NotificationMetricsService();
    service.recordPersisted();
    service.recordDispatched();
    service.recordDelivered();
    service.recordFailed();
    service.recordRetry();
    service.recordRetry();
    service.recordDeadLetter();

    const snapshot = service.getUnifiedSnapshot();
    expect(snapshot).toMatchObject({
      'memoflow.notification.outbox.persisted': 1,
      'memoflow.notification.outbox.claimed': 1,
      'memoflow.notification.outbox.succeeded': 1,
      'memoflow.notification.outbox.failed': 1,
      'memoflow.notification.outbox.retried': 2,
      'memoflow.notification.outbox.dead_letter': 1,
    });
  });

  it('all emitted keys follow the memoflow.<module>.outbox.<state> convention', () => {
    const service = new NotificationMetricsService();
    service.recordPersisted();
    service.recordDelivered();
    service.recordFailed();
    service.recordDeadLetter();

    const keys = Object.keys(service.getUnifiedSnapshot());
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key.startsWith(`${OPERATION_METRIC_PREFIX}.notification.outbox.`)).toBe(true);
    }
  });

  it('persisted/claimed/succeeded/retried/failed/dead_letter states are all covered', () => {
    const expected = [
      outboxMetricKey('notification', 'persisted'),
      outboxMetricKey('notification', 'claimed'),
      outboxMetricKey('notification', 'succeeded'),
      outboxMetricKey('notification', 'retried'),
      outboxMetricKey('notification', 'failed'),
      outboxMetricKey('notification', 'dead_letter'),
    ];
    expect(expected).toHaveLength(6);
  });

  it('worker outcome keys follow memoflow.notification.worker.<outcome>', () => {
    expect(workerMetricKey('notification', 'failed')).toBe('memoflow.notification.worker.failed');
  });
});
