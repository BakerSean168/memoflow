import { describe, expect, it } from 'vitest';
import {
  BusinessOperationReceiptSchema,
  DeliveryAttemptSchema,
  buildIdempotencyKeyString,
  parseIdempotencyKeyString,
} from './operation-receipt';
import {
  LeaseClaimSchema,
  LeaseFencingException,
  assertValidLeaseFencing,
  validateLeaseFencing,
} from './lease';
import {
  ProjectionOperationSchema,
  SourceRevisionSchema,
  projectionOperationToReceipt,
} from './projection';
import {
  CapabilityMissingStartupException,
  CapabilityRequirementContractSchema,
  CapabilityTestDoubleForbiddenException,
  assertProductionCapabilityOrFailFast,
} from './capability';
import {
  AccountClosureSagaInputSchema,
  GoalRecordReceiptInputSchema,
  KnowledgeCommitProjectionInputSchema,
  NotificationOutboxDispatchInputSchema,
  ScheduleConditionalUpdateInputSchema,
  ScheduleConflictRebuildInputSchema,
  TaskRecordOutboxInputSchema,
  assertValidBusinessOperationReceipt,
  assertValidProjectionOperation,
} from './ports';
import { mapOutboxStatusToBusinessOperationStatus } from './index';

describe('Reliable Messaging Contracts (W0 - Iteration 3 Fixes)', () => {
  const validLease = LeaseClaimSchema.parse({
    schemaVersion: 1,
    resourceKey: 'reminder:template:tmpl_001',
    claimId: 'claim_100',
    fencingToken: 10,
    ownerToken: 'worker-node-1',
    expiresAt: '2026-08-09T06:00:00.000Z',
    lastHeartbeatAt: '2026-08-09T05:01:00.000Z',
    heartbeatIntervalMs: 10000,
  });

  const validIdempotencyKey = buildIdempotencyKeyString({
    identityId: 'usr_123',
    source: 'reminder',
    occurrenceKey: 'tmpl_001:2026-08-09T08:00',
  });

  describe('1. Schema Versioning & Evolution Strategy (P2-5)', () => {
    it('accepts valid schemaVersion 1 across all schemas', () => {
      expect(validLease.schemaVersion).toBe(1);

      const attempt = DeliveryAttemptSchema.parse({
        schemaVersion: 1,
        attempt: 1,
        attemptedAt: '2026-08-09T05:00:00.000Z',
        result: 'succeeded',
      });
      expect(attempt.schemaVersion).toBe(1);

      const capability = CapabilityRequirementContractSchema.parse({
        schemaVersion: 1,
        capabilityName: 'test.capability',
        moduleName: 'test',
        status: 'available',
      });
      expect(capability.schemaVersion).toBe(1);
    });

    it('rejects unknown schemaVersion (> max supported RELIABLE_MESSAGING_SCHEMA_VERSION=1) across ALL schemas (P2-5)', () => {
      const baseReceipt = {
        operationId: 'op_001',
        identityId: 'usr_123',
        source: 'reminder',
        occurrenceKey: 'tmpl_001:2026-08-09T08:00',
        idempotencyKey: validIdempotencyKey,
        status: 'pending' as const,
        attempt: 0,
        createdAt: '2026-08-09T05:00:00.000Z',
        updatedAt: '2026-08-09T05:00:00.000Z',
      };

      // 1. BusinessOperationReceiptSchema
      expect(() => BusinessOperationReceiptSchema.parse({ ...baseReceipt, schemaVersion: 2 })).toThrow(
        /Unknown or unsupported schemaVersion/
      );

      // 2. LeaseClaimSchema (P2-5)
      expect(() =>
        LeaseClaimSchema.parse({
          schemaVersion: 2,
          resourceKey: 'res_1',
          claimId: 'c_1',
          fencingToken: 1,
          ownerToken: 'w_1',
          expiresAt: '2026-08-09T06:00:00.000Z',
        })
      ).toThrow(/Unknown or unsupported schemaVersion/);

      // 3. DeliveryAttemptSchema (P2-5)
      expect(() =>
        DeliveryAttemptSchema.parse({
          schemaVersion: 2,
          attempt: 1,
          attemptedAt: '2026-08-09T05:00:00.000Z',
          result: 'succeeded',
        })
      ).toThrow(/Unknown or unsupported schemaVersion/);

      // 4. CapabilityRequirementContractSchema (P2-5)
      expect(() =>
        CapabilityRequirementContractSchema.parse({
          schemaVersion: 2,
          capabilityName: 'cap_1',
          moduleName: 'mod_1',
          status: 'available',
        })
      ).toThrow(/Unknown or unsupported schemaVersion/);

      // 5. ProjectionOperationSchema (P2-5)
      const baseProjection = {
        operationId: 'proj_001',
        identityId: 'usr_123',
        source: 'schedule',
        occurrenceKey: 'occ_100',
        idempotencyKey: buildIdempotencyKeyString({ identityId: 'usr_123', source: 'schedule', occurrenceKey: 'occ_100' }),
        projector: 'schedule-builder',
        sourceRevision: 1,
        status: 'pending' as const,
        createdAt: '2026-08-09T05:00:00.000Z',
        updatedAt: '2026-08-09T05:00:00.000Z',
      };
      expect(() => ProjectionOperationSchema.parse({ ...baseProjection, schemaVersion: 2 })).toThrow(
        /Unknown or unsupported schemaVersion/
      );

      // 6. Nested unknown version inside receipt lease (P2-5)
      expect(() =>
        BusinessOperationReceiptSchema.parse({
          ...baseReceipt,
          status: 'running',
          lease: {
            schemaVersion: 2,
            resourceKey: 'res_1',
            claimId: 'c_1',
            fencingToken: 1,
            ownerToken: 'w_1',
            expiresAt: '2026-08-09T06:00:00.000Z',
          },
        })
      ).toThrow(/Unknown or unsupported schemaVersion/);
    });

    it('rejects invalid schemaVersion (negative, float, zero, string)', () => {
      const baseReceipt = {
        operationId: 'op_001',
        identityId: 'usr_123',
        source: 'reminder',
        occurrenceKey: 'tmpl_001:2026-08-09T08:00',
        idempotencyKey: validIdempotencyKey,
        status: 'pending' as const,
        attempt: 0,
        createdAt: '2026-08-09T05:00:00.000Z',
        updatedAt: '2026-08-09T05:00:00.000Z',
      };

      // Negative version
      expect(() => BusinessOperationReceiptSchema.parse({ ...baseReceipt, schemaVersion: -1 })).toThrow();

      // Zero version
      expect(() => BusinessOperationReceiptSchema.parse({ ...baseReceipt, schemaVersion: 0 })).toThrow();

      // Float version
      expect(() => BusinessOperationReceiptSchema.parse({ ...baseReceipt, schemaVersion: 1.5 })).toThrow();

      // String version
      expect(() => BusinessOperationReceiptSchema.parse({ ...baseReceipt, schemaVersion: '1' as unknown as number })).toThrow();
    });
  });

  describe('2. P1-1 State Invariants Alignment & Positive/Negative Tests across 8 Statuses', () => {
    const baseReceipt = {
      schemaVersion: 1,
      operationId: 'op_001',
      identityId: 'usr_123',
      source: 'reminder',
      occurrenceKey: 'occ_100',
      idempotencyKey: buildIdempotencyKeyString({ identityId: 'usr_123', source: 'reminder', occurrenceKey: 'occ_100' }),
      attempt: 0,
      createdAt: '2026-08-09T05:00:00.000Z',
      updatedAt: '2026-08-09T05:00:00.000Z',
    };

    it('rejects non-ISO timestamp strings', () => {
      expect(() =>
        BusinessOperationReceiptSchema.parse({
          ...baseReceipt,
          status: 'pending',
          createdAt: 'not-a-date',
        })
      ).toThrow();

      expect(() =>
        BusinessOperationReceiptSchema.parse({
          ...baseReceipt,
          status: 'pending',
          createdAt: '2026-08-09',
        })
      ).toThrow();
    });

    // --- Status 1: pending ---
    it('validates pending state (must have lease=null, nextRetryAt=null, deadLetterAt=null, finishedAt=null)', () => {
      const validPending = BusinessOperationReceiptSchema.parse({
        ...baseReceipt,
        status: 'pending',
        lease: null,
        nextRetryAt: null,
        deadLetterAt: null,
        finishedAt: null,
      });
      expect(validPending.status).toBe('pending');

      // Negative: pending carrying a lease
      expect(() =>
        BusinessOperationReceiptSchema.parse({ ...baseReceipt, status: 'pending', lease: validLease })
      ).toThrow(/Status 'pending' MUST NOT carry a lease claim/);

      // Negative: pending carrying deadLetterAt
      expect(() =>
        BusinessOperationReceiptSchema.parse({ ...baseReceipt, status: 'pending', deadLetterAt: '2026-08-09T05:10:00.000Z' })
      ).toThrow(/MUST NOT specify deadLetterAt/);

      // Negative: pending carrying nextRetryAt
      expect(() =>
        BusinessOperationReceiptSchema.parse({ ...baseReceipt, status: 'pending', nextRetryAt: '2026-08-09T05:10:00.000Z' })
      ).toThrow(/MUST NOT specify nextRetryAt/);

      // Negative: pending carrying finishedAt
      expect(() =>
        BusinessOperationReceiptSchema.parse({ ...baseReceipt, status: 'pending', finishedAt: '2026-08-09T05:10:00.000Z' })
      ).toThrow(/Non-terminal status 'pending' MUST NOT specify finishedAt/);
    });

    // --- Status 2: running ---
    it('validates running state (must have non-null lease, nextRetryAt=null, deadLetterAt=null, finishedAt=null)', () => {
      const validRunning = BusinessOperationReceiptSchema.parse({
        ...baseReceipt,
        status: 'running',
        lease: validLease,
        nextRetryAt: null,
        deadLetterAt: null,
        finishedAt: null,
      });
      expect(validRunning.status).toBe('running');

      // Negative: running without lease
      expect(() =>
        BusinessOperationReceiptSchema.parse({ ...baseReceipt, status: 'running', lease: null })
      ).toThrow(/Status 'running' MUST carry a valid non-null lease claim/);

      // Negative: running carrying nextRetryAt
      expect(() =>
        BusinessOperationReceiptSchema.parse({ ...baseReceipt, status: 'running', lease: validLease, nextRetryAt: '2026-08-09T05:10:00.000Z' })
      ).toThrow(/MUST NOT specify nextRetryAt/);
    });

    // --- Status 3: succeeded ---
    it('validates succeeded state (must have finishedAt!=null, lastError=null, nextRetryAt=null, deadLetterAt=null)', () => {
      const validSucceeded = BusinessOperationReceiptSchema.parse({
        ...baseReceipt,
        status: 'succeeded',
        finishedAt: '2026-08-09T05:05:00.000Z',
        lastError: null,
        nextRetryAt: null,
        deadLetterAt: null,
      });
      expect(validSucceeded.status).toBe('succeeded');

      // Negative: succeeded without finishedAt
      expect(() =>
        BusinessOperationReceiptSchema.parse({ ...baseReceipt, status: 'succeeded', finishedAt: null })
      ).toThrow(/Terminal status 'succeeded' MUST specify a non-null finishedAt datetime/);

      // Negative: succeeded carrying lastError
      expect(() =>
        BusinessOperationReceiptSchema.parse({
          ...baseReceipt,
          status: 'succeeded',
          finishedAt: '2026-08-09T05:05:00.000Z',
          lastError: 'Some error',
        })
      ).toThrow(/Successful status 'succeeded' MUST NOT carry an error/);
    });

    // --- Status 4: skipped ---
    it('validates skipped state (must have finishedAt!=null, lastError=null, nextRetryAt=null, deadLetterAt=null)', () => {
      const validSkipped = BusinessOperationReceiptSchema.parse({
        ...baseReceipt,
        status: 'skipped',
        finishedAt: '2026-08-09T05:05:00.000Z',
        lastError: null,
      });
      expect(validSkipped.status).toBe('skipped');

      // Negative: skipped with lastError
      expect(() =>
        BusinessOperationReceiptSchema.parse({
          ...baseReceipt,
          status: 'skipped',
          finishedAt: '2026-08-09T05:05:00.000Z',
          lastError: 'Error',
        })
      ).toThrow(/Successful status 'skipped' MUST NOT carry an error/);
    });

    // --- Status 5: failed ---
    it('validates failed state (must have finishedAt!=null, nextRetryAt=null, deadLetterAt=null)', () => {
      const validFailed = BusinessOperationReceiptSchema.parse({
        ...baseReceipt,
        status: 'failed',
        finishedAt: '2026-08-09T05:05:00.000Z',
        lastError: 'Permanent failure',
      });
      expect(validFailed.status).toBe('failed');

      // Negative: failed carrying nextRetryAt
      expect(() =>
        BusinessOperationReceiptSchema.parse({
          ...baseReceipt,
          status: 'failed',
          finishedAt: '2026-08-09T05:05:00.000Z',
          nextRetryAt: '2026-08-09T05:10:00.000Z',
        })
      ).toThrow(/MUST NOT specify nextRetryAt/);
    });

    // --- Status 6: retryable ---
    it('validates retryable state (must have nextRetryAt!=null, lastError!=null, finishedAt=null, deadLetterAt=null)', () => {
      const validRetryable = BusinessOperationReceiptSchema.parse({
        ...baseReceipt,
        status: 'retryable',
        nextRetryAt: '2026-08-09T05:10:00.000Z',
        lastError: 'Transient network failure',
      });
      expect(validRetryable.status).toBe('retryable');

      // Negative: retryable without nextRetryAt
      expect(() =>
        BusinessOperationReceiptSchema.parse({ ...baseReceipt, status: 'retryable', nextRetryAt: null, lastError: 'Err' })
      ).toThrow(/MUST specify a non-null nextRetryAt datetime/);

      // Negative: retryable without lastError
      expect(() =>
        BusinessOperationReceiptSchema.parse({ ...baseReceipt, status: 'retryable', nextRetryAt: '2026-08-09T05:10:00.000Z', lastError: null })
      ).toThrow(/MUST specify a non-null lastError description/);

      // Negative: retryable carrying deadLetterAt
      expect(() =>
        BusinessOperationReceiptSchema.parse({
          ...baseReceipt,
          status: 'retryable',
          nextRetryAt: '2026-08-09T05:10:00.000Z',
          lastError: 'Err',
          deadLetterAt: '2026-08-09T05:10:00.000Z',
        })
      ).toThrow(/MUST NOT specify deadLetterAt/);
    });

    // --- Status 7: dead_letter ---
    it('validates dead_letter state (must have deadLetterAt!=null, nextRetryAt=null, finishedAt=null)', () => {
      const validDeadLetter = BusinessOperationReceiptSchema.parse({
        ...baseReceipt,
        status: 'dead_letter',
        deadLetterAt: '2026-08-09T05:05:00.000Z',
        lastError: 'Exceeded max retries',
      });
      expect(validDeadLetter.status).toBe('dead_letter');

      // Negative: dead_letter without deadLetterAt
      expect(() =>
        BusinessOperationReceiptSchema.parse({ ...baseReceipt, status: 'dead_letter', deadLetterAt: null })
      ).toThrow(/MUST specify a non-null deadLetterAt datetime/);

      // Negative: dead_letter carrying nextRetryAt
      expect(() =>
        BusinessOperationReceiptSchema.parse({
          ...baseReceipt,
          status: 'dead_letter',
          deadLetterAt: '2026-08-09T05:05:00.000Z',
          nextRetryAt: '2026-08-09T05:10:00.000Z',
        })
      ).toThrow(/MUST NOT specify nextRetryAt/);
    });

    // --- Status 8: cancelled ---
    it('validates cancelled state (must have finishedAt!=null, nextRetryAt=null, deadLetterAt=null)', () => {
      const validCancelled = BusinessOperationReceiptSchema.parse({
        ...baseReceipt,
        status: 'cancelled',
        finishedAt: '2026-08-09T05:05:00.000Z',
      });
      expect(validCancelled.status).toBe('cancelled');

      // Negative: cancelled without finishedAt
      expect(() =>
        BusinessOperationReceiptSchema.parse({ ...baseReceipt, status: 'cancelled', finishedAt: null })
      ).toThrow(/Terminal status 'cancelled' MUST specify a non-null finishedAt datetime/);
    });

    // --- ProjectionOperation & BusinessOperationReceipt 100% Invariant Parity ---
    it('guarantees ProjectionOperationSchema enforces identical state invariants as BusinessOperationReceiptSchema', () => {
      const baseProjection = {
        schemaVersion: 1,
        operationId: 'proj_001',
        identityId: 'usr_123',
        source: 'schedule',
        occurrenceKey: 'occ_100',
        idempotencyKey: buildIdempotencyKeyString({ identityId: 'usr_123', source: 'schedule', occurrenceKey: 'occ_100' }),
        projector: 'schedule-conflict-builder',
        sourceRevision: 42,
        attempt: 0,
        createdAt: '2026-08-09T05:00:00.000Z',
        updatedAt: '2026-08-09T05:00:00.000Z',
      };

      // Negative: Projection pending carrying lease (must be rejected!)
      expect(() =>
        ProjectionOperationSchema.parse({
          ...baseProjection,
          status: 'pending',
          lease: validLease,
        })
      ).toThrow(/Status 'pending' MUST NOT carry a lease claim/);

      // Negative: Projection pending carrying deadLetterAt (must be rejected!)
      expect(() =>
        ProjectionOperationSchema.parse({
          ...baseProjection,
          status: 'pending',
          deadLetterAt: '2026-08-09T05:05:00.000Z',
        })
      ).toThrow(/MUST NOT specify deadLetterAt/);

      // Negative: Projection retryable without nextRetryAt (must be rejected!)
      expect(() =>
        ProjectionOperationSchema.parse({
          ...baseProjection,
          status: 'retryable',
          lastError: 'Conflict rebuild error',
          nextRetryAt: null,
        })
      ).toThrow(/MUST specify a non-null nextRetryAt datetime/);

      // Valid Projection -> convert to Receipt -> ALWAYS passes ReceiptSchema parse!
      const validProj = ProjectionOperationSchema.parse({
        ...baseProjection,
        status: 'retryable',
        lastError: 'Conflict error',
        nextRetryAt: '2026-08-09T05:10:00.000Z',
      });
      const receipt = projectionOperationToReceipt(validProj);
      expect(() => BusinessOperationReceiptSchema.parse(receipt)).not.toThrow();
    });

    it('ensures projectionOperationToReceipt mapped output passes BusinessOperationReceiptSchema.parse() across ALL 8 statuses (P1-1)', () => {
      const baseProj = {
        schemaVersion: 1,
        operationId: 'proj_888',
        identityId: 'usr_123',
        source: 'schedule',
        occurrenceKey: 'occ_888',
        idempotencyKey: buildIdempotencyKeyString({ identityId: 'usr_123', source: 'schedule', occurrenceKey: 'occ_888' }),
        projector: 'schedule-builder',
        sourceRevision: 1,
        attempt: 0,
        createdAt: '2026-08-09T05:00:00.000Z',
        updatedAt: '2026-08-09T05:00:00.000Z',
      };

      const statuses: Array<{ status: any; extra: Record<string, unknown> }> = [
        { status: 'pending', extra: { lease: null, finishedAt: null, nextRetryAt: null, deadLetterAt: null } },
        { status: 'running', extra: { lease: validLease, finishedAt: null, nextRetryAt: null, deadLetterAt: null } },
        { status: 'succeeded', extra: { finishedAt: '2026-08-09T05:01:00.000Z', lease: null, lastError: null } },
        { status: 'skipped', extra: { finishedAt: '2026-08-09T05:01:00.000Z', lease: null, lastError: null } },
        { status: 'failed', extra: { finishedAt: '2026-08-09T05:01:00.000Z', lease: null, lastError: 'Fatal' } },
        { status: 'cancelled', extra: { finishedAt: '2026-08-09T05:01:00.000Z', lease: null } },
        { status: 'retryable', extra: { nextRetryAt: '2026-08-09T05:10:00.000Z', lastError: 'Retry err', finishedAt: null } },
        { status: 'dead_letter', extra: { deadLetterAt: '2026-08-09T05:01:00.000Z', lastError: 'Dead err', finishedAt: null } },
      ];

      for (const item of statuses) {
        const proj = ProjectionOperationSchema.parse({
          ...baseProj,
          status: item.status,
          ...item.extra,
        });
        const mappedReceipt = projectionOperationToReceipt(proj);
        expect(mappedReceipt.status).toBe(item.status);
        expect(() => BusinessOperationReceiptSchema.parse(mappedReceipt)).not.toThrow();
      }
    });

    it('throws if raw projection passed to projectionOperationToReceipt produces invalid receipt data (P1-1 forced parse)', () => {
      const invalidProjObj = {
        schemaVersion: 1,
        operationId: 'proj_bad',
        identityId: 'usr_123',
        source: 'schedule',
        occurrenceKey: 'occ_bad',
        idempotencyKey: buildIdempotencyKeyString({ identityId: 'usr_123', source: 'schedule', occurrenceKey: 'occ_bad' }),
        projector: 'schedule-builder',
        sourceRevision: 1,
        status: 'pending',
        attempt: 0,
        lease: validLease, // Invalid for pending!
        createdAt: '2026-08-09T05:00:00.000Z',
        updatedAt: '2026-08-09T05:00:00.000Z',
        finishedAt: null,
      };

      expect(() => projectionOperationToReceipt(invalidProjObj as any)).toThrow(
        /Status 'pending' MUST NOT carry a lease claim/
      );
    });
  });

  describe('3. P2-1 Strict Idempotency Key Parsing & Round-trip', () => {
    it('generates distinct, unambiguous canonical keys even with colon delimiters', () => {
      const key1 = buildIdempotencyKeyString({
        identityId: 'usr:123',
        source: 'reminder',
        occurrenceKey: 'tmpl:001',
      });
      const key2 = buildIdempotencyKeyString({
        identityId: 'usr',
        source: '123:reminder',
        occurrenceKey: 'tmpl:001',
      });

      expect(key1).not.toBe(key2);
      expect(key1).toBe('v1:7:usr:123:8:reminder:8:tmpl:001');
      expect(key2).toBe('v1:3:usr:12:123:reminder:8:tmpl:001');

      const parsed1 = parseIdempotencyKeyString(key1);
      expect(parsed1).toEqual({
        identityId: 'usr:123',
        source: 'reminder',
        occurrenceKey: 'tmpl:001',
      });
    });

    it('strictly parses valid canonical key strings and guarantees round-trip equality', () => {
      const canonicalKey = buildIdempotencyKeyString({
        identityId: 'usr_abc',
        source: 'goal',
        occurrenceKey: 'goal_777:2026-08-09',
      });
      const parsed = parseIdempotencyKeyString(canonicalKey);
      expect(parsed).not.toBeNull();
      expect(parsed).toEqual({
        identityId: 'usr_abc',
        source: 'goal',
        occurrenceKey: 'goal_777:2026-08-09',
      });

      expect(buildIdempotencyKeyString(parsed!)).toBe(canonicalKey);
    });

    it('rejects malformed, empty, zero-length, non-positive-digit, or trailing key strings', () => {
      // 1. Zero length token ('v1:0::0::0:')
      expect(parseIdempotencyKeyString('v1:0::0::0:')).toBeNull();

      // 2. Non-digit length token ('v1:7x:usr_123:8:reminder:7:occ_100')
      expect(parseIdempotencyKeyString('v1:7x:usr_123:8:reminder:7:occ_100')).toBeNull();

      // 3. Negative length token
      expect(parseIdempotencyKeyString('v1:-5:usr_123:8:reminder:7:occ_100')).toBeNull();

      // 4. Mismatched character length
      expect(parseIdempotencyKeyString('v1:10:usr_123:8:reminder:7:occ_100')).toBeNull();

      // 5. Trailing extra characters
      const keyWithExtra = buildIdempotencyKeyString({ identityId: 'u', source: 's', occurrenceKey: 'o' }) + ':extra';
      expect(parseIdempotencyKeyString(keyWithExtra)).toBeNull();

      // 6. Missing prefix
      expect(parseIdempotencyKeyString('v2:1:u:1:s:1:o')).toBeNull();

      // 7. Non-string inputs
      expect(parseIdempotencyKeyString(123 as unknown as string)).toBeNull();
      expect(parseIdempotencyKeyString(null as unknown as string)).toBeNull();
    });

    it('rejects mismatched idempotencyKey in BusinessOperationReceiptSchema', () => {
      const input = {
        schemaVersion: 1,
        operationId: 'op_001',
        identityId: 'usr_123',
        source: 'reminder',
        occurrenceKey: 'tmpl_001',
        idempotencyKey: 'wrong:canonical:key',
        status: 'pending' as const,
        attempt: 0,
        createdAt: '2026-08-09T05:00:00.000Z',
        updatedAt: '2026-08-09T05:00:00.000Z',
      };

      expect(() => BusinessOperationReceiptSchema.parse(input)).toThrow(/Idempotency key mismatch/);
    });
  });

  describe('4. P2-2 SourceRevision Schema Strictness', () => {
    it('accepts valid non-negative integers, Git commit SHAs (7-40 hex chars), and UUID strings', () => {
      expect(SourceRevisionSchema.parse(0)).toBe(0);
      expect(SourceRevisionSchema.parse(100)).toBe(100);
      expect(SourceRevisionSchema.parse('e3b0c44298fc1c149afbf4c8996fb92427ae41e4')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4');
      expect(SourceRevisionSchema.parse('a1b2c3d')).toBe('a1b2c3d');
      expect(SourceRevisionSchema.parse('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479');
    });

    it('rejects negative numbers, floats, NaN, string NaN, empty string, and non-hex garbage strings', () => {
      expect(() => SourceRevisionSchema.parse(-1)).toThrow();
      expect(() => SourceRevisionSchema.parse(1.5)).toThrow();
      expect(() => SourceRevisionSchema.parse(NaN)).toThrow();
      expect(() => SourceRevisionSchema.parse('NaN')).toThrow();
      expect(() => SourceRevisionSchema.parse('')).toThrow();
      expect(() => SourceRevisionSchema.parse('garbage-non-hex-revision')).toThrow();
    });
  });

  describe('5. P2-3 Legacy OutboxMessageStatus Mapping', () => {
    it('maps R1 legacy OutboxMessageStatus to W0 8-status BusinessOperationStatus', () => {
      expect(mapOutboxStatusToBusinessOperationStatus('pending')).toBe('pending');
      expect(mapOutboxStatusToBusinessOperationStatus('dispatched')).toBe('succeeded');
      expect(mapOutboxStatusToBusinessOperationStatus('failed')).toBe('failed');
      expect(mapOutboxStatusToBusinessOperationStatus('dead')).toBe('dead_letter');
    });
  });

  describe('6. LeaseClaim Fencing Algebra & P2-4 nowIso Datetime Validation', () => {
    it('validates a correct lease claim and fencing token progression', () => {
      const res = validateLeaseFencing({
        activeLease: validLease,
        incomingResourceKey: 'reminder:template:tmpl_001',
        incomingClaimId: 'claim_100',
        incomingFencingToken: 10,
        incomingOwnerToken: 'worker-node-1',
        nowIso: '2026-08-09T05:05:00.000Z',
      });
      expect(res.valid).toBe(true);
    });

    it('rejects invalid nowIso format with explicit rejection reason (P2-4)', () => {
      const res = validateLeaseFencing({
        activeLease: validLease,
        incomingResourceKey: 'reminder:template:tmpl_001',
        incomingClaimId: 'claim_100',
        incomingFencingToken: 10,
        incomingOwnerToken: 'worker-node-1',
        nowIso: 'invalid-iso-string',
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/Invalid nowIso ISO datetime format/);
    });

    it('rejects stale fencing token (incoming token < active token)', () => {
      const res = validateLeaseFencing({
        activeLease: validLease,
        incomingResourceKey: 'reminder:template:tmpl_001',
        incomingClaimId: 'claim_099',
        incomingFencingToken: 9,
        incomingOwnerToken: 'stale-worker',
        nowIso: '2026-08-09T05:05:00.000Z',
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/Stale fencing token/);

      expect(() =>
        assertValidLeaseFencing({
          activeLease: validLease,
          incomingResourceKey: 'reminder:template:tmpl_001',
          incomingClaimId: 'claim_099',
          incomingFencingToken: 9,
          incomingOwnerToken: 'stale-worker',
          nowIso: '2026-08-09T05:05:00.000Z',
        })
      ).toThrow(LeaseFencingException);
    });

    it('rejects owner token mismatch for identical fencing token', () => {
      const res = validateLeaseFencing({
        activeLease: validLease,
        incomingResourceKey: 'reminder:template:tmpl_001',
        incomingClaimId: 'claim_100',
        incomingFencingToken: 10,
        incomingOwnerToken: 'other-worker',
        nowIso: '2026-08-09T05:05:00.000Z',
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/Owner token mismatch/);
    });

    it('rejects expired active lease', () => {
      const res = validateLeaseFencing({
        activeLease: validLease,
        incomingResourceKey: 'reminder:template:tmpl_001',
        incomingClaimId: 'claim_100',
        incomingFencingToken: 10,
        incomingOwnerToken: 'worker-node-1',
        nowIso: '2026-08-09T07:00:00.000Z', // After expiresAt 06:00:00
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/Active lease expired/);
    });
  });

  describe('7. Capability Fail-Fast & Required/Test-Double Semantics', () => {
    it('production + missing + requiredInProduction=true -> throws CapabilityMissingStartupException', () => {
      const contract = CapabilityRequirementContractSchema.parse({
        capabilityName: 'notification.channel.email',
        moduleName: 'notification',
        status: 'missing',
        requiredInProduction: true,
      });

      expect(() => assertProductionCapabilityOrFailFast(contract, 'production')).toThrow(
        CapabilityMissingStartupException
      );
    });

    it('production + missing + requiredInProduction=false -> DOES NOT throw (optional capability allowed missing)', () => {
      const contract = CapabilityRequirementContractSchema.parse({
        capabilityName: 'notification.channel.optional_sms',
        moduleName: 'notification',
        status: 'missing',
        requiredInProduction: false,
      });

      expect(() => assertProductionCapabilityOrFailFast(contract, 'production')).not.toThrow();
    });

    it('production + test_double -> ALWAYS throws in production', () => {
      const contract = CapabilityRequirementContractSchema.parse({
        capabilityName: 'notification.channel.email',
        moduleName: 'notification',
        status: 'test_double',
        allowTestDoubleInTest: true,
      });

      expect(() => assertProductionCapabilityOrFailFast(contract, 'production')).toThrow(
        CapabilityMissingStartupException
      );
    });

    it('test env + test_double + allowTestDoubleInTest=false -> throws CapabilityTestDoubleForbiddenException', () => {
      const contract = CapabilityRequirementContractSchema.parse({
        capabilityName: 'reminder.cron.scheduler',
        moduleName: 'reminder',
        status: 'test_double',
        allowTestDoubleInTest: false,
      });

      expect(() => assertProductionCapabilityOrFailFast(contract, 'test')).toThrow(
        CapabilityTestDoubleForbiddenException
      );
    });

    it('test env + test_double + allowTestDoubleInTest=true -> DOES NOT throw', () => {
      const contract = CapabilityRequirementContractSchema.parse({
        capabilityName: 'reminder.cron.scheduler',
        moduleName: 'reminder',
        status: 'test_double',
        allowTestDoubleInTest: true,
      });

      expect(() => assertProductionCapabilityOrFailFast(contract, 'test')).not.toThrow();
    });
  });

  describe('8. P1-2 Application Port Schemas & Receipt Verification Closed Loop', () => {
    it('validates port input schemas and enforces required canonical idempotencyKey matching across all 7 live ports (P1-2)', () => {
      const notificationKey = buildIdempotencyKeyString({ identityId: 'usr_1', source: 'notification', occurrenceKey: 'occ_99' });
      const notificationInput = NotificationOutboxDispatchInputSchema.parse({
        operationId: 'op_1',
        identityId: 'usr_1',
        source: 'notification',
        occurrenceKey: 'occ_99',
        channel: 'in-app',
        payloadJson: '{}',
        idempotencyKey: notificationKey,
      });
      expect(notificationInput.idempotencyKey).toBe(notificationKey);

      const accountKey = buildIdempotencyKeyString({ identityId: 'usr_1', source: 'account', occurrenceKey: 'occ_acc' });
      const accountInput = AccountClosureSagaInputSchema.parse({
        identityId: 'usr_1',
        source: 'account',
        occurrenceKey: 'occ_acc',
        idempotencyKey: accountKey,
      });
      expect(accountInput.idempotencyKey).toBe(accountKey);

      const goalKey = buildIdempotencyKeyString({ identityId: 'usr_1', source: 'goal', occurrenceKey: 'occ_g1' });
      const goalInput = GoalRecordReceiptInputSchema.parse({
        identityId: 'usr_1',
        goalId: 'g_1',
        occurrenceKey: 'occ_g1',
        idempotencyKey: goalKey,
      });
      expect(goalInput.source).toBe('goal');
      expect(goalInput.idempotencyKey).toBe(goalKey);

      const taskKey = buildIdempotencyKeyString({ identityId: 'usr_1', source: 'task', occurrenceKey: 'occ_t1' });
      const taskInput = TaskRecordOutboxInputSchema.parse({
        identityId: 'usr_1',
        taskId: 't_1',
        occurrenceKey: 'occ_t1',
        idempotencyKey: taskKey,
      });
      expect(taskInput.source).toBe('task');
      expect(taskInput.idempotencyKey).toBe(taskKey);

      const scheduleKey = buildIdempotencyKeyString({ identityId: 'usr_1', source: 'schedule', occurrenceKey: 'occ_e1' });
      const scheduleInput = ScheduleConditionalUpdateInputSchema.parse({
        identityId: 'usr_1',
        entryId: 'e_1',
        occurrenceKey: 'occ_e1',
        expectedVersion: 3,
        updatePayload: { title: 'New title' },
        idempotencyKey: scheduleKey,
      });
      expect(scheduleInput.expectedVersion).toBe(3);
      expect(scheduleInput.idempotencyKey).toBe(scheduleKey);

      const rebuildKey = buildIdempotencyKeyString({ identityId: 'usr_1', source: 'schedule', occurrenceKey: 'rebuild_001' });
      const scheduleRebuildInput = ScheduleConflictRebuildInputSchema.parse({
        identityId: 'usr_1',
        occurrenceKey: 'rebuild_001',
        startIso: '2026-08-09T00:00:00.000Z',
        endIso: '2026-08-09T23:59:59.000Z',
        idempotencyKey: rebuildKey,
      });
      expect(scheduleRebuildInput.source).toBe('schedule');
      expect(scheduleRebuildInput.idempotencyKey).toBe(rebuildKey);

      const knowledgeKey = buildIdempotencyKeyString({ identityId: 'usr_1', source: 'repository', occurrenceKey: 'occ_k1' });
      const knowledgeInput = KnowledgeCommitProjectionInputSchema.parse({
        identityId: 'usr_1',
        commitSha: 'a1b2c3d',
        occurrenceKey: 'occ_k1',
        files: ['doc.md'],
        idempotencyKey: knowledgeKey,
      });
      expect(knowledgeInput.projector).toBe('knowledge-note-projector');
      expect(knowledgeInput.idempotencyKey).toBe(knowledgeKey);
    });

    it('rejects port inputs missing idempotencyKey across ALL operation input schemas (P1-2 required)', () => {
      // 1. Notification
      expect(() =>
        NotificationOutboxDispatchInputSchema.parse({
          operationId: 'op_1',
          identityId: 'usr_1',
          occurrenceKey: 'occ_99',
          channel: 'in-app',
          payloadJson: '{}',
        })
      ).toThrow();

      // 2. Account
      expect(() =>
        AccountClosureSagaInputSchema.parse({
          identityId: 'usr_1',
          occurrenceKey: 'occ_acc',
        })
      ).toThrow();

      // 3. Goal
      expect(() =>
        GoalRecordReceiptInputSchema.parse({
          identityId: 'usr_1',
          goalId: 'g_1',
          occurrenceKey: 'occ_g1',
        })
      ).toThrow();

      // 4. Task
      expect(() =>
        TaskRecordOutboxInputSchema.parse({
          identityId: 'usr_1',
          taskId: 't_1',
          occurrenceKey: 'occ_t1',
        })
      ).toThrow();

      // 5. Schedule update
      expect(() =>
        ScheduleConditionalUpdateInputSchema.parse({
          identityId: 'usr_1',
          entryId: 'e_1',
          occurrenceKey: 'occ_e1',
          expectedVersion: 1,
          updatePayload: {},
        })
      ).toThrow();

      // 6. Schedule rebuild
      expect(() =>
        ScheduleConflictRebuildInputSchema.parse({
          identityId: 'usr_1',
          occurrenceKey: 'rebuild_1',
          startIso: '2026-08-09T00:00:00.000Z',
          endIso: '2026-08-09T23:59:59.000Z',
        })
      ).toThrow();

      // 7. Knowledge
      expect(() =>
        KnowledgeCommitProjectionInputSchema.parse({
          identityId: 'usr_1',
          commitSha: 'a1b2c3d',
          occurrenceKey: 'occ_k1',
          files: [],
        })
      ).toThrow();
    });

    it('rejects port inputs with mismatched or unparseable idempotencyKey (P1-2 validation)', () => {
      expect(() =>
        NotificationOutboxDispatchInputSchema.parse({
          operationId: 'op_1',
          identityId: 'usr_1',
          source: 'notification',
          occurrenceKey: 'occ_99',
          channel: 'in-app',
          payloadJson: '{}',
          idempotencyKey: 'v1:5:wrong:4:path:3:key',
        })
      ).toThrow(/Idempotency key mismatch/);

      expect(() =>
        AccountClosureSagaInputSchema.parse({
          identityId: 'usr_1',
          source: 'account',
          occurrenceKey: 'occ_100',
          idempotencyKey: 'invalid-unparseable-string',
        })
      ).toThrow(/Invalid idempotencyKey format/);
    });

    it('enforces output receipt validation using assertValidBusinessOperationReceipt and assertValidProjectionOperation', () => {
      const validReceipt = BusinessOperationReceiptSchema.parse({
        schemaVersion: 1,
        operationId: 'op_100',
        identityId: 'usr_1',
        source: 'goal',
        occurrenceKey: 'occ_1',
        idempotencyKey: buildIdempotencyKeyString({ identityId: 'usr_1', source: 'goal', occurrenceKey: 'occ_1' }),
        status: 'succeeded',
        attempt: 1,
        createdAt: '2026-08-09T05:00:00.000Z',
        updatedAt: '2026-08-09T05:00:00.000Z',
        finishedAt: '2026-08-09T05:00:00.000Z',
      });

      expect(assertValidBusinessOperationReceipt(validReceipt)).toEqual(validReceipt);

      const invalidReceipt = { ...validReceipt, status: 'succeeded', finishedAt: null };
      expect(() => assertValidBusinessOperationReceipt(invalidReceipt)).toThrow();

      const validProj = ProjectionOperationSchema.parse({
        schemaVersion: 1,
        operationId: 'proj_100',
        identityId: 'usr_1',
        source: 'schedule',
        occurrenceKey: 'occ_s1',
        idempotencyKey: buildIdempotencyKeyString({ identityId: 'usr_1', source: 'schedule', occurrenceKey: 'occ_s1' }),
        projector: 'schedule-conflict-builder',
        sourceRevision: 1,
        status: 'succeeded',
        createdAt: '2026-08-09T05:00:00.000Z',
        updatedAt: '2026-08-09T05:00:00.000Z',
        finishedAt: '2026-08-09T05:00:00.000Z',
      });

      expect(assertValidProjectionOperation(validProj)).toEqual(validProj);
    });
  });
});
