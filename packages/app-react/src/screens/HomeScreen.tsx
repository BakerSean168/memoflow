import { StyleSheet, View } from 'react-native';

import { useRouter } from 'expo-router';

import { APP_DESCRIPTION, APP_NAME } from '../constants/app';
import { useGoals } from '../hooks/useGoals';
import { useNotifications } from '../hooks/useNotifications';
import { useReminders } from '../hooks/useReminders';
import { useScheduleTasks } from '../hooks/useScheduleTasks';
import { useTaskPlans } from '../hooks/useTaskPlans';
import { useAppSession } from '../providers/app-session-provider';

import {
  FeatureTile,
  PageShell,
  PrimaryButton,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
  ThemedView,
} from '@memoflow/ui-react-native';

function buildGreeting(name: string | null) {
  if (!name) {
    return 'Welcome to the mobile workspace';
  }

  return `Welcome back, ${name}`;
}

export function HomeScreen() {
  const router = useRouter();
  const { currentUser, isGuest, isRemoteAuthenticated, sessionKind, signInDemo, signOut } = useAppSession();
  const { templates } = useTaskPlans();
  const { goals } = useGoals();
  const { tasks: scheduleTasks } = useScheduleTasks();
  const { todaySchedule } = useReminders();
  const { unreadCount } = useNotifications();

  const actionSections = [
    {
      title: 'Quick access',
      description: '主页常用入口。',
      items: [
        { label: 'Tasks', description: '打开任务工作区。', onPress: () => router.push('./tasks') },
        { label: 'Goals', description: '打开目标列表。', onPress: () => router.push('./goals') },
        { label: 'Schedule', description: '打开日程。', onPress: () => router.push('./schedule') },
        { label: 'More', description: '打开更多功能。', onPress: () => router.push('./explore') },
      ],
    },
    {
      title: 'Session',
      description: '账号和会话操作。',
      items: [
        ...(isGuest
          ? [{ label: 'Upgrade account', description: '切到 demo workspace。', onPress: signInDemo }]
          : []),
        {
          label: isRemoteAuthenticated ? 'Sign out' : 'Leave shell',
          description: '结束当前会话。',
          onPress: signOut,
        },
      ],
    },
  ];

  return (
    <PageShell
      actionMenuSubtitle="主页常用入口和会话操作。"
      actionSections={actionSections}
      eyebrow="MemoFlow Mobile"
      title={buildGreeting(currentUser?.displayName ?? null)}
      subtitle="今日概览、快捷入口和收件信息。">
      <SectionCard
        title="Account"
        description={currentUser ? `${currentUser.workspaceName} is active on this device.` : APP_DESCRIPTION}>
        <View style={styles.pillRow}>
          <StatusPill label={`Session: ${sessionKind}`} tone={isRemoteAuthenticated ? 'success' : 'tint'} />
          <StatusPill
            label={isRemoteAuthenticated ? 'Remote auth ready' : isGuest ? 'Guest sandbox' : 'Local shell mode'}
            tone={isRemoteAuthenticated ? 'success' : isGuest ? 'warning' : 'textSecondary'}
          />
          <StatusPill label={APP_NAME} tone="tint" />
        </View>
        <View style={styles.actionGroup}>
          {isGuest ? (
            <PrimaryButton fullWidth label="Upgrade account" onPress={signInDemo} />
          ) : null}
          <PrimaryButton
            fullWidth
            label={isRemoteAuthenticated ? 'Sign out' : 'Leave current shell'}
            onPress={signOut}
            variant={isGuest ? 'secondary' : 'solid'}
          />
        </View>
      </SectionCard>

      <SectionCard
        title="Today"
        description="当天待处理内容和收件概况。"
        footer={<PrimaryButton label="Open More" onPress={() => router.push('./explore')} variant="secondary" />}>
        <View style={styles.pillRow}>
          <StatusPill label={`${templates.length} tasks`} tone="tint" />
          <StatusPill label={`${goals.length} goals`} tone="success" />
          <StatusPill label={`${scheduleTasks.length} schedule items`} tone="textSecondary" />
          <StatusPill label={`${todaySchedule.length} reminders`} tone="textSecondary" />
          <StatusPill label={`${unreadCount} unread`} tone={unreadCount > 0 ? 'warning' : 'success'} />
        </View>
      </SectionCard>

      <SectionCard
        title="Tasks"
        description="最近的任务模板和待处理数量。"
        footer={<PrimaryButton label="Open task workspace" onPress={() => router.push('./tasks')} variant="secondary" />}>
        {isRemoteAuthenticated ? (
          templates.length > 0 ? (
            <View style={styles.previewList}>
              {templates.slice(0, 3).map((template) => (
                <ThemedView key={template.id} type="backgroundSelected" style={styles.previewCard}>
                  <ThemedText type="smallBold">{template.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {template.description ?? 'No description yet.'}
                  </ThemedText>
                  <View style={styles.previewMetaRow}>
                    <StatusPill label={template.status} tone={template.status === 'Active' ? 'success' : 'warning'} />
                    <StatusPill label={`${template.pendingInstanceCount} pending`} tone="textSecondary" />
                  </View>
                </ThemedView>
              ))}
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              No task templates yet.
            </ThemedText>
          )
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Sign in to load task data.
          </ThemedText>
        )}
      </SectionCard>

      <SectionCard
        title="Open modules"
        description="从主页直接进入高频模块。">
        <View style={styles.tileGrid}>
          <FeatureTile
            eyebrow="Live"
            title="Tasks"
            description="任务列表、详情和编辑。"
            onPress={() => router.push('./tasks')}
          />
          <FeatureTile
            eyebrow="Live"
            title="Goals"
            description="目标、关键结果和复盘。"
            onPress={() => router.push('./goals')}
          />
          <FeatureTile
            eyebrow="Live"
            title="Schedule"
            description="日程、周视图和月历。"
            onPress={() => router.push('./schedule')}
          />
          <FeatureTile
            eyebrow="Live"
            title="More"
            description="提醒、通知、仓库和设置。"
            onPress={() => router.push('./explore')}
          />
        </View>
      </SectionCard>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  previewList: {
    gap: Spacing.two,
  },
  previewCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  previewMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  actionGroup: {
    gap: Spacing.two,
  },
});
