import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import express from 'express';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { TaskGoalBindingTrigger, TaskType } from '@memoflow/contracts/task';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { prisma } from '@memoflow/database';
import { IdentityId } from '@memoflow/domain-shared';
import { createGoalPrismaModule, createGoalTaskProgressPrismaHandler } from '@memoflow/goal';
import {
  PrismaTaskBindingReadPort,
  createTaskModule,
  createTaskPrismaGoalOutboxRuntime,
  createTaskPrismaModule,
  createTaskPrismaRepositories,
  createTaskRuntimeContribution,
} from '@memoflow/task';
import { createTaskApiModule, type TaskApiModuleDef } from '@memoflow/task/api';
import {
  cleanAll,
  disconnectPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';

const execFileAsync = promisify(execFile);

function composeRestartedTaskHost(): TaskApiModuleDef {
  const taskRepositories = createTaskPrismaRepositories(prisma);
  const runtimeContributions = [
    createTaskRuntimeContribution(),
    createTaskPrismaGoalOutboxRuntime(
      prisma,
      createGoalTaskProgressPrismaHandler(prisma),
    ),
  ];
  const instance = createTaskModule({
    ...taskRepositories,
    runtimeContributions,
  });

  return createTaskApiModule({ instance });
}

describe('API host Task -> Goal restart recovery', () => {
  beforeEach(async () => {
    await cleanAll();
  });

  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  it('Fixture B API: EachCompletion survives host restart, stays idempotent, and updates Goal once', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const goalModule = createGoalPrismaModule(prisma, {
      taskBindingReadPort: new PrismaTaskBindingReadPort(prisma),
    });
    const createdGoal = await goalModule.api.createGoal(
      {
        name: 'Recover Task contribution after restart',
        color: '#2563eb',
        importance: ImportanceLevel.Important,
        tags: [],
        initialKeyResults: [
          {
            title: 'Complete the durable task',
            valueType: 'Incremental',
            calculationMethod: 'Sum',
            startValue: 0,
            currentValue: 0,
            targetValue: 10,
            weight: 1,
          },
        ],
      },
      { identityId },
    );
    expect(createdGoal.ok).toBe(true);
    if (!createdGoal.ok) return;

    const goalId = createdGoal.data.readModel.id;
    const keyResultId = createdGoal.data.readModel.keyResults[0]?.id;
    expect(keyResultId).toBeDefined();
    if (!keyResultId) return;

    const taskModule = createTaskPrismaModule(prisma);
    const createdTask = await taskModule.api.createTaskTemplate({
      identityId,
      name: 'Persist contribution before host exit',
      taskType: TaskType.OneTime,
      timeConfig: {
        timeType: 'AllDay',
        startDate: Date.now(),
        timePoint: null,
        timeRange: null,
      },
      importance: ImportanceLevel.Moderate,
      tags: [],
      goalBinding: {
        goalId,
        keyResultId,
        contribution: { value: 2, trigger: TaskGoalBindingTrigger.EachCompletion },
      },
    });
    expect(createdTask.ok).toBe(true);
    if (!createdTask.ok) return;

    const taskInstance = await prisma.taskInstance.findFirstOrThrow({
      where: { templateId: createdTask.data.template.id },
    });
    const fixturePath = path.resolve(__dirname, 'fixtures/complete-task-and-exit.ts');
    const tsxPath = path.resolve(__dirname, '../../../../../node_modules/tsx/dist/cli.mjs');
    const workspaceTsconfigPath = path.resolve(
      __dirname,
      '../../../../../tsconfig.workspace-src.json',
    );

    const child = await execFileAsync(
      process.execPath,
      [
        tsxPath,
        '--tsconfig',
        workspaceTsconfigPath,
        fixturePath,
        taskInstance.id,
        String(identityId),
      ],
      { env: process.env },
    );
    expect(child.stdout).toContain('TASK_COMMITTED');

    await expect(
      prisma.taskGoalOutbox.findFirstOrThrow({
        where: { taskInstanceId: taskInstance.id },
      }),
    ).resolves.toMatchObject({ status: 'PENDING' });
    await expect(prisma.goalRecord.count({ where: { keyResultId } })).resolves.toBe(0);

    const restartedHost = composeRestartedTaskHost();
    const app = express();
    await restartedHost.register({
      app,
      router: express.Router(),
      middleware: {
        auth: (_request, _response, next) => next(),
        requireRole: () => (_request, _response, next) => next(),
      },
    });

    await expect
      .poll(
        async () =>
          (
            await prisma.taskGoalOutbox.findFirstOrThrow({
              where: { taskInstanceId: taskInstance.id },
              select: { status: true },
            })
          ).status,
        { timeout: 10_000 },
      )
      .toBe('DELIVERED');

    await expect(prisma.goalRecord.count({ where: { keyResultId } })).resolves.toBe(1);
    await expect(
      prisma.keyResult.findUniqueOrThrow({ where: { id: keyResultId } }),
    ).resolves.toMatchObject({ currentValue: 2 });

    await restartedHost.destroy?.();

    const secondRestart = composeRestartedTaskHost();
    await secondRestart.register({
      app,
      router: express.Router(),
      middleware: {
        auth: (_request, _response, next) => next(),
        requireRole: () => (_request, _response, next) => next(),
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    await expect(prisma.goalRecord.count({ where: { keyResultId } })).resolves.toBe(1);
    await secondRestart.destroy?.();
  });
});
