/**
 * Schedule module importer — handles schedule entries and schedule tasks.
 */

import type { ImportContext } from '../../portable-runtime';
import type { PortableScheduleData } from '@memoflow/contracts/data-portability';
import type { TxClient } from './import-helpers';
import { allocateId, jsonStringify, inc, rec, timestamps } from './import-helpers';


export async function importSchedules(
  tx: TxClient, ctx: ImportContext, data: PortableScheduleData,
): Promise<void> {
  for (const entry of data.entries) {
    const e = rec(entry);
    const id = allocateId(ctx, e._ref as string);
    await tx.createSchedule({
      id, identityId: ctx.identityId,
      title: e.title as string, description: e.description as string | null ?? null,
      startTime: String(e.startTime),
      endTime: String(e.endTime),
      duration: e.duration as number,
      priority: e.priority as number | null ?? null,
      location: e.location as string | null ?? null,
      attendees: e.attendees ? jsonStringify(e.attendees) : null,
      ...timestamps(e),
    });
    inc(ctx, 'schedules');
  }

}
