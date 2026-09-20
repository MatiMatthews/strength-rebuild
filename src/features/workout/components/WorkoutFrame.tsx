import { useCallback, useEffect, useRef, type PropsWithChildren, type ReactNode, type RefObject } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText, IconButton, Screen } from '@/design-system/v2.2/primitives';
import { borders, palette, spacing } from '@/design-system/v2.2/tokens';
import { useAppTheme } from '@/design-system/use-app-theme';
import { X } from 'lucide-react-native';

import { ExerciseProgressRail } from './ExerciseProgressRail';
import { AppMasthead, BottomCommandDock } from '@/design-system/v2.2/components';

type Props = PropsWithChildren<{ busy?: boolean; current: number; exerciseName: string; nextName?: string | undefined; onClose: () => void; onShowGuidance: () => void; total: number; commands: ReactNode; scrollRef?: RefObject<ScrollView | null> }>;

export function WorkoutFrame({ busy = false, children, commands, current, exerciseName, nextName, onClose, onShowGuidance, total, scrollRef }: Props) {
  const theme = useAppTheme();
  const fallbackScroll = useRef<ScrollView>(null);
  const contentScroll = scrollRef ?? fallbackScroll;
  const innerScroll = useRef<View>(null!);
  const keyboardFrame = useRef<number | undefined>(undefined);
  const revealFocusedInput = useCallback(() => {
    if (Platform.OS !== 'android' || !Keyboard.isVisible()) return;
    if (keyboardFrame.current !== undefined) cancelAnimationFrame(keyboardFrame.current);
    keyboardFrame.current = requestAnimationFrame(() => {
      const input = TextInput.State.currentlyFocusedInput();
      const inner = innerScroll.current;
      if (!input || !inner) return;
      // Measure the actual viewport after resize, excluding the fixed command dock.
      contentScroll.current?.getNativeScrollRef()?.measure((_x, _y, _width, viewportHeight) => {
        input.measureLayout(inner, (_left, top, _width, height) => {
          contentScroll.current?.scrollTo({ y: Math.max(0, top + height - viewportHeight + spacing.md), animated: false });
        }, () => undefined);
      });
    });
  }, [contentScroll]);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = Keyboard.addListener('keyboardDidShow', revealFocusedInput);
    return () => { subscription.remove(); if (keyboardFrame.current !== undefined) cancelAnimationFrame(keyboardFrame.current); };
  }, [revealFocusedInput]);
  return <Screen scrollRef={contentScroll} innerScrollRef={innerScroll} onScrollLayout={revealFocusedInput} testID="workout-screen" footer={<BottomCommandDock><View style={[styles.commandBar, { borderTopColor: theme.text }]} testID="workout-command-bar">{commands}</View></BottomCommandDock>}><View style={styles.content}>
    <AppMasthead role="task" command={<IconButton disabled={busy} accessibilityLabel="Cerrar entrenamiento" icon={X} onPress={onClose} />} context="GUARDADO AUTOMÁTICO" title="ENTRENAMIENTO" />
    <ExerciseProgressRail current={current} total={total} />
    <View style={[styles.header, { borderBottomColor: theme.text }]} testID="workout-exercise-header">
      <AppText color="muted" variant="caption">Ejercicio {current} de {total}</AppText>
      <Pressable disabled={busy} accessibilityState={{ disabled: busy }} accessibilityHint="Abre las instrucciones locales sin salir del entrenamiento" accessibilityLabel={`Ver instrucciones y guía del ejercicio ${exerciseName}`} accessibilityRole="button" onPress={onShowGuidance} style={styles.guideButton}>
        <AppText accessibilityRole="header" aria-level={2} variant="title">{exerciseName}</AppText>
      </Pressable>
      <AppText accessibilityLabel={nextName ? `Siguiente: ${nextName}` : 'Último ejercicio'} color="muted" variant="caption">{nextName ? `SIGUE · ${nextName}` : 'ÚLTIMO EJERCICIO'}</AppText>
    </View>
    {children}
  </View></Screen>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm },
  masthead: { alignItems: 'center', backgroundColor: palette.signal, flexDirection: 'row', gap: spacing.md, minHeight: 64, paddingHorizontal: spacing.md },
  mastheadLabel: { color: palette.ink },
  header: { borderBottomColor: palette.ink, borderBottomWidth: borders.emphasis, gap: spacing.xs, paddingVertical: spacing.lg },
  guideButton: { justifyContent: 'center', minHeight: 48 },
  commandBar: { borderTopColor: palette.ink, borderTopWidth: borders.emphasis, gap: spacing.md, paddingBottom: spacing.lg, paddingTop: spacing.md },
});
