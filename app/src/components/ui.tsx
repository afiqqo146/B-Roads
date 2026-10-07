import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, radius } from '../lib/theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'premium';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  icon?: string;
}) {
  const bg = { primary: colors.accent, secondary: colors.cardRaised, danger: colors.danger, premium: colors.premium }[variant];
  const fg = variant === 'secondary' ? colors.text : colors.accentText;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }]}>{icon ? `${icon}  ${title}` : title}</Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={[styles.input, style]} {...rest} />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

export const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  input: {
    backgroundColor: colors.cardRaised,
    color: colors.text,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, gap: 12 },
  error: { color: colors.danger, fontSize: 14 },
  screen: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 28, fontWeight: '800' },
  h2: { color: colors.text, fontSize: 20, fontWeight: '700' },
  body: { color: colors.text, fontSize: 16 },
  muted: { color: colors.muted, fontSize: 14 },
});
