import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { presentErrorMessage } from '@memoflow/http-client';

import type {
  ConflictDetectionResult,
  CreateScheduleRequest,
  UpdateScheduleRequest,
} from '@memoflow/contracts/schedule';

import { useScheduleService } from '../hooks/useScheduleService';
import { getProductTime } from '../utils/product-time';

import {
  PageShell,
  PrimaryButton,
  PrimaryTextField,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
} from '@memoflow/ui-react-native';

function toDateInput(timestamp: number | null | undefined) {
  return timestamp == null ? '' : getProductTime().input.dateValue(timestamp);
}

function toTimeInput(timestamp: number | null | undefined) {
  return timestamp == null ? '' : getProductTime().input.timeValue(timestamp);
}

function parseTimestamp(dateValue: string, timeValue: string) {
  const time = getProductTime();
  const date = time.input.parseDateValue(dateValue.trim());
  const hm = time.input.parseTimeValue(timeValue.trim());
  return date == null || hm == null ? null : time.input.combine(date, hm);
}

/**
 * Residual 1246 keep-boundary: app-react describeConflict — English status pill strings.
 * No conflict / N conflicts detected; not vue-i18n schedule.conflictAlert.* keys.
 * Soft residual 1246: vue ConflictAlert hasConflict-only + formatSuggestion key duals (no force-merge).
 */
function describeConflict(conflicts: ConflictDetectionResult | null) {
  if (!conflicts?.hasConflict) {
    return 'No conflict detected';
  }
  return `${conflicts.conflicts.length} conflicts detected`;
}

