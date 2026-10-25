import { IdentityId } from '@memoflow/domain-shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { Mastra } from '@mastra/core/mastra';
import {
  MastraDurableWorkflowRuntime,
  createTaskCreateWorkflow,
  ApplyTaskPlanService,
  createGoalCreateWorkflow,
  ApplyGoalPlanService,
  createKnowledgeCaptureWorkflow,
  ApplyKnowledgeNoteService,
} from '@memoflow/ai/testing';
import { createMastraStorage } from '@memoflow/ai';
import {
  AiAssistedWorkflowRepository,
  AiAssistedWorkflowError,
  taskWorkflowEntityId,
} from '@memoflow/ai/agent-gateway';
import { prisma } from '@memoflow/database';
import { externalMutationReceiptId } from '@memoflow/database/transaction';
import { createScopedPatService } from '@memoflow/cloud-auth/server';
import { createAccountPrismaActiveQuery } from '@memoflow/account';
import { createTimeContext } from '@memoflow/time';
import { GatewayReadError, type GatewayWriteAuthority } from '@memoflow/agent-gateway';
import { GatewayTaskReceiptSchema, type AssistedView } from '@memoflow/contracts/agent-gateway';
import { TaskPlanDraftContentSchema, type TaskPlanningDecision } from '@memoflow/contracts/ai';
import {
  cleanAll,
  seedAccount,
  disconnectPrisma,
} from '@memoflow/test-utils/setup/integration-helpers';
import { bindAssistedWorkflow } from './assisted-workflow';
import { bindGatewayWrites } from './write.port';

const databaseUrl = process.env.DATABASE_URL!;
const schemaName = 'assisted_538_runtime';
const close: Array<() => Promise<void>> = [];
const time = {
  getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
};
const unreachable = async (): Promise<never> => {
  throw new Error('Internal owner path must never be used externally');
};
const candidateDraft = TaskPlanDraftContentSchema.parse({
  task: {
    draftRef: 'task:report',
    title: 'Prepare report',
    labels: [],
    schedule: { kind: 'OneTime', date: '2026-11-01', timing: { kind: 'AllDay' } },
  },
});
const draftDecision: TaskPlanningDecision = {
  status: 'draft_ready',
  reason: 'Ready',
  candidateDraft,
};
const cx = (identityId: string) => ({
  identityId,
  source: 'http' as const,
  requestId: randomUUID(),
  traceId: '538',
  startedAt: Date.now(),
});
const pats = createScopedPatService({
  database: prisma,
  audience: 'http://localhost:538/mcp',
  accountIsActive: createAccountPrismaActiveQuery(prisma),
});
let owner: string,
  other: string,
  authority: GatewayWriteAuthority,
  second: GatewayWriteAuthority,
  foreign: GatewayWriteAuthority;
let consent: { providerId: string; providerVersion: number; modelId: string; acceptFees: true };

