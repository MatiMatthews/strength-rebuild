import { View } from 'react-native';
import { Pause, Play, Plus, SkipForward } from 'lucide-react-native';
import { AppText, IconButton } from '@/design-system/v2.2/primitives';
import { spacing } from '@/design-system/v2.2/tokens';
import { addTime, pauseTimer, remainingSeconds, resetTimer, startTimer, type RestTimerState } from '@/features/timer/rest-timer';

export function MiniRestTimer({ timer, now, onChange }: { timer: RestTimerState; now: number; onChange(timer: RestTimerState): void }) {
  const seconds = remainingSeconds(timer, now);
  if (seconds <= 0) return null;
  return <View testID="mini-rest-timer" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs }}>
    <AppText accessibilityLabel={`Descanso ${seconds} segundos${timer.runningSince === null ? ', pausado' : ''}`} variant="bodyStrong" style={{ flex: 1, fontVariant: ['tabular-nums'] }}>Descanso {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</AppText>
    <IconButton accessibilityLabel={timer.runningSince === null ? 'Continuar descanso' : 'Pausar descanso'} icon={timer.runningSince === null ? Play : Pause} onPress={() => onChange(timer.runningSince === null ? startTimer(seconds, Date.now()) : pauseTimer(timer, Date.now()))} />
    <IconButton accessibilityLabel="Añadir 30 segundos al descanso" icon={Plus} onPress={() => onChange(addTime(timer, 30, Date.now()))} />
    <IconButton accessibilityLabel="Omitir descanso" icon={SkipForward} onPress={() => onChange(resetTimer())} />
  </View>;
}
