import {
  GatewayFailureCodeSchema,
  GatewayReadError,
  ScheduleCreateInputSchema,
  ScheduleUpdateInputSchema,
  ScheduleRescheduleInputSchema,
  ScheduleDeleteInputSchema,
  ScheduleWriteReceiptSchema,
  ScheduleRescheduleReceiptSchema,
  ScheduleDeleteReceiptSchema,
  type GatewayWriteAuthority,
  type GatewayWritePort,
} from '@memoflow/agent-gateway';
import type { ScheduleEventApplicationPort } from '@memoflow/schedule';
import type { Result } from '@memoflow/transport-contracts/result';

/** Owner failures become stable gateway codes; unknown codes fail closed. */
function unwrapOwner(result: Result<unknown>): unknown {
  if (!result.ok) {
    const code = GatewayFailureCodeSchema.safeParse(result.error.code);
    throw new GatewayReadError(code.success ? code.data : 'INTERNAL_ERROR');
  }
  return result.data;
}

/** Only the bounded write receipt leaves this seam, never the owner client DTO. */
function receipt(dto: unknown) {
  const row = dto as Record<string, unknown>;
  return ScheduleWriteReceiptSchema.parse({
    id: String(row.id),
    version: row.version,
    updatedAt: row.updatedAt,
  });
}

/**
 * One owner transition: the credential scope is rechecked and the write
 * authority revalidates the credential immediately before the owner call.
 */
async function transition(
  authority: GatewayWriteAuthority,
  call: () => Promise<Result<unknown>>,
) {
  if (!authority.scopes.includes('schedules:write')) throw new GatewayReadError('FORBIDDEN');
  await authority.authorize();
  return unwrapOwner(await call());
}

/**
 * Binds Calendar entry writes to the Schedule owner's application port. The
 * caller supplies no identity: ownership comes from the ExecutionContext, so
 * another owner's entries cannot be reached.
 */
export function bindScheduleWrites(port: ScheduleEventApplicationPort): Required<
  Pick<
    GatewayWritePort,
    'scheduleCreate' | 'scheduleUpdate' | 'scheduleReschedule' | 'scheduleDelete'
  >
> {
  return {
    async scheduleCreate(input, context, authority) {
      const parsed = ScheduleCreateInputSchema.parse(input);
      return receipt(await transition(authority, () => port.createEvent(parsed, context)));
    },
    async scheduleUpdate(input, context, authority) {
      const parsed = ScheduleUpdateInputSchema.parse(input);
      return receipt(
        await transition(authority, () =>
          port.updateEvent(
            parsed.id,
            { ...parsed.changes, expectedVersion: parsed.expectedVersion },
            context,
          ),
        ),
      );
    },
    async scheduleReschedule(input, context, authority) {
      const parsed = ScheduleRescheduleInputSchema.parse(input);
      const dto = await transition(authority, () =>
        port.updateEvent(
          parsed.id,
          { range: parsed.range, expectedVersion: parsed.expectedVersion },
          context,
        ),
      );
      return ScheduleRescheduleReceiptSchema.parse({
        ...receipt(dto),
        range: (dto as Record<string, unknown>).range,
      });
    },
    async scheduleDelete(input, context, authority) {
      const parsed = ScheduleDeleteInputSchema.parse(input);
      await transition(authority, () =>
        port.deleteEvent(parsed.id, context, parsed.expectedVersion),
      );
      return ScheduleDeleteReceiptSchema.parse({ id: parsed.id, deleted: true });
    },
  };
}
