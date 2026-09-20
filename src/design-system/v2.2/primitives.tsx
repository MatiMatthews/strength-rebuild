import { X, type LucideIcon } from 'lucide-react-native';
import { createContext } from 'react';
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
    danger: theme.dangerText,
    default: theme.text,
    inverse: palette.white,
    muted: theme.textMuted,
  }[color];

  return (
    <Text
      allowFontScaling
      style={[typography[variant] as TextStyle, { color: textColor }, style]}
      {...props}
    >
      {children}
    </Text>
  );
}

export const ScreenContentInset = createContext(0);

type ScreenProps = PropsWithChildren<{
  footer?: ReactNode;
  scroll?: boolean;
  scrollRef?: RefObject<ScrollView | null>;
  innerScrollRef?: RefObject<View>;
  onScrollLayout?: () => void;
  testID?: string;
}>;

export function Screen({ children, footer, scroll = true, scrollRef, innerScrollRef, onScrollLayout, testID }: ScreenProps) {
  const theme = useAppTheme();
  const content = (
    <View style={styles.content} testID={testID}>
      <ScreenContentInset.Provider value={spacing.lg}>{children}</ScreenContentInset.Provider>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} role="main" style={[styles.safeArea, { backgroundColor: theme.canvas }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          ref={scrollRef}
          innerViewRef={innerScrollRef}
          onLayout={onScrollLayout}
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
  tone?: 'default' | 'command';
};

export function IconButton({ accessibilityLabel, disabled = false, icon: Icon, onPress, selected, tone = 'default' }: IconButtonProps) {
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
          backgroundColor: selected ? palette.strengthSoft : tone === 'command' ? palette.ink : theme.surfaceMuted,
          borderColor: selected ? palette.strength : tone === 'command' ? theme.text : theme.textMuted,
          opacity: 1,
          ...(pressed && !disabled ? { borderColor: theme.text, borderWidth: 2 } : {}),
        },
      ]}
    >
      <Icon color={selected ? palette.strength : disabled ? theme.textMuted : tone === 'command' ? palette.paper : theme.text} size={22} strokeWidth={2.2} />
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
  tone?: 'primary' | 'secondary' | 'danger' | 'command';
  busy?: boolean;
  disabled?: boolean;
}>;

export function ActionButton({
  accessibilityLabel,
  accessibilityRole = 'button',
  checked,
  busy = false,
  children,
  disabled = false,
  icon: Icon,
  onPress,
  onPressIn,
  tone = 'primary',
}: ActionButtonProps) {
  const theme = useAppTheme();
  disabled = disabled || busy;
  const backgroundColor =
    disabled ? theme.surfaceMuted : (tone === 'primary' || tone === 'command') ? palette.strength : tone === 'danger' ? palette.stopSoft : theme.surface;
  const borderColor = disabled ? theme.textMuted : (tone === 'primary' || tone === 'command') ? theme.text : tone === 'danger' ? theme.dangerText : theme.textMuted;
  const textColor = disabled ? theme.textMuted : tone === 'command' ? palette.paper : tone === 'primary' ? palette.white : tone === 'danger' ? palette.stop : theme.text;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ busy, checked, disabled }}
      aria-busy={busy}
      disabled={disabled}
      onPress={onPress}
      onPressIn={onPressIn}
      style={({ pressed }) => [
        styles.actionButton,
        { backgroundColor, borderColor, opacity: 1, borderWidth: pressed && !disabled ? 2 : 1 },
      ]}
    >
      {Icon ? <Icon color={textColor} size={20} strokeWidth={2.3} /> : null}
      <AppText style={{ color: textColor, flexShrink: 1, textAlign: 'center' }} variant="bodyStrong">
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
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: Math.round(normalized * 100) }}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(normalized * 100)}
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
  unit?: string;
  presentation?: 'standard' | 'training';
};

