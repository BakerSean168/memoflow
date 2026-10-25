import { StyleSheet, View } from 'react-native';

import {
  FeatureTile,
  PageShell,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
} from '@memoflow/ui-react-native';

export type ModuleRoadmapScreenProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusTone?: 'tint' | 'success' | 'warning' | 'textSecondary';
  scope: readonly { title: string; description: string; phase: string }[];
  nextSteps: readonly string[];
  layoutNote: string;
};

export function ModuleRoadmapScreen({
  eyebrow,
  layoutNote,
  nextSteps,
  scope,
  statusLabel,
  statusTone = 'tint',
  subtitle,
  title,
}: ModuleRoadmapScreenProps) {
  return (
    <PageShell eyebrow={eyebrow} title={title} subtitle={subtitle}>
      <SectionCard
        title="Current status"
        description="模块壳已纳入移动端信息架构，接下来直接往里接真实页面和数据流。"
      >
        <View style={styles.pillRow}>
          <StatusPill label={statusLabel} tone={statusTone} />
          <StatusPill label="Mobile-first layout" tone="tint" />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {layoutNote}
        </ThemedText>
      </SectionCard>

      <SectionCard title="Planned surface" description="这个模块在移动端的首批落地范围。">
        <View style={styles.tileGrid}>
          {scope.map((item) => (
            <FeatureTile
              key={item.title}
              eyebrow={item.phase}
              title={item.title}
              description={item.description}
              disabled
            />
          ))}
        </View>
      </SectionCard>

      <SectionCard title="Next steps" description="这部分会是后续连续提交的主链路。">
        {nextSteps.map((step) => (
          <ThemedText key={step} type="small" themeColor="textSecondary">
            {step}
          </ThemedText>
        ))}
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