export function ScheduleEventEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[]; date?: string | string[] }>();
  const scheduleId =
    typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : null;
  const defaultDate =
    typeof params.date === 'string'
      ? params.date
      : Array.isArray(params.date)
        ? params.date[0]
        : toDateInput(getProductTime().now());
  const service = useScheduleService();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(defaultDate ?? '');
  const [startClock, setStartClock] = useState('09:00');
  const [endClock, setEndClock] = useState('10:00');
  const [location, setLocation] = useState('');
  const [attendees, setAttendees] = useState('');
  const [isAllDay, setIsAllDay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [conflicts, setConflicts] = useState<ConflictDetectionResult | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);

  const parsedRange = useMemo(() => {
    const time = getProductTime();
    if (isAllDay) {
      const day = time.input.parseDateValue(date);
      if (day == null) return { startTime: null, endTime: null, isValid: false };
      const startTime = Number(time.codec.startOfYmd(day));
      const endTime = Number(time.calendar.endOfDay(startTime));
      return { startTime, endTime, isValid: true };
    }
    const startTime = parseTimestamp(date, startClock);
    const endTime = parseTimestamp(date, endClock);
    return {
      startTime,
      endTime,
      isValid: startTime !== null && endTime !== null && endTime > startTime,
    };
  }, [date, endClock, isAllDay, startClock]);

  useEffect(() => {
    async function loadSchedule() {
      if (!scheduleId) {
        return;
      }

      setIsLoading(true);
      setError(null);

      const result = await service.getSchedule(scheduleId);
      if (!result.ok) {
        setError(presentErrorMessage(result.error));
        setIsLoading(false);
        return;
      }

      const item = result.data;
      setName(item.title);
      setDescription(item.description ?? '');
      if (item.range.kind === 'AllDay') {
        setIsAllDay(true);
        setDate(item.range.start);
      } else {
        setIsAllDay(false);
        setDate(toDateInput(item.range.start));
        setStartClock(toTimeInput(item.range.start));
        setEndClock(toTimeInput(item.range.end));
      }
      setLocation(item.location ?? '');
      setAttendees(item.attendees?.join(', ') ?? '');
      setCurrentVersion(item.version);

      const conflictResult = await service.getScheduleConflicts(scheduleId);
      if (conflictResult.ok) {
        setConflicts(conflictResult.data);
      }

      setIsLoading(false);
    }

    void loadSchedule();
  }, [scheduleId, service]);

  useEffect(() => {
    if (
      isAllDay ||
      !parsedRange.isValid ||
      parsedRange.startTime === null ||
      parsedRange.endTime === null
    ) {
      setConflicts(null);
      setConflictError(null);
      return;
    }

    const timeoutId = setTimeout(() => {
      void (async () => {
        const result = await service.detectConflicts({
          startTime: parsedRange.startTime!,
          endTime: parsedRange.endTime!,
          excludeId: scheduleId ?? undefined,
        });

        if (!result.ok) {
          setConflictError(presentErrorMessage(result.error));
          return;
        }

        setConflictError(null);
        setConflicts(result.data);
      })();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [
    isAllDay,
    parsedRange.endTime,
    parsedRange.isValid,
    parsedRange.startTime,
    scheduleId,
    service,
  ]);

  async function handleDetectConflicts() {
    if (isAllDay) {
      setConflicts({ hasConflict: false, conflicts: [], suggestions: [] });
      setConflictError(null);
      return;
    }
    if (!parsedRange.isValid || parsedRange.startTime === null || parsedRange.endTime === null) {
      setConflictError('Use a valid date and time range first.');
      return;
    }

    setConflictError(null);

    const result = await service.detectConflicts({
      startTime: parsedRange.startTime,
      endTime: parsedRange.endTime,
      excludeId: scheduleId ?? undefined,
    });

    if (!result.ok) {
      setConflictError(presentErrorMessage(result.error));
      return;
    }

    setConflicts(result.data);
  }

  async function handleSubmit() {
    if (name.trim().length === 0) {
      setError('Event name is required.');
      return;
    }

    if (!parsedRange.isValid || parsedRange.startTime === null || parsedRange.endTime === null) {
      setError('Use a valid date and time range.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const attendeeList = attendees
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    const time = getProductTime();
    const allDayDate = time.input.parseDateValue(date);
    const range: CreateScheduleRequest['range'] = isAllDay
      ? { kind: 'AllDay', start: allDayDate!, end: null }
      : { kind: 'Timed', start: parsedRange.startTime, end: parsedRange.endTime };

    const payload = {
      name: name.trim(),
      description: description.trim().length > 0 ? description.trim() : undefined,
      range,
      location: location.trim().length > 0 ? location.trim() : undefined,
      attendees: attendeeList.length > 0 ? attendeeList : undefined,
    };

    const result = scheduleId
      ? await service.updateSchedule(scheduleId, {
          ...payload,
          expectedVersion: currentVersion ?? 1,
        } satisfies UpdateScheduleRequest)
      : await service.createScheduleWithConflictDetection({
          ...payload,
          autoDetectConflicts: !isAllDay,
        } satisfies CreateScheduleRequest);

    setIsSubmitting(false);

    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      return;
    }

    if ('conflicts' in result.data && result.data.conflicts) {
      setConflicts(result.data.conflicts);
    }

    router.replace('./week');
  }

  async function handleDelete() {
    if (!scheduleId) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    const result = await service.deleteSchedule(scheduleId, currentVersion ?? 1);
    setIsDeleting(false);

    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      return;
    }

    router.replace('./week');
  }

  return (
    <PageShell
      eyebrow="Schedule"
      title={scheduleId ? 'Edit event' : 'Create event'}
      subtitle="事件编辑页支持自动冲突检测，冲突只做提示，不阻止保存。"
    >
      <SectionCard title="Navigation" description="保存后返回周视图继续检查时间流。">
        <View style={styles.actionRow}>
          <PrimaryButton label="Back" onPress={() => router.back()} variant="secondary" />
          <PrimaryButton
            label="Week view"
            onPress={() => router.replace('./week')}
            variant="ghost"
          />
          <PrimaryButton
            label={
              isSubmitting
                ? 'Saving…'
                : conflicts?.hasConflict
                  ? scheduleId
                    ? 'Save anyway'
                    : 'Create anyway'
                  : scheduleId
                    ? 'Save event'
                    : 'Create event'
            }
            onPress={handleSubmit}
            disabled={isSubmitting || isLoading}
          />
        </View>
      </SectionCard>

      {error ? (
        <SectionCard title="Schedule save failed" description="保存失败时先直接展示错误。">
          <ThemedText type="small" themeColor="warning">
            {error}
          </ThemedText>
        </SectionCard>
      ) : null}

      <ScrollView contentContainerStyle={styles.formColumn}>
        <SectionCard title="Basics" description="时间和标题是移动端最关键的输入。">
          <PrimaryTextField
            label="Title"
            value={name}
            onChangeText={setName}
            placeholder="Deep work block"
          />
          <PrimaryTextField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Optional notes"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            style={styles.multilineField}
          />
          <PrimaryTextField
            label="Date"
            value={date}
            onChangeText={setDate}
            placeholder="2026-04-01"
            hint="Use YYYY-MM-DD."
          />
          <PrimaryButton
            label={isAllDay ? 'All day ✓' : 'All day'}
            onPress={() => setIsAllDay((value) => !value)}
            variant="secondary"
          />
          {!isAllDay ? (
            <View style={styles.inlineRow}>
              <PrimaryTextField
                label="Start"
                value={startClock}
                onChangeText={setStartClock}
                placeholder="09:00"
                style={styles.inlineField}
              />
              <PrimaryTextField
                label="End"
                value={endClock}
                onChangeText={setEndClock}
                placeholder="10:00"
                style={styles.inlineField}
              />
            </View>
          ) : null}
          <PrimaryTextField
            label="Location"
            value={location}
            onChangeText={setLocation}
            placeholder="Meeting room / Zoom"
          />
          <PrimaryTextField
            label="Attendees"
            value={attendees}
            onChangeText={setAttendees}
            placeholder="a@x.com, b@y.com"
            hint="Comma-separated emails."
          />
        </SectionCard>

        <SectionCard title="Conflict detection" description="创建和编辑前都可以先跑一次冲突检查。">
          <View style={styles.actionRow}>
            <PrimaryButton
              label="Detect conflicts"
              onPress={handleDetectConflicts}
              variant="secondary"
            />
            {scheduleId ? (
              <PrimaryButton
                label={isDeleting ? 'Deleting…' : 'Delete event'}
                onPress={handleDelete}
                disabled={isDeleting}
                variant="ghost"
              />
            ) : null}
          </View>
          <StatusPill
            label={describeConflict(conflicts)}
            tone={conflicts?.hasConflict ? 'warning' : 'success'}
          />
          {conflicts?.hasConflict ? (
            <ThemedText type="small" themeColor="warning">
              Conflicts are warnings only. Saving will keep the event and refresh conflict badges.
            </ThemedText>
          ) : null}
          {conflictError ? (
            <ThemedText type="small" themeColor="warning">
              {conflictError}
            </ThemedText>
          ) : null}
          {conflicts?.conflicts?.length ? (
            <View style={styles.conflictColumn}>
              {conflicts.conflicts.map((item) => (
                <ThemedText
                  key={`${item.scheduleId}-${item.overlapStart}`}
                  type="small"
                  themeColor="textSecondary"
                >
                  {item.scheduleTitle}: overlap {item.overlapDuration} min
                </ThemedText>
              ))}
            </View>
          ) : null}
        </SectionCard>
      </ScrollView>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  formColumn: {
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  inlineRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  inlineField: {
    flex: 1,
  },
  multilineField: {
    minHeight: 110,
  },
  conflictColumn: {
    gap: Spacing.one,
  },
});
