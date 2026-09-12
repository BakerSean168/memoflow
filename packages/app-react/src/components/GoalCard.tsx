import { StyleSheet, View } from 'react-native';

import { GoalStatus, goalTimeframeLabel } from '@memoflow/contracts/goal';
import type { GoalSummary } from '../hooks/useGoals';
import { formatProductYmd, emptyKind, getProductTime } from '../utils/product-time';
import {
  PrimaryButton,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
  ThemedView,
} from '@memoflow/ui-react-native';

function statusTone(status: GoalSummary['status']) {
  if (status === GoalStatus.InProgress) return 'success' as const;
  if (status === GoalStatus.Completed) return 'tint' as const;
  return 'textSecondary' as const;
}

export function GoalCard({ goal, onOpen }: { goal: GoalSummary; onOpen?: () => void }) {
  return (
    <SectionCard
      title={goal.name}
      description={goal.summary ?? 'No summary yet.'}
      footer={
        onOpen ? (
          <PrimaryButton label="Open detail" onPress={onOpen} variant="secondary" />
        ) : undefined
      }
    >
      <View style={styles.pillRow}>
        <StatusPill label={goal.status} tone={statusTone(goal.status)} />
        {goal.archivedAt !== null ? <StatusPill label="Archived" tone="textSecondary" /> : null}
        <StatusPill
          label={`${goal.completedKeyResults}/${goal.totalKeyResults} KR`}
          tone="textSecondary"
        />
      </View>

      <ThemedView type="backgroundSelected" style={styles.progressBlock}>
        <View style={styles.progressHeader}>
          <ThemedText type="small" themeColor="textSecondary">
            Overall progress
          </ThemedText>
          <ThemedText type="smallBold">{Math.round(goal.overallProgress)}%</ThemedText>
        </View>
        <ThemedView type="backgroundElement" style={styles.progressTrack}>
          <ThemedView
            type="tint"
            style={[
              styles.progressFill,
              { width: `${Math.min(100, Math.max(0, goal.overallProgress))}%` },
            ]}
          />
        </ThemedView>
      </ThemedView>

      <View style={styles.metaRow}>
        <Meta label="Start" value={formatProductYmd(goal.startDate, emptyKind('notSet'))} />
        <Meta
          label="Target"
          value={
            goal.target
              ? goalTimeframeLabel(goal.target, getProductTime().presentation.locale)
              : emptyKind('notSet')
          }
        />
      </View>

      {goal.labels.length > 0 ? (
        <View style={styles.labelRow}>
          {goal.labels.slice(0, 3).map((label) => (
            <ThemedView key={label.id} type="backgroundSelected" style={styles.labelBadge}>
              <ThemedText type="small" themeColor="textSecondary">
                #{label.name}
              </ThemedText>
            </ThemedView>
          ))}
        </View>
      ) : null}
    </SectionCard>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaCell}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  progressBlock: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressTrack: { height: 10, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  metaCell: { minWidth: 96, gap: Spacing.half },
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  labelBadge: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
});
