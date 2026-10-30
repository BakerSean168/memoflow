import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PowerSyncDatabase } from '@powersync/node';
import { PowerSyncAppSchema } from '@memoflow/powersync-schema';
import { expect, it } from 'vitest';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import { GoalId, GoalPolicy } from '../../../domain';
import { CreateGoalUseCase } from '../../../application/use-cases/commands/create-goal.use-case';
import { GoalWorkspaceQueryService } from '../../../application/services/goal-workspace-query.service';
import { createGoalPowerSyncAgentMutations } from './goal-agent-mutations';
import { GoalPowerSyncRepository } from './goal-powersync.repository';
import { GoalRecordPowerSyncRepository } from './goal-record-powersync.repository';
import { PowerSyncGoalWriteTransactionRunner } from './powersync-goal-write-transaction-runner';

// Real PowerSync views/triggers and owner transactions; external contexts are
// unavailable here so this test isolates durable Goal/KR/Record authority.
it.each(['ui', 'native-goal-create', 'native-panel-save'])(
  'reads the %s receipt from list and workspace before and after reopening the Profile',
  async (source) => {
    const directory = await mkdtemp(join(tmpdir(), 'goal-workspace-'));
    const path = join(directory, 'profile.db');
    let db = new PowerSyncDatabase({ schema: PowerSyncAppSchema, database: { dbFilename: path } });
    const identityId = `IdentityId_${randomUUID()}`;
    const cx: ExecutionContext = {
      identityId,
      requestId: randomUUID(),
      traceId: randomUUID(),
      source: 'ipc',
      startedAt: 1,
    };
    const input = {
      name: 'Learn full stack and AI Agents',
      initialKeyResults: [
        { title: 'Ship an Agent', calculationMethod: 'Sum' as const, targetValue: 3, weight: 1 },
      ],
    };
    const events = { publish: async () => {} };
    try {
      await db.waitForReady();
      const repository = new GoalPowerSyncRepository(db, events);
      const runner = new PowerSyncGoalWriteTransactionRunner(db, events);
      let goalId: string;
      let version: number;
      if (source === 'native-goal-create') {
        const mutations = createGoalPowerSyncAgentMutations(db, events);
        const request = { idempotencyKey: 'create-once', goal: input };
        const authority = { connectionId: 'test-connection', authorize: async () => {} };
        const receipt = await mutations.create(request, cx, authority);
        expect(await mutations.create(request, cx, authority)).toEqual(receipt);
        goalId = receipt.result.goalId;
        version = receipt.result.goalVersion;
      } else {
        const lease = { runId: randomUUID(), token: randomUUID(), fence: 1 };
        if (source === 'native-panel-save') {
          await db.execute(
            'CREATE TABLE ai_goal_surface_leases (identity_id TEXT, run_id TEXT, owner_token TEXT, fence INTEGER, expires_at INTEGER, PRIMARY KEY (identity_id, run_id))',
          );
          await db.execute(
            'INSERT INTO ai_goal_surface_leases (identity_id, run_id, owner_token, fence, expires_at) VALUES (?, ?, ?, ?, ?)',
            [identityId, lease.runId, lease.token, lease.fence, Date.now() + 60_000],
          );
        }
        const create = new CreateGoalUseCase(repository, new GoalPolicy(), runner);
        const request = {
          ...input,
          ...(source === 'native-panel-save'
            ? { id: GoalId.generate(), nativeAiLease: lease }
            : {}),
        };
        const receipt = await create.execute(request, cx);
        if (source === 'native-panel-save')
          expect(await create.execute(request, cx)).toEqual(receipt);
        expect(receipt.ok).toBe(true);
        if (!receipt.ok) throw new Error(receipt.error.code);
        goalId = receipt.data.goalId;
        version = receipt.data.goalVersion;
      }
      const read = async () => {
        const goals = new GoalPowerSyncRepository(db, events);
        const unavailable = async (): Promise<never> => {
          throw new Error('offline');
        };
        const workspace = new GoalWorkspaceQueryService({
          goalRepository: goals,
          goalRecordRepository: new GoalRecordPowerSyncRepository(db),
          taskContextReadPort: {
            getTaskGoalContextSummary: unavailable,
            listTasksByGoal: unavailable,
            listTasksByKeyResult: unavailable,
          },
          knowledgeRelationReadPort: { listEdgeRefsForGoal: unavailable },
          knowledgeContextReadPort: { resolveForWorkspace: unavailable },
        });
        expect((await goals.findByIdentityId(identityId)).map((goal) => goal.id)).toContain(goalId);
        const result = await workspace.getWorkspace(identityId, goalId);
        expect(result).toMatchObject({
          ok: true,
          data: {
            goal: {
              id: goalId,
              name: input.name,
              version,
              keyResults: [{ title: 'Ship an Agent' }],
            },
            recentProgress: [],
            recentReviews: [],
          },
        });
        await expect(
          workspace.getWorkspace(`IdentityId_${randomUUID()}`, goalId),
        ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      };
      await read();
      await read(); // leave and re-enter without creating again
      await db.close();
      db = new PowerSyncDatabase({ schema: PowerSyncAppSchema, database: { dbFilename: path } });
      await db.waitForReady();
      await read();
      expect(await db.getAll('SELECT id FROM goals')).toHaveLength(1);
    } finally {
      await db.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
