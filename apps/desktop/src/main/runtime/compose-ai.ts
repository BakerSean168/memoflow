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
import type { RoutineCoachCommandPort } from '@memoflow/reminder/routine-runtime';
import type { ScheduleEventApplicationPort } from '@memoflow/schedule';
import type { NotificationInboxPort } from '@memoflow/notification';
import type { TaskApplicationPort } from '@memoflow/task';
import type { LabelService } from '@memoflow/label';
import type { GoalKnowledgeService, KnowledgeDocumentRefResolver } from '@memoflow/relation';
import type { UserTimeContextPort } from '@memoflow/time';
import {
  AIEvaluationReportFileAdapter,
  AIContextAssembler,
  createAIModule,
  createAIPowerSyncRepositories,
  createMastraStorage,
  ConversationShellSource,
  KnowledgeCapturePersistenceAdapter,
  MastraAIRuntime,
  MastraModelResolver,
  type MastraStorageConfig,
  type IAnalyticsReadPort,
  type IKnowledgeNotePersistencePort,
  type IKnowledgeSourcePort,
  type AIModuleInstance,
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
  readonly goalKnowledgeService: Pick<GoalKnowledgeService, 'link'>;
  readonly knowledgeDocumentRefResolver: KnowledgeDocumentRefResolver;
  readonly labelService: LabelService;
  readonly routineCommandPort: RoutineCoachCommandPort;
  /** Schedule-owned Calendar Event read seam for Planner projections. */
  readonly scheduleEventApi: ScheduleEventApplicationPort;
  /** Notification-owned Fact/Inbox seam for AI reads and typed actions. */
  readonly notificationInbox: NotificationInboxPort;
  readonly userTimeContextPort: UserTimeContextPort;
  readonly mastraStorage: MastraStorageConfig;
}

/**
 * Composes the AI Electron module handle from the desktop runtime's database.
 */
export interface ComposedAIElectron {
  readonly module: AIElectronModuleDef;
  /** AI-owned Conversation shell portability capability for host registration. */
  readonly portableCapability: AIModuleInstance['portableCapability'];
}

export function composeAI(
  dependencies: ComposeAIElectronDependencies,
): ComposedAIElectron {
  const {
    conversationRepository,
    providerConfigRepository,
    providerSecretVault,
    knowledgeIndexRepository,
    executionRecordPort,
    providerOnboardingSessionRepository,
    providerOnboardingCommitPort,
  } = createAIPowerSyncRepositories(dependencies.db);
  const contextAssembler = new AIContextAssembler(dependencies.userTimeContextPort);
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
    modelResolver: new MastraModelResolver(providerConfigRepository, providerSecretVault),
    conversationShellSource: new ConversationShellSource(conversationRepository),
    goalPlanMutationPort,
    taskPlanMutationPort: taskPlanMutationAdapter,
    knowledgeCaptureMutationPort: new KnowledgeCapturePersistenceAdapter(
      dependencies.knowledgeNotePersistence,
    ),
    knowledgeSourcePort: dependencies.knowledgeSourcePort,
    executionRecordPort,
    usageReadPort: executionRecordPort,
    routineCommandPort: new DesktopRoutineAICommandAdapter(dependencies.routineCommandPort),
    plannerReadPort: new DesktopPlannerAIReadAdapter(
      dependencies.scheduleEventApi,
      dependencies.taskApplicationPort,
      dependencies.userTimeContextPort,
    ),
    notificationReadPort: new DesktopNotificationAIReadAdapter(dependencies.notificationInbox),
    contextAssembler,
  });

  const instance = createAIModule({
    conversationRepository,
    providerConfigRepository,
    providerSecretVault,
    providerOnboardingSessionRepository,
    providerOnboardingCommitPort,
    mastraRuntime,
    workflowRuntime: mastraRuntime,
    knowledgeIndexRepository,
    executionRecordPort,
    evaluationReportPort: new AIEvaluationReportFileAdapter(),
    knowledgeNotePersistence: dependencies.knowledgeNotePersistence,
    knowledgeSourcePort: dependencies.knowledgeSourcePort,
    analyticsReadPort: dependencies.analyticsReadPort,
  });

  return {
    module: createAIElectronModule({ instance }),
    portableCapability: instance.portableCapability,
  };
}
