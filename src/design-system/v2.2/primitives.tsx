import { X, type LucideIcon } from 'lucide-react-native';
import type { PropsWithChildren, ReactNode, RefObject } from 'react';
import {
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, radii, spacing, typography } from './tokens';
import { useAppTheme } from '../use-app-theme';
import { useMotionPolicy } from './use-motion-policy';

type TextVariant = keyof typeof typography;

type AppTextProps = TextProps & {
  color?: 'default' | 'muted' | 'inverse' | 'accent' | 'danger';
  variant?: TextVariant;
};

export function AppText({
  children,
  color = 'default',
  style,
  variant = 'body',
  ...props
}: AppTextProps) {
  const theme = useAppTheme();
  const textColor = {
    accent: theme.accent,
    danger: palette.stop,
    default: theme.text,
    inverse: palette.white,
    muted: theme.textMuted,
  }[color];

  return (
    <Text
      allowFontScaling
      maxFontSizeMultiplier={1.4}
      style={[typography[variant] as TextStyle, { color: textColor }, style]}
      {...props}
    >
      {children}
    </Text>
  );
}

type ScreenProps = PropsWithChildren<{
  footer?: ReactNode;
  scroll?: boolean;
  scrollRef?: RefObject<ScrollView | null>;
  testID?: string;
}>;

export function Screen({ children, footer, scroll = true, scrollRef, testID }: ScreenProps) {
  const theme = useAppTheme();
  const content = (
    <View style={styles.content} testID={testID}>
      {children}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} role="main" style={[styles.safeArea, { backgroundColor: theme.canvas }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
      {footer}
    </SafeAreaView>
  );
}

type IconButtonProps = {
  accessibilityLabel: string;
  icon: LucideIcon;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
};

export function IconButton({ accessibilityLabel, disabled = false, icon: Icon, onPress, selected }: IconButtonProps) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: selected ? palette.strengthSoft : theme.surfaceMuted,
          borderColor: selected ? palette.strength : theme.border,
          opacity: disabled ? 0.4 : pressed ? 0.72 : 1,
        },
      ]}
    >
      <Icon color={selected ? palette.strength : theme.text} size={22} strokeWidth={2.2} />
    </Pressable>
  );
}

type ActionButtonProps = PropsWithChildren<{
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'radio';
  checked?: boolean;
  icon?: LucideIcon;
  onPress: () => void;
  onPressIn?: () => void;
  tone?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}>;

export function ActionButton({
  accessibilityLabel,
  accessibilityRole = 'button',
  checked,
  children,
  disabled = false,
  icon: Icon,
  onPress,
  onPressIn,
  tone = 'primary',
}: ActionButtonProps) {
  const theme = useAppTheme();
  const backgroundColor =
    tone === 'primary' ? palette.strength : tone === 'danger' ? palette.stopSoft : theme.surface;
  const borderColor = tone === 'primary' ? palette.strength : tone === 'danger' ? palette.stop : theme.border;
  const textColor = tone === 'primary' ? palette.white : tone === 'danger' ? palette.stop : theme.text;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={onPressIn}
      style={({ pressed }) => [
        styles.actionButton,
        { backgroundColor, borderColor, opacity: disabled ? 0.45 : pressed ? 0.78 : 1 },
      ]}
    >
      {Icon ? <Icon color={textColor} size={20} strokeWidth={2.3} /> : null}
      <AppText style={{ color: textColor }} variant="bodyStrong">
        {children}
      </AppText>
    </Pressable>
  );
}

type PanelProps = PropsWithChildren<{
  accent?: string;
  style?: ViewStyle;
}>;

export function Panel({ accent, children, style }: PanelProps) {
  const theme = useAppTheme();
  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: theme.surface, borderColor: theme.border },
        accent ? { borderLeftColor: accent, borderLeftWidth: 4 } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

type TagProps = PropsWithChildren<{
  backgroundColor?: string;
  color?: string;
}>;

