/**
 * AI API composition root — API lane host runtime.
 * AI API 组合根 —— API lane 宿主运行时。
 *
 * This is the API-lane composition root for AI. The API runtime owns the shared
 * Prisma client (created in main.ts by connectDatabase()), the instance-bound
 * repository application port, and the resolved repository storage base
 * directory, so it selects the Prisma persistence adapters, builds the Mastra
 * runtime, wires the app-local host capability adapters, assembles the
 * transport-neutral `AIModuleInstance`, and turns it into an already-bound
 * `IApiModule`-compatible handle via `createAIApiModule({ instance })`.
 *
 * AI-VNEXT-07: Mastra is the only runtime. The Python AIService adapters,
 * AgentHost runtime selection and the ai-service runtime config are removed.
 * Open chat, goal.create, task.create and knowledge.capture are all Mastra
 * workflows — no second runtime is composed.
 */

import type { PrismaClient } from '@memoflow/database';
import {
  AIEvaluationReportFileAdapter,
  createAIModule,
  createAIPrismaRepositories,
  createMastraStorage,
  ConversationTranscriptBootstrapSource,
  KnowledgeCapturePersistenceAdapter,
  MastraAIRuntime,
  MastraModelResolver,
  type MastraStorageConfig,
} from '@memoflow/ai';
import { createAIApiModule, type AIApiModuleDef } from '@memoflow/ai/api';
import type { RepositoryApplicationPort } from '@memoflow/repository';
import type { GoalApplicationPort } from '@memoflow/goal';
import type { TaskApplicationPort } from '@memoflow/task';
import type { ReminderApplicationPort } from '@memoflow/reminder';
import type { RoutineCoachCommandPort } from '@memoflow/reminder/routine-runtime';
import type { IScheduleRepository } from '@memoflow/schedule';
import type { INotificationRepository } from '@memoflow/notification';
import type { LabelService } from '@memoflow/label';
import type { GoalKnowledgeService, KnowledgeDocumentRefResolver } from '@memoflow/relation';
import type { UserTimeContextPort } from '@memoflow/time';
import { GoalPlanMutationAdapter } from '../modules/ai/goal-plan-mutation.adapter';
import { TaskPlanMutationAdapter } from '../modules/ai/task-plan-mutation.adapter';
import { ControlledAnalyticsReadAdapter } from '../modules/ai/controlled-analytics-read.adapter';
import { RepositoryKnowledgeIndexStatusAdapter } from '../modules/ai/repository-knowledge-index-status.adapter';
import { RepositoryKnowledgeNotePersistenceAdapter } from '../modules/ai/repository-knowledge-note-persistence.adapter';
import { RepositoryKnowledgeSourceAdapter } from '../modules/ai/repository-knowledge-source.adapter';
import { RoutineAICommandAdapter } from '../modules/ai/routine-command.adapter';
import { PlannerAIReadAdapter } from '../modules/ai/planner-read.adapter';
import { NotificationAIReadAdapter } from '../modules/ai/notification-read.adapter';

export interface ComposeAIDependencies {
  /** Shared API-lane Prisma client owned by apps/api. */
  readonly db: PrismaClient;
  /** The instance-bound application port of the already-composed repository handle. */
  readonly repositoryApiPort: RepositoryApplicationPort;
  /** Host-resolved repository storage base directory. */
  readonly repositoryStorageBaseDir: string;
  /** The shared Goal application port composed once by the API runtime. */
  readonly goalApplicationPort: GoalApplicationPort;
  /** The shared Task application port composed once by the API runtime. */
  readonly taskApplicationPort: TaskApplicationPort;
  /** The Reminder application port wired for standalone Routine AI tools. */
  readonly reminderApplicationPort: ReminderApplicationPort;
  /** Existing Shared Relation facade reused by GoalPlan V2. */
  readonly goalKnowledgeService: Pick<GoalKnowledgeService, 'link'>;
  /** Repository-owned stable KnowledgeDocumentRef resolver. */
  readonly knowledgeDocumentRefResolver: KnowledgeDocumentRefResolver;
  /** Identity-scoped Shared Label resolver reused by AI workflow application. */
  readonly labelService: LabelService;
  readonly routineCommandPort: RoutineCoachCommandPort;
  readonly scheduleRepository: IScheduleRepository;
  readonly notificationRepository: INotificationRepository;
  readonly userTimeContextPort: UserTimeContextPort;
  /** Host-selected persistent Mastra storage; API uses PostgreSQL. */
  readonly mastraStorage: MastraStorageConfig;
}

