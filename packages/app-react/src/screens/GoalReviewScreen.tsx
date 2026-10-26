import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import type  { CreateGoalReviewReq } from '@memoflow/goal-contracts';
import { presentErrorMessage } from '@memoflow/http-client';
import { useGoalDetail } from '../hooks/useGoalDetail';
import { useGoalReviews } from '../hooks/useGoalReviews';
import { useGoalService } from '../hooks/useGoalService';
import { formatProductDate, emptyKind } from '../utils/product-time';
import {
  PageShell,
  PrimaryButton,
  PrimaryTextField,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
  ThemedView,
} from '@memoflow/ui-react-native';

export function GoalReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const goalId =
    typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : null;
  const service = useGoalService();
  const { goal } = useGoalDetail(goalId);
  const { error, isLoading, refresh, reviews } = useGoalReviews(goalId);
  const [reflection, setReflection] = useState('');
  const [challenges, setChallenges] = useState('');
  const [adjustments, setAdjustments] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCreateReview() {
    if (!goalId || !goal) {
      setSubmitError('Missing goal id.');
      return;
    }
    if (reflection.trim().length === 0) {
      setSubmitError('Reflection is required.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    const request: CreateGoalReviewReq = {
      expectedVersion: goal.version,
      reflection: reflection.trim(),
      challenges: challenges.trim() || null,
      adjustments: adjustments.trim() || null,
      windowDays: 7,
    };
    const result = await service.createGoalReview(goalId, request);
    setIsSubmitting(false);

    if (!result.ok) {
      setSubmitError(presentErrorMessage(result.error));
      return;
    }

    setReflection('');
    setChallenges('');
    setAdjustments('');
    await refresh();
  }

  return (
    <PageShell
      eyebrow="Goals"
      title={goal ? `${goal.name} reviews` : 'Goal reviews'}
      subtitle="Reflection backed by an authoritative progress snapshot and time-window deltas."
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} />}
    >
      <SectionCard title="Navigation" description="Review is a secondary goal workflow.">
        <PrimaryButton label="Back to goal" onPress={() => router.back()} variant="secondary" />
      </SectionCard>

      {error ? (
        <SectionCard title="Review load failed" description="Unable to load reviews.">
          <ThemedText type="small" themeColor="warning">
            {error}
          </ThemedText>
        </SectionCard>
      ) : null}
      {submitError ? (
        <SectionCard title="Review save failed" description="Fix the review and try again.">
          <ThemedText type="small" themeColor="warning">
            {submitError}
          </ThemedText>
        </SectionCard>
      ) : null}

      <SectionCard
        title="New review"
        description="Capture reflection; MemoFlow captures measurement context."
      >
        <PrimaryTextField
          label="Reflection"
          value={reflection}
          onChangeText={setReflection}
          placeholder="What changed and what did you learn?"
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          style={styles.multilineField}
        />
        <PrimaryTextField
          label="Challenges"
          value={challenges}
          onChangeText={setChallenges}
          placeholder="What made progress harder?"
          multiline
        />
        <PrimaryTextField
          label="Adjustments"
          value={adjustments}
          onChangeText={setAdjustments}
          placeholder="What will you change next?"
          multiline
        />
        <PrimaryButton
          label={isSubmitting ? 'Saving…' : 'Create review'}
          onPress={handleCreateReview}
          disabled={isSubmitting}
        />
      </SectionCard>

      <SectionCard
        title="Review history"
        description="Progress context is system-generated, reflection is user-authored."
      >
        <View style={styles.listColumn}>
          {reviews.length > 0 ? (
            reviews.map((review) => (
              <ThemedView key={review.id} type="backgroundSelected" style={styles.reviewCard}>
                <View style={styles.headerRow}>
                  <ThemedText type="smallBold">
                    {formatProductDate(review.reviewedAt, emptyKind('dash'))}
                  </ThemedText>
                  <StatusPill
                    label={`${review.systemContext.overallProgress.deltaPercentage >= 0 ? '+' : ''}${Math.round(review.systemContext.overallProgress.deltaPercentage)}%`}
                    tone={
                      review.systemContext.overallProgress.deltaPercentage >= 0
                        ? 'success'
                        : 'warning'
                    }
                  />
                </View>
                <ThemedText type="small">{review.reflection}</ThemedText>
                {review.challenges ? (
                  <ThemedText type="small">Challenges: {review.challenges}</ThemedText>
                ) : null}
                {review.adjustments ? (
                  <ThemedText type="small">Adjustments: {review.adjustments}</ThemedText>
                ) : null}
                <ThemedText type="small" themeColor="textSecondary">
                  {review.systemContext.summary.recordCount} records ·{' '}
                  {review.systemContext.summary.taskContributionCount} task contributions
                </ThemedText>
                {goalId ? (
                  <PrimaryButton
                    label="Open review detail"
                    onPress={() =>
                      router.push(`./review-detail?id=${goalId}&reviewId=${review.id}`)
                    }
                    variant="ghost"
                  />
                ) : null}
              </ThemedView>
            ))
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              No reviews yet.
            </ThemedText>
          )}
        </View>
      </SectionCard>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  listColumn: { gap: Spacing.three },
  reviewCard: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  multilineField: { minHeight: 110 },
});
