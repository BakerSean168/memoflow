import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { Mastra } from '@mastra/core/mastra';
import {
  AiAssistedWorkflowRepository, MastraDurableWorkflowRuntime, createMastraStorage,
  createTaskCreateWorkflow, ApplyTaskPlanService,
  createGoalCreateWorkflow, ApplyGoalPlanService,
  createKnowledgeCaptureWorkflow, ApplyKnowledgeNoteService,
} from '@memoflow/ai';
import { prisma } from '@memoflow/database';
import { externalMutationReceiptId } from '@memoflow/database/transaction';
import { createScopedPatService } from '@memoflow/cloud-auth/server';
import { createAccountPrismaActiveQuery } from '@memoflow/account';
import { createTimeContext } from '@memoflow/time';
import { GatewayReadError, type GatewayWriteAuthority } from '@memoflow/agent-gateway';
import { GatewayTaskReceiptSchema, type AssistedView } from '@memoflow/contracts/agent-gateway';
import { TaskPlanDraftContentSchema, type TaskPlanningDecision } from '@memoflow/contracts/ai';
import { cleanAll, seedAccount, disconnectPrisma } from '@memoflow/test-utils/setup/integration-helpers';
import { bindAssistedWorkflow } from './assisted-workflow';
import { bindGatewayWrites } from './write.port';

const databaseUrl = process.env.DATABASE_URL!;
const schemaName = 'assisted_538_runtime';
const close: Array<() => Promise<void>> = [];
const time = { getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }) };
const unreachable = async (): Promise<never> => { throw new Error('Internal owner path must never be used externally'); };
const candidateDraft = TaskPlanDraftContentSchema.parse({
  task: { draftRef: 'task:report', title: 'Prepare report', labels: [],
    schedule: { kind: 'OneTime', date: '2026-11-01', timing: { kind: 'AllDay' } } },
});
const draftDecision: TaskPlanningDecision = { status: 'draft_ready', reason: 'Ready', candidateDraft };
const cx = (identityId: string) => ({ identityId, source: 'http' as const,
  requestId: randomUUID(), traceId: '538', startedAt: Date.now() });
const pats = createScopedPatService({ database: prisma, audience: 'http://localhost:538/mcp',
  accountIsActive: createAccountPrismaActiveQuery(prisma) });
let owner: string, other: string, authority: GatewayWriteAuthority, second: GatewayWriteAuthority, foreign: GatewayWriteAuthority;
let consent: { providerId: string; providerVersion: number; modelId: string; acceptFees: true };

async function credential(identityId: string): Promise<GatewayWriteAuthority> {
  const pat = await pats.create(identityId, { name: 'Assisted fixture', scopes: ['tasks:write'] });
  return { connectionId: pat.id, scopes: pat.scopes,
    authorize: async () => {
      const principal = await pats.authenticate(`Bearer ${pat.secret}`);
      if (!principal) throw new GatewayReadError('FORBIDDEN');
    } };
}
async function fixture(decisions: TaskPlanningDecision[] = [draftDecision]) {
  const storage = createMastraStorage({ kind: 'postgres', connectionString: databaseUrl, schemaName });
  const plan = vi.fn(async () => decisions.shift() ?? draftDecision);
  const taskCreateWorkflow = createTaskCreateWorkflow({ planner: { plan },
    applyService: new ApplyTaskPlanService({ readTaskPlan: unreachable, resolveLabels: unreachable, createTaskPlan: unreachable }) });
  const goalCreateWorkflow = createGoalCreateWorkflow({ planner: { plan: unreachable },
    applyService: new ApplyGoalPlanService({ readGoal: unreachable, resolveLabels: unreachable, createGoal: unreachable,
      activateGoal: unreachable, createTaskPlan: unreachable, createKnowledgeDocument: unreachable, linkGoalKnowledge: unreachable }) });
  const knowledgeCaptureWorkflow = createKnowledgeCaptureWorkflow({ planner: { plan: unreachable },
    applyService: new ApplyKnowledgeNoteService({ createConfirmedKnowledgeNote: unreachable }) });
  new Mastra({ storage, workflows: { taskCreateWorkflow, goalCreateWorkflow, knowledgeCaptureWorkflow } });
  await storage.init();
  close.push(() => storage.close());
  const runtime = new MastraDurableWorkflowRuntime({ storage, history: { appendUserTurn: unreachable },
    taskCreateWorkflow, goalCreateWorkflow, knowledgeCaptureWorkflow });
  const repository = new AiAssistedWorkflowRepository(prisma, databaseUrl);
  const writes = vi.fn((guard: { handleId: string; pendingJson: string }) => bindGatewayWrites(prisma, time, { assistedGuard: guard }));
  const service = bindAssistedWorkflow({ repository, runtime, writes,
    recoverStep: async (row) => {
      if (!row.stepKey) return null;
      const id = externalMutationReceiptId(row.identityId, { connectionId: row.connectionId }, 'task.plan.create.v1', row.stepKey);
      const receipt = await prisma.externalMutationReceipt.findUnique({ where: { id } });
      return receipt ? GatewayTaskReceiptSchema.parse({ ...JSON.parse(receipt.resultJson), replayed: true }) : null;
    } });
  return { service, runtime, plan, storage, writes };
}
const startInput = () => ({ kind: 'task.create', idempotencyKey: 'start', input: { idea: 'Prepare a report' }, consent });
const handleInput = (view: AssistedView) => ({ handle: view.handle, expectedRevision: view.revision });
const approve = (view: AssistedView) => ({ ...handleInput(view), reviewToken: view.reviewToken, command: { type: 'approve' } });

beforeEach(async () => {
  for (const dispose of close.splice(0)) await dispose();
  await cleanAll();
  owner = randomUUID(); other = randomUUID();
  await seedAccount({ id: owner }); await seedAccount({ id: other });
  authority = await credential(owner); second = await credential(owner); foreign = await credential(other);
  const providerId = randomUUID();
  await prisma.aiProviderConfig.create({ data: { id: providerId, identityId: owner, name: 'User-selected BYOK',
    providerDefinitionId: 'openai', baseUrl: 'https://api.openai.com/v1', credentialRef: 'fixture-no-network', defaultModel: 'selected-model' } });
  consent = { providerId, providerVersion: 1, modelId: 'selected-model', acceptFees: true };
});
afterAll(async () => { for (const dispose of close.splice(0)) await dispose(); await disconnectPrisma(); });

it('establishes handle/run durably, recovers lost start acknowledgement after restart, and isolates two identities/connections', async () => {
  const first = await fixture();
  const accepted = await first.service.start(startInput(), cx(owner), authority);
  expect(accepted.run).toMatchObject({ kind: 'task.create', status: 'suspended', suspension: { type: 'task_draft_review' } });
  expect(await prisma.aiAssistedWorkflow.count()).toBe(1);
  await first.storage.close(); close.pop();
  await prisma.$disconnect();
  const restarted = await fixture();
  const replay = await restarted.service.start(startInput(), cx(owner), authority);
  expect(replay).toEqual(accepted);
  expect(restarted.plan).not.toHaveBeenCalled();
  await expect(restarted.service.get(handleInput(accepted), cx(owner), second)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(restarted.service.get(handleInput(accepted), cx(other), foreign)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(restarted.service.start({ ...startInput(), input: { idea: 'Changed' } }, cx(owner), authority)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
});
