import { describe, expect, it } from 'vitest';
import type { ReminderResponse as PrismaReminderResponse } from '@memoflow/database';
import { PrismaReminderResponseMapper } from './prisma-reminder-response-mapper';

const TEST_IDENTITY_1 = 'identity-1';
const TEST_IDENTITY_2 = 'identity-2';
const TEST_TEMPLATE_1 = 'template-1';
const TEST_TEMPLATE_2 = 'template-2';
const TEST_RESPONSE_1 = 'IReminderResponseId_550e8400-e29b-41d4-a716-446655440021';
const TEST_RESPONSE_2 = 'IReminderResponseId_550e8400-e29b-41d4-a716-446655440022';

function createMinimalRow(): PrismaReminderResponse {
  return {
    id: TEST_RESPONSE_1,
    templateId: TEST_TEMPLATE_1,
    identityId: TEST_IDENTITY_1,
    action: 'DISMISSED',
    responseTime: null,
    snoozeDurationSeconds: null,
    timestamp: new Date(1_000),
    createdAt: new Date(1_000),
  } as PrismaReminderResponse;
}

function createSnoozedRow(): PrismaReminderResponse {
  return {
    id: TEST_RESPONSE_2,
    templateId: TEST_TEMPLATE_2,
    identityId: TEST_IDENTITY_2,
    action: 'SNOOZED',
    responseTime: 7,
    snoozeDurationSeconds: 900,
    timestamp: new Date(2_000),
    createdAt: new Date(2_000),
  } as PrismaReminderResponse;
}

describe('PrismaReminderResponseMapper', () => {
  it('maps response latency as scalar seconds without milliseconds conversion', () => {
    const domain = PrismaReminderResponseMapper.toDomain({
      ...createMinimalRow(),
      action: 'CLICKED',
      responseTime: 45,
    });

    expect(domain.responseTime).toBe(45);
    expect(domain.snoozeDurationSeconds).toBeNull();
    expect(domain.timestamp).toEqual(new Date(1_000));
  });

  it('maps snooze duration separately from response latency', () => {
    const domain = PrismaReminderResponseMapper.toDomain(createSnoozedRow());

    expect(domain.id).toBe(TEST_RESPONSE_2);
    expect(domain.action).toBe('SNOOZED');
    expect(domain.responseTime).toBe(7);
    expect(domain.snoozeDurationSeconds).toBe(900);
  });

  it('handles null durations', () => {
    const domain = PrismaReminderResponseMapper.toDomain(createMinimalRow());
    expect(domain.responseTime).toBeNull();
    expect(domain.snoozeDurationSeconds).toBeNull();
  });

  it('maps lists preserving order and scalar values', () => {
    const domains = PrismaReminderResponseMapper.toDomainList([
      createMinimalRow(),
      createSnoozedRow(),
    ]);

    expect(domains.map((entry) => entry.id)).toEqual([TEST_RESPONSE_1, TEST_RESPONSE_2]);
    expect(domains[1].responseTime).toBe(7);
    expect(domains[1].snoozeDurationSeconds).toBe(900);
  });
});