async function credential(identityId: string): Promise<GatewayWriteAuthority> {
  const pat = await pats.create(identityId, { name: 'Assisted fixture', scopes: ['tasks:write'] });
  return {
    connectionId: pat.id,
    scopes: pat.scopes,
    authorize: async () => {
      const principal = await pats.authenticate(`Bearer ${pat.secret}`);
      if (!principal) throw new GatewayReadError('FORBIDDEN');
    },
  };
}
async function fixture(decisions: TaskPlanningDecision[] = [draftDecision]) {
  const storage = createMastraStorage({
    kind: 'postgres',
    connectionString: databaseUrl,
    schemaName,
  });
  const plan = vi.fn(async () => decisions.shift() ?? draftDecision);
  const taskCreateWorkflow = createTaskCreateWorkflow({
    planner: { plan },
    applyService: new ApplyTaskPlanService({
      readTaskPlan: unreachable,
      resolveLabels: unreachable,
      createTaskPlan: unreachable,
    }),
  });
  const goalCreateWorkflow = createGoalCreateWorkflow({
    planner: { plan: unreachable },
    applyService: new ApplyGoalPlanService({
      readGoal: unreachable,
      resolveLabels: unreachable,
      createGoal: unreachable,
      activateGoal: unreachable,
      createTaskPlan: unreachable,
      createKnowledgeDocument: unreachable,
      linkGoalKnowledge: unreachable,
    }),
  });
  const knowledgeCaptureWorkflow = createKnowledgeCaptureWorkflow({
    planner: { plan: unreachable },
    applyService: new ApplyKnowledgeNoteService({ createConfirmedKnowledgeNote: unreachable }),
  });
  new Mastra({
    storage,
    workflows: { taskCreateWorkflow, goalCreateWorkflow, knowledgeCaptureWorkflow },
  });
  await storage.init();
  close.push(() => storage.close());
  const runtime = new MastraDurableWorkflowRuntime({
    storage,
    history: { appendUserTurn: unreachable },
    taskCreateWorkflow,
    goalCreateWorkflow,
    knowledgeCaptureWorkflow,
  });
  const repository = new AiAssistedWorkflowRepository(prisma, databaseUrl);
  const writes = vi.fn((guard: { handleId: string; pendingJson: string; taskId: string }) =>
    bindGatewayWrites(prisma, time, { assistedGuard: guard }),
  );
  const service = bindAssistedWorkflow({
    repository,
    runtime,
    writes,
    recoverStep: async (row) => {
      if (!row.stepKey) return null;
      const id = externalMutationReceiptId(
        row.identityId,
        { connectionId: row.connectionId },
        'task.plan.create.v1',
        row.stepKey,
      );
      const receipt = await prisma.externalMutationReceipt.findUnique({ where: { id } });
      return receipt
        ? GatewayTaskReceiptSchema.parse({ ...JSON.parse(receipt.resultJson), replayed: true })
        : null;
    },
  });
  return { service, runtime, plan, storage, writes, repository };
}
const startInput = () => ({
  kind: 'task.create',
  idempotencyKey: 'start',
  input: { idea: 'Prepare a report' },
  consent,
});
const handleInput = (view: AssistedView) => ({
  handle: view.handle,
  expectedRevision: view.revision,
});
const approve = (view: AssistedView) => ({
  ...handleInput(view),
  reviewToken: view.reviewToken,
  command: { type: 'approve' },
});

beforeEach(async () => {
  for (const dispose of close.splice(0)) await dispose();
  await cleanAll();
  owner = String(IdentityId.generate());
  other = String(IdentityId.generate());
  await seedAccount({ id: owner });
  await seedAccount({ id: other });
  authority = await credential(owner);
  second = await credential(owner);
  foreign = await credential(other);
  const providerId = randomUUID();
  await prisma.aiProviderConfig.create({
    data: {
      id: providerId,
      identityId: owner,
      name: 'User-selected BYOK',
      providerDefinitionId: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      credentialRef: 'fixture-no-network',
      defaultModel: 'selected-model',
    },
  });
  consent = { providerId, providerVersion: 1, modelId: 'selected-model', acceptFees: true };
});
afterAll(async () => {
  for (const dispose of close.splice(0)) await dispose();
  await disconnectPrisma();
});

