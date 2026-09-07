import { useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { presentErrorMessage } from '@memoflow/http-client';

import type { ReminderTemplateClientDTO } from '@memoflow/contracts/reminder';

import { useAppSession } from '../hooks/useAppSession';
import { useReminderService } from '../hooks/useReminderService';

import {
  PageShell,
  PrimaryButton,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
} from '@memoflow/ui-react-native';
import {
  getReminderDisplayTitle,
  getReminderImportanceText,
  getReminderNextTriggerText,
  getReminderTriggerText,
} from '../utils/entity-presentation';

export function ReminderDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const reminderId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : null;
  const service = useReminderService();
  const { isRemoteAuthenticated, signOut } = useAppSession();

  const [template, setTemplate] = useState<ReminderTemplateClientDTO | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!isRemoteAuthenticated || !reminderId) {
      setTemplate(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    const result = await service.getReminderTemplate(reminderId);
    if (!result.ok) {
      setTemplate(null);
      setError(presentErrorMessage(result.error));
      setIsLoading(false);
      return;
    }

    setTemplate(result.data);
    setIsLoading(false);
  }

  useEffect(() => {
    void load();
  }, [reminderId, isRemoteAuthenticated]);

  async function handleToggle() {
    if (!reminderId) {
      return;
    }

    setIsMutating(true);
    const result = await service.toggleTemplateEnabled(reminderId);
    setIsMutating(false);
    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      return;
    }

    await load();
  }

  async function handleDelete() {
    if (!reminderId) {
      return;
    }

    setIsMutating(true);
    const result = await service.deleteReminderTemplate(reminderId);
    setIsMutating(false);
    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      return;
    }

    router.back();
  }

  return (
    <PageShell
      eyebrow="More"
      title={template ? getReminderDisplayTitle(template) : 'Reminder detail'}
      subtitle="提醒详情页承接模板摘要、启停和编辑入口。"
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}>
      <SectionCard title="Navigation" description="提醒详情从 reminders 列表下钻。">
        <View style={styles.actionRow}>
          <PrimaryButton label="Back to reminders" onPress={() => router.back()} variant="secondary" />
          {reminderId ? <PrimaryButton label="Edit template" onPress={() => router.push(`./reminder-editor?id=${reminderId}`)} /> : null}
        </View>
      </SectionCard>

      {!isRemoteAuthenticated ? (
        <SectionCard title="Remote sign-in required" description="提醒详情依赖远程认证会话。">
          <PrimaryButton fullWidth label="Return to sign-in" onPress={signOut} />
        </SectionCard>
      ) : null}

      {error ? (
        <SectionCard title="Reminder detail failed" description="详情请求失败时先直接展示错误。">
          <ThemedText type="small" themeColor="warning">{error}</ThemedText>
        </SectionCard>
      ) : null}

      {!isLoading && !error && !template ? (
        <SectionCard title="Reminder not found" description="当前提醒模板不存在或当前账号无权限访问。">
          <PrimaryButton label="Back" onPress={() => router.back()} variant="secondary" />
        </SectionCard>
      ) : null}

      {template ? (
        <>
          <SectionCard title="Status" description={template.description ?? getReminderTriggerText(template)}>
            <View style={styles.pillRow}>
              <StatusPill label={template.type} tone="tint" />
              <StatusPill label={template.status} tone={template.effectiveEnabled ? 'success' : 'warning'} />
              <StatusPill label={getReminderImportanceText(template)} tone="textSecondary" />
            </View>
            <View style={styles.actionRow}>
              <PrimaryButton
                label={isMutating ? 'Updating…' : template.effectiveEnabled ? 'Pause template' : 'Enable template'}
                onPress={handleToggle}
                disabled={isMutating}
              />
              <PrimaryButton
                label={isMutating ? 'Deleting…' : 'Delete template'}
                onPress={handleDelete}
                disabled={isMutating}
                variant="ghost"
              />
            </View>
          </SectionCard>

          <SectionCard title="Trigger" description="提醒触发规则和通知方式摘要。">
            <MetaRow label="Trigger" value={getReminderTriggerText(template)} />
            <MetaRow label="Next trigger" value={getReminderNextTriggerText(template)} />
            <MetaRow label="Lifecycle" value={template.effectiveEnabledReason} />
            <MetaRow label="Channels" value={template.notificationConfig.channels.join(', ')} />
          </SectionCard>

          <SectionCard title="Scope" description="分组、标签和生效方式。">
            <MetaRow label="Group" value={template.groupName ?? 'No group'} />
            <MetaRow label="Tags" value={template.tags.length > 0 ? template.tags.join(', ') : 'No tags'} />
          </SectionCard>
        </>
      ) : null}
    </PageShell>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
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
  metaRow: {
    gap: Spacing.half,
  },
});
