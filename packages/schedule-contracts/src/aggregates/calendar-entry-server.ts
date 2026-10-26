/**
 * CalendarEntry Aggregate Server DTO
 *
 * ADR-080: CalendarEntry owns content + canonical Timed/AllDay range only.
 * Conflict state is a derived Planner read concern and duration/priority are not
 * persisted product truth.
 *
 * @module Schedule
 */

import type { IdentityId, TransferDate } from '@memoflow/shared-primitives';
import type { ScheduleId } from '../value-objects/schedule-id';
import type { CalendarEntryRange } from '../calendar-entry-range';

export interface CalendarEntryServerDTO {
  id: ScheduleId;
  identityId: IdentityId;
  title: string;
  description?: string;
  range: CalendarEntryRange;
  location?: string;
  attendees?: string[];
  version: number;
  createdAt: TransferDate;
  updatedAt: TransferDate;
}