it('establishes handle/run durably, recovers lost start acknowledgement after restart, and isolates two identities/connections', async () => {
  const first = await fixture();
  await expect(
    first.service.start(
      { ...startInput(), consent: { ...consent, modelId: 'not-configured' } },
      cx(owner),
      authority,
    ),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(
    first.service.start(
      { ...startInput(), consent: { ...consent, providerVersion: 99 } },
      cx(owner),
      authority,
    ),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(
    first.service.start(
      { ...startInput(), consent: { ...consent, acceptFees: false } },
      cx(owner),
      authority,
    ),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(await prisma.aiAssistedWorkflow.count()).toBe(0);
  const durableStart = first.runtime.start.bind(first.runtime);
  vi.spyOn(first.runtime, 'start').mockImplementationOnce(async (input) => {
    await durableStart(input);
    throw new Error('Injected lost acknowledgement after durable run creation');
  });
  await expect(first.service.start(startInput(), cx(owner), authority)).rejects.toThrow(
    'lost acknowledgement',
  );
  expect(await prisma.aiAssistedWorkflow.count()).toBe(1);
  await first.storage.close();
  close.pop();
  await prisma.$disconnect();
  const restarted = await fixture();
  const accepted = await restarted.service.start(startInput(), cx(owner), authority);
  expect(accepted.run).toMatchObject({
    kind: 'task.create',
    status: 'suspended',
    suspension: { type: 'task_draft_review' },
  });
  const replay = await restarted.service.start(startInput(), cx(owner), authority);
  expect(replay).toEqual(accepted);
  expect(restarted.plan).not.toHaveBeenCalled();
  await expect(
    restarted.service.get(handleInput(accepted), cx(owner), second),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(
    restarted.service.get(handleInput(accepted), cx(other), foreign),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(
    restarted.service.start({ ...startInput(), input: { idea: 'Changed' } }, cx(owner), authority),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
});

it('binds answers and approval to the current typed ask/review, rejects stale revision and forged approval', async () => {
  const f = await fixture([
    { status: 'needs_clarification', reason: 'Need date', questions: ['When?'] },
    draftDecision,
  ]);
  const ask = await f.service.start(startInput(), cx(owner), authority);
  expect(ask.run.suspension?.type).toBe('clarification_required');
  await expect(f.service.resume(approve(ask), cx(owner), authority)).rejects.toMatchObject({
    code: 'VALIDATION_ERROR',
  });
  await expect(
    f.service.resume({ ...handleInput(ask), approved: true }, cx(owner), authority),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  const review = await f.service.resume(
    {
      ...handleInput(ask),
      reviewToken: ask.reviewToken,
      command: { type: 'answer', answers: ['2026-11-01'] },
    },
    cx(owner),
    authority,
  );
  expect(review.revision).toBe(ask.revision + 1);
  expect(review.run.suspension?.type).toBe('task_draft_review');
  expect(await f.service.get({ handle: ask.handle }, cx(owner), authority)).toEqual(review);
  await expect(f.service.get(handleInput(ask), cx(owner), authority)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  await expect(
    f.service.resume({ ...approve(review), reviewToken: ask.reviewToken }, cx(owner), authority),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  const applied = await f.service.resume(approve(review), cx(owner), authority);
  expect(applied.run.status).toBe('completed');
  expect(applied.steps).toHaveLength(1);
  expect(applied.steps[0]?.result).toMatchObject({
    kind: 'plan',
    plan: {
      id:
        review.run.suspension?.type === 'task_draft_review'
          ? review.run.suspension.ownerCreate.taskId
          : 'missing-review',
    },
  });
  expect(await prisma.taskPlan.count({ where: { identityId: owner } })).toBe(1);
  expect(f.plan).toHaveBeenCalledTimes(2);
  await expect(f.service.resume(approve(review), cx(owner), authority)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  expect(await f.service.get(handleInput(applied), cx(owner), authority)).toEqual(applied);
});

it('checks consent before saving an answer and clears a stale pending resume so cancel can proceed', async () => {
  const f = await fixture([
    { status: 'needs_clarification', reason: 'Need date', questions: ['When?'] },
    draftDecision,
  ]);
  const ask = await f.service.start(startInput(), cx(owner), authority);
  const row = await f.repository.find(ask.handle, owner, authority.connectionId);
  if (!row) throw new Error('Assisted workflow row missing');
  const answer = {
    handle: ask.handle,
    expectedRevision: ask.revision,
    reviewToken: ask.reviewToken,
    command: { type: 'answer' as const, answers: ['2026-11-01'] },
  };

  await prisma.aiProviderConfig.update({
    where: { id: consent.providerId },
    data: { isActive: false },
  });
  await expect(f.service.resume(answer, cx(owner), authority)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(
    (await f.repository.find(ask.handle, owner, authority.connectionId))?.pendingJson,
  ).toBeNull();

  await f.repository.save(row.id, {
    pendingJson: JSON.stringify({
      type: 'resume',
      command: answer.command,
      beforeDigest: 'stale-after-process-crash',
    }),
  });
  const recovered = await f.service.get(handleInput(ask), cx(owner), authority);
  expect(recovered.run).toMatchObject({
    status: 'suspended',
    suspension: { type: 'recovery_required', retryable: false },
  });
  expect(
    (await f.repository.find(ask.handle, owner, authority.connectionId))?.pendingJson,
  ).toBeNull();
  expect(f.plan).toHaveBeenCalledTimes(1);
  const cancelled = await f.service.cancel(handleInput(recovered), cx(owner), authority);
  expect(cancelled.run.status).toBe('cancelled');
  expect(f.plan).toHaveBeenCalledTimes(1);
});

it('clears a persisted resume intent when the live grant check fails before dispatch', async () => {
  const f = await fixture();
  const review = await f.service.start(startInput(), cx(owner), authority);
  let authorizations = 0;
  const changingGrant: GatewayWriteAuthority = {
    ...authority,
    authorize: async () => {
      authorizations += 1;
      if (authorizations === 3) throw new GatewayReadError('FORBIDDEN');
      await authority.authorize();
    },
  };

  const recovered = await f.service.resume(approve(review), cx(owner), changingGrant);

  expect(authorizations).toBe(3);
  expect(recovered.run).toMatchObject({
    status: 'suspended',
    suspension: { type: 'recovery_required', retryable: false },
  });
  expect(
    (await f.repository.find(review.handle, owner, authority.connectionId))?.pendingJson,
  ).toBeNull();
  expect(f.plan).toHaveBeenCalledTimes(1);
  const cancelled = await f.service.cancel(handleInput(recovered), cx(owner), authority);
  expect(cancelled.run.status).toBe('cancelled');
  expect(f.plan).toHaveBeenCalledTimes(1);
});

it('gives cancel precedence over an unacknowledged pending approval', async () => {
  const f = await fixture();
  const review = await f.service.start(startInput(), cx(owner), authority);
  const row = await f.repository.find(review.handle, owner, authority.connectionId);
  if (!row) throw new Error('Assisted workflow row missing');
  await f.repository.save(row.id, {
    pendingJson: JSON.stringify({
      type: 'resume',
      command: { type: 'approve' },
      beforeDigest: 'lost-resume-ack',
    }),
  });

  const cancelled = await f.service.cancel(handleInput(review), cx(owner), authority);
  expect(cancelled.run.status).toBe('cancelled');
  expect(cancelled.steps).toEqual([]);
  expect(await prisma.taskPlan.count({ where: { identityId: owner } })).toBe(0);
  expect(await prisma.externalMutationReceipt.count({ where: { identityId: owner } })).toBe(0);
});

it('routes an in-flight durable run through recoverTask after API restart', async () => {
  const f = await fixture();
  const review = await f.service.start(startInput(), cx(owner), authority);
  const row = await f.repository.find(review.handle, owner, authority.connectionId);
  if (!row) throw new Error('Assisted workflow row missing');
  await f.repository.save(row.id, { pendingJson: JSON.stringify({ type: 'start' }) });
  const running = { ...review.run, status: 'running' as const, suspension: undefined };
  vi.spyOn(f.runtime, 'get').mockResolvedValueOnce(running);
  const recoverTask = vi.spyOn(f.runtime, 'recoverTask').mockResolvedValue(review.run);

  const recovered = await f.service.get(handleInput(review), cx(owner), authority);

  expect(recoverTask).toHaveBeenCalledWith(
    expect.objectContaining({
      runId: row.runId,
      context: expect.objectContaining({ identityId: owner }),
    }),
  );
  expect(recovered.revision).toBe(review.revision + 1);
  expect(recovered.run).toEqual(review.run);
  expect(f.plan).toHaveBeenCalledTimes(1);
});

it('revokes before resume and immediately before owner apply without creating a Task', async () => {
  const f = await fixture();
  const review = await f.service.start(startInput(), cx(owner), authority);
  await pats.revoke(owner, authority.connectionId);
  for (const operation of [f.service.get, f.service.review, f.service.cancel])
    await expect(operation(handleInput(review), cx(owner), authority)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  await expect(f.service.resume(approve(review), cx(owner), authority)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  const fresh = await f.service.start(
    { ...startInput(), idempotencyKey: 'fresh' },
    cx(owner),
    second,
  );
  f.writes.mockImplementation((guard) => {
    const real = bindGatewayWrites(prisma, time, { assistedGuard: guard });
    return {
      ...real,
      taskCreate: async (...args) => {
        await pats.revoke(owner, second.connectionId);
        return real.taskCreate(...args);
      },
    };
  });
  const denied = await f.service.resume(approve(fresh), cx(owner), second);
  expect(denied.run).toMatchObject({
    status: 'suspended',
    suspension: { type: 'recovery_required', retryable: false },
  });
  expect(await prisma.taskPlan.count({ where: { identityId: owner } })).toBe(0);
});

it('enforces the assisted handle binding and live PAT authority inside the Task owner transaction', async () => {
  const f = await fixture();
  const review = await f.service.start(startInput(), cx(owner), authority);
  const row = await f.repository.find(review.handle, owner, authority.connectionId);
  if (!row) throw new Error('Assisted workflow row missing');
  const taskInput = {
    idempotencyKey: 'transaction-guard-denied',
    plan: {
      name: 'Must not be created',
      schedule: candidateDraft.task.schedule,
      importance: 'Moderate',
      labelIds: [],
    },
  };
  const taskId = taskWorkflowEntityId({
    workflowRunId: row.runId,
    revision: review.revision,
    draftRef: 'task:guard',
    operation: 'task_plan_create',
  });
  const attempt = async (
    guard: { handleId: string; pendingJson: string; taskId: string },
    identityId = owner,
    granted = authority,
  ) =>
    bindGatewayWrites(prisma, time, { assistedGuard: guard }).taskCreate(
      taskInput,
      cx(identityId),
      granted,
    );

  await expect(
    attempt({ handleId: row.id, pendingJson: '{"type":"cancel"}', taskId }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });

  const foreignRow = await f.repository.create({
    id: randomUUID(),
    identityId: other,
    connectionId: foreign.connectionId,
    kind: 'task.create',
    runId: randomUUID(),
    requestKey: 'foreign-guard',
    requestDigest: 'foreign-guard',
    requestJson: '{}',
    pendingJson: null,
  });
  await expect(
    attempt({ handleId: foreignRow.id, pendingJson: 'null', taskId }, owner, authority),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });

  await pats.revoke(owner, authority.connectionId);
  await expect(attempt({ handleId: row.id, pendingJson: 'null', taskId })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(await prisma.taskPlan.count({ where: { identityId: owner } })).toBe(0);
  expect(await prisma.externalMutationReceipt.count({ where: { identityId: owner } })).toBe(0);
});

it('keeps a committed owner receipt recoverable when the connection lock is lost', async () => {
  const f = await fixture();
  const review = await f.service.start(startInput(), cx(owner), authority);
  let lockChecks = 0;
  vi.spyOn(f.repository, 'locked').mockImplementation(async (_key, work) =>
    work(() => {
      lockChecks += 1;
      if (lockChecks >= 4) throw new AiAssistedWorkflowError('LOCK_LOST');
    }),
  );
  const save = vi.spyOn(f.repository, 'save');

  await expect(f.service.resume(approve(review), cx(owner), authority)).rejects.toMatchObject({
    code: 'LOCK_LOST',
  });
  const savedSteps = save.mock.calls.filter(([, data]) => data.stepsJson !== undefined);
  expect(savedSteps).toHaveLength(0);
  expect(await prisma.taskPlan.count({ where: { identityId: owner } })).toBe(1);
  expect(await prisma.externalMutationReceipt.count({ where: { identityId: owner } })).toBe(1);
});

it('serializes simultaneous resume/cancel across independent runtimes and applies duplicate commands once', async () => {
  const f = await fixture(),
    g = await fixture();
  const review = await f.service.start(startInput(), cx(owner), authority);
  const results = await Promise.allSettled([
    f.service.resume(approve(review), cx(owner), authority),
    g.service.cancel(handleInput(review), cx(owner), authority),
    g.service.resume(approve(review), cx(owner), authority),
  ]);
  const successful = results.filter((result) => result.status === 'fulfilled');
  expect(successful).toHaveLength(1);
  const success = successful[0];
  if (success?.status !== 'fulfilled') throw new Error('No winning transition');
  expect(['completed', 'cancelled']).toContain(success.value.run.status);
  expect(await prisma.taskPlan.count({ where: { identityId: owner } })).toBe(
    success.value.steps.length,
  );
  for (const result of results)
    if (result.status === 'rejected')
      expect(['CONFLICT', 'OPERATION_IN_PROGRESS']).toContain(result.reason.code);
});

it('preserves committed partial facts on cancellation after an owner lost acknowledgement', async () => {
  const f = await fixture();
  const review = await f.service.start(startInput(), cx(owner), authority);
  f.writes.mockImplementation((guard) => {
    const real = bindGatewayWrites(prisma, time, { assistedGuard: guard });
    return {
      ...real,
      taskCreate: async (...args) => {
        await real.taskCreate(...args);
        throw new Error('Injected lost acknowledgement after owner commit');
      },
    };
  });
  const partial = await f.service.resume(approve(review), cx(owner), authority);
  expect(partial.run).toMatchObject({
    status: 'suspended',
    result: { status: 'partial' },
    suspension: { type: 'recovery_required', retryable: true },
  });
  expect(partial.steps).toHaveLength(1);
  const restarted = await fixture();
  const cancelled = await restarted.service.cancel(handleInput(partial), cx(owner), authority);
  expect(cancelled.run.status).toBe('cancelled');
  expect(cancelled.steps).toEqual(partial.steps);
  expect(await prisma.taskPlan.count({ where: { identityId: owner } })).toBe(1);
  expect(await prisma.externalMutationReceipt.count({ where: { identityId: owner } })).toBe(1);
});
