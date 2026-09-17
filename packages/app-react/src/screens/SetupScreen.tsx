import { Platform, StyleSheet, View } from 'react-native';

import { useRouter } from 'expo-router';

import { APP_NAME } from '../constants/app';
import { MOBILE_API_BASE_URL_HINT } from '../constants/auth';
import { useNotifications } from '../hooks/useNotifications';
import { useAppSession } from '../providers/app-session-provider';

import {
  FeatureTile,
  PageShell,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
} from '@memoflow/ui-react-native';

const MODULE_SCOPE = [
  {
    title: 'Notifications',
    description: '查看收件箱、未读数和通知详情。',
    phase: 'Live',
    route: './notifications',
  },
  {
    title: 'Account',
    description: '查看账户资料和基础偏好。',
    phase: 'Live',
    route: './account',
  },
  {
    title: 'Settings',
    description: '管理主题、语言和通知偏好。',
    phase: 'Live',
    route: './settings',
  },
  {
    title: 'AI',
    description: '查看会话并发送消息。',
    phase: 'Live',
    route: './ai',
  },
] as const;

export function SetupScreen() {
  const router = useRouter();
  const { apiBaseUrl, currentUser, isRemoteAuthenticated, sessionKind } = useAppSession();
  const { unreadCount } = useNotifications();

  const actionSections = [
    {
      title: 'Quick access',
      description: '更多模块入口。',
      items: MODULE_SCOPE.map((item) => ({
        label: item.title,
        description: item.description,
        onPress: () => router.push(item.route),
      })),
    },
  ];

  return (
    <PageShell
      actionMenuSubtitle="More 页面快捷入口。"
      actionSections={actionSections}
      eyebrow="More"
      title="More"
      subtitle="账户、消息和偏好设置。"
    >
      <SectionCard
        title="Workspace"
        description={
          currentUser
            ? `${currentUser.displayName} is active in ${currentUser.workspaceName}.`
            : 'No shell session is active.'
        }
      >
        <View style={styles.pillRow}>
          <StatusPill
            label={`Mode: ${sessionKind}`}
            tone={isRemoteAuthenticated ? 'success' : 'warning'}
          />
          <StatusPill
            label={Platform.OS === 'web' ? 'Web preview' : 'Native runtime'}
            tone="tint"
          />
          <StatusPill label={APP_NAME} tone="textSecondary" />
          <StatusPill
            label={`${unreadCount} unread`}
            tone={unreadCount > 0 ? 'warning' : 'success'}
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          API base URL: <ThemedText type="code">{apiBaseUrl}</ThemedText>
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {MOBILE_API_BASE_URL_HINT}
        </ThemedText>
      </SectionCard>

      <SectionCard title="Quick access" description="打开更多业务模块。">
        <View style={styles.tileGrid}>
          {MODULE_SCOPE.map((item) => (
            <FeatureTile
              key={item.title}
              eyebrow={item.phase}
              title={item.title}
              description={item.description}
              onPress={() => router.push(item.route)}
            />
          ))}
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
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
