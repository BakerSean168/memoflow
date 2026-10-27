import type { GoalPlanMutationPort, IKnowledgeNotePersistencePort } from '@memoflow/ai';
import {
  createGoalPlanMutationAdapter,
  type GoalPlanMutationAdapterDeps,
} from '@memoflow/ai/adapters';
import type { GoalApplicationPort } from '@memoflow/goal';
import type { LabelService } from '@memoflow/label';
import type { GoalKnowledgeService, KnowledgeDocumentRefResolver } from '@memoflow/relation';
import type { TaskApplicationPort } from '@memoflow/task';

/**
 * Desktop-host binding for the GoalPlanDraft V2 durable workflow.
 *
 * The host only composes already-owned application capabilities; the behaviour
 * lives in `@memoflow/ai/adapters`.
 */
export class DesktopGoalPlanMutationAdapter implements GoalPlanMutationPort {
  readonly #port: GoalPlanMutationPort;

  constructor(
    goal: GoalApplicationPort,
    task: TaskApplicationPort,
    labels: LabelService,
    knowledgeNotes: IKnowledgeNotePersistencePort,
    knowledgeRefs: KnowledgeDocumentRefResolver,
    goalKnowledge: Pick<GoalKnowledgeService, 'link'>,
  ) {
    const deps: GoalPlanMutationAdapterDeps = {
      goal,
      task,
      labels,
      knowledgeNotes,
      knowledgeRefs,
      goalKnowledge,
    };
    this.#port = createGoalPlanMutationAdapter(deps);
  }

  readGoal(goalId: string, context: Parameters<GoalPlanMutationPort['readGoal']>[1]) {
    return this.#port.readGoal(goalId, context);
  }

  resolveLabels(
    names: readonly string[],
    context: Parameters<GoalPlanMutationPort['resolveLabels']>[1],
  ) {
    return this.#port.resolveLabels(names, context);
  }

  createGoal(
    request: Parameters<GoalPlanMutationPort['createGoal']>[0],
    context: Parameters<GoalPlanMutationPort['createGoal']>[1],
  ) {
    return this.#port.createGoal(request, context);
  }

  activateGoal(
    goalId: string,
    expectedVersion: number,
    context: Parameters<GoalPlanMutationPort['activateGoal']>[2],
  ) {
    return this.#port.activateGoal(goalId, expectedVersion, context);
  }

  createTaskPlan(
    request: Parameters<GoalPlanMutationPort['createTaskPlan']>[0],
    context: Parameters<GoalPlanMutationPort['createTaskPlan']>[1],
  ) {
    return this.#port.createTaskPlan(request, context);
  }

  createKnowledgeDocument(
    request: Parameters<GoalPlanMutationPort['createKnowledgeDocument']>[0],
    context: Parameters<GoalPlanMutationPort['createKnowledgeDocument']>[1],
  ) {
    return this.#port.createKnowledgeDocument(request, context);
  }

  linkGoalKnowledge(
    goalId: string,
    knowledgeDocument: Parameters<GoalPlanMutationPort['linkGoalKnowledge']>[1],
    context: Parameters<GoalPlanMutationPort['linkGoalKnowledge']>[2],
  ) {
    return this.#port.linkGoalKnowledge(goalId, knowledgeDocument, context);
  }
}
