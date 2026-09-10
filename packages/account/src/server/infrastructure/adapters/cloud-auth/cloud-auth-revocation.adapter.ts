import type { PrismaClient } from '@memoflow/database';
import type { Clock } from '@memoflow/time';
// Structural cloud-auth shape (boundary: scope:account must not import scope:authentication libs directly)
export interface CloudAuthLike {
  revokeAllSessions(identityId: string): Promise<{ revokedSessions: number }>;
  deleteUserData?(identityId: string): Promise<{ deletedRecords: number }>;
}
import type {
  CloudAuthRevocationPort,
  RevokeAuthenticationResult,
  DeleteUserDataResult,
} from '../../../application/ports/cloud-auth-revocation.port';

export class PrismaCloudAuthRevocationAdapter implements CloudAuthRevocationPort {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock,
    private readonly cloudAuth?: CloudAuthLike,
  ) {}

  async revokeAuthentication(identityId: string): Promise<RevokeAuthenticationResult> {
    let revokedSessionsCount = 0;
    if (this.cloudAuth) {
      const res = await this.cloudAuth.revokeAllSessions(identityId);
      revokedSessionsCount = res.revokedSessions;
    } else {
      const sessionResult = await this.prisma.cloudAuthSession.deleteMany({
        where: { userId: identityId },
      });
      await this.prisma.cloudAuthDeviceCode.deleteMany({
        where: { userId: identityId },
      });
      revokedSessionsCount = sessionResult.count;
    }

    await this.prisma.cloudAuthUser.updateMany({
      where: { id: identityId },
      data: {
        disabledAt: new Date(this.clock.now()),
      },
    });

    return {
      revokedSessions: revokedSessionsCount,
      userDisabled: true,
    };
  }

  async deleteUserData(identityId: string): Promise<DeleteUserDataResult> {
    if (this.cloudAuth?.deleteUserData) {
      const res = await this.cloudAuth.deleteUserData(identityId);
      return {
        piiCleanupStatus: res.deletedRecords > 0 ? 'completed' : 'retained_by_policy',
        deletedAt: res.deletedRecords > 0 ? Date.now() : null,
        reason: res.deletedRecords > 0 ? undefined : 'No records eligible for deletion under retention policy',
      };
    }
    return {
      piiCleanupStatus: 'not_performed',
      deletedAt: null,
      reason: 'No automated delete capability configured for cloudAuth adapter',
    };
  }

  async revokeAll(identityId: string): Promise<{ revokedSessions: number }> {
    const res = await this.revokeAuthentication(identityId);
    return { revokedSessions: res.revokedSessions };
  }
}
