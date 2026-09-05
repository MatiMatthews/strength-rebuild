import { exerciseCatalog } from '../../data/seeds/exercises';
import { resolveCatalogRequirements } from './catalog-requirements';

export const PRESCRIPTION_POLICY_VERSION = 'cycle-prescription-v1';

export type CyclePrescriptionType = 'hypertrophy' | 'strength' | 'power' | 'transition' | 'reentry';

export interface CyclePrescriptionRequest {
  readonly id: string;
  readonly type: CyclePrescriptionType;
  readonly weeks: number;
  readonly profile?: {
    readonly units: 'kg' | 'lb';
    readonly benchPressReference: number;
    readonly deadliftReference: number;
    readonly backSquatReference: number;
    readonly strictPullUpCapacity: number;
    readonly availableIncrement: number;
  };
  readonly equipment?: readonly string[];
  readonly schedule?: readonly number[];
  readonly requirements?: readonly {
    readonly kind: 'EXACT' | 'PATTERN' | 'CAPABILITY';
    readonly value: string;
  }[];
  readonly restrictions?: readonly string[] | { readonly lumbar?: boolean; readonly abdominal?: boolean };
}

interface Range {
  readonly min: number;
  readonly max: number;
}

interface ExerciseTarget {
  readonly sets: number;
  readonly reps: Range;
  readonly rir: Range;
  readonly loadPercent: Range | null;
}

interface ExercisePrescription {
  /** Role retained by the compatibility projection in `session.exercises`. */
  readonly blockRole?: Exclude<NonNullable<SessionPrescription['blocks']>[number]['role'], 'finish-review'>;
  readonly exerciseId: string;
  readonly requirement: 'EXACT' | 'PATTERN' | 'CAPABILITY';
  readonly target: ExerciseTarget;
  readonly qualityStops: readonly string[];
  readonly loadProvenance?: string;
  readonly calculatedLoad?: number;
  readonly lumbarDemand?: 'low' | 'moderate' | 'high';
  readonly braceDemand?: 'low' | 'moderate' | 'high';
  readonly plyometric?: boolean;
  readonly power?: boolean;
}

interface SessionPrescription {
  readonly dayIndex: number;
  readonly day?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  readonly blocks?: readonly {
    readonly role: 'activation' | 'mobility' | 'power-primer' | 'primary' | 'accessory' | 'core' | 'finish-review';
    readonly exercises: readonly ExercisePrescription[];
  }[];
  readonly exercises: readonly ExercisePrescription[];
}

interface WeekPrescription {
  readonly index: number;
  readonly sessions: readonly SessionPrescription[];
}

export interface CyclePrescriptionSnapshot {
  readonly schemaVersion: 1;
  readonly policyVersion: typeof PRESCRIPTION_POLICY_VERSION;
  readonly id: string;
  readonly type: CyclePrescriptionType;
  readonly weeks: readonly WeekPrescription[];
}

const profileByType: Readonly<Record<CyclePrescriptionType, ExerciseTarget>> = {
  hypertrophy: { sets: 3, reps: { min: 6, max: 15 }, rir: { min: 2, max: 3 }, loadPercent: null },
  strength: { sets: 3, reps: { min: 3, max: 6 }, rir: { min: 2, max: 3 }, loadPercent: { min: 75, max: 85 } },
  power: { sets: 3, reps: { min: 2, max: 5 }, rir: { min: 3, max: 5 }, loadPercent: null },
  transition: { sets: 2, reps: { min: 5, max: 10 }, rir: { min: 4, max: 5 }, loadPercent: null },
  reentry: { sets: 2, reps: { min: 5, max: 10 }, rir: { min: 4, max: 5 }, loadPercent: null },
};

const weekDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const dayWork = [
  { primary: ['barbell-bench-press', 'EXACT'], accessory: ['seated-leg-curl', 'PATTERN'], core: ['dead-bug', 'CAPABILITY'] },
  { primary: ['smith-box-squat', 'EXACT'], accessory: ['chest-supported-row', 'PATTERN'], core: ['pallof-press', 'CAPABILITY'] },
  { primary: ['seated-dumbbell-press', 'PATTERN'], accessory: ['strict-pull-up', 'EXACT'], core: ['bird-dog', 'CAPABILITY'] },
] as const;

