import type { TaskPlanMutationPort } from '@memoflow/ai';
import {
  createTaskPlanMutationAdapter,
  type TaskPlanMutationAdapterDeps,
} from '@memoflow/ai/adapters';
import type { LabelService } from '@memoflow/label';
import type { TaskApplicationPort } from '@memoflow/task';

/**
 * Desktop-host binding for the Mastra `task.create` workflow. It delegates to the
 * canonical `@memoflow/ai/adapters` implementation.
 */
export class DesktopTaskPlanMutationAdapter implements TaskPlanMutationPort {
  readonly #port: TaskPlanMutationPort;

  constructor(task: TaskApplicationPort, labels: LabelService) {
    const deps: TaskPlanMutationAdapterDeps = { task, labels };
    this.#port = createTaskPlanMutationAdapter(deps);
  }

  readTaskPlan(id: string, context: Parameters<TaskPlanMutationPort['readTaskPlan']>[1]) {
    return this.#port.readTaskPlan(id, context);
  }

  resolveLabels(
    names: readonly string[],
    context: Parameters<TaskPlanMutationPort['resolveLabels']>[1],
  ) {
    return this.#port.resolveLabels(names, context);
  }

  createTaskPlan(
    request: Parameters<TaskPlanMutationPort['createTaskPlan']>[0],
    context: Parameters<TaskPlanMutationPort['createTaskPlan']>[1],
  ) {
    return this.#port.createTaskPlan(request, context);
  }
}
