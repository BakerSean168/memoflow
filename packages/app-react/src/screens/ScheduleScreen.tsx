import { RefreshControl, StyleSheet, View } from 'react-native';

import { useRouter } from 'expo-router';

import { useAppSession } from '../hooks/useAppSession';
import { useScheduleAgenda } from '../hooks/useScheduleAgenda';

import {
  PageShell,
  PrimaryButton,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
  ThemedView,
} from '@memoflow/ui-react-native';

/** Product Schedule surface: CalendarEntry/Planner read models only. */
export function ScheduleScreen() {
  const router = useRouter();
  const { isRemoteAuthenticated, signOut } = useAppSession();
  const {
    entries,
    error: agendaError,
    groupedEntries,
    isLoading: isAgendaLoading,
    refresh: refreshAgenda,
  } = useScheduleAgenda();
  const conflictCount = entries.filter((item) => item.hasConflict).length;
  const actionSections = [
    {
      title: 'Views',
      description: '主线跳转和创建动作收进页面抽屉。',
      items: [
        {
          label: 'Calendar',
          description: '切到月历视图。',
          onPress: () => router.push('./calendar'),
        },
        {
          label: 'Week view',
          description: '切到周视图。',
          onPress: () => router.push('./week'),
        },
        {
          label: 'Create event',
          description: '创建一个新的日程事件。',
          onPress: () => router.push('./event-editor'),
        },
      ],
    },
  ];

  return (
    <PageShell
      actionMenuSubtitle="页面切换和创建动作从内容区移到左上角。"
      actionSections={actionSections}
      eyebrow="Schedule"
      title="Agenda and reminders"
      subtitle="日程、冲突和 agenda。"
      refreshControl={
        <RefreshControl refreshing={isAgendaLoading} onRefresh={refreshAgenda} />
      }>
      {!isRemoteAuthenticated ? (
        <SectionCard title="Sign in required" description="登录后可查看日程数据。">
          <ThemedText type="small" themeColor="textSecondary">
            Sign in with a remote account to load schedule data.
          </ThemedText>
          <PrimaryButton fullWidth label="Go to sign-in" onPress={signOut} />
        </SectionCard>
      ) : (
        <>
          <SectionCard title="Summary" description="CalendarEntry agenda 与派生冲突总览。">
            <View style={styles.pillRow}>
              <StatusPill label={`${entries.length} agenda events`} tone="tint" />
              <StatusPill
                label={`${conflictCount} conflicts`}
                tone={conflictCount > 0 ? 'warning' : 'success'}
              />
            </View>
          </SectionCard>

          {agendaError ? (
            <SectionCard title="Agenda load failed" description="Unable to load agenda events.">
              <ThemedText type="small" themeColor="warning">{agendaError}</ThemedText>
              <PrimaryButton label="Retry" onPress={refreshAgenda} variant="secondary" />
            </SectionCard>
          ) : null}

          <SectionCard title="Agenda" description="未来两周的事件列表。">
            <View style={styles.listColumn}>
              {groupedEntries.length > 0 ? (
                groupedEntries.map((group) => (
                  <View key={group.dayKey} style={styles.laneBlock}>
                    <View style={styles.laneHeader}>
                      <ThemedText type="smallBold">{group.dayLabel}</ThemedText>
                      <View style={styles.pillRow}>
                        <StatusPill label={`${group.items.length} events`} tone="textSecondary" />
                        <PrimaryButton
                          label="Quick add"
                          onPress={() => router.push(`./event-editor?date=${group.dayKey}`)}
                          variant="ghost"
                        />
                      </View>
                    </View>
                    <View style={styles.listColumn}>
                      {group.items.map((entry) => (
                        <ThemedView key={entry.id} type="backgroundSelected" style={styles.agendaCard}>
                          <View style={styles.laneHeader}>
                            <ThemedText type="smallBold">{entry.title}</ThemedText>
                            <StatusPill label={entry.timeRange} tone="tint" />
                          </View>
                          {entry.description ? (
                            <ThemedText type="small">{entry.description}</ThemedText>
                          ) : null}
                          <View style={styles.pillRow}>
                            <StatusPill label={`${entry.durationMinutes} min`} tone="textSecondary" />
                            {entry.location ? (
                              <StatusPill label={entry.location} tone="textSecondary" />
                            ) : null}
                            {entry.attendeesCount > 0 ? (
                              <StatusPill
                                label={`${entry.attendeesCount} attendees`}
                                tone="textSecondary"
                              />
                            ) : null}
                            {entry.hasConflict ? <StatusPill label="Conflict" tone="warning" /> : null}
                          </View>
                          <View style={styles.actionRow}>
                            <PrimaryButton
                              label="Edit event"
                              onPress={() => router.push(`./event-editor?id=${entry.id}`)}
                              variant="secondary"
                            />
                            <PrimaryButton
                              label="Week context"
                              onPress={() => router.push('./week')}
                              variant="ghost"
                            />
                          </View>
                        </ThemedView>
                      ))}
                    </View>
                  </View>
                ))
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  未来两周还没有 agenda 事件。
                </ThemedText>
              )}
            </View>
          </SectionCard>
        </>
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  listColumn: {
    gap: Spacing.three,
  },
  laneBlock: {
    gap: Spacing.two,
  },
  laneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  agendaCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
});
