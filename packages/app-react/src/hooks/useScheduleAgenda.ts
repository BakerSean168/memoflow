import { useEffect, useMemo, useState } from 'react';

import type { CalendarEntryClientDTO } from '@memoflow/contracts/schedule';
import { presentErrorMessage } from '@memoflow/http-client';

import { useAppSession } from './useAppSession';
import { useAppPreferences } from '../providers/app-preference-provider';
import { useScheduleService } from './useScheduleService';
import { getProductTime } from '../utils/product-time';

export type AgendaEntrySummary = {
  id: string;
  title: string;
  description: string | null;
  startTime: number;
  endTime: number;
  dayKey: string;
  dayLabel: string;
  timeRange: string;
  durationMinutes: number;
  hasConflict: boolean;
  location: string | null;
  attendeesCount: number;
};

export type ScheduleAgendaOptions = {
  startTime?: number;
  endTime?: number;
  daysBefore?: number;
  daysAfter?: number;
};

/** Canonical Product Time projection for Schedule agenda windows and labels. */
function formatDayKey(timestamp: number) {
  return String(getProductTime().calendar.toYmd(timestamp));
}

function formatDayLabel(timestamp: number) {
  return getProductTime().format.pattern(timestamp, 'MMM d, EEE');
}

function formatTimeRange(startTime: number, endTime: number) {
  const time = getProductTime();
  return `${time.format.hm(startTime)} - ${time.format.hm(endTime)}`;
}

function mapAgendaEntry(entry: CalendarEntryClientDTO): AgendaEntrySummary {
  return {
    id: String(entry.id),
    title: entry.title,
    description: entry.description ?? null,
    startTime: entry.startTime,
    endTime: entry.endTime,
    dayKey: formatDayKey(entry.startTime),
    dayLabel: formatDayLabel(entry.startTime),
    timeRange: formatTimeRange(entry.startTime, entry.endTime),
    durationMinutes: Math.max(1, Math.round((entry.endTime - entry.startTime) / 60000)),
    hasConflict: entry.hasConflict,
    location: entry.location ?? null,
    attendeesCount: entry.attendees?.length ?? 0,
  };
}

function resolveRange(options: ScheduleAgendaOptions) {
  if (typeof options.startTime === 'number' && typeof options.endTime === 'number') {
    return {
      startTime: options.startTime,
      endTime: options.endTime,
    };
  }

  const time = getProductTime();
  const now = time.now();
  const before = options.daysBefore ?? 1;
  const after = options.daysAfter ?? 14;
  const rangeStart = time.calendar.startOfDay(time.calendar.addDays(now, -before));
  const rangeEnd = time.calendar.endOfDay(time.calendar.addDays(now, after));

  return {
    startTime: Number(rangeStart),
    endTime: Number(rangeEnd),
  };
}

export function useScheduleAgenda(options: ScheduleAgendaOptions = {}) {
  const service = useScheduleService();
  const { isRemoteAuthenticated } = useAppSession();
  const { profile } = useAppPreferences();

  const [entries, setEntries] = useState<AgendaEntrySummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(
    () => resolveRange(options),
    [options.daysAfter, options.daysBefore, options.endTime, options.startTime, profile],
  );

  async function loadAgenda() {
    if (!isRemoteAuthenticated) {
      setEntries([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await service.getSchedulesByTimeRange({
      startTime: range.startTime,
      endTime: range.endTime,
    });

    if (!result.ok) {
      setEntries([]);
      setError(presentErrorMessage(result.error));
      setIsLoading(false);
      return;
    }

    setEntries(result.data.map((entry) => mapAgendaEntry(entry)).sort((left, right) => left.startTime - right.startTime));
    setIsLoading(false);
  }

  useEffect(() => {
    void loadAgenda();
  }, [isRemoteAuthenticated, profile, range.endTime, range.startTime, service]);

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, { dayLabel: string; items: AgendaEntrySummary[] }>();

    for (const entry of entries) {
      const current = groups.get(entry.dayKey);
      if (current) {
        current.items.push(entry);
        continue;
      }

      groups.set(entry.dayKey, {
        dayLabel: entry.dayLabel,
        items: [entry],
      });
    }

    return Array.from(groups.entries()).map(([dayKey, value]) => ({
      dayKey,
      dayLabel: value.dayLabel,
      items: value.items,
    }));
  }, [entries]);

  return {
    entries,
    error,
    groupedEntries,
    isLoading,
    range,
    refresh: loadAgenda,
  };
}
