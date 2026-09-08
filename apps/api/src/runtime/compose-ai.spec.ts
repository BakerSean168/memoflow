import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import type { RepositoryApplicationPort } from '@memoflow/repository';
import type { GoalApplicationPort } from '@memoflow/goal';
import type { TaskApplicationPort } from '@memoflow/task';
import type { ReminderApplicationPort } from '@memoflow/reminder';

vi.mock('@memoflow/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/ai')>();
  return {
    ...actual,
    AIEvaluationReportFileAdapter: vi.fn(function AIEvaluationReportFileAdapterMock() {
      return { tag: 'evaluation-report' };
    }),
    createAIModule: vi.fn(),
    createAIPrismaRepositories: vi.fn(),
    createMastraStorage: vi.fn(() => ({ tag: 'mastra-storage' })),
    ConversationTranscriptBootstrapSource: vi.fn(
      function ConversationTranscriptBootstrapSourceMock() {
        return { tag: 'transcript-bootstrap-source' };
      },
    ),
    KnowledgeCapturePersistenceAdapter: vi.fn(function KnowledgeCapturePersistenceAdapterMock(
      persistence: unknown,
    ) {
      return { tag: 'knowledge-capture-mutation', persistence };
    }),
    MastraModelResolver: vi.fn(function MastraModelResolverMock() {
      return { tag: 'mastra-model-resolver' };
    }),
    MastraAIRuntime: vi.fn(function MastraAIRuntimeMock(input: unknown) {
      return { tag: 'mastra-runtime', input };
    }),
  };
});

vi.mock('@memoflow/ai/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/ai/api')>();
  return { ...actual, createAIApiModule: vi.fn() };
});

vi.mock('../modules/ai/repository-knowledge-note-persistence.adapter', () => ({
  RepositoryKnowledgeNotePersistenceAdapter: vi.fn(function RepositoryKnowledgeNotePersistenceAdapterMock(
    port: unknown,
  ) {
    return { tag: 'knowledge-note-persistence', port };
  }),
}));
vi.mock('../modules/ai/repository-knowledge-source.adapter', () => ({
  RepositoryKnowledgeSourceAdapter: vi.fn(function RepositoryKnowledgeSourceAdapterMock(...args: unknown[]) {
    return { tag: 'knowledge-source', args };
  }),
}));
vi.mock('../modules/ai/repository-knowledge-index-status.adapter', () => ({
  RepositoryKnowledgeIndexStatusAdapter: vi.fn(function RepositoryKnowledgeIndexStatusAdapterMock(
    port: unknown,
  ) {
    return { tag: 'knowledge-index-status', port };
  }),
}));
vi.mock('../modules/ai/controlled-analytics-read.adapter', () => ({
  ControlledAnalyticsReadAdapter: vi.fn(function ControlledAnalyticsReadAdapterMock(db: unknown) {
    return { tag: 'analytics-read', db };
  }),
}));
vi.mock('../modules/ai/goal-plan-mutation.adapter', () => ({
  GoalPlanMutationAdapter: vi.fn(function GoalPlanMutationAdapterMock(...args: unknown[]) {
    return { tag: 'goal-plan-mutation', args };
  }),
}));
vi.mock('../modules/ai/task-plan-mutation.adapter', () => ({
  TaskPlanMutationAdapter: vi.fn(function TaskPlanMutationAdapterMock(task: unknown) {
    return { tag: 'task-plan-mutation', task };
  }),
}));
vi.mock('../modules/ai/routine-command.adapter', () => ({
  RoutineAICommandAdapter: vi.fn(function RoutineAICommandAdapterMock(...args: unknown[]) {
    return { tag: 'routine-command', args };
  }),
}));
vi.mock('../modules/ai/planner-read.adapter', () => ({
  PlannerAIReadAdapter: vi.fn(function PlannerAIReadAdapterMock(...args: unknown[]) {
    return { tag: 'planner-read', args };
  }),
}));
vi.mock('../modules/ai/notification-read.adapter', () => ({
  NotificationAIReadAdapter: vi.fn(function NotificationAIReadAdapterMock(repository: unknown) {
    return { tag: 'notification-read', repository };
  }),
}));

