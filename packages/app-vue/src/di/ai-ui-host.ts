import { nativeDraftFromKnowledgeDraft } from '@memoflow/repository-ui';
import { useGoalNativeSurface } from '@memoflow/goal-ui';
import { useReferenceableKnowledgeNotes } from '@memoflow/repository-ui';
import { openLocalAgentNoteReview } from '@memoflow/repository-ui';
import { useRecentKnowledgeNotes } from '@memoflow/repository-ui';
import { useTask } from '@memoflow/task-ui';
import { useGoal } from '@memoflow/goal-ui';
import { bindAiUiHost } from '@memoflow/ai-ui/host';
import {
  resetWorkspaceEvents,
  subscribeWorkspaceEvents,
} from '../shared/services/workspace-event-subscription';
import { canLeaveBusinessSurface } from '../layouts/shell/surface-leave-protocol';
import {
  AI_AGENT_REGISTRY_KEY,
  AI_ASSISTANT_RUNTIME_KEY,
  AI_CLIENT_KEY,
  AI_CONFIGURATION_REVISION_KEY,
  AI_LOCAL_AGENT_KEY,
  AI_RUNTIME_USAGE_KEY,
  AI_WORKFLOW_RUNTIME_KEY,
  ASSISTANT_SURFACE_KEY,
  GOAL_SERVICE_KEY,
  REPOSITORY_SERVICE_KEY,
  SHELL_COMPOSER_DENSITY_KEY,
  SHELL_COMPOSER_MOUNT_KEY,
  TASK_SERVICE_KEY,
} from '../di/keys';
import {
  useKnowledgeNativeSurface,
  useKnowledgeNativeSurfaceRegistration,
} from '../layouts/shell/useKnowledgeNativeSurface';
import { useTaskNativeSurface } from '../layouts/shell/useTaskNativeSurface';
import { useLabelCatalog } from '../shared/composables/useLabelCatalog';
import { semanticElevationClass } from '../shared/constants/semantic-elevation';
import { COMPOSER_TEXTAREA_MAX_PX } from '../layouts/shell/panel-geometry';
import { semanticToneStatusClass } from '../shared/constants/semantic-tone';
import { renderSafeMarkdown } from '../shared/utils/safe-markdown';
import { useAppShellStore } from '../layouts/shell/useAppShellStore';
import { installPlatformRendererHost } from './platform-ui-host';

export function installAiUiHost(): void {
  bindAiUiHost({
    ...installPlatformRendererHost(),
    nativeDraftFromKnowledgeDraft: (...args) => nativeDraftFromKnowledgeDraft(...args),
    useGoalNativeSurface: (...args) => useGoalNativeSurface(...args),
    useReferenceableKnowledgeNotes: (...args) => useReferenceableKnowledgeNotes(...args),
    openLocalAgentNoteReview: (...args) => openLocalAgentNoteReview(...args),
    useRecentKnowledgeNotes: (...args) => useRecentKnowledgeNotes(...args),
    useTask: (...args) => useTask(...args),
    useGoal: (...args) => useGoal(...args),
    AI_AGENT_REGISTRY_KEY,
    AI_ASSISTANT_RUNTIME_KEY,
    AI_CLIENT_KEY,
    AI_CONFIGURATION_REVISION_KEY,
    AI_LOCAL_AGENT_KEY,
    AI_RUNTIME_USAGE_KEY,
    AI_WORKFLOW_RUNTIME_KEY,
    ASSISTANT_SURFACE_KEY,
    COMPOSER_TEXTAREA_MAX_PX,
    GOAL_SERVICE_KEY,
    REPOSITORY_SERVICE_KEY,
    SHELL_COMPOSER_DENSITY_KEY,
    SHELL_COMPOSER_MOUNT_KEY,
    TASK_SERVICE_KEY,
    canLeaveBusinessSurface,
    renderSafeMarkdown,
    resetWorkspaceEvents,
    semanticElevationClass,
    semanticToneStatusClass,
    subscribeWorkspaceEvents,
    useAppShellStore,
    useKnowledgeNativeSurface,
    useKnowledgeNativeSurfaceRegistration,
    useLabelCatalog,
    useTaskNativeSurface,
  });
}