export function TextField({ error, label, style, editable = true, unit, presentation = 'standard', ...props }: TextFieldProps) {
  const theme = useAppTheme();
  return (
    <View style={styles.fieldGroup}>
      <AppText variant="label">{label}</AppText>
      <View style={presentation === 'training' ? [styles.fieldInstrument, { backgroundColor: editable ? theme.surface : theme.surfaceMuted, borderColor: error ? theme.dangerText : theme.textMuted }] : undefined}>
      <TextInput
        accessibilityLabel={label}
        allowFontScaling
        placeholderTextColor={theme.textMuted}
        editable={editable}
        style={[
          presentation === 'training' ? styles.fieldInput : styles.textField,
          { backgroundColor: editable ? theme.surface : theme.surfaceMuted, borderColor: error ? theme.dangerText : theme.textMuted, color: editable ? theme.text : theme.textMuted },
          style,
        ]}
        {...props}
      />
      {unit ? <AppText color="muted" variant="label">{unit}</AppText> : null}
      </View>
      {error ? <AppText accessibilityRole="alert" color="danger" variant="caption">{error}</AppText> : null}
    </View>
  );
}

export function FeedbackBanner({ message, tone = 'success' }: { message: string; tone?: 'success' | 'caution' | 'danger' }) {
  const danger = tone === 'danger';
  const caution = tone === 'caution';
  const backgroundColor = danger ? palette.stopSoft : caution ? palette.transitionSoft : palette.successSoft;
  const borderColor = danger ? palette.stop : caution ? palette.transition : palette.success;
  const textColor = danger ? palette.stop : caution ? palette.transition : palette.success;
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
  closeLabel?: string;
}>;

export function AppSheet({ children, onDismiss, title, visible, closeLabel }: AppSheetProps) {
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
            <AppText accessibilityRole="header" style={{ flex: 1, minWidth: 0 }} variant="heading">{title}</AppText>
            {closeLabel ? <ActionButton tone="command" onPress={onDismiss}>{closeLabel}</ActionButton> : <IconButton accessibilityLabel={`Cerrar ${title}`} icon={X} onPress={onDismiss} />}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function ChoiceControl({ accessibilityLabel, label, onPress, selected, busy = false, disabled = false }: { accessibilityLabel?: string; label: string; onPress: () => void; selected: boolean; busy?: boolean; disabled?: boolean }) {
  const theme = useAppTheme();
  const unavailable = disabled || busy;
  const backgroundColor = selected ? palette.signal : unavailable ? theme.surfaceMuted : theme.surface;
  const foreground = selected ? palette.ink : unavailable ? theme.textMuted : theme.text;
  return <Pressable accessibilityLabel={accessibilityLabel ?? label} accessibilityRole="radio" accessibilityState={{ checked: selected, busy, disabled: unavailable }} aria-checked={selected} aria-busy={busy} disabled={unavailable} onPress={onPress} style={({ pressed }) => [styles.choice, { backgroundColor, borderColor: selected ? palette.ink : theme.textMuted, borderWidth: pressed && !unavailable ? 2 : 1 }]}><View style={[styles.choiceMark, { borderColor: foreground, backgroundColor: selected ? foreground : backgroundColor }]} /><Text style={[styles.label, { color: foreground, flexShrink: 1 }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  choice: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, minHeight: 56, padding: spacing.md },
  choiceMark: { borderWidth: 2, height: 20, width: 20, flexShrink: 0 },
  label: { ...typography.label },
  actionButton: {
    alignItems: 'center',
    borderRadius: radii.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  content: {
    alignSelf: 'center',
    gap: spacing.xxl,
    maxWidth: 800,
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
    flexShrink: 0,
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
    gap: spacing.md,
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
  fieldInstrument: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', minHeight: 48, paddingHorizontal: spacing.md },
  fieldInput: { ...typography.body, flex: 1, minWidth: 0, minHeight: 48 },
  textField: {
    fontFamily: typography.body.fontFamily,
    borderRadius: radii.control,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
