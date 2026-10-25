import request from 'supertest';
import type { Express } from 'express';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GoalMutationReceiptSchema } from '@memoflow/contracts/goal';
import { CreateTaskPlanResponseSchema, TaskPlanResponseSchema } from '@memoflow/contracts/task';
import { PrismaGoalRelationCleanupCapability } from '@memoflow/relation';
import { PrismaTaskBindingReadPort } from '@memoflow/task';
import { createSettingPrismaPortability } from '@memoflow/setting';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';
import { ApiBootstrapper } from '../bootstrap';
import { createCloudAuthStub } from '../test/cloud-auth.stub';
import { composeGoal } from './compose-goal';
import { composeTask } from './compose-task';

// HTTP requests run the production route/validation/composer/owner/Prisma path.
// Only session resolution is replaced; cloud-auth-http.integration owns real cookie sessions.
let app: Express;
let host: ApiBootstrapper | undefined;
let ownerId: string;
let otherId: string;
beforeEach(async () => {
  await cleanAll();
  const db = await getPrisma();
  ownerId = (await seedAccount()).id;
  otherId = (await seedAccount()).id;
  const auth = createCloudAuthStub();
  auth.resolveNodePrincipal = async (headers) => {
    const identityId = headers.authorization?.replace(/^Bearer /, '');
    return identityId === ownerId || identityId === otherId
      ? {
          identityId,
          sessionId: `session-${identityId}`,
          email: 'http@example.test',
          emailVerified: true,
        }
      : null;
  };
  const { userTimeContextPort } = createSettingPrismaPortability(db);
  const goal = composeGoal({
    db,
    userTimeContextPort,
    taskBindingReadPort: new PrismaTaskBindingReadPort(db),
    relationCleanupFactory: (tx) => new PrismaGoalRelationCleanupCapability(tx),
  });
  const task = composeTask({ db, userTimeContextPort, goalReadPort: goal.applicationPort });
  host = new ApiBootstrapper(db, auth).register(goal.module).register(task.module);
  app = await host.init();
});
afterEach(async () => {
  await host?.destroy();
  host = undefined;
});
afterAll(disconnectPrisma);

async function http(
  method: 'post' | 'get' | 'patch' | 'delete',
  path: string,
  body?: object,
  status = 200,
  identityId = ownerId,
) {
  const call = request(app)[method](`/api/v1${path}`).set('authorization', `Bearer ${identityId}`);
  const response = await (body === undefined ? call : call.send(body));
  expect(response.status, JSON.stringify(response.body.error)).toBe(status);
  return response.body.data;
}

describe('Goal and Task HTTP persistence contracts', () => {
  it('persists Goal CRUD and all four lifecycle states through the real HTTP owner', async () => {
    const db = await getPrisma();
    let receipt = GoalMutationReceiptSchema.parse(
      await http(
        'post',
        '/goals',
        {
          name: 'HTTP Goal',
          summary: 'Created through a production route',
        },
        201,
      ),
    );
    const id = receipt.goalId;
    expect(await db.goal.findUniqueOrThrow({ where: { id } })).toMatchObject({
      identityId: ownerId,
      name: 'HTTP Goal',
      status: 'Planned',
    });
    expect(await http('get', `/goals/${id}`)).toMatchObject({ id, name: 'HTTP Goal' });
    receipt = GoalMutationReceiptSchema.parse(
      await http('patch', `/goals/${id}`, {
        expectedVersion: receipt.goalVersion,
        name: 'Updated HTTP Goal',
      }),
    );
    for (const [operation, status] of [
      ['activate', 'InProgress'],
      ['abandon', 'Abandoned'],
      ['plan', 'Planned'],
      ['activate', 'InProgress'],
      ['complete', 'Completed'],
    ]) {
      receipt = GoalMutationReceiptSchema.parse(
        await http('post', `/goals/${id}/${operation}`, {
          expectedVersion: receipt.goalVersion,
        }),
      );
      expect(await db.goal.findUniqueOrThrow({ where: { id } })).toMatchObject({
        name: 'Updated HTTP Goal',
        status,
      });
      expect(await http('get', `/goals/${id}`)).toMatchObject({ id, status });
    }
    await http('delete', `/goals/${id}?expectedVersion=${receipt.goalVersion}`);
    expect((await db.goal.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
    expect(await http('get', `/goals/${id}`)).toMatchObject({
      id,
      deletedAt: expect.any(Number),
    });
  });

  it('rejects invalid, stale and cross-owner Goal requests without changing persisted facts', async () => {
    const db = await getPrisma();
    const malformed = await request(app)
      .post('/api/v1/goals')
      .set('authorization', `Bearer ${ownerId}`)
      .send({ name: '' });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
    expect(await db.goal.count()).toBe(0);
    const receipt = GoalMutationReceiptSchema.parse(
      await http('post', '/goals', { name: 'Private Goal' }, 201),
    );
    const id = receipt.goalId;
    await http('patch', `/goals/${id}`, {
      name: 'Owner update',
      expectedVersion: receipt.goalVersion,
    });
    await http(
      'patch',
      `/goals/${id}`,
      { name: 'Stale update', expectedVersion: receipt.goalVersion },
      409,
    );
    await http('get', `/goals/${id}`, undefined, 404, otherId);
    await http(
      'patch',
      `/goals/${id}`,
      { name: 'Foreign update', expectedVersion: receipt.goalVersion + 1 },
      404,
      otherId,
    );
    expect(await db.goal.findUniqueOrThrow({ where: { id } })).toMatchObject({
      identityId: ownerId,
      name: 'Owner update',
    });
    expect((await request(app).get(`/api/v1/goals/${id}`)).status).toBe(401);
  });

  it('persists Task plan creation, checklist, edits and deletion with owner isolation', async () => {
    const db = await getPrisma();
    const checklist = [
      { id: 'check-a', title: 'Prepare evidence', order: 0 },
      { id: 'check-b', title: 'Publish result', order: 1 },
    ];
    const created = CreateTaskPlanResponseSchema.parse(
      await http(
        'post',
        '/task-plans',
        {
          name: 'HTTP Task',
          importance: 'Moderate',
          checklist,
          schedule: { kind: 'OneTime', date: '2030-01-02', timing: { kind: 'AllDay' } },
        },
        201,
      ),
    );
    const id = created.plan.id;
    expect(created.plan.checklist).toEqual(checklist);
    expect(await db.taskPlan.findUniqueOrThrow({ where: { id } })).toMatchObject({
      identityId: ownerId,
      name: 'HTTP Task',
    });
    expect(
      JSON.parse((await db.taskPlan.findUniqueOrThrow({ where: { id } })).checklist ?? '[]'),
    ).toEqual(checklist);
    expect(TaskPlanResponseSchema.parse(await http('get', `/task-plans/${id}`)).checklist).toEqual(
      checklist,
    );
    expect(await http('get', `/task-plans/${id}`, undefined, 200, otherId)).toBeNull();
    await http('patch', `/task-plans/${id}`, {
      name: 'Updated HTTP Task',
      description: 'Persisted edit',
    });
    expect(await db.taskPlan.findUniqueOrThrow({ where: { id } })).toMatchObject({
      name: 'Updated HTTP Task',
      description: 'Persisted edit',
    });
    expect(await http('get', `/task-plans/${id}`)).toMatchObject({
      name: 'Updated HTTP Task',
      description: 'Persisted edit',
    });
    await http('delete', `/task-plans/${id}`);
    expect(await db.taskPlan.findUnique({ where: { id } })).toBeNull();
    expect(await http('get', `/task-plans/${id}`)).toBeNull();
  });
});