const loadingTypes = new Set<CyclePrescriptionType>(['hypertrophy', 'strength', 'power']);

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function validateRequest(request: CyclePrescriptionRequest): void {
  if (request.id.trim().length === 0) throw new Error('Prescription id must not be empty');
  if (!Number.isInteger(request.weeks) || request.weeks < 1) throw new Error('Prescription weeks must be a positive integer');
  if (request.type === 'transition' && request.weeks !== 1) throw new Error('Transition prescriptions must be exactly one week');
  if (request.schedule && (request.schedule.length !== 3 || new Set(request.schedule).size !== 3
    || request.schedule.some((day) => !Number.isInteger(day) || day < 1 || day > 7))) {
    throw new Error('Prescription schedule must contain three distinct weekdays');
  }
  if (request.equipment && request.equipment.length === 0) throw new Error('Prescription equipment must not be empty');
}

function qualityStops(type: CyclePrescriptionType): readonly string[] {
  if (type === 'power') return ['STOP_ON_SPEED_LOSS', 'STOP_ON_TECHNIQUE_LOSS'];
  if (type === 'transition' || type === 'reentry') {
    return ['NO_FAILURE', 'NO_PERSONAL_RECORD', 'NO_NEW_COMPLEX_EXERCISE', 'NO_DEMANDING_PLYOMETRICS'];
  }
  return ['STOP_ON_TECHNIQUE_LOSS'];
}

