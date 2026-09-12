import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { presentErrorMessage } from '@memoflow/http-client';
import type { CreateGoalReq, UpdateGoalReq } from '@memoflow/contracts/goal';

import { useGoalDetail } from '../hooks/useGoalDetail';
import { useGoalService } from '../hooks/useGoalService';
import {
  goalTimeframeInputValue,
  parseGoalTimeframeInput,
  parseProductYmdInput,
} from '../utils/product-time';
import {
  PageShell,
  PrimaryButton,
  PrimaryTextField,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
} from '@memoflow/ui-react-native';

export function GoalEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const goalId =
    typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : null;
  const service = useGoalService();
  const { goal, isLoading } = useGoalDetail(goalId);

  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [startDate, setStartDate] = useState('');
  const [targetInput, setTargetInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!goal) return;
    setName(goal.name);
    setSummary(goal.summary ?? '');
    setStartDate(goal.startDate ?? '');
    setTargetInput(goalTimeframeInputValue(goal.target));
  }, [goal?.id]);

  async function handleSubmit() {
    if (name.trim().length === 0) {
      setError('Goal name is required.');
      return;
    }

    const parsedStartDate = startDate.trim().length === 0 ? null : parseProductYmdInput(startDate);
    if (startDate.trim().length > 0 && parsedStartDate === null) {
      setError('Start date must use YYYY-MM-DD.');
      return;
    }

    const target = targetInput.trim().length === 0 ? null : parseGoalTimeframeInput(targetInput);
    if (targetInput.trim().length > 0 && target === null) {
      setError('Target supports YYYY-MM-DD, YYYY-MM, Q4 2026, H1 2027, or YYYY.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = goalId
      ? await service.updateGoal(goalId, {
          name: name.trim(),
          expectedVersion: goal?.version ?? 1,
          summary: summary.trim().length > 0 ? summary.trim() : null,
          startDate: parsedStartDate,
          target,
        } satisfies UpdateGoalReq)
      : await service.createGoal({
          name: name.trim(),
          summary: summary.trim().length > 0 ? summary.trim() : undefined,
          ...(parsedStartDate ? { startDate: parsedStartDate } : {}),
          ...(target ? { target } : {}),
        } satisfies CreateGoalReq);

    setIsSubmitting(false);
    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      return;
    }

    router.replace(`../${String(result.data.readModel.id)}`);
  }

  const reminderCount = goal?.reminderConfig?.triggers.filter((item) => item.enabled).length ?? 0;

  return (
    <PageShell
      eyebrow="Goals"
      title={goalId ? 'Edit goal' : 'Create goal'}
      subtitle="Direction + measurable outcomes, with the same precision-preserving Goal contract as Web/Desktop."
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
          description="Name is the only required text field; summary stays concise."
        >
          <PrimaryTextField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="What do you want to achieve?"
          />
          <PrimaryTextField
            label="Summary"
            value={summary}
            onChangeText={setSummary}
            placeholder="What does success mean?"
            maxLength={500}
          />
        </SectionCard>

        <SectionCard
          title="Planning properties"
          description="Mobile compresses the property row instead of inventing another Goal contract."
        >
          <View style={styles.propertyRow}>
            <StatusPill label={goal?.status ?? 'Planned'} tone="tint" />
            <StatusPill
              label={goal?.labels.length ? `${goal.labels.length} labels` : 'No labels'}
              tone="textSecondary"
            />
            <StatusPill
              label={reminderCount > 0 ? `${reminderCount} reminders` : 'No reminders'}
              tone="textSecondary"
            />
          </View>
          <PrimaryTextField
            label="Start"
            value={startDate}
            onChangeText={setStartDate}
            placeholder="2026-09-12"
            hint="Exact date, YYYY-MM-DD."
          />
          <PrimaryTextField
            label="Target"
            value={targetInput}
            onChangeText={setTargetInput}
            placeholder="Q4 2026"
            hint="Use YYYY-MM-DD, YYYY-MM, Q4 2026, H1 2027, or YYYY. Precision is preserved."
          />
        </SectionCard>
      </ScrollView>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  formColumn: { gap: Spacing.three, paddingBottom: Spacing.six },
  propertyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
