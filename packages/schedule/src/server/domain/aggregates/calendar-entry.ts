import { AggregateRoot } from '@memoflow/utils/domain';
import { IdentityId } from '@memoflow/domain-shared';
import type {
  CalendarEntryClientDTO,
  CalendarEntryRange,
  CalendarEntryServerDTO,
  ConflictDetail,
  ConflictDetectionResult,
  ConflictSuggestion,
  ScheduleEventMap,
} from '@memoflow/contracts/schedule';
import {
  CalendarEntryRangeSchema,
  cloneCalendarEntryRange,
  ConflictSeverity,
} from '@memoflow/contracts/schedule';
import { ScheduleId } from '../value-objects/schedule-id';

/** ADR-080 CalendarEntry aggregate state: content + canonical range only. */
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

type TimedRange = Extract<CalendarEntryRange, { kind: 'Timed' }>;

function validateRange(range: CalendarEntryRange): CalendarEntryRange {
  return cloneCalendarEntryRange(CalendarEntryRangeSchema.parse(range));
}

function rangesEqual(left: CalendarEntryRange, right: CalendarEntryRange): boolean {
  return left.kind === right.kind && left.start === right.start && left.end === right.end;
}

export class CalendarEntry extends AggregateRoot<ScheduleId> {
  private _props: CalendarEntryState;

  private constructor(state: CalendarEntryState) {
    super(state.id);
    this._props = state;
  }

  public get version(): number {
    return this._props.version;
  }

  public incrementVersion(): void {
    this._props.version += 1;
  }

  public get identityId(): IdentityId {
    return this._props.identityId;
  }

  public get title(): string {
    return this._props.title;
  }

  public get description(): string | null {
    return this._props.description;
  }

  public get range(): CalendarEntryRange {
    return cloneCalendarEntryRange(this._props.range);
  }

  public get location(): string | null {
    return this._props.location;
  }

  public get attendees(): string[] | null {
    return this._props.attendees ? [...this._props.attendees] : null;
  }

  public get createdAt(): Date {
    return this._props.createdAt;
  }

  public get updatedAt(): Date {
    return this._props.updatedAt;
  }