export function generatePrescription(request: CyclePrescriptionRequest): CyclePrescriptionSnapshot {
  validateRequest(request);
  const resolvedRequirements = resolveCatalogRequirements(request);
  const target = profileByType[request.type];
  const weeks = Array.from({ length: request.weeks }, (_, weekIndex) => ({
    index: weekIndex + 1,
    sessions: (request.schedule ?? [1, 3, 5]).map((scheduledDay, dayIndex) => {
      const restrictionInput = request.restrictions;
      const restricted = Array.isArray(restrictionInput)
        ? restrictionInput.length > 0
        : Boolean((restrictionInput as { readonly lumbar?: boolean; readonly abdominal?: boolean } | undefined)?.lumbar
          || (restrictionInput as { readonly lumbar?: boolean; readonly abdominal?: boolean } | undefined)?.abdominal);
      const referenceFor = (exerciseId: string): { label: string; value: number } | null => {
        if (!request.profile) return null;
        if (exerciseId === 'barbell-bench-press') return { label: 'bench press reference', value: request.profile.benchPressReference };
        if (exerciseId === 'smith-box-squat') return { label: 'back squat reference', value: request.profile.backSquatReference };
        return null;
      };
      const makeExercise = ([exerciseId, requirement]: readonly [string, 'EXACT' | 'PATTERN' | 'CAPABILITY'], extras: Partial<ExercisePrescription> = {}): ExercisePrescription => ({
        exerciseId,
        requirement,
        target: {
          sets: target.sets,
          reps: { ...target.reps },
          rir: { ...target.rir },
          loadPercent: target.loadPercent ? { ...target.loadPercent } : null,
        },
        qualityStops: [...qualityStops(request.type)],
        ...(() => {
          const loadRange = target.loadPercent;
          const reference = loadRange ? referenceFor(exerciseId) : null;
          if (!reference || !request.profile || !loadRange) return { loadProvenance: 'policy-target' };
          const trainingMax = reference.value;
          const loadPercent = (loadRange.min + loadRange.max) / 2;
          const rawLoad = trainingMax * loadPercent / 100;
          const increment = request.profile.availableIncrement;
          return {
            calculatedLoad: Math.round(rawLoad / increment) * increment,
            loadProvenance: `${reference.label} ${reference.value} ${request.profile.units}; training max reference; ${loadPercent}%; rounded to ${increment}`,
          };
        })(),
        ...extras,
        // Safety demand belongs to the catalog exercise, never its block role.
        ...(() => {
          const exercise = exerciseCatalog.find(({ id }) => id === exerciseId);
          if (!exercise) throw new Error(`Unknown catalog exercise: ${exerciseId}`);
          return { braceDemand: exercise.braceDemand, lumbarDemand: exercise.lumbarDemand };
        })(),
      });
      const work = dayWork[dayIndex]!;
      const hasEquipment = (equipment: string) => !request.equipment || request.equipment.includes(equipment);
      const allowed = ([exerciseId]: readonly [string, 'EXACT' | 'PATTERN' | 'CAPABILITY']) => {
        if (exerciseId === 'smith-box-squat') return hasEquipment('smith-machine') && hasEquipment('box') && !restricted;
        return true;
      };
      const requirements = (request.requirements ?? []).map(({ kind }, index) => {
        const exercise = resolvedRequirements[index]!;
        return makeExercise([exercise.id, kind], {
          braceDemand: exercise.braceDemand, lumbarDemand: exercise.lumbarDemand,
          ...(exercise.tags.includes('power') ? { power: true, plyometric: exercise.impact !== 'none' } : {}),
        });
      });
      const primaryExercises: ExercisePrescription[] = [
        ...(allowed(work.primary) ? [makeExercise(work.primary, { braceDemand: 'moderate', lumbarDemand: 'moderate' })] : []),
        ...requirements.filter(({ requirement }) => requirement === 'EXACT'),
      ];
      const blocks: NonNullable<SessionPrescription['blocks']> = [
        { role: 'activation', exercises: [makeExercise(['bodyweight-activation', 'CAPABILITY'], { braceDemand: 'low', lumbarDemand: 'low' })] },
        { role: 'mobility', exercises: [makeExercise([dayIndex === 0 ? 'thoracic-mobility' : dayIndex === 1 ? 'hip-mobility' : 'shoulder-mobility', 'CAPABILITY'], { braceDemand: 'low', lumbarDemand: 'low' })] },
        ...(!restricted && request.type === 'power' ? [{ role: 'power-primer' as const, exercises: [makeExercise(['low-volume-jump', 'CAPABILITY'], { plyometric: true, power: true, braceDemand: 'moderate', lumbarDemand: 'low' })] }] : []),
        { role: 'primary', exercises: primaryExercises },
        { role: 'accessory', exercises: [makeExercise(work.accessory, { braceDemand: 'low', lumbarDemand: 'low' })] },
        { role: 'core', exercises: [makeExercise(work.core, { braceDemand: 'low', lumbarDemand: 'low' }),
          ...requirements.filter(({ requirement }) => requirement !== 'EXACT')] },
        { role: 'finish-review', exercises: [makeExercise(['session-review', 'CAPABILITY'], { braceDemand: 'low', lumbarDemand: 'low' })] },
      ];
      return {
        dayIndex: scheduledDay,
        day: weekDays[scheduledDay - 1],
        blocks,
        // `blocks` is canonical. Keep the legacy flat field only as a lossless,
        // ordered projection so older readers cannot observe a second workout.
        exercises: blocks
          .filter((block) => block.role !== 'finish-review')
          .flatMap((block) => block.exercises.map((exercise) => ({
            ...exercise,
            blockRole: block.role,
          }))),
      };
    }),
  }));

  return deepFreeze({
    schemaVersion: 1,
    policyVersion: PRESCRIPTION_POLICY_VERSION,
    id: request.id,
    type: request.type,
    weeks,
  }) as CyclePrescriptionSnapshot;
}

export function generateCycleSequence(
  requests: readonly CyclePrescriptionRequest[],
): readonly CyclePrescriptionSnapshot[] {
  const ids = new Set<string>();
  const snapshots: CyclePrescriptionSnapshot[] = [];

  requests.forEach((request, index) => {
    if (ids.has(request.id)) throw new Error(`Duplicate prescription id: ${request.id}`);
    ids.add(request.id);

    const previous = requests[index - 1];
    if (previous && loadingTypes.has(previous.type) && loadingTypes.has(request.type) && previous.type !== request.type) {
      const transitionId = `${previous.id}--to--${request.id}`;
      if (ids.has(transitionId) || requests.some(({ id }) => id === transitionId)) {
        throw new Error(`Duplicate prescription id: ${transitionId}`);
      }
      ids.add(transitionId);
      snapshots.push(generatePrescription({ ...request, id: transitionId, type: 'transition', weeks: 1 }));
    }
    snapshots.push(generatePrescription(request));
  });

  return deepFreeze(snapshots) as readonly CyclePrescriptionSnapshot[];
}
