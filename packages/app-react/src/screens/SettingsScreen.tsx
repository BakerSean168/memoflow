import { RefreshControl, StyleSheet, View } from 'react-native';

import { useRouter } from 'expo-router';
import { NotificationChannelType } from '@memoflow/contracts/notification';

import { useAppSession } from '../hooks/useAppSession';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';
import { useAppPreferences } from '../providers/app-preference-provider';

import {
  PageShell,
  PrimaryButton,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
} from '@memoflow/ui-react-native';

const THEME_SEQUENCE = ['auto', 'light', 'dark'] as const;
const LANGUAGE_SEQUENCE = ['zh-CN', 'en-US'] as const;

export function SettingsScreen() {
  const router = useRouter();
  const { signOut, isRemoteAuthenticated } = useAppSession();
  const {
    error: preferenceError,
    isLoading: isPreferenceLoading,
    isMutating: isPreferenceMutating,
    patchPresentation,
    patchRegional,
    profile,
    presentationRevision,
    refresh: refreshPreferences,
    regionalRevision,
    resetAll,
    resetNamespace,
  } = useAppPreferences();
  const {
    error: notificationError,
    isLoading: isNotificationLoading,
    isMutating: isNotificationMutating,
    preference: notificationPreference,
    refresh: refreshNotificationPreferences,
    setGlobalChannel,
  } = useNotificationPreferences();

  const isLoading = isPreferenceLoading || isNotificationLoading;
  const isMutating = isPreferenceMutating || isNotificationMutating;
  const presentation = profile?.presentation;
  const regional = profile?.regional;

  async function refresh() {
    await Promise.all([refreshPreferences(), refreshNotificationPreferences()]);
  }

  async function cycleTheme() {
    if (!presentation) return;
    const currentIndex = THEME_SEQUENCE.indexOf(presentation.theme);
    const nextTheme = THEME_SEQUENCE[(currentIndex + 1) % THEME_SEQUENCE.length];
    await patchPresentation({ theme: nextTheme });
  }

  async function toggleLanguage() {
    if (!presentation) return;
    const nextLanguage =
      presentation.language === LANGUAGE_SEQUENCE[0] ? LANGUAGE_SEQUENCE[1] : LANGUAGE_SEQUENCE[0];
    await patchPresentation({ language: nextLanguage });
  }

  async function toggleTimeFormat() {
    if (!regional) return;
    await patchRegional({ timeStyle: regional.timeStyle === '24h' ? '12h' : '24h' });
  }

  async function toggleNotification(channel: NotificationChannelType) {
    if (!notificationPreference) return;
    await setGlobalChannel(channel, !(notificationPreference.globalChannels[channel] ?? false));
  }

  function notificationEnabled(channel: NotificationChannelType): boolean {
    return notificationPreference?.globalChannels[channel] ?? false;
  }

  const actionSections = [
    {
      title: 'Settings',
      description: '偏好设置快捷操作。',
      items: [
        {
          label: 'Reset presentation & regional preferences',
          description: '恢复主题、语言和区域时间偏好。',
          disabled: isMutating || !profile,
          onPress: () => resetAll(),
        },
        {
          label: 'Account',
          description: '查看账户资料。',
          onPress: () => router.push('./account'),
        },
      ],
    },
  ];

  return (
    <PageShell
      actionMenuSubtitle="偏好设置快捷操作。"
      actionSections={actionSections}
      eyebrow="More"
      title="Settings"
      subtitle="主题、语言、区域时间和通知。"
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} />}>
      {!isRemoteAuthenticated ? (
        <SectionCard title="Sign in required" description="登录后可同步设置。">
          <ThemedText type="small" themeColor="textSecondary">
            Sign in with a remote account to load your settings.
          </ThemedText>
          <PrimaryButton fullWidth label="Go to sign-in" onPress={signOut} />
        </SectionCard>
      ) : (
        <>
          {preferenceError ? (
            <SectionCard title="Preferences load failed" description="Unable to load canonical preferences.">
              <ThemedText type="small" themeColor="warning">
                {preferenceError}
              </ThemedText>
            </SectionCard>
          ) : null}

          {profile ? (
            <>
              <SectionCard title="Summary" description="Canonical preference namespace revisions.">
                <View style={styles.pillRow}>
                  <StatusPill label="2 canonical namespaces" tone="tint" />
                  <StatusPill label={`Presentation r${presentationRevision ?? 0}`} tone="textSecondary" />
                  <StatusPill label={`Regional r${regionalRevision ?? 0}`} tone="textSecondary" />
                  <StatusPill
                    label={isPreferenceMutating ? 'Saving changes' : 'Ready'}
                    tone={isPreferenceMutating ? 'warning' : 'success'}
                  />
                </View>
                <PrimaryButton
                  label="Reset presentation & regional"
                  onPress={() => resetAll()}
                  variant="ghost"
                  disabled={isMutating}
                />
              </SectionCard>

              <SectionCard title="Presentation" description="主题与语言由 canonical presentation namespace 管理。">
                <View style={styles.pillRow}>
                  <StatusPill label={`Theme ${presentation?.theme ?? 'auto'}`} tone="tint" />
                  <StatusPill label={presentation?.language ?? '—'} tone="textSecondary" />
                </View>
                <View style={styles.actionRow}>
                  <PrimaryButton
                    label={isMutating ? 'Saving…' : 'Cycle theme'}
                    onPress={cycleTheme}
                    disabled={isMutating}
                  />
                  <PrimaryButton
                    label={isMutating ? 'Saving…' : 'Toggle language'}
                    onPress={toggleLanguage}
                    disabled={isMutating}
                    variant="secondary"
                  />
                  <PrimaryButton
                    label="Reset presentation"
                    onPress={() => resetNamespace('presentation')}
                    disabled={isMutating}
                    variant="ghost"
                  />
                </View>
              </SectionCard>

              <SectionCard title="Regional" description="时区、日期密度、12/24 小时制与周起始日。">
                <View style={styles.pillRow}>
                  <StatusPill label={regional?.timeZone ?? '—'} tone="tint" />
                  <StatusPill label={`Date ${regional?.dateStyle ?? '—'}`} tone="textSecondary" />
                  <StatusPill label={regional?.timeStyle ?? '—'} tone="textSecondary" />
                  <StatusPill label={`Week starts ${regional?.weekStartsOn ?? '—'}`} tone="textSecondary" />
                </View>
                <View style={styles.actionRow}>
                  <PrimaryButton
                    label={isMutating ? 'Saving…' : 'Toggle 12h / 24h'}
                    onPress={toggleTimeFormat}
                    disabled={isMutating}
                  />
                  <PrimaryButton
                    label="Reset regional"
                    onPress={() => resetNamespace('regional')}
                    disabled={isMutating}
                    variant="ghost"
                  />
                </View>
              </SectionCard>
            </>
          ) : null}

          {notificationError ? (
            <SectionCard
              title="Notification settings unavailable"
              description="Notification preferences are owned by the Notification module.">
              <ThemedText type="small" themeColor="warning">
                {notificationError}
              </ThemedText>
            </SectionCard>
          ) : null}

          {notificationPreference ? (
            <SectionCard
              title="Notifications"
              description="User-level delivery channels are owned by NotificationPreference. Device sound and presentation remain Desktop-local.">
              <View style={styles.pillRow}>
                <StatusPill
                  label={`Email ${notificationEnabled(NotificationChannelType.Email) ? 'on' : 'off'}`}
                  tone={notificationEnabled(NotificationChannelType.Email) ? 'success' : 'textSecondary'}
                />
                <StatusPill
                  label={`Push ${notificationEnabled(NotificationChannelType.Push) ? 'on' : 'off'}`}
                  tone={notificationEnabled(NotificationChannelType.Push) ? 'success' : 'textSecondary'}
                />
                <StatusPill
                  label={`In-app ${notificationEnabled(NotificationChannelType.InApp) ? 'on' : 'off'}`}
                  tone={notificationEnabled(NotificationChannelType.InApp) ? 'success' : 'textSecondary'}
                />
              </View>
              <View style={styles.actionRow}>
                <PrimaryButton
                  label="Toggle email"
                  onPress={() => toggleNotification(NotificationChannelType.Email)}
                  disabled={isMutating}
                  variant="secondary"
                />
                <PrimaryButton
                  label="Toggle push"
                  onPress={() => toggleNotification(NotificationChannelType.Push)}
                  disabled={isMutating}
                  variant="secondary"
                />
                <PrimaryButton
                  label="Toggle in-app"
                  onPress={() => toggleNotification(NotificationChannelType.InApp)}
                  disabled={isMutating}
                  variant="secondary"
                />
              </View>
            </SectionCard>
          ) : null}
        </>
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
