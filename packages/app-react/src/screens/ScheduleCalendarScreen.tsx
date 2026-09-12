import { useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { useRouter } from 'expo-router';

import { useScheduleAgenda } from '../hooks/useScheduleAgenda';
import { useAppPreferences } from '../providers/app-preference-provider';
import { getProductTime } from '../utils/product-time';
import { asYmd } from '@memoflow/time';

import {
  PageShell,
  PrimaryButton,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
  ThemedView,
} from '@memoflow/ui-react-native';

function monthStart(anchor: number): number {
  const time = getProductTime();
  const ymd = String(time.calendar.toYmd(anchor));
  return Number(time.codec.startOfYmd(asYmd(`${ymd.slice(0, 7)}-01`)));
}

function shiftMonth(anchor: number, delta: number): number {
  const time = getProductTime();
  const ymd = String(time.calendar.toYmd(anchor));
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  const target = asYmd(
    `${String(shifted.getUTCFullYear()).padStart(4, '0')}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-01`,
  );
  return Number(time.codec.startOfYmd(target));
}

function getMonthBounds(anchor: number) {
  const time = getProductTime();
  const start = monthStart(anchor);
  const nextMonth = shiftMonth(start, 1);
  const lastDay = time.calendar.addDays(nextMonth, -1);
  return {
    start,
    end: Number(time.calendar.endOfDay(lastDay)),
    monthKey: String(time.calendar.toYmd(start)).slice(0, 7),
  };
}

function formatMonthLabel(anchor: number) {
  return getProductTime().format.pattern(monthStart(anchor), 'yyyy MMMM');
}

export function ScheduleCalendarScreen() {
  const router = useRouter();
  const { profile } = useAppPreferences();
  const [monthAnchor, setMonthAnchor] = useState(() => Date.now());

  const monthBounds = useMemo(() => getMonthBounds(monthAnchor), [monthAnchor, profile]);
  const { entries, groupedEntries, isLoading, error, refresh } = useScheduleAgenda({
    startTime: monthBounds.start,
    endTime: monthBounds.end,
  });

  const dayMap = useMemo(() => {
    const map = new Map<string, { count: number; conflicts: number }>();
    for (const entry of entries) {
      const current = map.get(entry.dayKey) ?? { count: 0, conflicts: 0 };
      current.count += 1;
      if (entry.hasConflict) {
        current.conflicts += 1;
      }
      map.set(entry.dayKey, current);
    }
    return map;
  }, [entries]);

  const gridDays = useMemo(() => {
    const time = getProductTime();
    const start = time.calendar.startOfWeek(monthBounds.start);
    return Array.from({ length: 42 }, (_, index) => {
      const current = time.calendar.addDays(start, index);
      const key = String(time.calendar.toYmd(current));
      const summary = dayMap.get(key);
      return {
        key,
        day: Number(key.slice(8, 10)),
        isCurrentMonth: key.startsWith(monthBounds.monthKey),
        count: summary?.count ?? 0,
        conflicts: summary?.conflicts ?? 0,
      };
    });
  }, [dayMap, monthBounds.monthKey, monthBounds.start, profile]);

  const weekdayLabels = useMemo(() => {
    const time = getProductTime();
    const start = time.calendar.startOfWeek(monthBounds.start);
    return Array.from({ length: 7 }, (_, index) =>
      time.format.pattern(time.calendar.addDays(start, index), 'EEE'),
    );
  }, [monthBounds.start, profile]);


  const busiestDays = useMemo(
    () => groupedEntries.slice().sort((left, right) => right.items.length - left.items.length).slice(0, 3),
    [groupedEntries],
  );
  const actionSections = [
    {
      title: 'Views',
      description: '视图切换和新建入口集中在页面抽屉。',
      items: [
        {
          label: 'Back',
          description: '返回日程主列表。',
          onPress: () => router.back(),
        },
        {
          label: 'Week view',
          description: '切到周视图。',
          onPress: () => router.push('./week'),
        },
        {
          label: 'Create event',
          description: '创建新的日程事件。',
          onPress: () => router.push('./event-editor'),
        },
      ],
    },
  ];

  return (
    <PageShell
      actionMenuSubtitle="月历切换和创建动作已移到左上角。"
      actionSections={actionSections}
      eyebrow="Schedule"
      title="Calendar"
      subtitle="月历页先提供月份热力概览和高密度日期入口。"
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} />}>
      <SectionCard title={formatMonthLabel(monthAnchor)} description="按天展示事件密度和冲突数量。">
        <View style={styles.actionRow}>
          <PrimaryButton label="Prev month" onPress={() => setMonthAnchor((current) => shiftMonth(current, -1))} variant="ghost" />
          <PrimaryButton label="This month" onPress={() => setMonthAnchor(Date.now())} variant="secondary" />
          <PrimaryButton label="Next month" onPress={() => setMonthAnchor((current) => shiftMonth(current, 1))} variant="ghost" />
        </View>
        <View style={styles.weekdayRow}>
          {weekdayLabels.map((item) => (
            <ThemedText key={item} type="small" themeColor="textSecondary" style={styles.weekdayCell}>{item}</ThemedText>
          ))}
        </View>
        <View style={styles.calendarGrid}>
          {gridDays.map((day) => (
            <ThemedView key={day.key} type={day.isCurrentMonth ? 'backgroundSelected' : 'background'} style={[styles.dayCell, !day.isCurrentMonth ? styles.dayCellMuted : null]}>
              <ThemedText type="smallBold">{day.day}</ThemedText>
              {day.count > 0 ? <StatusPill label={`${day.count} items`} tone="tint" /> : <ThemedText type="small" themeColor="textSecondary">-</ThemedText>}
              {day.conflicts > 0 ? <StatusPill label={`${day.conflicts} conflicts`} tone="warning" /> : null}
            </ThemedView>
          ))}
        </View>
      </SectionCard>

      {error ? (
        <SectionCard title="Calendar load failed" description="月历数据加载失败。">
          <ThemedText type="small" themeColor="warning">{error}</ThemedText>
        </SectionCard>
      ) : null}

      <SectionCard title="Busiest days" description="优先暴露本月最忙的三个日期，方便移动端快速 drill-down。">
        <View style={styles.listColumn}>
          {busiestDays.length > 0 ? (
            busiestDays.map((group) => (
              <ThemedView key={group.dayKey} type="backgroundSelected" style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                  <ThemedText type="smallBold">{group.dayLabel}</ThemedText>
                  <StatusPill label={`${group.items.length} events`} tone="tint" />
                </View>
                <View style={styles.listColumn}>
                  {group.items.slice(0, 3).map((item) => (
                    <View key={item.id} style={styles.summaryRow}>
                      <ThemedText type="small">{item.title}</ThemedText>
                      <PrimaryButton label="Edit" onPress={() => router.push(`./event-editor?id=${item.id}`)} variant="ghost" />
                    </View>
                  ))}
                </View>
              </ThemedView>
            ))
          ) : (
            <ThemedText type="small" themeColor="textSecondary">这个月还没有事件。</ThemedText>
          )}
        </View>
      </SectionCard>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  weekdayRow: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  weekdayCell: {
    flex: 1,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  dayCell: {
    width: '13.8%',
    minHeight: 88,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  dayCellMuted: {
    opacity: 0.55,
  },
  listColumn: {
    gap: Spacing.three,
  },
  summaryCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
