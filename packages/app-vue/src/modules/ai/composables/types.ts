import type { AddKeyResultReq, CreateGoalReq } from '@memoflow/contracts/goal';
import type { Ref } from 'vue';
import type {
  ConversationListRes,
  GoalPlanReminder,
  GoalPlanTaskPlan,
  QueryKnowledgeRes,
} from '@memoflow/contracts/ai';
import type { IAIClient, IWorkflowRuntimeService } from '../../../di/types';

/** Options for useAIGoalWorkflow composable. */
export interface UseAIGoalWorkflowOptions {
  workflowRuntime: IWorkflowRuntimeService;
  selectedModel: Ref<ChatModelOption | null>;
  chatConversationId: Ref<string>;
  chatLoading: Ref<boolean>;
  chatTimeline: Ref<ChatItem[]>;
  conversationTitle: Ref<string>;
  hasWorkflowUserMessages: Ref<boolean>;
  buildConversationTranscript: () => string;
  scrollMessagesToBottom: () => void;
  maybeRenameCurrentConversation: (name: string) => Promise<void>;
  createGoal: (
    req: import('@memoflow/contracts/goal').CreateGoalReq,
  ) => Promise<{ id: string } | null>;
}

export interface UseAITaskWorkflowOptions {
  workflowRuntime: IWorkflowRuntimeService;
  selectedModel: Ref<ChatModelOption | null>;
  chatConversationId: Ref<string>;
  chatLoading: Ref<boolean>;
  hasWorkflowUserMessages: Ref<boolean>;
  buildConversationTranscript: () => string;
  scrollMessagesToBottom: () => void;
  maybeRenameCurrentConversation: (name: string) => Promise<void>;
  openCreatedTask?: (taskId: string) => Promise<unknown>;
}

export interface UseAIKnowledgeCaptureOptions {
  workflowRuntime: IWorkflowRuntimeService;
  selectedModel: Ref<ChatModelOption | null>;
  chatConversationId: Ref<string>;
  chatLoading: Ref<boolean>;
  hasWorkflowUserMessages: Ref<boolean>;
  buildConversationTranscript: () => string;
  scrollMessagesToBottom: () => void;
  maybeRenameCurrentConversation: (name: string) => Promise<void>;
  openCreatedNote?: (noteId: string) => Promise<unknown>;
}

export type TaskWorkflowStage =
  'collect' | 'clarification' | 'confirm' | 'result' | 'plan' | 'execute';
export type KnowledgeCaptureWorkflowStage =
  'collect' | 'clarification' | 'confirm' | 'result' | 'plan' | 'execute';

/** Options for useAIKnowledgeQaWorkflow composable. */
export interface UseAIKnowledgeQaWorkflowOptions {
  service: Pick<AIChatService, 'queryKnowledge'>;
  selectedModel: Ref<ChatModelOption | null>;
  chatConversationId: Ref<string>;
  chatLoading: Ref<boolean>;
  chatTimeline: Ref<ChatItem[]>;
  hasWorkflowUserMessages: Ref<boolean>;
  scrollMessagesToBottom: () => void;
  requestOpenKnowledgeNote: (id: string) => Promise<unknown>;
}

export type WorkflowMode =
  'chat' | 'goal-create' | 'task-create' | 'knowledge-capture' | 'knowledge-qa';

export type MessageStatus = 'generating' | 'success' | 'error' | 'aborted';

export type ChatItem = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: MessageStatus;
  errorMessage?: string;
};

export type ConversationSummary = ConversationListRes['data'][number];

export type ProviderListItem = {
  id: string;
  name?: string;
  defaultModel?: string | null;
  availableModels?: Array<{
    id: string;
    name?: string;
  }>;
  isDefault?: boolean;
};

export type ChatModelOption = {
  key: string;
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
};

export type AIChatService = Pick<
  IAIClient,
  | 'listConversations'
  | 'createConversation'
  | 'updateConversation'
  | 'deleteConversation'
  | 'queryKnowledge'
>;

