import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { GoalStatus } from '@memoflow/contracts/goal';
import { presentErrorMessage } from '@memoflow/http-client';

import { useGoalDetail } from '../hooks/useGoalDetail';
import { useGoalService } from '../hooks/useGoalService';

import {
  PageShell,
  PrimaryButton,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
  ThemedView,
} from '@memoflow/ui-react-native';

// Residual 1261: formatDate dual retired onto shared formatDateNotSet sole (date-only + English 'Not set').
import { formatDateNotSet as formatDate } from '../utils/format-date-not-set';

export function GoalDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const goalId =
    typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : null;
  const service = useGoalService();
  const { error, goal, isLoading, refresh } = useGoalDetail(goalId);
  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleActivate() {
    if (!goalId || !goal) return;
    setIsMutating(true);
    setActionError(null);
    const result = await service.activateGoal(goalId, goal.version);
    setIsMutating(false);
    if (!result.ok) {
      setActionError(presentErrorMessage(result.error));
      return;
    }
    await refresh();
  }

  async function handlePlan() {
    if (!goalId || !goal) return;
    setIsMutating(true);
    setActionError(null);
    const result = await service.planGoal(goalId, goal.version);
    setIsMutating(false);
    if (!result.ok) {
      setActionError(presentErrorMessage(result.error));
      return;
    }
    await refresh();
  }

  async function handleComplete() {
    if (!goalId || !goal) return;
    setIsMutating(true);
    setActionError(null);
    const result = await service.completeGoal(goalId, goal.version);
    setIsMutating(false);
    if (!result.ok) {
      setActionError(presentErrorMessage(result.error));
      return;
    }
    await refresh();
  }

  async function handleAbandon() {
    if (!goalId || !goal) return;
    setIsMutating(true);
    setActionError(null);
    const result = await service.abandonGoal(goalId, goal.version);
    setIsMutating(false);
    if (!result.ok) {
      setActionError(presentErrorMessage(result.error));
      return;
    }
    await refresh();
  }

  async function handleArchive() {
    if (!goalId || !goal) return;
    setIsMutating(true);
    setActionError(null);
    const result = await service.archiveGoal(goalId, goal.version);
    setIsMutating(false);
    if (!result.ok) {
      setActionError(presentErrorMessage(result.error));
      return;
    }
    await refresh();
  }

  const actionSections = [
    {
      title: 'Navigation',
      description: '详情页下钻和返回操作集中在这里。',
      items: [
        {
          label: 'Back to list',
          description: '返回目标列表。',
          onPress: () => router.back(),
        },
        ...(goalId
          ? [
              {
                label: 'Edit goal',
                description: '打开目标编辑页。',
                onPress: () => router.push(`./editor?id=${goalId}`),
              },
              {
                label: 'Reviews',
                description: '查看该目标的 review。',
                onPress: () => router.push(`./review?id=${goalId}`),
              },
            ]
          : []),
      ],
    },
  ];

  return (
    <PageShell
      actionMenuSubtitle="详情页的跳转和次级入口收进左上角。"
      actionSections={actionSections}
      eyebrow="Goals"
      title={goal ? goal.name : 'Goal detail'}
      subtitle="移动端详情页先聚焦目标概览、关键结果、review 和状态动作，不照搬桌面多区域布局。"
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} />}
    >
      {error ? (
        <SectionCard title="Goal detail failed" description="详情请求失败时直接展示错误。">
          <ThemedText type="small" themeColor="warning">
            {error}
          </ThemedText>
          <PrimaryButton label="Retry" onPress={refresh} variant="secondary" />
        </SectionCard>
      ) : null}

      {!isLoading && !error && !goal ? (
        <SectionCard
          title="Goal not found"
          description="这个目标不存在，或者当前账号没有访问权限。"
        >
          <PrimaryButton
            label="Back to goals"
            onPress={() => router.replace('../')}
            variant="secondary"
          />
        </SectionCard>
      ) : null}

      {goal ? (
        <>
          <SectionCard title="Status" description={goal.summary ?? 'No summary yet.'}>
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
              <StatusPill
                label={`${goal.completedKeyResults}/${goal.totalKeyResults} KR`}
                tone="textSecondary"
              />
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
                  onPress={handleActivate}
                  disabled={isMutating}
                />
              ) : null}
              {goal.archivedAt === null && goal.status === GoalStatus.InProgress ? (
                <>
                  <PrimaryButton
                    label={isMutating ? 'Planning…' : 'Return to plan'}
                    onPress={handlePlan}
                    disabled={isMutating}
                    variant="secondary"
                  />
                  <PrimaryButton
                    label={isMutating ? 'Completing…' : 'Complete'}
                    onPress={handleComplete}
                    disabled={isMutating}
                  />
                </>
              ) : null}
              {goal.archivedAt === null &&
              (goal.status === GoalStatus.Completed || goal.status === GoalStatus.Abandoned) ? (
                <PrimaryButton
                  label={isMutating ? 'Reopening…' : 'Reopen'}
                  onPress={handleActivate}
                  disabled={isMutating}
                />
              ) : null}
              {goal.archivedAt === null &&
              (goal.status === GoalStatus.Planned || goal.status === GoalStatus.InProgress) ? (
                <PrimaryButton
                  label={isMutating ? 'Abandoning…' : 'Abandon'}
                  onPress={handleAbandon}
                  disabled={isMutating}
                  variant="ghost"
                />
              ) : null}
              {goal.archivedAt === null ? (
                <PrimaryButton
                  label={isMutating ? 'Archiving…' : 'Archive'}
                  onPress={handleArchive}
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

          <SectionCard title="Goal timeline" description="Direction dates and labels.">
            <MetaRow label="Start date" value={formatDate(goal.startDate)} />
            <MetaRow label="Due date" value={formatDate(goal.dueDate)} />
            <MetaRow
              label="Labels"
              value={
                goal.labels.length > 0 ? goal.labels.map((label) => label.name).join(', ') : 'None'
              }
            />
          </SectionCard>

          <SectionCard
            title="Key results"
            description="关键结果现在支持继续下钻到 detail/edit/record 流。"
          >
            <View style={styles.listColumn}>
              {goal.keyResults.length > 0 ? (
                goal.keyResults.map((keyResult) => (
                  <ThemedView key={keyResult.id} type="backgroundSelected" style={styles.krCard}>
                    <ThemedText type="smallBold">{keyResult.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {keyResult.description ?? 'No description yet.'}
                    </ThemedText>
                    <View style={styles.krMetaRow}>
                      <StatusPill
                        label={`${keyResult.currentValue}/${keyResult.targetValue}${keyResult.unit ? ` ${keyResult.unit}` : ''}`}
                        tone="textSecondary"
                      />
                      <StatusPill label={`${keyResult.progress}%`} tone="tint" />
                    </View>
                    {goalId ? (
                      <PrimaryButton
                        label="Open key result"
                        onPress={() =>
                          router.push(`./key-result?id=${goalId}&keyResultId=${keyResult.id}`)
                        }
                        variant="ghost"
                      />
                    ) : null}
                  </ThemedView>
                ))
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  No key results yet.
                </ThemedText>
              )}
            </View>
          </SectionCard>

          <SectionCard
            title="Reviews"
            description="review 已经接入移动端，详情页先展示摘要并提供入口。"
          >
            <View style={styles.actionRow}>
              <StatusPill label={`${goal.reviewsCount} reviews`} tone="textSecondary" />
              {goalId ? (
                <PrimaryButton
                  label="Open reviews"
                  onPress={() => router.push(`./review?id=${goalId}`)}
                  variant="secondary"
                />
              ) : null}
            </View>
          </SectionCard>
        </>
      ) : null}
    </PageShell>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
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
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  progressBlock: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  progressText: {
    fontSize: 40,
    lineHeight: 44,
  },
  metaRow: {
    gap: Spacing.half,
  },
  listColumn: {
    gap: Spacing.two,
  },
  krCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  krMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
});
