import type { ReactNode } from 'react';
import { StyleSheet, type ViewProps } from 'react-native';

import { Spacing } from '../constants/theme';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';

export type SectionCardProps = ViewProps & {
  title: string;
  description?: string;
  footer?: ReactNode;
};

export function SectionCard({
  children,
  description,
  footer,
  style,
  title,
  ...props
}: SectionCardProps) {
  return (
    <ThemedView type="backgroundElement" style={[styles.card, style]} {...props}>
      <ThemedView style={styles.header}>
        <ThemedText type="smallBold">{title}</ThemedText>
        {description ? (
          <ThemedText type="small" themeColor="textSecondary">
            {description}
          </ThemedText>
        ) : null}
      </ThemedView>

      <ThemedView style={styles.body}>{children}</ThemedView>

      {footer ? <ThemedView style={styles.footer}>{footer}</ThemedView> : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.one,
  },
  body: {
    gap: Spacing.two,
  },
  footer: {
    gap: Spacing.two,
  },
});
