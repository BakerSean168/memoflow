import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { useRouter } from 'expo-router';

import { useScheduleAgenda } from '../hooks/useScheduleAgenda';
import { useAppPreferences } from '../providers/app-preference-provider';
import { getProductTime } from '../utils/product-time';

import {
  PageShell,
  PrimaryButton,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
  ThemedView,
} from '@memoflow/ui-react-native';

function startOfWeek(timestamp: number) {
  return Number(getProductTime().calendar.startOfWeek(timestamp));
}

function endOfWeek(start: number) {
  const time = getProductTime();
  return Number(time.calendar.endOfDay(time.calendar.addDays(start, 6)));
}

function formatRangeLabel(start: number, end: number) {
  const time = getProductTime();
  return `${time.format.pattern(start, 'MMM d')} - ${time.format.pattern(end, 'MMM d')}`;
}

export function ScheduleWeekScreen() {
  const router = useRouter();
  const { profile } = useAppPreferences();
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(Date.now()));
  const weekEnd = useMemo(() => endOfWeek(weekAnchor), [weekAnchor, profile]);

  useEffect(() => {
    setWeekAnchor((current) => startOfWeek(current));
  }, [profile]);

  const { groupedEntries, isLoading, error, refresh } = useScheduleAgenda({
    startTime: weekAnchor,
    endTime: weekEnd,
  });

  const totalConflicts = useMemo(
    () => groupedEntries.reduce((sum, group) => sum + group.items.filter((item) => item.hasConflict).length, 0),
    [groupedEntries],
  );
  const actionSections = [
    {
      title: 'Views',
      description: '周视图切换和创建动作收进页面抽屉。',
      items: [
        {
          label: 'Back',
          description: '返回日程主列表。',
          onPress: () => router.back(),
        },
        {
          label: 'Calendar',
          description: '切到月历视图。',
          onPress: () => router.push('./calendar'),
        },
        {
          label: 'Create event',
          description: '创建一个新的事件。',
          onPress: () => router.push('./event-editor'),
        },
      ],
    },
  ];

  return (
    <PageShell
      actionMenuSubtitle="周视图的全局操作已经集中到左上角。"
      actionSections={actionSections}
      eyebrow="Schedule"
      title="Week view"
      subtitle="周视图先按天分组，保留移动端更自然的单列 agenda 结构。"
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} />}>
      <SectionCard title={formatRangeLabel(weekAnchor, weekEnd)} description="未来和历史周都可以快速滑动查看。">
        <View style={styles.actionRow}>
          <PrimaryButton label="Prev week" onPress={() => setWeekAnchor((current) => Number(getProductTime().calendar.addDays(current, -7)))} variant="ghost" />
          <PrimaryButton label="This week" onPress={() => setWeekAnchor(startOfWeek(Date.now()))} variant="secondary" />
          <PrimaryButton label="Next week" onPress={() => setWeekAnchor((current) => Number(getProductTime().calendar.addDays(current, 7)))} variant="ghost" />
        </View>
        <View style={styles.pillRow}>
          <StatusPill label={`${groupedEntries.length} active days`} tone="tint" />
          <StatusPill label={`${totalConflicts} conflicts`} tone={totalConflicts > 0 ? 'warning' : 'textSecondary'} />
        </View>
      </SectionCard>

      {error ? (
        <SectionCard title="Week load failed" description="周视图数据加载失败。">
          <ThemedText type="small" themeColor="warning">{error}</ThemedText>
        </SectionCard>
      ) : null}

      <SectionCard title="Agenda lanes" description="每一天保持独立 section，避免桌面式多列压缩。">
        <View style={styles.listColumn}>
          {groupedEntries.length > 0 ? (
            groupedEntries.map((group) => (
              <View key={group.dayKey} style={styles.dayBlock}>
                <View style={styles.dayHeader}>
                  <ThemedText type="smallBold">{group.dayLabel}</ThemedText>
                  <View style={styles.pillRow}>
                    <StatusPill label={`${group.items.length} events`} tone="tint" />
                    {group.items.some((item) => item.hasConflict) ? <StatusPill label="Conflict" tone="warning" /> : null}
                  </View>
                </View>
                <View style={styles.listColumn}>
                  {group.items.map((item) => (
                    <ThemedView key={item.id} type="backgroundSelected" style={styles.eventCard}>
                      <View style={styles.dayHeader}>
                        <ThemedText type="smallBold">{item.title}</ThemedText>
                        <StatusPill label={item.timeRange} tone="textSecondary" />
                      </View>
                      {item.description ? <ThemedText type="small">{item.description}</ThemedText> : null}
                      <View style={styles.pillRow}>
                        <StatusPill label={`${item.durationMinutes} min`} tone="textSecondary" />
                        {item.location ? <StatusPill label={item.location} tone="textSecondary" /> : null}
                        {item.hasConflict ? <StatusPill label="Conflict" tone="warning" /> : null}
                      </View>
                      <View style={styles.actionRow}>
                        <PrimaryButton label="Edit" onPress={() => router.push(`./event-editor?id=${item.id}`)} variant="secondary" />
                        <PrimaryButton label="Duplicate" onPress={() => router.push(`./event-editor?date=${group.dayKey}`)} variant="ghost" />
                      </View>
                    </ThemedView>
                  ))}
                </View>
              </View>
            ))
          ) : (
            <ThemedText type="small" themeColor="textSecondary">这一周还没有日程事件。</ThemedText>
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
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  listColumn: {
    gap: Spacing.three,
  },
  dayBlock: {
    gap: Spacing.two,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  eventCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
});
