import {
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Spacing } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';

export type FeatureTileProps = Omit<PressableProps, 'style'> & {
  eyebrow?: string;
  title: string;
  description: string;
  style?: StyleProp<ViewStyle>;
};

export function FeatureTile({ description, eyebrow, style, title, ...props }: FeatureTileProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.pressable,
        {
          borderColor: theme.border,
          opacity: pressed ? 0.82 : 1,
        },
        style,
      ]}
      {...props}
    >
      <ThemedView style={styles.inner}>
        {eyebrow ? (
          <ThemedText type="smallBold" themeColor="tint" style={styles.eyebrow}>
            {eyebrow}
          </ThemedText>
        ) : null}
        <ThemedText>{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {description}
        </ThemedText>
        <View style={styles.arrowRow}>
          <ThemedText type="smallBold" themeColor="tint">
            Open
          </ThemedText>
        </View>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minHeight: 132,
    borderWidth: 1,
    borderRadius: Spacing.four,
    flexBasis: '48%',
    flexGrow: 1,
    flexShrink: 1,
  },
  inner: {
    flex: 1,
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  arrowRow: {
    marginTop: 'auto',
    paddingTop: Spacing.two,
  },
});