export function Tag({ backgroundColor = palette.strengthSoft, children, color = palette.strength }: TagProps) {
  return (
    <View style={[styles.tag, { backgroundColor }]}>
      <AppText style={{ color }} variant="caption">
        {children}
      </AppText>
    </View>
  );
}

export function ProgressBar({ accessibilityLabel, progress }: { accessibilityLabel: string; progress: number }) {
  const theme = useAppTheme();
  const normalized = Math.max(0, Math.min(1, progress));
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: Math.round(normalized * 100) }}
      style={[styles.progressTrack, { backgroundColor: theme.border }]}
    >
      <View style={[styles.progressFill, { width: `${normalized * 100}%` }]} />
    </View>
  );
}

export function Divider() {
  const theme = useAppTheme();
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

type TextFieldProps = TextInputProps & {
  error?: string;
  label: string;
};

export function TextField({ error, label, style, ...props }: TextFieldProps) {
  const theme = useAppTheme();
  return (
    <View style={styles.fieldGroup}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        allowFontScaling
        placeholderTextColor={theme.textMuted}
        style={[
          styles.textField,
          { backgroundColor: theme.surface, borderColor: error ? palette.stop : theme.border, color: theme.text },
          style,
        ]}
        {...props}
      />
      {error ? <AppText accessibilityRole="alert" color="danger" variant="caption">{error}</AppText> : null}
    </View>
  );
}

export function FeedbackBanner({ message, tone = 'success' }: { message: string; tone?: 'success' | 'caution' | 'danger' }) {
  const theme = useAppTheme();
  const danger = tone === 'danger';
  const caution = tone === 'caution';
  const backgroundColor = danger ? palette.stopSoft : caution ? palette.transitionSoft : palette.successSoft;
  const borderColor = danger ? palette.stop : caution ? palette.transition : palette.success;
  const textColor = danger ? palette.stop : caution ? palette.transition : theme.dark ? theme.text : palette.success;
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        styles.feedback,
        {
          backgroundColor,
          borderColor,
        },
      ]}
    >
      <AppText style={{ color: textColor }} variant="bodyStrong">
        {message}
      </AppText>
    </View>
  );
}

type AppSheetProps = PropsWithChildren<{
  onDismiss: () => void;
  title: string;
  visible: boolean;
}>;

export function AppSheet({ children, onDismiss, title, visible }: AppSheetProps) {
  const theme = useAppTheme();
  const { reducedMotion } = useMotionPolicy();
  return (
    <Modal animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={onDismiss} role="dialog" transparent visible={visible}>
      <View style={[styles.sheetOverlay, { backgroundColor: theme.overlay }]}>
        <View
          accessible
          accessibilityLabel={title}
          accessibilityViewIsModal
          role="dialog"
          style={[styles.sheet, { backgroundColor: theme.surface }]}
        >
          <View style={styles.sheetHeader}>
            <AppText variant="heading">{title}</AppText>
            <IconButton accessibilityLabel={`Cerrar ${title}`} icon={X} onPress={onDismiss} />
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    borderRadius: radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  content: {
    alignSelf: 'center',
    gap: spacing.xxl,
    maxWidth: 520,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    width: '100%',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  feedback: {
    borderLeftWidth: 4,
    borderRadius: radii.control,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: radii.control,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  panel: {
    borderRadius: radii.structural,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  progressFill: {
    backgroundColor: palette.strength,
    borderRadius: radii.control,
    height: 8,
  },
  progressTrack: {
    borderRadius: radii.control,
    height: 8,
    overflow: 'hidden',
    width: '100%',
  },
  safeArea: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: radii.tool,
    borderTopRightRadius: radii.tool,
    gap: spacing.lg,
    maxHeight: '90%',
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    width: '100%',
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: spacing.sm,
  },
  tag: {
    alignSelf: 'flex-start',
    borderRadius: radii.control,
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  textField: {
    borderRadius: radii.control,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
