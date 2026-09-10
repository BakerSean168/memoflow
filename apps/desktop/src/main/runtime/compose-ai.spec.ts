import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@memoflow/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/ai')>();
  return {
    ...actual,
    AIEvaluationReportFileAdapter: vi.fn(function AIEvaluationReportFileAdapterMock() {
      return { tag: 'evaluation-report' };
    }),
    createAIModule: vi.fn(),
    createAIPowerSyncRepositories: vi.fn(),
    createMastraStorage: vi.fn(() => ({ tag: 'desktop-mastra-storage' })),
    ConversationTranscriptBootstrapSource: vi.fn(
      function ConversationTranscriptBootstrapSourceMock() {
        return { tag: 'desktop-transcript-bootstrap-source' };
      },
    ),
    KnowledgeCapturePersistenceAdapter: vi.fn(function KnowledgeCapturePersistenceAdapterMock(
      persistence: unknown,
    ) {
      return { tag: 'desktop-knowledge-capture-mutation', persistence };
    }),
    MastraModelResolver: vi.fn(function MastraModelResolverMock() {
      return { tag: 'desktop-mastra-model-resolver' };
    }),
    MastraAIRuntime: vi.fn(function MastraAIRuntimeMock(input: unknown) {
      return { tag: 'desktop-mastra-runtime', input };
    }),
  };
});

vi.mock('@memoflow/ai/electron', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/ai/electron')>();
  return { ...actual, createAIElectronModule: vi.fn() };
});

vi.mock('../modules/ai/goal-plan-mutation.adapter', () => ({
  DesktopGoalPlanMutationAdapter: vi.fn(function DesktopGoalPlanMutationAdapterMock(
    ...args: unknown[]
  ) {
    return { tag: 'desktop-goal-plan-mutation', args };
  }),
}));
vi.mock('../modules/ai/task-plan-mutation.adapter', () => ({
  DesktopTaskPlanMutationAdapter: vi.fn(function DesktopTaskPlanMutationAdapterMock(task: unknown) {
    return { tag: 'desktop-task-plan-mutation', task };
  }),
}));
vi.mock('../modules/ai/routine-command.adapter', () => ({
  DesktopRoutineAICommandAdapter: vi.fn(function DesktopRoutineAICommandAdapterMock(...args: unknown[]) {
    return { tag: 'desktop-routine-command', args };
  }),
}));
vi.mock('../modules/ai/planner-read.adapter', () => ({
  DesktopPlannerAIReadAdapter: vi.fn(function DesktopPlannerAIReadAdapterMock(...args: unknown[]) {
    return { tag: 'desktop-planner-read', args };
  }),
}));
vi.mock('../modules/ai/notification-read.adapter', () => ({
  DesktopNotificationAIReadAdapter: vi.fn(function DesktopNotificationAIReadAdapterMock(repository: unknown) {
    return { tag: 'desktop-notification-read', repository };
  }),
}));

import {
  AIEvaluationReportFileAdapter,
  createAIModule,
  createAIPowerSyncRepositories,
  createMastraStorage,
  ConversationTranscriptBootstrapSource,
  KnowledgeCapturePersistenceAdapter,
  MastraAIRuntime,
  MastraModelResolver,
} from '@memoflow/ai';
import { createAIElectronModule } from '@memoflow/ai/electron';
import { DesktopGoalPlanMutationAdapter } from '../modules/ai/goal-plan-mutation.adapter';
import { DesktopTaskPlanMutationAdapter } from '../modules/ai/task-plan-mutation.adapter';
import { DesktopRoutineAICommandAdapter } from '../modules/ai/routine-command.adapter';
import { DesktopPlannerAIReadAdapter } from '../modules/ai/planner-read.adapter';
import { DesktopNotificationAIReadAdapter } from '../modules/ai/notification-read.adapter';
import { composeAI } from './compose-ai';

const db = { tag: 'desktop-db' } as never;
const knowledgeNotePersistence = { tag: 'knowledge-persistence' } as never;
const knowledgeSourcePort = { tag: 'knowledge-source' } as never;
const analyticsReadPort = { tag: 'analytics-read' } as never;
const goalApplicationPort = { tag: 'goal-application' } as never;
const taskApplicationPort = { tag: 'task-application' } as never;
const reminderApplicationPort = { tag: 'reminder-application' } as never;
const routineCommandPort = { tag: 'routine-command-port' } as never;
const scheduleRepository = { tag: 'schedule-repository' } as never;
const notificationRepository = { tag: 'notification-repository' } as never;
const userTimeContextPort = { tag: 'user-time-context-port' } as never;
const labelService = { tag: 'label-service' } as never;
const mastraStorage = {
  kind: 'libsql' as const,
  url: 'file:///profiles/profile-1/storage/mastra.db',
};
const repositorySet = {
  conversationRepository: { tag: 'conversation-repository' },
  providerConfigRepository: { tag: 'provider-repository' },
  knowledgeIndexRepository: { tag: 'knowledge-index-repository' },
  executionLogPort: { tag: 'execution-log' },
  providerOnboardingSessionRepository: { tag: 'provider-onboarding-session' },
  providerOnboardingCommitPort: { tag: 'provider-onboarding-commit' },
};
const dependencies = {
  db,
  knowledgeNotePersistence,
  knowledgeSourcePort,
  analyticsReadPort,
  goalApplicationPort,
  taskApplicationPort,
  reminderApplicationPort,
  routineCommandPort,
  scheduleRepository,
  notificationRepository,
  userTimeContextPort,
  labelService,
  mastraStorage,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createAIPowerSyncRepositories).mockReturnValue(
    repositorySet as ReturnType<typeof createAIPowerSyncRepositories>,
  );
  vi.mocked(createAIModule).mockReturnValue({
    api: {},
    start: vi.fn(),
    dispose: vi.fn(),
  } as ReturnType<typeof createAIModule>);
  vi.mocked(createAIElectronModule).mockReturnValue({
    name: 'AI',
    register: vi.fn(),
    destroy: vi.fn(),
  });
});