  public static create(params: {
    identityId: IdentityId;
    title: string;
    description?: string;
    range: CalendarEntryRange;
    location?: string;
    attendees?: string[];
  }): CalendarEntry {
    if (!params.title || params.title.trim().length === 0) {
      throw new Error('Title cannot be empty');
    }

    const range = validateRange(params.range);
    const now = new Date();
    const entry = new CalendarEntry({
      id: ScheduleId.generate(),
      identityId: params.identityId,
      title: params.title,
      description: params.description ?? null,
      range,
      location: params.location ?? null,
      attendees: params.attendees ? [...params.attendees] : null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    entry.addDomainEvent<ScheduleEventMap['schedule:calendar-entry-created']>(
      'schedule:calendar-entry-created',
      {
        identityId: params.identityId,
        title: params.title,
        range: cloneCalendarEntryRange(range),
      },
    );

    return entry;
  }

  public static load(state: CalendarEntryState): CalendarEntry {
    return new CalendarEntry({
      ...state,
      range: validateRange(state.range),
      attendees: state.attendees ? [...state.attendees] : null,
      version: state.version ?? 1,
    });
  }

  /**
   * Temporary single-source conflict seam retained until P4-2301B.
   * All-day entries are calendar facts but are not treated as blocking occupancy here.
   */
  public detectConflicts(otherEntries: CalendarEntry[]): ConflictDetectionResult {
    const ownRange = this.timedRange();
    if (!ownRange) return { hasConflict: false, conflicts: [], suggestions: [] };

    const conflictingEntries = otherEntries.filter((other) => this.isOverlapping(other));
    if (conflictingEntries.length === 0) {
      return { hasConflict: false, conflicts: [], suggestions: [] };
    }

    const conflicts: ConflictDetail[] = conflictingEntries.flatMap((entry) => {
      const otherRange = entry.timedRange();
      if (!otherRange) return [];
      const overlapStart = Math.max(ownRange.start, otherRange.start);
      const overlapEnd = Math.min(ownRange.end, otherRange.end);
      const overlapDuration = this.calculateDuration(overlapStart, overlapEnd);
      return [
        {
          scheduleId: entry.id,
          scheduleTitle: entry.title,
          overlapStart,
          overlapEnd,
          overlapDuration,
          severity: this.classifySeverity(overlapDuration),
        },
      ];
    });

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
      suggestions: this.generateSuggestions(conflictingEntries),
    };
  }

  private timedRange(): TimedRange | null {
    return this._props.range.kind === 'Timed' ? this._props.range : null;
  }

  private isOverlapping(other: CalendarEntry): boolean {
    const own = this.timedRange();
    const theirs = other.timedRange();
    return own != null && theirs != null && own.start < theirs.end && own.end > theirs.start;
  }

  private calculateDuration(startTime: number, endTime: number): number {
    return Math.round((endTime - startTime) / 60000);
  }

  private classifySeverity(overlapMinutes: number): ConflictSeverity {
    if (overlapMinutes > 60) return ConflictSeverity.Severe;
    if (overlapMinutes >= 15) return ConflictSeverity.Moderate;
    return ConflictSeverity.Minor;
  }

  private generateSuggestions(conflicts: CalendarEntry[]): ConflictSuggestion[] {
    const own = this.timedRange();
    if (!own) return [];
    const timedConflicts = conflicts
      .map((entry) => ({ entry, range: entry.timedRange() }))
      .filter((item): item is { entry: CalendarEntry; range: TimedRange } => item.range != null)
      .sort((a, b) => a.range.start - b.range.start);

    const suggestions: ConflictSuggestion[] = [];
    const earliest = timedConflicts[0]?.range;
    const latest = timedConflicts[timedConflicts.length - 1]?.range;
    const ownDuration = own.end - own.start;

    if (earliest) {
      const newEndTime = earliest.start;
      suggestions.push({ type: 'MoveEarlier', newStartTime: newEndTime - ownDuration, newEndTime });
    }
    if (latest) {
      const newStartTime = latest.end;
      suggestions.push({ type: 'MoveLater', newStartTime, newEndTime: newStartTime + ownDuration });
    }
    if (earliest && own.start < earliest.start) {
      suggestions.push({ type: 'Shorten', newStartTime: own.start, newEndTime: earliest.start });
    }
    return suggestions;
  }

  public toClientDTO(): CalendarEntryClientDTO {
    return {
      id: this.id,
      identityId: this._props.identityId,
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

  public toServerDTO(): CalendarEntryServerDTO {
    return this.toClientDTO();
  }

  public delete(): void {
    this._props.version += 1;
    this._props.updatedAt = new Date();
    this.addDomainEvent<ScheduleEventMap['schedule:calendar-entry-deleted']>(
      'schedule:calendar-entry-deleted',
      { entryId: this.id as ScheduleId },
    );
  }

  public update(params: {
    title?: string;
    description?: string | null;
    range?: CalendarEntryRange;
    location?: string | null;
    attendees?: string[] | null;
  }): void {
    let changed = false;
    const changedFields: string[] = [];

    if (params.title !== undefined && params.title !== this._props.title) {
      if (!params.title || params.title.trim().length === 0)
        throw new Error('Title cannot be empty');
      this._props.title = params.title;
      changedFields.push('title');
      changed = true;
    }
    if (params.description !== undefined && params.description !== this._props.description) {
      this._props.description = params.description;
      changedFields.push('description');
      changed = true;
    }
    if (params.location !== undefined && params.location !== this._props.location) {
      this._props.location = params.location;
      changedFields.push('location');
      changed = true;
    }
    if (params.attendees !== undefined) {
      this._props.attendees = params.attendees ? [...params.attendees] : null;
      changedFields.push('attendees');
      changed = true;
    }

    let oldRange: CalendarEntryRange | null = null;
    if (params.range !== undefined) {
      const nextRange = validateRange(params.range);
      if (!rangesEqual(nextRange, this._props.range)) {
        oldRange = cloneCalendarEntryRange(this._props.range);
        this._props.range = nextRange;
        changed = true;
      }
    }

    if (!changed) return;
    this._props.version += 1;
    this._props.updatedAt = new Date();

    if (oldRange) {
      this.addDomainEvent<ScheduleEventMap['schedule:calendar-entry-rescheduled']>(
        'schedule:calendar-entry-rescheduled',
        {
          entryId: this.id as ScheduleId,
          oldRange,
          newRange: cloneCalendarEntryRange(this._props.range),
        },
      );
    }
    if (changedFields.length > 0) {
      this.addDomainEvent<ScheduleEventMap['schedule:calendar-entry-updated']>(
        'schedule:calendar-entry-updated',
        { entryId: this.id as ScheduleId, changedFields },
      );
    }
  }

  public reschedule(range: CalendarEntryRange): void {
    this.update({ range });
  }

  public updateTitle(title: string): void {
    this.update({ title });
  }
  public updateDescription(description: string | null): void {
    this.update({ description });
  }
  public updateLocation(location: string | null): void {
    this.update({ location });
  }
  public updateAttendees(attendees: string[] | null): void {
    this.update({ attendees });
  }
}
