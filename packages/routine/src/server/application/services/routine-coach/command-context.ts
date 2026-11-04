import { ResultCode, ResultErrorException } from '@memoflow/transport-contracts/result';
import type { ProtocolSessionRuntime } from '../../../runtime/protocol';
import type { CreateRoutineCoachCommandServiceOptions } from '../routine-coach-command.service';

/**
 * Internal shared context threaded through the routine-coach command
 * sub-factories. Not part of the package's public surface.
 */
export interface RoutineCoachCommandContext {
  readonly options: CreateRoutineCoachCommandServiceOptions;
  readonly now: () => number;
  readonly protocolRuntime: ProtocolSessionRuntime;
  readonly notifyOverrideChanged: (identityId: string, routineId: string) => Promise<void>;
  readonly notifyScheduleChanged: (identityId: string, routineId: string) => Promise<void>;
}

export function routineNotFound(message: string): ResultErrorException {
  return new ResultErrorException(message, ResultCode.NOT_FOUND, undefined, undefined, 404);
}

export function routineConflict(message: string): ResultErrorException {
  return new ResultErrorException(message, ResultCode.CONFLICT, undefined, undefined, 409);
}

export function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive integer`);
  }
  return value;
}

export function optionalPositiveInteger(
  value: number | null | undefined,
  field: string,
): number | null {
  if (value == null) return null;
  return positiveInteger(value, field);
}