import {
  AIEvaluationReportFileAdapter,
  createAIModule,
  createAIPrismaRepositories,
  createMastraStorage,
  ConversationTranscriptBootstrapSource,
  KnowledgeCapturePersistenceAdapter,
  MastraAIRuntime,
  MastraModelResolver,
} from '@memoflow/ai';
import { createAIApiModule } from '@memoflow/ai/api';
import { ControlledAnalyticsReadAdapter } from '../modules/ai/controlled-analytics-read.adapter';
import { GoalPlanMutationAdapter } from '../modules/ai/goal-plan-mutation.adapter';
import { RepositoryKnowledgeIndexStatusAdapter } from '../modules/ai/repository-knowledge-index-status.adapter';
import { RepositoryKnowledgeNotePersistenceAdapter } from '../modules/ai/repository-knowledge-note-persistence.adapter';
import { RepositoryKnowledgeSourceAdapter } from '../modules/ai/repository-knowledge-source.adapter';
import { TaskPlanMutationAdapter } from '../modules/ai/task-plan-mutation.adapter';
import { RoutineAICommandAdapter } from '../modules/ai/routine-command.adapter';
import { PlannerAIReadAdapter } from '../modules/ai/planner-read.adapter';
import { NotificationAIReadAdapter } from '../modules/ai/notification-read.adapter';
import { composeAI } from './compose-ai';

const fakeDb = { tag: 'fake-db' } as unknown as PrismaClient;
const repositoryApiPort = { tag: 'repository-port' } as unknown as RepositoryApplicationPort;
const goalApplicationPort = { tag: 'goal-port' } as unknown as GoalApplicationPort;
const taskApplicationPort = { tag: 'task-port' } as unknown as TaskApplicationPort;
const reminderApplicationPort = { tag: 'reminder-port' } as unknown as ReminderApplicationPort;
const routineCommandPort = { tag: 'routine-command-port' } as never;
const scheduleRepository = { tag: 'schedule-repository' } as never;
const notificationRepository = { tag: 'notification-repository' } as never;
const labelService = { tag: 'label-service' } as never;
const repositoryStorageBaseDir = '/tmp/memoflow-ai-compose-test';
const mastraStorage = {
  kind: 'postgres' as const,
  connectionString: 'postgresql://memoflow:test@127.0.0.1:5432/memoflow_test',
};
const dependencies = {
  db: fakeDb,
  repositoryApiPort,
  repositoryStorageBaseDir,
  goalApplicationPort,
  taskApplicationPort,
  reminderApplicationPort,
  routineCommandPort,
  scheduleRepository,
  notificationRepository,
  labelService,
  mastraStorage,
};

const repositories = {
  conversationRepository: { tag: 'conversation' },
  providerConfigRepository: { tag: 'provider-config' },
  knowledgeIndexRepository: { tag: 'knowledge-index' },
  executionLogPort: { tag: 'execution-log' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createAIPrismaRepositories).mockReturnValue(
    repositories as ReturnType<typeof createAIPrismaRepositories>,
  );
  vi.mocked(createAIModule).mockReturnValue({
    api: {},
    start: vi.fn(),
    dispose: vi.fn(),
  } as ReturnType<typeof createAIModule>);
  vi.mocked(createAIApiModule).mockReturnValue({
    name: 'AI',
    register: vi.fn(),
    destroy: vi.fn(),
  });
});

