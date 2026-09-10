import { RefreshControl, StyleSheet, View } from 'react-native';

import { useRouter } from 'expo-router';

import { useAppSession } from '../hooks/useAppSession';
import { useSettings } from '../hooks/useSettings';
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
  const { signOut } = useAppSession();
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
    error: legacyError,
    isLoading: isLegacyLoading,
    isMutating: isLegacyMutating,
    isRemoteAuthenticated,
    patchCategory,
    refresh: refreshLegacy,
    resetCategory,
    settings: legacySettings,
  } = useSettings();

  const isLoading = isPreferenceLoading || isLegacyLoading;
  const isMutating = isPreferenceMutating || isLegacyMutating;
  const presentation = profile?.presentation;
  const regional = profile?.regional;
  const notification = legacySettings?.preferences.notification;

  async function refresh() {
    await Promise.all([refreshPreferences(), refreshLegacy()]);
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

  async function toggleNotification(key: 'email' | 'push' | 'inApp' | 'sound') {
    if (!notification) return;
    await patchCategory('notification', { [key]: !notification[key] });
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
                  <StatusPill label={isPreferenceMutating ? 'Saving changes' : 'Ready'} tone={isPreferenceMutating ? 'warning' : 'success'} />
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
                  <PrimaryButton label={isMutating ? 'Saving…' : 'Cycle theme'} onPress={cycleTheme} disabled={isMutating} />
                  <PrimaryButton label={isMutating ? 'Saving…' : 'Toggle language'} onPress={toggleLanguage} disabled={isMutating} variant="secondary" />
                  <PrimaryButton label="Reset presentation" onPress={() => resetNamespace('presentation')} disabled={isMutating} variant="ghost" />
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
                  <PrimaryButton label={isMutating ? 'Saving…' : 'Toggle 12h / 24h'} onPress={toggleTimeFormat} disabled={isMutating} />
                  <PrimaryButton label="Reset regional" onPress={() => resetNamespace('regional')} disabled={isMutating} variant="ghost" />
                </View>
              </SectionCard>
            </>
          ) : null}

          {legacyError ? (
            <SectionCard title="Notification settings unavailable" description="Notification preference migration is handled by its owner lane.">
              <ThemedText type="small" themeColor="warning">
                {legacyError}
              </ThemedText>
            </SectionCard>
          ) : null}

          {notification ? (
            <SectionCard title="Notifications" description="通知 owner cutover 前保留现有渠道开关；不再承载 theme/locale。">
              <View style={styles.pillRow}>
                <StatusPill label={`Email ${notification.email ? 'on' : 'off'}`} tone={notification.email ? 'success' : 'textSecondary'} />
                <StatusPill label={`Push ${notification.push ? 'on' : 'off'}`} tone={notification.push ? 'success' : 'textSecondary'} />
                <StatusPill label={`In-app ${notification.inApp ? 'on' : 'off'}`} tone={notification.inApp ? 'success' : 'textSecondary'} />
                <StatusPill label={`Sound ${notification.sound ? 'on' : 'off'}`} tone={notification.sound ? 'success' : 'textSecondary'} />
              </View>
              <View style={styles.actionRow}>
                <PrimaryButton label="Toggle email" onPress={() => toggleNotification('email')} disabled={isMutating} variant="secondary" />
                <PrimaryButton label="Toggle push" onPress={() => toggleNotification('push')} disabled={isMutating} variant="secondary" />
                <PrimaryButton label="Toggle in-app" onPress={() => toggleNotification('inApp')} disabled={isMutating} variant="secondary" />
                <PrimaryButton label="Toggle sound" onPress={() => toggleNotification('sound')} disabled={isMutating} variant="secondary" />
                <PrimaryButton label="Reset notifications" onPress={() => resetCategory('notification')} disabled={isMutating} variant="ghost" />
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
