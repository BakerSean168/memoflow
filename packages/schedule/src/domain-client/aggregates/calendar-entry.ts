import type { CalendarEntryClientDTO, CalendarEntryRange } from '@memoflow/contracts/schedule';
import { cloneCalendarEntryRange } from '@memoflow/contracts/schedule';
import { AggregateRoot } from '@memoflow/utils/domain';
import { ScheduleId } from '../../server/domain/value-objects/schedule-id';
import { IdentityId } from '@memoflow/domain-shared';

export interface CalendarEntryState {
  id: ScheduleId;
  identityId: IdentityId;
  title: string;
  description: string | null;
  range: CalendarEntryRange;
  location: string | null;
  attendees: string[] | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class CalendarEntry extends AggregateRoot<ScheduleId> {
  private readonly _props: CalendarEntryState;

  private constructor(props: CalendarEntryState) {
    super(props.id);
    this._props = props;
  }

  get identityId(): IdentityId {
    return this._props.identityId;
  }
  get title(): string {
    return this._props.title;
  }
  get description(): string | null {
    return this._props.description;
  }
  get range(): CalendarEntryRange {
    return cloneCalendarEntryRange(this._props.range);
  }
  get location(): string | null {
    return this._props.location;
  }
  get attendees(): string[] | null {
    return this._props.attendees ? [...this._props.attendees] : null;
  }

  public static load(state: CalendarEntryState): CalendarEntry {
    return new CalendarEntry({ ...state, range: cloneCalendarEntryRange(state.range) });
  }

  public toDTO(): CalendarEntryClientDTO {
    return {
      id: this.id as ScheduleId,
      identityId: this._props.identityId as IdentityId,
      title: this._props.title,
      description: this._props.description ?? undefined,
      range: cloneCalendarEntryRange(this._props.range),
      location: this._props.location ?? undefined,
      attendees: this._props.attendees ?? undefined,
      version: this._props.version,
      createdAt: this._props.createdAt.getTime(),
      updatedAt: this._props.updatedAt.getTime(),
    };
  }
}
