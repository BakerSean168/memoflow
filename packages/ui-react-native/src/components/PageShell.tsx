import { useMemo, useState, type ReactNode } from 'react';
import {
  PanResponder,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, MaxContentWidth, Spacing } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { PageActionDrawer, type PageActionSection } from './PageActionDrawer';
import { PrimaryButton } from './PrimaryButton';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';

export type PageShellProps = Omit<ScrollViewProps, 'contentContainerStyle'> & {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  headerSlot?: ReactNode;
  actionSections?: PageActionSection[];
  actionMenuLabel?: string;
  actionMenuSubtitle?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function PageShell({
  actionMenuLabel = 'Page',
  actionMenuSubtitle,
  actionSections,
  children,
  contentContainerStyle,
  eyebrow,
  headerSlot,
  subtitle,
  title,
  ...props
}: PageShellProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [isActionDrawerOpen, setIsActionDrawerOpen] = useState(false);
  const hasActionSections = (actionSections?.length ?? 0) > 0;

  const edgeSwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (event, gestureState) =>
          hasActionSections &&
          !isActionDrawerOpen &&
          event.nativeEvent.pageX <= 32 &&
          gestureState.dx > 18 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx > 32) {
            setIsActionDrawerOpen(true);
          }
        },
      }),
    [hasActionSections, isActionDrawerOpen],
  );

  return (
    <ThemedView type="background" style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={[styles.scrollView, { backgroundColor: theme.background }]}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Spacing.four,
              paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
            },
            contentContainerStyle,
          ]}
          {...props}
        >
          <ThemedView style={styles.header}>
            {hasActionSections || headerSlot ? (
              <View style={styles.headerChrome}>
                {hasActionSections ? (
                  <PrimaryButton
                    label={actionMenuLabel}
                    onPress={() => setIsActionDrawerOpen(true)}
                    style={styles.headerButton}
                    variant="secondary"
                  />
                ) : (
                  <View />
                )}
                {headerSlot ? <View style={styles.headerSlotWrap}>{headerSlot}</View> : null}
              </View>
            ) : null}
            {eyebrow ? (
              <ThemedText type="smallBold" themeColor="tint" style={styles.eyebrow}>
                {eyebrow}
              </ThemedText>
            ) : null}
            <ThemedText type="subtitle">{title}</ThemedText>
            {subtitle ? (
              <ThemedText themeColor="textSecondary" style={styles.subtitle}>
                {subtitle}
              </ThemedText>
            ) : null}
          </ThemedView>

          <ThemedView style={styles.body}>{children}</ThemedView>
        </ScrollView>
      </SafeAreaView>

      {hasActionSections && !isActionDrawerOpen ? (
        <View
          {...edgeSwipeResponder.panHandlers}
          pointerEvents="box-only"
          style={styles.swipeEdge}
        />
      ) : null}

      {hasActionSections ? (
        <PageActionDrawer
          sections={actionSections ?? []}
          subtitle={actionMenuSubtitle}
          title={title}
          visible={isActionDrawerOpen}
          onClose={() => setIsActionDrawerOpen(false)}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  swipeEdge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 24,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
    paddingBottom: Spacing.four,
  },
  headerChrome: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  headerButton: {
    minHeight: 42,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  headerSlotWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  subtitle: {
    maxWidth: 560,
  },
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
});
