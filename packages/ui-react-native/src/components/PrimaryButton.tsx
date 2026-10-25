import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Spacing } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { ThemedText } from './ThemedText';

type PrimaryButtonVariant = 'solid' | 'secondary' | 'ghost';

export type PrimaryButtonProps = PressableProps & {
  label: string;
  variant?: PrimaryButtonVariant;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({
  disabled,
  fullWidth,
  label,
  style,
  variant = 'solid',
  ...props
}: PrimaryButtonProps) {
  const theme = useTheme();

  const backgroundColor =
    variant === 'solid'
      ? theme.tint
      : variant === 'secondary'
        ? theme.backgroundElement
        : 'transparent';

  const borderColor = variant === 'ghost' ? 'transparent' : theme.border;
  const labelColor = variant === 'solid' ? '#FFFFFF' : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        {
          backgroundColor,
          borderColor,
          opacity: disabled ? 0.45 : pressed ? 0.78 : 1,
        },
        style,
      ]}
      {...props}
    >
      <ThemedText type="smallBold" style={[styles.label, { color: labelColor }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  label: {
    textAlign: 'center',
  },
});
