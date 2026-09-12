import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { presentErrorMessage } from '@memoflow/http-client';
import {
  goalTimeframeLabel,
  type CreateGoalReq,
  type UpdateGoalReq,
} from '@memoflow/contracts/goal';

import { useGoalDetail } from '../hooks/useGoalDetail';
import { useGoalService } from '../hooks/useGoalService';
import { getProductTime, parseProductYmdInput } from '../utils/product-time';
import {
  PageShell,
  PrimaryButton,
  PrimaryTextField,
  SectionCard,
  Spacing,
  ThemedText,
} from '@memoflow/ui-react-native';

function targetDateInput(goal: ReturnType<typeof useGoalDetail>['goal']): string {
  return goal?.target?.kind === 'day' ? goal.target.date : '';
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
  const [targetDate, setTargetDate] = useState('');
  const [targetTouched, setTargetTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!goal) return;
    setName(goal.name);
    setSummary(goal.summary ?? '');
    setTargetDate(targetDateInput(goal));
    setTargetTouched(false);
  }, [goal?.id]);

  async function handleSubmit() {
    if (name.trim().length === 0) {
      setError('Goal name is required.');
      return;
    }

    const parsedTargetDate =
      targetDate.trim().length === 0 ? null : parseProductYmdInput(targetDate);
    if (targetDate.trim().length > 0 && parsedTargetDate === null) {
      setError('Target date must use YYYY-MM-DD.');
      return;
    }
    const target =
      goalId && goal && !targetTouched
        ? (goal.target ?? null)
        : parsedTargetDate
          ? ({ kind: 'day', date: parsedTargetDate } as const)
          : null;

    setIsSubmitting(true);
    setError(null);

    const result = goalId
      ? await service.updateGoal(goalId, {
          name: name.trim(),
          expectedVersion: goal?.version ?? 1,
          summary: summary.trim().length > 0 ? summary.trim() : null,
          target,
        } satisfies UpdateGoalReq)
      : await service.createGoal({
          name: name.trim(),
          summary: summary.trim().length > 0 ? summary.trim() : undefined,
          target: target ?? undefined,
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
          {goal?.target && goal.target.kind !== 'day' && !targetTouched ? (
            <ThemedText type="small" themeColor="textSecondary">
              Current target:{' '}
              {goalTimeframeLabel(goal.target, getProductTime().presentation.locale)}
            </ThemedText>
          ) : null}
          <PrimaryTextField
            label="Target date"
            value={targetDate}
            onChangeText={(value) => {
              setTargetDate(value);
              setTargetTouched(true);
            }}
            placeholder="2026-12-31"
            hint="Use YYYY-MM-DD. Choosing a date replaces any broader target period."
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