describe('Desktop composeAI Mastra-only ownership', () => {
  it('builds one profile-local LibSQL Mastra runtime with canonical workflow mutation ports and execution logging', () => {
    composeAI(dependencies);

    expect(createAIPowerSyncRepositories).toHaveBeenCalledWith(db);
    expect(createMastraStorage).toHaveBeenCalledWith(mastraStorage);
    expect(MastraModelResolver).toHaveBeenCalledWith(repositorySet.providerConfigRepository);
    expect(ConversationTranscriptBootstrapSource).toHaveBeenCalledWith(
      repositorySet.conversationRepository,
    );
    expect(DesktopGoalPlanMutationAdapter).toHaveBeenCalledWith(
      goalApplicationPort,
      taskApplicationPort,
      reminderApplicationPort,
      labelService,
    );
    expect(DesktopTaskPlanMutationAdapter).toHaveBeenCalledWith(taskApplicationPort, labelService);
    expect(DesktopRoutineAICommandAdapter).toHaveBeenCalledWith(reminderApplicationPort, routineCommandPort);
    expect(DesktopPlannerAIReadAdapter).toHaveBeenCalledWith(scheduleRepository, taskApplicationPort);
    expect(DesktopNotificationAIReadAdapter).toHaveBeenCalledWith(notificationRepository);
    expect(KnowledgeCapturePersistenceAdapter).toHaveBeenCalledWith(knowledgeNotePersistence);

    expect(MastraAIRuntime).toHaveBeenCalledTimes(1);
    expect(MastraAIRuntime).toHaveBeenCalledWith({
      storage: vi.mocked(createMastraStorage).mock.results[0].value,
      modelResolver: vi.mocked(MastraModelResolver).mock.results[0].value,
      transcriptBootstrapSource: vi.mocked(ConversationTranscriptBootstrapSource).mock.results[0].value,
      goalPlanMutationPort: vi.mocked(DesktopGoalPlanMutationAdapter).mock.results[0].value,
      taskPlanMutationPort: vi.mocked(DesktopTaskPlanMutationAdapter).mock.results[0].value,
      knowledgeCaptureMutationPort: vi.mocked(KnowledgeCapturePersistenceAdapter).mock.results[0].value,
      executionLogPort: repositorySet.executionLogPort,
      usageReadPort: repositorySet.executionLogPort,
      routineCommandPort: vi.mocked(DesktopRoutineAICommandAdapter).mock.results[0].value,
      plannerReadPort: vi.mocked(DesktopPlannerAIReadAdapter).mock.results[0].value,
      notificationReadPort: vi.mocked(DesktopNotificationAIReadAdapter).mock.results[0].value,
      userTimeContextPort,
    });
  });

  it('passes canonical Desktop-owned persistence/read ports into the transport-neutral AI module', () => {
    composeAI(dependencies);

    const moduleInput = vi.mocked(createAIModule).mock.calls[0][0];
    expect(moduleInput.conversationRepository).toBe(repositorySet.conversationRepository);
    expect(moduleInput.providerConfigRepository).toBe(repositorySet.providerConfigRepository);
    expect(moduleInput.providerOnboardingSessionRepository).toBe(
      repositorySet.providerOnboardingSessionRepository,
    );
    expect(moduleInput.providerOnboardingCommitPort).toBe(repositorySet.providerOnboardingCommitPort);
    expect(moduleInput.knowledgeIndexRepository).toBe(repositorySet.knowledgeIndexRepository);
    expect(moduleInput.executionLogPort).toBe(repositorySet.executionLogPort);
    expect(moduleInput.knowledgeNotePersistence).toBe(knowledgeNotePersistence);
    expect(moduleInput.knowledgeSourcePort).toBe(knowledgeSourcePort);
    expect(moduleInput.analyticsReadPort).toBe(analyticsReadPort);
    expect(moduleInput.evaluationReportPort).toBe(
      vi.mocked(AIEvaluationReportFileAdapter).mock.results[0].value,
    );
  });

  it('uses the same Mastra runtime as assistant and workflow owner and binds exactly that module instance to IPC', () => {
    composeAI(dependencies);

    const runtime = vi.mocked(MastraAIRuntime).mock.results[0].value;
    const moduleInput = vi.mocked(createAIModule).mock.calls[0][0];
    expect(moduleInput.mastraRuntime).toBe(runtime);
    expect(moduleInput.workflowRuntime).toBe(runtime);

    const instance = vi.mocked(createAIModule).mock.results[0].value;
    expect(createAIElectronModule).toHaveBeenCalledTimes(1);
    expect(createAIElectronModule).toHaveBeenCalledWith({ instance });
  });

  it('does not compose any retired Python/AgentHost/checkpoint service port', () => {
    composeAI(dependencies);

    const input = vi.mocked(createAIModule).mock.calls[0][0] as unknown as Record<string, unknown>;
    for (const key of [
      'chatExecutionPort',
      'goalPlanningPort',
      'goalAutomationPlanningPort',
      'knowledgeIngestionPort',
      'knowledgeQueryPort',
      'knowledgeNoteGenerationPort',
      'analyticsQueryPort',
      'agentRuntimePort',
      'agentCheckpointPort',
      'langGraphCheckpointPort',
      'automationToolExecutorPort',
    ]) {
      expect(input[key]).toBeUndefined();
    }
  });
});
