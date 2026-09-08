import type { PrismaClient } from '@memoflow/database';
import type { IElectronDatabaseTransaction } from '@memoflow/contracts/electron';

export function createScheduleLeasePrismaRepository(
  db: PrismaClient,
): import('../../application/ports/schedule-lease.port').IScheduleLeaseRepository {
  return {
    async tryAcquire(request): Promise<boolean> {
      const now = new Date(request.now);
      try {
        await db.$transaction(async (tx) => {
          // 1) 清掉已过期的旧租约（原子抢占前提）。
          await tx.scheduleLease.deleteMany({
            where: { leaseKey: request.leaseKey, expiresAt: { lte: now } },
          });
          // 2) 抢占：键不存在才创建（并发下只有一个成功）。
          await tx.scheduleLease.create({
            data: {
              id: `${request.leaseKey}:${request.ownerToken}`,
              leaseKey: request.leaseKey,
              ownerToken: request.ownerToken,
              expiresAt: new Date(request.expiresAt),
            },
          });
        });
        return true;
      } catch (error) {
        // `tryAcquire` 的并发 loser 是正常的租约竞争结果，不是基础设施故障。
        // Prisma 用 P2002 表示 lease_key 唯一约束冲突；与 PowerSync adapter
        // 一致，将它投影为 false，让 coordinator 可以进入 standby/retry。
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code?: unknown }).code === 'P2002'
        ) {
          return false;
        }
        throw error;
      }
    },

    async renew(request): Promise<boolean> {
      const result = await db.scheduleLease.updateMany({
        where: {
          leaseKey: request.leaseKey,
          ownerToken: request.ownerToken,
          expiresAt: { gt: new Date(request.now) },
        },
        data: { expiresAt: new Date(request.expiresAt) },
      });
      return result.count > 0;
    },

    async release(leaseKey, ownerToken): Promise<void> {
      await db.scheduleLease.deleteMany({
        where: { leaseKey, ownerToken },
      });
    },
  };
}

export function createScheduleLeasePowerSyncRepository(
  db: IElectronDatabaseTransaction,
): import('../../application/ports/schedule-lease.port').IScheduleLeaseRepository {
  let tableEnsured = false;
  const ensureTable = async () => {
    if (tableEnsured) return;
    await db.execute(`
      CREATE TABLE IF NOT EXISTS schedule_leases (
        id TEXT PRIMARY KEY,
        lease_key TEXT UNIQUE,
        owner_token TEXT,
        expires_at TEXT,
        created_at TEXT,
        updated_at TEXT
      );
    `);
    tableEnsured = true;
  };

  return {
    async tryAcquire(request): Promise<boolean> {
      await ensureTable();
      const nowIso = new Date(request.now).toISOString();
      const expiresIso = new Date(request.expiresAt).toISOString();
      const id = `${request.leaseKey}:${request.ownerToken}`;

      await db.execute('DELETE FROM schedule_leases WHERE lease_key = ? AND expires_at <= ?', [
        request.leaseKey,
        nowIso,
      ]);

      try {
        await db.execute(
          'INSERT INTO schedule_leases (id, lease_key, owner_token, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [id, request.leaseKey, request.ownerToken, expiresIso, nowIso, nowIso],
        );
        return true;
      } catch (_err) {
        return false;
      }
    },

    async renew(request): Promise<boolean> {
      await ensureTable();
      const nowIso = new Date(request.now).toISOString();
      const expiresIso = new Date(request.expiresAt).toISOString();
      const res = await db.execute(
        'UPDATE schedule_leases SET expires_at = ?, updated_at = ? WHERE lease_key = ? AND owner_token = ? AND expires_at > ?',
        [expiresIso, nowIso, request.leaseKey, request.ownerToken, nowIso],
      );
      return res.rowsAffected > 0;
    },

    async release(leaseKey, ownerToken): Promise<void> {
      await ensureTable();
      await db.execute('DELETE FROM schedule_leases WHERE lease_key = ? AND owner_token = ?', [
        leaseKey,
        ownerToken,
      ]);
    },
  };
}
