import { StyleSheet, View } from 'react-native';
import type { TaskTemplateSummary } from '../hooks/useTaskTemplates';
import { formatProductRelative } from '../utils/product-time';
import {
  PrimaryButton,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
  ThemedView,
} from '@memoflow/ui-react-native';

function statusTone(status: TaskTemplateSummary['status']) {
  if (status === 'Active') return 'success' as const;
  if (status === 'Paused') return 'warning' as const;
  return 'textSecondary' as const;
}

function importanceTone(importance: TaskTemplateSummary['importance']) {
  if (importance === 'Vital' || importance === 'Important') return 'warning' as const;
  if (importance === 'Moderate') return 'tint' as const;
  return 'textSecondary' as const;
}

export function TaskTemplateCard({
  onEdit,
  onOpen,
  template,
}: {
  template: TaskTemplateSummary;
  onOpen?: () => void;
  onEdit?: () => void;
}) {
  return (
    <SectionCard
      title={template.name}
      description={template.description ?? 'No description yet.'}
      footer={
        <View style={styles.actionRow}>
          {onOpen ? <PrimaryButton label="Open detail" onPress={onOpen} variant="secondary" /> : null}
          {onEdit ? <PrimaryButton label="Edit" onPress={onEdit} variant="ghost" /> : null}
        </View>
      }
    >
      <View style={styles.pillRow}>
        <StatusPill label={template.status} tone={statusTone(template.status)} />
        <StatusPill label={template.outcome} tone="textSecondary" />
        <StatusPill label={template.importance} tone={importanceTone(template.importance)} />
        {template.archivedAt !== null ? <StatusPill label="Archived" tone="textSecondary" /> : null}
      </View>

      <View style={styles.metricGrid}>
        <Metric label="Instances" value={String(template.instanceCount)} />
        <Metric label="Pending" value={String(template.pendingInstanceCount)} />
        <Metric label="Completed" value={String(template.completedInstanceCount)} />
        <Metric label="Completion" value={`${Math.round(template.completionRate)}%`} />
      </View>

      <ThemedView type="backgroundSelected" style={styles.progressFillWrap}>
        <ThemedView
          type="tint"
          style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, template.completionRate))}%` }]}
        />
      </ThemedView>

      <View style={styles.footerRow}>
        <ThemedText type="small" themeColor="textSecondary">
          Updated {formatProductRelative(template.updatedAt)}
        </ThemedText>
        <View style={styles.tagRow}>
          {template.labels.slice(0, 3).map((label) => (
            <ThemedView key={label.id} type="backgroundSelected" style={styles.tagBadge}>
              <ThemedText type="small" themeColor="textSecondary">{label.name}</ThemedText>
            </ThemedView>
          ))}
        </View>
      </View>
    </SectionCard>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView type="backgroundSelected" style={styles.metricCard}>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  metricCard: { minWidth: 88, borderRadius: Spacing.three, padding: Spacing.two, gap: Spacing.half },
  progressFillWrap: { height: 10, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  footerRow: { gap: Spacing.two },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  tagBadge: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
