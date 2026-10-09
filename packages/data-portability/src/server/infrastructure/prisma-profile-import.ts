import { ProfileImportError } from '../application/profile-import-error';
import { z } from 'zod';
import type { Prisma, PrismaClient, ProfileImportOperation } from '@memoflow/database';
import { BusinessDataSummarySchema, type BusinessDataSummary } from '@memoflow/contracts/account';
import {
  ProfileImportRequestSchema,
  ProfileImportCommitRequestSchema,
  ProfileImportPlanSchema,
  ProfileImportCommittedSchema,
  ProfileImportOperationSchema,
  type PortableCapability,
  type ProfileImportRequest,
  type ProfileImportCommitRequest,
  type ProfileImportCommitted,
  type ProfileImportOperation as ProfileImportOperationResult,
} from '@memoflow/contracts/data-portability';
import { PortableCapabilityRegistry } from '../application/portable-capability';
import { PortableCapabilityCoordinator } from '../application/portable-capability-coordinator';
import { profileImportDigest } from '../application/profile-import-manifest';

interface ProfileImportDependencies {
  capabilities(tx: Prisma.TransactionClient): readonly PortableCapability<unknown>[];
  readSummary(tx: Prisma.TransactionClient, identityId: string): Promise<BusinessDataSummary>;
}

/**
 * V1 bounded import fence. PostgreSQL writers acquire ROW EXCLUSIVE table locks,
 * including API, sync uploads, agents, jobs, raw Mastra writes and FK cascades.
 * This conflicts with SHARE ROW EXCLUSIVE, including writers unaware of imports.
 * ponytail: all accounts pause writes during this <= 15s transaction; replace with
 * a proven per-account write fence if import throughput requires finer granularity.
 */
