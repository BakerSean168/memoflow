import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { APP_NAME, APP_TAGLINE } from '../constants/app';
import { AnimatedIcon } from '../components/AnimatedIcon';
import { useAppSession } from '../providers/app-session-provider';

import {
  MaxContentWidth,
  PrimaryButton,
  PrimaryTextField,
  Spacing,
  ThemedText,
  ThemedView,
} from '@memoflow/ui-react-native';

type AuthScene = 'sign-in' | 'register' | 'forgot-password';

export function AuthScreen() {
  const {
    clearError,
    enterGuestMode,
    forgotPassword,
    lastError,
    loginByEmail,
    registerByEmail,
    sessionKind,
  } = useAppSession();

  const [scene, setScene] = useState<AuthScene>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const isSubmitting = sessionKind === 'authenticating';

  function switchScene(next: AuthScene) {
    clearError();
    setNotice(null);
    setScene(next);
  }

  async function handleEmailLogin() {
    setNotice(null);
    clearError();
    await loginByEmail({ email: email.trim(), password });
  }

  async function handleRegister() {
    setNotice(null);
    clearError();

    if (registerPassword !== confirmPassword) {
      setNotice('Passwords do not match.');
      return;
    }

    const success = await registerByEmail({
      email: registerEmail.trim(),
      password: registerPassword,
    });

    if (!success) {
      return;
    }

    setNotice('Account created. You are now signed in on this device.');
  }

  async function handleForgotPassword() {
    setNotice(null);
    clearError();

    const success = await forgotPassword({ email: recoveryEmail.trim() });
    if (!success) {
      return;
    }

    setNotice('Password recovery request submitted. Check your email for the next step.');
  }

  const activeTitle =
    scene === 'sign-in' ? 'Sign in' : scene === 'register' ? 'Create account' : 'Recover password';

  return (
    <ThemedView type="background" style={styles.page}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ThemedView style={styles.hero}>
            <AnimatedIcon />
            <ThemedText type="title" style={styles.centerText}>
              {APP_NAME}
            </ThemedText>
            <ThemedText style={styles.centerText} themeColor="textSecondary">
              {APP_TAGLINE}
            </ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.panel}>
            <ThemedView style={styles.formSection}>
              <ThemedText type="smallBold">{activeTitle}</ThemedText>

              {scene === 'sign-in' ? (
                <>
                  <PrimaryTextField
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    keyboardType="email-address"
                    label="Email"
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    value={email}
                  />
                  <PrimaryTextField
                    autoCapitalize="none"
                    autoCorrect={false}
                    label="Password"
                    onChangeText={setPassword}
                    onSubmitEditing={handleEmailLogin}
                    placeholder="Password"
                    secureTextEntry
                    value={password}
                  />
                  <PrimaryButton
                    disabled={email.trim().length === 0 || password.length === 0 || isSubmitting}
                    fullWidth
                    label={isSubmitting ? 'Signing in…' : 'Sign in'}
                    onPress={handleEmailLogin}
                  />
                </>
              ) : null}

              {scene === 'register' ? (
                <>
                  <PrimaryTextField
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    keyboardType="email-address"
                    label="Email"
                    onChangeText={setRegisterEmail}
                    placeholder="you@example.com"
                    value={registerEmail}
                  />
                  <PrimaryTextField
                    autoCapitalize="none"
                    autoCorrect={false}
                    label="Password"
                    onChangeText={setRegisterPassword}
                    placeholder="Create password"
                    secureTextEntry
                    value={registerPassword}
                  />
                  <PrimaryTextField
                    autoCapitalize="none"
                    autoCorrect={false}
                    label="Confirm password"
                    onChangeText={setConfirmPassword}
                    onSubmitEditing={handleRegister}
                    placeholder="Repeat password"
                    secureTextEntry
                    value={confirmPassword}
                  />
                  <PrimaryButton
                    disabled={
                      registerEmail.trim().length === 0 ||
                      registerPassword.length === 0 ||
                      confirmPassword.length === 0 ||
                      isSubmitting
                    }
                    fullWidth
                    label={isSubmitting ? 'Creating account…' : 'Create account'}
                    onPress={handleRegister}
                  />
                </>
              ) : null}

              {scene === 'forgot-password' ? (
                <>
                  <PrimaryTextField
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    keyboardType="email-address"
                    label="Email"
                    onChangeText={setRecoveryEmail}
                    onSubmitEditing={handleForgotPassword}
                    placeholder="you@example.com"
                    value={recoveryEmail}
                  />
                  <PrimaryButton
                    disabled={recoveryEmail.trim().length === 0 || isSubmitting}
                    fullWidth
                    label={isSubmitting ? 'Submitting…' : 'Send recovery request'}
                    onPress={handleForgotPassword}
                  />
                </>
              ) : null}
            </ThemedView>

            {lastError ? (
              <ThemedView type="backgroundSelected" style={styles.errorBox}>
                <ThemedText type="small" themeColor="warning">
                  {lastError}
                </ThemedText>
              </ThemedView>
            ) : null}

            {notice ? (
              <ThemedView type="backgroundSelected" style={styles.noticeBox}>
                <ThemedText type="small" themeColor="success">
                  {notice}
                </ThemedText>
              </ThemedView>
            ) : null}

            {/* Bottom scene-switch links */}
            <View style={styles.sceneLinks}>
              {scene === 'sign-in' ? (
                <>
                  <SceneLink label="Create account" onPress={() => switchScene('register')} />
                  <ThemedText type="small" themeColor="textSecondary">
                    {' | '}
                  </ThemedText>
                  <SceneLink
                    label="Forgot password"
                    onPress={() => switchScene('forgot-password')}
                  />
                  <ThemedText type="small" themeColor="textSecondary">
                    {' | '}
                  </ThemedText>
                  <SceneLink label="Guest mode" onPress={enterGuestMode} />
                </>
              ) : (
                <SceneLink label="Back to sign in" onPress={() => switchScene('sign-in')} />
              )}
            </View>
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function SceneLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.linkLabel}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    justifyContent: 'center',
    gap: Spacing.four,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  centerText: {
    textAlign: 'center',
  },
  panel: {
    alignSelf: 'stretch',
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  formSection: {
    gap: Spacing.three,
  },
  sceneLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingVertical: Spacing.one,
  },
  linkLabel: {
    textDecorationLine: 'underline',
  },
  errorBox: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  noticeBox: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
});
