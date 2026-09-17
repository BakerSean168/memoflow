import { ok } from '@memoflow/contracts/result';
import type {
  ScheduledInvocation,
  ScheduledInvocationDiagnostic,
  ScheduledInvocationDiagnosticQuery,
} from '@memoflow/contracts/schedule';
import type { SchedulerApplicationPort } from '../application';
import { toScheduledInvocationDiagnostic } from '../application';
import type { IInvocationAttemptRepository } from '../domain/repositories/i-invocation-attempt-repository';
import type { IScheduledInvocationRepository } from '../domain/repositories/i-scheduled-invocation-repository';

export interface SchedulerModuleRuntimeContribution {
  start(): Promise<void> | void;
  stop(): Promise<void> | void;
}

export type SchedulerRuntimeContributionsInput =
  | SchedulerModuleRuntimeContribution
  | readonly SchedulerModuleRuntimeContribution[];

export interface SchedulerModuleDependencies {
  readonly scheduledInvocationRepository: IScheduledInvocationRepository;
  readonly invocationAttemptRepository: IInvocationAttemptRepository;
  readonly runtimeContributions?: SchedulerRuntimeContributionsInput;
  readonly now?: () => number;
}

export interface SchedulerModuleInstance {
  readonly scheduledInvocationRepository: IScheduledInvocationRepository;
  readonly invocationAttemptRepository: IInvocationAttemptRepository;
  readonly api: SchedulerApplicationPort;
  start(): Promise<void>;
  dispose(): Promise<void>;
}

function normalizeRuntimeContributions(
  input?: SchedulerRuntimeContributionsInput,
): readonly SchedulerModuleRuntimeContribution[] {
  if (!input) return [];
  return Array.isArray(input) ? Array.from(input) : [input as SchedulerModuleRuntimeContribution];
}

async function projectInvocation(
  invocation: ScheduledInvocation,
  attempts: IInvocationAttemptRepository,
): Promise<ScheduledInvocationDiagnostic> {
  const lastAttempt = await attempts.findLatestForInvocation(
    invocation.identityId,
    invocation.id,
  );
  return toScheduledInvocationDiagnostic(invocation, lastAttempt);
}

export function createSchedulerModule(
  dependencies: SchedulerModuleDependencies,
): SchedulerModuleInstance {
  const runtimeContributions = normalizeRuntimeContributions(dependencies.runtimeContributions);
  const now = dependencies.now ?? Date.now;
  let started = false;
  const startedRuntimes: SchedulerModuleRuntimeContribution[] = [];

  const list = async (
    identityId: string,
    query: ScheduledInvocationDiagnosticQuery,
  ): Promise<ScheduledInvocationDiagnostic[]> => {
    const invocations = await dependencies.scheduledInvocationRepository.listForIdentity(identityId, {
      ...(query.ownerType === undefined ? {} : { ownerType: query.ownerType }),
      ...(query.ownerId === undefined ? {} : { ownerId: query.ownerId }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.dueOnly ? { dueBefore: now() } : {}),
      limit: query.limit ?? 100,
    });
    return Promise.all(
      invocations.map((invocation) =>
        projectInvocation(invocation, dependencies.invocationAttemptRepository),
      ),
    );
  };

  const api: SchedulerApplicationPort = {
    listInvocations: async (query, ctx) => ok(await list(ctx.identityId, query)),
    getInvocation: async (id, ctx) => {
      const invocation = await dependencies.scheduledInvocationRepository.findByIdForIdentity(
        ctx.identityId,
        id,
      );
      return ok(
        invocation
          ? await projectInvocation(invocation, dependencies.invocationAttemptRepository)
          : null,
      );
    },
    listDueInvocations: async (ctx) =>
      ok(await list(ctx.identityId, { dueOnly: true, limit: 100 })),
  };

  return {
    scheduledInvocationRepository: dependencies.scheduledInvocationRepository,
    invocationAttemptRepository: dependencies.invocationAttemptRepository,
    api,
    async start() {
      if (started) return;
      try {
        for (const runtime of runtimeContributions) {
          await runtime.start();
          startedRuntimes.push(runtime);
        }
      } catch (error) {
        for (const runtime of [...startedRuntimes].reverse()) await runtime.stop();
        startedRuntimes.length = 0;
        throw error;
      }
      started = true;
    },
    async dispose() {
      if (!started) return;
      for (const runtime of [...startedRuntimes].reverse()) await runtime.stop();
      startedRuntimes.length = 0;
      started = false;
    },
  };
}
