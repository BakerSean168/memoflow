/**
 * AI Electron composition root — desktop lane host runtime.
 * AI Electron 组合根 —— desktop lane 宿主运行时。
 *
 * This is the desktop-lane composition root for AI. The desktop main runtime
 * owns the per-profile PowerSync database (IElectronDatabase), so it selects the
 * PowerSync persistence adapters, builds the Mastra runtime, wires the host-owned
 * knowledge persistence/source and analytics read ports plus canonical Goal/Task
 * workflow mutation ports, assembles the transport-neutral
 * `AIModuleInstance`, and turns it into an already-bound `IElectronModule`-
 * compatible handle via `createAIElectronModule`. Stream/session handling stays
 * in the Electron transport file.
 *
 * AI-VNEXT-07: Mastra is the only runtime. The Python AIService adapters and
 * ai-service runtime config are removed.
 */

import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { GoalApplicationPort } from '@memoflow/goal';
import type { ReminderApplicationPort } from '@memoflow/reminder';
import type { RoutineCoachCommandPort } from '@memoflow/reminder/routine-runtime';
import type { IScheduleRepository } from '@memoflow/schedule';
import type { INotificationRepository } from '@memoflow/notification';
import type { TaskApplicationPort } from '@memoflow/task';
import type { LabelService } from '@memoflow/label';
import type { GoalKnowledgeService, KnowledgeDocumentRefResolver } from '@memoflow/relation';
import type { UserTimeContextPort } from '@memoflow/time';
import {
  AIEvaluationReportFileAdapter,
  createAIModule,
  createAIPowerSyncRepositories,
  createMastraStorage,
  ConversationTranscriptBootstrapSource,
  KnowledgeCapturePersistenceAdapter,
  MastraAIRuntime,
  MastraModelResolver,
  type MastraStorageConfig,
  type IAnalyticsReadPort,
  type IKnowledgeNotePersistencePort,
  type IKnowledgeSourcePort,
} from '@memoflow/ai';
import { createAIElectronModule, type AIElectronModuleDef } from '@memoflow/ai/electron';
import { DesktopGoalPlanMutationAdapter } from '../modules/ai/goal-plan-mutation.adapter';
import { DesktopTaskPlanMutationAdapter } from '../modules/ai/task-plan-mutation.adapter';
import { DesktopRoutineAICommandAdapter } from '../modules/ai/routine-command.adapter';
import { DesktopPlannerAIReadAdapter } from '../modules/ai/planner-read.adapter';
import { DesktopNotificationAIReadAdapter } from '../modules/ai/notification-read.adapter';

export interface ComposeAIElectronDependencies {
  readonly db: IElectronDatabase;
  readonly knowledgeNotePersistence: IKnowledgeNotePersistencePort;
  readonly knowledgeSourcePort: IKnowledgeSourcePort;
  readonly analyticsReadPort: IAnalyticsReadPort;
  readonly goalApplicationPort: GoalApplicationPort;
  readonly taskApplicationPort: TaskApplicationPort;
  readonly reminderApplicationPort: ReminderApplicationPort;
  readonly goalKnowledgeService: Pick<GoalKnowledgeService, 'link'>;
  readonly knowledgeDocumentRefResolver: KnowledgeDocumentRefResolver;
  readonly labelService: LabelService;
  readonly routineCommandPort: RoutineCoachCommandPort;
  readonly scheduleRepository: IScheduleRepository;
  readonly notificationRepository: INotificationRepository;
  readonly userTimeContextPort: UserTimeContextPort;
  readonly mastraStorage: MastraStorageConfig;
}

/**
 * Composes the AI Electron module handle from the desktop runtime's database.
 */
export function composeAI(dependencies: ComposeAIElectronDependencies): AIElectronModuleDef {
  const {
    conversationRepository,
    providerConfigRepository,
    knowledgeIndexRepository,
    executionLogPort,
    providerOnboardingSessionRepository,
    providerOnboardingCommitPort,
  } = createAIPowerSyncRepositories(dependencies.db);
  const goalPlanMutationPort = new DesktopGoalPlanMutationAdapter(
    dependencies.goalApplicationPort,
    dependencies.taskApplicationPort,
    dependencies.labelService,
    dependencies.knowledgeNotePersistence,
    dependencies.knowledgeDocumentRefResolver,
    dependencies.goalKnowledgeService,
  );
  const taskPlanMutationAdapter = new DesktopTaskPlanMutationAdapter(
    dependencies.taskApplicationPort,
    dependencies.labelService,
  );
  const mastraRuntime = new MastraAIRuntime({
    storage: createMastraStorage(dependencies.mastraStorage),
    modelResolver: new MastraModelResolver(providerConfigRepository),
    transcriptBootstrapSource: new ConversationTranscriptBootstrapSource(conversationRepository),
    goalPlanMutationPort,
    taskPlanMutationPort: taskPlanMutationAdapter,
    knowledgeCaptureMutationPort: new KnowledgeCapturePersistenceAdapter(
      dependencies.knowledgeNotePersistence,
    ),
    knowledgeSourcePort: dependencies.knowledgeSourcePort,
    executionLogPort,
    usageReadPort: executionLogPort,
    routineCommandPort: new DesktopRoutineAICommandAdapter(
      dependencies.reminderApplicationPort,
      dependencies.routineCommandPort,
    ),
    plannerReadPort: new DesktopPlannerAIReadAdapter(
      dependencies.scheduleRepository,
      dependencies.taskApplicationPort,
    ),
    userTimeContextPort: dependencies.userTimeContextPort,
    notificationReadPort: new DesktopNotificationAIReadAdapter(dependencies.notificationRepository),
  });

  const instance = createAIModule({
    conversationRepository,
    providerConfigRepository,
    providerOnboardingSessionRepository,
    providerOnboardingCommitPort,
    mastraRuntime,
    workflowRuntime: mastraRuntime,
    knowledgeIndexRepository,
    executionLogPort,
    evaluationReportPort: new AIEvaluationReportFileAdapter(),
    knowledgeNotePersistence: dependencies.knowledgeNotePersistence,
    knowledgeSourcePort: dependencies.knowledgeSourcePort,
    analyticsReadPort: dependencies.analyticsReadPort,
  });

  return createAIElectronModule({ instance });
}
