import { useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { presentErrorMessage } from '@memoflow/http-client';

import type { NotificationClientDTO } from '@memoflow/notification-contracts';

import { useAppSession } from '../hooks/useAppSession';
import { useNotificationService } from '../hooks/useNotificationService';

import {
  PageShell,
  PrimaryButton,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
} from '@memoflow/ui-react-native';

// Residual 1264: formatDate dual retired onto shared formatDateUnknown sole (datetime + English 'Unknown').
import { formatDateUnknown as formatDate } from '../utils/format-date-unknown';

export function NotificationDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const notificationId =
    typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : null;
  const service = useNotificationService();
  const { isRemoteAuthenticated, signOut } = useAppSession();

  const [notification, setNotification] = useState<NotificationClientDTO | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!isRemoteAuthenticated || !notificationId) {
      setNotification(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    const result = await service.findNotificationById(notificationId);
    if (!result.ok) {
      setNotification(null);
      setError(presentErrorMessage(result.error));
      setIsLoading(false);
      return;
    }

    setNotification(result.data);
    setIsLoading(false);
  }

  useEffect(() => {
    void load();
  }, [notificationId, isRemoteAuthenticated]);

  async function handleMarkAsRead() {
    if (!notificationId || !notification || notification.isRead) {
      return;
    }

    setIsMutating(true);
    const result = await service.markAsRead(notificationId);
    setIsMutating(false);
    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      return;
    }

    await load();
  }

  async function handleDelete() {
    if (!notificationId) {
      return;
    }

    setIsMutating(true);
    const result = await service.deleteNotification(notificationId);
    setIsMutating(false);
    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      return;
    }

    router.back();
  }

  return (
    <PageShell
      eyebrow="More"
      title={notification?.title ?? 'Notification detail'}
      subtitle="通知详情页承接已读、删除和实体元数据查看。"
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}
    >
      <SectionCard title="Navigation" description="通知详情作为列表页的下钻 screen。">
        <View style={styles.actionRow}>
          <PrimaryButton
            label="Back to notifications"
            onPress={() => router.back()}
            variant="secondary"
          />
        </View>
      </SectionCard>

      {!isRemoteAuthenticated ? (
        <SectionCard title="Remote sign-in required" description="通知详情依赖远程认证会话。">
          <PrimaryButton fullWidth label="Return to sign-in" onPress={signOut} />
        </SectionCard>
      ) : null}

      {error ? (
        <SectionCard
          title="Notification detail failed"
          description="详情请求失败时先直接展示错误。"
        >
          <ThemedText type="small" themeColor="warning">
            {error}
          </ThemedText>
        </SectionCard>
      ) : null}

      {!isLoading && !error && !notification ? (
        <SectionCard
          title="Notification not found"
          description="当前通知不存在或当前账号无权限访问。"
        >
          <PrimaryButton label="Back" onPress={() => router.back()} variant="secondary" />
        </SectionCard>
      ) : null}

      {notification ? (
        <>
          <SectionCard title="Status" description={notification.content}>
            <View style={styles.pillRow}>
              <StatusPill label={notification.type} tone="tint" />
              <StatusPill label={notification.category} tone="textSecondary" />
              <StatusPill
                label={notification.isRead ? 'Read' : 'Unread'}
                tone={notification.isRead ? 'success' : 'warning'}
              />
              <StatusPill label={notification.importance} tone="textSecondary" />
            </View>
            <View style={styles.actionRow}>
              {!notification.isRead ? (
                <PrimaryButton
                  label={isMutating ? 'Updating…' : 'Mark as read'}
                  onPress={handleMarkAsRead}
                  disabled={isMutating}
                />
              ) : null}
              <PrimaryButton
                label={isMutating ? 'Deleting…' : 'Delete notification'}
                onPress={handleDelete}
                disabled={isMutating}
                variant="ghost"
              />
            </View>
          </SectionCard>

          <SectionCard title="Timeline" description="通知时间线和状态字段摘要。">
            <MetaRow label="Created" value={formatDate(notification.createdAt)} />
            <MetaRow label="Updated" value={formatDate(notification.updatedAt)} />
            <MetaRow label="Read at" value={formatDate(notification.readAt)} />
          </SectionCard>

          <SectionCard title="Metadata" description="先用摘要方式展示关联实体信息和动作。">
            <ThemedText type="small" themeColor="textSecondary">
              {notification.metadata
                ? JSON.stringify(notification.metadata, null, 2)
                : 'No metadata attached.'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {notification.actions
                ? JSON.stringify(notification.actions, null, 2)
                : 'No actions attached.'}
            </ThemedText>
          </SectionCard>
        </>
      ) : null}
    </PageShell>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
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
  metaRow: {
    gap: Spacing.half,
  },
});
