import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { presentErrorMessage } from '@memoflow/http-client';

import { getProductTime, formatProductDateTime, emptyKind } from '../utils/product-time';

import { useTaskInstances } from '../hooks/useTaskInstances';
import { useTaskTemplateDetail } from '../hooks/useTaskTemplateDetail';
import { useAppSession } from '../hooks/useAppSession';
import { useTaskService } from '../hooks/useTaskService';

import {
  PageShell,
  PrimaryButton,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
  ThemedView,
} from '@memoflow/ui-react-native';

function formatTimeConfig(input: {
  timeType: string;
  timePoint: number | null;
  timeRange?: { start: number; end: number } | null;
}) {
  if (input.timeType === 'AllDay') {
    return 'All day';
  }

  if (input.timeType === 'TimePoint' && input.timePoint !== null) {
    return `At ${getProductTime().format.hm(input.timePoint)}`;
  }

  if (input.timeType === 'TimeRange' && input.timeRange) {
    const start = getProductTime().format.hm(input.timeRange.start);
    const end = getProductTime().format.hm(input.timeRange.end);
    return `${start} - ${end}`;
  }

  return input.timeType;
}

export function TaskDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const taskId =
    typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : null;
  const { signOut } = useAppSession();
  const service = useTaskService();
  const { error, isLoading, refresh, template } = useTaskTemplateDetail(taskId);
  const {
    completeInstance,
    error: instancesError,
    instances,
    isLoading: instancesLoading,
    refresh: refreshInstances,
    skipInstance,
    startInstance,
  } = useTaskInstances(taskId);
  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);

  async function refreshAll() {
    await Promise.all([refresh(), refreshInstances()]);
  }

  async function handlePause() {
    if (!taskId) {
      return;
    }

    setIsMutating(true);
    setActionError(null);
    const result = await service.pauseTemplate(taskId);
    setIsMutating(false);

    if (!result.ok) {
      setActionError(presentErrorMessage(result.error));
      return;
    }

    await refreshAll();
  }

  async function handleActivate() {
    if (!taskId) {
      return;
    }

    setIsMutating(true);
    setActionError(null);
    const result = await service.activateTemplate(taskId);
    setIsMutating(false);

    if (!result.ok) {
      setActionError(presentErrorMessage(result.error));
      return;
    }

    await refreshAll();
  }

  async function handleArchive() {
    if (!taskId) {
      return;
    }

    setIsMutating(true);
    setActionError(null);
    const result = await service.archiveTemplate(taskId);
    setIsMutating(false);

    if (!result.ok) {
      setActionError(presentErrorMessage(result.error));
      return;
    }

    await refreshAll();
  }

  async function runInstanceAction(instanceId: string, action: 'start' | 'complete' | 'skip') {
    setActiveInstanceId(instanceId);
    setActionError(null);

    const ok =
      action === 'start'
        ? await startInstance(instanceId)
        : action === 'complete'
          ? await completeInstance(instanceId)
          : await skipInstance(instanceId);

    setActiveInstanceId(null);

    if (!ok) {
      setActionError('Task instance action failed.');
      return;
    }

    await refresh();
  }

  const actionSections = [
    {
      title: 'Navigation',
      description: '详情页的返回和编辑入口收进这里。',
      items: [
        {
          label: 'Back to list',
          description: '返回任务列表。',
          onPress: () => router.back(),
        },
        ...(taskId
          ? [
              {
                label: 'Edit template',
                description: '打开模板编辑页。',
                onPress: () => router.push(`../editor?id=${taskId}`),
              },
            ]
          : []),
      ],
    },
  ];

  return (
    <PageShell
      actionMenuSubtitle="任务详情的跳转入口已集中到左上角。"
      actionSections={actionSections}
      eyebrow="Tasks"
      title={template ? template.name : 'Task detail'}
      subtitle="移动端详情页先聚焦关键信息和实例流，复杂关系图和高级编辑不会直接照搬桌面布局。"
      refreshControl={
        <RefreshControl refreshing={isLoading || instancesLoading} onRefresh={refreshAll} />
      }
    >
      {!taskId ? (
        <SectionCard title="Missing task id" description="当前路由没有携带任务标识，无法加载详情。">
          <PrimaryButton
            label="Return to tasks"
            onPress={() => router.replace('../')}
            variant="secondary"
          />
        </SectionCard>
      ) : null}

      {error ? (
        <SectionCard
          title="Task detail failed"
          description="详情请求失败时直接展示错误，不做桌面式 fallback。"
        >
          <ThemedText type="small" themeColor="warning">
            {error}
          </ThemedText>
          <View style={styles.actionRow}>
            <PrimaryButton label="Retry" onPress={refreshAll} variant="secondary" />
            <PrimaryButton label="Sign out" onPress={signOut} variant="ghost" />
          </View>
        </SectionCard>
      ) : null}

      {!isLoading && !error && !template ? (
        <SectionCard
          title="Task not found"
          description="这个模板不存在，或者当前账号没有访问权限。"
        >
          <PrimaryButton
            label="Back to tasks"
            onPress={() => router.replace('../')}
            variant="secondary"
          />
        </SectionCard>
      ) : null}

      {template ? (
        <>
          <SectionCard title="Status" description="移动端详情先保留最关键的执行和结构信息。">
            <View style={styles.pillRow}>
              <StatusPill
                label={template.status}
                tone={template.status === 'Active' ? 'success' : 'warning'}
              />
              <StatusPill label={template.importance} tone="tint" />
              <StatusPill label={template.outcome} tone="textSecondary" />
              {template.archivedAt !== null ? <StatusPill label="Archived" tone="textSecondary" /> : null}
            </View>
            <View style={styles.actionRow}>
              {template.status === 'Active' ? (
                <PrimaryButton
                  label={isMutating ? 'Pausing…' : 'Pause'}
                  onPress={handlePause}
                  disabled={isMutating}
                />
              ) : null}
              {template.status === 'Paused' ? (
                <PrimaryButton
                  label={isMutating ? 'Activating…' : 'Activate'}
                  onPress={handleActivate}
                  disabled={isMutating}
                />
              ) : null}
              {template.archivedAt === null ? (
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

          <SectionCard title="Schedule" description="桌面端细分区域先收敛成移动端可读的摘要。">
            <MetricRow label="Time mode" value={formatTimeConfig(template.timeConfig)} />
            <MetricRow
              label="Start date"
              value={formatProductDateTime(template.startDate ?? template.timeConfig.startDate, emptyKind('notSet'))}
            />
            <MetricRow label="Due date" value={formatProductDateTime(template.dueDate, emptyKind('notSet'))} />
            <MetricRow label="Created" value={formatProductDateTime(template.createdAt, emptyKind('notSet'))} />
            <MetricRow label="Updated" value={formatProductDateTime(template.updatedAt, emptyKind('notSet'))} />
          </SectionCard>

          <SectionCard
            title="Execution"
            description="执行统计后续还会继续接实例详情，这里先给摘要。"
          >
            <View style={styles.metricGrid}>
              <MetricBox label="Instances" value={String(template.instanceCount)} />
              <MetricBox label="Pending" value={String(template.pendingInstanceCount)} />
              <MetricBox label="Completed" value={String(template.completedInstanceCount)} />
              <MetricBox label="Completion" value={`${Math.round(template.completionRate)}%`} />
            </View>
          </SectionCard>

          <SectionCard
            title="Recent instances"
            description="任务详情现在会直接展示最近实例并允许开始、完成、跳过。"
          >
            {instancesError ? (
              <ThemedText type="small" themeColor="warning">
                {instancesError}
              </ThemedText>
            ) : null}
            <View style={styles.listColumn}>
              {instances.length > 0 ? (
                instances.map((instance) => (
                  <ThemedView
                    key={instance.id}
                    type="backgroundSelected"
                    style={styles.instanceCard}
                  >
                    <View style={styles.instanceHeader}>
                      <ThemedText type="smallBold">{formatProductDateTime(instance.instanceDate, emptyKind('notSet'))}</ThemedText>
                      <StatusPill
                        label={instance.status}
                        tone={
                          instance.status === 'Completed'
                            ? 'success'
                            : instance.status === 'InProgress'
                              ? 'tint'
                              : 'textSecondary'
                        }
                      />
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatTimeConfig(instance.timeConfig)}
                    </ThemedText>
                    {instance.comment ? (
                      <ThemedText type="small">{instance.comment}</ThemedText>
                    ) : null}
                    <View style={styles.actionRow}>
                      {instance.status === 'Pending' ? (
                        <PrimaryButton
                          label={activeInstanceId === instance.id ? 'Starting…' : 'Start'}
                          onPress={() => runInstanceAction(instance.id, 'start')}
                          disabled={activeInstanceId === instance.id}
                          variant="secondary"
                        />
                      ) : null}
                      {instance.status === 'InProgress' || instance.status === 'Pending' ? (
                        <PrimaryButton
                          label={activeInstanceId === instance.id ? 'Completing…' : 'Complete'}
                          onPress={() => runInstanceAction(instance.id, 'complete')}
                          disabled={activeInstanceId === instance.id}
                        />
                      ) : null}
                      {instance.status === 'Pending' || instance.status === 'InProgress' ? (
                        <PrimaryButton
                          label={activeInstanceId === instance.id ? 'Skipping…' : 'Skip'}
                          onPress={() => runInstanceAction(instance.id, 'skip')}
                          disabled={activeInstanceId === instance.id}
                          variant="ghost"
                        />
                      ) : null}
                    </View>
                  </ThemedView>
                ))
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  当前没有已生成实例。
                </ThemedText>
              )}
            </View>
          </SectionCard>

          <SectionCard
            title="Notes"
            description={template.description ?? 'No description provided yet.'}
          >
            <MetricRow
              label="Estimated minutes"
              value={template.estimatedMinutes ? String(template.estimatedMinutes) : 'Not set'}
            />
            <MetricRow
              label="Actual minutes"
              value={template.actualMinutes ? String(template.actualMinutes) : 'Not set'}
            />
            <MetricRow label="Comment" value={template.comment ?? 'No comment'} />
            <View style={styles.tagRow}>
              {template.labels.length > 0 ? (
                template.labels.map((label) => (
                  <StatusPill key={label.id} label={label.name} tone="textSecondary" />
                ))
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  No labels
                </ThemedText>
              )}
            </View>
          </SectionCard>
        </>
      ) : null}
    </PageShell>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricBox}>
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
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  metricRow: {
    gap: Spacing.one,
  },
  metricBox: {
    minWidth: 120,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: 'transparent',
    gap: Spacing.half,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  listColumn: {
    gap: Spacing.three,
  },
  instanceCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  instanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
