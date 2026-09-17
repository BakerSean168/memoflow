import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';

const mocks = vi.hoisted(() => {
  const runtimeContextStore = { tag: 'runtime-context' };
  const notifier = vi.fn();
  const commandPort = { tag: 'routine-command-port' };
  const repositories = {
    routineProfileStore: { tag: 'profile-store' },
    routineTemporaryOverrideStore: { tag: 'override-store' },
    protocolSessionStore: { tag: 'protocol-store' },
    routineOccurrenceTruthStore: { tag: 'occurrence-store' },
  };
  return {
    runtimeContextStore,
    notifier,
    commandPort,
    repositories,
    createRoutinePrismaRepositories: vi.fn(() => repositories),
    createInMemoryRoutineRuntimeContextStore: vi.fn(() => runtimeContextStore),
    createRoutineOverrideChangedNotifier: vi.fn(() => notifier),
    createRoutineCoachCommandService: vi.fn(() => commandPort),
  };
});

vi.mock('@memoflow/reminder', () => ({
  createRoutinePrismaRepositories: mocks.createRoutinePrismaRepositories,
}));

vi.mock('@memoflow/reminder/routine-runtime', () => ({
  createInMemoryRoutineRuntimeContextStore: mocks.createInMemoryRoutineRuntimeContextStore,
  createRoutineOverrideChangedNotifier: mocks.createRoutineOverrideChangedNotifier,
  createRoutineCoachCommandService: mocks.createRoutineCoachCommandService,
}));

import { composeRoutine } from './compose-routine';

const fakeDb = {} as PrismaClient;

describe('composeRoutine', () => {
  beforeEach(() => vi.clearAllMocks());

  it('composes only canonical Routine owner stores and returns the owner command port', () => {
    const composed = composeRoutine({ db: fakeDb });

    expect(mocks.createRoutinePrismaRepositories).toHaveBeenCalledWith(fakeDb);
    expect(mocks.createInMemoryRoutineRuntimeContextStore).toHaveBeenCalledTimes(1);
    expect(mocks.createRoutineCoachCommandService).toHaveBeenCalledWith({
      routineProfileStore: mocks.repositories.routineProfileStore,
      runtimeContextStore: mocks.runtimeContextStore,
      temporaryOverrideStore: mocks.repositories.routineTemporaryOverrideStore,
      occurrenceTruthStore: mocks.repositories.routineOccurrenceTruthStore,
      protocolSessionStore: mocks.repositories.protocolSessionStore,
      onOverrideChanged: mocks.notifier,
    });
    expect(composed).toEqual({ routineCommandPort: mocks.commandPort });
  });

  it('does not expose a transport module, legacy repositories, or schedule source aliases', () => {
    const composed = composeRoutine({ db: fakeDb }) as Record<string, unknown>;
    expect(composed).not.toHaveProperty('module');
    expect(composed).not.toHaveProperty('applicationPort');
    expect(composed).not.toHaveProperty('repositories');
    expect(composed).not.toHaveProperty('scheduleExecutionSource');
    expect(composed).not.toHaveProperty('scheduleProjectionSource');
  });
});
