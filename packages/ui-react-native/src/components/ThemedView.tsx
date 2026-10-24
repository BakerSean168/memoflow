import { View, type ViewProps } from 'react-native';

import { type ThemeColor } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

export type ThemedViewProps = ViewProps & {
  type?: ThemeColor;
};

export function ThemedView({ style, type, ...otherProps }: ThemedViewProps) {
  const theme = useTheme();

  return <View style={[type ? { backgroundColor: theme[type] } : null, style]} {...otherProps} />;
}
