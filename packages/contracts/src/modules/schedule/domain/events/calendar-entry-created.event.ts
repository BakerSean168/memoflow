import type { IdentityId } from '../../../../primitives';
import type { CalendarEntryRange } from '../../calendar-entry-range';

/** Emitted after a CalendarEntry with canonical ADR-080 range truth is created. */
export interface CalendarEntryCreatedEvent {
  identityId: IdentityId;
  title: string;
  range: CalendarEntryRange;
}
