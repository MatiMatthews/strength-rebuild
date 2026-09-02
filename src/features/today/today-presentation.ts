import type { TodayData } from '@/application/programs/program-service';

import type { TodayState } from './today-state';

type BlockRole = Exclude<NonNullable<TodayData['session']['blocks']>[number]['role'], 'finish-review'>;
type Exercise = TodayData['session']['exercises'][number];

export interface TodayPresentationRow {
  readonly blockRole: BlockRole | null;
  readonly exerciseId: string;
  readonly sequence: number;
  readonly sets: number;
  readonly reps: { readonly min: number; readonly max: number };
  readonly rir: { readonly min: number; readonly max: number };
  readonly load: number | null;
  readonly loadLabel: string;
  readonly loadProvenance: string;
}

interface ActiveTodayPresentation {
  readonly kind: 'active' | 'restriction' | 'resume';
  readonly sessionTitle: string;
  readonly cycleLabel: string;
  readonly metricLabel: string;
  readonly metrics: { readonly exerciseCount: number; readonly setCount: number; readonly durationMinutes: number | null };
  readonly rows: readonly TodayPresentationRow[];
}

export type TodayPresentation = ActiveTodayPresentation
  | { readonly kind: 'empty'; readonly title: string }
  | { readonly kind: 'review-required'; readonly title: string }
  | { readonly kind: 'no-workout'; readonly title: string; readonly nextSessionLabel: string };

const cycleNames: Record<TodayData['cycleType'], string> = {
  hypertrophy: 'Hipertrofia', strength: 'Fuerza', power: 'Potencia', transition: 'Transición', reentry: 'Reentrada',
};

function readableExercise(exerciseId: string): string {
  return exerciseId.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function canonicalExercises(session: TodayData['session']): readonly { exercise: Exercise; blockRole: BlockRole | null }[] {
  if (!session.blocks) {
    return session.exercises.map((exercise) => ({
      exercise,
      blockRole: exercise.blockRole ?? null,
    }));
  }
  const projected: { exercise: Exercise; blockRole: BlockRole }[] = [];
  for (const block of session.blocks) {
    if (block.role === 'finish-review') continue;
    const blockRole: BlockRole = block.role;
    projected.push(...block.exercises.map((exercise) => ({ exercise, blockRole })));
  }
  return projected;
}

function prescribedLoad(exercise: Exercise): Pick<TodayPresentationRow, 'load' | 'loadLabel' | 'loadProvenance'> {
  const legacyTarget = exercise.target as Exercise['target'] & { readonly load?: number };
  const load = exercise.calculatedLoad ?? legacyTarget.load ?? null;
  if (load === null) return { load: null, loadLabel: 'Sin carga prescrita', loadProvenance: 'No disponible' };
  return {
    load,
    loadLabel: String(load),
    loadProvenance: exercise.loadProvenance ?? (exercise.calculatedLoad === undefined ? 'Carga prescrita' : 'Carga calculada'),
  };
}

function activePresentation(state: Extract<TodayState, { data: TodayData }>): ActiveTodayPresentation {
  const { data } = state;
  const projected = canonicalExercises(data.session);
  const rows = projected.map(({ exercise, blockRole }, index): TodayPresentationRow => ({
    blockRole,
    exerciseId: exercise.exerciseId,
    sequence: index + 1,
    sets: exercise.target.sets,
    reps: exercise.target.reps,
    rir: exercise.target.rir,
    ...prescribedLoad(exercise),
  }));
  const setCount = rows.reduce((total, row) => total + row.sets, 0);
  const intent = rows.filter(({ blockRole }) => blockRole === 'primary' || blockRole === 'accessory').slice(0, 2);
  const duration = (data.session as TodayData['session'] & { readonly estimatedDurationMinutes?: number }).estimatedDurationMinutes;
  const durationMinutes = typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : null;
  const countLabel = `${rows.length} ${rows.length === 1 ? 'ejercicio' : 'ejercicios'} · ${setCount} series`;
  return {
    kind: state.kind === 'planned' ? 'active' : state.kind,
    sessionTitle: intent.length > 0 ? intent.map(({ exerciseId }) => readableExercise(exerciseId)).join(' + ') : `Sesión de ${cycleNames[data.cycleType]}`,
    cycleLabel: `${cycleNames[data.cycleType]} · Semana ${data.weekIndex} · Día ${data.dayIndex}`,
    metricLabel: durationMinutes === null ? countLabel : `${countLabel} · ${durationMinutes} min`,
    metrics: { exerciseCount: rows.length, setCount, durationMinutes },
    rows,
  };
}

export function presentToday(state: TodayState): TodayPresentation {
  if ('data' in state) return activePresentation(state);
  if (state.kind === 'review-required') return { kind: state.kind, title: 'Revisión requerida antes de entrenar' };
  if (state.kind === 'no-workout') return { kind: state.kind, title: 'Hoy no hay entrenamiento', nextSessionLabel: state.nextSessionLabel };
  return { kind: 'empty', title: 'Todavía no hay un plan activo' };
}
