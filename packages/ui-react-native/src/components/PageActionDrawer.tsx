import { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Spacing } from '../constants/theme';
import { PrimaryButton } from './PrimaryButton';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';

export type PageActionItem = {
  label: string;
  description?: string;
  disabled?: boolean;
  onPress?: () => void;
};

export type PageActionSection = {
  title: string;
  description?: string;
  items: PageActionItem[];
};

export type PageActionDrawerProps = {
  closeLabel?: string;
  sections: PageActionSection[];
  title?: string;
  subtitle?: string;
  visible: boolean;
  onClose: () => void;
};

const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.84, 360);

export function PageActionDrawer({
  closeLabel = 'Close',
  sections,
  subtitle,
  title = 'Page menu',
  visible,
  onClose,
}: PageActionDrawerProps) {
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const hasItems = useMemo(
    () => sections.some((section) => section.items.some((item) => !item.disabled)),
    [sections],
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [overlayOpacity, translateX, visible]);

  function handleClose(callback?: () => void) {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: -DRAWER_WIDTH,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        onClose();
        callback?.();
      }
    });
  }

  function handleSelect(item: PageActionItem) {
    if (item.disabled) {
      return;
    }

    handleClose(() => item.onPress?.());
  }

  if (!visible) {
    return null;
  }

  return (
    <Modal animationType="none" onRequestClose={() => handleClose()} transparent visible>
      <View style={styles.modalRoot}>
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => handleClose()} />
        </Animated.View>

        <Animated.View style={[styles.drawerWrap, { transform: [{ translateX }] }]}>
          <ThemedView type="backgroundElement" style={styles.drawer}>
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <ThemedText type="smallBold">{title}</ThemedText>
                {subtitle ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {subtitle}
                  </ThemedText>
                ) : null}
              </View>
              <PrimaryButton label={closeLabel} onPress={() => handleClose()} variant="ghost" />
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              {sections.map((section) => (
                <View key={section.title} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <ThemedText type="smallBold">{section.title}</ThemedText>
                    {section.description ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {section.description}
                      </ThemedText>
                    ) : null}
                  </View>

                  <View style={styles.itemList}>
                    {section.items.length > 0 ? (
                      section.items.map((item) => (
                        <Pressable
                          key={`${section.title}-${item.label}`}
                          accessibilityRole="button"
                          disabled={item.disabled}
                          onPress={() => handleSelect(item)}
                          style={({ pressed }) => [
                            styles.itemPressable,
                            item.disabled && styles.itemDisabled,
                            pressed && !item.disabled ? styles.itemPressed : null,
                          ]}
                        >
                          <ThemedView type="backgroundSelected" style={styles.itemCard}>
                            <ThemedText type="smallBold">{item.label}</ThemedText>
                            {item.description ? (
                              <ThemedText type="small" themeColor="textSecondary">
                                {item.description}
                              </ThemedText>
                            ) : null}
                          </ThemedView>
                        </Pressable>
                      ))
                    ) : (
                      <ThemedText type="small" themeColor="textSecondary">
                        No actions available.
                      </ThemedText>
                    )}
                  </View>
                </View>
              ))}

              {!hasItems ? (
                <ThemedText type="small" themeColor="textSecondary">
                  This page does not expose any quick actions yet.
                </ThemedText>
              ) : null}
            </ScrollView>
          </ThemedView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 20, 28, 0.36)',
  },
  drawerWrap: {
    width: DRAWER_WIDTH,
    maxWidth: '100%',
    height: '100%',
  },
  drawer: {
    flex: 1,
    paddingTop: Spacing.five,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  headerCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  content: {
    gap: Spacing.three,
    paddingBottom: Spacing.five,
  },
  section: {
    gap: Spacing.two,
  },
  sectionHeader: {
    gap: Spacing.half,
  },
  itemList: {
    gap: Spacing.two,
  },
  itemPressable: {
    borderRadius: Spacing.three,
  },
  itemPressed: {
    opacity: 0.82,
  },
  itemDisabled: {
    opacity: 0.45,
  },
  itemCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
});
