import { useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { presentErrorMessage } from '@memoflow/http-client';
import { mapGoalReview, type GoalReviewSummary } from '../hooks/useGoalReviews';
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
} from '@memoflow/ui-react-native';

export function GoalReviewDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[]; reviewId?: string | string[] }>();
  const goalId =
    typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : null;
  const reviewId =
    typeof params.reviewId === 'string'
      ? params.reviewId
      : Array.isArray(params.reviewId)
        ? params.reviewId[0]
        : null;
  const service = useGoalService();

  const [review, setReview] = useState<GoalReviewSummary | null>(null);
  const [goalVersion, setGoalVersion] = useState<number | null>(null);
  const [reflection, setReflection] = useState('');
  const [challenges, setChallenges] = useState('');
  const [adjustments, setAdjustments] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!goalId || !reviewId) {
      setReview(null);
      setGoalVersion(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    const result = await service.getGoalAggregateView(goalId);
    if (!result.ok) {
      setReview(null);
      setGoalVersion(null);
      setError(presentErrorMessage(result.error));
      setIsLoading(false);
      return;
    }

    const found = result.data.reviews.find((item) => String(item.id) === reviewId);
    setGoalVersion(result.data.goal.version);
    if (!found) {
      setReview(null);
      setIsLoading(false);
      return;
    }

    const nextReview = mapGoalReview(found);
    setReview(nextReview);
    setReflection(nextReview.reflection);
    setChallenges(nextReview.challenges ?? '');
    setAdjustments(nextReview.adjustments ?? '');
    setIsLoading(false);
  }

  useEffect(() => {
    void load();
  }, [goalId, reviewId]);

  async function handleSave() {
    if (!goalId || !reviewId || goalVersion === null || reflection.trim().length === 0) return;

    setIsMutating(true);
    setError(null);
    const result = await service.updateGoalReview(goalId, reviewId, {
      expectedVersion: goalVersion,
      reflection: reflection.trim(),
      challenges: challenges.trim() || null,
      adjustments: adjustments.trim() || null,
    });
    setIsMutating(false);
    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      return;
    }

    const updated = result.data.readModel.reviews.find((item) => String(item.id) === reviewId);
    if (updated) setReview(mapGoalReview(updated));
    setGoalVersion(result.data.goalVersion);
  }

  async function handleDelete() {
    if (!goalId || !reviewId || goalVersion === null) return;

    setIsMutating(true);
    setError(null);
    const result = await service.deleteGoalReview(goalId, reviewId, {
      expectedVersion: goalVersion,
    });
    setIsMutating(false);
    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      return;
    }
    router.back();
  }

  return (
    <PageShell
      eyebrow="Goals"
      title="Review detail"
      subtitle="Edit reflection while preserving the authoritative system context snapshot."
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}
    >
      <SectionCard title="Navigation" description="Review detail">
        <PrimaryButton label="Back to reviews" onPress={() => router.back()} variant="secondary" />
      </SectionCard>

      {error ? (
        <SectionCard title="Review request failed" description="Unable to update this review.">
          <ThemedText type="small" themeColor="warning">
            {error}
          </ThemedText>
        </SectionCard>
      ) : null}

      {!isLoading && !error && !review ? (
        <SectionCard
          title="Review not found"
          description="This review does not exist or is inaccessible."
        >
          <PrimaryButton label="Back" onPress={() => router.back()} variant="secondary" />
        </SectionCard>
      ) : null}

      {review ? (
        <>
          <SectionCard
            title="Measurement context"
            description="Captured when the review was created."
          >
            <View style={styles.pillRow}>
              <StatusPill
                label={`${review.systemContext.overallProgress.startPercentage}% → ${review.systemContext.overallProgress.endPercentage}%`}
                tone="tint"
              />
              <StatusPill
                label={`${review.systemContext.overallProgress.deltaPercentage >= 0 ? '+' : ''}${review.systemContext.overallProgress.deltaPercentage}%`}
                tone={
                  review.systemContext.overallProgress.deltaPercentage >= 0 ? 'success' : 'warning'
                }
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Reviewed {formatProductDate(review.reviewedAt, emptyKind('dash'))} ·{' '}
              {review.systemContext.summary.recordCount} records ·{' '}
              {review.systemContext.summary.taskContributionCount} task contributions
            </ThemedText>
          </SectionCard>

          <SectionCard title="Reflection" description="User-authored fields remain editable.">
            <PrimaryTextField
              label="Reflection"
              value={reflection}
              onChangeText={setReflection}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              style={styles.multilineField}
            />
            <PrimaryTextField
              label="Challenges"
              value={challenges}
              onChangeText={setChallenges}
              multiline
            />
            <PrimaryTextField
              label="Adjustments"
              value={adjustments}
              onChangeText={setAdjustments}
              multiline
            />
            <View style={styles.actionRow}>
              <PrimaryButton
                label={isMutating ? 'Saving…' : 'Save review'}
                onPress={handleSave}
                disabled={isMutating || reflection.trim().length === 0}
              />
              <PrimaryButton
                label={isMutating ? 'Deleting…' : 'Delete review'}
                onPress={handleDelete}
                disabled={isMutating}
                variant="ghost"
              />
            </View>
          </SectionCard>
        </>
      ) : null}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  multilineField: { minHeight: 110 },
});
