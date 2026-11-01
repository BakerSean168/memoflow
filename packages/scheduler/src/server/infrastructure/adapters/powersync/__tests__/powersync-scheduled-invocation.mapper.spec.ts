import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PowerSyncInvocationAttemptMapper,
  PowerSyncScheduledInvocationMapper,
  type PowerSyncInvocationAttemptRow,
  type PowerSyncScheduledInvocationRow,
} from '../mappers/powersync-scheduled-invocation.mapper';

// 云端同步下来的行是不带时区后缀的朴素 UTC 串（如 `2026-10-25T12:00:00.000000`），
// 本地写入的行是 `toISOString()` 的 Z 串。固定到 UTC+8 运行，让该回归测试在 UTC CI
// 上也能暴露「朴素串被当成本地时间解析」的漂移；断言本身只依赖固定 epoch 常量。
const originalTimeZone = process.env.TZ;
const UTC_EPOCH = Date.parse('2026-10-25T12:00:00.000Z');

beforeAll(() => {
  process.env.TZ = 'Asia/Shanghai';
});

afterAll(() => {
  process.env.TZ = originalTimeZone;
});

function makeScheduledRow(
  overrides: Partial<PowerSyncScheduledInvocationRow> = {},
): PowerSyncScheduledInvocationRow {
  return {
    id: 'invocation-1',
    identity_id: 'identity-1',
    owner_type: 'routine.routine',
    owner_id: 'routine-1',
    scheduling_key: 'routine.routine:routine-1:occurrence-1',
    handler_key: 'routine.wallclock.fire',
    payload_version: 1,
    payload: '{"occurrenceId":"occurrence-1"}',
    run_at: '2026-10-25T12:00:00.000000',
    source_revision: '1',
    retry_enabled: 1,
    max_retries: 3,
    initial_delay_ms: 5_000,
    max_delay_ms: 60_000,
    backoff_multiplier: 2,
    priority: 'normal',
    timeout_ms: null,
    status: 'dead_letter',
    attempt_count: 4,
    next_attempt_at: '2026-10-25T12:00:00.500000',
    claim_token: null,
    claim_expires_at: '2026-10-25T12:00:01.000000',
    fencing_token: 4,
    name: 'Routine',
    tags: '["routine"]',
    created_at: '2026-10-25T11:59:59.000000',
    updated_at: '2026-10-25T11:59:58.000000',
    ...overrides,
  };
}

function makeAttemptRow(
  overrides: Partial<PowerSyncInvocationAttemptRow> = {},
): PowerSyncInvocationAttemptRow {
  return {
    id: 'attempt-1',
    identity_id: 'identity-1',
    invocation_id: 'invocation-1',
    attempt_number: 1,
    started_at: '2026-10-25T12:00:00.000000',
    finished_at: '2026-10-25T12:00:00.500000',
    outcome: 'failed',
    result: null,
    failure_code: 'TIMEOUT',
    failure_message: 'Timed out',
    failure_retryable: 1,
    worker_id: 'worker-1',
    claim_token: null,
    fencing_token: 4,
    created_at: '2026-10-25T11:59:59.000000',
    ...overrides,
  };
}

describe('PowerSync schedulers mappers timestamp parsing (#731)', () => {
  it('parses a naive UTC run_at as UTC instead of host-local time', () => {
    const invocation = PowerSyncScheduledInvocationMapper.toDomain(makeScheduledRow());

    expect(invocation.runAt).toBe(UTC_EPOCH);
  });

  it('parses every naive UTC scheduling timestamp as UTC', () => {
    const invocation = PowerSyncScheduledInvocationMapper.toDomain(makeScheduledRow());

    expect(invocation).toMatchObject({
      runAt: UTC_EPOCH,
      nextAttemptAt: UTC_EPOCH + 500,
      claimExpiresAt: UTC_EPOCH + 1_000,
      createdAt: UTC_EPOCH - 1_000,
      updatedAt: UTC_EPOCH - 2_000,
    });
  });

  it('keeps parsing Z-suffixed timestamps written by toRow', () => {
    const row = makeScheduledRow({
      run_at: '2026-10-25T12:00:00.000Z',
      next_attempt_at: '2026-10-25T12:00:00.500Z',
      claim_expires_at: '2026-10-25T12:00:01.000Z',
      created_at: '2026-10-25T11:59:59.000Z',
      updated_at: '2026-10-25T11:59:58.000Z',
    });

    expect(PowerSyncScheduledInvocationMapper.toDomain(row)).toMatchObject({
      runAt: UTC_EPOCH,
      nextAttemptAt: UTC_EPOCH + 500,
      claimExpiresAt: UTC_EPOCH + 1_000,
      createdAt: UTC_EPOCH - 1_000,
      updatedAt: UTC_EPOCH - 2_000,
    });
  });

  it('preserves explicit offsets on timestamps that already carry a time zone', () => {
    const row = makeScheduledRow({
      run_at: '2026-10-25T20:00:00.000000+08:00',
      next_attempt_at: null,
      claim_expires_at: null,
    });

    expect(PowerSyncScheduledInvocationMapper.toDomain(row)).toMatchObject({
      runAt: UTC_EPOCH,
      nextAttemptAt: null,
      claimExpiresAt: null,
    });
  });

  it('parses naive UTC attempt timestamps as UTC', () => {
    const attempt = PowerSyncInvocationAttemptMapper.toDomain(makeAttemptRow());

    expect(attempt).toMatchObject({
      startedAt: UTC_EPOCH,
      finishedAt: UTC_EPOCH + 500,
      createdAt: UTC_EPOCH - 1_000,
    });
  });

  it('keeps the ISO-8601 Z write format on toRow', () => {
    const invocation = PowerSyncScheduledInvocationMapper.toDomain(makeScheduledRow());

    expect(PowerSyncScheduledInvocationMapper.toRow(invocation).run_at).toBe(
      '2026-10-25T12:00:00.000Z',
    );
  });
});
