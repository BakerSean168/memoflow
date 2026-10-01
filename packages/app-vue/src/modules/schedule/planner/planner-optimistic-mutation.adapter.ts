import type {
  PlannerMutationOutcome,
  PlannerMutationRequest,
  PlannerOwnerCommandRouter,
} from './planner-owner-command.router';

export interface PlannerOptimisticMutationInput extends PlannerMutationRequest {
  /** FullCalendar eventDrop/eventResize supplies this rollback closure. */
  readonly revert: () => void;
}

/**
 * FullCalendar already applied the visual move/resize when its callback runs.
 * The owner command is therefore the authority check; every non-applied result
 * reverts the visual mutation. Canonical projection objects are never mutated.
 */
export async function applyPlannerOptimisticMutation(
  router: PlannerOwnerCommandRouter,
  input: PlannerOptimisticMutationInput,
): Promise<PlannerMutationOutcome> {
  let outcome: PlannerMutationOutcome;
  try {
    outcome = await router.route(input);
  } catch {
    outcome = {
      status: 'failed',
      code: 'OWNER_COMMAND_EXCEPTION',
      message: 'Planner owner command failed',
      ownerType: input.projection.ownerCommandTarget.ownerType,
    };
  }
  if (outcome.status !== 'applied') input.revert();
  return outcome;
}
