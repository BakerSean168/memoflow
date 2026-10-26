import { StyleSheet, View } from 'react-native';

import type { NotificationClientDTO } from '@memoflow/notification-contracts';

import {
  PrimaryButton,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
} from '@memoflow/ui-react-native';

// Residual 1264: formatDate dual retired onto shared formatDateUnknown sole (datetime + English 'Unknown').
import { formatDateUnknown as formatDate } from '../utils/format-date-unknown';

export function NotificationCard({
  notification,
  onMarkAsRead,
}: {
  notification: NotificationClientDTO;
  onMarkAsRead?: () => void;
}) {
  return (
    <SectionCard
      title={notification.title}
      description={notification.content}
      footer={
        onMarkAsRead ? (
          <PrimaryButton label="Mark as read" onPress={onMarkAsRead} variant="secondary" />
        ) : undefined
      }
    >
      <View style={styles.pillRow}>
        <StatusPill label={notification.type} tone="tint" />
        <StatusPill label={notification.category} tone="textSecondary" />
        <StatusPill
          label={notification.isRead ? 'Read' : 'Unread'}
          tone={notification.isRead ? 'success' : 'warning'}
        />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Created at {formatDate(notification.createdAt)}
      </ThemedText>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