async function lockProfileImportWrites(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT set_config('lock_timeout', '2000', true)`;
  await tx.$executeRaw`SELECT set_config('statement_timeout', '12000', true)`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(16101337)`;
  const tables = z.array(z.object({ schema: z.string(), name: z.string() })).parse(
    await tx.$queryRaw`
    SELECT n.nspname AS schema, c.relname AS name FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'mastra') AND c.relkind IN ('r', 'p')
    ORDER BY n.nspname, c.relname
  `,
  );
  if (!tables.length) throw new ProfileImportError('TARGET_UNAVAILABLE');
  const quote = (name: string) => '"' + name.replace(/"/g, '""') + '"';
  await tx.$executeRawUnsafe(
    `LOCK TABLE ${tables.map((table) => `${quote(table.schema)}.${quote(table.name)}`).join(', ')} IN SHARE ROW EXCLUSIVE MODE`,
  );
}

export function createPrismaProfileImportService(
  db: PrismaClient,
  dependencies: ProfileImportDependencies,
) {
  const coordinator = (tx: Prisma.TransactionClient) => {
    const registry = new PortableCapabilityRegistry();
    for (const capability of dependencies.capabilities(tx)) registry.register(capability);
    return new PortableCapabilityCoordinator(registry, {
      productVersion: 'profile-import-v1',
      nowIsoString: () => new Date().toISOString(),
      createBatchId: () => {
        throw new Error('Profile imports require a stable batch');
      },
    });
  };
  const identity = (value: string) => z.string().trim().min(1).parse(value);
  const ids = (identityId: string, requestId: string) =>
    `profile-import-${profileImportDigest([identityId, requestId])}`;
  const find = (tx: Prisma.TransactionClient, identityId: string, requestId: string) =>
    tx.profileImportOperation.findUnique({
      where: { identityId_requestId: { identityId, requestId } },
    });
  const assertSource = (row: ProfileImportOperation | null, digest: string) => {
    if (row && row.sourceDigest !== digest) throw new ProfileImportError('IMPORT_REQUEST_CONFLICT');
  };
  async function assertEmpty(tx: Prisma.TransactionClient, identityId: string) {
    const account = await tx.account.findUnique({
      where: { id: identityId },
      select: { status: true },
    });
    if (account?.status !== 'Active') throw new ProfileImportError('TARGET_UNAVAILABLE');
    const summary = BusinessDataSummarySchema.parse(await dependencies.readSummary(tx, identityId));
    if (summary.state === 'non_empty') throw new ProfileImportError('TARGET_NOT_EMPTY');
    if (summary.state !== 'empty') throw new ProfileImportError('TARGET_UNKNOWN');
  }
  async function verify(
    tx: Prisma.TransactionClient,
    row: ProfileImportOperation,
  ): Promise<ProfileImportCommitted> {
    if (row.status !== 'committed' || !row.resultJson)
      throw new ProfileImportError('IMPORT_NOT_COMMITTED');
    const result = ProfileImportCommittedSchema.parse(JSON.parse(row.resultJson));
    let serverVerified = false;
    try {
      const manifests = await coordinator(tx).readProfileManifests(
        row.identityId,
        result.bindings,
        result.manifests.map((entry) => entry.key),
      );
      serverVerified = profileImportDigest(manifests) === profileImportDigest(result.manifests);
    } catch {
      // A committed copy stays committed, but unreadable/changed contents cannot authorize deletion.
    }
    return ProfileImportCommittedSchema.parse({ ...result, serverVerified });
  }

  return {
    async preflight(principal: string, raw: ProfileImportRequest) {
      const identityId = identity(principal);
      const input = ProfileImportRequestSchema.parse(raw);
      const decoded = coordinator(db).decode(input.content);
      const sourceDigest = profileImportDigest(decoded);
      return db.$transaction(
        async (tx) => {
          await lockProfileImportWrites(tx);
          const existing = await find(tx, identityId, input.requestId);
          assertSource(existing, sourceDigest);
          if (existing?.status === 'committed')
            return ProfileImportPlanSchema.parse(JSON.parse(existing.planJson));
          await assertEmpty(tx, identityId);
          const operationId = ids(identityId, input.requestId);
          const prepared = await coordinator(tx).planProfileCopy(
            input.content,
            identityId,
            operationId,
          );
          const plan = ProfileImportPlanSchema.parse({
            schemaVersion: 1,
            operationId,
            requestId: input.requestId,
            batchId: operationId,
            sourceDigest,
            effectiveDigest: prepared.effectiveDigest,
            blockers: prepared.blockers,
            preview: prepared.preview,
          });
          await tx.profileImportOperation.upsert({
            where: { identityId_requestId: { identityId, requestId: input.requestId } },
            create: {
              id: operationId,
              identityId,
              requestId: input.requestId,
              sourceDigest,
              effectiveDigest: plan.effectiveDigest,
              status: 'pending',
              planJson: JSON.stringify(plan),
            },
            update: { effectiveDigest: plan.effectiveDigest, planJson: JSON.stringify(plan) },
          });
          return plan;
        },
        { timeout: 15_000, maxWait: 2000 },
      );
    },

    async commit(
      principal: string,
      raw: ProfileImportCommitRequest,
    ): Promise<ProfileImportCommitted> {
      const identityId = identity(principal);
      const input = ProfileImportCommitRequestSchema.parse(raw);
      const sourceDigest = profileImportDigest(coordinator(db).decode(input.content));
      return db.$transaction(
        async (tx) => {
          await lockProfileImportWrites(tx);
          const existing = await find(tx, identityId, input.requestId);
          assertSource(existing, sourceDigest);
          if (!existing) throw new ProfileImportError('IMPORT_PREFLIGHT_REQUIRED');
          if (existing.status === 'committed') return verify(tx, existing);
          await assertEmpty(tx, identityId);
          const prepared = await coordinator(tx).planProfileCopy(
            input.content,
            identityId,
            existing.id,
          );
          if (
            prepared.effectiveDigest !== input.effectiveDigest ||
            existing.effectiveDigest !== input.effectiveDigest
          ) {
            throw new ProfileImportError('TARGET_CHANGED');
          }
          const applied = await coordinator(tx).applyProfileCopy(
            prepared.effectiveContent,
            identityId,
            existing.id,
          );
          const result = ProfileImportCommittedSchema.parse({
            status: 'committed',
            plan: JSON.parse(existing.planJson),
            ...applied,
            committedAt: new Date().toISOString(),
            serverVerified: true,
          });
          await tx.profileImportOperation.update({
            where: { id: existing.id },
            data: { status: 'committed', resultJson: JSON.stringify(result) },
          });
          return result;
        },
        { timeout: 15_000, maxWait: 2000 },
      );
    },

    async get(principal: string, requestId: string): Promise<ProfileImportOperationResult> {
      const identityId = identity(principal);
      ProfileImportRequestSchema.shape.requestId.parse(requestId);
      return db.$transaction(
        async (tx) => {
          const row = await find(tx, identityId, requestId);
          if (!row) throw new ProfileImportError('IMPORT_NOT_FOUND');
          if (row.status === 'committed') return verify(tx, row);
          return ProfileImportOperationSchema.parse({
            status: row.status,
            plan: JSON.parse(row.planJson),
          });
        },
        { isolationLevel: 'RepeatableRead', timeout: 15_000, maxWait: 2000 },
      );
    },
  };
}

export type ProfileImportApplicationPort = ReturnType<typeof createPrismaProfileImportService>;
