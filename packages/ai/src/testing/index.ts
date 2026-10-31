/** Test-only stubs for the Mastra-native AI module. */
export * from './ai-test-support';
export { createNativeAgentFlowFixture, type NativeProbeFailure } from './native-agent-flow';

// Durable workflow harness ingredients; no production transport imports framework internals.
export {
  MastraDurableWorkflowRuntime,
  createTaskCreateWorkflow,
  ApplyTaskPlanService,
  createGoalCreateWorkflow,
  ApplyGoalPlanService,
  createKnowledgeCaptureWorkflow,
  ApplyKnowledgeNoteService,
} from '../server/mastra';
export { createPermissionFlowFixture } from './permission-flow';
