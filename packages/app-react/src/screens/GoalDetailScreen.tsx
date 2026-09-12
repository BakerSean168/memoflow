import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { GoalStatus, goalTimeframeLabel, isPastGoalTarget } from '@memoflow/contracts/goal';
import { presentErrorMessage } from '@memoflow/http-client';

import { useGoalService } from '../hooks/useGoalService';
import { useGoalWorkspace } from '../hooks/useGoalWorkspace';
import {
  formatProductDate,
  formatProductYmd,
  getProductTime,
  getProductTodayYmd,
} from '../utils/product-time';
import {
  PageShell,
  PrimaryButton,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
  ThemedView,
} from '@memoflow/ui-react-native';

export function GoalDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const goalId =
    typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : null;
  const service = useGoalService();
  const { error, workspace, isLoading, refresh } = useGoalWorkspace(goalId);
  const goal = workspace?.goal ?? null;
  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function runLifecycle(action: 'activate' | 'plan' | 'complete' | 'abandon' | 'archive') {
    if (!goalId || !goal) return;
    setIsMutating(true);
    setActionError(null);
    const result =
      action === 'activate'
        ? await service.activateGoal(goalId, goal.version)
        : action === 'plan'
          ? await service.planGoal(goalId, goal.version)
          : action === 'complete'
            ? await service.completeGoal(goalId, goal.version)
            : action === 'abandon'
              ? await service.abandonGoal(goalId, goal.version)
              : await service.archiveGoal(goalId, goal.version);
    setIsMutating(false);
    if (!result.ok) {
      setActionError(presentErrorMessage(result.error));
      return;
    }
    await refresh();
  }

  const isPastTarget =
    goal !== null &&
    (goal.status === GoalStatus.Planned || goal.status === GoalStatus.InProgress) &&
    isPastGoalTarget(goal.target, getProductTodayYmd());
  const reminderCount = goal?.reminderConfig?.triggers.filter((item) => item.enabled).length ?? 0;
  const keyResults = goal?.keyResults ?? [];

  const actionSections = [
    {
      title: 'Navigation',
      description: 'Goal workspace navigation.',
      items: [
        { label: 'Back to list', description: 'Return to goals.', onPress: () => router.back() },
        ...(goalId
          ? [
              {
                label: 'Edit goal',
                description: 'Edit direction and planning properties.',
                onPress: () => router.push(`./editor?id=${goalId}`),
              },
              {
                label: 'Reviews',
                description: 'Open goal reviews.',
                onPress: () => router.push(`./review?id=${goalId}`),
              },
            ]
          : []),
      ],
    },
  ];

  return (
    <PageShell
      actionMenuSubtitle="Goal workspace navigation"
      actionSections={actionSections}
      eyebrow="Goals"
      title={goal ? goal.name : 'Goal detail'}
      subtitle="Direction, measurement, linked actions, and Knowledge context."
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} />}
    >
      {error && !workspace ? (
        <SectionCard title="Goal detail failed" description="Unable to load the Goal Workspace.">
          <ThemedText type="small" themeColor="warning">
            {error}
          </ThemedText>
          <PrimaryButton label="Retry" onPress={() => void refresh()} variant="secondary" />
        </SectionCard>
      ) : null}

      {!isLoading && !error && !goal ? (
        <SectionCard
          title="Goal not found"
          description="This goal does not exist or is unavailable."
        >
          <PrimaryButton
            label="Back to goals"
            onPress={() => router.replace('../')}
            variant="secondary"
          />
        </SectionCard>
      ) : null}

      {goal && workspace ? (
        <>
          <SectionCard title="Goal" description={goal.summary ?? 'No summary yet.'}>
            <View style={styles.pillRow}>
              <StatusPill
                label={goal.status}
                tone={
                  goal.status === GoalStatus.InProgress
                    ? 'success'
                    : goal.status === GoalStatus.Completed
                      ? 'tint'
                      : 'textSecondary'
                }
              />
              {goal.startDate ? (
                <StatusPill
                  label={`Start ${formatProductYmd(goal.startDate)}`}
                  tone="textSecondary"
                />
              ) : null}
              {goal.target ? (
                <StatusPill
                  label={`Target ${goalTimeframeLabel(goal.target, getProductTime().presentation.locale)}`}
                  tone="textSecondary"
                />
              ) : null}
              {goal.labels.slice(0, 2).map((label) => (
                <StatusPill key={label.id} label={`#${label.name}`} tone="textSecondary" />
              ))}
              {goal.labels.length > 2 ? (
                <StatusPill label={`+${goal.labels.length - 2} labels`} tone="textSecondary" />
              ) : null}
              {reminderCount > 0 ? (
                <StatusPill label={`${reminderCount} reminders`} tone="textSecondary" />
              ) : null}
              {isPastTarget ? <StatusPill label="Past target" tone="warning" /> : null}
            </View>

            <ThemedView type="backgroundSelected" style={styles.progressBlock}>
              <ThemedText type="small" themeColor="textSecondary">
                Overall progress
              </ThemedText>
              <ThemedText type="title" style={styles.progressText}>
                {Math.round(goal.overallProgress)}%
              </ThemedText>
            </ThemedView>

            <View style={styles.actionRow}>
              {goal.archivedAt === null && goal.status === GoalStatus.Planned ? (
                <PrimaryButton
                  label={isMutating ? 'Starting…' : 'Start'}
                  onPress={() => runLifecycle('activate')}
                  disabled={isMutating}
                />
              ) : null}
              {goal.archivedAt === null && goal.status === GoalStatus.InProgress ? (
                <>
                  <PrimaryButton
                    label="Return to plan"
                    onPress={() => runLifecycle('plan')}
                    disabled={isMutating}
                    variant="secondary"
                  />
                  <PrimaryButton
                    label="Complete"
                    onPress={() => runLifecycle('complete')}
                    disabled={isMutating}
                  />
                </>
              ) : null}
              {goal.archivedAt === null &&
              (goal.status === GoalStatus.Completed || goal.status === GoalStatus.Abandoned) ? (
                <PrimaryButton
                  label="Reopen"
                  onPress={() => runLifecycle('activate')}
                  disabled={isMutating}
                />
              ) : null}
              {goal.archivedAt === null &&
              (goal.status === GoalStatus.Planned || goal.status === GoalStatus.InProgress) ? (
                <PrimaryButton
                  label="Abandon"
                  onPress={() => runLifecycle('abandon')}
                  disabled={isMutating}
                  variant="ghost"
                />
              ) : null}
              {goal.archivedAt === null ? (
                <PrimaryButton
                  label="Archive"
                  onPress={() => runLifecycle('archive')}
                  disabled={isMutating}
                  variant="ghost"
                />
              ) : null}
            </View>
            {actionError ? (
              <ThemedText type="small" themeColor="warning">
                {actionError}
              </ThemedText>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Key results"
            description="Initial → Current → Target remains visible on mobile."
          >
            <View style={styles.listColumn}>
              {keyResults.length > 0 ? (
                keyResults.map((keyResult) => {
                  const linkedTasks =
                    workspace.taskContext.availability === 'Available'
                      ? (workspace.taskContext.summary.byKeyResult.find(
                          (item) => item.keyResultId === String(keyResult.id),
                        )?.total ?? 0)
                      : 0;
                  return (
                    <ThemedView key={keyResult.id} type="backgroundSelected" style={styles.krCard}>
                      <ThemedText type="smallBold">{keyResult.title}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {keyResult.progress.initialValue} → {keyResult.progress.currentValue} →{' '}
                        {keyResult.progress.targetValue}
                        {keyResult.progress.unit ? ` ${keyResult.progress.unit}` : ''}
                      </ThemedText>
                      <View style={styles.pillRow}>
                        <StatusPill
                          label={`${Math.round(keyResult.progressPercentage)}%`}
                          tone="tint"
                        />
                        {keyResult.target ? (
                          <StatusPill
                            label={goalTimeframeLabel(keyResult.target)}
                            tone="textSecondary"
                          />
                        ) : null}
                        {linkedTasks > 0 ? (
                          <StatusPill label={`${linkedTasks} linked tasks`} tone="textSecondary" />
                        ) : null}
                      </View>
                      {goalId ? (
                        <View style={styles.actionRow}>
                          <PrimaryButton
                            label="Open key result"
                            onPress={() =>
                              router.push(`./key-result?id=${goalId}&keyResultId=${keyResult.id}`)
                            }
                            variant="ghost"
                          />
                          {linkedTasks > 0 ? (
                            <PrimaryButton
                              label="Open linked tasks"
                              onPress={() =>
                                router.push(`/tasks?goalId=${goalId}&keyResultId=${keyResult.id}`)
                              }
                              variant="ghost"
                            />
                          ) : null}
                        </View>
                      ) : null}
                    </ThemedView>
                  );
                })
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  No key results yet.
                </ThemedText>
              )}
            </View>
          </SectionCard>

          <SectionCard
            title={`Tasks${workspace.taskContext.summary ? ` · ${workspace.taskContext.summary.total}` : ''}`}
            description="Bounded preview from the Task-owned Goal context read model."
          >
            {workspace.taskContext.availability === 'Unavailable' ? (
              <ThemedText type="small" themeColor="textSecondary">
                Task context is temporarily unavailable.
              </ThemedText>
            ) : workspace.taskContext.preview.length > 0 ? (
              <View style={styles.listColumn}>
                {workspace.taskContext.preview.map((task) => (
                  <ThemedView
                    key={task.taskPlanId}
                    type="backgroundSelected"
                    style={styles.previewCard}
                  >
                    <ThemedText type="smallBold">{task.name}</ThemedText>
                    <View style={styles.pillRow}>
                      <StatusPill label={task.status} tone="textSecondary" />
                      <StatusPill label={task.outcome} tone="textSecondary" />
                    </View>
                    <PrimaryButton
                      label="Open task"
                      onPress={() => router.push(`/tasks/${task.taskPlanId}`)}
                      variant="ghost"
                    />
                  </ThemedView>
                ))}
              </View>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                No linked actions yet.
              </ThemedText>
            )}
            {goalId ? (
              <PrimaryButton
                label="Open all linked tasks"
                onPress={() => router.push(`/tasks?goalId=${goalId}`)}
                variant="secondary"
              />
            ) : null}
          </SectionCard>

          <SectionCard
            title={`Knowledge${workspace.knowledgeContext.summary ? ` · ${workspace.knowledgeContext.summary.total}` : ''}`}
            description="Knowledge remains owner-controlled; Goal only renders linked context."
          >
            {workspace.knowledgeContext.availability === 'Unavailable' ? (
              <ThemedText type="small" themeColor="textSecondary">
                Knowledge context is temporarily unavailable.
              </ThemedText>
            ) : workspace.knowledgeContext.preview.length > 0 ? (
              <View style={styles.listColumn}>
                {workspace.knowledgeContext.preview.map((note) => (
                  <ThemedView
                    key={note.relationId}
                    type="backgroundSelected"
                    style={styles.previewCard}
                  >
                    <ThemedText type="smallBold">
                      {note.state === 'Resolved' ? note.title : 'Missing knowledge document'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {note.state === 'Resolved'
                        ? note.excerpt || note.relativePath
                        : note.documentId}
                    </ThemedText>
                  </ThemedView>
                ))}
              </View>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                No linked knowledge yet.
              </ThemedText>
            )}
          </SectionCard>

          {workspace.recentProgress.length > 0 ? (
            <SectionCard
              title="Recent progress"
              description="Latest Goal-owned measurement records."
            >
              <View style={styles.listColumn}>
                {workspace.recentProgress.map((record) => (
                  <View key={record.id} style={styles.recordRow}>
                    <ThemedText type="smallBold">
                      {record.value >= 0 ? '+' : ''}
                      {record.value} → {record.valueAfter}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatProductDate(record.createdAt)}
                      {record.comment ? ` · ${record.comment}` : ''}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </SectionCard>
          ) : null}

          <SectionCard title="Reviews" description="Recent review context.">
            <View style={styles.listColumn}>
              {workspace.recentReviews.length > 0 ? (
                workspace.recentReviews.map((review) => (
                  <ThemedView key={review.id} type="backgroundSelected" style={styles.previewCard}>
                    <ThemedText type="small">{review.reflection}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatProductDate(review.reviewedAt)}
                    </ThemedText>
                  </ThemedView>
                ))
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  No reviews yet.
                </ThemedText>
              )}
            </View>
            {goalId ? (
              <PrimaryButton
                label="Open reviews"
                onPress={() => router.push(`./review?id=${goalId}`)}
                variant="secondary"
              />
            ) : null}
          </SectionCard>
        </>
      ) : null}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  progressBlock: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  progressText: { fontSize: 40, lineHeight: 44 },
  listColumn: { gap: Spacing.two },
  krCard: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  previewCard: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  recordRow: { gap: Spacing.half },
});
