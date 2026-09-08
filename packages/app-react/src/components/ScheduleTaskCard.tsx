import { StyleSheet, View } from 'react-native';

import type { ScheduleTaskSummary } from '../hooks/useScheduleTasks';

import { SectionCard, Spacing, StatusPill, ThemedText } from '@memoflow/ui-react-native';

import { formatProductDateTime, emptyKind } from '../utils/product-time';

function statusTone(status: ScheduleTaskSummary['status']) {
  if (status === 'Active') return 'success' as const;
  if (status === 'Paused' || status === 'Failed') return 'warning' as const;
  return 'textSecondary' as const;
}

function computeHealth(consecutiveFailures: number): 'healthy' | 'warning' | 'critical' {
  if (consecutiveFailures === 0) return 'healthy';
  if (consecutiveFailures < 3) return 'warning';
  return 'critical';
}

function healthTone(health: 'healthy' | 'warning' | 'critical') {
  if (health === 'healthy') return 'success' as const;
  if (health === 'warning') return 'warning' as const;
  return 'textSecondary' as const;
}

/** Residual 1216: schedule card timestamp via session product-time + empty catalog dash. */
function scheduleTimestamp(timestamp: number | null) {
  return formatProductDateTime(timestamp, emptyKind('dash'));
}

/**
 * Read-only Scheduler worker diagnostic card.
 *
 * Users change the owning Task/Routine/Planner object; owner-domain commands
 * project the resulting owner intent into worker state.
 */
export function ScheduleTaskCard({ task }: { task: ScheduleTaskSummary }) {
  const health = computeHealth(task.consecutiveFailures);
  const successCount = task.executionCount - task.consecutiveFailures;

  return (
    <SectionCard title={task.name} description={task.description ?? 'No description yet.'}>
      <View style={styles.pillRow}>
        <StatusPill label={task.status} tone={statusTone(task.status)} />
        <StatusPill label={task.sourceModule} tone="tint" />
        <StatusPill label={task.priority} tone="textSecondary" />
        <StatusPill label={health} tone={healthTone(health)} />
      </View>

      <View style={styles.metaColumn}>
        <Meta label="Next run" value={scheduleTimestamp(task.nextRunAt)} />
        <Meta label="Last run" value={scheduleTimestamp(task.lastRunAt)} />
        <Meta label="Execution" value={`${task.executionCount} total, ${successCount} successful`} />
        <Meta label="Enabled" value={task.enabled ? 'Enabled' : 'Disabled'} />
      </View>

      <View style={styles.tagRow}>
        {task.tags.slice(0, 3).map((tag) => (
          <StatusPill key={tag} label={`#${tag}`} tone="textSecondary" />
        ))}
      </View>
    </SectionCard>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
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
  metaColumn: {
    gap: Spacing.one,
  },
  metaRow: {
    gap: Spacing.half,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
});
