import { useMemo } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { useRouter } from 'expo-router';

import { ScheduleTaskStatus } from '@memoflow/contracts/schedule';

import { ScheduleTaskCard } from '../components/ScheduleTaskCard';
import { useAppSession } from '../hooks/useAppSession';
import { useScheduleAgenda } from '../hooks/useScheduleAgenda';
import { useScheduleTasks, type ScheduleStatusFilter, type ScheduleTaskSummary } from '../hooks/useScheduleTasks';

import {
  PageShell,
  PrimaryButton,
  PrimaryTextField,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
  ThemedView,
} from '@memoflow/ui-react-native';

const FILTERS: Array<{ label: string; value: ScheduleStatusFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: ScheduleTaskStatus.Active },
  { label: 'Paused', value: ScheduleTaskStatus.Paused },
  { label: 'Failed', value: ScheduleTaskStatus.Failed },
  { label: 'Completed', value: ScheduleTaskStatus.Completed },
];

function buildTaskLanes(tasks: ScheduleTaskSummary[]) {
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfToday = today.getTime();
  const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;
  const endOfWeek = endOfToday + 6 * 24 * 60 * 60 * 1000;

  const activeStatuses = new Set<ScheduleTaskStatus>([ScheduleTaskStatus.Active, ScheduleTaskStatus.Paused, ScheduleTaskStatus.Failed]);

  return [
    {
      title: 'Overdue',
      description: '已经错过执行时间的调度任务。',
      items: tasks.filter(
        (task) => task.nextRunAt !== null && task.nextRunAt < now && activeStatuses.has(task.status),
      ),
    },
    {
      title: 'Today',
      description: '今天会执行或需要关注的调度任务。',
      items: tasks.filter(
        (task) => task.nextRunAt !== null && task.nextRunAt >= startOfToday && task.nextRunAt <= endOfToday,
      ),
    },
    {
      title: 'Next 7 days',
      description: '未来一周内会进入执行窗口的任务。',
      items: tasks.filter(
        (task) => task.nextRunAt !== null && task.nextRunAt > endOfToday && task.nextRunAt <= endOfWeek,
      ),
    },
  ].filter((lane) => lane.items.length > 0);
}

