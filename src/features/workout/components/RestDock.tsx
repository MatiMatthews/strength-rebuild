import { Pressable, View } from 'react-native';
import { Pause, Play, Plus, RotateCcw } from 'lucide-react-native';
import { AppText, IconButton, Panel } from '@/design-system/v2.2/primitives';
import { useAppTheme } from '@/design-system/use-app-theme';
import { spacing } from '@/design-system/v2.2/tokens';
import { addTime, pauseTimer, remainingSeconds, resetTimer, startTimer, type RestTimerState } from '@/features/timer/rest-timer';

/** Stable, non-obscuring frame for the persisted rest-timer instrument. */
export function RestDock({ timer, now, onChange }: { timer: RestTimerState; now: number; onChange: (timer: RestTimerState) => void }) {
  const theme = useAppTheme();
  const seconds = remainingSeconds(timer, now || timer.runningSince || 0);
  return <View testID="rest-dock"><Panel>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm }}>
      <View><AppText color="muted" variant="caption">DESCANSO</AppText><AppText accessibilityLabel={`Temporizador ${seconds} segundos`} style={{ fontVariant: ['tabular-nums'] }} variant="title">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</AppText></View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {timer.runningSince === null
          ? <IconButton accessibilityLabel="Iniciar temporizador" icon={Play} onPress={() => onChange(startTimer(seconds || 90, Date.now()))} />
          : <IconButton accessibilityLabel="Pausar temporizador" icon={Pause} onPress={() => onChange(pauseTimer(timer, Date.now()))} />}
        <IconButton accessibilityLabel="Añadir 30 segundos" icon={Plus} onPress={() => onChange(addTime(timer, 30, Date.now()))} />
        <IconButton accessibilityLabel="Reiniciar temporizador" icon={RotateCcw} onPress={() => onChange(resetTimer())} />
      </View>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{[60, 90, 120].map(preset => <Pressable key={preset} accessibilityLabel={`Descanso ${preset} segundos`} accessibilityRole="button" onPress={() => onChange(startTimer(preset, Date.now()))}
      style={({ pressed }) => ({ minHeight: 48, minWidth: 64, alignItems: 'center', justifyContent: 'center', borderColor: theme.textMuted, borderWidth: pressed ? 2 : 1, backgroundColor: theme.surface })}><AppText>{preset}s</AppText></Pressable>)}</View>
  </Panel></View>;
}
