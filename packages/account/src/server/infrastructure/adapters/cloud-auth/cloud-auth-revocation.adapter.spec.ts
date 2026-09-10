import { describe, expect, it, vi } from 'vitest';
import { createFixedClock } from '@memoflow/time';
import { PrismaCloudAuthRevocationAdapter } from './cloud-auth-revocation.adapter';

const IDENTITY_ID = 'IdentityId_00000000-0000-4000-8000-000000000001';
const CLOSED_AT = new Date('2026-09-10T12:34:56.789Z');

function createPrisma() {
  return {
    cloudAuthSession: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
    cloudAuthDeviceCode: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    cloudAuthUser: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  } as never;
}

describe('PrismaCloudAuthRevocationAdapter', () => {
  it('delegates cloud revocation, then writes disabledAt exactly once from Clock', async () => {
    const prisma = createPrisma() as {
      cloudAuthUser: { updateMany: ReturnType<typeof vi.fn> };
      cloudAuthSession: { deleteMany: ReturnType<typeof vi.fn> };
      cloudAuthDeviceCode: { deleteMany: ReturnType<typeof vi.fn> };
    };
    const cloudAuth = { revokeAllSessions: vi.fn().mockResolvedValue({ revokedSessions: 4 }) };
    const adapter = new PrismaCloudAuthRevocationAdapter(
      prisma as never,
      createFixedClock(CLOSED_AT.getTime()),
      cloudAuth,
    );

    await expect(adapter.revokeAuthentication(IDENTITY_ID)).resolves.toMatchObject({
      revokedSessions: 4,
      userDisabled: true,
    });
    expect(cloudAuth.revokeAllSessions).toHaveBeenCalledWith(IDENTITY_ID);
    expect(prisma.cloudAuthUser.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.cloudAuthUser.updateMany).toHaveBeenCalledWith({
      where: { id: IDENTITY_ID },
      data: { disabledAt: CLOSED_AT },
    });
    expect(prisma.cloudAuthSession.deleteMany).not.toHaveBeenCalled();
    expect(prisma.cloudAuthDeviceCode.deleteMany).not.toHaveBeenCalled();
  });

  it('revokes the Prisma fallback, then writes the same Clock projection exactly once', async () => {
    const prisma = createPrisma() as {
      cloudAuthUser: { updateMany: ReturnType<typeof vi.fn> };
      cloudAuthSession: { deleteMany: ReturnType<typeof vi.fn> };
      cloudAuthDeviceCode: { deleteMany: ReturnType<typeof vi.fn> };
    };
    const adapter = new PrismaCloudAuthRevocationAdapter(
      prisma as never,
      createFixedClock(CLOSED_AT.getTime()),
    );

    await expect(adapter.revokeAuthentication(IDENTITY_ID)).resolves.toMatchObject({
      revokedSessions: 2,
      userDisabled: true,
    });
    expect(prisma.cloudAuthSession.deleteMany).toHaveBeenCalledWith({
      where: { userId: IDENTITY_ID },
    });
    expect(prisma.cloudAuthDeviceCode.deleteMany).toHaveBeenCalledWith({
      where: { userId: IDENTITY_ID },
    });
    expect(prisma.cloudAuthUser.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.cloudAuthUser.updateMany).toHaveBeenCalledWith({
      where: { id: IDENTITY_ID },
      data: { disabledAt: CLOSED_AT },
    });
  });
});
