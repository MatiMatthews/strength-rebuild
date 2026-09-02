import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { exerciseCatalog } from '@/data/seeds/exercises';

const poses: Readonly<Record<string, { body: string; equipment: string }>> = {
  'barbell-bench-press': { body: 'M35 62 L60 62 L72 48', equipment: 'M25 45 L82 45' },
  'incline-dumbbell-press': { body: 'M38 70 L60 52 L74 62', equipment: 'M27 42 L42 52 M72 42 L58 52' },
  'seated-dumbbell-press': { body: 'M50 70 L50 42 L35 28 M50 42 L66 28', equipment: 'M28 24 L40 24 M62 24 L74 24' },
  'strict-pull-up': { body: 'M50 35 L50 62 M50 42 L34 25 M50 42 L66 25', equipment: 'M22 20 L78 20' },
  'neutral-lat-pulldown': { body: 'M50 38 L50 67 M50 42 L32 25 M50 42 L68 25', equipment: 'M30 20 L70 20' },
  'chest-supported-row': { body: 'M34 48 L62 61 M45 53 L28 64 M45 53 L70 48', equipment: 'M28 70 L70 44' },
  'smith-box-squat': { body: 'M50 28 L50 52 L36 68 M50 52 L65 68', equipment: 'M24 18 L24 78 M76 18 L76 78 M24 34 L76 34' },
  'leg-extension': { body: 'M42 36 L42 58 L70 58', equipment: 'M28 32 L52 32 M28 32 L28 70' },
  'seated-leg-curl': { body: 'M40 34 L40 56 L62 56 L50 70', equipment: 'M26 30 L50 30 M26 30 L26 70' },
  'block-deadlift': { body: 'M50 28 L42 52 L62 68 M42 52 L28 66', equipment: 'M22 70 L78 70' },
  'dead-bug': { body: 'M35 62 L65 62 M45 60 L30 42 M55 60 L72 42', equipment: 'M18 72 L82 72' },
  'bird-dog': { body: 'M35 52 L62 52 M38 52 L22 38 M60 52 L78 38', equipment: 'M18 70 L82 70' },
  'bodyweight-activation': { body: 'M50 30 L50 54 M50 38 L32 48 M50 38 L68 48 M50 54 L38 72 M50 54 L66 66', equipment: 'M14 78 L86 78' },
  'thoracic-mobility': { body: 'M38 58 L62 58 M50 58 L50 38 M50 42 L72 28', equipment: 'M18 72 L82 72' },
  'hip-mobility': { body: 'M50 30 L50 52 M50 52 L32 68 M50 52 L72 56', equipment: 'M18 76 L82 76' },
  'shoulder-mobility': { body: 'M50 30 L50 60 M50 40 L26 24 M50 40 L74 24', equipment: 'M18 76 L82 76' },
  'low-volume-jump': { body: 'M50 28 L50 48 M50 38 L34 48 M50 38 L66 48 M50 48 L38 64 M50 48 L64 64', equipment: 'M22 76 L78 76 M30 69 L70 69' },
  'pallof-press': { body: 'M42 30 L42 58 M42 42 L72 42 M42 58 L30 72 M42 58 L56 72', equipment: 'M12 20 L12 72 M12 42 L72 42' },
  'session-review': { body: 'M42 34 L42 58 M42 58 L62 58 M62 58 L68 72', equipment: 'M28 58 L66 58 M28 58 L28 74 M76 24 L88 24 L88 66 L76 66' },
};

export function ImageDiagram({ exerciseId }: { exerciseId: string }) {
  const exercise = exerciseCatalog.find((item) => item.id === exerciseId);
  const pose = poses[exerciseId];
  if (!exercise || !pose) return <View accessibilityLiveRegion="assertive" accessibilityRole="alert"><Text>Guía local no disponible para {exerciseId}. No realices el ejercicio sin instrucciones.</Text></View>;
  return <Svg accessibilityLabel={`Ilustración local de ${exercise?.name ?? exerciseId}`} height={112} role="img" testID={`exercise-image-${exerciseId}`} viewBox="0 0 100 90" width="100%">
    <Rect fill="#EEF2F6" height="86" rx="10" width="96" x="2" y="2" />
    <Path d={pose.equipment} fill="none" stroke="#667085" strokeLinecap="round" strokeWidth="4" />
    <Circle cx="50" cy="22" fill="#F4C7A1" r="7" />
    <Path d={pose.body} fill="none" stroke="#175CD3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="6" />
    <Line stroke="#087E6D" strokeWidth="3" x1="12" x2="88" y1="80" y2="80" />
  </Svg>;
}
