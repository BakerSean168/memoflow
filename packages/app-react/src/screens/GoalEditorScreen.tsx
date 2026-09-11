import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { presentErrorMessage } from '@memoflow/http-client';
import type { CreateGoalReq, UpdateGoalReq } from '@memoflow/contracts/goal';

import { useGoalDetail } from '../hooks/useGoalDetail';
import { useGoalService } from '../hooks/useGoalService';
import { getProductTime } from '../utils/product-time';
import {
  PageShell,
  PrimaryButton,
  PrimaryTextField,
  SectionCard,
  Spacing,
  ThemedText,
} from '@memoflow/ui-react-native';

function toDateInput(timestamp: number | null): string {
  return getProductTime().input.dateValue(timestamp);
}

function parseDateInput(value: string): number | null {
  const ymd = getProductTime().input.parseDateValue(value.trim());
  return ymd ? getProductTime().codec.startOfYmd(ymd) : null;
}

export function GoalEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const goalId =
    typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : null;
  const service = useGoalService();
  const { goal, isLoading } = useGoalDetail(goalId);

  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!goal) return;
    setName(goal.name);
    setSummary(goal.summary ?? '');
    setDueDate(toDateInput(goal.dueDate));
  }, [goal?.id]);

  async function handleSubmit() {
    if (name.trim().length === 0) {
      setError('Goal name is required.');
      return;
    }

    const parsedDueDate = dueDate.trim().length === 0 ? null : parseDateInput(dueDate);
    if (dueDate.trim().length > 0 && parsedDueDate === null) {
      setError('Due date must use YYYY-MM-DD.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = goalId
      ? await service.updateGoal(goalId, {
          name: name.trim(),
          expectedVersion: goal?.version ?? 1,
          summary: summary.trim().length > 0 ? summary.trim() : null,
          dueDate: parsedDueDate,
        } satisfies UpdateGoalReq)
      : await service.createGoal({
          name: name.trim(),
          summary: summary.trim().length > 0 ? summary.trim() : undefined,
          dueDate: parsedDueDate ?? undefined,
        } satisfies CreateGoalReq);

    setIsSubmitting(false);
    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      return;
    }

    router.replace(`../${String(result.data.readModel.id)}`);
  }

  return (
    <PageShell
      eyebrow="Goals"
      title={goalId ? 'Edit goal' : 'Create goal'}
      subtitle="Goal = direction + measurement. Labels and key results are managed separately."
    >
      <SectionCard title="Navigation" description="Goal editor">
        <View style={styles.actionRow}>
          <PrimaryButton label="Back" onPress={() => router.back()} variant="secondary" />
          <PrimaryButton
            label={isSubmitting ? 'Saving…' : goalId ? 'Save changes' : 'Create goal'}
            onPress={handleSubmit}
            disabled={isSubmitting || isLoading}
          />
        </View>
      </SectionCard>

      {error ? (
        <SectionCard title="Goal save failed" description="Fix the form and try again.">
          <ThemedText type="small" themeColor="warning">
            {error}
          </ThemedText>
        </SectionCard>
      ) : null}

      <ScrollView contentContainerStyle={styles.formColumn}>
        <SectionCard
          title="Direction"
          description="Name the goal and keep its identity summary concise."
        >
          <PrimaryTextField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Ship mobile migration"
          />
          <PrimaryTextField
            label="Summary"
            value={summary}
            onChangeText={setSummary}
            placeholder="What this goal is trying to achieve"
            maxLength={500}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            style={styles.multilineField}
          />
          <PrimaryTextField
            label="Due date"
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="2026-12-31"
            hint="Use YYYY-MM-DD."
          />
        </SectionCard>
      </ScrollView>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  formColumn: { gap: Spacing.three, paddingBottom: Spacing.six },
  multilineField: { minHeight: 110 },
});