export function ScheduleScreen() {
  const router = useRouter();
  const { signOut } = useAppSession();
  const {
    error,
    filteredTasks,
    isLoading,
    isRemoteAuthenticated,
    refresh,
    searchQuery,
    setSearchQuery,
    setStatusFilter,
    statusFilter,
    tasks,
  } = useScheduleTasks();
  const {
    entries,
    error: agendaError,
    groupedEntries,
    isLoading: isAgendaLoading,
    refresh: refreshAgenda,
  } = useScheduleAgenda();
  const activeCount = tasks.filter((item) => item.status === ScheduleTaskStatus.Active).length;
  const overdueCount = tasks.filter((item) => item.isOverdue).length;
  const conflictCount = entries.filter((item) => item.hasConflict).length;
  const taskLanes = useMemo(() => buildTaskLanes(filteredTasks), [filteredTasks]);
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

  async function handleRefresh() {
    await Promise.all([refresh(), refreshAgenda()]);
  }

  return (
    <PageShell
      actionMenuSubtitle="页面切换和创建动作从内容区移到左上角。"
      actionSections={actionSections}
      eyebrow="Schedule"
      title="Agenda and reminders"
      subtitle="日程、任务分组和 agenda。"
      refreshControl={<RefreshControl refreshing={isLoading || isAgendaLoading} onRefresh={handleRefresh} />}>
      {!isRemoteAuthenticated ? (
        <SectionCard title="Sign in required" description="登录后可查看日程数据。">
          <ThemedText type="small" themeColor="textSecondary">
            Sign in with a remote account to load schedule data.
          </ThemedText>
          <PrimaryButton fullWidth label="Go to sign-in" onPress={signOut} />
        </SectionCard>
      ) : (
        <>
          <SectionCard title="Summary" description="任务、agenda 和冲突总览。">
            <View style={styles.pillRow}>
              <StatusPill label={`${tasks.length} schedule tasks`} tone="tint" />
              <StatusPill label={`${activeCount} active`} tone="success" />
              <StatusPill label={`${overdueCount} overdue`} tone={overdueCount > 0 ? 'warning' : 'textSecondary'} />
              <StatusPill label={`${entries.length} agenda events`} tone="textSecondary" />
              <StatusPill label={`${conflictCount} conflicts`} tone={conflictCount > 0 ? 'warning' : 'textSecondary'} />
            </View>
          </SectionCard>

          <SectionCard title="Search and filters" description="按关键词和状态筛选日程任务。">
            <PrimaryTextField
              autoCapitalize="none"
              autoCorrect={false}
              hint="Search by title, description, source, or tags."
              onChangeText={setSearchQuery}
              placeholder="Search schedule tasks"
              value={searchQuery}
            />
            <View style={styles.filterRow}>
              {FILTERS.map((filter) => (
                <PrimaryButton
                  key={filter.value}
                  label={filter.label}
                  onPress={() => setStatusFilter(filter.value)}
                  variant={statusFilter === filter.value ? 'solid' : 'ghost'}
                />
              ))}
            </View>
          </SectionCard>

          {error ? (
            <SectionCard title="Schedule load failed" description="Unable to load schedule tasks.">
              <ThemedText type="small" themeColor="warning">{error}</ThemedText>
              <PrimaryButton label="Retry" onPress={handleRefresh} variant="secondary" />
            </SectionCard>
          ) : null}

          {agendaError ? (
            <SectionCard title="Agenda load failed" description="Unable to load agenda events.">
              <ThemedText type="small" themeColor="warning">{agendaError}</ThemedText>
            </SectionCard>
          ) : null}

          <SectionCard title="Task lanes" description="按时间窗口查看调度任务。">
            <View style={styles.listColumn}>
              {taskLanes.length > 0 ? (
                taskLanes.map((lane) => (
                  <View key={lane.title} style={styles.laneBlock}>
                    <View style={styles.laneHeader}>
                      <ThemedText type="smallBold">{lane.title}</ThemedText>
                      <StatusPill label={`${lane.items.length} items`} tone="textSecondary" />
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">{lane.description}</ThemedText>
                    <View style={styles.listColumn}>
                      {lane.items.map((task) => (
                        <ScheduleTaskCard key={task.id} task={task} />
                      ))}
                    </View>
                  </View>
                ))
              ) : (
                <ThemedText type="small" themeColor="textSecondary">当前筛选条件下没有匹配的任务分组。</ThemedText>
              )}
            </View>
          </SectionCard>

          <SectionCard title="Agenda" description="未来两周的事件列表。">
            <View style={styles.listColumn}>
              {groupedEntries.length > 0 ? (
                groupedEntries.map((group) => (
                  <View key={group.dayKey} style={styles.laneBlock}>
                    <View style={styles.laneHeader}>
                      <ThemedText type="smallBold">{group.dayLabel}</ThemedText>
                      <View style={styles.pillRow}>
                        <StatusPill label={`${group.items.length} events`} tone="textSecondary" />
                        <PrimaryButton label="Quick add" onPress={() => router.push(`./event-editor?date=${group.dayKey}`)} variant="ghost" />
                      </View>
                    </View>
                    <View style={styles.listColumn}>
                      {group.items.map((entry) => (
                        <ThemedView key={entry.id} type="backgroundSelected" style={styles.agendaCard}>
                          <View style={styles.laneHeader}>
                            <ThemedText type="smallBold">{entry.title}</ThemedText>
                            <StatusPill label={entry.timeRange} tone="tint" />
                          </View>
                          {entry.description ? <ThemedText type="small">{entry.description}</ThemedText> : null}
                          <View style={styles.pillRow}>
                            <StatusPill label={`${entry.durationMinutes} min`} tone="textSecondary" />
                            {entry.location ? <StatusPill label={entry.location} tone="textSecondary" /> : null}
                            {entry.attendeesCount > 0 ? <StatusPill label={`${entry.attendeesCount} attendees`} tone="textSecondary" /> : null}
                            {entry.hasConflict ? <StatusPill label="Conflict" tone="warning" /> : null}
                          </View>
                          <View style={styles.actionRow}>
                            <PrimaryButton label="Edit event" onPress={() => router.push(`./event-editor?id=${entry.id}`)} variant="secondary" />
                            <PrimaryButton label="Week context" onPress={() => router.push('./week')} variant="ghost" />
                          </View>
                        </ThemedView>
                      ))}
                    </View>
                  </View>
                ))
              ) : (
                <ThemedText type="small" themeColor="textSecondary">未来两周还没有 agenda 事件。</ThemedText>
              )}
            </View>
          </SectionCard>

          {!isLoading && filteredTasks.length === 0 ? (
            <SectionCard title="No schedule tasks matched" description={tasks.length === 0 ? '当前还没有调度任务。' : '换一个关键词或状态筛选试试。'}>
              <ThemedText type="small" themeColor="textSecondary">
                当前搜索词：{searchQuery.trim().length === 0 ? 'none' : searchQuery}
              </ThemedText>
            </SectionCard>
          ) : null}

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
  filterRow: {
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