export type AIWorkspaceRecentGoal = {
  id: string;
  title: string;
  status: string;
  updatedAt: number;
  dueDate: number | null;
  progress: number | null;
};
export type AIWorkspaceRecentKnowledgeNote = {
  id: string;
  title: string;
  path: string;
  updatedAt: number;
};
export type KnowledgeRelatedNote = {
  resourceId: string;
  resourcePath: string;
  title?: string;
  excerpt?: string;
  score?: number;
};
export type KnowledgeAnswer = QueryKnowledgeRes & {
  question: string;
  evidenceStatus: 'grounded' | 'insufficient';
  relatedNotes?: KnowledgeRelatedNote[];
};
export type GoalWorkflowStage =
  'collect' | 'clarification' | 'draft' | 'plan' | 'confirm' | 'execute' | 'result';

export interface GoalClarificationView {
  needsClarification: true;
  questions: Array<{ question: string; context: string | null }>;
  rationale: string | null;
}

export type EditableGoal = {
  name: string;
  description: string;
  motivation: string;
  feasibilityAnalysis: string;
  startDate: number | null;
  dueDate: number | null;
};

export type EditableKeyResult = {
  title: string;
  description: string;
  calculationMethod: AddKeyResultReq['calculationMethod'];
  startingValue: number;
  progressBaselineValue: number | null;
  currentValue: number;
  targetValue: number;
  unit: string;
  weight: number;
};

export type EditableGoalTaskPlan = {
  name: string;
  description: string;
  importance: GoalPlanTaskPlan['importance'];
  cadence: GoalPlanTaskPlan['cadence'];
  timeOfDay: string;
};

export type EditableGoalReminder = {
  title: string;
  description: string;
  importance: GoalPlanReminder['importance'];
  cadence: GoalPlanReminder['cadence'];
  timeOfDay: string;
};

export type PersistedWorkflowEntry = {
  /** Canonical WorkflowMode; unknown/legacy values are normalized on read. */
  mode: string;
  goalWorkflowStage?: GoalWorkflowStage;
  /** Canonical durable Workflow projection for goal.create. */
  goalWorkflowRun?: import('@memoflow/contracts/ai').AIWorkflowRunView | null;
  taskWorkflowRun?: import('@memoflow/contracts/ai').AIWorkflowRunView | null;
  /** Canonical durable Workflow projection for knowledge.capture. */
  knowledgeCaptureRun?: import('@memoflow/contracts/ai').AIWorkflowRunView | null;
  knowledgeAnswer?: KnowledgeAnswer | null;
  clarificationAnswers: string[];
  editableGoal: EditableGoal;
  editableKeyResults: EditableKeyResult[];
  editableTaskPlans?: EditableGoalTaskPlan[];
  editableReminders?: EditableGoalReminder[];
  showGoalDraftEditor: boolean;
};

export type PersistedConversationModelMap = Record<string, string>;

export function createEmptyGoalDraft(): EditableGoal {
  return { name: '', description: '', motivation: '', feasibilityAnalysis: '', startDate: null, dueDate: null };
}

export function createEmptyGoalTaskPlanDraft(): EditableGoalTaskPlan {
  return {
    name: '',
    description: '',
    importance: 'Moderate' as EditableGoalTaskPlan['importance'],
    cadence: 'weekly',
    timeOfDay: '09:00',
  };
}

export function createEmptyGoalReminderDraft(): EditableGoalReminder {
  return {
    title: '',
    description: '',
    importance: 'Moderate' as EditableGoalReminder['importance'],
    cadence: 'weekly',
    timeOfDay: '09:00',
  };
}

export function getToolLocaleKey(mode: WorkflowMode): string {
  return {
    chat: 'chat',
    'goal-create': 'goalCreate',
    'task-create': 'taskCreate',
    'knowledge-capture': 'knowledgeCapture',
    'knowledge-qa': 'knowledgeQa',
  }[mode];
}

export function normalizeWorkflowMode(mode: string | null | undefined): WorkflowMode {
  if (mode === 'goal') return 'goal-create';
  if (mode === 'knowledge-note') return 'knowledge-capture';
  if (mode === 'task' || mode === 'task.create') return 'task-create';
  if (
    mode === 'goal-create' ||
    mode === 'task-create' ||
    mode === 'knowledge-capture' ||
    mode === 'knowledge-qa'
  ) {
    return mode;
  }
  return 'chat';
}
