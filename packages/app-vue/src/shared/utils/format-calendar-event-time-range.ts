import { getProductTime, productTimeRevision } from './product-time';

/**
 * Residual 1273: sole formatCalendarEventTimeRange — CalendarEventItem-like range.
 * all-day → provided label; else local HH:mm – HH:mm (en-dash).
 * Dual-retired from DayDetailSheet + TaskEventActionPanel (identical vue shape).
 * Residual 1303 retired in TIME-1205: inner HH:mm now resolves through the session Product Time facade
 * (en-dash range contract stays local; Day/Week formatEventTime separator keep-boundary remains).
 * Soft residual 1213 / 1273: app-react useScheduleAgenda Intl zh-CN pair keep-boundary remains separate.
 */
export function formatCalendarEventTimeRange(
  event: {
    displayMode?: string;
    startTime: number;
    endTime: number;
  },
  allDayLabel: string,
): string {
  if (event.displayMode === 'all-day') {
    return allDayLabel;
  }
  void productTimeRevision.value;
  const time = getProductTime();
  return `${time.format.hm(event.startTime)} – ${time.format.hm(event.endTime)}`;
}
