import { useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { useRouter } from 'expo-router';

import { NotificationCard } from '../components/NotificationCard';
import { useAppSession } from '../hooks/useAppSession';
import { useNotifications } from '../hooks/useNotifications';

import {
  PageShell,
  PrimaryButton,
  PrimaryTextField,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
} from '@memoflow/ui-react-native';

type ReadFilter = 'all' | 'unread' | 'read';

export function NotificationsScreen() {
  const router = useRouter();
  const { signOut } = useAppSession();
  const {
    error,
    isLoading,
    isRemoteAuthenticated,
    markAllAsRead,
    markAsRead,
    notifications,
    refresh,
    unreadCount,
  } = useNotifications();
  const [isMutating, setIsMutating] = useState(false);
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [keyword, setKeyword] = useState('');
  const actionSections = [
    {
      title: 'Notifications',
      description: '通知页快捷操作。',
      items: [
        {
          label: 'Mark all as read',
          description: '将当前未读通知全部标记为已读。',
          disabled: isMutating || unreadCount === 0,
          onPress: handleMarkAllAsRead,
        },
      ],
    },
  ];

  const filteredNotifications = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return notifications.filter((notification) => {
      if (readFilter === 'read' && !notification.isRead) {
        return false;
      }

      if (readFilter === 'unread' && notification.isRead) {
        return false;
      }

      if (normalizedKeyword.length === 0) {
        return true;
      }

      const haystack = [
        notification.title,
        notification.content,
        notification.category,
        notification.type,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedKeyword);
    });
  }, [keyword, notifications, readFilter]);

  async function handleMarkAllAsRead() {
    setIsMutating(true);
    await markAllAsRead();
    setIsMutating(false);
  }

  async function handleMarkAsRead(id: string) {
    setIsMutating(true);
    await markAsRead(id);
    setIsMutating(false);
  }

  return (
    <PageShell
      actionMenuSubtitle="通知页快捷操作。"
      actionSections={actionSections}
      eyebrow="More"
      title="Notifications"
      subtitle="消息收件箱和未读处理。"
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} />}
    >
      {!isRemoteAuthenticated ? (
        <SectionCard title="Sign in required" description="登录后可查看通知。">
          <ThemedText type="small" themeColor="textSecondary">
            Sign in with a remote account to load your inbox.
          </ThemedText>
          <PrimaryButton fullWidth label="Go to sign-in" onPress={signOut} />
        </SectionCard>
      ) : (
        <>
          <SectionCard title="Summary" description="通知总量、未读数和当前筛选结果。">
            <View style={styles.pillRow}>
              <StatusPill label={`${notifications.length} notifications`} tone="tint" />
              <StatusPill
                label={`${unreadCount} unread`}
                tone={unreadCount > 0 ? 'warning' : 'success'}
              />
              <StatusPill label={`${filteredNotifications.length} visible`} tone="textSecondary" />
            </View>
            <PrimaryButton
              label={isMutating ? 'Updating…' : 'Mark all as read'}
              onPress={handleMarkAllAsRead}
              disabled={isMutating || unreadCount === 0}
              variant="secondary"
            />
          </SectionCard>

          <SectionCard title="Filters" description="按关键词和已读状态筛选。">
            <PrimaryTextField
              value={keyword}
              onChangeText={setKeyword}
              placeholder="Search notifications"
            />
            <View style={styles.actionRow}>
              <PrimaryButton
                label="All"
                onPress={() => setReadFilter('all')}
                variant={readFilter === 'all' ? 'solid' : 'ghost'}
              />
              <PrimaryButton
                label="Unread"
                onPress={() => setReadFilter('unread')}
                variant={readFilter === 'unread' ? 'solid' : 'ghost'}
              />
              <PrimaryButton
                label="Read"
                onPress={() => setReadFilter('read')}
                variant={readFilter === 'read' ? 'solid' : 'ghost'}
              />
            </View>
          </SectionCard>

          {error ? (
            <SectionCard
              title="Notification load failed"
              description="Unable to load notifications."
            >
              <ThemedText type="small" themeColor="warning">
                {error}
              </ThemedText>
            </SectionCard>
          ) : null}

          {!isLoading && filteredNotifications.length === 0 ? (
            <SectionCard title="No notifications matched" description="当前筛选条件下没有通知。">
              <ThemedText type="small" themeColor="textSecondary">
                调整关键词或已读筛选后再试。
              </ThemedText>
            </SectionCard>
          ) : null}

          <View style={styles.listColumn}>
            {filteredNotifications.map((notification) => (
              <View key={notification.id} style={styles.listColumn}>
                <NotificationCard
                  notification={notification}
                  onMarkAsRead={
                    !notification.isRead ? () => handleMarkAsRead(notification.id) : undefined
                  }
                />
                <View style={styles.actionRow}>
                  <PrimaryButton
                    label="Open detail"
                    onPress={() => router.push(`./notification-detail?id=${notification.id}`)}
                    variant="ghost"
                  />
                </View>
              </View>
            ))}
          </View>
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
});