/**
 * Composes the AI API module handle from the API runtime's Prisma client.
 *
 * Wire order:
 * 1. createAIPrismaRepositories(db) — select the Prisma persistence ports.
 * 2. Build the five app-local host adapters from db + repositoryApiPort +
 *    repositoryStorageBaseDir + the injected Goal/Task/Reminder application
 *    ports.
 * 3. Build the Mastra runtime (the only runtime).
 * 4. createAIModule({ ...repository set, mastraRuntime, host ports }) — assemble.
 * 5. createAIApiModule({ instance }) — bind the instance to an IApiModule handle.
 */
export function composeAI(dependencies: ComposeAIDependencies): AIApiModuleDef {
  const repositorySet = createAIPrismaRepositories(dependencies.db);
  const knowledgeSourcePort = new RepositoryKnowledgeSourceAdapter(
    dependencies.db,
    dependencies.repositoryStorageBaseDir,
  );
  const knowledgeNotePersistence = new RepositoryKnowledgeNotePersistenceAdapter(
    dependencies.repositoryApiPort,
  );
  const goalPlanMutationPort = new GoalPlanMutationAdapter(
    dependencies.goalApplicationPort,
    dependencies.taskApplicationPort,
    dependencies.labelService,
    knowledgeNotePersistence,
    dependencies.knowledgeDocumentRefResolver,
    dependencies.goalKnowledgeService,
  );
  const taskPlanMutationPort = new TaskPlanMutationAdapter(
    dependencies.taskApplicationPort,
    dependencies.labelService,
  );
  const mastraRuntime = new MastraAIRuntime({
    storage: createMastraStorage(dependencies.mastraStorage),
    modelResolver: new MastraModelResolver(repositorySet.providerConfigRepository),
    transcriptBootstrapSource: new ConversationTranscriptBootstrapSource(
      repositorySet.conversationRepository,
    ),
    goalPlanMutationPort,
    taskPlanMutationPort,
    knowledgeCaptureMutationPort: new KnowledgeCapturePersistenceAdapter(knowledgeNotePersistence),
    knowledgeSourcePort,
    executionLogPort: repositorySet.executionLogPort,
    usageReadPort: repositorySet.executionLogPort,
    routineCommandPort: new RoutineAICommandAdapter(
      dependencies.reminderApplicationPort,
      dependencies.routineCommandPort,
    ),
    plannerReadPort: new PlannerAIReadAdapter(
      dependencies.scheduleRepository,
      dependencies.taskApplicationPort,
    ),
    notificationReadPort: new NotificationAIReadAdapter(dependencies.notificationRepository),
    userTimeContextPort: dependencies.userTimeContextPort,
  });
  const knowledgeIndexStatusPort = new RepositoryKnowledgeIndexStatusAdapter(
    dependencies.repositoryApiPort,
  );
  const analyticsReadPort = new ControlledAnalyticsReadAdapter(
    dependencies.db,
    dependencies.userTimeContextPort,
  );
  const evaluationReportPort = new AIEvaluationReportFileAdapter();

  const instance = createAIModule({
    conversationRepository: repositorySet.conversationRepository,
    providerConfigRepository: repositorySet.providerConfigRepository,
    providerOnboardingSessionRepository: repositorySet.providerOnboardingSessionRepository,
    providerOnboardingCommitPort: repositorySet.providerOnboardingCommitPort,
    mastraRuntime,
    workflowRuntime: mastraRuntime,
    knowledgeIndexRepository: repositorySet.knowledgeIndexRepository,
    executionLogPort: repositorySet.executionLogPort,
    evaluationReportPort,
    knowledgeNotePersistence,
    knowledgeSourcePort,
    knowledgeIndexStatusPort,
    analyticsReadPort,
  });

  return createAIApiModule({ instance });
}
