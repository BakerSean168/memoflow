import { describe, expect, it, vi } from 'vitest';
import { bindGatewayWrites } from './write.port';
import { bindLabelReadPort } from './label-read.port';
import { GatewayReadError } from '@memoflow/agent-gateway';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import type { PrismaClient } from '@memoflow/database';
import type { UserTimeContextPort } from '@memoflow/time';

const context: ExecutionContext = {
  identityId: 'owner-test',
  source: 'http',
  requestId: 'req-1',
  traceId: 'tr-1',
  startedAt: Date.now(),
};

const authority = {
  connectionId: 'pat-1',
  scopes: ['goals:write', 'tasks:write', 'routines:write', 'labels:read'],
  authorize: async () => {},
};

describe('Gateway write-side label rejection (#993)', () => {
  const dummyPrisma = {} as PrismaClient;
  const dummyTime = {
    getUserTimeContext: vi.fn(),
  } as unknown as UserTimeContextPort;

  it('rejects taskCreate when labelIds are supplied with VALIDATION_ERROR', async () => {
    const writes = bindGatewayWrites(dummyPrisma, dummyTime);
    await expect(
      writes.taskCreate(
        {
          idempotencyKey: 'task-create-1',
          plan: {
            name: 'Test Task with Labels',
            labelIds: ['label-123'],
            schedule: { kind: 'OneTime', date: '2026-11-20', timing: { kind: 'AllDay' } },
          },
        },
        context,
        authority,
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects taskUpdate when labelIds are supplied with VALIDATION_ERROR', async () => {
    const writes = bindGatewayWrites(dummyPrisma, dummyTime);
    await expect(
      writes.taskUpdate(
        {
          idempotencyKey: 'task-update-1',
          planId: 'plan-123',
          changes: {
            expectedVersion: 1,
            labelIds: ['label-456'],
          },
        },
        context,
        authority,
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('bindLabelReadPort adapter (#993)', () => {
  it('maps service.list output to LabelClientDTO presentation shape', async () => {
    const service = {
      list: vi.fn().mockResolvedValue([
        {
          id: 'label-a',
          identityId: 'owner-test',
          name: 'Urgent',
          normalizedName: 'urgent',
          color: '#ff0000',
          createdAt: 1000,
          updatedAt: 1000,
        },
      ]),
      resolveNames: vi.fn().mockResolvedValue([]),
    };
    const port = bindLabelReadPort(service);
    const result = await port.list({ search: 'urg', limit: 10 }, context);
    expect(service.list).toHaveBeenCalledWith({
      identityId: 'owner-test',
      search: 'urg',
      limit: 10,
    });
    expect(result).toEqual([
      {
        id: 'label-a',
        name: 'Urgent',
        color: '#ff0000',
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]);
  });

  it('maps service.resolveNames output to LabelClientDTO presentation shape', async () => {
    const service = {
      list: vi.fn().mockResolvedValue([]),
      resolveNames: vi.fn().mockResolvedValue([
        {
          id: 'label-b',
          identityId: 'owner-test',
          name: 'Home',
          normalizedName: 'home',
          color: null,
          createdAt: 2000,
          updatedAt: 2000,
        },
      ]),
    };
    const port = bindLabelReadPort(service);
    const result = await port.resolveNames(['Home'], context);
    expect(service.resolveNames).toHaveBeenCalledWith('owner-test', ['Home']);
    expect(result).toEqual([
      {
        id: 'label-b',
        name: 'Home',
        color: null,
        createdAt: 2000,
        updatedAt: 2000,
      },
    ]);
  });
});