describe('API composeAI Mastra-only ownership', () => {
  it('builds one PostgreSQL-backed Mastra runtime with canonical workflow mutation ports and execution logging', () => {
    composeAI(dependencies);

    expect(createAIPrismaRepositories).toHaveBeenCalledWith(fakeDb);
    expect(createMastraStorage).toHaveBeenCalledWith(mastraStorage);
    expect(MastraModelResolver).toHaveBeenCalledWith(repositories.providerConfigRepository);
    expect(ConversationTranscriptBootstrapSource).toHaveBeenCalledWith(
      repositories.conversationRepository,
    );
    expect(GoalPlanMutationAdapter).toHaveBeenCalledWith(
      goalApplicationPort,
      taskApplicationPort,
      reminderApplicationPort,
      labelService,
    );
    expect(TaskPlanMutationAdapter).toHaveBeenCalledWith(taskApplicationPort, labelService);
    expect(RoutineAICommandAdapter).toHaveBeenCalledWith(reminderApplicationPort, routineCommandPort);
    expect(PlannerAIReadAdapter).toHaveBeenCalledWith(scheduleRepository, taskApplicationPort);
    expect(NotificationAIReadAdapter).toHaveBeenCalledWith(notificationRepository);

    const persistence = vi.mocked(RepositoryKnowledgeNotePersistenceAdapter).mock.results[0].value;
    expect(KnowledgeCapturePersistenceAdapter).toHaveBeenCalledWith(persistence);

    expect(MastraAIRuntime).toHaveBeenCalledTimes(1);
    expect(MastraAIRuntime).toHaveBeenCalledWith({
      storage: vi.mocked(createMastraStorage).mock.results[0].value,
      modelResolver: vi.mocked(MastraModelResolver).mock.results[0].value,
      transcriptBootstrapSource: vi.mocked(ConversationTranscriptBootstrapSource).mock.results[0].value,
      goalPlanMutationPort: vi.mocked(GoalPlanMutationAdapter).mock.results[0].value,
      taskPlanMutationPort: vi.mocked(TaskPlanMutationAdapter).mock.results[0].value,
      knowledgeCaptureMutationPort: vi.mocked(KnowledgeCapturePersistenceAdapter).mock.results[0].value,
      executionLogPort: repositories.executionLogPort,
      usageReadPort: repositories.executionLogPort,
      routineCommandPort: vi.mocked(RoutineAICommandAdapter).mock.results[0].value,
      plannerReadPort: vi.mocked(PlannerAIReadAdapter).mock.results[0].value,
      notificationReadPort: vi.mocked(NotificationAIReadAdapter).mock.results[0].value,
    });
  });

  it('passes the canonical repositories and host capability ports into one transport-neutral AI module', () => {
    composeAI(dependencies);

    expect(RepositoryKnowledgeNotePersistenceAdapter).toHaveBeenCalledWith(repositoryApiPort);
    expect(RepositoryKnowledgeSourceAdapter).toHaveBeenCalledWith(
      fakeDb,
      repositoryStorageBaseDir,
    );
    expect(RepositoryKnowledgeIndexStatusAdapter).toHaveBeenCalledWith(repositoryApiPort);
    expect(ControlledAnalyticsReadAdapter).toHaveBeenCalledWith(fakeDb);
    expect(AIEvaluationReportFileAdapter).toHaveBeenCalledTimes(1);

    const moduleInput = vi.mocked(createAIModule).mock.calls[0][0];
    expect(moduleInput.conversationRepository).toBe(repositories.conversationRepository);
    expect(moduleInput.providerConfigRepository).toBe(repositories.providerConfigRepository);
    expect(moduleInput.knowledgeIndexRepository).toBe(repositories.knowledgeIndexRepository);
    expect(moduleInput.executionLogPort).toBe(repositories.executionLogPort);
    expect(moduleInput.knowledgeNotePersistence).toBe(
      vi.mocked(RepositoryKnowledgeNotePersistenceAdapter).mock.results[0].value,
    );
    expect(moduleInput.knowledgeSourcePort).toBe(
      vi.mocked(RepositoryKnowledgeSourceAdapter).mock.results[0].value,
    );
    expect(moduleInput.knowledgeIndexStatusPort).toBe(
      vi.mocked(RepositoryKnowledgeIndexStatusAdapter).mock.results[0].value,
    );
    expect(moduleInput.analyticsReadPort).toBe(
      vi.mocked(ControlledAnalyticsReadAdapter).mock.results[0].value,
    );
    expect(moduleInput.evaluationReportPort).toBe(
      vi.mocked(AIEvaluationReportFileAdapter).mock.results[0].value,
    );
  });

  it('uses the same Mastra runtime as assistant and workflow owner and binds exactly that module instance to HTTP', () => {
    composeAI(dependencies);

    const runtime = vi.mocked(MastraAIRuntime).mock.results[0].value;
    const moduleInput = vi.mocked(createAIModule).mock.calls[0][0];
    expect(moduleInput.mastraRuntime).toBe(runtime);
    expect(moduleInput.workflowRuntime).toBe(runtime);

    const instance = vi.mocked(createAIModule).mock.results[0].value;
    expect(createAIApiModule).toHaveBeenCalledTimes(1);
    expect(createAIApiModule).toHaveBeenCalledWith({ instance });
  });

  it('does not reintroduce any retired Python/AgentHost service port at the composition root', () => {
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
