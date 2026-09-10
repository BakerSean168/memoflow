import { RefreshControl, StyleSheet, View } from 'react-native';

import { useRouter } from 'expo-router';

import { useAccountProfile } from '../hooks/useAccountProfile';
import { useAppSession } from '../hooks/useAppSession';
import { useAppPreferences } from '../providers/app-preference-provider';

import {
  PageShell,
  PrimaryButton,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
} from '@memoflow/ui-react-native';

// Residual 1261: formatDate dual retired onto shared formatDateNotSet sole (date-only + English 'Not set').
import { formatDateNotSet as formatDate } from '../utils/format-date-not-set';

export function AccountScreen() {
  const router = useRouter();
  const { signOut } = useAppSession();
  const { profile: preferenceProfile, refresh: refreshPreferences } = useAppPreferences();
  const { account, loginEmail, isEmailVerified, error, isLoading, isRemoteAuthenticated, refresh } =
    useAccountProfile();
  const actionSections = [
    {
      title: 'Account',
      description: '账户相关快捷入口。',
      items: [
        {
          label: 'Settings',
          description: '打开偏好设置。',
          onPress: () => router.push('./settings'),
        },
      ],
    },
  ];

  return (
    <PageShell
      actionMenuSubtitle="账户页快捷入口。"
      actionSections={actionSections}
      eyebrow="More"
      title="Account"
      subtitle="账户资料和偏好摘要。"
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={() => Promise.all([refresh(), refreshPreferences()])}
        />
      }
    >
      {!isRemoteAuthenticated ? (
        <SectionCard title="Sign in required" description="登录后可查看账户资料。">
          <ThemedText type="small" themeColor="textSecondary">
            Sign in with a remote account to load your profile.
          </ThemedText>
          <PrimaryButton fullWidth label="Go to sign-in" onPress={signOut} />
        </SectionCard>
      ) : (
        <>
          {error ? (
            <SectionCard title="Account load failed" description="Unable to load account profile.">
              <ThemedText type="small" themeColor="warning">
                {error}
              </ThemedText>
            </SectionCard>
          ) : null}

          {!isLoading && !account ? (
            <SectionCard title="No account profile" description="当前没有返回账户资料。" />
          ) : null}

          {account ? (
            <>
              <SectionCard title="Profile" description={account.profile.bio ?? 'No bio yet.'}>
                <View style={styles.pillRow}>
                  <StatusPill label={account.status} tone="tint" />
                  {preferenceProfile ? (
                    <StatusPill
                      label={preferenceProfile.presentation.language}
                      tone="textSecondary"
                    />
                  ) : null}
                  {preferenceProfile ? (
                    <StatusPill label={preferenceProfile.presentation.theme} tone="success" />
                  ) : null}
                </View>
                <MetaRow label="Nickname" value={account.profile.nickname} />
                <MetaRow label="Real name" value={account.profile.realName ?? 'Not set'} />
                <MetaRow label="Email" value={loginEmail ?? 'Not set'} />
                <MetaRow label="Email verified" value={isEmailVerified ? 'Yes' : 'No'} />
                <MetaRow label="Birthday" value={formatDate(account.profile.birthday)} />
              </SectionCard>

              {preferenceProfile ? (
                <SectionCard
                  title="Preferences"
                  description="Canonical presentation/regional preferences; Account no longer owns this truth."
                >
                  <MetaRow label="Timezone" value={preferenceProfile.regional.timeZone} />
                  <MetaRow label="Language" value={preferenceProfile.presentation.language} />
                  <MetaRow label="Theme" value={preferenceProfile.presentation.theme} />
                  <MetaRow label="Time style" value={preferenceProfile.regional.timeStyle} />
                </SectionCard>
              ) : null}
            </>
          ) : null}
        </>
      )}
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
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  metaRow: {
    gap: Spacing.half,
  },
});
