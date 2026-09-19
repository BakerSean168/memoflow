import { ValueObject } from '@memoflow/utils/domain';
import type {
  NotificationWeekday,
  QuietHoursDTO,
  QuietHoursWindow,
} from '@memoflow/contracts/notification';
import {
  addYmdDays,
  asHm,
  asInstant,
  combineYmdHmWithTimeZone,
  instantToHmInTimeZone,
  instantToYmdInTimeZone,
  isIanaTimeZoneId,
} from '@memoflow/time';

function minutes(hm: string): number {
  const [hour, minute] = hm.split(':').map(Number);
  return hour * 60 + minute;
}

function weekdayForYmd(ymd: string): NotificationWeekday {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() as NotificationWeekday;
}

function cloneWindow(window: QuietHoursWindow): QuietHoursWindow {
  return { ...window, daysOfWeek: [...window.daysOfWeek] };
}

/** Product-Time aware account quiet hours. Never reads host-local timezone. */
export class QuietHours extends ValueObject<QuietHoursDTO> {
  private constructor(props: QuietHoursDTO) {
    super({
      ...props,
      weeklyWindows: props.weeklyWindows.map(cloneWindow),
    });
  }

  static create(props: QuietHoursDTO): QuietHours {
    this.validate(props);
    return new QuietHours(props);
  }

  static disabled(timeZone: QuietHoursDTO['timeZone']): QuietHours {
    return new QuietHours({ enabled: false, timeZone, weeklyWindows: [] });
  }

  static fromDTO(dto: QuietHoursDTO): QuietHours {
    return this.create(dto);
  }

  private static validate(props: QuietHoursDTO): void {
    if (!isIanaTimeZoneId(String(props.timeZone))) {
      throw new TypeError(`Invalid QuietHours timeZone: ${String(props.timeZone)}`);
    }
    const hmPattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
    for (const window of props.weeklyWindows) {
      if (window.daysOfWeek.length === 0) {
        throw new TypeError('QuietHours weekly window requires at least one weekday');
      }
      if (!hmPattern.test(String(window.start)) || !hmPattern.test(String(window.end))) {
        throw new TypeError('QuietHours window start/end must use HH:mm');
      }
      if (window.start === window.end) {
        throw new TypeError('QuietHours window start and end must differ');
      }
      for (const day of window.daysOfWeek) {
        if (!Number.isInteger(day) || day < 0 || day > 6) {
          throw new TypeError('QuietHours weekday must be 0-6');
        }
      }
    }
  }

  get enabled(): boolean { return this.props.enabled; }
  get timeZone(): QuietHoursDTO['timeZone'] { return this.props.timeZone; }
  get weeklyWindows(): readonly QuietHoursWindow[] {
    return this.props.weeklyWindows.map(cloneWindow);
  }

  isActiveAt(time: Date | number): boolean {
    if (!this.enabled) return false;
    const instant = asInstant(time instanceof Date ? time.getTime() : time);
    const ymd = String(instantToYmdInTimeZone(instant, this.timeZone));
    const currentWeekday = weekdayForYmd(ymd);
    const previousWeekday = weekdayForYmd(String(addYmdDays(ymd as never, -1)));
    const currentMinutes = minutes(String(instantToHmInTimeZone(instant, this.timeZone)));

    return this.props.weeklyWindows.some((window) => {
      const start = minutes(String(window.start));
      const end = minutes(String(window.end));
      if (start < end) {
        return window.daysOfWeek.includes(currentWeekday) && currentMinutes >= start && currentMinutes < end;
      }
      return (
        (window.daysOfWeek.includes(currentWeekday) && currentMinutes >= start)
        || (window.daysOfWeek.includes(previousWeekday) && currentMinutes < end)
      );
    });
  }

  nextInactiveAt(time: Date | number): Date | null {
    if (!this.enabled) return null;
    const instant = asInstant(time instanceof Date ? time.getTime() : time);
    const ymd = instantToYmdInTimeZone(instant, this.timeZone);
    const currentWeekday = weekdayForYmd(String(ymd));
    const previousYmd = addYmdDays(ymd, -1);
    const previousWeekday = weekdayForYmd(String(previousYmd));
    const currentMinutes = minutes(String(instantToHmInTimeZone(instant, this.timeZone)));

    const activeEnds: number[] = [];
    for (const window of this.props.weeklyWindows) {
      const start = minutes(String(window.start));
      const end = minutes(String(window.end));
      let endYmd = ymd;
      let active = false;

      if (start < end) {
        active = window.daysOfWeek.includes(currentWeekday)
          && currentMinutes >= start
          && currentMinutes < end;
      } else if (window.daysOfWeek.includes(currentWeekday) && currentMinutes >= start) {
        active = true;
        endYmd = addYmdDays(ymd, 1);
      } else if (window.daysOfWeek.includes(previousWeekday) && currentMinutes < end) {
        active = true;
      }

      if (!active) continue;
      const resolved = combineYmdHmWithTimeZone(endYmd, asHm(String(window.end)), this.timeZone);
      if (resolved != null) activeEnds.push(Number(resolved));
    }

    if (activeEnds.length === 0) return null;
    return new Date(Math.max(...activeEnds));
  }

  toDTO(): QuietHoursDTO {
    return {
      enabled: this.props.enabled,
      timeZone: this.props.timeZone,
      weeklyWindows: this.props.weeklyWindows.map(cloneWindow),
    };
  }
}
